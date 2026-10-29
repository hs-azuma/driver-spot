import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('access_review', ROOT / 'scripts/build-access-review.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class AccessReviewTests(unittest.TestCase):
    def test_review_and_rollback_match_generated_sources(self):
        proposal, rollback = module.build()
        self.assertEqual(proposal, (ROOT / 'sql/review-v4-legacy-and-rounding-access.sql').read_text())
        self.assertEqual(rollback, (ROOT / 'sql/review-v4-legacy-and-rounding-rollback.sql').read_text())
        self.assertTrue(proposal.endswith('ROLLBACK;\n'))
        self.assertTrue(rollback.endswith('ROLLBACK;\n'))

    def test_application_entry_review_matches_generated_sources(self):
        proposal, rollback = module.build_entry()
        self.assertEqual(proposal, (ROOT / 'sql/review-v4-application-entry-access.sql').read_text())
        self.assertEqual(rollback, (ROOT / 'sql/review-v4-application-entry-rollback.sql').read_text())


if __name__ == '__main__':
    unittest.main()
