create table public.job_drafts(
 id uuid primary key default gen_random_uuid(),
 company_id bigint not null references public.companies(id) on delete cascade,
 content jsonb not null default '{}'::jsonb check(jsonb_typeof(content)='object' and octet_length(content::text)<=100000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index job_drafts_company_updated on public.job_drafts(company_id,updated_at desc);
alter table public.job_drafts enable row level security;
revoke all on public.job_drafts from public,anon,authenticated;
grant select,insert,update,delete on public.job_drafts to authenticated;
create policy company_owns_drafts on public.job_drafts for all to authenticated
 using(exists(select 1 from public.companies c where c.id=job_drafts.company_id and c.user_id=(select auth.uid())))
 with check(exists(select 1 from public.companies c where c.id=job_drafts.company_id and c.user_id=(select auth.uid())));
create function public.publish_job_draft(p_draft_id uuid,p_job jsonb) returns bigint
 language plpgsql security invoker set search_path='' as $$
declare d public.job_drafts; job_id bigint;
begin
 if auth.uid() is null then raise exception 'Login required';end if;
 select * into d from public.job_drafts where id=p_draft_id for update;
 if not found then raise exception 'Draft not found or already published';end if;
 if not exists(select 1 from public.companies c where c.id=d.company_id and c.user_id=auth.uid()) then raise exception 'Forbidden';end if;
 insert into public.jobs(company_id,job_description,job_detail,location,destination,access_note,work_prefecture,work_municipality,work_date,start_time,end_time,break_minutes,required_headcount,pay_guarantee,pay_type,pay_amount,transportation_fee,transportation_fee_type,required_license,required_experience,vehicle_type,notes,status)
 values(d.company_id,p_job->>'job_description',p_job->>'job_detail',p_job->>'location',p_job->>'destination',p_job->>'access_note',p_job->>'work_prefecture',p_job->>'work_municipality',(p_job->>'work_date')::date,(p_job->>'start_time')::time,(p_job->>'end_time')::time,(p_job->>'break_minutes')::integer,(p_job->>'required_headcount')::integer,(p_job->>'pay_guarantee')::boolean,p_job->>'pay_type',(p_job->>'pay_amount')::numeric,(p_job->>'transportation_fee')::integer,p_job->>'transportation_fee_type',p_job->>'required_license',p_job->>'required_experience',p_job->>'vehicle_type',p_job->>'notes','募集中')
 returning id into job_id;
 delete from public.job_drafts where id=d.id;
 return job_id;
end $$;
revoke all on function public.publish_job_draft(uuid,jsonb) from public,anon;
grant execute on function public.publish_job_draft(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
