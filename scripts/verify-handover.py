"""Copy repository source to a clean temporary directory; install cached pinned dependencies offline.
Runs only synthetic/mocked checks. No DB connection, cloud creation, credentials or real backup input.
"""
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time

ROOT=Path(__file__).resolve().parents[1]
REPORT=ROOT/'docs/handover-cleanroom-20261029.json'
OUTPUTS={'docs/handover-cleanroom-20261029.json','docs/database/restore-candidate/lab-result.json'}


def main():
    report={'status':'FAIL','started_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'scope':'clean source copy, cached offline dependencies, synthetic/mocked tests only',
            'production_access':False,'steps':[]}
    report['runtime']={'python':sys.version.split()[0],
                       'native_tools_present':{name:bool(shutil.which(name)) for name in ('docker','psql','supabase')}}
    try:
        report['runtime']['node']=subprocess.check_output(['node','--version'],cwd=ROOT,text=True).strip()
        report['runtime']['npm']=subprocess.check_output(['npm.cmd' if os.name=='nt' else 'npm','--version'],cwd=ROOT,text=True,stderr=subprocess.DEVNULL).strip()
        if report['runtime']['node']!='v'+(ROOT/'.nvmrc').read_text().strip() or sys.version_info[:2]!=(3,12):
            raise RuntimeError('pinned_runtime_mismatch')
        paths=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z'],cwd=ROOT).decode().split('\0')
        paths=sorted(set(p for p in paths if p and p not in OUTPUTS and not p.startswith('docs/browser-lab-20261029/')))
        fingerprint=hashlib.sha256()
        with tempfile.TemporaryDirectory(prefix='spodora-handover-') as tmp:
            target=Path(tmp)/'source'
            target.mkdir()
            for relative in paths:
                path=Path(relative)
                if path.is_absolute() or '..' in path.parts or 'node_modules' in path.parts or '.git' in path.parts or (path.name.startswith('.env') and path.name!='.env.example'):
                    raise RuntimeError('unsafe_source_path_refused')
                source=ROOT/path
                if source.is_symlink() or not source.is_file():raise RuntimeError('non_regular_source_file_refused')
                destination=target/path
                destination.parent.mkdir(parents=True,exist_ok=True)
                shutil.copy2(source,destination)
                fingerprint.update(relative.encode()+b'\0'+hashlib.sha256(source.read_bytes()).digest())
            report['source_files']=len(paths)
            report['source_sha256']=fingerprint.hexdigest()
            report['base_commit']=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
            report['includes_working_tree']=True
            report['git_directory_copied']=False
            report['existing_node_modules_copied']=False
            npm='npm.cmd' if os.name=='nt' else 'npm'
            commands=[('install_pinned_offline',[npm,'ci','--prefix','tools/restore-lab','--ignore-scripts','--offline','--no-audit','--no-fund']),
                      ('install_browser_pinned_offline',[npm,'ci','--prefix','tools/browser-lab','--ignore-scripts','--offline','--no-audit','--no-fund']),
                      ('offline_regression',[npm,'test']),('synthetic_db_encryption_restore',[npm,'--prefix','tools/restore-lab','test']),
                      ('chromium_synthetic_ui',[npm,'--prefix','tools/browser-lab','test'])]
            for name,command in commands:
                started=time.monotonic()
                result=subprocess.run(command,cwd=target,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=300)
                step={'name':name,'command':command,'exit_code':result.returncode,'seconds':round(time.monotonic()-started,3),
                      'output_sha256':hashlib.sha256(result.stdout.encode()).hexdigest()}
                report['steps'].append(step)
                if result.returncode:
                    step['failure_excerpt']=result.stdout[-3000:]
                    raise RuntimeError('cleanroom_step_failed:'+name)
                if name=='offline_regression':
                    counts=re.findall(r'(?m)^ℹ tests (\d+)',result.stdout)
                    if counts:step['node_tests']=int(counts[-1])
                    step['python_suites']=[int(n) for n in re.findall(r'Ran (\d+) tests',result.stdout)]
                print('PASS: '+name,flush=True)
            lab=json.loads((target/'docs/database/restore-candidate/lab-result.json').read_text())
            if not lab['status'].startswith('PASS_') or not lab.get('encrypted_synthetic_backup',{}).get('restored_after_decryption'):
                raise RuntimeError('missing_encrypted_restore_evidence')
            report['lab']={'status':lab['status'],'checks':len(lab['checks']),
                           'encrypted_fixture_restored':True,'real_data_used':False,
                           'known_findings':len(lab['known_findings'])}
            browser=json.loads((target/'docs/browser-lab-20261029/result.json').read_text())
            if browser['status']!='PASS_CHROMIUM_SYNTHETIC_UI_ONLY' or any(t['status']!='PASS' for t in browser['tests']):
                raise RuntimeError('missing_browser_evidence')
            report['browser']={'status':browser['status'],'checks':len(browser['tests']),
                               'version':browser['browser'],'real_sdk':False,'production_access':False}
            report['status']='PASS_SOURCE_REPRODUCTION_ONLY'
    except (subprocess.SubprocessError,OSError,ValueError,KeyError,RuntimeError) as error:
        report['error']=str(error)
    report['completed_at']=datetime.datetime.now(datetime.timezone.utc).isoformat()
    report['limitations']=['Existing npm cache was used; fresh offline machines need a pre-populated cache',
                          'Not an independent human handover or native Supabase/Auth/Storage restore',
                          'No real backup, keys, external storage or external delivery tested',
                          'Browser lab uses Linux x64 Chromium and a synthetic SDK, not real device or native Auth integration']
    REPORT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'status':report['status'],'lab_checks':report.get('lab',{}).get('checks')}))
    return 0 if report['status'].startswith('PASS_') else 1


if __name__=='__main__':raise SystemExit(main())
