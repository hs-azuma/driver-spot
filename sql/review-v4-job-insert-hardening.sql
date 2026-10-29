-- REVIEW ONLY. Validated against synthetic in-memory fixtures, not approved for production.
-- Stops anonymous/foreign-company job creation. Existing own-company ALL policy is retained.
BEGIN;
DO $guard$ BEGIN
 IF current_setting('spodora.local_restore_review',true) IS DISTINCT FROM 'yes'
 THEN RAISE EXCEPTION 'Local review opt-in required'; END IF;
END $guard$;
DROP POLICY "Public jobs insertable" ON public.jobs;
REVOKE INSERT ON TABLE public.jobs FROM anon;
-- No broad authenticated GRANT added; Companies manage own jobs already checks ownership.
ROLLBACK;
