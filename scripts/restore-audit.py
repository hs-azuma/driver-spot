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
    errors = []
    def require(condition, message):
        if not condition:
            errors.append(message)
    tables = {t['name'] for t in catalog['tables']}
    require(len(tables) == 22, 'Expected 22 distinct public tables')
    require(all(t['rls'] for t in catalog['tables']), 'Public table without RLS')
    for group in ('columns', 'constraints', 'indexes', 'policies', 'triggers'):
        require(all(x['table'] in tables for x in catalog[group]), group + ': unknown table')
    functions = deps['public']['functions'] + deps['internal']['functions']
    identities = [(f.get('schema', 'public'), f['name'], f['arguments']) for f in functions]
    require(len(identities) == len(set(identities)) == 53, 'Expected 53 distinct functions')
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
    require(len(deps['public']['auth_triggers']) == 2, 'Expected 2 Auth triggers')
    require({e['name'] for e in extra['extensions']} == {e['name'] for e in catalog['extensions']},
            'Extension placement coverage mismatch')
    risks = []
    for f in functions:
        definition = f['definition']
        if 'SECURITY DEFINER' in definition and (f['acl'] is None or any(x.startswith('=X') for x in f['acl'])):
            risks.append(f.get('schema', 'public') + '.' + f['name'] + '(' + f['arguments'] + ')')
    return {
        'status': 'FAIL' if errors else 'PASS_METADATA_ONLY',
        'errors': errors,
        'counts': {**{k: len(catalog[k] or []) for k in ('tables', 'columns', 'constraints', 'indexes', 'policies', 'triggers')},
                   'functions': len(functions), 'auth_triggers': 2, 'sequences': len(sequences)},
        'security_review_required': sorted(risks),
        'notes': ['internal.sequences repeats public sequences; never create them twice.',
                  'ACL null uses PostgreSQL defaults; it does not mean no access.'],
        'unverified': ['Empty database reconstruction and dependency execution order',
                       'Schema/default/column ACL, grant options and ownership equivalence',
                       'Auth/Storage service version and configuration compatibility',
                       'Encrypted data backup, Storage files, cron and secret recovery',
                       'RLS denial tests and real backup restoration'],
        'sha256': {name: hashlib.sha256((folder / name).read_bytes()).hexdigest() for name in
                   ('function-dependencies-20261029.json', 'public-catalog-20261029.json',
                    'restore-metadata-20261029.json')}
    }


if __name__ == '__main__':
    report = audit()
    print(json.dumps(report, ensure_ascii=False, indent=2))
    raise SystemExit(bool(report['errors']))
