-- REVIEW ONLY: new concurrency proposal; never apply to production without approval.
BEGIN;
DO $guard$ BEGIN
 IF current_setting('spodora.local_restore_review',true) IS DISTINCT FROM 'yes'
 THEN RAISE EXCEPTION 'Local review opt-in required'; END IF;
END $guard$;
CREATE FUNCTION spodora_private.guard_hiring_capacity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE target public.jobs%rowtype; occupied integer;
BEGIN
 IF NEW.status NOT IN ('採用','勤務確定','勤務完了') THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND OLD.status IN ('採用','勤務確定','勤務完了') AND NEW.job_id=OLD.job_id THEN RETURN NEW; END IF;
 SELECT * INTO target FROM public.jobs WHERE id=NEW.job_id FOR UPDATE;
 IF target.id IS NULL OR target.status='キャンセル' THEN RAISE EXCEPTION 'hiring_job_unavailable' USING ERRCODE='23514'; END IF;
 SELECT count(*) INTO occupied FROM public.applications WHERE job_id=NEW.job_id AND id IS DISTINCT FROM NEW.id AND status IN ('採用','勤務確定','勤務完了');
 IF occupied>=target.required_headcount THEN RAISE EXCEPTION 'hiring_capacity_exceeded' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $function$;
REVOKE ALL ON FUNCTION spodora_private.guard_hiring_capacity() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER v4_guard_hiring_capacity BEFORE INSERT OR UPDATE OF status,job_id ON public.applications FOR EACH ROW EXECUTE FUNCTION spodora_private.guard_hiring_capacity();
CREATE FUNCTION spodora_private.guard_job_capacity_reduction() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
BEGIN
 IF NEW.required_headcount<(SELECT count(*) FROM public.applications WHERE job_id=NEW.id AND status IN ('採用','勤務確定','勤務完了'))
 THEN RAISE EXCEPTION 'hiring_capacity_below_existing' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $function$;
REVOKE ALL ON FUNCTION spodora_private.guard_job_capacity_reduction() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER v4_guard_job_capacity BEFORE UPDATE OF required_headcount ON public.jobs FOR EACH ROW EXECUTE FUNCTION spodora_private.guard_job_capacity_reduction();
ROLLBACK;
