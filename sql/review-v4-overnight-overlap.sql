-- REVIEW ONLY. Requires native validation, including concurrent transactions.
BEGIN;
DO $guard$ BEGIN
 IF current_setting('spodora.local_restore_review',true) IS DISTINCT FROM 'yes'
 THEN RAISE EXCEPTION 'Local review opt-in required'; END IF;
END $guard$;
CREATE OR REPLACE FUNCTION public.prevent_overlapping_driver_application()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $function$
DECLARE j record; conflict_job record;
BEGIN
 IF NEW.status NOT IN ('応募中','採用候補','採用','勤務確定') THEN RETURN NEW; END IF;
 -- Same driver writes use the same transaction lock. Native multi-session validation remains required.
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('spodora-application-driver:'||NEW.driver_id::text,0));
 SELECT id,work_date,start_time,end_time INTO j FROM public.jobs WHERE id=NEW.job_id;
 IF j.id IS NULL OR j.work_date IS NULL OR j.start_time IS NULL OR j.end_time IS NULL THEN RETURN NEW; END IF;
 SELECT j2.id INTO conflict_job FROM public.applications a JOIN public.jobs j2 ON j2.id=a.job_id
 WHERE a.driver_id=NEW.driver_id AND a.id IS DISTINCT FROM NEW.id
 AND a.status IN ('応募中','採用候補','採用','勤務確定') AND j2.status IS DISTINCT FROM 'キャンセル'
 AND j2.work_date BETWEEN j.work_date-1 AND j.work_date+1
 AND (j2.work_date+j2.start_time)<(j.work_date+j.end_time+CASE WHEN j.end_time<j.start_time THEN interval '1 day' ELSE interval '0' END)
 AND (j2.work_date+j2.end_time+CASE WHEN j2.end_time<j2.start_time THEN interval '1 day' ELSE interval '0' END)>(j.work_date+j.start_time)
 LIMIT 1;
 IF conflict_job.id IS NOT NULL THEN RAISE EXCEPTION 'この時間帯は別の求人に応募済みです。重複する求人には応募できません。' USING ERRCODE='P0001'; END IF;
 RETURN NEW;
END $function$;
ROLLBACK;
