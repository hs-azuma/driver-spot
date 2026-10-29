-- REVIEW ONLY. No production application before native Auth/permissions validation and approval.
-- Do not choose a retention period here: stop automatic removal when business records exist.
BEGIN;
DO $guard$ BEGIN
 IF current_setting('spodora.local_restore_review',true) IS DISTINCT FROM 'yes'
 THEN RAISE EXCEPTION 'Local review opt-in required'; END IF;
END $guard$;
CREATE FUNCTION spodora_private.guard_profile_history_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
BEGIN
 IF TG_TABLE_NAME='drivers' AND EXISTS(SELECT 1 FROM public.applications WHERE driver_id=OLD.id)
 THEN RAISE EXCEPTION 'withdrawal_retention_review_required' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='companies' AND EXISTS(SELECT 1 FROM public.jobs WHERE company_id=OLD.id)
 THEN RAISE EXCEPTION 'withdrawal_retention_review_required' USING ERRCODE='23514'; END IF;
 RETURN OLD;
END $function$;
REVOKE ALL ON FUNCTION spodora_private.guard_profile_history_delete() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER v4_guard_driver_history BEFORE DELETE ON public.drivers
FOR EACH ROW EXECUTE FUNCTION spodora_private.guard_profile_history_delete();
CREATE TRIGGER v4_guard_company_history BEFORE DELETE ON public.companies
FOR EACH ROW EXECUTE FUNCTION spodora_private.guard_profile_history_delete();

CREATE FUNCTION spodora_private.retire_empty_auth_profiles() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE storage_owned boolean;
BEGIN
 IF to_regclass('storage.objects') IS NOT NULL THEN
  EXECUTE 'SELECT EXISTS(SELECT 1 FROM storage.objects o WHERE to_jsonb(o)->>''owner_id''=$1 OR to_jsonb(o)->>''owner''=$1)' INTO storage_owned USING OLD.id::text;
  IF storage_owned THEN RAISE EXCEPTION 'withdrawal_storage_review_required' USING ERRCODE='23514'; END IF;
 END IF;
 -- Run BEFORE Auth DELETE. All these effects roll back if the Auth DELETE fails.
 PERFORM 1 FROM public.drivers WHERE user_id=OLD.id FOR UPDATE;
 PERFORM 1 FROM public.companies WHERE user_id=OLD.id FOR UPDATE;
 DELETE FROM public.drivers WHERE user_id=OLD.id;
 DELETE FROM public.companies WHERE user_id=OLD.id;
 RETURN OLD;
END $function$;
REVOKE ALL ON FUNCTION spodora_private.retire_empty_auth_profiles() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER v4_retire_empty_auth_profiles BEFORE DELETE ON auth.users
FOR EACH ROW EXECUTE FUNCTION spodora_private.retire_empty_auth_profiles();

CREATE FUNCTION public.withdrawal_preflight(p_user_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE installed integer; storage_owned boolean;
BEGIN
 SELECT count(*) INTO installed FROM pg_catalog.pg_trigger t
 WHERE NOT t.tgisinternal AND t.tgenabled='O' AND (
  (t.tgrelid='public.drivers'::regclass AND t.tgname='v4_guard_driver_history' AND t.tgfoid='spodora_private.guard_profile_history_delete()'::regprocedure)
  OR (t.tgrelid='public.companies'::regclass AND t.tgname='v4_guard_company_history' AND t.tgfoid='spodora_private.guard_profile_history_delete()'::regprocedure)
  OR (t.tgrelid='auth.users'::regclass AND t.tgname='v4_retire_empty_auth_profiles' AND t.tgfoid='spodora_private.retire_empty_auth_profiles()'::regprocedure));
 IF installed<>3 OR p_user_id IS NULL THEN RETURN jsonb_build_object('mode','unavailable'); END IF;
 IF to_regclass('storage.objects') IS NOT NULL THEN
  EXECUTE 'SELECT EXISTS(SELECT 1 FROM storage.objects o WHERE to_jsonb(o)->>''owner_id''=$1 OR to_jsonb(o)->>''owner''=$1)' INTO storage_owned USING p_user_id::text;
  IF storage_owned THEN RETURN jsonb_build_object('mode','review_required','reason','storage_objects'); END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM public.applications a JOIN public.drivers d ON d.id=a.driver_id WHERE d.user_id=p_user_id)
 OR EXISTS(SELECT 1 FROM public.jobs j JOIN public.companies c ON c.id=j.company_id WHERE c.user_id=p_user_id)
 THEN RETURN jsonb_build_object('mode','review_required'); END IF;
 RETURN jsonb_build_object('mode','ready');
END $function$;
REVOKE ALL ON FUNCTION public.withdrawal_preflight(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.withdrawal_preflight(uuid) TO service_role;
ROLLBACK;
