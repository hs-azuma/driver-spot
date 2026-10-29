import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {nodeChecks} from './node-checks.mjs';
import {browserChecks} from './browser-checks.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),output=resolve(root,'docs/sdk-lab-20261029/result.json');
const report={status:'FAIL',started_at:new Date().toISOString(),scope:'Real supabase-js SDK; HTTP, Auth server, database and Edge runtime remain fixtures',sdk:'2.105.0',production_access:false,real_credentials_used:false,checks:[],source_sha256:{},limitations:['Not native GoTrue/PostgREST/Storage/RLS integration','Not Deno/Edge deployment, browser CDN availability or esm.sh import resolution','Browser client URL and publishable key are replaced with synthetic values; external traffic blocked','JWT is synthetic; no server-side cryptographic token validation performed']};
try{report.base_commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim()}catch{report.base_commit=null}
for(const path of ['apply-confirm.html','driver.html','company.html','supabase/functions/delete-account/index.ts','supabase/functions/delete-account/handler.ts','tools/sdk-lab/package-lock.json','tools/sdk-lab/http-fixture.mjs','tools/sdk-lab/node-checks.mjs','tools/sdk-lab/browser-checks.mjs','tools/sdk-lab/verify.mjs'])report.source_sha256[path]=createHash('sha256').update(await readFile(resolve(root,path))).digest('hex');
async function check(name,run){const result={name,status:'FAIL'};report.checks.push(result);try{await run();result.status='PASS';console.log('PASS',name)}catch(error){result.error=error.message;throw error}}
try{
 await check('SDK version and scoped page/Function pins match',async()=>{
  assert.equal(JSON.parse(await readFile(resolve(root,'tools/sdk-lab/node_modules/@supabase/supabase-js/package.json'),'utf8')).version,report.sdk);
  for(const path of ['driver.html','company.html','apply-confirm.html','supabase/functions/delete-account/index.ts']){const s=await readFile(resolve(root,path),'utf8');assert(s.includes('supabase-js@2.105.0'));assert(!/supabase-js@2["']/.test(s))}
 });
 await nodeChecks(check);await browserChecks(check,report);assert.equal(report.checks.length,33);report.status='PASS_REAL_SDK_WITH_SYNTHETIC_HTTP_ONLY';
}catch(error){report.error=error.message;console.error('FAIL',error.message);process.exitCode=1}
finally{report.completed_at=new Date().toISOString();await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(report.status,report.checks.filter(c=>c.status==='PASS').length+'/'+report.checks.length)}
