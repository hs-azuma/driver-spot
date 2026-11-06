"""Evidence-based completion for the eight preparation scopes; never production readiness."""
import datetime,hashlib,importlib.util,json,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def read(path):return json.loads((ROOT/path).read_text())
def current(hashes):return bool(hashes) and all((ROOT/p).is_file() and hashlib.sha256((ROOT/p).read_bytes()).hexdigest()==h for p,h in hashes.items())
def main():
 native=read('docs/native-ci-20261029/result.json');clean=read('docs/handover-cleanroom-20261029.json');deps=read('docs/dependency-inventory-20261029.json')
 native_ok=native.get('status')=='PASS_NATIVE_SUPABASE_SYNTHETIC_DB_RESTORE' and current(native.get('source_sha256',{}))
 ui=native.get('browser_e2e',{});edge=native.get('edge_typecheck',{})
 spec=importlib.util.spec_from_file_location('scope',ROOT/'scripts/verify-handover.py');scope=importlib.util.module_from_spec(spec);spec.loader.exec_module(scope)
 paths=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z'],cwd=ROOT).decode().split('\0');fp=hashlib.sha256()
 for p in sorted(set(p for p in paths if p and p not in scope.OUTPUTS and not p.startswith(scope.GENERATED_PREFIXES))):fp.update(p.encode()+b'\0'+hashlib.sha256((ROOT/p).read_bytes()).digest())
 clean_ok=clean.get('status')=='PASS_SOURCE_REPRODUCTION_ONLY' and clean.get('source_sha256')==fp.hexdigest()
 locks=list((ROOT/'supabase/functions').glob('*/deno.lock'));locked=len(locks)==10 and all(p.stat().st_size>30 for p in locks)
 patches=[]
 for name in ('rebrand-spodora','update-driver-experience'):
  patch=ROOT/f'docs/review/workflows/{name}.patch';r=subprocess.run(['git','apply','--check',str(patch)],cwd=ROOT,capture_output=True)
  text=(ROOT/f'docs/review/workflows/{name}.candidate.yml').read_text();patches.append(r.returncode==0 and 'contents: read' in text and 'workflow_dispatch:' in text and 'git push' not in text and 'checkout@11d5960a326750d5838078e36cf38b85af677262' in text)
 offline=next((s for s in clean.get('steps',[]) if s['name']=='offline_regression'),{})
 docs_ok=all((ROOT/p).is_file() for p in ('docs/v4-eight/data-lifecycle.md','docs/v4-eight/resume.md','docs/v4-eight/README.md','tools/backup-kit/README.md'))
 done=[native_ok and ui.get('status')=='PASS_NATIVE_BROWSER_REGISTRATION_TO_PAYROLL' and current(ui.get('source_sha256',{})),native_ok and edge.get('status')=='PASS_STRICT_DENO_ALL_TEN_FUNCTIONS' and len(edge.get('checks',[]))==10 and all(c['pass'] for c in edge['checks']),native_ok and locked and deps['summary']['floating_type_imports']==0 and deps['summary']['floating_runtime_imports']==0,all(patches),clean_ok and offline.get('node_tests',0)>=188,native_ok and native.get('predeploy_read_only',{}).get('transaction_read_only') is True and 5 in offline.get('python_suites',[]),docs_ok,clean_ok and docs_ok]
 titles=['画面から実DBまでの自動テスト','10 Functionsの厳密型チェック','依存関係の固定','旧自動更新2件の改善案','バックアップ用ツール','本番適用前の診断ツール','保存・退会・匿名化の運用案','引き継ぎ資料の最終整理']
 evidence=['docs/native-ci-20261029/result.json#browser_e2e','docs/native-ci-20261029/result.json#edge_typecheck','docs/dependency-inventory-20261029.json','docs/review/workflows/README.md','tools/backup-kit/README.md','docs/v4-eight/predeploy.md','docs/v4-eight/data-lifecycle.md','docs/v4-eight/resume.md']
 result={'status':'ALL_EIGHT_PREPARATION_SCOPES_COMPLETE' if all(done) else 'IN_PROGRESS','date_jst':datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).date().isoformat(),'production_changed':False,'production_ready':False,'real_data_exported':False,'paid_resources_created':False,'native_commit':native.get('source_commit'),'native_checks':len(native.get('checks',[])),'native_sources_current':native_ok,'source_sha256':fp.hexdigest(),'tasks':[{'id':i,'title':title,'complete':ok,'status':('PREPARED_NOT_APPLIED' if i in (4,7) else 'VERIFIED_PREPARATION') if ok else 'IN_PROGRESS','evidence':ev} for i,(title,ok,ev) in enumerate(zip(titles,done,evidence),1)],'complete_count':sum(done),'total':8,'count_is_not_weighted_completion_percentage':True,'known_limits':['Upstream SDK WebAuthn declarations conflict with TypeScript6 DOM under --all; default strict application checking is used, not a passing dependency-declaration audit','Corporate email confirmation, actual camera/biometrics and real notification delivery are not tested','Backup kit is filesystem-only; no real data exported, private cloud upload or production restore executed','Legacy mutating workflow candidates and data lifecycle policy remain unapplied/unapproved','Real backup custody, owner decisions, independent human handover and production approval remain pending']}
 (ROOT/'docs/v4-eight/status.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'status':result['status'],'complete_count':sum(done),'total':8}));return 0 if all(done) else 1
if __name__=='__main__':raise SystemExit(main())
