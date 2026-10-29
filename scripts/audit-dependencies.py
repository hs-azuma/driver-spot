"""Inventory literal external imports; no downloads, secrets, package updates or deployments."""
import json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
REPORT=ROOT/'docs/dependency-inventory-20261029.json'

def classify(specifier):
    if '@supabase/supabase-js@' in specifier:
        version=specifier.split('@supabase/supabase-js@',1)[1].split('/')[0]
        return 'runtime',version,bool(re.fullmatch(r'\d+\.\d+\.\d+(?:-[\w.]+)?',version))
    if specifier.startswith('jsr:'):
        version=re.search(r'@([0-9][^/]*)/',specifier)
        return 'type_import',version.group(1) if version else None,bool(version and re.fullmatch(r'\d+\.\d+\.\d+',version.group(1)))
    version=re.search(r'(?:@|/)(\d+\.\d+\.\d+)(?:/|$)',specifier)
    return 'runtime',version.group(1) if version else None,bool(version)

def inventory(root=ROOT):
    entries=[]
    for path in sorted(root.glob('*.html')):
        for specifier in re.findall(r'<script\b[^>]*\bsrc=["\'](https?://[^"\']+)',path.read_text()):
            kind,version,pinned=classify(specifier)
            entries.append({'path':path.relative_to(root).as_posix(),'specifier':specifier,'kind':kind,'version':version,'pinned':pinned})
    for path in sorted((root/'supabase/functions').rglob('*.ts')):
        for specifier in re.findall(r'(?:from\s*|import\s*)["\']((?:https?://|jsr:|npm:)[^"\']+)',path.read_text()):
            kind,version,pinned=classify(specifier)
            entries.append({'path':path.relative_to(root).as_posix(),'specifier':specifier,'kind':kind,'version':version,'pinned':pinned})
    actions=[]
    for path in sorted((root/'.github/workflows').glob('*.yml')):
        for value in re.findall(r'\buses:\s*([^\s#]+)',path.read_text()):
            actions.append({'path':path.relative_to(root).as_posix(),'action':value,'commit_pinned':bool(re.search(r'@[0-9a-f]{40}$',value))})
    packages=[]
    for path in sorted((root/'tools').glob('*/package.json')):
        data=json.loads(path.read_text());lock=path.with_name('package-lock.json')
        packages.append({'path':path.relative_to(root).as_posix(),'lockfile_present':lock.is_file(),'lockfile_required':bool(data.get('dependencies')),'dependencies':[{'package':k,'version':v,'exact':bool(re.fullmatch(r'\d+\.\d+\.\d+(?:-[\w.]+)?',v))} for k,v in sorted(data.get('dependencies',{}).items())]})
    unresolved=[e for e in entries if not e['pinned']]
    return {'status':'INVENTORIED_WITH_DEFERRED_BUILD_AND_WORKFLOW_ITEMS','production_modified':False,'entries':entries,'package_manifests':packages,'actions':actions,'summary':{'imports':len(entries),'floating_runtime_imports':sum(e['kind']=='runtime' for e in unresolved),'floating_type_imports':sum(e['kind']=='type_import' for e in unresolved),'unfixed_action_refs':sum(not a['commit_pinned'] for a in actions)},'deferred':['JSR edge-runtime type imports require native Deno resolution before pinning','Legacy mutating workflow changes require separate scoped production review'],'limits':['Exact version is not a security audit or a guarantee of CDN availability','Runtime pins are candidates only; Deno deployment and every external service path remain untested','line-link keeps its existing exact 2.95.0 pending LINE regression; do not blindly upgrade']}

if __name__=='__main__':
    result=inventory();REPORT.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result['summary']))
