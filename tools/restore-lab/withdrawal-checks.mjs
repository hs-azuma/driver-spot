import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';

export async function withdrawalChecks(ctx){
 const {db,root,one,check,role,rejects,findings,driver,driverUid,company,companyUid,application}=ctx;
 await role('postgres');await db.exec('SAVEPOINT withdrawal_suite');
 const apply=async file=>{const s=readFileSync(resolve(root,file),'utf8');assert(s.endsWith('ROLLBACK;\n'));await db.exec(s.replace(/^BEGIN;$/m,'').slice(0,-'ROLLBACK;\n'.length))};
 try{
  await role('authenticated',companyUid);
  const review=await one("SELECT public.submit_work_review($1,'company',5,'synthetic-retention-review') AS id",[application.id]);
  await role('postgres');await db.exec('SAVEPOINT old_delete_probe');
  await role('service_role');await db.query('DELETE FROM public.drivers WHERE id=$1',[driver.id]);
  await role('postgres');
  check('BASELINE profile deletion leaves Auth account present', (await one('SELECT count(*)::int n FROM auth.users WHERE id=$1',[driverUid])).n,1);
  check('BASELINE service profile deletion removes application history', (await one('SELECT count(*)::int n FROM public.applications WHERE id=$1',[application.id])).n,0);
  check('BASELINE service profile deletion removes reviews', (await one('SELECT count(*)::int n FROM public.reviews WHERE id=$1',[review.id])).n,0);
  findings.push('BASELINE: service-role profile deletion cascades business history before Auth deletion; separate HTTP steps can leave a live Auth account after profile loss');
  await db.exec('ROLLBACK TO SAVEPOINT old_delete_probe; RELEASE SAVEPOINT old_delete_probe');
  await apply('sql/review-v4-withdrawal-retention.sql');
  await role('authenticated',driverUid);
  await rejects('Client cannot call withdrawal preflight for any user','SELECT public.withdrawal_preflight($1)',[driverUid]);
  await role('service_role');
  check('PROPOSAL driver with history requires operator review',(await one('SELECT public.withdrawal_preflight($1) AS result',[driverUid])).result.mode,'review_required');
  check('PROPOSAL company with jobs requires operator review',(await one('SELECT public.withdrawal_preflight($1) AS result',[companyUid])).result.mode,'review_required');
  await rejects('PROPOSAL service-role driver DELETE cannot erase history','DELETE FROM public.drivers WHERE id=$1',[driver.id],e=>e.code==='23514');
  await rejects('PROPOSAL service-role company DELETE cannot erase jobs','DELETE FROM public.companies WHERE id=$1',[company.id],e=>e.code==='23514');
  await role('postgres');
  await rejects('PROPOSAL Auth DELETE cannot bypass history guard','DELETE FROM auth.users WHERE id=$1',[driverUid],e=>e.code==='23514');
  check('PROPOSAL protected review still exists',(await one('SELECT count(*)::int n FROM public.reviews WHERE id=$1',[review.id])).n,1);
  const emptyUid='00000000-0000-4000-8000-000000000070';
  await db.query("INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES($1,'empty-withdrawal@example.invalid','{\"driver_name\":\"synthetic-empty\"}')",[emptyUid]);
  const emptyDriver=await one('SELECT id FROM public.drivers WHERE user_id=$1',[emptyUid]);
  await role('service_role');
  check('PROPOSAL empty account is eligible',(await one('SELECT public.withdrawal_preflight($1) AS result',[emptyUid])).result.mode,'ready');
  await role('postgres');
  await db.exec("ALTER TABLE auth.users DISABLE TRIGGER v4_retire_empty_auth_profiles");
  await role('service_role');
  check('PROPOSAL missing active guard fails closed',(await one('SELECT public.withdrawal_preflight($1) AS result',[emptyUid])).result.mode,'unavailable');
  await role('postgres');await db.exec('ALTER TABLE auth.users ENABLE TRIGGER v4_retire_empty_auth_profiles');
  // A later BEFORE DELETE failure proves that earlier profile removal is in the same statement transaction.
  await db.exec(`CREATE FUNCTION spodora_private.fixture_fail_auth_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic-auth-delete-failure'; END $$;
   CREATE TRIGGER zzz_fixture_fail_auth_delete BEFORE DELETE ON auth.users FOR EACH ROW EXECUTE FUNCTION spodora_private.fixture_fail_auth_delete();`);
  await rejects('PROPOSAL injected Auth delete failure is reported','DELETE FROM auth.users WHERE id=$1',[emptyUid],e=>e.code==='P0001'&&e.message.includes('synthetic-auth'));
  check('PROPOSAL failed Auth DELETE retains empty driver profile',(await one('SELECT count(*)::int n FROM public.drivers WHERE id=$1',[emptyDriver.id])).n,1);
  check('PROPOSAL failed Auth DELETE retains Auth row',(await one('SELECT count(*)::int n FROM auth.users WHERE id=$1',[emptyUid])).n,1);
  await db.exec('DROP TRIGGER zzz_fixture_fail_auth_delete ON auth.users; DROP FUNCTION spodora_private.fixture_fail_auth_delete()');
  await db.query('DELETE FROM auth.users WHERE id=$1',[emptyUid]);
  check('PROPOSAL successful empty withdrawal removes Auth row',(await one('SELECT count(*)::int n FROM auth.users WHERE id=$1',[emptyUid])).n,0);
  check('PROPOSAL successful empty withdrawal removes profile atomically',(await one('SELECT count(*)::int n FROM public.drivers WHERE id=$1',[emptyDriver.id])).n,0);
  await apply('sql/review-v4-withdrawal-retention-rollback.sql');
  check('Withdrawal rollback removes all three added triggers',(await one("SELECT count(*)::int n FROM pg_trigger WHERE tgname IN ('v4_guard_driver_history','v4_guard_company_history','v4_retire_empty_auth_profiles')")).n,0);
 }finally{await db.exec('ROLLBACK TO SAVEPOINT withdrawal_suite; RELEASE SAVEPOINT withdrawal_suite');await role('postgres')}
}
