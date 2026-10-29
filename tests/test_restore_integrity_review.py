import importlib.util
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('integrity_review',ROOT/'scripts/build-integrity-review.py')
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
class IntegrityReviewTests(unittest.TestCase):
    def test_committed_review_and_rollback_are_reproducible(self):
        proposal,rollback=module.build()
        self.assertEqual(proposal,(ROOT/'sql/review-v4-overnight-overlap.sql').read_text())
        self.assertEqual(rollback,(ROOT/'sql/review-v4-overnight-overlap-rollback.sql').read_text())
