"""Compare the Claude CNN on the same five training-only perceptual folds."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

import numpy as np
from sklearn.model_selection import StratifiedGroupKFold

from prepare_sirius_data import prepare
from train_candidates import perceptual_groups


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def result(directory, fold):
    history = json.loads((directory / 'history.json').read_text(encoding='utf-8'))
    best = next(row for row in history['history'] if row['epoch'] == history['best_epoch'])
    if best['val_macro_f1'] != max(row['val_macro_f1'] for row in history['history']):
        raise ValueError('Recorded checkpoint is not the validation winner')
    return {'fold': fold, 'best_epoch': best['epoch'], 'accuracy': best['val_acc'],
            'macro_f1': best['val_macro_f1'], 'checkpoint_sha256': sha(directory / 'best.pt')}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--evaluation', type=Path, required=True)
    parser.add_argument('--audit', type=Path, required=True)
    parser.add_argument('--first-fold', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        raise ValueError('Use a new output directory')
    source = json.loads(args.evaluation.read_text(encoding='utf-8'))
    audit = json.loads(args.audit.read_text(encoding='utf-8'))
    rows = source['manifest']['train']
    test_hashes = {row['input_sha256'] for row in source['manifest']['test']}
    if any(row['input_sha256'] in test_hashes for row in rows):
        raise ValueError('Source training contains held-out test hashes')
    values = {row['input_sha256']: int(row['phash'], 16)
              for split in audit['records'].values() for row in split}
    labels = np.asarray([row['label'] for row in rows])
    groups = perceptual_groups([values[row['input_sha256']] for row in rows])
    splits = list(StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=42)
                  .split(np.zeros((len(rows), 1)), labels, groups))
    if (splits[0][0].tolist() != source['split_indices']['fit'] or
            splits[0][1].tolist() != source['split_indices']['validation']):
        raise ValueError('First-fold indices differ from prior comparisons')
    first = json.loads((args.first_fold / 'history.json').read_text(encoding='utf-8'))
    settings = first['args']
    first_input = json.loads(Path(settings['manifest']).read_text(encoding='utf-8'))
    if (first_input['protocol']['source_evaluation_sha256'] != sha(args.evaluation) or
            first_input['protocol']['source_audit_sha256'] != sha(args.audit)):
        raise ValueError('First fold used different source data')
    results = [result(args.first_fold, 1)]
    args.output.mkdir(parents=True)
    config = {'architecture': 'sirius_net', 'source_manifest_sha256': sha(args.evaluation),
              'source_audit_sha256': sha(args.audit),
              'training_settings': {key: settings[key] for key in
                                    ['epochs','width','seed','aug','lr','bs','wd','drop','smooth','threads']},
              'folds': results, 'test_images_used': False,
              'limitations': ['Internal model selection using each fold for epoch selection.',
                             'The source benchmark was inspected in earlier experiments.',
                             'This does not establish patient-level or external independence.']}
    (args.output / 'progress.json').write_text(json.dumps(config, indent=2), encoding='utf-8')
    for fold, (fit, validation) in enumerate(splits[1:], start=2):
        # These jobs receive training records only; no test image paths.
        manifest = {'manifest': {'train': rows, 'test': []},
                    'split_indices': {'fit': fit.tolist(), 'validation': validation.tolist()}}
        manifest_file = args.output / f'fold-{fold}-source.json'
        manifest_file.write_text(json.dumps(manifest), encoding='utf-8')
        dataset = args.output / f'fold-{fold}-data'
        prepare(manifest_file, args.audit, dataset, Path.cwd().resolve())
        destination = args.output / f'fold-{fold}-model'
        command = [sys.executable, '-u', str(Path(__file__).parent / 'candidates/sirius_cnn_v1/src/train_cnn.py'),
                   '--data', str(dataset), '--manifest', str(dataset / 'training-manifest.json'),
                   '--out', str(destination), '--cache', str(dataset / 'cache.npz')]
        for key, value in config['training_settings'].items():
            command.extend([f'--{key}', str(value)])
        print(f'Training SiriusNet grouped fold {fold}/5', flush=True)
        subprocess.run(command, check=True, stdout=sys.stdout, stderr=sys.stderr,
                       creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        results.append(result(destination, fold))
        (args.output / 'progress.json').write_text(json.dumps(config, indent=2), encoding='utf-8')
    config.update(mean_macro_f1=float(np.mean([row['macro_f1'] for row in results])),
                  std_macro_f1=float(np.std([row['macro_f1'] for row in results])),
                  mean_accuracy=float(np.mean([row['accuracy'] for row in results])))
    (args.output / 'cross-validation.json').write_text(json.dumps(config, indent=2), encoding='utf-8')
    print(json.dumps({'mean_macro_f1': config['mean_macro_f1'],
                      'mean_accuracy': config['mean_accuracy']}), flush=True)


if __name__ == '__main__':
    main()
