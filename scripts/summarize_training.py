"""Publish small metric summaries; keep images, weights and full manifests local."""
import json
from pathlib import Path

root = Path(__file__).resolve().parent.parent
rows = []
for folder in sorted((root / 'ml' / 'experiments').glob('run-*')):
    source = folder / 'evaluation.json'
    if not source.exists():
        continue
    data = json.loads(source.read_text(encoding='utf-8'))
    meta = json.loads((folder / 'model_meta.json').read_text(encoding='utf-8'))
    rows.append({
        'experiment': folder.name,
        'model': meta['name'],
        'sha256': meta.get('sha256', meta.get('files_sha256')),
        'test': data['test'], 'counts': data['counts'],
        'validation': data['validation'], 'limitations': data['limitations'],
        'validation_split': data.get('validation_split', 'stratified image split'),
    })
report = root / 'reports'
report.mkdir(exist_ok=True)
(report / 'training-results.json').write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'Published {len(rows)} experiment summaries')
