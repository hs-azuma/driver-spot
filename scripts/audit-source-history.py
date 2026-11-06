"""Inspect reachable Git blobs and source files. Outputs metadata and counts, never credentials."""
import base64
import collections
import datetime
import hashlib
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
MAX_BLOB_BYTES = 8 * 1024 * 1024
PATTERNS = {
    'private_key_pem': rb'-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----',
    'github_token': rb'\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b',
    'aws_access_key': rb'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b',
    'supabase_secret': rb'\bsb_secret_[A-Za-z0-9_-]{20,}\b',
    'resend_key': rb'\bre_[A-Za-z0-9_-]{24,}\b',
    'stripe_secret': rb'\bsk_(?:live|test)_[A-Za-z0-9]{20,}\b',
    'slack_token': rb'\bxox[baprs]-[A-Za-z0-9-]{20,}\b',
    'google_api_key': rb'\bAIza[A-Za-z0-9_-]{35}\b',
    'jwt': rb'\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b',
    'assigned_secret': rb"""(?i)\b(?:service_role_key|resend_api_key|line_channel_access_token|supabase_access_token|worker_key)\s*[:=]\s*["']([^"'\r\n]{20,})["']"""
}
STORAGE = {
    'storage_url': rb'(?i)(?:https?://[^\s"\x27<>]+)?/storage/v1/(?:object|render)/',
    'storage_api': rb'(?i)(?:storage\s*\.\s*from\s*\(|createSignedUrls?\s*\(|getPublicUrl\s*\()',
    'storage_catalog': rb'(?i)\bstorage\.(?:objects|buckets)\b'
}


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)


def inspect(data):
    secret_counts = collections.Counter()
    for name, expression in PATTERNS.items():
        for match in re.finditer(expression, data):
            kind = name
            if name == 'jwt':
                try:
                    payload = match.group().split(b'.')[1]
                    claims = json.loads(base64.urlsafe_b64decode(payload + b'=' * (-len(payload) % 4)))
                    kind = 'jwt_public_anon' if claims.get('role') == 'anon' else 'jwt_service_role' if claims.get('role') == 'service_role' else 'jwt_other'
                except (ValueError, UnicodeError):
                    kind = 'jwt_unparsed'
            secret_counts[kind] += 1
    storage = [name for name, expression in STORAGE.items() if re.search(expression, data)]
    return secret_counts, storage


def verify_rules():
    samples = {
        'private_key_pem': b'-' * 5 + b'BEGIN ' + b'PRIVATE KEY' + b'-' * 5,
        'github_token': b'gh' + b'p_' + b'A' * 36,
        'aws_access_key': b'AK' + b'IA' + b'A' * 16,
        'supabase_secret': b'sb_' + b'secret_' + b'A' * 24,
        'resend_key': b're' + b'_' + b'A' * 24,
        'stripe_secret': b'sk_' + b'live_' + b'A' * 24,
        'slack_token': b'xox' + b'b-' + b'A' * 24,
        'google_api_key': b'AI' + b'za' + b'A' * 35,
        'assigned_secret': b'RESEND_API_' + b'KEY=' + b'"' + b'A' * 24 + b'"'
    }
    for kind, sample in samples.items():
        assert inspect(sample)[0].get(kind) == 1, kind
    for role, kind in [('anon', 'jwt_public_anon'), ('service_role', 'jwt_service_role')]:
        encode = lambda value: base64.urlsafe_b64encode(json.dumps(value).encode()).rstrip(b'=')
        sample = b'.'.join([encode({'alg': 'HS256'}), encode({'role': role}), b'A' * 32])
        assert inspect(sample)[0].get(kind) == 1, kind
    assert not inspect(b'sb_' + b'publishable_' + b'A' * 32)[0]
    assert inspect(b'/storage/' + b'v1/object/public/example')[1] == ['storage_url']
    return {'status': 'PASS', 'positive_secret_rules': len(samples) + 2,
            'publishable_key_excluded': True, 'storage_url_rule_verified': True}


def main():
    self_test = verify_rules()
    refs = git('for-each-ref', '--format=%(refname)', 'refs/heads', 'refs/remotes', 'refs/tags').decode().splitlines()
    objects = {}
    for line in git('rev-list', '--objects', '--all').splitlines():
        oid, _, name = line.partition(b' ')
        objects.setdefault(oid.decode(), name.decode(errors='replace'))
    report = {
        'status': 'SCANNED_WITH_LIMITS', 'production_access': False,
        'completed_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'rule_self_test': self_test,
        'refs': refs, 'ref_tips': dict(line.split(' ', 1) for line in
            git('for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads', 'refs/remotes', 'refs/tags').decode().splitlines()),
        'shallow_repository': git('rev-parse', '--is-shallow-repository').decode().strip() == 'true',
        'commits': int(git('rev-list', '--all', '--count')),
        'reachable_objects': len(objects), 'text_blobs': 0, 'binary_blobs_skipped': 0,
        'oversized_blobs_skipped': 0, 'worktree_text_files': 0,
        'history_candidates': {}, 'worktree_candidates': {}, 'storage_reference_paths': {},
        'limits': ['Reachable objects in fetched refs only; deleted or unreachable remote refs excluded',
                   'Binary blobs and blobs above 8 MiB excluded from content inspection',
                   'Pattern matches require classification; absence of matches does not prove absence of secrets',
                   'No provider validation, credential rotation, GitHub secret-scanning settings or log/artifact inspection']
    }
    history_counts = collections.Counter()
    candidate_paths = collections.defaultdict(set)
    storage_paths = collections.defaultdict(set)
    process = subprocess.Popen(['git', 'cat-file', '--batch'], cwd=ROOT, stdin=subprocess.PIPE, stdout=subprocess.PIPE)
    try:
        for oid, path in objects.items():
            process.stdin.write((oid + '\n').encode())
            process.stdin.flush()
            header = process.stdout.readline().split()
            size = int(header[2])
            if size > MAX_BLOB_BYTES:
                remaining = size + 1
                while remaining:
                    chunk = process.stdout.read(min(remaining, 1024 * 1024))
                    if not chunk:
                        raise RuntimeError('Truncated git object stream')
                    remaining -= len(chunk)
                if header[1] == b'blob':
                    report['oversized_blobs_skipped'] += 1
                continue
            data = process.stdout.read(size)
            if len(data) != size or process.stdout.read(1) != b'\n':
                raise RuntimeError('Truncated git object')
            if header[1] != b'blob':
                continue
            if b'\0' in data:
                report['binary_blobs_skipped'] += 1
                continue
            report['text_blobs'] += 1
            counts, storage = inspect(data)
            history_counts.update(counts)
            for kind in counts:
                candidate_paths[kind].add(path)
            for kind in storage:
                storage_paths[kind].add(path)
    finally:
        process.stdin.close()
        if process.wait(timeout=10) != 0:
            raise RuntimeError('Git object reader failed')
    worktree_counts = collections.Counter()
    for raw in git('ls-files', '--cached', '--others', '--exclude-standard', '-z').split(b'\0'):
        if not raw:
            continue
        path = ROOT / raw.decode()
        if not path.is_file() or path.is_symlink() or path.stat().st_size > MAX_BLOB_BYTES:
            continue
        data = path.read_bytes()
        if b'\0' in data:
            continue
        report['worktree_text_files'] += 1
        counts, _ = inspect(data)
        worktree_counts.update(counts)
    report['history_candidates'] = dict(history_counts)
    report['worktree_candidates'] = dict(worktree_counts)
    report['candidate_paths'] = {key: sorted(paths) for key, paths in candidate_paths.items()}
    report['storage_reference_paths'] = {key: sorted(paths) for key, paths in storage_paths.items()}
    report['scanner_sha256'] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    target = ROOT / 'docs/handover/source-history-audit-20261106.json'
    target.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({key: report[key] for key in ['status', 'commits', 'text_blobs', 'history_candidates', 'worktree_candidates']}))


if __name__ == '__main__':
    main()
