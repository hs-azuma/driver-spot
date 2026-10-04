-- Pay policy is selected before publication and preserved on every application.
alter table public.jobs add column if not exists pay_guarantee boolean;
alter table public.applications add column if not exists pay_guarantee_snapshot boolean;
comment on column public.jobs.pay_guarantee is 'true: scheduled basic pay minimum; false: actual net work proportional pay; null: legacy unspecified';
comment on column public.applications.pay_guarantee_snapshot is 'Pay guarantee at application creation. Immutable; legacy applications remain null.';
create or replace function public.preserve_job_pay_guarantee()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
 if TG_OP = 'INSERT' and NEW.pay_guarantee is null then
  raise exception '給与保証の条件を選択してください。';
 end if;
 if TG_OP = 'UPDATE' and NEW.pay_guarantee is distinct from OLD.pay_guarantee
  and exists(select 1 from public.applications where job_id=OLD.id) then
  raise exception '応募者がいる求人の給与保証条件は変更できません。新しい求人で設定してください。';
 end if;
 return NEW;
end $$;
revoke all on function public.preserve_job_pay_guarantee() from public,anon,authenticated;
create trigger preserve_job_pay_guarantee before insert or update of pay_guarantee on public.jobs
for each row execute function public.preserve_job_pay_guarantee();
create or replace function spodora_private.capture_application_pay_guarantee()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if TG_OP='INSERT' then
  if auth.uid() is null or not exists(select 1 from public.drivers where id=NEW.driver_id and user_id=auth.uid()) then
   raise exception 'ドライバー本人のログインが必要です。';
  end if;
  select pay_guarantee into NEW.pay_guarantee_snapshot from public.jobs where id=NEW.job_id for share;
  if not found then raise exception '求人が見つかりません。'; end if;
 elsif NEW.pay_guarantee_snapshot is distinct from OLD.pay_guarantee_snapshot or NEW.job_id is distinct from OLD.job_id then
  raise exception '応募時の給与条件と求人は変更できません。';
 end if;
 return NEW;
end $$;
revoke all on function spodora_private.capture_application_pay_guarantee() from public,anon,authenticated;
create trigger capture_application_pay_guarantee before insert or update of pay_guarantee_snapshot,job_id on public.applications
for each row execute function spodora_private.capture_application_pay_guarantee();
