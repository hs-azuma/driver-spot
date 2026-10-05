-- Company QR generation and driver-owned attendance. Never toggles on repeated scans.
create or replace function spodora_private.attendance_company_qr(p_regenerate boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.companies%rowtype;
begin
 select * into c from public.companies where user_id=auth.uid() for update;
 if not found then raise exception '企業アカウントでログインしてください'; end if;
 if c.attendance_token is null or p_regenerate then
  update public.companies set attendance_token=gen_random_uuid() where id=c.id returning * into c;
 end if;
 return jsonb_build_object('company_name',c.company_name,'token',c.attendance_token);
end $$;

create or replace function spodora_private.company_scan_work(p_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.companies%rowtype; d bigint; rows jsonb;
begin
 select * into c from public.companies where attendance_token=p_token;
 if not found then raise exception 'このQRは無効です。企業の最新のQRを読み取ってください'; end if;
 select id into d from public.drivers where user_id=auth.uid();
 if d is null then raise exception 'ドライバーとしてログインしてください'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'title',j.job_description,'work_date',j.work_date,'start_time',j.start_time,'end_time',j.end_time,'checked_in_at',a.checked_in_at,'checked_out_at',a.checked_out_at) order by j.work_date,j.start_time,a.id),'[]'::jsonb) into rows
 from public.applications a join public.jobs j on j.id=a.job_id
 where a.driver_id=d and j.company_id=c.id and j.status is distinct from 'キャンセル' and a.status in ('勤務確定','勤務完了')
 and (j.work_date=(now() at time zone 'Asia/Tokyo')::date or (a.checked_in_at is not null and a.checked_out_at is null and a.status='勤務確定'));
 return jsonb_build_object('company_name',c.company_name,'work',rows);
end $$;

create or replace function spodora_private.punch_company_qr(p_token uuid,p_application_id bigint,p_action text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c bigint; d bigint; a public.applications%rowtype;
begin
 if p_action is null or p_action not in ('in','out') then raise exception '打刻種別が不正です'; end if;
 -- Serialize with regeneration: an invalidated token cannot commit a later punch.
 select id into c from public.companies where attendance_token=p_token for share;
 if c is null then raise exception 'このQRは無効です。企業の最新のQRを読み取ってください'; end if;
 select id into d from public.drivers where user_id=auth.uid();
 if d is null then raise exception 'ドライバーとしてログインしてください'; end if;
 select ap.* into a from public.applications ap join public.jobs j on j.id=ap.job_id
 where ap.id=p_application_id and ap.driver_id=d and j.company_id=c
 and j.status is distinct from 'キャンセル' and ap.status in ('勤務確定','勤務完了')
 and (j.work_date=(now() at time zone 'Asia/Tokyo')::date or (ap.checked_in_at is not null and ap.checked_out_at is null and ap.status='勤務確定')) for update of ap;
 if not found then raise exception 'この企業で本日打刻できる勤務がありません'; end if;
 if a.checked_out_at is not null then
  return jsonb_build_object('message','すでに退勤済みです','checked_in_at',a.checked_in_at,'checked_out_at',a.checked_out_at,'already_recorded',true);
 end if;
 if p_action='in' then
  if a.checked_in_at is not null then
   return jsonb_build_object('message','すでに出勤済みです','checked_in_at',a.checked_in_at,'already_recorded',true);
  end if;
  if a.status<>'勤務確定' then raise exception 'この勤務は完了しています'; end if;
  update public.applications set checked_in_at=now(),attendance_method='qr' where id=a.id returning * into a;
 else
  if a.checked_in_at is null then raise exception '先に出勤打刻をしてください'; end if;
  update public.applications set checked_out_at=now(),attendance_method='qr',status='勤務完了',completed_at=coalesce(completed_at,now()) where id=a.id returning * into a;
 end if;
 return jsonb_build_object('message',case when p_action='in' then '出勤を記録しました' else '退勤を記録しました' end,'checked_in_at',a.checked_in_at,'checked_out_at',a.checked_out_at,'already_recorded',false);
end $$;

create or replace function public.attendance_company_qr(p_regenerate boolean default false) returns jsonb language sql security invoker set search_path='' as $$ select spodora_private.attendance_company_qr(p_regenerate); $$;
create or replace function public.company_scan_work(p_token uuid) returns jsonb language sql security invoker set search_path='' as $$ select spodora_private.company_scan_work(p_token); $$;
create or replace function public.punch_company_qr(p_token uuid,p_application_id bigint,p_action text) returns jsonb language sql security invoker set search_path='' as $$ select spodora_private.punch_company_qr(p_token,p_application_id,p_action); $$;
revoke all on function spodora_private.attendance_company_qr(boolean),spodora_private.company_scan_work(uuid),spodora_private.punch_company_qr(uuid,bigint,text),public.attendance_company_qr(boolean),public.company_scan_work(uuid),public.punch_company_qr(uuid,bigint,text) from public,anon;
grant usage on schema spodora_private to authenticated;
grant execute on function spodora_private.attendance_company_qr(boolean),spodora_private.company_scan_work(uuid),spodora_private.punch_company_qr(uuid,bigint,text),public.attendance_company_qr(boolean),public.company_scan_work(uuid),public.punch_company_qr(uuid,bigint,text) to authenticated;
