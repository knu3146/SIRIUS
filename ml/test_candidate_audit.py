"""Regression checks for external-data leakage filtering."""
import unittest

from audit_candidate import filter_candidate_groups, reference_records


def row(path, phash, label='glioma', excluded=None):
    return {'path': path, 'phash': f'{phash:016x}', 'raw_class': label, 'excluded': excluded}


class CandidateAuditChecks(unittest.TestCase):
    def test_reference_contamination_follows_transitive_similarity(self):
        rows = [row('a', 0, excluded='exact-reference-overlap'),
                row('b', 15, excluded='perceptual-reference-overlap'),
                row('c', 255), row('unrelated', (1 << 64) - 1)]
        filter_candidate_groups(rows)
        self.assertEqual(rows[2]['excluded'], 'reference-linked-perceptual-group')
        self.assertIsNone(rows[3]['excluded'])

    def test_conflicting_component_is_rejected_instead_of_relabelled(self):
        rows = [row('a', 0), row('b', 15, label='pituitary')]
        filter_candidate_groups(rows)
        self.assertTrue(all(r['excluded'] == 'mixed-label-perceptual-group' for r in rows))

    def test_duplicate_choice_is_independent_of_input_order(self):
        rows = [row('z', 0), row('a', 1)]
        filter_candidate_groups(rows)
        self.assertEqual(rows[0]['excluded'], 'duplicate-candidate-group')
        self.assertIsNone(rows[1]['excluded'])

    def test_reference_audits_support_split_and_flat_manifests(self):
        records = [row('a', 0)]
        self.assertEqual(reference_records({'records': records}), records)
        self.assertEqual(reference_records({'records': {'train': records, 'test': []}}), records)
        with self.assertRaisesRegex(ValueError, 'no images'):
            reference_records({'records': []})


if __name__ == '__main__':
    unittest.main()
