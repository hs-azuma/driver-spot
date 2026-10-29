import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {payAndQrChecks} from './pay-and-qr-checks.mjs';

export async function edgeStateChecks(ctx) {
  const {db, root, check, one, role, rejects, findings, company, companyUid, driver, driverUid} = ctx;
  await role('postgres');
  await db.exec('SAVEPOINT edge_state_suite');
  const apply = async file => {
    const sql=readFileSync(resolve(root,file),'utf8');assert(sql.endsWith('ROLLBACK;\n'));
    await db.exec(sql.replace(/^BEGIN;$/m,'').slice(0,-'ROLLBACK;\n'.length));
  };
  const insert = (job,status='応募中') => one('INSERT INTO public.applications(job_id,driver_id,status) VALUES($1,$2,$3) RETURNING id',[job.id,driver.id,status]);
  const newJob = async (offset,start,end,status='募集中') => {
    await role('postgres');
    return one("INSERT INTO public.jobs(company_id,work_date,location,start_time,end_time,pay_guarantee,status) VALUES($1,(now() AT TIME ZONE 'Asia/Tokyo')::date+$2::int,'synthetic-edge-site',$3,$4,false,$5) RETURNING id",[company.id,offset,start,end,status]);
  };
  try {
    const first=await newJob(30,'09:00','12:00');
    const overlap=await newJob(30,'10:00','13:00');
    const adjacent=await newJob(30,'12:00','15:00');
    await role('authenticated',driverUid);
    await insert(first);
    await rejects('Overlapping same-day work application rejected',
      'INSERT INTO public.applications(job_id,driver_id) VALUES($1,$2)',[overlap.id,driver.id],
      e=>e.code==='P0001'&&e.message.includes('重複'));
    check('Adjacent same-day application remains possible', Boolean((await insert(adjacent)).id),true);
    const cancelled=await newJob(31,'09:00','12:00','キャンセル');
    const fabricated=await newJob(32,'09:00','12:00');
    await db.exec('SAVEPOINT entry_probe');
    await role('authenticated',driverUid);
    check('BASELINE cancelled job can receive a direct application',Boolean((await insert(cancelled)).id),true);
    check('BASELINE driver can choose completed state on initial application',Boolean((await insert(fabricated,'勤務完了')).id),true);
    findings.push('BASELINE: cancelled jobs accept direct applications; a driver can choose initial completed state instead of pending');
    await db.exec('ROLLBACK TO SAVEPOINT entry_probe; RELEASE SAVEPOINT entry_probe');
    await role('postgres');
    const originalHash=(await one("SELECT md5(pg_get_functiondef('spodora_private.capture_application_pay_guarantee()'::regprocedure)) AS hash")).hash;
    await apply('sql/review-v4-application-entry-access.sql');
    await role('authenticated',driverUid);
    await rejects('PROPOSAL cancelled job application rejected',
      'INSERT INTO public.applications(job_id,driver_id) VALUES($1,$2)',[cancelled.id,driver.id],e=>e.code==='23514');
    await rejects('PROPOSAL initial completed application state rejected',
      "INSERT INTO public.applications(job_id,driver_id,status) VALUES($1,$2,'勤務完了')",[fabricated.id,driver.id]);
    check('PROPOSAL normal pending application remains possible',Boolean((await insert(fabricated)).id),true);
    await role('postgres');
    await apply('sql/review-v4-application-entry-rollback.sql');
    check('Entry rollback restores exact captured trigger function',
      (await one("SELECT md5(pg_get_functiondef('spodora_private.capture_application_pay_guarantee()'::regprocedure)) AS hash")).hash,originalHash);

    // Validate proposed changes together, not only separately.
    for(const file of ['sql/review-v4-job-insert-hardening.sql','sql/review-v4-application-delete-guard.sql',
      'sql/review-v4-legacy-and-rounding-access.sql','sql/review-v4-application-entry-access.sql'])await apply(file);
    await role('anon');
    await rejects('COMBINED anonymous job creation rejected',
      "INSERT INTO public.jobs(company_id,work_date,location,pay_guarantee) VALUES($1,current_date+40,'denied',false)",[company.id]);
    await role('authenticated',companyUid);
    const ownJob=await one("INSERT INTO public.jobs(company_id,work_date,location,pay_guarantee) VALUES($1,current_date+41,'synthetic-own-guarded',false) RETURNING id",[company.id]);
    check('COMBINED own company can publish a job',Boolean(ownJob.id),true);
    await role('authenticated',driverUid);
    check('COMBINED own driver can submit pending application',Boolean((await insert(ownJob)).id),true);
    await payAndQrChecks({...ctx,
      check:(name,actual,expected)=>check('COMBINED '+name,actual,expected),
      rejects:(name,...args)=>rejects('COMBINED '+name,...args)});
  } finally {
    await db.exec('ROLLBACK TO SAVEPOINT edge_state_suite; RELEASE SAVEPOINT edge_state_suite');
    await role('postgres');
  }
}
