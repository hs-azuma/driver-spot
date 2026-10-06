-- Public company names are separated from private contact and account information.
create table public.company_public_names (
 company_id bigint primary key references public.companies(id) on delete cascade,
 company_name text not null
);
alter table public.company_public_names enable row level security;
revoke all on public.company_public_names from anon, authenticated;
grant select on public.company_public_names to authenticated;
create policy "signed in readers see company names" on public.company_public_names for select to authenticated using (true);
insert into public.company_public_names select id,coalesce(company_name,'企業名未設定') from public.companies;

create schema if not exists private;
-- Internal trigger only: publish name changes without exposing the companies table.
create function private.sync_company_public_name() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 insert into public.company_public_names(company_id,company_name)
 values(new.id,coalesce(new.company_name,'企業名未設定'))
 on conflict(company_id) do update set company_name=excluded.company_name;
 return new;
end;
$$;
revoke all on function private.sync_company_public_name() from public, anon, authenticated;
create trigger sync_company_public_name after insert or update of company_name on public.companies
for each row execute function private.sync_company_public_name();

create table public.driver_company_favorites (
 driver_id bigint not null references public.drivers(id) on delete cascade,
 company_id bigint not null references public.company_public_names(company_id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(driver_id,company_id)
);
create index driver_company_favorites_company_idx on public.driver_company_favorites(company_id);
alter table public.driver_company_favorites enable row level security;
revoke all on public.driver_company_favorites from anon, authenticated;
grant select,insert,delete on public.driver_company_favorites to authenticated;
create policy "drivers read own company favorites" on public.driver_company_favorites for select to authenticated
using (exists(select 1 from public.drivers d where d.id=driver_id and d.user_id=(select auth.uid())));
create policy "drivers save own company favorites" on public.driver_company_favorites for insert to authenticated
with check (exists(select 1 from public.drivers d where d.id=driver_id and d.user_id=(select auth.uid())));
create policy "drivers delete own company favorites" on public.driver_company_favorites for delete to authenticated
using (exists(select 1 from public.drivers d where d.id=driver_id and d.user_id=(select auth.uid())));
notify pgrst,'reload schema';
