import importlib.util
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import sklearn

import infer_server
from features import CLASS_DIRS


class ModelLoadingChecks(unittest.TestCase):
    def check_rejected(self, metadata, files=None):
        with tempfile.TemporaryDirectory() as work:
            directory = Path(work)
            (directory / 'model_meta.json').write_text(json.dumps(metadata), encoding='utf-8')
            for name, data in (files or {}).items():
                (directory / name).write_bytes(data)
            with patch.object(infer_server, 'MODEL_DIR', work), patch.object(infer_server.joblib, 'load') as deserialize:
                with self.assertRaises(SystemExit):
                    infer_server.load_model()
                deserialize.assert_not_called()

    def test_class_order_mismatch_rejected_before_deserialization(self):
        self.check_rejected({'classes': list(reversed(CLASS_DIRS)), 'sklearn_version': sklearn.__version__})

    def test_unknown_architecture_rejected(self):
        self.check_rejected({'classes': CLASS_DIRS, 'sklearn_version': sklearn.__version__, 'architecture': 'unknown'})

    def test_corrupt_hog_model_rejected_before_deserialization(self):
        self.check_rejected({'classes': CLASS_DIRS, 'sklearn_version': sklearn.__version__, 'sha256': '0' * 64}, {'model_rf.joblib': b'not trusted pickle data'})

    def test_corrupt_cnn_model_rejected_before_deserialization(self):
        self.check_rejected({'classes': CLASS_DIRS, 'sklearn_version': sklearn.__version__, 'architecture': 'mobilenet_v3_small', 'files_sha256': {'classifier.joblib': '0' * 64}}, {'classifier.joblib': b'not trusted pickle data'})

    def test_native_cnn_does_not_require_sklearn_metadata_and_still_verifies_hash(self):
        self.check_rejected({'classes': CLASS_DIRS, 'architecture': 'mobilenet_v3_small_finetuned', 'files_sha256': {'model.pth': '0' * 64}}, {'model.pth': b'not trusted model data'})


@unittest.skipUnless(importlib.util.find_spec('torch') and importlib.util.find_spec('torchvision'), 'optional PyTorch dependencies are not installed')
class CNNInputChecks(unittest.TestCase):
    def test_center_crop_attention_maps_back_to_original_aspect_ratio(self):
        import numpy as np
        from cnn_backend import restore_attention
        for dimensions in [(200, 200), (400, 200), (200, 400)]:
            heat = restore_attention(np.ones((224, 224)), dimensions, 256)
            self.assertEqual(heat.shape, (128, 128))
            self.assertAlmostEqual(float(heat[64, 64]), 1)
            self.assertEqual(float(heat[0, 0]), 0)
        wide = restore_attention(np.ones((224, 224)), (400, 200), 256)
        self.assertEqual(float(wide[64, 20]), 0)
        self.assertAlmostEqual(float(wide[64, 64]), 1)

    def test_native_cnn_checkpoint_roundtrip_without_network(self):
        import numpy as np
        from PIL import Image
        import torch
        from cnn_backend import make_finetuned_model
        with tempfile.TemporaryDirectory() as work:
            directory = Path(work)
            model = make_finetuned_model()
            with torch.no_grad():
                for parameter in model.parameters():
                    parameter.zero_()
                model.classifier[-1].bias[3] = 5
            torch.save(model.state_dict(), directory / 'model.pth')
            metadata = {'name': 'synthetic unit-test fixture', 'classes': CLASS_DIRS, 'architecture': 'mobilenet_v3_small_finetuned', 'torch_version': torch.__version__, 'files_sha256': {'model.pth': hashlib.sha256((directory / 'model.pth').read_bytes()).hexdigest()}}
            (directory / 'model_meta.json').write_text(json.dumps(metadata), encoding='utf-8')
            data = io.BytesIO()
            Image.new('RGB', (128, 128), '#808080').save(data, format='PNG')
            with patch.object(infer_server, 'MODEL_DIR', work), patch('torch.hub.download_url_to_file', side_effect=AssertionError('Inference must not download weights')):
                loaded, meta = infer_server.load_model()
                with patch.object(infer_server, 'MODEL', loaded), patch.object(infer_server, 'META', meta):
                    result = infer_server.analyze(data.getvalue())
            self.assertEqual(int(np.argmax(result['probs'])), 3)
            self.assertAlmostEqual(sum(result['probs']), 1, places=6)
            self.assertEqual(result['regions'], [])

    def test_extreme_aspect_ratio_rejected_before_resize(self):
        from PIL import Image
        from cnn_backend import MobileClassifier
        classifier = MobileClassifier.__new__(MobileClassifier)
        with self.assertRaisesRegex(ValueError, 'aspect ratio'):
            classifier.predict_image(Image.new('RGB', (900, 1)))


if __name__ == '__main__':
    unittest.main()
