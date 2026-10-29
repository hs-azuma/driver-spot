-- REVIEW ONLY. Restores exactly the captured baseline privileges, including its known issues.
-- Use only after an approved rollback decision. Does NOT recover already deleted records.
BEGIN;
DO $guard$ BEGIN
 IF current_setting('spodora.local_restore_review',true) IS DISTINCT FROM 'yes'
 THEN RAISE EXCEPTION 'Local review opt-in required'; END IF;
END $guard$;
DROP POLICY "V4 retain confirmed and attended applications" ON public.applications;
CREATE POLICY "Public jobs insertable" ON public.jobs AS PERMISSIVE FOR INSERT TO anon, authenticated WITH CHECK (true);
GRANT INSERT ON public.jobs TO anon;
ROLLBACK;
