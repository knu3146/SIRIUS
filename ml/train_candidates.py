"""Train candidates on training/validation only, evaluate the winner once on held-out test.

python ml/train_candidates.py datasets/brain-tumor --output ml/experiments/run-001
Existing deployed model files are never overwritten.
"""
import argparse
import datetime
import hashlib
import json
from pathlib import Path
import time

import joblib
import numpy as np
import sklearn
from PIL import Image
from sklearn.ensemble import ExtraTreesClassifier, RandomForestClassifier
from sklearn.metrics import accuracy_score, balanced_accuracy_score, classification_report, confusion_matrix, f1_score
from sklearn.model_selection import train_test_split, StratifiedGroupKFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC

from features import CLASS_DIRS, hog_feature, to_gray


def discover(root, split):
    names = {'train': ['train', 'Training'], 'test': ['test', 'Testing']}[split]
    folder = next((root / name for name in names if (root / name).is_dir()), None)
    if folder is None:
        raise ValueError(f'Missing {split} folder in {root}')
    aliases = ['glioma', 'meningioma', 'pituitary', 'notumor']
    items = []
    for label, name in enumerate(CLASS_DIRS):
        cls = folder / name
        if not cls.is_dir():
            cls = folder / aliases[label]
        files = sorted(p for p in cls.glob('*') if p.suffix.lower() in {'.jpg', '.jpeg', '.png'})
        if not files:
            raise ValueError(f'Empty class: {cls}')
        items.extend((p, label) for p in files)
    return items


def extract(items):
    records = []
    for i, (file, label) in enumerate(items):
        with Image.open(file) as img:
            gray = to_gray(img)
        # Equality at actual model input resolution also catches resized copies.
        digest = hashlib.sha256(np.round(gray * 255).astype(np.uint8).tobytes()).hexdigest()
        records.append((str(file), label, digest, hog_feature(gray)))
        if (i + 1) % 500 == 0:
            print(f'features {i + 1}/{len(items)}', flush=True)
    return records


def metrics(model, x, y):
    # Match the deployed inference path, including calibrated SVM probabilities.
    probs = model.predict_proba(x)
    pred = model.classes_[np.argmax(probs, axis=1)]
    return {
        'accuracy': float(accuracy_score(y, pred)),
        'balanced_accuracy': float(balanced_accuracy_score(y, pred)),
        'macro_f1': float(f1_score(y, pred, average='macro')),
        'confusion_matrix': confusion_matrix(y, pred, labels=range(4)).tolist(),
        'classes': classification_report(y, pred, labels=range(4), target_names=CLASS_DIRS, output_dict=True, zero_division=0),
    }


def unique_records(records):
    seen = {}
    result = []
    for record in records:
        _, label, digest, _ = record
        if digest in seen:
            if seen[digest] != label:
                raise ValueError(f'Conflicting labels for duplicate input: {digest}')
            continue
        seen[digest] = label
        result.append(record)
    return result


def perceptual_groups(values, threshold=4):
    parent = list(range(len(values)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for i, value in enumerate(values):
        for j in range(i):
            if (value ^ values[j]).bit_count() <= threshold:
                a, b = find(i), find(j)
                parent[a] = b
    return np.asarray([find(i) for i in range(len(values))])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('dataset', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--source', default='sartajbhuvaji/brain-tumor-classification-mri')
    parser.add_argument('--exclude-tested-manifest', type=Path)
    parser.add_argument('--audit', type=Path, help='Use pHash <=4 exclusion and grouped validation from audit_dataset.py')
    args = parser.parse_args()
    if args.output.exists():
        raise ValueError('Use a new output directory; previous experiments must be preserved')
    start = time.time()
    train_raw = extract(discover(args.dataset, 'train'))
    test_raw = extract(discover(args.dataset, 'test'))
    train = unique_records(train_raw)
    test = unique_records(test_raw)
    previously_tested = set()
    if args.exclude_tested_manifest:
        old = json.loads(args.exclude_tested_manifest.read_text(encoding='utf-8'))
        previously_tested = {r['input_sha256'] for r in old['manifest']['test']}
    test = [r for r in test if r[2] not in previously_tested]
    test_hashes = {r[2] for r in test}
    overlap = [r for r in train if r[2] in test_hashes]
    # Keep the supplied test unchanged and remove leakage from training.
    train = [r for r in train if r[2] not in test_hashes]
    near_removed = 0
    phashes = None
    if args.audit:
        audit = json.loads(args.audit.read_text(encoding='utf-8'))
        phashes = {r['input_sha256']: int(r['phash'], 16) for rows in audit['records'].values() for r in rows}
        test_phashes = [phashes[r[2]] for r in test]
        before = len(train)
        train = [r for r in train if not any((phashes[r[2]] ^ value).bit_count() <= 4 for value in test_phashes)]
        near_removed = before - len(train)
        print(f'Perceptual train/test exclusions: {near_removed}', flush=True)
    all_labels = {}
    for record in train_raw + test_raw:
        if record[2] in all_labels and all_labels[record[2]] != record[1]:
            raise ValueError(f'Conflicting labels across splits: {record[2]}')
        all_labels[record[2]] = record[1]
    x = np.asarray([r[3] for r in train], dtype=np.float32)
    y = np.asarray([r[1] for r in train])
    xt = np.asarray([r[3] for r in test], dtype=np.float32)
    yt = np.asarray([r[1] for r in test])
    indices = np.arange(len(train))
    if phashes is None:
        fit, val = train_test_split(indices, test_size=.2, random_state=42, stratify=y)
    else:
        groups = perceptual_groups([phashes[r[2]] for r in train])
        splitter = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=42)
        fit, val = next(splitter.split(x, y, groups))
        if len(np.unique(y[fit])) != 4 or len(np.unique(y[val])) != 4:
            raise ValueError('Grouped validation is missing a class')
        print(f'Grouped split: fit={len(fit)} validation={len(val)} groups={len(set(groups))}', flush=True)
    candidates = {
        'rf-300': RandomForestClassifier(n_estimators=300, random_state=42, n_jobs=2),
        'extra-500': ExtraTreesClassifier(n_estimators=500, class_weight='balanced', random_state=42, n_jobs=2),
        'svm-c1': make_pipeline(StandardScaler(), SVC(C=1, probability=True, random_state=42, class_weight='balanced')),
        'svm-c10': make_pipeline(StandardScaler(), SVC(C=10, probability=True, random_state=42, class_weight='balanced')),
    }
    scores = {}
    for name, model in candidates.items():
        print(f'Training {name}', flush=True)
        model.fit(x[fit], y[fit])
        scores[name] = metrics(model, x[val], y[val])
        print(f'{name} validation macro_f1={scores[name]["macro_f1"]:.4f}', flush=True)
    winner = max(scores, key=lambda name: scores[name]['macro_f1'])
    model = candidates[winner]
    model.fit(x, y)
    test_result = metrics(model, xt, yt)
    args.output.mkdir(parents=True)
    model_file = args.output / 'model_rf.joblib'
    joblib.dump(model, model_file, compress=3)
    meta = {
        'name': f'HOG+{winner} candidate v0.3 (demonstration only)',
        'classes': CLASS_DIRS, 'sklearn_version': sklearn.__version__,
        'sha256': hashlib.sha256(model_file.read_bytes()).hexdigest(),
        'test_accuracy': test_result['accuracy'],
        'trained_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'trained_on': args.source,
        'validation_macro_f1': scores[winner]['macro_f1'],
        'evaluation_protocol': 'perceptual train/test exclusion and grouped validation' if phashes is not None else 'exact deduplication and image-level validation',
        'clinical_validation': False,
        'test_status': 'Exploratory benchmark; patient-level independence is not established.',
    }
    report = {
        'selection_metric': 'validation macro_f1', 'winner': winner,
        'seed': 42, 'validation': scores, 'test': test_result,
        'counts': {'train_raw': len(train_raw), 'train_unique_clean': len(train), 'fit': len(fit), 'validation': len(val), 'test_raw': len(test_raw), 'test_unique': len(test), 'train_test_duplicates_removed': len(overlap), 'perceptual_train_test_exclusions': near_removed, 'previously_tested_hashes_excluded': len(previously_tested)},
        'validation_split': 'perceptual hash grouped' if phashes is not None else 'stratified image split',
        'limitations': ['Image-level splits; patient identities are unavailable, so patient-level independence is not established.', 'Exact model-input duplicates removed; perceptual filtering applied only if --audit was supplied. Near-duplicates may remain.', 'Test data evaluated after validation selection; repeated experiments on the same test are exploratory, not independent external validation.'],
        'elapsed_seconds': time.time() - start,
        'manifest': {split: [{'path': r[0], 'label': r[1], 'input_sha256': r[2]} for r in records] for split, records in [('train', train), ('test', test)]},
    }
    for name, data in [('model_meta.json', meta), ('evaluation.json', report)]:
        (args.output / name).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'winner': winner, 'test': test_result, 'counts': report['counts']}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
