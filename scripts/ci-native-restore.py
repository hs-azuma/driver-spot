"""Fresh public CI only. Creates an internal-network synthetic Supabase, then destroys only that fixture."""
import datetime,hashlib,json,os,re,secrets,subprocess,tempfile,time,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
PROJECT='spodora-v4-native-ci';NETWORK='spodora-v4-native-ci-internal';CONTAINER='supabase_db_'+PROJECT
REPORT=ROOT/'docs/native-ci-20261029/result.json'
report={'status':'FAIL','production_access':False,'real_data_used':False,'started_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'checks':[],'limitations':['Database dump restored to a second database; global roles and service configs not independently restored','Storage API bytes tested, but object volume not independently restored from a storage backup','Native API tests do not deploy Edge Functions or send email/LINE','Ephemeral synthetic fixtures only; not a production backup']}
cli=['node',str(ROOT/'tools/native-runner/node_modules/supabase/dist/supabase.js')];stage='guard';work=None;network=False;started=False

def run(args,input=None,timeout=90,check=True,env=None):
    r=subprocess.run(args,input=input,capture_output=True,timeout=timeout,cwd=ROOT,env=env)
    if check and r.returncode:raise RuntimeError('command_failed_exit_'+str(r.returncode))
    return r.stdout

def check(name,ok):
    if not ok:raise RuntimeError(name)
    report['checks'].append(name)

def sql(text,db='postgres'):
    return run(['docker','exec','-i',CONTAINER,'psql','-X','-U','postgres','-d',db,'-At','-v','ON_ERROR_STOP=1'],text.encode()).decode().strip()

def apply(path):
    text=(ROOT/path).read_text();assert text.endswith('ROLLBACK;\n')
    # Fresh local fixture ONLY. No arbitrary DB URL, SQL path or production target is accepted.
    sql("SET spodora.local_restore_review='yes';\n"+text[:-len('ROLLBACK;\n')]+"COMMIT;\n")

try:
    assert os.environ.get('GITHUB_ACTIONS')=='true'
    assert os.environ.get('GITHUB_REPOSITORY')=='hs-azuma/driver-spot'
    assert os.environ.get('GITHUB_REF')=='refs/heads/ci/v4-native-validation-20261029'
    for name in ['SUPABASE_ACCESS_TOKEN','SUPABASE_SERVICE_ROLE_KEY','RESEND_API_KEY','LINE_CHANNEL_ACCESS_TOKEN']:
        assert not os.environ.get(name),'Production secret environment forbidden'
    stage='public_repository_guard'
    metadata=json.load(urllib.request.urlopen('https://api.github.com/repos/hs-azuma/driver-spot',timeout=20));assert metadata['private'] is False
    report['source_commit']=os.environ['GITHUB_SHA'];report['runner']='standard ubuntu-24.04';report['cli_version']=run(cli+['--version']).decode().strip();assert report['cli_version']=='2.122.0'
    for command in ['init','start','status','stop']:run(cli+[command,'--help'])
    stage='initialize_fixture';work=Path(tempfile.mkdtemp(prefix='spodora-native-ci-'));env=os.environ.copy();env['SUPABASE_HOME']=str(work/'state')
    run(cli+['init','--workdir',str(work),'--yes'],env=env)
    config=work/'supabase/config.toml';text=config.read_text();text=re.sub(r'^project_id\s*=.*$', 'project_id = "'+PROJECT+'"',text,flags=re.M)
    for section in ['analytics','studio','realtime','edge_runtime','storage.vector','experimental.pgdelta']:
        pattern=r'(\['+re.escape(section)+r'\][\s\S]*?\benabled\s*=\s*)true';text=re.sub(pattern,r'\g<1>false',text,count=1)
    config.write_text(text)
    stage='isolated_network';run(['docker','network','create','--internal','-o','com.docker.network.bridge.host_binding_ipv4=127.0.0.1',NETWORK]);network=True
    check('Docker network has no external routing',run(['docker','network','inspect','--format','{{.Internal}}',NETWORK]).strip()==b'true')
    stage='start_supabase';started=True
    run(cli+['start','--workdir',str(work),'--network-id',NETWORK,'--exclude','studio,postgres-meta,realtime,imgproxy,edge-runtime,logflare,vector,supavisor'],timeout=720,env=env)
    status=json.loads(run(cli+['status','--workdir',str(work),'--output','json'],env=env))
    api=status.get('API_URL') or status.get('api_url');anon=status.get('ANON_KEY') or status.get('anon_key');service=status.get('SERVICE_ROLE_KEY') or status.get('service_role_key')
    assert api and anon and service
    assert re.match(r'^http://(?:127\.0\.0\.1|localhost):\d+/?$',api)
    report['postgres_version']=sql('SHOW server_version;');check('Native PostgreSQL major 17',report['postgres_version'].startswith('17.'))
    stage='application_ddl';check('Fresh target has no application tables',sql("SELECT to_regclass('public.applications') IS NULL;")=='t')
    apply('docs/database/restore-candidate/application-review.sql')
    check('22 application tables built',sql("SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';")=='22')
    for path in ['job-insert-hardening','application-delete-guard','legacy-and-rounding-access','application-entry-access','withdrawal-retention','overnight-overlap']:apply('sql/review-v4-'+path+'.sql')
    report['checks'].append('All six local hardening proposals applied on native PG17')
    # No worker or external cron is installed; API keys never leave the in-memory controller.
    run(['docker','exec',CONTAINER,'psql','-X','-U','postgres','-d','postgres','-c',"NOTIFY pgrst, 'reload schema';"])
    time.sleep(2)
    stage='native_auth';context={'url':api,'anon':anon,'service':service,'phase':'users'}
    users=json.loads(run(['node','tools/native-runner/native-api.mjs'],json.dumps(context).encode(),timeout=90));assert not users.get('error');report['checks']+=users['checks'];context['users']=users['users']
    for u in users['users'].values():assert re.fullmatch('[0-9a-f-]{36}',u['id'])
    uid=users['users']['company']['id']
    context['company_id']=int(sql("INSERT INTO public.companies(company_name,user_id,email) VALUES('Synthetic native company','"+uid+"','v4-company@example.invalid') RETURNING id;").splitlines()[0])
    sql("CREATE POLICY v4_lab_storage_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='v4-synthetic'); CREATE POLICY v4_lab_storage_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='v4-synthetic' AND owner_id=auth.uid()::text);")
    stage='native_api_rls_storage';context['phase']='verify';verified=json.loads(run(['node','tools/native-runner/native-api.mjs'],json.dumps(context).encode(),timeout=120));report['checks']+=verified['checks'];assert not verified.get('error')
    stage='encrypted_database_restore';dump=run(['docker','exec',CONTAINER,'pg_dump','-U','postgres','-Fc','--no-owner','postgres'],timeout=180)
    restored=run(['node','tools/native-runner/roundtrip.mjs'],dump,timeout=90);check('Native pg_dump encrypted, decrypted, wrong-key and tamper checked',restored==dump)
    run(['docker','exec',CONTAINER,'createdb','-U','postgres','v4_fixture_restore'])
    run(['docker','exec','-i',CONTAINER,'pg_restore','-U','postgres','--no-owner','--clean','--if-exists','--single-transaction','--exit-on-error','-d','v4_fixture_restore'],restored,timeout=180)
    catalog=(ROOT/'docs/database/read-catalog.sql').read_text();before=json.loads(sql(catalog));after=json.loads(sql(catalog,'v4_fixture_restore'));normalize=lambda d:{k:sorted(json.dumps(row,sort_keys=True) for row in (v or [])) for k,v in d.items()};check('Restored application catalog equals source',normalize(before)==normalize(after))
    counts="SELECT json_build_object('auth',(SELECT count(*) FROM auth.users),'drivers',(SELECT count(*) FROM public.drivers),'companies',(SELECT count(*) FROM public.companies),'jobs',(SELECT count(*) FROM public.jobs),'applications',(SELECT count(*) FROM public.applications),'storage',(SELECT count(*) FROM storage.objects));"
    check('Auth and application and Storage metadata rows restored',json.loads(sql(counts))==json.loads(sql(counts,'v4_fixture_restore')))
    report['dump_bytes']=len(dump);report['dump_sha256']=hashlib.sha256(dump).hexdigest();report['status']='PASS_NATIVE_SUPABASE_SYNTHETIC_DB_RESTORE';report['native_auth_storage_api_tested']=True
except Exception as error:
    report['failed_stage']=stage;report['error_type']=type(error).__name__;report['error']=str(error)[:180]
finally:
    if started and work:
        try:run(cli+['stop','--workdir',str(work),'--project-id',PROJECT,'--no-backup'],timeout=120,env=env)
        except Exception:report['cleanup_failed']=True
    if network:run(['docker','network','rm',NETWORK],check=False)
    report['completed_at']=datetime.datetime.now(datetime.timezone.utc).isoformat();REPORT.parent.mkdir(parents=True,exist_ok=True);REPORT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'],'a') as f:f.write('```json\n'+json.dumps(report,ensure_ascii=False,indent=2)+'\n```\n')
    print('SPODORA_NATIVE_RESULT '+json.dumps(report,ensure_ascii=False))
raise SystemExit(0 if report['status'].startswith('PASS_') else 1)
