"""Generate evidence-based sixteen-stage status and a non-executable production review manifest."""
import datetime,hashlib,importlib.util,json,re,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
MAIN='41d6223854a780713686d02ae73d028eb17aa2c4'
def read(path):return json.loads((ROOT/path).read_text())
def sha(path):return hashlib.sha256((ROOT/path).read_bytes()).hexdigest()
def main():
    native=read('docs/native-ci-20261029/result.json');audit=read('docs/third-party-readiness-20261029.json');clean=read('docs/handover-cleanroom-20261029.json')
    hashes=native.get('source_sha256',{});current=bool(hashes) and all((ROOT/p).is_file() and sha(p)==h for p,h in hashes.items())
    checks=set(native.get('checks',[]))
    def sub(name,status):return current and native.get(name,{}).get('status')==status
    independent=sub('independent_cluster_restore','PASS_INDEPENDENT_CLUSTER_AUTH_STORAGE');concurrency=sub('concurrency','PASS_NATIVE_MULTI_CONNECTION_SYNTHETIC');business=sub('business_flow','PASS_RESTORED_NATIVE_BUSINESS_FLOW');edge=sub('edge_runtime','PASS_NATIVE_EDGE_SMOKE');fault=sub('http_response_loss','PASS_COMMIT_ACK_LOSS_RECONCILIATION');crash=sub('crash_recovery','PASS_IMMEDIATE_STOP_WAL_RECOVERY')
    paths=set(subprocess.check_output(['git','diff','--name-only',MAIN],cwd=ROOT,text=True).splitlines())
    paths.update(subprocess.check_output(['git','ls-files','--others','--exclude-standard'],cwd=ROOT,text=True).splitlines())
    candidate=sorted(p for p in paths if (ROOT/p).is_file() and (p.endswith('.html') or p.startswith('assets/') or p.startswith('supabase/functions/') or p.startswith('sql/review-v4-')))
    entries=[]
    for p in candidate:
        before=subprocess.run(['git','show',MAIN+':'+p],cwd=ROOT,capture_output=True)
        entries.append({'path':p,'sha256':sha(p),'base_sha256':hashlib.sha256(before.stdout).hexdigest() if before.returncode==0 else None,'rollback_review':p.endswith('-rollback.sql')})
    now=datetime.datetime.now(datetime.timezone.utc);date=now.astimezone(datetime.timezone(datetime.timedelta(hours=9))).date().isoformat()
    release={'status':'PREPARED_APPROVAL_REQUIRED','date_jst':date,'observed_main_commit':MAIN,'native_test_commit':native.get('source_commit'),'native_sources_current':current,'production_changed':False,'production_ready':False,'approval':None,'real_backup_verified':False,'scope':'review inventory only; never a deployment command','files':entries,'runbook':'docs/v4-sixteen/production-review.md','gates':['Current-source native and cleanroom checks','Real backup custody, retention, recovery objectives and restore verification','Scoped owner approval and named operator','Production delta and legacy mutating workflow review','Real device, notification and external configuration checks']}
    (ROOT/'docs/release/v4-current-candidate-20261031.json').write_text(json.dumps(release,ensure_ascii=False,indent=2)+'\n')
    settings=read('docs/edge-functions-runtime-settings-20261031.json');observed={f['name']:f for f in settings['functions']};functions=[]
    for directory in sorted((ROOT/'supabase/functions').iterdir()):
        if not (directory/'index.ts').is_file():continue
        sources=sorted(directory.rglob('*.ts'));text='\n'.join(p.read_text() for p in sources)
        functions.append({'name':directory.name,'verify_jwt':observed[directory.name]['verify_jwt'],'observed_production_version':observed[directory.name]['version'],'environment_names':sorted(set(re.findall(r"(?:Deno\.env\.get|env)\(['\"]([A-Z][A-Z0-9_]*)['\"]\)",text))),'source_sha256':{p.relative_to(ROOT).as_posix():sha(p.relative_to(ROOT)) for p in sources},'native_smoke_verified':edge,'secrets_values_included':False})
    inventory={'date_jst':date,'status':'INVENTORIED_WITH_NATIVE_SMOKE' if edge else 'INVENTORIED_NATIVE_SMOKE_PENDING','functions':functions,'limits':['Gateway JWT flags and handler authorization are different','Worker x-spodora-worker-key preimage is managed separately; source stores a hash only','Service URLs/domain links, provider secrets, webhook setup and secret custody require separate verification','A successful smoke test is not a full Deno typecheck or real provider delivery']}
    (ROOT/'docs/functions-runtime-inventory-20261031.json').write_text(json.dumps(inventory,ensure_ascii=False,indent=2)+'\n')
    integrity=current and {'Truncated native dump causes restore failure','Failed native restore rolls back application schema'}.issubset(checks)
    spec=importlib.util.spec_from_file_location('handover_scope',ROOT/'scripts/verify-handover.py');scope=importlib.util.module_from_spec(spec);spec.loader.exec_module(scope)
    all_paths=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z'],cwd=ROOT).decode().split('\0')
    fingerprint=hashlib.sha256()
    for path in sorted(set(p for p in all_paths if p and p not in scope.OUTPUTS and not p.startswith(scope.GENERATED_PREFIXES))):
        fingerprint.update(path.encode()+b'\0'+hashlib.sha256((ROOT/path).read_bytes()).digest())
    source_hash=fingerprint.hexdigest()
    audited=audit.get('status')=='PASS_PREPARATION_AUDIT_WITH_BLOCKERS' and all(c['pass'] for c in audit['checks']) and audit.get('source_sha256')==source_hash and clean.get('source_sha256')==source_hash and audit.get('native_test_commit')==native.get('source_commit')
    titles=['別の新規環境','DB定義/権限/データ/採番','認証の別環境復元','Storage本体/所有者/非公開','Functionsと設定','復元後の一連の業務','同時応募/同時採用','取消/夜勤/QRの競合','通知リース/再試行','通信応答喪失の照合','強制停止からの復旧','不完全バックアップの拒否','復元後の権限/認証点検','復元手順書','本番適用/切り戻し判断資料','現行ソースと引き継ぎ証拠']
    outcomes=[independent,independent and 'Independent private schema function column sequence and Auth trigger privileges restored' in checks,independent,independent,edge,business,concurrency,concurrency and 'Native QR regeneration winning race invalidates old token punch' in checks,concurrency,fault,crash,integrity,independent and edge,True,True,audited and current]
    tasks=[]
    for i,(title,done) in enumerate(zip(titles,outcomes),1):
        status='VERIFIED_SYNTHETIC' if done else 'IN_PROGRESS'
        if i in (14,15):status='PREPARED_NOT_PRODUCTION_APPROVED'
        if i==5 and not edge and native.get('failed_stage')=='native_edge_functions':status='BLOCKED_NATIVE_EDGE_RUNTIME'
        tasks.append({'id':i,'title':title,'technical_scope_complete':bool(done),'status':status,'evidence':'docs/native-ci-20261029/result.json' if i<14 else ['docs/v4-sixteen/recovery-runbook.md','docs/release/v4-current-candidate-20261031.json','docs/third-party-readiness-20261029.json'][i-14]})
    result={'date_jst':date,'status':'ALL_SIXTEEN_SYNTHETIC_SCOPES_VERIFIED' if all(outcomes) else 'SIXTEEN_STAGE_WORK_IN_PROGRESS','production_changed':False,'production_ready':False,'native_sources_current':current,'all_source_sha256':source_hash,'native_overall_status':native.get('status'),'native_checks':len(checks),'native_commit':native.get('source_commit'),'tasks':tasks,'complete_count':sum(outcomes),'total':16,'count_is_not_weighted_completion_percentage':True,'remaining_external_gates':['Actual production-data backup and owner key/retention/RPO/RTO decisions','Independent human acceptance, individual rights and MFA handover','Scoped production approval and operator','Separate physical host/cloud migration, object UUID/old signed URLs, managed platform secrets','Real iPhone/Android camera/biometrics and email/LINE delivery'],'limits':['Synthetic verification and documentation preparation only','Some behaviors combine native DB/API checks with existing synthetic browser/provider contract tests','No production-data export, message send, paid resource or production apply']}
    (ROOT/'docs/v4-sixteen/status.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'status':result['status'],'complete_count':result['complete_count'],'total':16,'native_sources_current':current}))
if __name__=='__main__':main()
