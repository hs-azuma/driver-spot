-- REVIEW ONLY. Never run on production without native validation and approval.
BEGIN;
DO $guard$ BEGIN
 IF current_setting('spodora.local_restore_review',true) IS DISTINCT FROM 'yes'
 THEN RAISE EXCEPTION 'Local review opt-in required'; END IF;
END $guard$;
CREATE POLICY "Public companies insertable" ON public.companies AS PERMISSIVE
FOR INSERT TO anon, authenticated WITH CHECK (true);
GRANT INSERT ON public.companies TO anon;
-- Baseline grants only: PUBLIC did not have EXECUTE on this legacy RPC.
GRANT EXECUTE ON FUNCTION public.register_company(text,text,text,text,text) TO anon, authenticated;
CREATE OR REPLACE FUNCTION public.apply_attendance_rounding(p_application_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ declare v_unit integer; v_in timestamptz; v_out timestamptz; v_rounded_in timestamptz; v_rounded_out timestamptz; begin select coalesce(c.attendance_rounding_minutes,15), a.checked_in_at, a.checked_out_at into v_unit,v_in,v_out from public.applications a join public.jobs j on j.id=a.job_id join public.companies c on c.id=j.company_id where a.id=p_application_id; if v_in is null then return; end if; v_rounded_in := date_trunc('day',v_in) + ceil(extract(epoch from (v_in-date_trunc('day',v_in)))/(v_unit*60.0))*(v_unit*interval '1 minute'); if v_out is not null then v_rounded_out := date_trunc('day',v_out) + floor(extract(epoch from (v_out-date_trunc('day',v_out)))/(v_unit*60.0))*(v_unit*interval '1 minute'); end if; update public.applications set rounded_check_in_at=v_rounded_in, rounded_check_out_at=v_rounded_out, attendance_rounding_minutes=v_unit, approved_work_minutes=case when v_rounded_out is not null then greatest(0,(extract(epoch from (v_rounded_out-v_rounded_in))/60)::integer) else approved_work_minutes end, attendance_review_status=case when v_rounded_out is not null then '確認待ち' else attendance_review_status end where id=p_application_id; end $function$;
ROLLBACK;
