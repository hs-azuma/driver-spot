import importlib.util,tempfile,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def module(name,file):
 s=importlib.util.spec_from_file_location(name,ROOT/'scripts'/file);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
D=module('dependencies','audit-dependencies.py');N=module('native','native-preflight.py')
class HandoverTools(unittest.TestCase):
 def test_runtime_version_must_be_exact(self):
  for spec in ['https://esm.sh/@supabase/supabase-js@2','npm:@supabase/supabase-js@^2.105.0']:
   self.assertFalse(D.classify(spec)[2])
  self.assertTrue(D.classify('https://esm.sh/@supabase/supabase-js@2.105.0')[2])
 def test_types_are_not_misreported_as_runtime(self):
  self.assertEqual(D.classify('jsr:@supabase/functions-js/edge-runtime.d.ts'),('type_import',None,False))
 def test_inventory_detects_future_floating_imports(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);(root/'index.html').write_text('<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>')
   self.assertEqual(D.inventory(root)['summary']['floating_runtime_imports'],1)
 def test_root_without_uid_switch_is_blocked_even_with_cli(self):
  self.assertIn('native_postgres_nonroot_execution_unavailable',N.assess('Linux','x86_64',(2,41),0,False,True,False)['native_blockers'])
 def test_missing_cli_remains_a_blocker(self):
  self.assertIn('supabase_cli_missing',N.assess('Linux','x86_64',(2,41),1000,True,False,False)['native_blockers'])
 def test_eligible_host_is_only_preflight_not_restore(self):
  self.assertEqual(N.assess('Linux','x86_64',(2,41),1000,True,True,False)['status'],'PREFLIGHT_ONLY_NOT_STARTED')
 def test_platform_or_glibc_is_checked(self):
  self.assertIn('native_platform_not_verified',N.assess('Windows','x86_64',(2,41),1000,True,True,False)['native_blockers'])
  self.assertIn('glibc_below_documented_native_requirement',N.assess('Linux','x86_64',(2,34),1000,True,True,False)['native_blockers'])
