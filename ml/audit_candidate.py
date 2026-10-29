"""Inspect a new candidate for overlap without training or computing predictions."""
import argparse
from collections import defaultdict
import hashlib
import json
from pathlib import Path

from audit_dataset import fingerprint
from train_candidates import perceptual_groups


def reference_records(data):
    records = data['records']
    rows = records if isinstance(records, list) else [row for split in records.values() for row in split]
    if not rows:
        raise ValueError('Reference audit contains no images')
    return rows


def filter_candidate_groups(rows):
    """Exclude entire similarity components linked to development images."""
    groups = perceptual_groups([int(row['phash'], 16) for row in rows])
    members = defaultdict(list)
    for index, group in enumerate(groups):
        members[int(group)].append(index)
    for indices in members.values():
        # Group before filtering: A~B~C must not retain C when A/B match
        # development data, even when C is farther than four bits from A.
        if any(rows[i]['excluded'] is not None for i in indices):
            for i in indices:
                if rows[i]['excluded'] is None:
                    rows[i]['excluded'] = 'reference-linked-perceptual-group'
        elif len({rows[i]['raw_class'] for i in indices}) > 1:
            for i in indices:
                rows[i]['excluded'] = 'mixed-label-perceptual-group'
        else:
            for i in sorted(indices, key=lambda i: rows[i]['path'])[1:]:
                rows[i]['excluded'] = 'duplicate-candidate-group'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dataset', type=Path, required=True)
    parser.add_argument('--references', nargs='+', type=Path, required=True)
    parser.add_argument('--source', required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--summary', type=Path, required=True)
    args = parser.parse_args()
    references, digests = [], {}
    for file in args.references:
        data = json.loads(file.read_text(encoding='utf-8'))
        references.extend(reference_records(data))
        digests[str(file)] = hashlib.sha256(file.read_bytes()).hexdigest()
    exact = {r['input_sha256'] for r in references}
    phashes = sorted({int(r['phash'], 16) for r in references})
    files = sorted(p for p in args.dataset.rglob('*') if p.suffix.lower() in {'.jpg', '.jpeg', '.png'})
    if not files:
        raise ValueError(f'No candidate images found in {args.dataset}')
    rows = []
    for index, file in enumerate(files):
        digest, phash = fingerprint(file)
        distance = min((phash ^ other).bit_count() for other in phashes)
        reason = 'exact-reference-overlap' if digest in exact else 'perceptual-reference-overlap' if distance <= 4 else None
        rows.append({'path': str(file), 'raw_class': file.parent.name, 'input_sha256': digest, 'phash': f'{phash:016x}', 'nearest_reference_distance': distance, 'excluded': reason})
        if (index + 1) % 1000 == 0:
            print(f'Fingerprinted {index + 1}/{len(files)}', flush=True)
    filter_candidate_groups(rows)
    labels = sorted({r['raw_class'] for r in rows})
    summary = {'source': args.source, 'reference_audits_sha256': digests, 'candidate_images': len(rows), 'by_raw_class': {name: {'original': sum(r['raw_class'] == name for r in rows), 'remaining': sum(r['raw_class'] == name and r['excluded'] is None for r in rows)} for name in labels}, 'excluded': {reason: sum(r['excluded'] == reason for r in rows) for reason in sorted({r['excluded'] for r in rows if r['excluded']})}, 'predictions_or_training_performed': False, 'limitations': ['Folder names are preserved; ambiguous labels are not mapped to model classes.', 'A lack of exact or pHash<=4 matches does not establish patient-level independence.']}
    summary['filter_version'] = 'connected-component-reference-exclusion-v2'
    summary['limitations'].append('Rotation, cropping, other augmentation, and unidentified repeated patients may escape this filter.')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps({**summary, 'records': rows}, indent=2), encoding='utf-8')
    args.summary.parent.mkdir(parents=True, exist_ok=True)
    args.summary.write_text(json.dumps(summary, indent=2), encoding='utf-8')
    print(json.dumps(summary, indent=2), flush=True)


if __name__ == '__main__':
    main()
