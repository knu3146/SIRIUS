"""Frozen ImageNet MobileNetV3 features + MRI-trained logistic classifier.

Uses the deduplicated manifest from train_candidates.py. The previously inspected
test is an exploratory benchmark, not a new untouched external validation set.
"""
import argparse
import datetime
import hashlib
import json
from pathlib import Path

import joblib
import numpy as np
from PIL import Image
import sklearn
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
import torch
from cnn_backend import FEATURE_BACKBONES

from features import CLASS_DIRS
from train_candidates import metrics


def embed(records, model, transform):
    features = []
    for start in range(0, len(records), 32):
        batch = []
        for item in records[start:start + 32]:
            with Image.open(item['path']) as image:
                batch.append(transform(image.convert('RGB')))
        with torch.inference_mode():
            out = model.avgpool(model.features(torch.stack(batch))).flatten(1)
        features.append(out.numpy())
        if start % 320 == 0:
            print(f'CNN features {min(start + 32, len(records))}/{len(records)}', flush=True)
    return np.concatenate(features)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--manifest', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--backbone', choices=FEATURE_BACKBONES, default='mobilenet_v3_small')
    args = p.parse_args()
    if args.output.exists():
        raise ValueError('Use a new experiment output path')
    torch.set_num_threads(4)
    torch.manual_seed(42)
    torch.hub.set_dir(str(Path('.cache-models').resolve()))
    source = json.loads(args.manifest.read_text(encoding='utf-8'))
    records = source['manifest']
    constructor, weights, _ = FEATURE_BACKBONES[args.backbone]
    backbone = constructor(weights=weights).eval()
    x = embed(records['train'], backbone, weights.transforms())
    xt = embed(records['test'], backbone, weights.transforms())
    y = np.asarray([r['label'] for r in records['train']])
    yt = np.asarray([r['label'] for r in records['test']])
    if 'split_indices' in source:
        fit = np.asarray(source['split_indices']['fit'])
        val = np.asarray(source['split_indices']['validation'])
        if set(fit) & set(val) or set(fit) | set(val) != set(range(len(y))):
            raise ValueError('Invalid source split indices')
    elif source.get('validation_split') == 'perceptual hash grouped':
        raise ValueError('Grouped source requires recorded split_indices')
    else:
        fit, val = train_test_split(np.arange(len(y)), test_size=.2, random_state=42, stratify=y)
    candidates, scores = {}, {}
    for c in [.01, .1, 1, 10]:
        model = make_pipeline(StandardScaler(), LogisticRegression(C=c, max_iter=3000, class_weight='balanced', random_state=42))
        model.fit(x[fit], y[fit])
        candidates[str(c)] = model
        scores[str(c)] = metrics(model, x[val], y[val])
        print(f'C={c} validation macro_f1={scores[str(c)]["macro_f1"]:.4f}', flush=True)
    winner = max(scores, key=lambda k: scores[k]['macro_f1'])
    head = candidates[winner].fit(x, y)
    result = metrics(head, xt, yt)
    args.output.mkdir(parents=True)
    joblib.dump(head, args.output / 'classifier.joblib', compress=3)
    torch.save(backbone.state_dict(), args.output / 'backbone.pth')
    np.savez_compressed(args.output / 'features.npz', train=x, test=xt, y=y, yt=yt)
    meta = {
        'name': f'{args.backbone} frozen features + MRI logistic head v0.4 (demonstration only)',
        'architecture': args.backbone, 'weights': 'IMAGENET1K_V1',
        'classes': CLASS_DIRS, 'sklearn_version': sklearn.__version__,
        'torch_version': torch.__version__, 'test_accuracy': result['accuracy'],
        'trained_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'files_sha256': {f: hashlib.sha256((args.output / f).read_bytes()).hexdigest() for f in ['classifier.joblib', 'backbone.pth']},
        'selection': {'metric': 'validation macro_f1', 'C': float(winner)},
        'validation_macro_f1': scores[winner]['macro_f1'],
        'clinical_validation': False,
        'evaluation_protocol': source.get('validation_split', 'stratified image split'),
        'test_status': 'Exploratory: this test was inspected in an earlier experiment. External patient-level validation is still required.',
    }
    report = {'validation': scores, 'test': result, 'counts': source['counts'], 'validation_split': source.get('validation_split', 'stratified image split'), 'source_manifest_sha256': hashlib.sha256(args.manifest.read_bytes()).hexdigest(), 'limitations': source['limitations'] + [meta['test_status']]}
    for filename, data in [('model_meta.json', meta), ('evaluation.json', report)]:
        (args.output / filename).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'winner_C': winner, 'test': result}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
