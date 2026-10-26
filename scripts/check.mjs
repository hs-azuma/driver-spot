// Offline checks only. Never imports deployment scripts or runs SQL against a database.
import {readdirSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve, dirname, join} from 'node:path';
import {spawnSync} from 'node:child_process';
import vm from 'node:vm';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
process.chdir(root);
const tests=readdirSync('tests').filter(f=>f.endsWith('.test.cjs')||['test-auth-confirm.js','test-auth-session.js','test-qr.cjs'].includes(f)).sort().map(f=>join('tests',f));
tests.push(...readdirSync('supabase/tests').filter(f=>f.endsWith('.mjs')).sort().map(f=>join('supabase/tests',f)));
function run(command,args){const r=spawnSync(command,args,{stdio:'inherit'});if(r.error){console.error(r.error.message);process.exit(1)}if(r.status!==0)process.exit(r.status||1)}
run(process.execPath,['--test',...tests]);
run(process.platform==='win32'?'python':'python3',['-B','-m','unittest','discover','-s','tests','-p','test_auth_email.py']);
let scripts=0;
for(const f of readdirSync('.').filter(f=>f.endsWith('.html'))){
 for(const match of readFileSync(f,'utf8').matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)){
  if(match[1].trim()){new vm.Script(match[1],{filename:f});scripts++}
 }
}
console.log(`PASS: all offline tests and ${scripts} inline JavaScript syntax checks. No production changes or notifications.`);
