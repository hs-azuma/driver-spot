import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {payAndQrChecks} from './pay-and-qr-checks.mjs';

export async function accessChecks(ctx) {
  const {db, root, check, one, role, rejects, findings, companyUid, otherCompanyUid, driverUid, otherDriverUid, application} = ctx;
  await role('postgres');
  await db.exec('SAVEPOINT access_suite');
  const fragment = name => {
    const sql = readFileSync(resolve(root, name), 'utf8');
    assert(sql.endsWith('ROLLBACK;\n'));
    return sql.replace(/^BEGIN;$/m, '').slice(0, -'ROLLBACK;\n'.length);
  };
  try {
    const originalHash = (await one("SELECT md5(pg_get_functiondef('public.apply_attendance_rounding(bigint)'::regprocedure)) hash")).hash;
    const privileges = await one("SELECT has_function_privilege('anon','public.apply_attendance_rounding(bigint)','EXECUTE') AS rounding_anon,has_function_privilege('authenticated','public.apply_attendance_rounding(bigint)','EXECUTE') AS rounding_authenticated,has_function_privilege('anon','public.register_company(text,text,text,text,text)','EXECUTE') AS register_anon");
    check('BASELINE legacy register RPC is executable by anon', privileges.register_anon, true);
    await role('anon');
    await rejects('BASELINE email-confirmation trigger already blocks legacy anonymous registration',
      "SELECT public.register_company('synthetic-legacy')", [], e => e.code === '23514' && e.message.includes('company_email_confirmation_required'));
    await role('postgres');
    await db.exec('SAVEPOINT rounding_probe');
    await db.query("UPDATE public.applications SET attendance_review_status='承認済み',approved_work_minutes=999 WHERE id=$1", [application.id]);
    await role('anon');
    await db.query('SELECT public.apply_attendance_rounding($1)', [application.id]);
    await role('postgres');
    check('BASELINE anonymous rounding overwrites approved attendance',
      await one('SELECT attendance_review_status,approved_work_minutes FROM public.applications WHERE id=$1', [application.id]),
      {attendance_review_status: '確認待ち', approved_work_minutes: 150});
    findings.push('BASELINE: anonymous rounding RPC can recalculate another application and reset approved attendance state');
    await db.exec('ROLLBACK TO SAVEPOINT rounding_probe; RELEASE SAVEPOINT rounding_probe');

    await db.exec(fragment('sql/review-v4-legacy-and-rounding-access.sql'));
    await role('anon');
    await rejects('PROPOSAL legacy anonymous RPC denied before body', "SELECT public.register_company('synthetic-legacy')", []);
    await rejects('PROPOSAL anonymous rounding denied', 'SELECT public.apply_attendance_rounding($1)', [application.id]);
    await role('authenticated', otherDriverUid);
    await rejects('PROPOSAL another driver rounding denied', 'SELECT public.apply_attendance_rounding($1)', [application.id]);
    await role('authenticated', otherCompanyUid);
    await rejects('PROPOSAL another company rounding denied', 'SELECT public.apply_attendance_rounding($1)', [application.id]);
    await role('authenticated', driverUid);
    await db.query('SELECT public.apply_attendance_rounding($1)', [application.id]);
    check('PROPOSAL owner driver can recalculate attendance',
      (await one('SELECT approved_work_minutes FROM public.applications WHERE id=$1', [application.id])).approved_work_minutes, 150);
    await role('authenticated', companyUid);
    await db.query("SELECT public.company_manual_attendance($1,'2035-01-10 23:07+09','2035-01-11 01:52+09','guarded synthetic correction')", [application.id]);
    check('PROPOSAL existing invoker trigger still rounds owner correction',
      (await one('SELECT approved_work_minutes FROM public.applications WHERE id=$1', [application.id])).approved_work_minutes, 150);
    await role('service_role');
    await db.query('SELECT public.apply_attendance_rounding($1)', [application.id]);
    // BYPASSRLS does not grant table SELECT; inspect the result as the local fixture owner.
    await role('postgres');
    check('PROPOSAL trusted service-role recalculation succeeds',
      (await one('SELECT approved_work_minutes FROM public.applications WHERE id=$1', [application.id])).approved_work_minutes, 150);
    await role('postgres');
    check('PROPOSAL removes anonymous company INSERT grant',
      (await one("SELECT has_table_privilege('anon','public.companies','INSERT') AS allowed")).allowed, false);
    const newUid = '00000000-0000-4000-8000-000000000006';
    await db.query("INSERT INTO auth.users(id,email,email_confirmed_at) VALUES($1,'access-fixture@example.invalid',now())", [newUid]);
    await role('authenticated', newUid);
    const own = await one("INSERT INTO public.companies(company_name,user_id,email) VALUES('synthetic-own-company',$1,'access-fixture@example.invalid') RETURNING user_id", [newUid]);
    check('PROPOSAL confirmed company can still create own profile', own.user_id, newUid);
    await rejects('PROPOSAL legacy authenticated RPC also denied', "SELECT public.register_company('synthetic-legacy')", []);
    // Re-run the existing 25 pay/QR cases with the guard installed to cover trigger callers.
    await payAndQrChecks({...ctx,
      check:(name,actual,expected)=>check('GUARDED '+name,actual,expected),
      rejects:(name,...args)=>rejects('GUARDED '+name,...args)});
    await role('postgres');
    await db.exec(fragment('sql/review-v4-legacy-and-rounding-rollback.sql'));
    check('Access rollback restores exact captured rounding definition hash',
      (await one("SELECT md5(pg_get_functiondef('public.apply_attendance_rounding(bigint)'::regprocedure)) hash")).hash, originalHash);
    check('Access rollback restores original effective RPC privileges',
      await one("SELECT has_function_privilege('anon','public.apply_attendance_rounding(bigint)','EXECUTE') AS rounding_anon,has_function_privilege('authenticated','public.apply_attendance_rounding(bigint)','EXECUTE') AS rounding_authenticated,has_function_privilege('anon','public.register_company(text,text,text,text,text)','EXECUTE') AS register_anon"), privileges);
  } finally {
    await db.exec('ROLLBACK TO SAVEPOINT access_suite; RELEASE SAVEPOINT access_suite');
    await role('postgres');
  }
}
