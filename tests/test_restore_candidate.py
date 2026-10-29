import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('candidate', ROOT / 'scripts/build-restore-candidate.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class CandidateTests(unittest.TestCase):
    def setUp(self):
        def read(name):
            return json.loads((ROOT / 'docs/database' / name).read_text())
        self.catalog = read('public-catalog-20261029.json')
        self.dependencies = read('function-dependencies-20261029.json')
        self.metadata = read('restore-metadata-20261029.json')
        self.supplement = read('private-dependencies-20261029.json')
        self.column_privileges = read('column-privileges-20261029.json')

    def test_identity_not_created_twice_and_constraints_own_indexes(self):
        sql, manifest = module.build(self.catalog, self.dependencies, self.metadata, self.supplement, self.column_privileges)
        self.assertEqual(sql.count(' AS IDENTITY ('), 7)
        self.assertNotIn('CREATE SEQUENCE ', sql)
        self.assertEqual(manifest['counts']['additional_indexes'], 23)
        self.assertNotIn('CREATE UNIQUE INDEX companies_pkey', sql)
        self.assertEqual(sql.count('CREATE OR REPLACE FUNCTION '), 54)
        self.assertTrue(sql.endswith('ROLLBACK;\n'))
        self.assertIn("check_function_bodies = on", sql)
        self.assertIn('GRANT SELECT ("company_id") ON TABLE "public"."company_driver_blocks" TO "authenticated";', sql)

    def test_dependency_reordered_and_cycle_rejected(self):
        a = {'name': 'a', 'arguments': '', 'definition': 'AS $function$ select public.b(); $function$'}
        b = {'name': 'b', 'arguments': '', 'definition': 'AS $function$ select 1; $function$'}
        ordered, _ = module.order_functions([a, b])
        self.assertEqual([f['name'] for f in ordered], ['b', 'a'])
        b['definition'] = 'AS $function$ select public.a(); $function$'
        with self.assertRaises(ValueError):
            module.order_functions([a, b])

    def test_acl_null_means_public_execute_for_functions(self):
        sql = '\n'.join(module.acl_sql('FUNCTION', 'public.example()', None, 'postgres'))
        self.assertIn('GRANT EXECUTE ON FUNCTION public.example() TO PUBLIC;', sql)
        sql = '\n'.join(module.acl_sql('SEQUENCE', 'public.example', None, 'postgres'))
        self.assertNotIn('TO PUBLIC;', sql)

    def test_unknown_generated_columns_fail_closed(self):
        self.catalog['columns'][0]['generated'] = 's'
        with self.assertRaises(ValueError):
            module.build(self.catalog, self.dependencies, self.metadata)

    def test_committed_candidate_is_reproducible(self):
        sql, manifest = module.build(self.catalog, self.dependencies, self.metadata, self.supplement, self.column_privileges)
        self.assertEqual(sql, (ROOT / 'docs/database/restore-candidate/application-review.sql').read_text())
        self.assertEqual(manifest, json.loads((ROOT / 'docs/database/restore-candidate/manifest.json').read_text()))


if __name__ == '__main__':
    unittest.main()
