"""Refresh the existing non-executable candidate manifest from observed main and saved evidence."""
import collections
import datetime
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
MAIN = '41d6223854a780713686d02ae73d028eb17aa2c4'


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)


def digest(path):
    return hashlib.sha256((ROOT / path).read_bytes()).hexdigest()


def read(path):
    return json.loads((ROOT / path).read_text())


def main():
    assert git('rev-parse', 'origin/main').decode().strip() == MAIN, 'Observed main changed; review before regenerating'
    native = read('docs/native-ci-20261029/payroll-csv-20261105.json')
    hashes = {**native['source_sha256'], **native['browser_e2e']['source_sha256']}
    differences = [path for path, expected in hashes.items() if not (ROOT / path).is_file() or digest(path) != expected]
    paths = set(git('diff', '--name-only', MAIN).decode().splitlines())
    paths.update(git('ls-files', '--others', '--exclude-standard').decode().splitlines())
    candidates = sorted(path for path in paths if (ROOT / path).is_file() and
                        (path.endswith('.html') or path == 'areas.js' or path.startswith(
                            ('assets/', 'supabase/functions/', 'sql/review-v4-'))))
    entries = []
    for path in candidates:
        before = subprocess.run(['git', 'show', MAIN + ':' + path], cwd=ROOT, capture_output=True, check=False)
        if path.endswith('-rollback.sql'):
            group = 'sql_rollback'
        elif path.startswith('sql/'):
            group = 'sql_apply'
        elif path.startswith('supabase/'):
            group = 'functions'
        else:
            group = 'screens'
        entries.append({'path': path, 'sha256': digest(path),
                        'base_sha256': hashlib.sha256(before.stdout).hexdigest() if before.returncode == 0 else None,
                        'rollback_review': group == 'sql_rollback', 'review_group': group})
    observed = read('docs/release/function-metadata-20261106.json')['functions']
    previous = {row['name']: row for row in read('docs/edge-functions-runtime-settings-20261031.json')['functions']}
    runtime_differences = [row['name'] for row in observed if row['name'] not in previous or
                           (row['version'], row['verify_jwt']) !=
                           (previous[row['name']]['version'], previous[row['name']]['verify_jwt'])]
    runtime_differences.extend(name for name in previous if name not in {row['name'] for row in observed})
    manifest_path = ROOT / 'docs/release/v4-current-candidate-20261031.json'
    manifest = json.loads(manifest_path.read_text())
    manifest.update({
        'date_jst': datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).date().isoformat(),
        'observed_main_commit': MAIN, 'native_test_commit': native['source_commit'],
        'native_sources_current': not differences, 'native_source_files_checked': len(hashes),
        'native_source_mismatches': differences, 'native_checks': len(native['checks']),
        'files': entries, 'review_group_counts': dict(collections.Counter(row['review_group'] for row in entries)),
        'runtime_metadata_snapshot': 'docs/release/function-metadata-20261106.json',
        'runtime_version_or_jwt_differences': sorted(set(runtime_differences)),
        'cleanroom_reverified': False,
        'region_proposal': {'patch': 'docs/review/regions/areas-preserve-selection.patch',
                            'patch_sha256': digest('docs/review/regions/areas-preserve-selection.patch'),
                            'applied': False, 'approved': False,
                            'browser_evidence': 'docs/review/regions/browser-result-20261106.json'},
        'scope': 'Review inventory only; SQL apply and rollback files require separate approval. Region proposal and legacy workflow proposals are separate review units.'
    })
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'files': len(entries), 'groups': manifest['review_group_counts'],
                      'native_source_files_checked': len(hashes), 'native_source_mismatches': differences,
                      'runtime_version_or_jwt_differences': manifest['runtime_version_or_jwt_differences']}))


if __name__ == '__main__':
    main()
