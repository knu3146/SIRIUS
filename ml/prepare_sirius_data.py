"""Prepare Claude CNN training/validation from an existing grouped split, without test pixels."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil

from audit_dataset import fingerprint
from features import CLASS_DIRS
from train_candidates import perceptual_groups


def prepare(evaluation, audit, output, project_root):
    data = json.loads(evaluation.read_text(encoding='utf-8'))
    rows = data['manifest']['train']
    fit, validation = data['split_indices']['fit'], data['split_indices']['validation']
    if (len(set(fit)) != len(fit) or len(set(validation)) != len(validation) or
            set(fit) & set(validation) or set(fit) | set(validation) != set(range(len(rows)))):
        raise ValueError('Invalid training/validation partition')
    test_hashes = {row['input_sha256'] for row in data['manifest']['test']}
    if any(row['input_sha256'] in test_hashes for row in rows):
        raise ValueError('Training contains held-out test hashes')
    reference = json.loads(audit.read_text(encoding='utf-8'))
    hashes = {row['input_sha256']: int(row['phash'], 16)
              for split in reference['records'].values() for row in split}
    groups = perceptual_groups([hashes[row['input_sha256']] for row in rows])
    if set(groups[fit]) & set(groups[validation]):
        raise ValueError('Perceptual groups cross training/validation boundaries')
    if output.exists():
        raise ValueError('Use a new output directory')
    selections = {'train': [], 'val': []}
    for split, indices in [('train', fit), ('val', validation)]:
        for index in indices:
            row = rows[index]
            source = (project_root / row['path']).resolve()
            if not source.is_relative_to(project_root):
                raise ValueError('Source image is outside the project root')
            if fingerprint(source)[0] != row['input_sha256']:
                raise ValueError(f'Source image changed: {source}')
            name = CLASS_DIRS[row['label']]
            relative = Path(split) / name / f'{index:05d}_{row["input_sha256"][:12]}{source.suffix.lower()}'
            destination = output / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, destination)
            selections[split].append(relative.as_posix())
    protocol = {
        'source_evaluation_sha256': hashlib.sha256(evaluation.read_bytes()).hexdigest(),
        'source_audit_sha256': hashlib.sha256(audit.read_bytes()).hexdigest(),
        'fit_images': len(fit), 'validation_images': len(validation),
        'test_images_opened_or_copied': 0,
        'split': 'Same pHash-grouped fit/validation indices as earlier model comparisons',
        'selection': 'highest validation macro-F1 epoch; no test scoring for this training run',
        'patient_level_independence_established': False,
    }
    manifest = {'train_all': selections['train'], 'train_exclude': [],
                'val_all': selections['val'], 'val_keep': selections['val'],
                'protocol': protocol}
    (output / 'training-manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    return protocol


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--evaluation', type=Path, required=True)
    parser.add_argument('--audit', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--protocol', type=Path, required=True)
    parser.add_argument('--project-root', type=Path, default=Path.cwd())
    args = parser.parse_args()
    protocol = prepare(args.evaluation, args.audit, args.output, args.project_root.resolve())
    args.protocol.parent.mkdir(parents=True, exist_ok=True)
    args.protocol.write_text(json.dumps(protocol, indent=2), encoding='utf-8')
    print(json.dumps(protocol, indent=2), flush=True)


if __name__ == '__main__':
    main()
