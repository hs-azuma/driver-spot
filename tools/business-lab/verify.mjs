import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {actionChecks} from './actions.mjs';
import {businessBrowserChecks} from './browser.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const report={status:'FAIL',production_access:false,real_data_used:false,started_at:new Date().toISOString(),checks:[],source_sha256:{},limits:['Job publication and applicant decisions run extracted actual action functions with synthetic DOM and real SDK HTTP fixtures, not full form/browser flows','Payroll uses the actual shared modal in a synthetic host page','QR uses actual attendance.html with synthetic token and HTTP responses; camera scanning and native DB not tested','Notification helper is stubbed and no recipient is contacted']};
for(const p of ['job-create.html','company-applicants.html','attendance.html','assets/attendance-qr.js','assets/attendance-review.js','assets/attendance-summary.js','tools/sdk-lab/package-lock.json','tools/business-lab/actions.mjs','tools/business-lab/browser.mjs','tools/business-lab/verify.mjs'])report.source_sha256[p]=createHash('sha256').update(await readFile(resolve(root,p))).digest('hex');
async function check(name,run){const result={name,status:'FAIL'};report.checks.push(result);try{await run();result.status='PASS';console.log('PASS',name)}catch(error){result.error=error.message;throw error}}
try{await actionChecks(check);await businessBrowserChecks(check,report);report.status='PASS_BUSINESS_ACTIONS_WITH_SYNTHETIC_BACKEND'}catch(error){report.error=error.message;console.error('FAIL',error.message);process.exitCode=1}
finally{report.completed_at=new Date().toISOString();await mkdir(resolve(root,'docs/business-lab-20261029'),{recursive:true});await writeFile(resolve(root,'docs/business-lab-20261029/result.json'),JSON.stringify(report,null,2)+'\n');console.log(report.status,report.checks.filter(c=>c.status==='PASS').length+'/'+report.checks.length)}
