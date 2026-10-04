create table public.driver_job_favorites (
  driver_id bigint not null references public.drivers(id) on delete cascade,
  job_id bigint not null references public.jobs(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (driver_id, job_id)
);
create index driver_job_favorites_job_idx on public.driver_job_favorites(job_id);
alter table public.driver_job_favorites enable row level security;
revoke all on public.driver_job_favorites from public, anon, authenticated;
grant select, insert, delete on public.driver_job_favorites to authenticated;
create policy "drivers read own favorites" on public.driver_job_favorites
for select to authenticated using (
  exists (select 1 from public.drivers d where d.id=driver_id and d.user_id=(select auth.uid()))
);
create policy "drivers save own favorites" on public.driver_job_favorites
for insert to authenticated with check (
  exists (select 1 from public.drivers d where d.id=driver_id and d.user_id=(select auth.uid()))
);
create policy "drivers delete own favorites" on public.driver_job_favorites
for delete to authenticated using (
  exists (select 1 from public.drivers d where d.id=driver_id and d.user_id=(select auth.uid()))
);
notify pgrst, 'reload schema';
