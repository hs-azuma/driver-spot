begin;
create table if not exists public.pending_company_registrations (
 user_id uuid primary key references auth.users(id) on delete cascade,
 profile jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.pending_company_registrations enable row level security;
revoke all on public.pending_company_registrations from public,anon,authenticated;
grant select,insert,update,delete on public.pending_company_registrations to service_role;

create or replace function spodora_private.require_company_email_confirmation()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 -- Existing company accounts keep their current access and profile updates.
 if not exists(select 1 from public.companies where user_id=new.user_id) then
  if new.email is null or new.email='' or new.email like '%@accounts.spodora.invalid'
   or not exists(select 1 from auth.users where id=new.user_id and email_confirmed_at is not null and lower(email)=lower(new.email)) then
   raise exception 'company_email_confirmation_required' using errcode='23514';
  end if;
 end if;
 return new;
end $$;
revoke all on function spodora_private.require_company_email_confirmation() from public,anon,authenticated;
drop trigger if exists require_company_email_confirmation on public.companies;
create trigger require_company_email_confirmation before insert on public.companies
for each row execute function spodora_private.require_company_email_confirmation();

create or replace function spodora_private.finish_confirmed_company_registration()
returns trigger language plpgsql security definer set search_path='' as $$
declare p jsonb;
begin
 if new.email_confirmed_at is null then return new;end if;
 select profile into p from public.pending_company_registrations where user_id=new.id for update;
 if p is null then return new;end if;
 insert into public.companies(user_id,company_name,contact_name,phone,address,email,acquisition_source,acquisition_medium,acquisition_campaign,acquisition_content,acquisition_ref)
 values(new.id,p->>'company_name',p->>'contact_name',p->>'company_phone',p->>'company_address',new.email,p->>'acquisition_source',p->>'acquisition_medium',p->>'acquisition_campaign',p->>'acquisition_content',p->>'acquisition_ref')
 on conflict(user_id) do nothing;
 delete from public.pending_company_registrations where user_id=new.id;
 return new;
end $$;
revoke all on function spodora_private.finish_confirmed_company_registration() from public,anon,authenticated;
drop trigger if exists finish_confirmed_company_registration on auth.users;
create trigger finish_confirmed_company_registration after update of email_confirmed_at on auth.users
for each row execute function spodora_private.finish_confirmed_company_registration();
commit;
