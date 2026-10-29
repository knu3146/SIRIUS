"""Run with: .venv/Scripts/python -m unittest discover -s ml -p test_*.py"""
import tempfile
import unittest
from pathlib import Path
import numpy as np

from train_candidates import discover, unique_records, metrics, perceptual_groups


class DatasetChecks(unittest.TestCase):
    def test_perceptual_groups_include_transitive_matches(self):
        groups = perceptual_groups([0, 1, 3, (1 << 63) - 1], threshold=1)
        self.assertEqual(groups[0], groups[2])
        self.assertNotEqual(groups[0], groups[3])

    def test_evaluation_matches_served_probability_argmax(self):
        class Model:
            classes_ = np.arange(4)

            def predict_proba(self, x):
                return np.eye(4)

            def predict(self, x):
                raise AssertionError('The serving path uses probability argmax')

        self.assertEqual(metrics(Model(), np.zeros((4, 1)), np.arange(4))['accuracy'], 1)

    def test_duplicates_are_removed(self):
        rows = [('a', 0, 'same', None), ('b', 0, 'same', None), ('c', 1, 'other', None)]
        self.assertEqual([r[0] for r in unique_records(rows)], ['a', 'c'])

    def test_conflicting_duplicate_labels_fail(self):
        with self.assertRaisesRegex(ValueError, 'Conflicting'):
            unique_records([('a', 0, 'same', None), ('b', 1, 'same', None)])

    def test_missing_class_fails_before_training(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / 'Training' / 'glioma_tumor').mkdir(parents=True)
            with self.assertRaisesRegex(ValueError, 'Empty class'):
                discover(Path(tmp), 'train')


if __name__ == '__main__':
    unittest.main()
