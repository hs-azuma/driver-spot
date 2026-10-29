import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('restore_audit', ROOT / 'scripts/restore-audit.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class RestoreAuditTests(unittest.TestCase):
    def changed(self, filename, mutate):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / 'docs/database'
            target.mkdir(parents=True)
            for p in (ROOT / 'docs/database').glob('*20261029.json'):
                data = json.loads(p.read_text())
                if p.name == filename:
                    mutate(data)
                (target / p.name).write_text(json.dumps(data))
            return module.audit(Path(tmp))

    def test_original_metadata_is_consistent_but_not_restore_proof(self):
        report = module.audit()
        self.assertEqual(report['status'], 'PASS_METADATA_ONLY')
        self.assertTrue(report['unverified'])

    def test_changed_function_body_is_rejected(self):
        r = self.changed('function-dependencies-20261029.json',
                         lambda d: d['public']['functions'][0].update(definition='SELECT 1'))
        self.assertEqual(r['status'], 'FAIL')

    def test_explicit_anon_grant_is_also_reviewed(self):
        report = module.audit()
        self.assertTrue(any(f.startswith('public.register_company(') for f in report['security_review_required']))
        self.assertTrue(any(f.startswith('public.get_my_driver(') for f in report['security_review_required']))

    def test_missing_identity_owner_is_rejected(self):
        r = self.changed('restore-metadata-20261029.json', lambda d: d['sequences'].pop())
        self.assertEqual(r['status'], 'FAIL')

    def test_missing_private_trigger_function_is_rejected(self):
        r = self.changed('private-dependencies-20261029.json', lambda d: d['functions'].clear())
        self.assertTrue(any('Missing trigger dependency' in error for error in r['errors']))

    def test_missing_column_privilege_is_rejected(self):
        r = self.changed('column-privileges-20261029.json', lambda d: d.pop())
        self.assertEqual(r['status'], 'FAIL')

    def test_rls_disabled_is_rejected(self):
        r = self.changed('public-catalog-20261029.json', lambda d: d['tables'][0].update(rls=False))
        self.assertEqual(r['status'], 'FAIL')


if __name__ == '__main__':
    unittest.main()
