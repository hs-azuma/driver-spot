import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
export async function overnightChecks(ctx){
 const {db,root,one,check,role,rejects,findings,company,companyUid,driver,driverUid}=ctx;
 await role('postgres');await db.exec('SAVEPOINT overnight_suite');
 const apply=async file=>{const s=readFileSync(resolve(root,file),'utf8');assert(s.endsWith('ROLLBACK;\n'));await db.exec(s.replace(/^BEGIN;$/m,'').slice(0,-'ROLLBACK;\n'.length))};
 const job=async(day,start,end)=>{await role('postgres');return one("INSERT INTO public.jobs(company_id,work_date,location,start_time,end_time,pay_guarantee) VALUES($1,(now() AT TIME ZONE 'Asia/Tokyo')::date+$2::int,'synthetic-overnight',$3,$4,false) RETURNING id",[company.id,day,start,end])};
 const applyJob=async j=>{await role('authenticated',driverUid);return one('INSERT INTO public.applications(job_id,driver_id) VALUES($1,$2) RETURNING id',[j.id,driver.id])};
 try{
  const first=await job(60,'22:00','02:00'),next=await job(61,'01:00','05:00'),same=await job(60,'23:00','01:00'),adjacent=await job(61,'02:00','05:00');
  await applyJob(first);await role('postgres');await db.exec('SAVEPOINT baseline_overnight');
  check('BASELINE next-day overlap can be submitted',Boolean((await applyJob(next)).id),true);
  check('BASELINE same-evening overnight overlap can be submitted',Boolean((await applyJob(same)).id),true);
  findings.push('BASELINE: same-date time-only overlap predicate misses overnight and adjacent-calendar-day conflicts');
  await db.exec('ROLLBACK TO SAVEPOINT baseline_overnight; RELEASE SAVEPOINT baseline_overnight');await role('postgres');
  const hash=(await one("SELECT md5(pg_get_functiondef('public.prevent_overlapping_driver_application()'::regprocedure)) hash")).hash;
  await apply('sql/review-v4-overnight-overlap.sql');await role('authenticated',driverUid);
  for(const [name,j] of [['next calendar day',next],['same evening',same]])await rejects('PROPOSAL overnight overlap rejected: '+name,'INSERT INTO public.applications(job_id,driver_id) VALUES($1,$2)',[j.id,driver.id],e=>e.code==='P0001'&&e.message.includes('重複'));
  check('PROPOSAL exact end/start boundary remains allowed',Boolean((await applyJob(adjacent)).id),true);
  const morning=await job(65,'01:00','05:00'),previous=await job(64,'22:00','02:00');
  await applyJob(morning);await role('authenticated',driverUid);
  await rejects('PROPOSAL reverse insertion order also rejects overlap','INSERT INTO public.applications(job_id,driver_id) VALUES($1,$2)',[previous.id,driver.id],e=>e.code==='P0001');
  await role('authenticated',companyUid);await db.query("UPDATE public.jobs SET status='キャンセル' WHERE id=$1",[morning.id]);
  check('PROPOSAL cancelled conflicting job no longer blocks valid application',Boolean((await applyJob(previous)).id),true);
  await role('postgres');await apply('sql/review-v4-overnight-overlap-rollback.sql');
  check('Overnight rollback restores exact captured function hash',(await one("SELECT md5(pg_get_functiondef('public.prevent_overlapping_driver_application()'::regprocedure)) hash")).hash,hash);
 }finally{await db.exec('ROLLBACK TO SAVEPOINT overnight_suite; RELEASE SAVEPOINT overnight_suite');await role('postgres')}
}
