create table public.company_driver_favorites (
 company_id bigint not null references public.companies(id) on delete cascade,
 driver_id bigint not null references public.drivers(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(company_id,driver_id)
);
create index company_driver_favorites_driver_idx on public.company_driver_favorites(driver_id);
alter table public.company_driver_favorites enable row level security;
revoke all on public.company_driver_favorites from public,anon,authenticated;
grant select,insert,delete on public.company_driver_favorites to authenticated;
create policy "Companies read own favorites" on public.company_driver_favorites for select to authenticated using (exists(select 1 from public.companies c where c.id=company_id and c.user_id=(select auth.uid())));
create policy "Companies save own applicants" on public.company_driver_favorites for insert to authenticated with check (
 exists(select 1 from public.companies c where c.id=company_id and c.user_id=(select auth.uid()))
 and exists(select 1 from public.applications a join public.jobs j on j.id=a.job_id where a.driver_id=company_driver_favorites.driver_id and j.company_id=company_driver_favorites.company_id)
);
create policy "Companies remove own favorites" on public.company_driver_favorites for delete to authenticated using (exists(select 1 from public.companies c where c.id=company_id and c.user_id=(select auth.uid())));
notify pgrst,'reload schema';