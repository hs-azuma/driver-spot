"""Build review-only, rollback-by-default SQL from captured definitions. No DB connection.

This reconstructs application objects on a prepared, isolated Supabase instance.
It deliberately does not install Supabase internals, external jobs, or service settings.
"""
import hashlib
import copy
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIRECTORY = ROOT / 'docs/database'


def ident(value):
    return '"' + value.replace('"', '""') + '"'


def qualified(schema, name):
    return ident(schema) + '.' + ident(name)


def function_key(function):
    return function.get('schema', 'public'), function['name'], function['arguments']


def order_functions(functions):
    """Conservative text dependency scan; actual SQL/PLpgSQL execution still required."""
    pending = {function_key(f): f for f in functions}
    if len(pending) != len(functions):
        raise ValueError('Duplicate function identity')
    graph = {}
    for key, function in pending.items():
        body = function['definition'].split('AS $function$', 1)
        if len(body) != 2:
            raise ValueError('Unsupported function body delimiter')
        refs = set()
        for target in pending:
            schema, name, _ = target
            # Bare public calls are possible under the captured public search_path.
            pattern = r'(?<![\w.])' + re.escape(schema + '.' + name) + r'\s*\('
            bare = r'(?<![\w.])' + re.escape(name) + r'\s*\('
            if re.search(pattern, body[1]) or (schema == 'public' and re.search(bare, body[1])):
                if target != key:
                    refs.add(target)
        graph[key] = refs
    ordered = []
    completed = set()
    while pending:
        ready = sorted(k for k in pending if graph[k] <= completed)
        if not ready:
            raise ValueError('Unresolved/cyclic function dependencies: ' + repr(sorted(pending)))
        for key in ready:
            ordered.append(pending.pop(key))
            completed.add(key)
    return ordered, graph


PRIVILEGES = {'a': 'INSERT', 'r': 'SELECT', 'w': 'UPDATE', 'd': 'DELETE',
              'D': 'TRUNCATE', 'x': 'REFERENCES', 't': 'TRIGGER', 'm': 'MAINTAIN',
              'X': 'EXECUTE', 'U': 'USAGE', 'C': 'CREATE'}


def acl_sql(kind, target, acl, owner):
    if acl is None:
        # PostgreSQL acldefault: functions give EXECUTE to PUBLIC; tables/sequences/schemas do not.
        acl = [owner + '=' + {'FUNCTION': 'X', 'TABLE': 'arwdDxtm', 'SEQUENCE': 'rwU', 'SCHEMA': 'UC'}[kind] + '/' + owner]
        if kind == 'FUNCTION':
            acl.append('=X/' + owner)
    grants = []
    roles = {'PUBLIC', 'anon', 'authenticated', 'service_role', owner}
    for entry in acl:
        match = re.fullmatch(r'([a-z_][a-z_0-9]*|)=([arwdDxtmXUC*]+)/([a-z_][a-z_0-9]*)', entry)
        if not match:
            raise ValueError('Unsupported ACL syntax: ' + entry)
        role, privileges, grantor = match.groups()
        role = role or 'PUBLIC'
        roles.add(role)
        for token in re.findall(r'[arwdDxtmXUC]\*?', privileges):
            grants.append('GRANT ' + PRIVILEGES[token[0]] + ' ON ' + kind + ' ' + target + ' TO ' +
                          ('PUBLIC' if role == 'PUBLIC' else ident(role)) +
                          (' WITH GRANT OPTION' if token.endswith('*') else '') + ';')
    result = ['REVOKE ALL PRIVILEGES ON ' + kind + ' ' + target + ' FROM ' +
              ', '.join('PUBLIC' if r == 'PUBLIC' else ident(r) for r in sorted(roles)) + ';']
    result += grants
    return result


def build(catalog, dependencies, metadata, supplement=None, column_privileges=()):
    dependencies = copy.deepcopy(dependencies)
    if supplement is not None:
        dependencies['internal']['schemas'].append(supplement['schema'])
        dependencies['internal']['functions'].extend(supplement['functions'])
    functions, graph = order_functions(dependencies['public']['functions'] + dependencies['internal']['functions'])
    sql = [
        '-- REVIEW CANDIDATE ONLY. Never run on production. Ends with ROLLBACK.',
        '-- Requires prepared Supabase PG17/Auth roles; no service settings, cron or secrets.',
        '-- Known current permissions are reproduced for comparison, including known security issues.',
        'BEGIN;',
        "DO $guard$ BEGIN IF current_setting('spodora.local_restore_review', true) IS DISTINCT FROM 'yes'",
        "OR (inet_server_addr() IS NOT NULL AND inet_server_addr() NOT IN ('127.0.0.1'::inet, '::1'::inet))",
        "THEN RAISE EXCEPTION 'Local review opt-in required; production forbidden'; END IF;",
        "IF current_setting('server_version_num')::integer / 10000 <> 17 THEN RAISE EXCEPTION 'PG17 required'; END IF;",
        "IF to_regclass('auth.users') IS NULL OR to_regprocedure('auth.uid()') IS NULL THEN",
        "RAISE EXCEPTION 'Prepare standard Supabase Auth before application objects'; END IF; END $guard$;",
        'SET LOCAL search_path = public, extensions;',
        'SET LOCAL check_function_bodies = on;',
        '-- Phase 1: application schemas, tables and identity sequences',
    ]
    for schema in sorted(dependencies['internal']['schemas'], key=lambda s: s['name']):
        sql.append('CREATE SCHEMA ' + ident(schema['name']) + ' AUTHORIZATION ' + ident(schema['owner']) + ';')
    sequences = {s['name']: s for s in dependencies['public']['sequences']}
    ownership = {(s['table'], s['column']): s for s in metadata['sequences']}
    for table in sorted(catalog['tables'], key=lambda t: t['name']):
        cols = []
        for column in sorted((c for c in catalog['columns'] if c['table'] == table['name']), key=lambda c: c['position']):
            text = ident(column['name']) + ' ' + column['type']
            if column['generated']:
                raise ValueError('Generated expression requires explicit support')
            if column['identity']:
                owner = ownership[(table['name'], column['name'])]
                if owner['dependency'] != 'i':
                    raise ValueError('Expected identity sequence ownership')
                seq = sequences[owner['name']]
                text += ' GENERATED ' + ('ALWAYS' if column['identity'] == 'a' else 'BY DEFAULT') + ' AS IDENTITY ('
                text += 'SEQUENCE NAME ' + qualified('public', seq['name'])
                for key, clause in [('start', ' START WITH '), ('increment', ' INCREMENT BY '),
                                    ('min', ' MINVALUE '), ('max', ' MAXVALUE '), ('cache', ' CACHE ')]:
                    number = str(seq[key])
                    if not re.fullmatch(r'-?\d+', number):
                        raise ValueError('Invalid sequence integer')
                    text += clause + number
                text += ' CYCLE)' if seq['cycle'] else ' NO CYCLE)'
            elif column['default'] is not None:
                text += ' DEFAULT ' + column['default']
            if column['not_null']:
                text += ' NOT NULL'
            cols.append(text)
        target = qualified('public', table['name'])
        sql += ['CREATE TABLE ' + target + ' (\n  ' + ',\n  '.join(cols) + '\n);',
                'ALTER TABLE ' + target + (' ENABLE' if table['rls'] else ' DISABLE') + ' ROW LEVEL SECURITY;']
        if table['force_rls']:
            sql.append('ALTER TABLE ' + target + ' FORCE ROW LEVEL SECURITY;')
    sql.append('-- Phase 2: keys/checks before foreign keys; no table insertion')
    for constraint in sorted(catalog['constraints'], key=lambda c: (c['type'] == 'f', c['table'], c['name'])):
        sql.append('ALTER TABLE ' + qualified('public', constraint['table']) + ' ADD CONSTRAINT ' +
                   ident(constraint['name']) + ' ' + constraint['definition'] + ';')
    # PK/UNIQUE constraints create their own indexes.
    backed = {c['name'] for c in catalog['constraints'] if c['type'] in ('p', 'u')}
    for index in sorted(catalog['indexes'], key=lambda i: i['name']):
        if index['name'] not in backed:
            sql.append(index['definition'] + ';')
    sql.append('-- Phase 3: functions in conservative dependency order; bodies remain validated')
    for function in functions:
        sql.append(function['definition'].rstrip().rstrip(';') + ';')
    sql.append('-- Phase 4: application triggers, Auth custom triggers and RLS policies')
    triggers = [('public', t) for t in catalog['triggers']] + [('auth', t) for t in dependencies['public']['auth_triggers']]
    for schema, trigger in triggers:
        sql.append(trigger['definition'] + ';')
        mode = {'O': 'ENABLE', 'D': 'DISABLE', 'R': 'ENABLE REPLICA', 'A': 'ENABLE ALWAYS'}[trigger['enabled']]
        sql.append('ALTER TABLE ' + qualified(schema, trigger['table']) + ' ' + mode + ' TRIGGER ' + ident(trigger['name']) + ';')
    for policy in sorted(catalog['policies'], key=lambda p: (p['table'], p['name'])):
        text = 'CREATE POLICY ' + ident(policy['name']) + ' ON ' + qualified('public', policy['table'])
        text += ' AS ' + policy['permissive'] + ' FOR ' + policy['command'] + ' TO '
        text += ', '.join('PUBLIC' if r == 'public' else ident(r) for r in policy['roles'])
        if policy['using'] is not None:
            text += ' USING (' + policy['using'] + ')'
        if policy['check'] is not None:
            text += ' WITH CHECK (' + policy['check'] + ')'
        sql.append(text + ';')
    sql.append('-- Phase 5: recorded object owners and ACL. Grantors/default ACL remain separate validation gates.')
    for schema in dependencies['internal']['schemas']:
        sql += acl_sql('SCHEMA', ident(schema['name']), schema['acl'], schema['owner'])
    for table in metadata['tables']:
        target = qualified('public', table['name'])
        sql.append('ALTER TABLE ' + target + ' OWNER TO ' + ident(table['owner']) + ';')
        sql += acl_sql('TABLE', target, table['acl'], table['owner'])
    for seq in metadata['sequences']:
        target = qualified('public', seq['name'])
        sql += acl_sql('SEQUENCE', target, seq['acl'], seq['owner'])
    for function in functions:
        target = qualified(function.get('schema', 'public'), function['name']) + '(' + function['arguments'] + ')'
        sql.append('ALTER FUNCTION ' + target + ' OWNER TO ' + ident(function['owner']) + ';')
        sql += acl_sql('FUNCTION', target, function['acl'], function['owner'])
    for column in column_privileges:
        target = qualified(column['schema'], column['table'])
        for grant in acl_sql('TABLE', target, column['acl'], 'postgres')[1:]:
            sql.append(grant.replace(' ON TABLE ', ' (' + ident(column['column']) + ') ON TABLE ', 1))
    sql += ['-- No COMMIT option. Promote only after isolated execution, diff, authorization tests and review.', 'ROLLBACK;']
    manifest = {'status': 'GENERATED_REVIEW_CANDIDATE', 'execution_evidence': 'lab-result.json; generator itself never connects to a DB',
                'function_order_method': 'conservative text scan, not PostgreSQL dependency proof',
                'function_order': ['.'.join(function_key(f)[:2]) + '(' + f['arguments'] + ')' for f in functions],
                'counts': {'tables': len(catalog['tables']), 'constraints': len(catalog['constraints']),
                           'additional_indexes': sum(i['name'] not in backed for i in catalog['indexes']),
                           'functions': len(functions), 'triggers_including_auth': len(triggers),
                           'policies': len(catalog['policies']), 'identity_sequences': len(sequences),
                           'columns_with_explicit_acl': len(column_privileges)},
                'omitted': ['Supabase standard schemas/roles/extensions/services', 'system event triggers, cron, publications',
                            'public schema ACL and default ACL', 'original ACL grantor identity and unknown local default grants',
                            'data, sequence current values, Storage files, secrets'],
                'sql_sha256': hashlib.sha256(('\n'.join(sql) + '\n').encode()).hexdigest()}
    return '\n'.join(sql) + '\n', manifest


if __name__ == '__main__':
    def read(name):
        return json.loads((DIRECTORY / name).read_text())
    result, manifest = build(read('public-catalog-20261029.json'), read('function-dependencies-20261029.json'),
                             read('restore-metadata-20261029.json'), read('private-dependencies-20261029.json'),
                             read('column-privileges-20261029.json'))
    output = DIRECTORY / 'restore-candidate'
    output.mkdir(exist_ok=True)
    (output / 'application-review.sql').write_text(result)
    (output / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(manifest['counts'], ensure_ascii=False))
