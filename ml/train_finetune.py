"""Fine-tune MobileNet on a recorded grouped split; select only by validation F1.

python ml/train_finetune.py --manifest ml/experiments/run-004-grouped/evaluation.json --output ml/experiments/run-006-finetune
"""
import argparse
import datetime
import hashlib
import json
from pathlib import Path
import random
import time

import numpy as np
from PIL import Image
import torch
from torch import nn
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms
from torchvision.models import mobilenet_v3_small, MobileNet_V3_Small_Weights

from features import CLASS_DIRS
from train_candidates import probability_metrics
from cnn_backend import make_finetuned_model as make_model


class Images(Dataset):
    def __init__(self, records, transform):
        self.records, self.transform = records, transform

    def __len__(self):
        return len(self.records)

    def __getitem__(self, index):
        item = self.records[index]
        with Image.open(item['path']) as image:
            tensor = self.transform(image.convert('RGB'))
        return tensor, item['label']


def evaluate(model, loader):
    model.eval()
    ys, probabilities = [], []
    with torch.inference_mode():
        for batch, labels in loader:
            probabilities.append(model(batch).softmax(dim=1).numpy())
            ys.append(labels.numpy())
    return probability_metrics(np.concatenate(ys), np.concatenate(probabilities))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--epochs', type=int, default=8)
    parser.add_argument('--validation-only', action='store_true', help='Never load or evaluate test images')
    args = parser.parse_args()
    if args.output.exists():
        raise ValueError('Use a new output directory')
    if not 1 <= args.epochs <= 30:
        raise ValueError('Epochs must be in [1, 30]')
    torch.set_num_threads(4)
    torch.manual_seed(42)
    random.seed(42)
    np.random.seed(42)
    torch.hub.set_dir(str(Path('.cache-models').resolve()))
    source = json.loads(args.manifest.read_text(encoding='utf-8'))
    if source.get('validation_split') != 'perceptual hash grouped' or 'split_indices' not in source:
        raise ValueError('A recorded perceptual-grouped split is required')
    records = source['manifest']['train']
    fit, val = source['split_indices']['fit'], source['split_indices']['validation']
    if set(fit) & set(val) or set(fit) | set(val) != set(range(len(records))):
        raise ValueError('Invalid split indices')
    train_rows, val_rows = [records[i] for i in fit], [records[i] for i in val]
    weights = MobileNet_V3_Small_Weights.IMAGENET1K_V1
    normalizer = transforms.Normalize(mean=[.485, .456, .406], std=[.229, .224, .225])
    augment = transforms.Compose([transforms.Resize(256), transforms.CenterCrop(224), transforms.RandomRotation(8), transforms.ColorJitter(brightness=.1, contrast=.1), transforms.ToTensor(), normalizer])
    train = DataLoader(Images(train_rows, augment), batch_size=32, shuffle=True, num_workers=0, generator=torch.Generator().manual_seed(42))
    validation = DataLoader(Images(val_rows, weights.transforms()), batch_size=32, num_workers=0)
    pretrained = mobilenet_v3_small(weights=weights)
    model = make_model()
    model.features.load_state_dict(pretrained.features.state_dict())
    for param in model.features.parameters():
        param.requires_grad = False
    counts = np.bincount([r['label'] for r in train_rows], minlength=4)
    loss_fn = nn.CrossEntropyLoss(weight=torch.tensor(len(train_rows) / (4 * counts), dtype=torch.float32))
    optimizer = torch.optim.AdamW(model.classifier.parameters(), lr=.001, weight_decay=.0001)
    args.output.mkdir(parents=True)
    history, best_f1, best_epoch, stale = [], -1, 0, 0
    started = time.time()
    for epoch in range(1, args.epochs + 1):
        if epoch == 3:
            for param in model.features[-3:].parameters():
                param.requires_grad = True
            optimizer = torch.optim.AdamW([{'params': model.classifier.parameters(), 'lr': .0005}, {'params': model.features[-3:].parameters(), 'lr': .00005}], weight_decay=.0001)
        model.train()
        # Frozen feature BatchNorm statistics must remain frozen as well.
        model.features.eval()
        if epoch >= 3:
            model.features[-3:].train()
        total_loss = 0
        for batch, labels in train:
            optimizer.zero_grad(set_to_none=True)
            loss = loss_fn(model(batch), labels)
            loss.backward()
            optimizer.step()
            total_loss += float(loss.detach()) * len(labels)
        score = evaluate(model, validation)
        row = {'epoch': epoch, 'train_loss': total_loss / len(train_rows), 'validation': score, 'elapsed_seconds': time.time() - started}
        history.append(row)
        print(f'epoch {epoch}: loss={row["train_loss"]:.4f} validation macro_f1={score["macro_f1"]:.4f} elapsed={row["elapsed_seconds"]:.1f}s', flush=True)
        if score['macro_f1'] > best_f1:
            best_f1, best_epoch, stale = score['macro_f1'], epoch, 0
            torch.save(model.state_dict(), args.output / 'model.pth')
        else:
            stale += 1
        (args.output / 'history.json').write_text(json.dumps(history, indent=2), encoding='utf-8')
        if epoch >= 4 and stale >= 3:
            break
    model.load_state_dict(torch.load(args.output / 'model.pth', weights_only=True, map_location='cpu'))
    result = None
    if not args.validation_only:
        test = DataLoader(Images(source['manifest']['test'], weights.transforms()), batch_size=32, num_workers=0)
        result = evaluate(model, test)
    meta = {
        'name': f'MobileNetV3 fine-tuned MRI candidate v0.5 epoch {best_epoch} (demonstration only)',
        'architecture': 'mobilenet_v3_small_finetuned', 'classes': CLASS_DIRS,
        'torch_version': torch.__version__, 'validation_macro_f1': best_f1,
        'files_sha256': {'model.pth': hashlib.sha256((args.output / 'model.pth').read_bytes()).hexdigest()},
        'test_accuracy': result['accuracy'] if result else None, 'clinical_validation': False,
        'evaluation_only': args.validation_only,
        'source_manifest_sha256': hashlib.sha256(args.manifest.read_bytes()).hexdigest(),
        'trained_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'selection': {'metric': 'grouped validation macro_f1', 'epoch': best_epoch},
        'test_status': 'Exploratory repeated benchmark; patient-level independence is not established.',
    }
    report = {'validation': {str(r['epoch']): r['validation'] for r in history}, 'test': result, 'counts': {**source['counts'], 'final_fit_rows': len(train_rows)}, 'validation_split': source['validation_split'], 'source_manifest_sha256': meta['source_manifest_sha256'], 'limitations': source['limitations'] + [meta['test_status'], 'Model retained at best validation epoch; validation images were not refit into the model.'], 'history': history}
    for name, data in [('model_meta.json', meta), ('evaluation.json', report)]:
        (args.output / name).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'best_epoch': best_epoch, 'validation_macro_f1': best_f1, 'test': result}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
