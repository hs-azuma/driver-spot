"""Publish only the sanitized synthetic report to one dedicated CI results branch. No main writes."""
import base64,json,os,re,urllib.request,urllib.error
REPO='hs-azuma/driver-spot';BRANCH='ci/v4-native-results-20261029';PATH='docs/native-ci-20261029/result.json'
assert os.environ.get('GITHUB_REPOSITORY')==REPO
assert os.environ.get('GITHUB_REF')=='refs/heads/ci/v4-native-validation-20261029'
raw=base64.b64decode(os.environ['NATIVE_RESULT_B64'],validate=True);assert len(raw)<32768
report=json.loads(raw);assert report.get('production_access') is False and report.get('real_data_used') is False
assert report['source_commit']==os.environ['GITHUB_SHA'] and re.fullmatch('[0-9a-f]{40}',report['source_commit'])
assert report['status'] in ('FAIL','PASS_NATIVE_SUPABASE_SYNTHETIC_DB_RESTORE')
# This job checks out only this publisher and receives the sanitized report. It never executes source SQL or test data.
def request(path,method='GET',body=None):
 req=urllib.request.Request('https://api.github.com/repos/'+REPO+path,method=method,data=json.dumps(body).encode() if body is not None else None,headers={'Authorization':'Bearer '+os.environ['RESULT_TOKEN'],'Accept':'application/vnd.github+json','Content-Type':'application/json','User-Agent':'spodora-native-result'})
 return json.load(urllib.request.urlopen(req,timeout=30))
try:parent=request('/git/ref/heads/'+BRANCH)['object']['sha'];exists=True
except urllib.error.HTTPError as error:
 if error.code!=404:raise
 parent=report['source_commit'];exists=False
base=request('/git/commits/'+parent)['tree']['sha']
blob=request('/git/blobs','POST',{'content':json.dumps(report,ensure_ascii=False,indent=2)+'\n','encoding':'utf-8'})['sha']
tree=request('/git/trees','POST',{'base_tree':base,'tree':[{'path':PATH,'mode':'100644','type':'blob','sha':blob}]})['sha']
commit=request('/git/commits','POST',{'message':'Record isolated synthetic native result [skip ci]','tree':tree,'parents':[parent]})['sha']
if exists:request('/git/refs/heads/'+BRANCH,'PATCH',{'sha':commit,'force':False})
else:request('/git/refs','POST',{'ref':'refs/heads/'+BRANCH,'sha':commit})
print('Synthetic result saved to '+BRANCH+' at '+commit)
