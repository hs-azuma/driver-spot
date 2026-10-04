create table public.company_job_invitations (
 id uuid primary key default gen_random_uuid(),
 company_id bigint not null references public.companies(id) on delete cascade,
 job_id bigint not null references public.jobs(id) on delete cascade,
 driver_id bigint not null references public.drivers(id) on delete cascade,
 company_name text not null,
 created_at timestamptz not null default now(),
 email_state text not null default 'pending' check(email_state in ('pending','sent','skipped','failed')),
 unique(job_id,driver_id)
);
create index company_job_invitations_driver_idx on public.company_job_invitations(driver_id,created_at desc);
create index company_job_invitations_company_idx on public.company_job_invitations(company_id);
alter table public.company_job_invitations enable row level security;
revoke all on public.company_job_invitations from public,anon,authenticated;
grant select on public.company_job_invitations to authenticated;
grant all on public.company_job_invitations to service_role;
create policy "Companies read own job invitations" on public.company_job_invitations for select to authenticated using(exists(select 1 from public.companies c where c.id=company_id and c.user_id=(select auth.uid())));
create policy "Drivers read received job invitations" on public.company_job_invitations for select to authenticated using(exists(select 1 from public.drivers d where d.id=driver_id and d.user_id=(select auth.uid())));
notify pgrst,'reload schema';