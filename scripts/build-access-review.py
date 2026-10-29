"""Produce a local-only review/rollback pair from the captured rounding definition."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GUARD = """
 if current_setting('role',true) is distinct from 'service_role' and not exists (
  select 1 from public.applications a
  join public.jobs j on j.id=a.job_id
  join public.companies c on c.id=j.company_id
  join public.drivers d on d.id=a.driver_id
  where a.id=p_application_id and (c.user_id=auth.uid() or d.user_id=auth.uid())
 ) then raise exception 'この勤務を再計算する権限がありません。' using errcode='42501'; end if;
"""
HEADER = """-- REVIEW ONLY. Never run on production without native validation and approval.
BEGIN;
DO $guard$ BEGIN
 IF current_setting('spodora.local_restore_review',true) IS DISTINCT FROM 'yes'
 THEN RAISE EXCEPTION 'Local review opt-in required'; END IF;
END $guard$;
"""


def build():
    data = json.loads((ROOT / 'docs/database/function-dependencies-20261029.json').read_text())
    original = next(f['definition'] for f in data['public']['functions'] if f['name'] == 'apply_attendance_rounding')
    marker = ' begin select coalesce'
    if original.count(marker) != 1:
        raise ValueError('Captured function changed; manual review required')
    guarded = original.replace(marker, ' begin ' + GUARD + ' select coalesce', 1)
    policy = """DROP POLICY "Public companies insertable" ON public.companies;
REVOKE INSERT ON public.companies FROM anon;
REVOKE EXECUTE ON FUNCTION public.register_company(text,text,text,text,text) FROM PUBLIC, anon, authenticated;
"""
    undo = """CREATE POLICY "Public companies insertable" ON public.companies AS PERMISSIVE
FOR INSERT TO anon, authenticated WITH CHECK (true);
GRANT INSERT ON public.companies TO anon;
-- Baseline grants only: PUBLIC did not have EXECUTE on this legacy RPC.
GRANT EXECUTE ON FUNCTION public.register_company(text,text,text,text,text) TO anon, authenticated;
"""
    return HEADER + policy + guarded.rstrip() + ';\nROLLBACK;\n', HEADER + undo + original.rstrip() + ';\nROLLBACK;\n'


def build_entry():
    data = json.loads((ROOT / 'docs/database/function-dependencies-20261029.json').read_text())
    original = next(f['definition'] for f in data['internal']['functions'] if f['name'] == 'capture_application_pay_guarantee')
    marker = "if not found then raise exception '求人が見つかりません。'; end if;"
    if original.count(marker) != 1:
        raise ValueError('Captured application entry trigger changed; manual review required')
    checks = """
  if NEW.status is distinct from '応募中' then
   raise exception '応募時の状態を変更することはできません。' using errcode='42501'; end if;
  -- The preceding SELECT FOR SHARE already locks the target job against cancellation races.
  if exists(select 1 from public.jobs where id=NEW.job_id and status='キャンセル') then
   raise exception '取消済みの求人には応募できません。' using errcode='23514'; end if;
"""
    guarded = original.replace(marker, marker + checks, 1)
    return HEADER + guarded.rstrip() + ';\nROLLBACK;\n', HEADER + original.rstrip() + ';\nROLLBACK;\n'


if __name__ == '__main__':
    proposal, rollback = build()
    (ROOT / 'sql/review-v4-legacy-and-rounding-access.sql').write_text(proposal)
    (ROOT / 'sql/review-v4-legacy-and-rounding-rollback.sql').write_text(rollback)
    proposal, rollback = build_entry()
    (ROOT / 'sql/review-v4-application-entry-access.sql').write_text(proposal)
    (ROOT / 'sql/review-v4-application-entry-rollback.sql').write_text(rollback)
    print('Wrote review-only access proposal and exact captured-function rollback. No DB connection.')
