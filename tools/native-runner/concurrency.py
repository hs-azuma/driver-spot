"""Multiple actual psql connections to the controller's fresh loopback fixture only. No provider calls."""
import json,os,subprocess,time

def run_checks(sql,pg_bin,port,env,check,apply,context):
    company=int(context['company_id']);company_uid=context['users']['company']['id'];driver_uid=context['users']['driver']['id'];other_uid=context['users']['other']['id']
    driver=int(sql("SELECT id FROM public.drivers WHERE user_id='"+driver_uid+"';"));other=int(sql("SELECT id FROM public.drivers WHERE user_id='"+other_uid+"';"))
    def job(day,start='09:00',end='17:00',capacity=1):
        return int(sql("INSERT INTO public.jobs(company_id,work_date,location,start_time,end_time,pay_guarantee,required_headcount) VALUES("+str(company)+",'"+day+"','Synthetic concurrency site','"+start+"','"+end+"',true,"+str(capacity)+") RETURNING id;").splitlines()[0])
    def begin(uid):return "BEGIN;SET LOCAL statement_timeout='10s';SET LOCAL lock_timeout='6s';SET LOCAL ROLE authenticated;SELECT set_config('request.jwt.claim.sub','"+uid+"',true);"
    def spawn(body,label):
        current=env.copy();current['PGAPPNAME']=label
        return subprocess.Popen([str(pg_bin/'psql'),'-X','-qAt','-h','127.0.0.1','-p',str(port),'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-c',body],stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=current)
    def wait_sleep(label):
        for _ in range(120):
            if sql("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='"+label+"' AND wait_event='PgSleep');")=='t':return
            time.sleep(.025)
        raise RuntimeError('Fixture barrier not reached: '+label)
    def finish(p):
        out,err=p.communicate(timeout=15);return {'ok':p.returncode==0,'out':out.decode(),'error':err.decode()}
    def pair(first,second,label):
        a=spawn(first+'SELECT pg_sleep(1);COMMIT;',label);wait_sleep(label);b=spawn(second+'COMMIT;',label+'-second');return finish(a),finish(b)
    def insert(j,d):return 'INSERT INTO public.applications(job_id,driver_id,status) VALUES('+str(j)+','+str(d)+",'応募中');"
    def app(j,d,uid):
        r=finish(spawn(begin(uid)+insert(j,d)+'COMMIT;','v4-app-seed'));assert r['ok'],'seed application failed'
        return int(sql('SELECT id FROM public.applications WHERE job_id='+str(j)+' AND driver_id='+str(d)+';'))
    def outcome(name,a,b):check(name,a['ok'] and not b['ok'])
    # Same driver, distinct jobs that overlap across midnight.
    j1=job('2100-01-01','22:00','02:00');j2=job('2100-01-02','01:00','03:00')
    a,b=pair(begin(other_uid)+insert(j1,other),begin(other_uid)+insert(j2,other),'v4-overlap')
    outcome('Native overlapping overnight applications serialize and second refuses',a,b)
    check('Native overlap race leaves exactly one application',sql('SELECT count(*) FROM public.applications WHERE job_id IN ('+str(j1)+','+str(j2)+');')=='1')
    dup=job('2100-01-04');a,b=pair(begin(other_uid)+insert(dup,other),begin(other_uid)+insert(dup,other),'v4-duplicate');outcome('Native duplicate concurrent application refuses second insert',a,b)
    # A client killed before COMMIT rolls back, then a new connection can retry.
    broken=job('2100-01-06');p=spawn(begin(other_uid)+insert(broken,other)+'SELECT pg_sleep(20);COMMIT;','v4-disconnect');wait_sleep('v4-disconnect');sql("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name='v4-disconnect';");p.communicate(timeout=5)
    check('Native disconnected transaction leaves no application',sql('SELECT count(*) FROM public.applications WHERE job_id='+str(broken)+';')=='0')
    app(broken,other,other_uid);check('Native retry after disconnect commits once',sql('SELECT count(*) FROM public.applications WHERE job_id='+str(broken)+';')=='1')
    # Reproduce capacity race before installing the local-only review proposal.
    def hire_race(day,label):
        j=job(day);x=app(j,driver,driver_uid);y=app(j,other,other_uid)
        a,b=pair(begin(company_uid)+"UPDATE public.applications SET status='勤務確定' WHERE id="+str(x)+';',begin(company_uid)+"UPDATE public.applications SET status='勤務確定' WHERE id="+str(y)+';',label)
        return j,a,b
    j,a,b=hire_race('2100-01-08','v4-capacity-baseline');check('BASELINE native race reproduces over-hiring without DB guard',a['ok'] and b['ok'] and sql("SELECT count(*) FROM public.applications WHERE job_id="+str(j)+" AND status='勤務確定';")=='2')
    # Return this synthetic fixture to capacity before applying the new trigger.
    sql('UPDATE public.jobs SET required_headcount=2 WHERE id='+str(j)+';')
    apply('sql/review-v4-hiring-capacity.sql')
    j,a,b=hire_race('2100-01-10','v4-capacity-proposal');outcome('PROPOSAL native concurrent hiring refuses capacity overflow',a,b)
    check('PROPOSAL native capacity leaves one confirmed hire',sql("SELECT count(*) FROM public.applications WHERE job_id="+str(j)+" AND status='勤務確定';")=='1')
    limited=finish(spawn("UPDATE public.jobs SET required_headcount=1 WHERE work_date='2100-01-08';",'v4-capacity-reduction'));check('PROPOSAL capacity cannot reduce below existing hires',not limited['ok'])
    # Cancellation locks the job before a new application can inspect its state.
    cancelled=job('2100-01-12');a,b=pair("BEGIN;UPDATE public.jobs SET status='キャンセル' WHERE id="+str(cancelled)+';',begin(other_uid)+insert(cancelled,other),'v4-cancel');outcome('Native job cancellation wins before racing application',a,b)
    # Concurrent QR in/out use the real public SECURITY DEFINER RPC with a driver JWT claim.
    today=sql("SELECT (now() AT TIME ZONE 'Asia/Tokyo')::date;");qjob=job(today);qa=app(qjob,driver,driver_uid);sql("UPDATE public.applications SET status='勤務確定' WHERE id="+str(qa)+';');token=sql('SELECT attendance_token FROM public.companies WHERE id='+str(company)+';')
    def qr(action):return begin(driver_uid)+"SELECT public.punch_company_qr('"+token+"',"+str(qa)+",'"+action+"');"
    def rpc_values(r):return [json.loads(line) for line in r['out'].splitlines() if line.startswith('{')]
    for action in ['in','out']:
        a,b=pair(qr(action),qr(action),'v4-qr-'+action);values=rpc_values(a)+rpc_values(b);check('Native duplicate QR '+action+' records only once',a['ok'] and b['ok'] and len(values)==2 and sorted(v['already_recorded'] for v in values)==[False,True])
        field='checked_in_at' if action=='in' else 'checked_out_at';check('Native QR '+action+' returns identical committed timestamp',values[0][field]==values[1][field])
    check('Native concurrent QR ends in completed state',sql('SELECT status FROM public.applications WHERE id='+str(qa)+';')=='勤務完了')
    # Distinct DB workers claim disjoint queue leases; no HTTP worker is started.
    sql('TRUNCATE public.company_application_email_queue;')
    for day in range(1,13):app(job('2101-01-'+str(day).zfill(2)),other,other_uid)
    worker="BEGIN;SET LOCAL ROLE service_role;SELECT coalesce(json_agg(id),'[]'::json) FROM public.claim_company_application_emails();"
    a,b=pair(worker,worker,'v4-mail-lease');x=next(json.loads(line) for line in a['out'].splitlines() if line.startswith('['));y=next(json.loads(line) for line in b['out'].splitlines() if line.startswith('['));check('Native SKIP LOCKED workers claim disjoint notifications',a['ok'] and b['ok'] and len(x)==10 and len(y)==2 and not set(x)&set(y))
    row=x[0];sql("UPDATE public.company_application_email_queue SET lease_until=now()-interval '1 minute' WHERE id='"+row+"';")
    retry=finish(spawn(worker+'COMMIT;','v4-mail-retry'));ids=next(json.loads(line) for line in retry['out'].splitlines() if line.startswith('['));check('Native expired notification lease retries only expired row',retry['ok'] and ids==[row])
    check('Native retry increments notification attempt count',sql("SELECT attempts FROM public.company_application_email_queue WHERE id='"+row+"';")=='2')
    return {'status':'PASS_NATIVE_MULTI_CONNECTION_SYNTHETIC','baseline_findings':['Concurrent hiring can exceed required_headcount before local guard'],'provider_messages_sent':0,'hardening_applied':'sql/review-v4-hiring-capacity.sql'}
