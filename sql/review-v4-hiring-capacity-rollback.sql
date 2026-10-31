-- REVIEW ONLY. Removing this reopens concurrent over-hiring; stop hiring operations first.
BEGIN;
DO $guard$ BEGIN
 IF current_setting('spodora.local_restore_review',true) IS DISTINCT FROM 'yes' THEN RAISE EXCEPTION 'Local review opt-in required'; END IF;
END $guard$;
DROP TRIGGER v4_guard_hiring_capacity ON public.applications;
DROP TRIGGER v4_guard_job_capacity ON public.jobs;
DROP FUNCTION spodora_private.guard_hiring_capacity();
DROP FUNCTION spodora_private.guard_job_capacity_reduction();
ROLLBACK;
