import importlib.util,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('predeploy',Path(__file__).resolve().parents[1]/'scripts/check-predeploy.py');M=importlib.util.module_from_spec(spec);spec.loader.exec_module(M)
class Predeploy(unittest.TestCase):
 def good(self):return dict(transaction_read_only=True,postgres_major=17,application_tables=22,hiring_guard_installed=True,public_security_definer_anon_execute=3,**{n:0 for n in M.ZERO_FIELDS})
 def test_good_still_not_production_ready(self):
  r=M.evaluate(self.good());self.assertEqual(r['status'],'PASS_LOCAL_PREFLIGHT_ONLY');self.assertFalse(r['production_ready'])
 def test_missing_fields_fail_closed(self):self.assertGreater(len(M.evaluate({})['blockers']),10)
 def test_each_anomaly_blocks(self):
  for name in M.ZERO_FIELDS:
   with self.subTest(name=name):
    d=self.good();d[name]=1;self.assertIn(name+'_requires_review',M.evaluate(d)['blockers'])
 def test_wrong_type_does_not_equal_zero(self):
  for value in [None,False,'0',-1]:
   d=self.good();d['over_capacity_jobs']=value;self.assertIn('over_capacity_jobs_missing_or_invalid',M.evaluate(d)['blockers'])
 def test_missing_guard_is_review_not_auto_apply(self):
  d=self.good();d['hiring_guard_installed']=False;r=M.evaluate(d);self.assertIn('hiring_guard_not_installed',r['blockers']);self.assertFalse(r['production_changed'])
