// In-memory PostgreSQL only. No remote DB client, browser, mail worker or network API.
import {PGlite} from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve, dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {businessChecks} from './business-checks.mjs';
import {notificationChecks} from './notification-checks.mjs';
import {payAndQrChecks} from './pay-and-qr-checks.mjs';
import {accessChecks} from './access-checks.mjs';
import {edgeStateChecks} from './edge-state-checks.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const db = new PGlite(); // no path: volatile memory; no production credentials accepted
const checks = [];
const findings = [];
const scenarioGroups = [];
const startedAt = new Date().toISOString();
const check = (name, actual, expected) => { assert.deepEqual(actual, expected, name); checks.push(name); };
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const role = async (name, uid = '') => {
  assert(['postgres', 'anon', 'authenticated', 'service_role'].includes(name));
  await db.exec('RESET ROLE');
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [uid]);
  if (name !== 'postgres') await db.exec('SET LOCAL ROLE ' + name);
};
async function rejects(name, sql, params, predicate = e => e.code === '42501') {
  await db.exec('SAVEPOINT denied_action');
  let error;
  try { await db.query(sql, params); } catch (e) { error = e; }
  await db.exec('ROLLBACK TO SAVEPOINT denied_action; RELEASE SAVEPOINT denied_action');
  assert(error && predicate(error), name + ': expected authorization rejection');
  checks.push(name);
}
async function scenario(name, run) {
  const before = checks.length;
  await run();
  scenarioGroups.push({name, checks: checks.length - before});
}

try {
  const engine = await one('select version() as version');
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA extensions;
    -- Auth is a deliberately minimal fixture, not the Supabase Auth service.
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, email_confirmed_at timestamptz,
      raw_user_meta_data jsonb DEFAULT '{}', raw_app_meta_data jsonb DEFAULT '{}');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
    SET spodora.local_restore_review = 'yes';
  `);
  const candidate = readFileSync(resolve(root, 'docs/database/restore-candidate/application-review.sql'), 'utf8');
  assert(candidate.endsWith('ROLLBACK;\n'));
  // Leave its transaction open for assertions, then explicitly ROLLBACK in finally.
  await db.exec(candidate.slice(0, -'ROLLBACK;\n'.length));
  checks.push('All application DDL executes with check_function_bodies=on');
  const actual = (await one(readFileSync(resolve(root, 'docs/database/read-catalog.sql'), 'utf8'))).inventory;
  const captured = JSON.parse(readFileSync(resolve(root, 'docs/database/public-catalog-20261029.json'), 'utf8'));
  const normalize = rows => (rows || []).map(x => JSON.stringify(x, Object.keys(x).sort())).sort();
  // Compare complete values, not only object counts. Extensions/Auth are fixtures and excluded.
  const catalogKeys = ['tables', 'columns', 'constraints', 'indexes', 'policies', 'triggers', 'functions', 'table_grants', 'function_grants'];
  for (const key of catalogKeys) {
    check('Catalog equivalence: ' + key, normalize(actual[key]), normalize(captured[key]));
  }
  const functionCount = await one("SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private','spodora_private','spodora_reviews','spodora_job_counts')");
  check('54 application functions including recovered private trigger', functionCount.n, 54);
  const columns = JSON.parse(readFileSync(resolve(root, 'docs/database/column-privileges-20261029.json'), 'utf8'));
  for (const column of columns) {
    for (const entry of column.acl) {
      const grantee = entry.split('=')[0];
      check(`Column SELECT grant ${column.table}.${column.column}:${grantee}`,
        (await one('SELECT has_column_privilege($1,$2,$3,\'SELECT\') AS allowed',
          [grantee, 'public.' + column.table, column.column])).allowed, true);
    }
  }
  const companyUid = '00000000-0000-4000-8000-000000000001';
  const otherCompanyUid = '00000000-0000-4000-8000-000000000002';
  const driverUid = '00000000-0000-4000-8000-000000000003';
  const otherDriverUid = '00000000-0000-4000-8000-000000000004';
  for (const [id, label, driver] of [[companyUid, 'company-a', false], [otherCompanyUid, 'company-b', false],
                                   [driverUid, 'driver-a', true], [otherDriverUid, 'driver-b', true]]) {
    await db.query('INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data) VALUES($1,$2,now(),$3)',
      [id, label + '@example.invalid', driver ? {driver_name: label} : {}]);
  }
  const company = await one('INSERT INTO public.companies(company_name,user_id,email) VALUES($1,$2,$3) RETURNING id',
    ['Synthetic Company A', companyUid, 'company-a@example.invalid']);
  const otherCompany = await one('INSERT INTO public.companies(company_name,user_id,email) VALUES($1,$2,$3) RETURNING id',
    ['Synthetic Company B', otherCompanyUid, 'company-b@example.invalid']);
  check('Recovered company-name synchronization trigger works',
    (await one('SELECT company_name FROM public.company_public_names WHERE company_id=$1', [company.id])).company_name,
    'Synthetic Company A');
  const driver = await one('SELECT id FROM public.drivers WHERE user_id=$1', [driverUid]);
  const otherDriver = await one('SELECT id FROM public.drivers WHERE user_id=$1', [otherDriverUid]);
  const job = await one("INSERT INTO public.jobs(company_id,work_date,location,start_time,end_time,pay_guarantee) VALUES($1,'2035-01-10','Synthetic Site A','09:00','18:00',false) RETURNING id", [company.id]);
  const otherJob = await one("INSERT INTO public.jobs(company_id,work_date,location,start_time,end_time,pay_guarantee) VALUES($1,'2035-01-11','Synthetic Site B','09:00','18:00',false) RETURNING id", [otherCompany.id]);
  await role('authenticated', driverUid);
  const application = await one('INSERT INTO public.applications(job_id,driver_id) VALUES($1,$2) RETURNING id', [job.id, driver.id]);
  await role('authenticated', otherDriverUid);
  await db.query('INSERT INTO public.applications(job_id,driver_id) VALUES($1,$2)', [otherJob.id, otherDriver.id]);
  await role('authenticated', driverUid);
  check('Driver sees only own profile', (await db.query('SELECT id FROM public.drivers ORDER BY id')).rows, [{id: driver.id}]);
  check('Driver sees only own application', (await db.query('SELECT id FROM public.applications ORDER BY id')).rows, [{id: application.id}]);
  check('Other driver profile update changes no row',
    (await db.query("UPDATE public.drivers SET name='not-allowed' WHERE id=$1 RETURNING id", [otherDriver.id])).rows, []);
  await rejects('Driver cannot reassign own profile owner',
    'UPDATE public.drivers SET user_id=$1 WHERE id=$2', [otherDriverUid, driver.id], e => e.code === '23514');
  await rejects('Driver cannot submit application as another driver',
    'INSERT INTO public.applications(job_id,driver_id) VALUES($1,$2)', [job.id, otherDriver.id],
    e => e.code === 'P0001' && e.message.includes('本人'));
  await role('authenticated', otherCompanyUid);
  check('Other company cannot see application',
    (await db.query('SELECT id FROM public.applications WHERE id=$1', [application.id])).rows, []);
  await rejects('Other company manual attendance denied',
    "SELECT public.company_manual_attendance($1,'2035-01-10 09:00+09','2035-01-10 18:00+09','synthetic')",
    [application.id], e => e.code === 'P0001' && e.message.includes('権限'));
  await role('authenticated', companyUid);
  await db.query("SELECT public.company_manual_attendance($1,'2035-01-10 23:07+09','2035-01-11 01:52+09','synthetic overnight correction')", [application.id]);
  check('Owning company overnight attendance rounds to 150 minutes',
    (await one('SELECT approved_work_minutes FROM public.applications WHERE id=$1', [application.id])).approved_work_minutes, 150);
  await role('postgres');
  check('Manual attendance preserves edit history',
    (await one('SELECT count(*)::int n FROM public.attendance_edit_logs WHERE application_id=$1', [application.id])).n, 1);
  const pendingUid = '00000000-0000-4000-8000-000000000005';
  await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)', [pendingUid, 'pending@example.invalid']);
  await db.query('INSERT INTO public.pending_company_registrations(user_id,profile) VALUES($1,$2)',
    [pendingUid, {company_name: 'Synthetic Pending Company', company_phone: '0000000000'}]);
  check('Unconfirmed company has no completed profile',
    (await one('SELECT count(*)::int n FROM public.companies WHERE user_id=$1', [pendingUid])).n, 0);
  await db.query('UPDATE auth.users SET email_confirmed_at=now() WHERE id=$1', [pendingUid]);
  check('Auth confirmation database trigger completes pending company',
    (await one('SELECT company_name FROM public.companies WHERE user_id=$1', [pendingUid])).company_name, 'Synthetic Pending Company');
  check('Auth confirmation removes consumed pending profile',
    (await one('SELECT count(*)::int n FROM public.pending_company_registrations WHERE user_id=$1', [pendingUid])).n, 0);
  await scenario('favorites_blocks_reviews_cancellation_and_rollback', () => businessChecks({db, root, check, one, role, rejects, findings, company, otherCompany, driver, otherDriver,
    companyUid, otherCompanyUid, driverUid, otherDriverUid, job, otherJob, application}));
  await scenario('notification_queue_and_serial_leases', () => notificationChecks({db, root, check, one, role, rejects, company, driver, otherDriverUid, driverUid, companyUid, job, application}));
  await scenario('pay_confirmation_and_qr_attendance', () => payAndQrChecks({db, root, check, one, role, rejects, company, otherCompany, driver,
    companyUid, otherCompanyUid, driverUid, otherDriverUid}));
  await scenario('legacy_registration_rounding_access_and_guarded_regression', () => accessChecks({db, root, check, one, role, rejects, findings, company, otherCompany, driver,
    companyUid, otherCompanyUid, driverUid, otherDriverUid, application}));
  await scenario('abnormal_entry_states_and_combined_hardening_regression', () => edgeStateChecks({db, root, check, one, role, rejects, findings, company, otherCompany, driver,
    companyUid, otherCompanyUid, driverUid, otherDriverUid}));
  await role('anon');
  check('Anonymous visitor can browse jobs', (await db.query('SELECT id FROM public.jobs')).rows.length, 2);
  await rejects('Anonymous driver-profile read denied', 'SELECT * FROM public.drivers', []);
  // Baseline characterization: never execute these on a real or remote database.
  // Savepoints ensure even the synthetic unauthorized rows are immediately rolled back.
  await db.exec('SAVEPOINT characterize');
  const injected = await one("INSERT INTO public.jobs(company_id,work_date,location,pay_guarantee) VALUES($1,'2035-02-01','synthetic-unowned',false) RETURNING id", [company.id]);
  assert(injected.id);
  findings.push('BASELINE: anonymous INSERT can create a job owned by another company');
  await db.exec('ROLLBACK TO SAVEPOINT characterize; RELEASE SAVEPOINT characterize');
  await role('postgres');
  check('Baseline characterization left original jobs intact', (await one('SELECT count(*)::int n FROM public.jobs')).n, 2);
  await db.exec('SAVEPOINT hardening_review');
  const proposal = readFileSync(resolve(root, 'sql/review-v4-job-insert-hardening.sql'), 'utf8');
  assert(proposal.endsWith('ROLLBACK;\n'));
  await db.exec(proposal.replace(/^BEGIN;$/m, '').slice(0, -'ROLLBACK;\n'.length));
  await role('anon');
  await rejects('PROPOSAL: anonymous job creation denied',
    "INSERT INTO public.jobs(company_id,work_date,location,pay_guarantee) VALUES($1,'2035-02-01','denied',false)", [company.id]);
  await role('authenticated', otherCompanyUid);
  await rejects('PROPOSAL: company cannot create job for another company',
    "INSERT INTO public.jobs(company_id,work_date,location,pay_guarantee) VALUES($1,'2035-02-01','denied',false)", [company.id]);
  const ownJob = await one("INSERT INTO public.jobs(company_id,work_date,location,pay_guarantee) VALUES($1,'2035-02-01','allowed-own',false) RETURNING company_id", [otherCompany.id]);
  check('PROPOSAL: company still creates its own job', ownJob.company_id, otherCompany.id);
  await role('postgres');
  await db.exec('ROLLBACK TO SAVEPOINT hardening_review; RELEASE SAVEPOINT hardening_review');
  await db.exec('ROLLBACK');
  check('Application DDL rollback removes application tables', (await one("SELECT to_regclass('public.jobs') AS table_name")).table_name, null);

  // Rebuild the same candidate again, commit ONLY inside this memory-only PGlite,
  // then export/reload its synthetic data directory into a second memory instance.
  await db.exec(candidate.slice(0, -'ROLLBACK;\n'.length));
  await db.query('INSERT INTO auth.users(id,email,email_confirmed_at) VALUES($1,$2,now())', [companyUid, 'backup@example.invalid']);
  const backupCompany = await one("INSERT INTO public.companies(company_name,user_id,email) VALUES('Synthetic Backup Company',$1,'backup@example.invalid') RETURNING id", [companyUid]);
  const backupJob = await one("INSERT INTO public.jobs(company_id,work_date,location,pay_guarantee) VALUES($1,'2035-03-01','Synthetic Backup Site',false) RETURNING id", [backupCompany.id]);
  await db.exec('COMMIT'); // cannot reach remote: db was constructed with no path or connection URL
  const archive = await db.dumpDataDir('gzip');
  const clone = new PGlite({loadDataDir: archive});
  try {
    await clone.exec('SET search_path=public,extensions');
    const cloneCatalog = (await clone.query(readFileSync(resolve(root, 'docs/database/read-catalog.sql'), 'utf8'))).rows[0].inventory;
    for (const key of catalogKeys) {
      check('Synthetic restore catalog equivalence: ' + key, normalize(cloneCatalog[key]), normalize(captured[key]));
    }
    const restored = await clone.query('SELECT location FROM public.jobs WHERE id=$1', [backupJob.id]);
    check('Synthetic data-directory restore preserves job row', restored.rows, [{location: 'Synthetic Backup Site'}]);
    check('Synthetic restore preserves all public tables',
      (await clone.query("SELECT count(*)::int n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'")).rows[0].n, 22);
    check('Synthetic restore preserves RLS policies', (await clone.query("SELECT count(*)::int n FROM pg_policies WHERE schemaname='public'")).rows[0].n, 40);
    check('Synthetic restore preserves recovered company-name row',
      (await clone.query('SELECT company_name FROM public.company_public_names WHERE company_id=$1', [backupCompany.id])).rows,
      [{company_name: 'Synthetic Backup Company'}]);
    const next = await clone.query("INSERT INTO public.jobs(company_id,work_date,location,pay_guarantee) VALUES($1,'2035-03-02','Synthetic Next Site',false) RETURNING id", [backupCompany.id]);
    check('Synthetic restore identity advances without collision (sequence gaps allowed)', next.rows[0].id > backupJob.id, true);
    check('Synthetic restore preserves anonymous job INSERT privilege for baseline comparison',
      (await clone.query("SELECT has_table_privilege('anon','public.jobs','INSERT') AS allowed")).rows[0].allowed, true);
  } finally { await clone.close(); }
  const summary = {
    status: 'PASS_APPLICATION_DDL_AND_LIMITED_RLS_TESTS_WITH_KNOWN_FINDINGS',
    started_at: startedAt, completed_at: new Date().toISOString(),
    engine: engine.version, runtime: '@electric-sql/pglite@0.3.14',
    candidate_sha256: createHash('sha256').update(candidate).digest('hex'),
    synthetic_archive: {bytes: archive.size, sha256: createHash('sha256').update(new Uint8Array(await archive.arrayBuffer())).digest('hex'),
      format: 'PGlite gzip data-directory; NOT portable pg_dump or production backup', stored: false},
    checks, scenario_groups: scenarioGroups, known_findings: findings,
    source_sha256: Object.fromEntries(['tools/restore-lab/verify.mjs', 'tools/restore-lab/business-checks.mjs',
      'tools/restore-lab/notification-checks.mjs', 'tools/restore-lab/pay-and-qr-checks.mjs',
      'sql/review-v4-application-delete-guard.sql', 'sql/review-v4-job-insert-hardening.sql',
      'sql/review-v4-hardening-rollback.sql','tools/restore-lab/access-checks.mjs','tools/restore-lab/edge-state-checks.mjs',
      'sql/review-v4-legacy-and-rounding-access.sql','sql/review-v4-legacy-and-rounding-rollback.sql',
      'sql/review-v4-application-entry-access.sql','sql/review-v4-application-entry-rollback.sql'].map(path => [path, createHash('sha256').update(readFileSync(resolve(root,path))).digest('hex')])),
    limitations: ['Auth is mocked; no HTTP login, token verification or password recovery tested',
      'No Supabase extensions, cron, event triggers, service settings or Storage files restored',
      'Synthetic PGlite data-directory export/reload is not encrypted production backup or pg_dump/pg_restore proof',
      'Known baseline authorization issues are preserved; no production changes',
      'Lease tests are serial on one connection; concurrent worker races are not tested',
      'PostgreSQL 17.5 WebAssembly differs from production 17.6.1.166'],
    external_notifications: 'No mail/LINE workers or remote network client loaded'
  };
  // Write only static checks and synthetic findings. No user records or secrets are read.
  writeFileSync(resolve(root, 'docs/database/restore-candidate/lab-result.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify({status: summary.status, checks: checks.length, known_findings: findings.length}));
} catch (error) {
  const failure = {status: 'FAIL', started_at: startedAt, failed_at: new Date().toISOString(),
    message: error.message, code: error.code, where: error.where, checks, known_findings: findings};
  writeFileSync(resolve(root, 'docs/database/restore-candidate/lab-result.json'), JSON.stringify(failure, null, 2) + '\n');
  console.error(JSON.stringify({status: 'FAIL', message: error.message, code: error.code, where: error.where}));
  process.exitCode = 1;
} finally {
  try { await db.exec('ROLLBACK'); } catch {}
  await db.close();
}
