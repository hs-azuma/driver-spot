"""Immediate stop and WAL recovery of exactly the controller's disposable cluster."""
from pathlib import Path
import subprocess,time

def run_check(sql,run,cli,work,env,pg_bin,port,pg_env,context,check):
    company=int(context['company_id']);uid=context['users']['other']['id'];driver=int(sql("SELECT id FROM public.drivers WHERE user_id='"+uid+"';"))
    admin=[str(pg_bin/'psql'),'-X','-qAt','-h','127.0.0.1','-p',str(port),'-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1']
    datadir=Path(run(admin,input=b'SHOW data_directory;',env=pg_env).decode().strip()).resolve()
    assert datadir.is_dir() and datadir.is_relative_to(work.resolve()),'Only this fresh fixture data directory is allowed'
    run([str(pg_bin/'pg_ctl'),'--help'])
    def job(date,label):return int(sql("INSERT INTO public.jobs(company_id,work_date,location,job_description,start_time,end_time,pay_guarantee) VALUES("+str(company)+",'"+date+"','Synthetic crash site','"+label+"','09:00','17:00',true) RETURNING id;").splitlines()[0])
    committed=job('2102-01-01','synthetic-crash-committed');pending=job('2102-01-02','synthetic-crash-uncommitted')
    before=sql('SELECT pg_postmaster_start_time()::text;');current=pg_env.copy();current['PGAPPNAME']='v4-crash-open-transaction'
    text="BEGIN;SET LOCAL ROLE authenticated;SELECT set_config('request.jwt.claim.sub','"+uid+"',true);INSERT INTO public.applications(job_id,driver_id,status) VALUES("+str(pending)+','+str(driver)+",'応募中');SELECT pg_sleep(120);COMMIT;"
    p=subprocess.Popen([str(pg_bin/'psql'),'-X','-qAt','-h','127.0.0.1','-p',str(port),'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-c',text],stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=current)
    for _ in range(120):
        if sql("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='v4-crash-open-transaction' AND wait_event='PgSleep');")=='t':break
        time.sleep(.025)
    else: p.terminate();p.communicate(timeout=5);raise RuntimeError('Crash fixture barrier not reached')
    try:
        run([str(pg_bin/'pg_ctl'),'-D',str(datadir),'-m','immediate','-t','20','-w','stop'],timeout=30,env=pg_env)
        p.communicate(timeout=10);check('Immediate fixture database stop interrupts open transaction',p.returncode!=0)
    finally:
        if p.poll() is None:p.kill();p.communicate(timeout=5)
    run(cli+['stack','stop','--workdir',str(work)],timeout=120,env=env,check=False)
    run(cli+['stack','start','--workdir',str(work),'--runtime','native','--eager','--exclude','functions,studio,mail,analytics,pooler,realtime','--output-format','json'],timeout=720,env=env)
    check('Crash recovery starts a new database process',sql('SELECT pg_postmaster_start_time()::text;')!=before)
    check('Crash recovery preserves committed job',sql('SELECT count(*) FROM public.jobs WHERE id='+str(committed)+';')=='1')
    check('Crash recovery rolls back uncommitted application',sql('SELECT count(*) FROM public.applications WHERE job_id='+str(pending)+';')=='0')
    check('Crash recovery rolls back associated notification',sql('SELECT count(*) FROM public.company_application_email_queue WHERE job_id='+str(pending)+';')=='0')
    return {'status':'PASS_IMMEDIATE_STOP_WAL_RECOVERY','target':'dedicated synthetic data directory only','committed_job_preserved':True,'uncommitted_application_absent':True}
