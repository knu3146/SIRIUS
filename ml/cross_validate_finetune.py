"""Train the remaining native-CNN grouped folds without reading test images."""
import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

import numpy as np
from sklearn.model_selection import StratifiedGroupKFold

from train_candidates import perceptual_groups


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--audit', type=Path, required=True)
    parser.add_argument('--first-fold', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        raise ValueError('Use a new output directory')
    source = json.loads(args.manifest.read_text(encoding='utf-8'))
    audit = json.loads(args.audit.read_text(encoding='utf-8'))
    values = {r['input_sha256']: int(r['phash'], 16) for rows in audit['records'].values() for r in rows}
    rows = source['manifest']['train']
    y = np.asarray([r['label'] for r in rows])
    groups = perceptual_groups([values[r['input_sha256']] for r in rows])
    splits = list(StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=42).split(np.zeros((len(y), 1)), y, groups))
    if list(splits[0][0]) != source['split_indices']['fit'] or list(splits[0][1]) != source['split_indices']['validation']:
        raise ValueError('Existing first-fold split mismatch')
    first = json.loads((args.first_fold / 'evaluation.json').read_text(encoding='utf-8'))
    first_meta = json.loads((args.first_fold / 'model_meta.json').read_text(encoding='utf-8'))
    results = [{'fold': 1, 'best_epoch': first_meta['selection']['epoch'], 'validation': first['validation'][str(first_meta['selection']['epoch'])], 'source': str(args.first_fold)}]
    args.output.mkdir(parents=True)
    for fold, (fit, val) in enumerate(splits[1:], start=2):
        manifest = copy.deepcopy(source)
        manifest['manifest']['test'] = []  # No test image paths supplied to these jobs.
        manifest['split_indices'] = {'fit': fit.tolist(), 'validation': val.tolist()}
        manifest['counts']['fit'], manifest['counts']['validation'] = len(fit), len(val)
        file = args.output / f'fold-{fold}-manifest.json'
        file.write_text(json.dumps(manifest), encoding='utf-8')
        destination = args.output / f'fold-{fold}'
        print(f'Training validation-only fold {fold}/5', flush=True)
        subprocess.run([sys.executable, '-u', str(Path(__file__).with_name('train_finetune.py')), '--manifest', str(file), '--output', str(destination), '--epochs', '8', '--validation-only'], check=True, creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        report = json.loads((destination / 'evaluation.json').read_text(encoding='utf-8'))
        meta = json.loads((destination / 'model_meta.json').read_text(encoding='utf-8'))
        results.append({'fold': fold, 'best_epoch': meta['selection']['epoch'], 'validation': report['validation'][str(meta['selection']['epoch'])], 'source': str(destination)})
        (args.output / 'progress.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
    result = {'architecture': 'mobilenet_v3_small_finetuned', 'folds': results, 'mean_macro_f1': float(np.mean([r['validation']['macro_f1'] for r in results])), 'std_macro_f1': float(np.std([r['validation']['macro_f1'] for r in results])), 'mean_accuracy': float(np.mean([r['validation']['accuracy'] for r in results])), 'selection': 'best validation epoch in each grouped fold', 'test_used_in_remaining_folds': False, 'source_manifest_sha256': hashlib.sha256(args.manifest.read_bytes()).hexdigest(), 'limitations': ['The first fold and the overall exploratory test were inspected in previous experiments.', 'Best epoch is selected within each fold; this CV is for internal model selection, not unbiased external validation.', 'Patient-level independence is not established.']}
    (args.output / 'cross-validation.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps({'mean_macro_f1': result['mean_macro_f1'], 'std_macro_f1': result['std_macro_f1']}), flush=True)


if __name__ == '__main__':
    main()
