"""Apply a preregistered overlap filter before scoring external test images."""
import argparse
import csv
import hashlib
import json
from pathlib import Path

from audit_dataset import fingerprint
from features import CLASS_DIRS
from train_candidates import discover, perceptual_groups


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dataset', type=Path, required=True, help='BRISC classification_task directory')
    parser.add_argument('--protocol', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--summary', type=Path, required=True)
    args = parser.parse_args()
    protocol = json.loads(args.protocol.read_text(encoding='utf-8'))
    references, reference_digests = [], {}
    for filename in protocol['reference_datasets']:
        path = Path(filename)
        data = json.loads(path.read_text(encoding='utf-8'))
        references.extend(row for rows in data['records'].values() for row in rows)
        reference_digests[filename] = hashlib.sha256(path.read_bytes()).hexdigest()
    exact = {r['input_sha256'] for r in references}
    perceptual = sorted({int(r['phash'], 16) for r in references})
    manifest = args.dataset.parent / 'manifest.csv'
    with manifest.open(encoding='utf-8-sig', newline='') as handle:
        expected = {r['relative_path'].replace('\\', '/'): r for r in csv.DictReader(handle) if r['task'] == 'classification' and r['split'] == 'test'}
    records = []
    for file, label in discover(args.dataset, 'test'):
        relative = file.relative_to(args.dataset.parent).as_posix()
        if relative not in expected or hashlib.sha256(file.read_bytes()).hexdigest() != expected[relative]['sha256']:
            raise ValueError(f'Official manifest integrity check failed: {relative}')
        digest, phash = fingerprint(file)
        nearest = min((phash ^ ref).bit_count() for ref in perceptual)
        excluded = 'exact-reference-overlap' if digest in exact else 'perceptual-reference-overlap' if nearest <= 4 else None
        records.append({'path': str(file), 'label': label, 'input_sha256': digest, 'phash': f'{phash:016x}', 'nearest_reference_distance': nearest, 'excluded': excluded})
    eligible = [i for i, row in enumerate(records) if row['excluded'] is None]
    groups = perceptual_groups([int(records[i]['phash'], 16) for i in eligible])
    for group in sorted(set(groups)):
        indices = [eligible[j] for j, value in enumerate(groups) if value == group]
        if len({records[i]['label'] for i in indices}) > 1:
            for i in indices:
                records[i]['excluded'] = 'mixed-label-perceptual-group'
        else:
            ordered = sorted(indices, key=lambda i: records[i]['path'])
            for i in ordered[1:]:
                records[i]['excluded'] = 'duplicate-external-group'
    included = [r for r in records if r['excluded'] is None]
    reasons = sorted({r['excluded'] for r in records if r['excluded']})
    summary = {
        'protocol_sha256': hashlib.sha256(args.protocol.read_bytes()).hexdigest(),
        'reference_audits_sha256': reference_digests,
        'official_manifest_images_verified': len(records),
        'candidate_images': len(records), 'included_images': len(included),
        'excluded': {reason: sum(r['excluded'] == reason for r in records) for reason in reasons},
        'included_class_counts': {name: sum(r['label'] == label for r in included) for label, name in enumerate(CLASS_DIRS)},
        'model_predictions_computed': False,
        'limitations': protocol['limitations'],
    }
    args.output.write_text(json.dumps({**summary, 'records': records}, indent=2), encoding='utf-8')
    args.summary.parent.mkdir(parents=True, exist_ok=True)
    args.summary.write_text(json.dumps(summary, indent=2), encoding='utf-8')
    print(json.dumps(summary, indent=2), flush=True)


if __name__ == '__main__':
    main()
