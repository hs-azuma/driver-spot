begin;
-- Keep existing dual-profile accounts usable; prevent new cross-portal profiles.
create or replace function spodora_private.guard_account_portal()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and new.user_id is distinct from old.user_id then
  raise exception 'account_owner_cannot_change' using errcode='23514';
 end if;
 if current_setting('role',true)='authenticated' and new.user_id is distinct from auth.uid() then
  raise exception 'account_owner_mismatch' using errcode='42501';
 end if;
 -- Serialize competing driver/company registrations for the same auth user.
 perform 1 from auth.users where id=new.user_id for update;
 if tg_table_name='drivers' then
  if exists(select 1 from public.companies where user_id=new.user_id)
   and not exists(select 1 from public.drivers where user_id=new.user_id) then
   raise exception 'separate_account_required' using errcode='23514';
  end if;
 elsif tg_table_name='companies' then
  if exists(select 1 from public.drivers where user_id=new.user_id)
   and not exists(select 1 from public.companies where user_id=new.user_id) then
   raise exception 'separate_account_required' using errcode='23514';
  end if;
 end if;
 return new;
end $$;
revoke all on function spodora_private.guard_account_portal() from public,anon,authenticated;
drop trigger if exists guard_driver_account_portal on public.drivers;
create trigger guard_driver_account_portal before insert or update of user_id on public.drivers
for each row execute function spodora_private.guard_account_portal();
drop trigger if exists guard_company_account_portal on public.companies;
create trigger guard_company_account_portal before insert or update of user_id on public.companies
for each row execute function spodora_private.guard_account_portal();
commit;
