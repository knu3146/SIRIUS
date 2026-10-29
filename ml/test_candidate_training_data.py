"""Candidate training must not preload test pixels or trust stale caches."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
from PIL import Image

_path = Path(__file__).parent / 'candidates/sirius_cnn_v1/src/training_data.py'
_spec = importlib.util.spec_from_file_location('_candidate_training_data', _path)
_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_module)
load_gray = _module.load_gray


class TrainingDataChecks(unittest.TestCase):
    def image(self, root, name, value):
        file = root / name
        file.parent.mkdir(parents=True, exist_ok=True)
        Image.new('L', (16, 16), value).save(file)
        return file

    def test_training_does_not_open_unrequested_test_images(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.image(root, 'train/glioma/a.png', 64)
            bad = root / 'test/glioma/corrupt.jpg'
            bad.parent.mkdir(parents=True)
            bad.write_bytes(b'not an image; the training loader must never open this')
            pixels = load_gray(root, ['train/glioma/a.png'], root / 'cache.npz', {'train'})
            self.assertEqual(pixels.shape, (1, 128, 128))
            with np.load(root / 'cache.npz', allow_pickle=False) as cache:
                self.assertEqual(cache['rels'].tolist(), ['train/glioma/a.png'])

    def test_cache_detects_edited_images_and_preserves_other_requested_splits(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            name = 'train/glioma/a.png'
            self.image(root, name, 16)
            self.image(root, 'val/glioma/a.png', 64)
            cache = root / 'cache.npz'
            first = load_gray(root, [name], cache, {'train'})
            load_gray(root, ['val/glioma/a.png'], cache, {'val'})
            with patch.object(_module.Image, 'open', side_effect=AssertionError('valid cache should be reused')):
                np.testing.assert_array_equal(load_gray(root, [name], cache, {'train'}), first)
            self.image(root, name, 224)
            self.assertGreater(float(load_gray(root, [name], cache, {'train'}).mean()), float(first.mean()))

    def test_split_and_root_escape_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            parent = Path(directory)
            root = parent / 'root'
            self.image(root, 'test/glioma/a.png', 64)
            self.image(parent, 'outside.png', 64)
            with self.assertRaisesRegex(ValueError, 'forbidden split'):
                load_gray(root, ['test/glioma/a.png'], allowed_splits={'train'})
            with self.assertRaisesRegex(ValueError, 'Invalid image path'):
                load_gray(root, ['../outside.png'])


if __name__ == '__main__':
    unittest.main()
