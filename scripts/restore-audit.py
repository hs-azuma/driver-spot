"""Offline completeness audit. Never connects to a database or executes captured SQL."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def audit(root=ROOT):
    folder = root / 'docs/database'
    def read(name):
        return json.loads((folder / name).read_text())
    catalog = read('public-catalog-20261029.json')
    deps = read('function-dependencies-20261029.json')
    extra = read('restore-metadata-20261029.json')
    supplement = read('private-dependencies-20261029.json')
    column_privileges = read('column-privileges-20261029.json')
    live_hashes = read('function-hashes-live-20261029.json')
    errors = []
    def require(condition, message):
        if not condition:
            errors.append(message)
    tables = {t['name'] for t in catalog['tables']}
    require(len(tables) == 22, 'Expected 22 distinct public tables')
    require(all(t['rls'] for t in catalog['tables']), 'Public table without RLS')
    for group in ('columns', 'constraints', 'indexes', 'policies', 'triggers'):
        require(all(x['table'] in tables for x in catalog[group]), group + ': unknown table')
    functions = deps['public']['functions'] + deps['internal']['functions'] + supplement['functions']
    identities = [(f.get('schema', 'public'), f['name'], f['arguments']) for f in functions]
    require(len(identities) == len(set(identities)) == 54, 'Expected 54 distinct functions including recovered private dependency')
    expected_hashes = {(f.get('schema', 'public'), f['name'], f['arguments']):
                       hashlib.md5(f['definition'].encode()).hexdigest() for f in functions}
    captured_live = {(f['schema'], f['name'], f['arguments']): f['definition_md5'] for f in live_hashes}
    require(expected_hashes == captured_live, 'Captured live function hash coverage/content mismatch')
    for trigger in catalog['triggers'] + deps['public']['auth_triggers']:
        import re
        match = re.search(r'EXECUTE FUNCTION (?:(\w+)\.)?(\w+)\(', trigger['definition'])
        require(match is not None, 'Unsupported trigger definition: ' + trigger['name'])
        if match:
            signature = (match.group(1) or 'public', match.group(2), '')
            require(signature in identities, 'Missing trigger dependency: ' + trigger['name'])
    by_id = {(f['name'], f['arguments']): f for f in deps['public']['functions']}
    for f in catalog['functions']:
        actual = by_id.get((f['name'], f['arguments']))
        require(actual is not None, 'Missing function body: ' + f['name'])
        if actual:
            require(hashlib.md5(actual['definition'].encode()).hexdigest() == f['definition_md5'],
                    'Function body/catalog mismatch: ' + f['name'])
    sequences = {s['name']: s for s in deps['public']['sequences']}
    require(len(sequences) == 7, 'Expected 7 public sequences')
    require(len(extra['sequences']) == 7, 'Expected 7 sequence ownership records')
    for s in extra['sequences']:
        require(s['name'] in sequences, 'Missing sequence definition: ' + s['name'])
        cols = [c for c in catalog['columns'] if c['table'] == s['table'] and c['name'] == s['column']]
        require(len(cols) == 1 and cols[0]['identity'] in ('a', 'd') and s['dependency'] == 'i',
                'Identity ownership mismatch: ' + s['name'])
    require({t['name'] for t in extra['tables']} == tables, 'Table ACL coverage mismatch')
    known_columns = {(c['table'], c['name']) for c in catalog['columns']}
    require(len(column_privileges) == 21, 'Expected 21 columns with explicit ACL')
    require(all((c['table'], c['column']) in known_columns for c in column_privileges), 'Unknown column ACL target')
    require(len(deps['public']['auth_triggers']) == 2, 'Expected 2 Auth triggers')
    require({e['name'] for e in extra['extensions']} == {e['name'] for e in catalog['extensions']},
            'Extension placement coverage mismatch')
    risks = []
    effective = {(f['name'], f['arguments']): f for f in catalog['function_grants']}
    public_flags = {(f['name'], f['arguments']): f for f in catalog['functions']}
    for f in functions:
        definition = f['definition']
        if f.get('schema', 'public') != 'public':
            continue
        key = (f['name'], f['arguments'])
        if public_flags[key]['security_definer'] and any(effective[key][r] for r in ('anon', 'authenticated')):
            risks.append('public.' + f['name'] + '(' + f['arguments'] + ')')
    return {
        'status': 'FAIL' if errors else 'PASS_METADATA_ONLY',
        'errors': errors,
        'counts': {**{k: len(catalog[k] or []) for k in ('tables', 'columns', 'constraints', 'indexes', 'policies', 'triggers')},
                   'functions': len(functions), 'auth_triggers': 2, 'sequences': len(sequences),
                   'columns_with_explicit_acl': len(column_privileges)},
        'security_review_required': sorted(risks),
        'notes': ['internal.sequences repeats public sequences; never create them twice.',
                  'ACL null uses PostgreSQL defaults; it does not mean no access.'],
        'unverified': ['Native Supabase reconstruction including extensions, services and full dependency execution',
                       'Schema/default/column ACL, grant options and ownership equivalence',
                       'Auth/Storage service version and configuration compatibility',
                       'Encrypted data backup, Storage files, cron and secret recovery',
                       'Full authorization matrix and real production backup restoration'],
        'sha256': {name: hashlib.sha256((folder / name).read_bytes()).hexdigest() for name in
                   ('function-dependencies-20261029.json', 'public-catalog-20261029.json',
                    'restore-metadata-20261029.json', 'private-dependencies-20261029.json',
                    'column-privileges-20261029.json', 'function-hashes-live-20261029.json')}
    }


if __name__ == '__main__':
    report = audit()
    print(json.dumps(report, ensure_ascii=False, indent=2))
    raise SystemExit(bool(report['errors']))
