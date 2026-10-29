"""Audit exact and perceptually similar train/test images without changing labels.

python ml/audit_dataset.py datasets/brain-tumor-7023 --output datasets/audit-7023.json
"""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.fft import dctn

from train_candidates import discover
from features import to_gray


def fingerprint(path):
    with Image.open(path) as image:
        gray = to_gray(image)
        small = np.asarray(image.convert('L').resize((32, 32)), dtype=np.float32)
    low = dctn(small, norm='ortho')[:8, :8].flatten()
    bits = low > np.median(low[1:])
    bits[0] = False
    return hashlib.sha256(np.round(gray * 255).astype(np.uint8).tobytes()).hexdigest(), int.from_bytes(np.packbits(bits).tobytes(), 'big')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('dataset', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    records = {}
    for split in ['train', 'test']:
        records[split] = []
        for file, label in discover(args.dataset, split):
            digest, phash = fingerprint(file)
            records[split].append({'path': str(file), 'label': label, 'input_sha256': digest, 'phash': f'{phash:016x}'})
        print(f'{split}: {len(records[split])} fingerprints', flush=True)
    train_hashes = {r['input_sha256'] for r in records['train']}
    train_phashes = [(int(r['phash'], 16), r) for r in records['train']]
    exact, similar, conflicts = [], [], []
    for row in records['test']:
        if row['input_sha256'] in train_hashes:
            exact.append(row['path'])
        value = int(row['phash'], 16)
        match = min(train_phashes, key=lambda item: (item[0] ^ value).bit_count())
        distance = (match[0] ^ value).bit_count()
        if distance <= 4:
            item = {'test': row['path'], 'train': match[1]['path'], 'distance': distance, 'test_label': row['label'], 'train_label': match[1]['label']}
            similar.append(item)
            if row['label'] != match[1]['label']:
                conflicts.append(item)
    report = {
        'counts': {k: len(v) for k, v in records.items()},
        'exact_test_train_overlap': len(exact), 'phash_le4_test_train_overlap': len(similar),
        'phash_le4_label_disagreements': len(conflicts),
        'note': 'Perceptual hash flags candidates for review; it does not establish patient identity or prove equal clinical content.',
        'similar_pairs': similar, 'label_disagreements': conflicts, 'records': records,
    }
    args.output.write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps({k: v for k, v in report.items() if k not in ['records', 'similar_pairs', 'label_disagreements']}), flush=True)


if __name__ == '__main__':
    main()
