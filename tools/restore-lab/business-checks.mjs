import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

export async function businessChecks(ctx) {
  const {db, root, check, one, role, rejects, findings, company, otherCompany, driver, otherDriver,
    companyUid, otherCompanyUid, driverUid, otherDriverUid, job, otherJob, application} = ctx;
  await role('postgres');
  await db.exec('SAVEPOINT business_suite');
  try {
    await role('authenticated', driverUid);
    await db.query('INSERT INTO public.driver_job_favorites(driver_id,job_id) VALUES($1,$2)', [driver.id, job.id]);
    check('Favorite own job: readable', (await db.query('SELECT job_id FROM public.driver_job_favorites')).rows, [{job_id: job.id}]);
    await rejects('Favorite duplicate: rejected', 'INSERT INTO public.driver_job_favorites(driver_id,job_id) VALUES($1,$2)',
      [driver.id, job.id], e => e.code === '23505');
    await rejects('Favorite other driver: rejected', 'INSERT INTO public.driver_job_favorites(driver_id,job_id) VALUES($1,$2)',
      [otherDriver.id, job.id]);
    await role('authenticated', otherDriverUid);
    check('Other driver cannot read favorite', (await db.query('SELECT job_id FROM public.driver_job_favorites')).rows, []);
    check('Other driver cannot delete favorite', (await db.query('DELETE FROM public.driver_job_favorites WHERE job_id=$1 RETURNING job_id', [job.id])).rows, []);
    await role('authenticated', driverUid);
    check('Owner can delete favorite', (await db.query('DELETE FROM public.driver_job_favorites WHERE job_id=$1 RETURNING job_id', [job.id])).rows, [{job_id: job.id}]);
    await db.query('INSERT INTO public.driver_company_favorites(driver_id,company_id) VALUES($1,$2)', [driver.id, company.id]);
    check('Driver company favorite saved', (await db.query('SELECT company_id FROM public.driver_company_favorites')).rows, [{company_id: company.id}]);
    await role('authenticated', companyUid);
    await db.query('INSERT INTO public.company_driver_favorites(company_id,driver_id) VALUES($1,$2)', [company.id, driver.id]);
    check('Company can favorite its own applicant', (await db.query('SELECT driver_id FROM public.company_driver_favorites')).rows, [{driver_id: driver.id}]);
    await rejects('Company cannot favorite unrelated driver', 'INSERT INTO public.company_driver_favorites(company_id,driver_id) VALUES($1,$2)', [company.id, otherDriver.id]);
    await rejects('Company cannot write another company favorite', 'INSERT INTO public.company_driver_favorites(company_id,driver_id) VALUES($1,$2)', [otherCompany.id, otherDriver.id]);

    await role('postgres');
    await db.query("UPDATE public.drivers SET preferred_prefecture='東京都',preferred_municipality='新宿区',preferred_email_enabled_1=true,preferred_line_enabled_1=true WHERE id=$1", [driver.id]);
    await db.query("UPDATE public.jobs SET work_prefecture='東京都',work_municipality='新宿区' WHERE id=$1", [job.id]);
    const matches = async channel => (await one('SELECT spodora_private.driver_job_area_matches(d,j,$3) AS matched FROM public.drivers d CROSS JOIN public.jobs j WHERE d.id=$1 AND j.id=$2', [driver.id, job.id, channel])).matched;
    check('Unblocked matching driver eligible', await matches('line'), true);
    await role('authenticated', companyUid);
    await db.query('INSERT INTO public.company_driver_blocks(company_id,driver_id) VALUES($1,$2)', [company.id, driver.id]);
    await rejects('Block unrelated driver: rejected', 'INSERT INTO public.company_driver_blocks(company_id,driver_id) VALUES($1,$2)', [company.id, otherDriver.id]);
    await role('authenticated', otherCompanyUid);
    await rejects('Block for other company: rejected', 'INSERT INTO public.company_driver_blocks(company_id,driver_id) VALUES($1,$2)', [company.id, otherDriver.id]);
    await role('postgres');
    check('Blocked driver excluded from LINE matching', await matches('line'), false);
    check('Blocked driver excluded from email matching', await matches('email'), false);
    await role('authenticated', driverUid);
    check('Driver sees own block relationship', (await db.query('SELECT company_id,driver_id FROM public.company_driver_blocks')).rows, [{company_id: company.id, driver_id: driver.id}]);
    await role('authenticated', otherDriverUid);
    check('Other driver cannot read block relationship', (await db.query('SELECT company_id,driver_id FROM public.company_driver_blocks')).rows, []);
    await role('authenticated', companyUid);
    await db.query('DELETE FROM public.company_driver_blocks WHERE company_id=$1 AND driver_id=$2', [company.id, driver.id]);

    await role('authenticated', otherCompanyUid);
    await rejects('Review other company work: rejected', "SELECT public.submit_work_review($1,'company',5,'not-authorized')", [application.id]);
    await role('authenticated', otherDriverUid);
    await rejects('Review before work completion: rejected', "SELECT public.submit_work_review(a.id,'driver',4,'too-early') FROM public.applications a WHERE a.job_id=$1", [otherJob.id], e => e.code === '22023');
    await role('authenticated', companyUid);
    await db.query("UPDATE public.applications SET status='勤務完了' WHERE id=$1", [application.id]);
    await rejects('Review rating out of range: rejected', "SELECT public.submit_work_review($1,'company',6,'invalid')", [application.id], e => e.code === '22023');
    await rejects('Review oversized comment: rejected', "SELECT public.submit_work_review($1,'company',4,repeat('x',1001))", [application.id], e => e.code === '22023');
    const review1 = await one("SELECT public.submit_work_review($1,'company',5,'company-side') AS id", [application.id]);
    await role('authenticated', driverUid);
    const review2 = await one("SELECT public.submit_work_review($1,'driver',4,'driver-side') AS id", [application.id]);
    check('Mutual reviews share one row', review1.id, review2.id);
    check('Mutual reviews preserve both sides', (await one('SELECT driver_rating,company_rating,company_comment,driver_comment FROM public.reviews WHERE id=$1', [review1.id])),
      {driver_rating: 5, company_rating: 4, company_comment: 'company-side', driver_comment: 'driver-side'});
    await rejects('Direct review mutation without RPC denied', 'UPDATE public.reviews SET driver_rating=1 WHERE id=$1', [review1.id]);
    await role('authenticated', otherDriverUid);
    check('Other participant cannot read review', (await db.query('SELECT id FROM public.reviews WHERE id=$1', [review1.id])).rows, []);
    await role('anon');
    await rejects('Anonymous review RPC denied', "SELECT public.submit_work_review($1,'driver',1,'anonymous')", [application.id]);

    await role('postgres');
    await db.exec('SAVEPOINT cancellation_probe');
    await role('authenticated', otherDriverUid);
    check('Own pending application can be cancelled', (await db.query('DELETE FROM public.applications WHERE job_id=$1 RETURNING job_id', [otherJob.id])).rows, [{job_id: otherJob.id}]);
    check('Other driver cannot cancel application', (await db.query('DELETE FROM public.applications WHERE id=$1 RETURNING id', [application.id])).rows, []);
    await role('authenticated', driverUid);
    check('BASELINE completed attendance row can be deleted', (await db.query('DELETE FROM public.applications WHERE id=$1 RETURNING id', [application.id])).rows, [{id: application.id}]);
    await role('postgres');
    check('BASELINE deletion cascades to review', (await one('SELECT count(*)::int n FROM public.reviews WHERE id=$1', [review1.id])).n, 0);
    check('BASELINE deletion cascades to attendance edit history', (await one('SELECT count(*)::int n FROM public.attendance_edit_logs WHERE application_id=$1', [application.id])).n, 0);
    findings.push('BASELINE: driver DELETE can remove an attended application and cascade reviews/attendance edit history; UI only hides the button');
    await db.exec('ROLLBACK TO SAVEPOINT cancellation_probe; RELEASE SAVEPOINT cancellation_probe');
    const proposal = readFileSync(resolve(root, 'sql/review-v4-application-delete-guard.sql'), 'utf8');
    assert(proposal.endsWith('ROLLBACK;\n'));
    await db.exec(proposal.replace(/^BEGIN;$/m, '').slice(0, -'ROLLBACK;\n'.length));
    await role('authenticated', driverUid);
    check('PROPOSAL attended application cannot be deleted', (await db.query('DELETE FROM public.applications WHERE id=$1 RETURNING id', [application.id])).rows, []);
    await role('postgres');
    check('PROPOSAL review retained after denied delete', (await one('SELECT count(*)::int n FROM public.reviews WHERE id=$1', [review1.id])).n, 1);
    check('PROPOSAL edit history retained after denied delete', (await one('SELECT count(*)::int n FROM public.attendance_edit_logs WHERE application_id=$1', [application.id])).n, 1);
    await role('authenticated', otherDriverUid);
    check('PROPOSAL own pending application still cancellable', (await db.query('DELETE FROM public.applications WHERE job_id=$1 RETURNING job_id', [otherJob.id])).rows, [{job_id: otherJob.id}]);
    await role('postgres');
    // Apply the job guard too, then verify the separately prepared combined rollback.
    const jobGuard = readFileSync(resolve(root, 'sql/review-v4-job-insert-hardening.sql'), 'utf8');
    await db.exec(jobGuard.replace(/^BEGIN;$/m, '').slice(0, -'ROLLBACK;\n'.length));
    const rollback = readFileSync(resolve(root, 'sql/review-v4-hardening-rollback.sql'), 'utf8');
    await db.exec(rollback.replace(/^BEGIN;$/m, '').slice(0, -'ROLLBACK;\n'.length));
    check('Rollback restores baseline job INSERT privilege', (await one("SELECT has_table_privilege('anon','public.jobs','INSERT') allowed")).allowed, true);
    check('Rollback removes only new delete policy', (await one("SELECT count(*)::int n FROM pg_policies WHERE schemaname='public' AND tablename='applications' AND policyname='V4 retain confirmed and attended applications'")).n, 0);
  } finally {
    await db.exec('ROLLBACK TO SAVEPOINT business_suite; RELEASE SAVEPOINT business_suite');
    await role('postgres');
  }
}
