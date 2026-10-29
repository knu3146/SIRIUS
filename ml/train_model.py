"""Compatibility entrypoint: train candidates without replacing the active model.

python ml/train_model.py "path/to/dataset" [--audit datasets/audit.json]
Run promote_model.py separately after reviewing the evaluation report.
"""
import argparse
import datetime
from pathlib import Path

from train_candidates import main as train_candidates


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('dataset')
    parser.add_argument('--output', type=Path)
    parser.add_argument('--source', default='local MRI dataset; source not specified')
    parser.add_argument('--audit', type=Path)
    parser.add_argument('--exclude-tested-manifest', type=Path)
    args = parser.parse_args()
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    output = args.output or Path(__file__).resolve().parent / 'experiments' / f'run-{stamp}'
    command = [args.dataset, '--output', str(output), '--source', args.source]
    if args.audit:
        command += ['--audit', str(args.audit)]
    if args.exclude_tested_manifest:
        command += ['--exclude-tested-manifest', str(args.exclude_tested_manifest)]
    train_candidates(command)


if __name__ == '__main__':
    main()
