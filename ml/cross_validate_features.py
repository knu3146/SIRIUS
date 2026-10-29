"""Compare cached frozen CNN features using training-only grouped cross-validation."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from train_candidates import metrics, perceptual_groups


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--audit', type=Path, required=True)
    parser.add_argument('--experiments', nargs='+', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    source = json.loads(args.manifest.read_text(encoding='utf-8'))
    manifest_sha = hashlib.sha256(args.manifest.read_bytes()).hexdigest()
    audit = json.loads(args.audit.read_text(encoding='utf-8'))
    hashes = {r['input_sha256']: int(r['phash'], 16) for rows in audit['records'].values() for r in rows}
    rows = source['manifest']['train']
    y = np.asarray([r['label'] for r in rows])
    groups = perceptual_groups([hashes[r['input_sha256']] for r in rows])
    folds = list(StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=42).split(np.zeros((len(y), 1)), y, groups))
    result = {}
    for folder in args.experiments:
        previous = json.loads((folder / 'evaluation.json').read_text(encoding='utf-8'))
        if previous.get('source_manifest_sha256') != manifest_sha:
            raise ValueError(f'Feature manifest mismatch: {folder}')
        with np.load(folder / 'features.npz') as cache:
            x = cache['train']
            if not np.array_equal(cache['y'], y) or len(x) != len(y):
                raise ValueError(f'Feature label mismatch: {folder}')
        scores = []
        for index, (fit, val) in enumerate(folds):
            model = make_pipeline(StandardScaler(), LogisticRegression(C=.1, max_iter=3000, class_weight='balanced', random_state=42))
            model.fit(x[fit], y[fit])
            score = metrics(model, x[val], y[val])
            scores.append(score)
            print(f'{folder.name} fold {index + 1}: macro_f1={score["macro_f1"]:.4f}', flush=True)
        result[folder.name] = {'C': .1, 'folds': scores, 'mean_macro_f1': float(np.mean([s['macro_f1'] for s in scores])), 'std_macro_f1': float(np.std([s['macro_f1'] for s in scores])), 'mean_accuracy': float(np.mean([s['accuracy'] for s in scores]))}
    report = {'selection_metric': 'mean grouped training CV macro_f1', 'folds': 5, 'seed': 42, 'test_used_in_this_comparison': False, 'manifest_sha256': manifest_sha, 'models': result, 'limitations': ['These training/validation groups were inspected during earlier model development.', 'Patient identity is unavailable; this is internal model selection, not an independent clinical evaluation.']}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps({k: {'mean_macro_f1': v['mean_macro_f1'], 'std_macro_f1': v['std_macro_f1']} for k, v in result.items()}), flush=True)


if __name__ == '__main__':
    main()
