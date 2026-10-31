"""Fresh public CI only. Creates a dedicated synthetic native Supabase, then stops only that fixture."""
import base64,datetime,hashlib,json,os,re,secrets,shutil,subprocess,tempfile,time,urllib.request,urllib.parse
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
PROJECT='spodora-v4-native-ci';pg_bin=None;pg_port=None;pg_env=None
REPORT=ROOT/'docs/native-ci-20261029/result.json'
report={'status':'FAIL','production_access':False,'real_data_used':False,'started_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'checks':[],'limitations':['Independent cluster on the same runner; platform-managed global roles are bootstrapped, not a production global-role export','Storage restored to a separate cluster and state; separate host, arbitrary settings and original object UUID restore remain untested','Native API tests do not deploy Edge Functions or send email/LINE','Native processes share the isolated runner host; there is no container egress network guard','Ephemeral synthetic fixtures only; not a production backup']}
cli=['node',str(ROOT/'tools/native-runner/node_modules/supabase/dist/supabase.js')];stage='guard';work=None;started=False

def run(args,input=None,timeout=90,check=True,env=None):
    r=subprocess.run(args,input=input,capture_output=True,timeout=timeout,cwd=ROOT,env=env)
    if check and r.returncode:
        lines=[]
        for line in re.sub(r'\x1b\[[0-9;]*m','',r.stderr.decode(errors='replace')).splitlines():
            if re.search(r'error|failed|unhealthy|timeout|fatal',line,re.I) and not re.search(r'secret|token|jwt|key|password|postgres://',line,re.I):lines.append(line[:200])
        raise RuntimeError('command_failed_exit_'+str(r.returncode)+'; '+' | '.join(lines[-4:]))
    return r.stdout

def check(name,ok):
    if not ok:raise RuntimeError(name)
    report['checks'].append(name)

def pgtool(name,args,input=None,timeout=90,admin=False):
    assert pg_bin and pg_port and pg_env
    return run([str(pg_bin/name),'-h','127.0.0.1','-p',str(pg_port),'-U','supabase_admin' if admin else 'postgres',*args],input=input,timeout=timeout,env=pg_env)

def sql(text,db='postgres'):
    return pgtool('psql',['-X','-d',db,'-At','-v','ON_ERROR_STOP=1'],text.encode()).decode().strip()

def apply(path):
    text=(ROOT/path).read_text();assert text.endswith('ROLLBACK;\n')
    # Fresh local fixture ONLY. No arbitrary DB URL, SQL path or production target is accepted.
    sql("SET spodora.local_restore_review='yes';\n"+text[:-len('ROLLBACK;\n')]+"COMMIT;\n")

try:
    assert os.environ.get('GITHUB_ACTIONS')=='true'
    assert os.environ.get('GITHUB_REPOSITORY')=='hs-azuma/driver-spot'
    assert os.environ.get('GITHUB_REF')=='refs/heads/ci/v4-native-validation-20261029'
    assert os.geteuid()!=0,'Native PostgreSQL needs the standard non-root runner user'
    for name in ['SUPABASE_ACCESS_TOKEN','SUPABASE_SERVICE_ROLE_KEY','RESEND_API_KEY','LINE_CHANNEL_ACCESS_TOKEN']:
        assert not os.environ.get(name),'Production secret environment forbidden'
    stage='public_repository_guard'
    metadata=json.load(urllib.request.urlopen('https://api.github.com/repos/hs-azuma/driver-spot',timeout=20));assert metadata['private'] is False
    report['source_commit']=os.environ['GITHUB_SHA'];report['runner']='standard ubuntu-24.04';report['cli_version']=run(cli+['--version']).decode().strip();assert report['cli_version']=='2.122.0'
    for command in ['init','start','status','stop']:run(cli+[command,'--help'])
    report['source_sha256']={p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in ['scripts/ci-native-restore.py','tools/native-runner/native-api.mjs','tools/native-runner/roundtrip.mjs','tools/native-runner/storage-roundtrip.mjs','tools/native-runner/independent-api.mjs','tools/native-runner/reset-fixture-default-acl.sql','tools/restore-lab/backup-envelope.mjs','tools/native-runner/package-lock.json','docs/database/restore-candidate/application-review.sql',*sorted(str(p.relative_to(ROOT)) for p in (ROOT/'sql').glob('review-v4-*.sql'))]}
    stage='initialize_fixture';work=Path(tempfile.mkdtemp(prefix='spodora-native-ci-'));env=os.environ.copy();env['SUPABASE_HOME']=str(work/'state');env['SUPABASE_EXPERIMENTAL_STACK']='1'
    run(cli+['stack','start','--help'],env=env);run(cli+['stack','status','--help'],env=env);run(cli+['stack','stop','--help'],env=env)
    run(cli+['init','--workdir',str(work),'--yes'],env=env)
    config=work/'supabase/config.toml'
    config.write_text('project_id = "'+PROJECT+'"\n[api]\nenabled=true\n[db]\nmajor_version=17\n[auth]\nenabled=true\n[storage]\nenabled=true\n[experimental]\nstack=true\n')
    stage='start_supabase_native';started=True
    run(cli+['stack','start','--workdir',str(work),'--runtime','native','--eager','--exclude','functions,studio,mail,analytics,pooler,realtime','--output-format','json'],timeout=720,env=env)
    status=json.loads(run(cli+['stack','status','--workdir',str(work),'--output-format','json'],env=env))
    values=status.get('env',status);api=values.get('API_URL');anon=values.get('ANON_KEY');service=values.get('SERVICE_ROLE_KEY');db_url=values.get('DB_URL')
    assert api and anon and service and db_url
    assert re.match(r'^http://(?:127\.0\.0\.1|localhost):\d+/?$',api)
    parsed=urllib.parse.urlsplit(db_url);assert parsed.hostname in ('127.0.0.1','localhost') and parsed.username=='postgres' and parsed.path=='/postgres'
    pg_port=parsed.port;pg_env=env.copy();pg_env['PGPASSWORD']=urllib.parse.unquote(parsed.password or '')
    stage='discover_pg_tools'
    candidates=list((work/'state').rglob('pg_dump'))+[p for p in Path('/usr/lib/postgresql').glob('*/bin/pg_dump')]
    for path in candidates:
        if not all(path.with_name(n).is_file() for n in ['psql','pg_dump','pg_restore','createdb']):continue
        version=run([str(path),'--version']).decode()
        match=re.search(r'PostgreSQL\) (\d+)',version)
        if match and int(match.group(1))>=17:pg_bin=path.parent;break
    assert pg_bin,'No PostgreSQL 17+ dump/restore tools available'
    report['runtime']='official native processes';report['isolation']='Fresh runner and dedicated SUPABASE_HOME; API/DB URLs verified loopback; synthetic users only'
    check('Native API and PostgreSQL target loopback addresses only',True)
    report['postgres_version']=sql('SHOW server_version;');check('Native PostgreSQL major 17',report['postgres_version'].startswith('17.'))
    stage='fixture_migration_role'
    report['fixture_roles']=json.loads(sql("SELECT json_agg(json_build_object('role',rolname,'superuser',rolsuper,'member',pg_has_role(current_user,oid,'MEMBER'))) FROM pg_roles WHERE rolname IN ('postgres','supabase_admin','supabase_auth_admin');"))
    # Native service bootstrap owns auth.users with a service role. A fresh local-only
    # migration role needs membership to install the captured Auth triggers.
    admin_prefix=[str(pg_bin/'psql'),'-h','127.0.0.1','-p',str(pg_port),'-U','supabase_admin','-X','-d','postgres','-At','-v','ON_ERROR_STOP=1']
    run(admin_prefix,input=b'GRANT supabase_auth_admin TO postgres;',env=pg_env)
    check('Fresh fixture grants Auth ownership role to migration role only',True)
    stage='application_ddl';check('Fresh target has no application tables',sql("SELECT to_regclass('public.applications') IS NULL;")=='t')
    apply('docs/database/restore-candidate/application-review.sql')
    check('22 application tables built',sql("SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';")=='22')
    for path in ['job-insert-hardening','application-delete-guard','legacy-and-rounding-access','application-entry-access','withdrawal-retention','overnight-overlap']:apply('sql/review-v4-'+path+'.sql')
    report['checks'].append('All six local hardening proposals applied on native PG17')
    # No worker or external cron is installed; API keys never leave the in-memory controller.
    sql("NOTIFY pgrst, 'reload schema';")
    time.sleep(2)
    stage='native_auth';context={'url':api,'anon':anon,'service':service,'phase':'users'}
    users=json.loads(run(['node','tools/native-runner/native-api.mjs'],json.dumps(context).encode(),timeout=90,check=False));report['checks']+=users['checks'];assert not users.get('error'),users.get('error');context['users']=users['users']
    for u in users['users'].values():assert re.fullmatch('[0-9a-f-]{36}',u['id'])
    uid=users['users']['company']['id']
    context['company_id']=int(sql("INSERT INTO public.companies(company_name,user_id,email) VALUES('Synthetic native company','"+uid+"','v4-company@example.invalid') RETURNING id;").splitlines()[0])
    sql("CREATE POLICY v4_lab_storage_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id IN ('v4-synthetic','v4-restored')); CREATE POLICY v4_lab_storage_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id IN ('v4-synthetic','v4-restored') AND owner_id=auth.uid()::text);")
    stage='native_api_rls_storage';context['phase']='verify';verified=json.loads(run(['node','tools/native-runner/native-api.mjs'],json.dumps(context).encode(),timeout=120,check=False));report['checks']+=verified['checks'];assert not verified.get('error'),verified.get('error');report['storage_restore']=verified['storage_restore']
    stage='encrypted_database_restore';dump=pgtool('pg_dump',['-Fc','postgres'],timeout=180,admin=True)
    restored=run(['node','tools/native-runner/roundtrip.mjs'],dump,timeout=90);check('Native pg_dump encrypted, decrypted, wrong-key and tamper checked',restored==dump)
    pgtool('createdb',['v4_fixture_restore'],admin=True)
    pgtool('pg_restore',['--clean','--if-exists','--single-transaction','--exit-on-error','-d','v4_fixture_restore'],restored,timeout=180,admin=True)
    catalog=(ROOT/'docs/database/read-catalog.sql').read_text();before=json.loads(sql(catalog));after=json.loads(sql(catalog,'v4_fixture_restore'));normalize=lambda d:{k:sorted(json.dumps(row,sort_keys=True) for row in (v or [])) for k,v in d.items()};check('Restored application catalog equals source',normalize(before)==normalize(after))
    counts="SELECT json_build_object('auth',(SELECT count(*) FROM auth.users),'drivers',(SELECT count(*) FROM public.drivers),'companies',(SELECT count(*) FROM public.companies),'jobs',(SELECT count(*) FROM public.jobs),'applications',(SELECT count(*) FROM public.applications),'storage',(SELECT count(*) FROM storage.objects));"
    check('Auth and application and Storage metadata rows restored',json.loads(sql(counts))==json.loads(sql(counts,'v4_fixture_restore')))
    stage='independent_backup'
    portable=pgtool('pg_dump',['-Fc','--exclude-table-data=storage.objects','postgres'],timeout=180,admin=True)
    portable=run(['node','tools/native-runner/roundtrip.mjs'],portable,timeout=90)
    source_catalog=before;source_counts=json.loads(sql(counts));source_work=work;source_env=env
    # Hash every application row plus Auth users/identities. Values never enter public logs.
    def row_fingerprint():
        tables=json.loads(sql("SELECT json_agg(tablename ORDER BY tablename) FROM pg_tables WHERE schemaname='public';"))
        result={}
        for name in tables:
            assert re.fullmatch('[a-z_]+',name)
            rows=json.loads(sql("SELECT coalesce(json_agg(row_to_json(t)),'[]'::json) FROM public."+name+" t;"))
            result['public.'+name]=hashlib.sha256(json.dumps(sorted(json.dumps(r,sort_keys=True) for r in rows)).encode()).hexdigest()
        for name in ['users','identities']:
            rows=json.loads(sql("SELECT coalesce(json_agg(row_to_json(t)),'[]'::json) FROM auth."+name+" t;"))
            result['auth.'+name]=hashlib.sha256(json.dumps(sorted(json.dumps(r,sort_keys=True) for r in rows)).encode()).hexdigest()
        return result
    source_rows=row_fingerprint()
    source_sequences=json.loads(sql("SELECT json_agg(json_build_object('name',sequencename,'value',last_value) ORDER BY sequencename) FROM pg_sequences WHERE schemaname='public';"))
    source_id=run(admin_prefix,input=b'SELECT system_identifier FROM pg_control_system();',env=pg_env).decode().strip()
    run(cli+['stack','stop','--workdir',str(work)],timeout=120,env=env);started=False
    check('Source stack stopped before independent restore',True)
    stage='independent_initialize';work=Path(tempfile.mkdtemp(prefix='spodora-independent-ci-'));env=os.environ.copy();env['SUPABASE_HOME']=str(work/'state');env['SUPABASE_EXPERIMENTAL_STACK']='1'
    run(cli+['init','--workdir',str(work),'--yes'],env=env)
    (work/'supabase/config.toml').write_text(config.read_text().replace(PROJECT,'spodora-v4-independent-ci'))
    started=True
    run(cli+['stack','start','--workdir',str(work),'--runtime','native','--eager','--exclude','rest,auth,storage,functions,studio,mail,analytics,pooler,realtime','--output-format','json'],timeout=720,env=env)
    target_status=json.loads(run(cli+['stack','status','--workdir',str(work),'--output-format','json'],env=env));target_values=target_status.get('env',target_status)
    parsed=urllib.parse.urlsplit(target_values['DB_URL']);assert parsed.hostname in ('127.0.0.1','localhost') and parsed.username=='postgres' and parsed.path=='/postgres'
    pg_port=parsed.port;pg_env=env.copy();pg_env['PGPASSWORD']=urllib.parse.unquote(parsed.password or '')
    check('Independent target starts without application data',sql("SELECT to_regclass('public.applications') IS NULL;")=='t')
    target_admin=[str(pg_bin/'psql'),'-h','127.0.0.1','-p',str(pg_port),'-U','supabase_admin','-X','-d','postgres','-At','-v','ON_ERROR_STOP=1']
    target_id=run(target_admin,input=b'SELECT system_identifier FROM pg_control_system();',env=pg_env).decode().strip()
    check('Independent PostgreSQL cluster identifier differs',source_id!=target_id)
    run(target_admin,input=b'GRANT supabase_auth_admin TO postgres;',env=pg_env)
    stage='independent_pg_restore'
    run(target_admin,input=(ROOT/'tools/native-runner/reset-fixture-default-acl.sql').read_bytes(),env=pg_env)
    check('Fresh target creator default ACLs neutralized before restore',True)
    pgtool('pg_restore',['--clean','--if-exists','--single-transaction','--exit-on-error','-d','postgres'],portable,timeout=180,admin=True)
    target_catalog=json.loads(sql(catalog));sc=normalize(source_catalog);tc=normalize(target_catalog)
    if sc!=tc:report['independent_catalog_diff']={k:{'source_only':sorted(set(sc[k])-set(tc[k]))[:3],'target_only':sorted(set(tc[k])-set(sc[k]))[:3]} for k in sc if sc[k]!=tc[k]}
    check('Independent application catalog restored',sc==tc)
    check('Independent all application rows and Auth hashes match',source_rows==row_fingerprint())
    check('Independent identity sequence values restored',source_sequences==json.loads(sql("SELECT json_agg(json_build_object('name',sequencename,'value',last_value) ORDER BY sequencename) FROM pg_sequences WHERE schemaname='public';")))
    check('Independent object metadata absent before file restore',sql('SELECT count(*) FROM storage.objects;')=='0')
    run(cli+['stack','stop','--workdir',str(work)],timeout=120,env=env)
    run(cli+['stack','start','--workdir',str(work),'--runtime','native','--eager','--exclude','functions,studio,mail,analytics,pooler,realtime','--output-format','json'],timeout=720,env=env)
    target_status=json.loads(run(cli+['stack','status','--workdir',str(work),'--output-format','json'],env=env));target_values=target_status.get('env',target_status)
    assert re.match(r'^http://(?:127\.0\.0\.1|localhost):\d+/?$',target_values['API_URL'])
    stage='independent_auth_storage'
    payload={'url':target_values['API_URL'],'anon':target_values['ANON_KEY'],'service':target_values['SERVICE_ROLE_KEY'],'users':context['users'],'company_id':context['company_id'],'transfer':verified['storage_transfer']}
    independent=json.loads(run(['node','tools/native-runner/independent-api.mjs'],json.dumps(payload).encode(),timeout=180,check=False));report['checks']+=independent['checks'];assert not independent.get('error'),independent.get('error')
    report['independent_cluster_restore']={'status':independent['status'],'source_stopped':True,'separate_state':work!=source_work,'cluster_identifier_differs':source_id!=target_id,'public_and_auth_row_hashes_equal':True,'sequence_values_equal':True,'storage_files':3,'original_object_uuids_preserved':False,'same_runner_host':True}
    report['dump_bytes']=len(dump);report['dump_sha256']=hashlib.sha256(dump).hexdigest();report['status']='PASS_NATIVE_SUPABASE_SYNTHETIC_DB_RESTORE';report['native_auth_storage_api_tested']=True
except Exception as error:
    report['failed_stage']=stage;report['error_type']=type(error).__name__;report['error']=str(error)[:900]
finally:
    if started and work:
        try:run(cli+['stack','stop','--workdir',str(work)],timeout=120,env=env)
        except Exception:report['cleanup_failed']=True
    report['completed_at']=datetime.datetime.now(datetime.timezone.utc).isoformat();REPORT.parent.mkdir(parents=True,exist_ok=True);REPORT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'],'a') as f:f.write('```json\n'+json.dumps(report,ensure_ascii=False,indent=2)+'\n```\n')
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'],'a') as f:f.write('report_b64='+base64.b64encode(json.dumps(report).encode()).decode()+'\n')
    print('SPODORA_NATIVE_RESULT '+json.dumps(report,ensure_ascii=False))
raise SystemExit(0 if report['status'].startswith('PASS_') else 1)
