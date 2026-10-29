-- REVIEW ONLY. Requires native validation, including concurrent transactions.
BEGIN;
DO $guard$ BEGIN
 IF current_setting('spodora.local_restore_review',true) IS DISTINCT FROM 'yes'
 THEN RAISE EXCEPTION 'Local review opt-in required'; END IF;
END $guard$;
CREATE OR REPLACE FUNCTION public.prevent_overlapping_driver_application()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  j record;
  conflict_job record;
begin
  if new.status not in ('応募中','採用候補','採用','勤務確定') then return new; end if;
  select id, work_date, start_time, end_time into j from jobs where id=new.job_id;
  if j.id is null or j.work_date is null or j.start_time is null or j.end_time is null then return new; end if;
  select j2.id, j2.job_description, j2.work_date, j2.start_time, j2.end_time
    into conflict_job
  from applications a
  join jobs j2 on j2.id=a.job_id
  where a.driver_id=new.driver_id
    and a.id is distinct from new.id
    and a.status in ('応募中','採用候補','採用','勤務確定')
    and j2.status is distinct from 'キャンセル'
    and j2.work_date=j.work_date
    and j2.start_time < j.end_time
    and j2.end_time > j.start_time
  limit 1;
  if conflict_job.id is not null then
    raise exception using
      errcode='P0001',
      message='この時間帯は別の求人に応募済みです。重複する求人には応募できません。';
  end if;
  return new;
end;
$function$;
ROLLBACK;
