-- Application-created transactional emails. No browser writes or recipient overrides.
create table public.company_application_email_queue (
 id uuid primary key default gen_random_uuid(),
 company_id bigint not null references public.companies(id) on delete cascade,
 application_id bigint not null unique references public.applications(id) on delete cascade,
 job_id bigint not null references public.jobs(id) on delete cascade,
 recipient text not null,
 subject text not null,
 message text not null,
 state text not null default 'pending' check(state in ('pending','sending','sent','failed','skipped')),
 attempts integer not null default 0,
 available_at timestamptz not null default now(),
 lease_until timestamptz,
 first_attempt_at timestamptz,
 last_status integer,
 provider_email_id text,
 sent_at timestamptz,
 created_at timestamptz not null default now()
);
create index company_application_email_pending_idx on public.company_application_email_queue(available_at,created_at) where state in ('pending','sending');
alter table public.company_application_email_queue enable row level security;
revoke all on public.company_application_email_queue from anon,authenticated;
grant select,update on public.company_application_email_queue to service_role;

create function spodora_private.queue_company_application_email() returns trigger
language plpgsql security definer set search_path='' as $$
declare j record; c record; recipient_email text; driver_name text;
begin
 select id,company_id,job_description,work_date,start_time,end_time into j from public.jobs where id=new.job_id;
 select company_name,user_id,email into c from public.companies where id=j.company_id;
 if c.user_id is null then return new; end if;
 select coalesce(nullif(trim(c.email),''),u.email) into recipient_email from auth.users u where u.id=c.user_id;
 if recipient_email is null or trim(recipient_email)='' then return new;end if;
 select name into driver_name from public.drivers where id=new.driver_id;
 insert into public.company_application_email_queue(company_id,application_id,job_id,recipient,subject,message)
 values(j.company_id,new.id,j.id,recipient_email,
 '【スポドラ】求人に新しい応募が届きました｜'||left(coalesce(j.job_description,'ドライバー求人'),100),
 coalesce(c.company_name,'企業')||' ご担当者様'||chr(10)||chr(10)||
 '掲載中の求人に新しい応募がありました。'||chr(10)||chr(10)||
 '求人：'||coalesce(j.job_description,'ドライバー求人')||chr(10)||
 '勤務日：'||coalesce(j.work_date::text,'未設定')||chr(10)||
 '勤務時間：'||coalesce(left(j.start_time::text,5),'')||'〜'||coalesce(left(j.end_time::text,5),'')||chr(10)||
 '応募者：'||coalesce(driver_name,'ドライバー')||chr(10)||chr(10)||
 '応募者の確認・選考は企業画面からお願いします。'||chr(10)||
 'https://spodora.com/company-applicants.html'||chr(10)||chr(10)||'スポドラ')
 on conflict(application_id) do nothing;
 return new;
end;
$$;
revoke all on function spodora_private.queue_company_application_email() from public,anon,authenticated;
create trigger company_application_email after insert on public.applications for each row execute function spodora_private.queue_company_application_email();

create function spodora_private.claim_company_application_emails() returns setof public.company_application_email_queue
language plpgsql security definer set search_path='' as $$
begin
 update public.company_application_email_queue q set state='skipped',lease_until=null
 where state in ('pending','sending') and (attempts>=6 or created_at<now()-interval '22 hours');
 return query with picked as (
 select q.id from public.company_application_email_queue q
 where (q.state='pending' or (q.state='sending' and q.lease_until<now())) and q.available_at<=now()
 order by q.created_at for update skip locked limit 10
 ) update public.company_application_email_queue q
 set state='sending',attempts=q.attempts+1,lease_until=now()+interval '5 minutes',first_attempt_at=coalesce(q.first_attempt_at,now())
 from picked where q.id=picked.id returning q.*;
end;
$$;
revoke all on function spodora_private.claim_company_application_emails() from public,anon,authenticated;
grant usage on schema spodora_private to service_role;
grant execute on function spodora_private.claim_company_application_emails() to service_role;
create function public.claim_company_application_emails() returns setof public.company_application_email_queue
language sql security invoker set search_path='' as $$select * from spodora_private.claim_company_application_emails();$$;
revoke all on function public.claim_company_application_emails() from public,anon,authenticated;
grant execute on function public.claim_company_application_emails() to service_role;
notify pgrst,'reload schema';
