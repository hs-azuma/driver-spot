-- REVIEW ONLY. Disable the deletion endpoint before removing these guards.
-- This does not restore deleted records and restores the baseline cascade risk.
BEGIN;
DO $guard$ BEGIN
 IF current_setting('spodora.local_restore_review',true) IS DISTINCT FROM 'yes'
 THEN RAISE EXCEPTION 'Local review opt-in required'; END IF;
END $guard$;
DROP TRIGGER v4_retire_empty_auth_profiles ON auth.users;
DROP TRIGGER v4_guard_driver_history ON public.drivers;
DROP TRIGGER v4_guard_company_history ON public.companies;
DROP FUNCTION public.withdrawal_preflight(uuid);
DROP FUNCTION spodora_private.retire_empty_auth_profiles();
DROP FUNCTION spodora_private.guard_profile_history_delete();
ROLLBACK;
