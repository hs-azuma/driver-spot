create schema if not exists spodora_private;
revoke all on schema spodora_private from public,anon,authenticated;
grant usage on schema spodora_private to service_role;
create table public.line_notification_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 job_match boolean not null default true, application_result boolean not null default true,
 work_reminder boolean not null default true, new_application boolean not null default true
);
alter table public.line_notification_preferences enable row level security;
revoke all on public.line_notification_preferences from public,anon,authenticated;
grant select,insert,update on public.line_notification_preferences to authenticated;
grant all on public.line_notification_preferences to service_role;
create policy own_preferences on public.line_notification_preferences to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create table public.line_notification_queue (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check(kind in ('job_match','application_result','work_reminder','new_application','test')),
 event_key text not null, job_id bigint references public.jobs(id) on delete cascade,
 application_id bigint references public.applications(id) on delete cascade,
 message text not null check(length(message)<=4500),
 state text not null default 'pending' check(state in ('pending','sending','sent','skipped','failed')),
 attempts integer not null default 0, available_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '1 day', lease_until timestamptz,
 first_attempt_at timestamptz, destination text, last_status integer, sent_at timestamptz,
 created_at timestamptz not null default now(), unique(user_id,event_key)
);
alter table public.line_notification_queue enable row level security;
revoke all on public.line_notification_queue from public,anon,authenticated;
grant all on public.line_notification_queue to service_role;
create index line_queue_pending on public.line_notification_queue(available_at) where state in ('pending','sending');
create function spodora_private.enqueue_line(p_user uuid,p_kind text,p_key text,p_message text,p_job bigint default null,p_application bigint default null) returns void language sql security definer set search_path='' as $$
 insert into public.line_notification_queue(user_id,kind,event_key,message,job_id,application_id)
 select p_user,p_kind,p_key,left(p_message,4500),p_job,p_application
 where exists(select 1 from public.line_connections where user_id=p_user and active)
 on conflict(user_id,event_key) do nothing;
$$;
revoke all on function spodora_private.enqueue_line(uuid,text,text,text,bigint,bigint) from public,anon,authenticated;
create function spodora_private.line_job_notifications() returns trigger language plpgsql security definer set search_path='' as $$
declare d record; v text; slot text;
begin
 if new.status<>'募集中' or new.work_date<(now() at time zone 'Asia/Tokyo')::date or coalesce(new.visibility,'公開') not in ('all','公開','public','') then return new; end if;
 if tg_op='UPDATE' and old.status='募集中' then return new; end if;
 v:=case new.vehicle_type when '2tトラック' then '2t' when '4tトラック' then '4t' else new.vehicle_type end;
 slot:=case when extract(hour from new.start_time)<6 then 'early' when extract(hour from new.start_time)<12 then 'morning' when extract(hour from new.start_time)<18 then 'afternoon' else 'evening' end;
 for d in select x.* from public.drivers x join public.line_connections c on c.user_id=x.user_id and c.active
 where not coalesce(x.is_paused,false) and x.preferred_prefecture=new.work_prefecture
 and x.preferred_municipality in (new.work_municipality,new.work_prefecture||'全域')
 and (coalesce(cardinality(x.preferred_vehicle_types),0)=0 or v=any(x.preferred_vehicle_types))
 and (coalesce(cardinality(x.preferred_weekdays),0)=0 or extract(dow from new.work_date)::integer=any(x.preferred_weekdays))
 and (coalesce(cardinality(x.preferred_time_slots),0)=0 or slot=any(x.preferred_time_slots))
 and not exists(select 1 from public.company_driver_blocks b where b.company_id=new.company_id and b.driver_id=x.id)
 loop
 perform spodora_private.enqueue_line(d.user_id,'job_match','job:'||new.id,
 '【スポドラ】希望条件に合う新しい求人が掲載されました。'||E'\n'||left(coalesce(new.job_description,'ドライバー求人'),200)||E'\n勤務日：'||new.work_date||E'\n勤務地：'||coalesce(new.work_prefecture,'')||' '||coalesce(new.work_municipality,'')||E'\n詳細・応募：https://spodora.com/driver.html',new.id);
 end loop;
 return new;
end;$$;
revoke all on function spodora_private.line_job_notifications() from public,anon,authenticated;
create trigger line_job_notifications after insert or update of status on public.jobs for each row execute function spodora_private.line_job_notifications();
create function spodora_private.line_application_notifications() returns trigger language plpgsql security definer set search_path='' as $$
declare j record; driver_user uuid; company_user uuid;
begin
 select * into j from public.jobs where id=new.job_id;
 select user_id into driver_user from public.drivers where id=new.driver_id;
 select user_id into company_user from public.companies where id=j.company_id;
 if tg_op='INSERT' then
 perform spodora_private.enqueue_line(company_user,'new_application','application:'||new.id,
 '【スポドラ】求人に新しい応募が届きました。'||E'\n'||left(coalesce(j.job_description,'ドライバー求人'),200)||E'\n勤務日：'||j.work_date||E'\n応募者の確認：https://spodora.com/company-applicants.html',j.id,new.id);
 elsif new.status is distinct from old.status and new.status in ('採用','勤務確定','不採用','見送り') then
 if new.status='勤務確定' and old.status='採用' then return new; end if;
 perform spodora_private.enqueue_line(driver_user,'application_result','result:'||new.id||':'||case when new.status in ('不採用','見送り') then 'rejected' else 'hired' end,
 '【スポドラ】'||case when new.status in ('不採用','見送り') then '選考結果：今回は見送りとなりました。' else '採用が確定しました。勤務日時・場所をご確認ください。' end||E'\n'||left(coalesce(j.job_description,'ドライバー求人'),200)||E'\n勤務日：'||j.work_date||E'\n確認：https://spodora.com/driver.html',j.id,new.id);
 end if;
 return new;
end;$$;
revoke all on function spodora_private.line_application_notifications() from public,anon,authenticated;
create trigger line_application_notifications after insert or update of status on public.applications for each row execute function spodora_private.line_application_notifications();
create function spodora_private.prepare_line_reminders(p_clock timestamptz default now()) returns void language sql security definer set search_path='' as $$
 insert into public.line_notification_queue(user_id,kind,event_key,message,job_id,application_id,expires_at)
 select d.user_id,'work_reminder','reminder:'||a.id||':'||j.work_date,
 '【スポドラ】明日の勤務のお知らせです。'||E'\n'||left(coalesce(j.job_description,'ドライバー業務'),200)||E'\n勤務日：'||j.work_date||E'\n開始：'||j.start_time||E'\n集合場所：'||left(coalesce(j.location,''),250)||E'\n詳細：https://spodora.com/driver.html',j.id,a.id,((j.work_date+j.start_time) at time zone 'Asia/Tokyo')
 from public.applications a join public.jobs j on j.id=a.job_id join public.drivers d on d.id=a.driver_id
 join public.line_connections c on c.user_id=d.user_id and c.active
 where a.status in ('採用','勤務確定') and j.status<>'キャンセル'
 and j.work_date=(p_clock at time zone 'Asia/Tokyo')::date+1
 and (p_clock at time zone 'Asia/Tokyo')::time>='18:00'::time
 on conflict(user_id,event_key) do nothing;
$$;
revoke all on function spodora_private.prepare_line_reminders(timestamptz) from public,anon,authenticated;
grant execute on function spodora_private.prepare_line_reminders(timestamptz) to service_role;
create function spodora_private.claim_line_notifications() returns setof public.line_notification_queue language plpgsql security definer set search_path='' as $$
begin
 perform spodora_private.prepare_line_reminders();
 update public.line_notification_queue q set state='skipped' where q.state in ('pending','sending') and (
 q.expires_at<=now() or q.attempts>=6 or q.first_attempt_at<now()-interval '22 hours'
 or not exists(select 1 from public.line_connections c where c.user_id=q.user_id and c.active and (q.destination is null or c.line_user_id=q.destination))
 or exists(select 1 from public.line_notification_preferences p where p.user_id=q.user_id and not case q.kind when 'job_match' then p.job_match when 'application_result' then p.application_result when 'work_reminder' then p.work_reminder when 'new_application' then p.new_application else true end)
 or (q.kind='job_match' and exists(select 1 from public.drivers d where d.user_id=q.user_id and d.is_paused))
 or (q.kind in ('job_match','work_reminder') and exists(select 1 from public.jobs j where j.id=q.job_id and (j.status='キャンセル' or (q.kind='job_match' and j.status<>'募集中'))))
 or (q.kind='work_reminder' and not exists(select 1 from public.applications a where a.id=q.application_id and a.status in ('採用','勤務確定')))
 );
 return query with picked as (
 select q.id from public.line_notification_queue q where (q.state='pending' or(q.state='sending' and q.lease_until<now())) and q.available_at<=now() order by q.created_at for update skip locked limit 10
 ) update public.line_notification_queue q set state='sending',attempts=q.attempts+1,lease_until=now()+interval '5 minutes',first_attempt_at=coalesce(q.first_attempt_at,now()),destination=coalesce(q.destination,(select c.line_user_id from public.line_connections c where c.user_id=q.user_id))
 from picked where q.id=picked.id returning q.*;
end;$$;
revoke all on function spodora_private.claim_line_notifications() from public,anon,authenticated;
grant execute on function spodora_private.claim_line_notifications() to service_role;
create function public.claim_line_notifications() returns setof public.line_notification_queue language sql security invoker set search_path='' as $$ select * from spodora_private.claim_line_notifications(); $$;
revoke all on function public.claim_line_notifications() from public,anon,authenticated;
grant execute on function public.claim_line_notifications() to service_role;
