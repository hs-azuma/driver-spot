"""Read-only readiness check. Never accepts DB credentials, exports data, generates keys or uploads."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def readiness(plan):
    missing=[]
    for name in ['key_custodian','key_storage_reference','retention_days','rpo_hours','rto_hours','backup_operator','restore_operator']:
        if plan.get(name) is None or plan.get(name)=='':missing.append(name)
    if not plan.get('private_destination_verified_owner_only'):missing.append('verified_private_destination')
    if not plan.get('custody_approved'):missing.append('custody_approved')
    return {'status':'READY_FOR_SCOPED_EXPORT_REVIEW' if not missing else 'BLOCKED_CUSTODY_DECISIONS','missing':missing,'real_export_executed':False,'note':'Readiness is not an export command or a recovery guarantee'}

if __name__=='__main__':
    result=readiness(json.loads((ROOT/'docs/backup-recovery-plan.json').read_text()));print(json.dumps(result));raise SystemExit(0 if not result['missing'] else 2)
