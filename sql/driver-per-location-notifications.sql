alter table public.drivers add column preferred_email_enabled_1 boolean not null default true, add column preferred_line_enabled_1 boolean not null default true, add column preferred_email_enabled_2 boolean not null default true, add column preferred_line_enabled_2 boolean not null default true, add column preferred_email_enabled_3 boolean not null default true, add column preferred_line_enabled_3 boolean not null default true;
update public.drivers d set preferred_email_enabled_1=coalesce(d.match_email_enabled,true), preferred_line_enabled_1=coalesce((select p.job_match from public.line_notification_preferences p where p.user_id=d.user_id),true), preferred_email_enabled_2=coalesce(d.match_email_enabled,true), preferred_line_enabled_2=coalesce((select p.job_match from public.line_notification_preferences p where p.user_id=d.user_id),true), preferred_email_enabled_3=coalesce(d.match_email_enabled,true), preferred_line_enabled_3=coalesce((select p.job_match from public.line_notification_preferences p where p.user_id=d.user_id),true);
create or replace function spodora_private.driver_job_area_matches(d public.drivers,j public.jobs,p_channel text)
returns boolean language sql immutable security invoker set search_path='' as $$
 select coalesce(
 (case p_channel when 'email' then d.preferred_email_enabled_1 when 'line' then d.preferred_line_enabled_1 else false end and d.preferred_prefecture=j.work_prefecture and d.preferred_municipality in (j.work_municipality,j.work_prefecture||'全域'))
 or (case p_channel when 'email' then d.preferred_email_enabled_2 when 'line' then d.preferred_line_enabled_2 else false end and d.preferred_prefecture_2=j.work_prefecture and d.preferred_municipality_2 in (j.work_municipality,j.work_prefecture||'全域'))
 or (case p_channel when 'email' then d.preferred_email_enabled_3 when 'line' then d.preferred_line_enabled_3 else false end and d.preferred_prefecture_3=j.work_prefecture and d.preferred_municipality_3 in (j.work_municipality,j.work_prefecture||'全域')),false);
$$;
revoke all on function spodora_private.driver_job_area_matches(public.drivers,public.jobs,text) from public,anon,authenticated;
grant execute on function spodora_private.driver_job_area_matches(public.drivers,public.jobs,text) to service_role;
CREATE OR REPLACE FUNCTION public.save_driver_preferences(p_profile jsonb, p_line jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_uid uuid := auth.uid(); n integer; suffix text; pref text; mun text;
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 if jsonb_typeof(p_profile) is distinct from 'object' or jsonb_typeof(p_line) is distinct from 'object' then raise exception 'Invalid preferences'; end if;
 if coalesce(trim(p_profile->>'name'),'')='' or coalesce(trim(p_profile->>'phone'),'')='' then raise exception 'Name and phone required'; end if;
 for n in 1..3 loop
  suffix := case when n=1 then '' else '_'||n end;
  pref := nullif(p_profile->>('preferred_prefecture'||suffix),'');
  mun := nullif(p_profile->>('preferred_municipality'||suffix),'');
  if (pref is null) <> (mun is null) then raise exception 'Incomplete location'; end if;
 end loop;
 if jsonb_typeof(p_line->'job_match') is distinct from 'boolean' or jsonb_typeof(p_line->'application_result') is distinct from 'boolean' or jsonb_typeof(p_line->'work_reminder') is distinct from 'boolean' then raise exception 'Invalid LINE settings'; end if;
 update public.drivers set
  name=trim(p_profile->>'name'),phone=trim(p_profile->>'phone'),
  preferred_area=nullif(p_profile->>'preferred_municipality',''),
  preferred_prefecture=nullif(p_profile->>'preferred_prefecture',''),preferred_municipality=nullif(p_profile->>'preferred_municipality',''),
  preferred_prefecture_2=nullif(p_profile->>'preferred_prefecture_2',''),preferred_municipality_2=nullif(p_profile->>'preferred_municipality_2',''),
  preferred_prefecture_3=nullif(p_profile->>'preferred_prefecture_3',''),preferred_municipality_3=nullif(p_profile->>'preferred_municipality_3',''),
  preferred_email_enabled_1=coalesce((p_profile->>'preferred_email_enabled_1')::boolean,preferred_email_enabled_1),
  preferred_line_enabled_1=coalesce((p_profile->>'preferred_line_enabled_1')::boolean,preferred_line_enabled_1),
  preferred_email_enabled_2=coalesce((p_profile->>'preferred_email_enabled_2')::boolean,preferred_email_enabled_2),
  preferred_line_enabled_2=coalesce((p_profile->>'preferred_line_enabled_2')::boolean,preferred_line_enabled_2),
  preferred_email_enabled_3=coalesce((p_profile->>'preferred_email_enabled_3')::boolean,preferred_email_enabled_3),
  preferred_line_enabled_3=coalesce((p_profile->>'preferred_line_enabled_3')::boolean,preferred_line_enabled_3),
  match_email_enabled=(p_profile->>'match_email_enabled')::boolean,
  preferred_vehicle_types=array(select jsonb_array_elements_text(p_profile->'preferred_vehicle_types')),
  preferred_weekdays=array(select x::integer from jsonb_array_elements_text(p_profile->'preferred_weekdays') x),
  preferred_time_slots=array(select jsonb_array_elements_text(p_profile->'preferred_time_slots')),
  license_type=p_profile->>'license_type',experience=p_profile->>'experience'
 where user_id=v_uid;
 if not found then raise exception 'Driver profile not found'; end if;
 insert into public.line_notification_preferences(user_id,job_match,application_result,work_reminder)
 values(v_uid,(p_line->>'job_match')::boolean,(p_line->>'application_result')::boolean,(p_line->>'work_reminder')::boolean)
 on conflict(user_id) do update set job_match=excluded.job_match,application_result=excluded.application_result,work_reminder=excluded.work_reminder;
end;$function$;

CREATE OR REPLACE FUNCTION public.create_driver_profile_from_auth()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.raw_user_meta_data ? 'driver_name' then
    insert into public.drivers (
      user_id, email, name, phone,
      preferred_area, preferred_prefecture, preferred_municipality,
      preferred_prefecture_2, preferred_municipality_2, preferred_prefecture_3, preferred_municipality_3,
      preferred_email_enabled_1, preferred_line_enabled_1, preferred_email_enabled_2, preferred_line_enabled_2, preferred_email_enabled_3, preferred_line_enabled_3,
      match_email_enabled, license_type, experience,
      acquisition_source, acquisition_medium, acquisition_campaign,
      acquisition_content, acquisition_ref
    ) values (
      new.id, new.email,
      coalesce(new.raw_user_meta_data->>'driver_name',''),
      new.raw_user_meta_data->>'driver_phone',
      new.raw_user_meta_data->>'driver_area',
      new.raw_user_meta_data->>'driver_prefecture',
      new.raw_user_meta_data->>'driver_municipality',
      nullif(new.raw_user_meta_data->>'driver_prefecture_2',''), nullif(new.raw_user_meta_data->>'driver_municipality_2',''),
      nullif(new.raw_user_meta_data->>'driver_prefecture_3',''), nullif(new.raw_user_meta_data->>'driver_municipality_3',''),
      coalesce((new.raw_user_meta_data->>'preferred_email_enabled_1')::boolean,true),
      coalesce((new.raw_user_meta_data->>'preferred_line_enabled_1')::boolean,true),
      coalesce((new.raw_user_meta_data->>'preferred_email_enabled_2')::boolean,true),
      coalesce((new.raw_user_meta_data->>'preferred_line_enabled_2')::boolean,true),
      coalesce((new.raw_user_meta_data->>'preferred_email_enabled_3')::boolean,true),
      coalesce((new.raw_user_meta_data->>'preferred_line_enabled_3')::boolean,true),
      coalesce((new.raw_user_meta_data->>'match_email_enabled')::boolean,true),
      new.raw_user_meta_data->>'driver_license',
      new.raw_user_meta_data->>'driver_experience',
      new.raw_user_meta_data->>'acquisition_source',
      new.raw_user_meta_data->>'acquisition_medium',
      new.raw_user_meta_data->>'acquisition_campaign',
      new.raw_user_meta_data->>'acquisition_content',
      new.raw_user_meta_data->>'acquisition_ref'
    )
    on conflict (user_id) do update set
      email=excluded.email,
      name=excluded.name,
      phone=excluded.phone,
      preferred_area=excluded.preferred_area,
      preferred_prefecture=excluded.preferred_prefecture,
      preferred_municipality=excluded.preferred_municipality,
      preferred_prefecture_2=excluded.preferred_prefecture_2, preferred_municipality_2=excluded.preferred_municipality_2,
      preferred_prefecture_3=excluded.preferred_prefecture_3, preferred_municipality_3=excluded.preferred_municipality_3,
      preferred_email_enabled_1=excluded.preferred_email_enabled_1,
      preferred_line_enabled_1=excluded.preferred_line_enabled_1,
      preferred_email_enabled_2=excluded.preferred_email_enabled_2,
      preferred_line_enabled_2=excluded.preferred_line_enabled_2,
      preferred_email_enabled_3=excluded.preferred_email_enabled_3,
      preferred_line_enabled_3=excluded.preferred_line_enabled_3,
      match_email_enabled=excluded.match_email_enabled,
      license_type=excluded.license_type,
      experience=excluded.experience,
      acquisition_source=excluded.acquisition_source,
      acquisition_medium=excluded.acquisition_medium,
      acquisition_campaign=excluded.acquisition_campaign,
      acquisition_content=excluded.acquisition_content,
      acquisition_ref=excluded.acquisition_ref;
    if new.raw_user_meta_data ? 'match_line_enabled' then
      insert into public.line_notification_preferences(user_id,job_match)
      values(new.id,coalesce((new.raw_user_meta_data->>'match_line_enabled')::boolean,false))
      on conflict(user_id) do update set job_match=excluded.job_match;
    end if;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION spodora_private.line_job_notifications()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d record; v text; slot text;
begin
 if new.status<>'募集中' or new.work_date<(now() at time zone 'Asia/Tokyo')::date or coalesce(new.visibility,'公開') not in ('all','公開','public','') then return new; end if;
 if tg_op='UPDATE' and old.status='募集中' then return new; end if;
 v:=case new.vehicle_type when '2tトラック' then '2t' when '4tトラック' then '4t' else new.vehicle_type end;
 slot:=case when extract(hour from new.start_time)<6 then 'early' when extract(hour from new.start_time)<12 then 'morning' when extract(hour from new.start_time)<18 then 'afternoon' else 'evening' end;
 for d in select x.* from public.drivers x join public.line_connections c on c.user_id=x.user_id and c.active
 where not coalesce(x.is_paused,false) and spodora_private.driver_job_area_matches(x,new,'line')
 and (coalesce(cardinality(x.preferred_vehicle_types),0)=0 or v=any(x.preferred_vehicle_types))
 and (coalesce(cardinality(x.preferred_weekdays),0)=0 or extract(dow from new.work_date)::integer=any(x.preferred_weekdays))
 and (coalesce(cardinality(x.preferred_time_slots),0)=0 or slot=any(x.preferred_time_slots))
 and not exists(select 1 from public.company_driver_blocks b where b.company_id=new.company_id and b.driver_id=x.id)
 loop
 perform spodora_private.enqueue_line(d.user_id,'job_match','job:'||new.id,
 '【スポドラ】希望条件に合う新しい求人が掲載されました。'||E'\n'||left(coalesce(new.job_description,'ドライバー求人'),200)||E'\n勤務日：'||new.work_date||E'\n勤務地：'||coalesce(new.work_prefecture,'')||' '||coalesce(new.work_municipality,'')||E'\n詳細・応募：https://spodora.com/driver.html',new.id);
 end loop;
 return new;
end;$function$;

CREATE OR REPLACE FUNCTION spodora_private.claim_line_notifications()
 RETURNS SETOF line_notification_queue
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform spodora_private.prepare_line_reminders();
 update public.line_notification_queue q set state='skipped' where q.state in ('pending','sending') and (
 q.expires_at<=now() or q.attempts>=6 or q.first_attempt_at<now()-interval '22 hours'
 or not exists(select 1 from public.line_connections c where c.user_id=q.user_id and c.active and (q.destination is null or c.line_user_id=q.destination))
 or exists(select 1 from public.line_notification_preferences p where p.user_id=q.user_id and not case q.kind when 'job_match' then p.job_match when 'application_result' then p.application_result when 'work_reminder' then p.work_reminder when 'new_application' then p.new_application else true end)
 or (q.kind='job_match' and exists(select 1 from public.drivers d join public.jobs j on j.id=q.job_id where d.user_id=q.user_id and (d.is_paused or not spodora_private.driver_job_area_matches(d,j,'line'))))
 or (q.kind in ('job_match','work_reminder') and exists(select 1 from public.jobs j where j.id=q.job_id and (j.status='キャンセル' or (q.kind='job_match' and j.status<>'募集中'))))
 or (q.kind='work_reminder' and not exists(select 1 from public.applications a where a.id=q.application_id and a.status in ('採用','勤務確定')))
 );
 return query with picked as (
 select q.id from public.line_notification_queue q where (q.state='pending' or(q.state='sending' and q.lease_until<now())) and q.available_at<=now() order by q.created_at for update skip locked limit 10
 ) update public.line_notification_queue q set state='sending',attempts=q.attempts+1,lease_until=now()+interval '5 minutes',first_attempt_at=coalesce(q.first_attempt_at,now()),destination=coalesce(q.destination,(select c.line_user_id from public.line_connections c where c.user_id=q.user_id))
 from picked where q.id=picked.id returning q.*;
end;$function$;
