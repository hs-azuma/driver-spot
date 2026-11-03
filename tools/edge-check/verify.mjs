// Type checking only. No application handlers are executed and no runtime permissions are granted.
import {readdirSync,readFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const deno=resolve(root,'tools/edge-check/node_modules/@deno',process.platform==='linux'?(process.arch==='arm64'?'linux-arm64-glibc':'linux-x64-glibc'):process.platform+'-'+process.arch,process.platform==='win32'?'deno.exe':'deno');
const update=process.argv.includes('--update-lock');
const result={status:'FAIL',deno:'2.9.6',production_access:false,handlers_executed:false,strict:true,checks:[],lockfiles:{},source_sha256:{}};
if(!existsSync(deno))throw Error('Install pinned tools/edge-check dependencies first');
const version=spawnSync(deno,['--version'],{encoding:'utf8'});if(!version.stdout.startsWith('deno 2.9.6 '))throw Error('Pinned Deno mismatch');
for(const name of readdirSync(resolve(root,'supabase/functions')).sort()){
 const base='supabase/functions/'+name;if(!existsSync(resolve(root,base,'index.ts')))continue;
 const run=spawnSync(deno,['check','--config',base+'/deno.json','--frozen-lockfile='+(!update),'--all',base+'/index.ts'],{cwd:root,encoding:'utf8',timeout:180000,maxBuffer:4*1024*1024});
 result.checks.push({function:name,pass:run.status===0,diagnostics:run.status===0?[]:(run.stderr||run.error?.message||'failed').replace(/\x1b\[[0-9;]*m/g,'').split('\n').slice(-180)});
 for(const filename of ['index.ts','deno.json','deno.lock']){const path=base+'/'+filename;if(existsSync(resolve(root,path))){const data=readFileSync(resolve(root,path));result.source_sha256[path]=createHash('sha256').update(data).digest('hex');if(filename==='deno.lock')result.lockfiles[path]=data.toString()}}
}
result.status=result.checks.length===10&&result.checks.every(x=>x.pass)?'PASS_STRICT_DENO_ALL_TEN_FUNCTIONS':'FAIL_DENO_TYPECHECK';
process.stdout.write(JSON.stringify(result));process.exitCode=result.status.startsWith('PASS_')?0:1;
