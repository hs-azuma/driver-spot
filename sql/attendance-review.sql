create table public.attendance_review_requests (
 id uuid primary key default gen_random_uuid(),
 application_id bigint not null references public.applications(id) on delete cascade,
 requested_by uuid not null,
 requested_in timestamptz not null,
 requested_out timestamptz not null,
 break_minutes integer not null check (break_minutes>=0),
 reason text not null check (length(trim(reason)) between 1 and 1000),
 original_in timestamptz,
 original_out timestamptz,
 job_context jsonb not null,
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 created_at timestamptz not null default now(),
 reviewed_at timestamptz,
 reviewed_by uuid,
 review_comment text,
 effective_pay_guarantee boolean,
 approved_work_seconds numeric,
 approved_basic_amount numeric,
 check (requested_out>requested_in),
 check (break_minutes*60<=extract(epoch from requested_out-requested_in))
);
create index attendance_review_application_idx on public.attendance_review_requests(application_id,created_at desc);
create unique index attendance_review_one_pending on public.attendance_review_requests(application_id) where status='pending';
alter table public.attendance_review_requests enable row level security;
revoke all on public.attendance_review_requests from public,anon,authenticated;
grant select on public.attendance_review_requests to authenticated;
create policy attendance_review_read_own on public.attendance_review_requests for select to authenticated
using(exists(select 1 from public.applications a join public.jobs j on j.id=a.job_id
 left join public.drivers d on d.id=a.driver_id left join public.companies c on c.id=j.company_id
 where a.id=application_id and (d.user_id=(select auth.uid()) or c.user_id=(select auth.uid()))));
create or replace function spodora_private.attendance_job_context(j public.jobs, policy boolean)
returns jsonb language sql immutable security invoker set search_path='' as $$
 select jsonb_build_object('work_date',j.work_date,'start_time',j.start_time,'end_time',j.end_time,'break_minutes',j.break_minutes,'pay_type',j.pay_type,'pay_amount',j.pay_amount,'pay_guarantee',policy)
$$;
revoke all on function spodora_private.attendance_job_context(public.jobs,boolean) from public,anon,authenticated;

create or replace function spodora_private.request_attendance_review(p_application_id bigint,p_checked_in_at timestamptz,p_checked_out_at timestamptz,p_break_minutes integer,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare a public.applications%rowtype; j public.jobs%rowtype; result_id uuid;
begin
 if auth.uid() is null then raise exception 'ログインしてください。'; end if;
 select ap.* into a from public.applications ap join public.drivers d on d.id=ap.driver_id
 where ap.id=p_application_id and d.user_id=auth.uid() for update of ap;
 if not found then raise exception 'この勤務を申請する権限がありません。'; end if;
 select * into j from public.jobs where id=a.job_id;
 if a.status not in ('勤務確定','勤務完了') or j.status='キャンセル' then raise exception 'この勤務は申請できません。'; end if;
 if p_checked_in_at is null or p_checked_out_at is null or p_checked_out_at<=p_checked_in_at
 or p_checked_out_at-p_checked_in_at>interval '24 hours' or p_checked_out_at>now()+interval '5 minutes'
 or (p_checked_in_at at time zone 'Asia/Tokyo')::date not between j.work_date and j.work_date+1
 then raise exception '実際の出退勤日時を確認してください（勤務日から24時間以内）。'; end if;
 if p_break_minutes is null or p_break_minutes<0 or p_break_minutes*60>extract(epoch from p_checked_out_at-p_checked_in_at) then raise exception '実際の休憩時間を確認してください。'; end if;
 if length(trim(coalesce(p_reason,''))) not between 1 and 1000 then raise exception '確認・修正の理由を1〜1000文字で入力してください。'; end if;
 if exists(select 1 from public.attendance_review_requests where application_id=a.id and status='pending') then raise exception '申請中です。企業の確認をお待ちください。'; end if;
 insert into public.attendance_review_requests(application_id,requested_by,requested_in,requested_out,break_minutes,reason,original_in,original_out,job_context)
 values(a.id,auth.uid(),p_checked_in_at,p_checked_out_at,p_break_minutes,trim(p_reason),a.checked_in_at,a.checked_out_at,spodora_private.attendance_job_context(j,a.pay_guarantee_snapshot))
 returning id into result_id;
 return result_id;
end $$;
revoke all on function spodora_private.request_attendance_review(bigint,timestamptz,timestamptz,integer,text) from public,anon,authenticated;
grant execute on function spodora_private.request_attendance_review(bigint,timestamptz,timestamptz,integer,text) to authenticated;
grant usage on schema spodora_private to authenticated;
create function public.request_attendance_review(p_application_id bigint,p_checked_in_at timestamptz,p_checked_out_at timestamptz,p_break_minutes integer,p_reason text)
returns uuid language sql security invoker set search_path='' as $$
 select spodora_private.request_attendance_review(p_application_id,p_checked_in_at,p_checked_out_at,p_break_minutes,p_reason)
$$;
revoke all on function public.request_attendance_review(bigint,timestamptz,timestamptz,integer,text) from public,anon;
grant execute on function public.request_attendance_review(bigint,timestamptz,timestamptz,integer,text) to authenticated;

create or replace function spodora_private.decide_attendance_review(p_request_id uuid,p_approve boolean,p_comment text,p_pay_guarantee boolean)
returns void language plpgsql security definer set search_path='' as $$
declare r public.attendance_review_requests%rowtype; a public.applications%rowtype; j public.jobs%rowtype; policy boolean; planned numeric; worked numeric; amount numeric; planned_amount numeric;
begin
 if auth.uid() is null or p_approve is null then raise exception '企業のログインが必要です。'; end if;
 -- Lock application first, in the same order as the request function.
 select ap.* into a from public.applications ap join public.jobs jo on jo.id=ap.job_id join public.companies c on c.id=jo.company_id
 join public.attendance_review_requests req on req.application_id=ap.id
 where req.id=p_request_id and c.user_id=auth.uid() for update of ap;
 if not found then raise exception 'この申請を確認する権限がありません。'; end if;
 select * into r from public.attendance_review_requests where id=p_request_id for update;
 if r.status<>'pending' then raise exception 'この申請は確認済みです。'; end if;
 if length(coalesce(p_comment,''))>1000 then raise exception 'コメントは1000文字以内で入力してください。'; end if;
 if not p_approve then
  if trim(coalesce(p_comment,''))='' then raise exception '差し戻し理由を入力してください。'; end if;
  update public.attendance_review_requests set status='rejected',reviewed_at=now(),reviewed_by=auth.uid(),review_comment=trim(p_comment) where id=r.id;
  return;
 end if;
 select * into j from public.jobs where id=a.job_id for share;
 if a.status not in ('勤務確定','勤務完了') or j.status='キャンセル' then raise exception 'この勤務は承認できません。'; end if;
 if a.checked_in_at is distinct from r.original_in or a.checked_out_at is distinct from r.original_out
 or spodora_private.attendance_job_context(j,a.pay_guarantee_snapshot) is distinct from r.job_context
 then raise exception '申請後に勤怠または求人条件が変わりました。差し戻して再申請してください。'; end if;
 policy=coalesce(a.pay_guarantee_snapshot,p_pay_guarantee);
 if policy is null then raise exception '給与保証の条件が未設定です。ドライバーと確認し、承認時の給与条件を選択してください。'; end if;
 planned=extract(epoch from j.end_time-j.start_time);
 if planned<0 then planned=planned+86400; end if;
 planned=planned-j.break_minutes*60;
 worked=extract(epoch from r.requested_out-r.requested_in)-r.break_minutes*60;
 if j.pay_amount is null or j.pay_amount<0 or j.pay_type not in ('時給','日給') or planned is null or planned<=0 then raise exception '求人の勤務時間・給与設定を確認してください。'; end if;
 if j.pay_type='時給' then
  amount=round(j.pay_amount*worked/3600); planned_amount=round(j.pay_amount*planned/3600);
 else
  amount=round(j.pay_amount*worked/planned); planned_amount=j.pay_amount;
 end if;
 if policy then amount=greatest(amount,planned_amount); end if;
 perform public.company_manual_attendance(a.id,r.requested_in,r.requested_out,'勤怠申請承認：'||r.reason);
 update public.applications set status='勤務完了',attendance_review_status='承認済み',attendance_reviewed_at=now(),attendance_reviewed_by=auth.uid() where id=a.id;
 update public.attendance_review_requests set status='approved',reviewed_at=now(),reviewed_by=auth.uid(),review_comment=nullif(trim(p_comment),''),
 effective_pay_guarantee=policy,approved_work_seconds=worked,approved_basic_amount=amount where id=r.id;
end $$;
revoke all on function spodora_private.decide_attendance_review(uuid,boolean,text,boolean) from public,anon,authenticated;
grant execute on function spodora_private.decide_attendance_review(uuid,boolean,text,boolean) to authenticated;
create function public.decide_attendance_review(p_request_id uuid,p_approve boolean,p_comment text default '',p_pay_guarantee boolean default null)
returns void language sql security invoker set search_path='' as $$
 select spodora_private.decide_attendance_review(p_request_id,p_approve,p_comment,p_pay_guarantee)
$$;
revoke all on function public.decide_attendance_review(uuid,boolean,text,boolean) from public,anon;
grant execute on function public.decide_attendance_review(uuid,boolean,text,boolean) to authenticated;
notify pgrst,'reload schema';
