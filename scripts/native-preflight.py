"""Read-only capability probes. Never starts a service, creates an account or escalates privileges."""
import json,os,platform,shutil,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def assess(system,architecture,glibc,euid,nonroot_available,cli_available,docker_available):
    reasons=[]
    if system!='Linux' or architecture not in ('x86_64','aarch64'):reasons.append('native_platform_not_verified')
    if glibc<(2,35):reasons.append('glibc_below_documented_native_requirement')
    if euid==0 and not nonroot_available:reasons.append('native_postgres_nonroot_execution_unavailable')
    if not cli_available:reasons.append('supabase_cli_missing')
    return {'native_blockers':reasons,'docker_cli_present':docker_available,'status':'BLOCKED_EXECUTION_ENVIRONMENT' if reasons else 'PREFLIGHT_ONLY_NOT_STARTED'}

def main():
    tools={n:bool(shutil.which(n)) for n in ['docker','podman','psql','supabase','tar','unshare']}
    glibc_text=platform.libc_ver()[1]
    try:glibc=tuple(int(v) for v in glibc_text.split('.')[:2])
    except ValueError:glibc=(0,0)
    local_cli=ROOT/'tools/native-runner/node_modules/supabase/dist/supabase.js'
    tools['supabase_cli_local']=local_cli.is_file()
    cli_version=subprocess.check_output(['node',str(local_cli),'--version'],text=True).strip() if local_cli.is_file() else None
    nonroot=os.geteuid()!=0;uid_probe={'attempted':False}
    if not nonroot:
        probe="import os,json;\ntry:\n os.setgid(65534);os.setuid(65534);print(json.dumps({'ok':os.geteuid()!=0}))\nexcept OSError as e:print(json.dumps({'ok':False,'errno':e.errno}))"
        r=subprocess.run([sys.executable,'-c',probe],capture_output=True,text=True,timeout=5)
        uid_probe={'attempted':True,**json.loads(r.stdout)};nonroot=uid_probe['ok']
    ns={'attempted':False}
    if tools['unshare']:
        r=subprocess.run(['unshare','-Ur','true'],capture_output=True,text=True,timeout=5)
        ns={'attempted':True,'success':r.returncode==0,'exit_code':r.returncode}
    try:uid_map=[[int(v) for v in line.split()] for line in Path('/proc/self/uid_map').read_text().splitlines()]
    except OSError:uid_map=None
    result={'uid_map':uid_map,'date_jst':'2026-10-29','production_access':False,'services_started':False,'containers_created':False,'accounts_created':False,'system':platform.system(),'architecture':platform.machine(),'glibc':glibc_text,'effective_uid_is_root':os.geteuid()==0,'tools':tools,'nonroot_probe':uid_probe,'user_namespace_probe':ns,**assess(platform.system(),platform.machine(),glibc,os.geteuid(),nonroot,tools['supabase'] or tools['supabase_cli_local'],tools['docker']),
            'local_cli_version':cli_version,'native_supabase_restore_tested':False,'documentation':['https://supabase.com/docs/guides/local-development/docker-and-native-runtimes','https://supabase.com/docs/guides/local-development/running-multiple-local-projects'],'limits':['Docker absence alone does not rule out the experimental native runtime','The current UID capability probe does not replace testing on another host','CLI is available locally when recorded; service archives are not started on this root-only host']}
    (ROOT/'docs/native-preflight-20261029.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'status':result['status'],'native_blockers':result['native_blockers'],'native_restore_tested':False}));return 2 if result['native_blockers'] else 0

if __name__=='__main__':raise SystemExit(main())
