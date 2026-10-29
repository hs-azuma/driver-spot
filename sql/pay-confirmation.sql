-- Pay confirmation extends the existing ownership-checked attendance review.
-- Previous basic-pay approvals keep their original meaning; no fee is backfilled.
alter table public.attendance_review_requests
 add column if not exists requested_transportation_fee integer check (requested_transportation_fee between 0 and 1000000),
 add column if not exists driver_confirmed_at timestamptz,
 add column if not exists requested_pay_guarantee boolean,
 add column if not exists approved_transportation_fee numeric check (approved_transportation_fee>=0),
 add column if not exists approved_total_amount numeric check (approved_total_amount>=0);
alter table public.attendance_review_requests add constraint pay_confirmation_total_matches
 check ((approved_total_amount is null and approved_transportation_fee is null) or
 (status='approved' and requested_pay_guarantee is not null and driver_confirmed_at is not null and requested_transportation_fee is not null and approved_basic_amount is not null
 and approved_transportation_fee is not null and approved_total_amount is not null
 and approved_transportation_fee=requested_transportation_fee
 and approved_total_amount=approved_basic_amount+approved_transportation_fee));
CREATE OR REPLACE FUNCTION spodora_private.attendance_job_context(j jobs, policy boolean)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 select jsonb_build_object('work_date',j.work_date,'start_time',j.start_time,'end_time',j.end_time,'break_minutes',j.break_minutes,'pay_type',j.pay_type,'pay_amount',j.pay_amount,'pay_guarantee',policy,'transportation_fee',j.transportation_fee,'transportation_fee_type',j.transportation_fee_type)
$function$
;
create or replace function spodora_private.request_pay_confirmation(
 p_application_id bigint,p_checked_in_at timestamptz,p_checked_out_at timestamptz,
 p_break_minutes integer,p_reason text,p_transportation_fee integer,p_pay_guarantee boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare result_id uuid; ctx jsonb; expected_fee numeric;
begin
 -- The existing function checks auth.uid(), driver ownership, time bounds and pending duplicates, and locks the application.
 result_id=spodora_private.request_attendance_review(p_application_id,p_checked_in_at,p_checked_out_at,p_break_minutes,p_reason);
 select job_context into ctx from public.attendance_review_requests where id=result_id;
 if p_pay_guarantee is null then raise exception '給与保証の条件を企業と確認し、選択してください。'; end if;
 if ctx->>'pay_guarantee' is not null and p_pay_guarantee<>(ctx->>'pay_guarantee')::boolean then raise exception '応募時の給与保証条件と異なります。'; end if;
 expected_fee=case when ctx->>'transportation_fee_type'='なし' then 0 else (ctx->>'transportation_fee')::numeric end;
 if p_transportation_fee is null or p_transportation_fee<0 or p_transportation_fee>1000000 then raise exception '交通費は0〜100万円の整数で入力してください。'; end if;
 if expected_fee is not null and p_transportation_fee<>expected_fee then raise exception '求人に指定された交通費と異なります。企業に条件を確認してください。'; end if;
 update public.attendance_review_requests set requested_transportation_fee=p_transportation_fee,requested_pay_guarantee=p_pay_guarantee,driver_confirmed_at=now() where id=result_id;
 return result_id;
end $$;
create or replace function public.request_pay_confirmation(
 p_application_id bigint,p_checked_in_at timestamptz,p_checked_out_at timestamptz,
 p_break_minutes integer,p_reason text,p_transportation_fee integer,p_pay_guarantee boolean)
returns uuid language sql security invoker set search_path='' as $$
 select spodora_private.request_pay_confirmation(p_application_id,p_checked_in_at,p_checked_out_at,p_break_minutes,p_reason,p_transportation_fee,p_pay_guarantee)
$$;
revoke all on function spodora_private.request_pay_confirmation(bigint,timestamptz,timestamptz,integer,text,integer,boolean) from public,anon,authenticated;
revoke all on function public.request_pay_confirmation(bigint,timestamptz,timestamptz,integer,text,integer,boolean) from public,anon,authenticated;
grant execute on function spodora_private.request_pay_confirmation(bigint,timestamptz,timestamptz,integer,text,integer,boolean) to authenticated;
grant execute on function public.request_pay_confirmation(bigint,timestamptz,timestamptz,integer,text,integer,boolean) to authenticated;
CREATE OR REPLACE FUNCTION spodora_private.decide_attendance_review(p_request_id uuid, p_approve boolean, p_comment text, p_pay_guarantee boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 if r.driver_confirmed_at is null or r.requested_transportation_fee is null or r.requested_pay_guarantee is null then raise exception 'ドライバーの交通費確認が必要です。差し戻して、画面を開き直して再申請してください。'; end if;
 select * into j from public.jobs where id=a.job_id for share;
 if a.status not in ('勤務確定','勤務完了') or j.status='キャンセル' then raise exception 'この勤務は承認できません。'; end if;
 if a.checked_in_at is distinct from r.original_in or a.checked_out_at is distinct from r.original_out
 or spodora_private.attendance_job_context(j,a.pay_guarantee_snapshot) is distinct from r.job_context
 then raise exception '申請後に勤怠または求人条件が変わりました。差し戻して再申請してください。'; end if;
 policy=coalesce(a.pay_guarantee_snapshot,r.requested_pay_guarantee);
 if p_pay_guarantee is not null and policy is distinct from p_pay_guarantee then raise exception 'ドライバーが確認した給与保証の条件と異なります。'; end if;
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
 effective_pay_guarantee=policy,approved_work_seconds=worked,approved_basic_amount=amount,approved_transportation_fee=r.requested_transportation_fee,approved_total_amount=amount+r.requested_transportation_fee where id=r.id;
end $function$
;
notify pgrst, 'reload schema';
