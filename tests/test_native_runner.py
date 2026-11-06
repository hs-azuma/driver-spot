import importlib.util,json,os,shutil,subprocess,sys,tempfile,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('custody',ROOT/'scripts/check-backup-custody.py');C=importlib.util.module_from_spec(spec);spec.loader.exec_module(C)
class NativeBoundary(unittest.TestCase):
 def test_non_ci_run_stops_before_any_service(self):
  with tempfile.TemporaryDirectory() as folder:
   path=Path(folder)/'scripts';path.mkdir();shutil.copy2(ROOT/'scripts/ci-native-restore.py',path/'ci-native-restore.py')
   env=os.environ.copy();env.pop('GITHUB_ACTIONS',None)
   result=subprocess.run([sys.executable,'-B',str(path/'ci-native-restore.py')],capture_output=True,text=True,env=env,timeout=10)
   self.assertEqual(result.returncode,1);report=json.loads((Path(folder)/'docs/native-ci-20261029/result.json').read_text());self.assertEqual(report['failed_stage'],'guard');self.assertEqual(report['checks'],[])
 def test_wrong_repository_is_refused(self):
  with tempfile.TemporaryDirectory() as folder:
   path=Path(folder)/'scripts';path.mkdir();shutil.copy2(ROOT/'scripts/ci-native-restore.py',path/'ci-native-restore.py')
   env=os.environ.copy();env.update(GITHUB_ACTIONS='true',GITHUB_REPOSITORY='someone/else')
   result=subprocess.run([sys.executable,'-B',str(path/'ci-native-restore.py')],capture_output=True,text=True,env=env,timeout=10)
   self.assertEqual(result.returncode,1);report=json.loads((Path(folder)/'docs/native-ci-20261029/result.json').read_text());self.assertEqual(report['failed_stage'],'guard')
 def test_empty_custody_never_enables_export(self):
  result=C.readiness({});self.assertEqual(result['status'],'BLOCKED_CUSTODY_DECISIONS');self.assertIn('key_custodian',result['missing']);self.assertFalse(result['real_export_executed'])
 def test_prepared_folder_is_not_enough(self):
  result=C.readiness({'private_destination_verified_owner_only':True});self.assertEqual(result['status'],'BLOCKED_CUSTODY_DECISIONS');self.assertIn('custody_approved',result['missing'])
