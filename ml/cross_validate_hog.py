"""Training-only grouped CV of the existing HOG/SVM baseline."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC

from features import hog_feature, to_gray
from train_candidates import metrics, perceptual_groups


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--audit', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    source = json.loads(args.manifest.read_text(encoding='utf-8'))
    audit = json.loads(args.audit.read_text(encoding='utf-8'))
    hashes = {r['input_sha256']: int(r['phash'], 16) for rows in audit['records'].values() for r in rows}
    rows = source['manifest']['train']
    features = []
    for row in rows:
        with Image.open(row['path']) as image:
            features.append(hog_feature(to_gray(image)))
    x = np.asarray(features, dtype=np.float32)
    y = np.asarray([r['label'] for r in rows])
    groups = perceptual_groups([hashes[r['input_sha256']] for r in rows])
    scores = []
    for fold, (fit, val) in enumerate(StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=42).split(x, y, groups), start=1):
        model = make_pipeline(StandardScaler(), SVC(C=10, probability=True, class_weight='balanced', random_state=42))
        model.fit(x[fit], y[fit])
        score = metrics(model, x[val], y[val])
        scores.append(score)
        print(f'HOG/SVM fold {fold}: macro_f1={score["macro_f1"]:.4f}', flush=True)
    result = {'architecture': 'HOG/SVM C10 baseline', 'folds': scores, 'mean_macro_f1': float(np.mean([r['macro_f1'] for r in scores])), 'std_macro_f1': float(np.std([r['macro_f1'] for r in scores])), 'mean_accuracy': float(np.mean([r['accuracy'] for r in scores])), 'test_used_in_this_comparison': False, 'source_manifest_sha256': hashlib.sha256(args.manifest.read_bytes()).hexdigest(), 'limitations': ['C10 was selected in earlier development on the first validation fold.', 'Patient-level independence is not established; this is internal model selection.']}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps({'mean_macro_f1': result['mean_macro_f1'], 'std_macro_f1': result['std_macro_f1']}), flush=True)


if __name__ == '__main__':
    main()
