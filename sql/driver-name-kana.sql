alter table public.drivers add column name_kana text;
alter table public.drivers add constraint drivers_name_kana_check check (
 name_kana is null or (char_length(name_kana)<=100 and name_kana ~ '^[ァ-ヺー・ ]+$' and name_kana ~ '[ァ-ヺ]')
);
comment on column public.drivers.name_kana is '氏名のフリガナ（全角カタカナ、空白・中点・長音を許可）。既存未登録はNULL。';
CREATE OR REPLACE FUNCTION public.create_driver_profile_from_auth()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.raw_user_meta_data ? 'driver_name' then
    insert into public.drivers (
      user_id, email, name, name_kana, phone,
      preferred_area, preferred_prefecture, preferred_municipality,
      preferred_prefecture_2, preferred_municipality_2, preferred_prefecture_3, preferred_municipality_3,
      preferred_email_enabled_1, preferred_line_enabled_1, preferred_email_enabled_2, preferred_line_enabled_2, preferred_email_enabled_3, preferred_line_enabled_3,
      match_email_enabled, license_type, experience,
      acquisition_source, acquisition_medium, acquisition_campaign,
      acquisition_content, acquisition_ref
    ) values (
      new.id, new.email,
      coalesce(new.raw_user_meta_data->>'driver_name',''),
      nullif(trim(new.raw_user_meta_data->>'driver_name_kana'),''),
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
      name_kana=coalesce(excluded.name_kana,public.drivers.name_kana),
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
  name=trim(p_profile->>'name'),
  name_kana=case when p_profile ? 'name_kana' then nullif(trim(p_profile->>'name_kana'),'') else name_kana end,
  phone=trim(p_profile->>'phone'),
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

notify pgrst,'reload schema';
