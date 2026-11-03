-- REVIEW ONLY. Not a complete migration. Do not run on production before dependency and staging checks.
-- Keep the existing project and records; no data migration or deletion.
BEGIN;
DROP POLICY IF EXISTS "Public companies insertable" ON public.companies;
REVOKE INSERT ON TABLE public.companies FROM anon;
REVOKE EXECUTE ON FUNCTION public.register_company(text,text,text,text,text) FROM PUBLIC, anon, authenticated;
-- Keep authenticated own-profile INSERT policy and grants.
-- Do NOT revoke apply_attendance_rounding: its invoker trigger needs a separate safe design.
COMMIT;

-- Read-only post-apply catalog verification:
SELECT policyname,roles,cmd,with_check FROM pg_policies
 WHERE schemaname='public' AND tablename='companies';
SELECT has_table_privilege('anon','public.companies','INSERT') AS anon_insert,
 has_table_privilege('authenticated','public.companies','INSERT') AS authenticated_insert,
 has_function_privilege('anon','public.register_company(text,text,text,text,text)','EXECUTE') AS anon_rpc,
 has_function_privilege('authenticated','public.register_company(text,text,text,text,text)','EXECUTE') AS authenticated_rpc;
-- Expected: false,true,false,false. Also test real registration on an isolated environment.
