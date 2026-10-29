"""NEURIA 로컬 분석 서버 — 이 컴퓨터(127.0.0.1)에서만 열립니다.

  python infer_server.py

· server.js 가 /api/analyze 요청을 이 서버(기본 5001번 포트)로 넘깁니다.
· 사진은 메모리에서만 처리하고 저장·로그하지 않습니다.
· 결과의 '위치'는 병변 경계가 아니라 모델이 판단에 주목한 영역(occlusion 방식)입니다.
"""
import hashlib
import io
import json
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import joblib
import numpy as np
import sklearn
from PIL import Image
from skimage.filters import gaussian

from features import CLASS_DIRS, IMG_SIZE, NO_TUMOR_IDX, hog_feature, to_gray

HOST = "127.0.0.1"
PORT = int(os.environ.get("ML_PORT", "5001"))
HERE = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.environ.get("MODEL_DIR", HERE)
MAX_BODY = 8 * 1024 * 1024
MAX_PIXELS = 40_000_000
PATCH, STRIDE = 24, 8          # 가려 보는 블록 크기·간격 (128x128 기준)
MIN_ATTENTION = 0.005          # 이보다 약하게 반응하면 위치를 표시하지 않음
Image.MAX_IMAGE_PIXELS = MAX_PIXELS

LOCK = threading.Lock()
CNN_ASSETS = {
    'mobilenet_v3_small': ['classifier.joblib', 'backbone.pth'],
    'mobilenet_v3_small_finetuned': ['model.pth'],
    'efficientnet_b0': ['classifier.joblib', 'backbone.pth'],
}


def load_model():
    meta_path = os.path.join(MODEL_DIR, "model_meta.json")
    model_path = os.path.join(MODEL_DIR, "model_rf.joblib")
    with open(meta_path, encoding="utf-8") as fh:
        meta = json.load(fh)
    if meta.get("classes") != CLASS_DIRS:
        sys.exit("모델 클래스 순서가 웹앱과 일치하지 않습니다.")
    architecture = meta.get('architecture')
    if architecture and architecture not in CNN_ASSETS:
        sys.exit('Unsupported model architecture')
    if architecture != 'mobilenet_v3_small_finetuned' and meta.get("sklearn_version") != sklearn.__version__:
        sys.exit(
            f"scikit-learn 버전이 다릅니다 (모델 {meta.get('sklearn_version', '정보 없음')} / 설치 {sklearn.__version__}).\n"
            "  pip install -r requirements.txt  를 다시 실행하세요."
        )
    if architecture in CNN_ASSETS:
        for filename in CNN_ASSETS[architecture]:
            expected = meta.get('files_sha256', {}).get(filename)
            with open(os.path.join(MODEL_DIR, filename), 'rb') as fh:
                if not expected or hashlib.sha256(fh.read()).hexdigest() != expected:
                    sys.exit(f'{filename} does not match model metadata')
        from cnn_backend import MobileClassifier, TorchMRIClassifier
        backend = TorchMRIClassifier if architecture == 'mobilenet_v3_small_finetuned' else MobileClassifier
        return backend(MODEL_DIR, meta), meta
    # joblib 파일은 불러올 때 코드가 실행될 수 있어, 배포된 파일과 같은지 먼저 확인합니다.
    with open(model_path, "rb") as fh:
        if hashlib.sha256(fh.read()).hexdigest() != meta["sha256"]:
            sys.exit("model_rf.joblib 이 model_meta.json 과 일치하지 않습니다. 파일이 바뀌었거나 손상됐습니다.")
    model = joblib.load(model_path)
    if not np.array_equal(model.classes_, np.arange(len(CLASS_DIRS))):
        sys.exit("모델 출력 클래스가 4개 유형의 순서와 일치하지 않습니다.")
    expected = len(hog_feature(np.zeros((IMG_SIZE, IMG_SIZE))))
    if model.n_features_in_ != expected:
        sys.exit("모델 특징 추출 설정이 현재 코드와 일치하지 않습니다.")
    return model, meta


MODEL, META = None, None


def attention_map(gray, cls, base_p):
    """작은 블록을 하나씩 가려 보고, 그 클래스 확률이 떨어지는 만큼을 '주목도'로 계산"""
    feats, boxes = [], []
    for y in range(0, IMG_SIZE - PATCH + 1, STRIDE):
        for x in range(0, IMG_SIZE - PATCH + 1, STRIDE):
            g = gray.copy()
            g[y:y + PATCH, x:x + PATCH] = 0.5
            feats.append(hog_feature(g))
            boxes.append((y, x))
    probs = MODEL.predict_proba(np.asarray(feats))[:, cls]
    heat = np.zeros((IMG_SIZE, IMG_SIZE))
    cnt = np.zeros((IMG_SIZE, IMG_SIZE))
    for (y, x), p in zip(boxes, probs):
        heat[y:y + PATCH, x:x + PATCH] += max(base_p - p, 0.0)
        cnt[y:y + PATCH, x:x + PATCH] += 1
    heat = gaussian(heat / np.maximum(cnt, 1), sigma=1.7)
    # 두개골 바깥(거의 검은 배경)은 제외
    heat *= gaussian((gray > 0.08).astype(np.float64), sigma=1.0)
    return heat


def find_regions(gray, cls, base_p, heat=None):
    if heat is None:
        heat = attention_map(gray, cls, base_p)
    hmax = float(heat.max())
    if hmax < MIN_ATTENTION:
        return []
    peaks = []
    for y in range(6, IMG_SIZE - 6):
        for x in range(6, IMG_SIZE - 6):
            v = heat[y, x]
            if v < 0.4 * hmax:
                continue
            if v >= heat[y - 4:y + 5, x - 4:x + 5].max():
                peaks.append((v, x, y))
    peaks.sort(reverse=True)
    picked = []
    for v, x, y in peaks:
        if any(np.hypot(x - qx, y - qy) < 18 for _, qx, qy in picked):
            continue
        picked.append((v, x, y))
        if len(picked) == 3:
            break
    out = []
    for v, x, y in picked:
        win = heat[max(0, y - 16):y + 17, max(0, x - 16):x + 17]
        area = int((win > 0.5 * v).sum())
        r = min(0.22, max(0.045, float(np.sqrt(area / np.pi)) / IMG_SIZE * 1.35))
        out.append({
            "nx": (x + 0.5) / IMG_SIZE,
            "ny": (y + 0.5) / IMG_SIZE,
            "r": r,
            "area": area,
            "score": float(v),
            "conf": float(min(0.97, base_p * v / hmax)),
        })
    return out


def analyze(data: bytes) -> dict:
    with Image.open(io.BytesIO(data)) as img:
        if img.format not in ("JPEG", "PNG"):
            raise ValueError("unsupported format")
        if img.width * img.height > MAX_PIXELS:
            raise ValueError("too large")
        gray = to_gray(img)
        if META.get('architecture') in CNN_ASSETS:
            probs, heat = MODEL.predict_image(img)
            top = int(np.argmax(probs))
            regions = [] if heat is None else find_regions(gray, top, float(probs[top]), heat=heat)
            return {"probs": [float(p) for p in probs], "regions": regions, "model": META["name"]}
    probs = MODEL.predict_proba(hog_feature(gray)[None, :])[0]
    top = int(np.argmax(probs))
    regions = [] if top == NO_TUMOR_IDX else find_regions(gray, top, float(probs[top]))
    return {"probs": [float(p) for p in probs], "regions": regions, "model": META["name"]}


class Handler(BaseHTTPRequestHandler):
    server_version = "NeuriaML"

    def log_message(self, *args):   # 요청 내용은 남기지 않습니다
        pass

    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _local_only(self):
        # 다른 웹사이트가 브라우저를 통해 이 포트를 두드리는 것을 막습니다
        if self.headers.get("Origin"):
            return False
        return self.headers.get("Host", "") in (f"127.0.0.1:{PORT}", f"localhost:{PORT}")

    def do_GET(self):
        if self.path == "/health" and self._local_only():
            return self._json(200, {"ok": True, "model": META["name"], "test_accuracy": META["test_accuracy"]})
        self._json(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/analyze":
            return self._json(404, {"error": "not found"})
        if not self._local_only():
            return self._json(403, {"error": "forbidden"})
        ctype = (self.headers.get("Content-Type") or "").split(";")[0].strip().lower()
        if ctype not in ("image/jpeg", "image/png"):
            return self._json(415, {"error": "jpeg/png only"})
        try:
            n = int(self.headers.get("Content-Length", ""))
        except ValueError:
            return self._json(411, {"error": "length required"})
        if n <= 0 or n > MAX_BODY:
            return self._json(413, {"error": "too large"})
        data = self.rfile.read(n)
        try:
            with LOCK:
                result = analyze(data)
        except Exception as e:   # 내용·경로는 내보내지 않고 종류만 기록
            print("분석 실패:", type(e).__name__, file=sys.stderr)
            return self._json(422, {"error": "이미지를 분석할 수 없습니다."})
        self._json(200, result)


def main():
    global MODEL, META
    MODEL, META = load_model()
    srv = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"  NEURIA 분석 서버  http://{HOST}:{PORT}  ·  {META['name']} (test 정확도 {META['test_accuracy']:.1%})")
    print("  종료  Ctrl + C")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
