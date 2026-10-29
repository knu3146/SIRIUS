"""Select the local candidate by training-only grouped CV, without test scores."""
import json
from pathlib import Path

root = Path(__file__).resolve().parent.parent
report = root / 'reports'
features = json.loads((report / 'grouped-cross-validation.json').read_text())
hog = json.loads((report / 'hog-grouped-cross-validation.json').read_text())
native = json.loads((root / 'ml/experiments/native-grouped-cv/cross-validation.json').read_text())
digests = {features['manifest_sha256'], hog['source_manifest_sha256'], native['source_manifest_sha256']}
if len(digests) != 1:
    raise ValueError('Cross-validation input manifests do not match')
models = {
    'run-004-grouped': {'mean_macro_f1': hog['mean_macro_f1'], 'std_macro_f1': hog['std_macro_f1'], 'procedure': 'fixed HOG/SVM C10'},
    'run-006-finetune': {'mean_macro_f1': native['mean_macro_f1'], 'std_macro_f1': native['std_macro_f1'], 'procedure': 'best validation epoch within each fold'},
}
for name, value in features['models'].items():
    models[name] = {'mean_macro_f1': value['mean_macro_f1'], 'std_macro_f1': value['std_macro_f1'], 'procedure': 'fixed CNN features + logistic head C0.1'}
winner = max(models, key=lambda name: models[name]['mean_macro_f1'])
selection = {'rule': 'highest mean grouped training CV macro_f1', 'test_scores_used_for_selection': False, 'folds': 5, 'source_manifest_sha256': next(iter(digests)), 'models': models, 'selected_experiment': winner, 'limitations': ['Small differences between CNN candidates do not demonstrate statistical superiority.', 'Epoch and architecture selection used previously inspected internal validation groups.', 'Patient-level independence and clinical performance remain unverified.']}
(report / 'model-selection.json').write_text(json.dumps(selection, indent=2), encoding='utf-8')
(report / 'native-grouped-cross-validation.json').write_text(json.dumps(native, indent=2), encoding='utf-8')
print(json.dumps(selection, indent=2))
