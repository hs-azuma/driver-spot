"""Audit repository evidence only. Does not grant rights or assert an independent human sign-off."""
import datetime,hashlib,importlib.util,json,re,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
REPORT=ROOT/'docs/third-party-readiness-20261029.json'

def main():
    REPORT.write_text(json.dumps({'status':'AUDIT_IN_PROGRESS'})+'\n')
    checks=[]
    def check(name,ok,detail=None):checks.append({'name':name,'pass':bool(ok),'detail':detail})
    docs=[ROOT/'README.md',*sorted((ROOT/'docs').rglob('*.md')),*sorted((ROOT/'tools').glob('*/README.md'))]
    missing=[];links=0
    for path in docs:
        for target in re.findall(r'\]\(([^)]+)\)',path.read_text()):
            target=target.strip('<>')
            if re.match(r'(?:\w+://|mailto:|#)',target):continue
            links+=1
            if not (path.parent/target.split('#')[0]).exists():missing.append({'path':str(path.relative_to(ROOT)),'target':target})
    check('local_document_links',not missing,{'files':len(docs),'links':links,'missing':missing})
    inventory=json.loads((ROOT/'docs/dependency-inventory-20261029.json').read_text())
    check('runtime_imports_exact',inventory['summary']['floating_runtime_imports']==0,inventory['summary'])
    for directory,status,key,count in [('browser','PASS_CHROMIUM_SYNTHETIC_UI_ONLY','tests',38),('sdk','PASS_REAL_SDK_WITH_SYNTHETIC_HTTP_ONLY','checks',33),('business','PASS_BUSINESS_ACTIONS_WITH_SYNTHETIC_BACKEND','checks',51)]:
        data=json.loads((ROOT/f'docs/{directory}-lab-20261029/result.json').read_text())
        check(directory+'_result',data['status']==status and len(data[key])==count and all(c['status']=='PASS' for c in data[key]))
        check(directory+'_source_hashes',all(hashlib.sha256((ROOT/path).read_bytes()).hexdigest()==sha for path,sha in data['source_sha256'].items()))
    spec=importlib.util.spec_from_file_location('handover',ROOT/'scripts/verify-handover.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    paths=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z'],cwd=ROOT).decode().split('\0')
    fingerprint=hashlib.sha256()
    for path in sorted(set(p for p in paths if p and p not in module.OUTPUTS and not p.startswith(module.GENERATED_PREFIXES))):
        fingerprint.update(path.encode()+b'\0'+hashlib.sha256((ROOT/path).read_bytes()).digest())
    clean=json.loads((ROOT/'docs/handover-cleanroom-20261029.json').read_text())
    check('clean_source_reproduction_current',clean['status']=='PASS_SOURCE_REPRODUCTION_ONLY' and fingerprint.hexdigest()==clean['source_sha256'])
    native=json.loads((ROOT/'docs/native-preflight-20261029.json').read_text())
    backup=json.loads((ROOT/'docs/backup-recovery-plan.json').read_text())
    result={'status':'PASS_PREPARATION_AUDIT_WITH_BLOCKERS' if all(c['pass'] for c in checks) else 'FAIL_PREPARATION_AUDIT','date_jst':'2026-10-29','checked_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'production_modified':False,'production_ready':False,'independent_human_acceptance':False,'signed_by':None,'checks':checks,'remaining_gates':[
      {'id':'native_restore','complete':False,'evidence':'docs/native-preflight-20261029.json','blockers':native['native_blockers']},
      {'id':'real_backup_custody_and_restore','complete':False,'evidence':'docs/backup-recovery-plan.json','status':backup['status']},
      {'id':'ownership_MFA_backup_admin_external_contracts','complete':False},
      {'id':'retention_anonymization_and_withdrawal_operations','complete':False},
      {'id':'real_device_notifications_Deno_and_native_concurrency','complete':False},
      {'id':'scoped_production_approval','complete':False},
      {'id':'independent_third_person_demonstration','complete':False}],
      'limits':['This is an automated source/evidence audit, not a third person acceptance','Local link existence does not verify external URLs, owners, credentials, or permissions','No real personal-data export, production change, message delivery or paid resource']}
    REPORT.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'status':result['status'],'checks':len(checks),'production_ready':False}));return 0 if all(c['pass'] for c in checks) else 1

if __name__=='__main__':raise SystemExit(main())
