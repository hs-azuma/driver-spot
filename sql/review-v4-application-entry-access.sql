-- REVIEW ONLY. Never run on production without native validation and approval.
BEGIN;
DO $guard$ BEGIN
 IF current_setting('spodora.local_restore_review',true) IS DISTINCT FROM 'yes'
 THEN RAISE EXCEPTION 'Local review opt-in required'; END IF;
END $guard$;
CREATE OR REPLACE FUNCTION spodora_private.capture_application_pay_guarantee()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if TG_OP='INSERT' then
  if auth.uid() is null or not exists(select 1 from public.drivers where id=NEW.driver_id and user_id=auth.uid()) then
   raise exception 'ドライバー本人のログインが必要です。';
  end if;
  select pay_guarantee into NEW.pay_guarantee_snapshot from public.jobs where id=NEW.job_id for share;
  if not found then raise exception '求人が見つかりません。'; end if;
  if NEW.status is distinct from '応募中' then
   raise exception '応募時の状態を変更することはできません。' using errcode='42501'; end if;
  -- The preceding SELECT FOR SHARE already locks the target job against cancellation races.
  if exists(select 1 from public.jobs where id=NEW.job_id and status='キャンセル') then
   raise exception '取消済みの求人には応募できません。' using errcode='23514'; end if;

 elsif NEW.pay_guarantee_snapshot is distinct from OLD.pay_guarantee_snapshot or NEW.job_id is distinct from OLD.job_id then
  raise exception '応募時の給与条件と求人は変更できません。';
 end if;
 return NEW;
end $function$;
ROLLBACK;
