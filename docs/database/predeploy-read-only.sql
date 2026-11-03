-- Local validation first. Production execution requires an explicitly approved read-only scope.
-- Aggregate counts only: no identifiers, personal rows, tokens, SQL function bodies or secrets.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='5s';
SET LOCAL lock_timeout='1s';
SELECT jsonb_build_object(
 'transaction_read_only',current_setting('transaction_read_only')='on',
 'postgres_major',current_setting('server_version_num')::integer/10000,
 'application_tables',(SELECT count(*) FROM pg_tables WHERE schemaname='public'),
 'rls_disabled_tables',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity),
 'unvalidated_constraints',(SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND NOT convalidated),
 'invalid_indexes',(SELECT count(*) FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT i.indisvalid),
 'over_capacity_jobs',(SELECT count(*) FROM public.jobs j WHERE (SELECT count(*) FROM public.applications a WHERE a.job_id=j.id AND a.status IN ('採用','勤務確定','勤務完了'))>j.required_headcount),
 'invalid_job_capacity',(SELECT count(*) FROM public.jobs WHERE required_headcount IS NULL OR required_headcount<1),
 'invalid_application_links',(SELECT count(*) FROM public.applications a LEFT JOIN public.jobs j ON j.id=a.job_id LEFT JOIN public.drivers d ON d.id=a.driver_id WHERE j.id IS NULL OR d.id IS NULL),
 'duplicate_applications',(SELECT count(*) FROM (SELECT job_id,driver_id FROM public.applications GROUP BY job_id,driver_id HAVING count(*)>1) d),
 'checkout_without_checkin',(SELECT count(*) FROM public.applications WHERE checked_out_at IS NOT NULL AND checked_in_at IS NULL),
 'checkout_before_checkin',(SELECT count(*) FROM public.applications WHERE checked_out_at<checked_in_at),
 'hiring_guard_installed',EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.applications'::regclass AND tgname='v4_guard_hiring_capacity' AND NOT tgisinternal AND tgenabled='O'),
 'public_security_definer_anon_execute',(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prosecdef AND has_function_privilege('anon',p.oid,'EXECUTE')),
 'private_function_anon_execute',(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('private','spodora_private','spodora_reviews') AND has_function_privilege('anon',p.oid,'EXECUTE'))
) AS predeploy_read_only;
ROLLBACK;
