"""Validate and activate a local candidate, preserving a rollback copy.

python ml/promote_model.py ml/experiments/run-004-grouped
Stop the inference server first, then restart after promotion.
"""
import argparse
import datetime
from pathlib import Path
import shutil

import infer_server


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('candidate', type=Path)
    args = parser.parse_args()
    target = Path(__file__).resolve().parent
    candidate = args.candidate.resolve()
    if candidate == target:
        raise ValueError('Candidate is already the active directory')
    infer_server.MODEL_DIR = str(candidate)
    infer_server.load_model()  # Validate class order, feature size, version and hash first.
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    backup = target / 'experiments' / f'backup-{stamp}'
    backup.mkdir(parents=True)
    files = ['model_rf.joblib', 'model_meta.json']
    for name in files:
        if (target / name).exists():
            shutil.copy2(target / name, backup / name)
    try:
        for name in files:
            staged = target / (name + '.candidate')
            shutil.copy2(candidate / name, staged)
            staged.replace(target / name)
    except Exception:
        for name in files:
            if (backup / name).exists():
                shutil.copy2(backup / name, target / name)
        raise
    print(f'Activated: {candidate}')
    print(f'Rollback copy: {backup}')


if __name__ == '__main__':
    main()
