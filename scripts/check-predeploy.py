"""Evaluate read-only aggregate JSON. Never connects to a DB or applies SQL."""
import json,sys
from pathlib import Path
ZERO_FIELDS=('rls_disabled_tables','unvalidated_constraints','invalid_indexes','over_capacity_jobs','invalid_job_capacity','invalid_application_links','duplicate_applications','checkout_without_checkin','checkout_before_checkin','private_function_anon_execute')
def evaluate(data):
    failures=[]
    if data.get('transaction_read_only') is not True:failures.append('read_only_transaction_missing')
    if data.get('postgres_major')!=17:failures.append('postgres_major_mismatch')
    if data.get('application_tables')!=22:failures.append('application_table_count_mismatch')
    for name in ZERO_FIELDS:
        value=data.get(name)
        if type(value) is not int or value<0:failures.append(name+'_missing_or_invalid')
        elif value!=0:failures.append(name+'_requires_review')
    if data.get('hiring_guard_installed') is not True:failures.append('hiring_guard_not_installed')
    # Public SECURITY DEFINER functions include intentional entry points: manual review, not automatic revocation.
    value=data.get('public_security_definer_anon_execute')
    if type(value) is not int or value<0:failures.append('public_definer_inventory_missing')
    return {'status':'REVIEW_REQUIRED' if failures else 'PASS_LOCAL_PREFLIGHT_ONLY','blockers':failures,'manual_review':['Public SECURITY DEFINER API authorization','Production diff and current grants','Backup and rollback evidence','Owner approval and named operator'],'production_ready':False,'production_changed':False,'data_rows_included':False}
if __name__=='__main__':
    data=json.load(sys.stdin);result=evaluate(data);print(json.dumps(result));raise SystemExit(0 if not result['blockers'] else 1)
