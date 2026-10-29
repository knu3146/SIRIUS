"""CNN 학습. val 로만 모델을 고르고, test 는 열어 보지 않습니다.

    python train_cnn.py --data "<MRI Dataset>" --manifest reports/leak_manifest.json --out runs/cnn_a \
        [--epochs 30] [--width 1.0] [--seed 0] [--aug 1.0]

· 학습 데이터 : train 중 leak_manifest 의 train_exclude(val/test 와 같은 원본인 영상)를 뺀 것
· 모델 선택   : leak 를 뺀 val(val_keep)의 macro-F1 이 가장 높은 에폭
· 산출물      : out/best.pt, out/history.json, out/val_logits.npy(온도 보정용)
"""
import argparse, json, math, os, time
import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image

from cnn import SiriusNet
from features import CLASS_DIRS
from training_data import load_gray


def label_of(rel):
    return CLASS_DIRS.index(rel.split("/")[1])


def augment(x, strength):
    """x:(B,1,H,W) [0,1]. 이동·회전·확대·좌우반전·밝기/대비·잡음."""
    B = x.shape[0]
    ang = (torch.rand(B) * 2 - 1) * math.radians(15) * strength
    sc = 1 + (torch.rand(B) * 2 - 1) * 0.12 * strength
    tx, ty = ((torch.rand(B) * 2 - 1) * 0.10 * strength for _ in range(2))
    flip = (torch.rand(B) < 0.5).float() * 2 - 1           # -1 이면 좌우반전
    cos, sin = torch.cos(ang) / sc, torch.sin(ang) / sc
    theta = torch.stack([torch.stack([cos * flip, -sin, tx], 1), torch.stack([sin * flip, cos, ty], 1)], 1)
    grid = F.affine_grid(theta, x.shape, align_corners=False)
    x = F.grid_sample(x, grid, mode="bilinear", padding_mode="zeros", align_corners=False)
    g = 1 + (torch.rand(B, 1, 1, 1) * 2 - 1) * 0.25 * strength
    b = (torch.rand(B, 1, 1, 1) * 2 - 1) * 0.08 * strength
    x = (x * g + b).clamp(0, 1)
    return (x + torch.randn_like(x) * 0.02 * strength).clamp(0, 1)


def macro_f1(y, p, k=4):
    f = []
    for c in range(k):
        tp = ((p == c) & (y == c)).sum(); fp = ((p == c) & (y != c)).sum(); fn = ((p != c) & (y == c)).sum()
        f.append(0.0 if tp == 0 else 2 * tp / (2 * tp + fp + fn))
    return float(np.mean(f))


@torch.no_grad()
def predict(net, x, bs=256):
    net.eval(); out = []
    for i in range(0, len(x), bs):
        out.append(net(torch.from_numpy(x[i:i + bs])[:, None]).numpy())
    return np.concatenate(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True); ap.add_argument("--manifest", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--epochs", type=int, default=30); ap.add_argument("--width", type=float, default=1.0)
    ap.add_argument("--seed", type=int, default=0); ap.add_argument("--aug", type=float, default=1.0)
    ap.add_argument("--lr", type=float, default=3e-3); ap.add_argument("--bs", type=int, default=64)
    ap.add_argument("--wd", type=float, default=5e-4); ap.add_argument("--drop", type=float, default=0.2)
    ap.add_argument("--smooth", type=float, default=0.05); ap.add_argument("--threads", type=int, default=2)
    ap.add_argument("--cache", default=None, help="전처리 캐시(.npz). 같은 data 로만 재사용")
    a = ap.parse_args()
    if min(a.epochs, a.bs, a.threads) <= 0 or a.width <= 0:
        ap.error('epochs, batch size, threads and width must be positive')
    torch.manual_seed(a.seed); np.random.seed(a.seed); torch.set_num_threads(a.threads)
    os.makedirs(a.out, exist_ok=False)
    man = json.load(open(a.manifest, encoding="utf-8"))
    tr_rels = [r for r in man["train_all"] if r not in set(man["train_exclude"])]
    va_rels = man["val_keep"]
    print(f"train={len(tr_rels)}, excluded={len(man['train_exclude'])}, validation={len(va_rels)}", flush=True)
    # test 는 이 스크립트에서 읽지 않습니다.
    Xtr = load_gray(a.data, tr_rels, a.cache, allowed_splits={'train'})
    Xva = load_gray(a.data, va_rels, a.cache, allowed_splits={'val'})
    ytr = np.array([label_of(r) for r in tr_rels]); yva = np.array([label_of(r) for r in va_rels])

    net = SiriusNet(width=a.width, drop=a.drop)
    n_par = sum(p.numel() for p in net.parameters())
    opt = torch.optim.AdamW(net.parameters(), lr=a.lr, weight_decay=a.wd)
    steps = a.epochs * math.ceil(len(Xtr) / a.bs)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=a.lr, total_steps=steps, pct_start=0.2)
    xt = torch.from_numpy(Xtr)[:, None]; yt = torch.from_numpy(ytr)
    hist, best = [], (-1, None)
    print(f"parameters={n_par/1e6:.2f}M, epochs={a.epochs}", flush=True)
    for ep in range(a.epochs):
        t0 = time.time(); net.train(); perm = torch.randperm(len(xt)); tl = 0.0
        for i in range(0, len(perm), a.bs):
            idx = perm[i:i + a.bs]
            xb = augment(xt[idx], a.aug); yb = yt[idx]
            loss = F.cross_entropy(net(xb), yb, label_smoothing=a.smooth)
            opt.zero_grad(); loss.backward(); opt.step(); sched.step(); tl += loss.item() * len(idx)
        lg = predict(net, Xva); pv = lg.argmax(1)
        acc = float((pv == yva).mean()); mf = macro_f1(yva, pv)
        hist.append({"epoch": ep + 1, "train_loss": tl / len(perm), "val_acc": acc, "val_macro_f1": mf,
                     "sec": round(time.time() - t0, 1)})
        print(hist[-1], flush=True)
        if mf > best[0]:
            best = (mf, ep + 1); torch.save(net.state_dict(), os.path.join(a.out, "best.pt"))
            np.save(os.path.join(a.out, "val_logits.npy"), lg)
    json.dump({"args": vars(a), "params": n_par, "best_epoch": best[1], "best_val_macro_f1": best[0],
               "history": hist}, open(os.path.join(a.out, "history.json"), "w"), indent=1)
    np.save(os.path.join(a.out, "val_labels.npy"), yva)
    print("best epoch", best[1], "val macro-F1", round(best[0], 4))


if __name__ == "__main__":
    main()
