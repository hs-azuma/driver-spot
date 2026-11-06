import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const changes = [
  {name:'job-and-attendance-retention', apply:['sql/review-v4-job-insert-hardening.sql','sql/review-v4-application-delete-guard.sql'], rollback:'sql/review-v4-hardening-rollback.sql'},
  {name:'legacy-rounding', apply:['sql/review-v4-legacy-and-rounding-access.sql'], rollback:'sql/review-v4-legacy-and-rounding-rollback.sql'},
  {name:'application-entry', apply:['sql/review-v4-application-entry-access.sql'], rollback:'sql/review-v4-application-entry-rollback.sql'},
  {name:'withdrawal', apply:['sql/review-v4-withdrawal-retention.sql'], rollback:'sql/review-v4-withdrawal-retention-rollback.sql'},
  {name:'overnight', apply:['sql/review-v4-overnight-overlap.sql'], rollback:'sql/review-v4-overnight-overlap-rollback.sql'},
  {name:'hiring-capacity', apply:['sql/review-v4-hiring-capacity.sql'], rollback:'sql/review-v4-hiring-capacity-rollback.sql'}
];

function canonical(value){
  if(Array.isArray(value))return value.map(canonical).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
  return value;
}

export async function rollbackChecks({db,root,one,role,check}){
  const catalog=readFileSync(resolve(root,'tools/native-runner/read-security-catalog.sql'),'utf8');
  const snapshot=async()=>({
    security:canonical(Object.values(await one(catalog))[0]),
    tables:(await db.query("SELECT n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','S') ORDER BY 1,2")).rows,
    policies:(await db.query("SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' ORDER BY 1,2,3")).rows,
    triggers:(await db.query("SELECT n.nspname,c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth') AND NOT t.tgisinternal ORDER BY 1,2,3")).rows
  });
  const apply=async path=>{
    const sql=readFileSync(resolve(root,path),'utf8');
    if(!sql.endsWith('ROLLBACK;\n'))throw Error('Review transaction guard missing');
    await db.exec(sql.replace(/^BEGIN;$/m,'').slice(0,-'ROLLBACK;\n'.length));
  };
  // Every nonempty subset of the six current change groups, in deployment order.
  const combinations=[];
  for(let mask=1;mask<2**changes.length;mask++){
    combinations.push(changes.filter((change,index)=>mask&(1<<index)));
  }
  await role('postgres');
  const before=await snapshot();
  for(const combination of combinations){
    await db.exec('SAVEPOINT combined_rollback');
    try{
      for(const change of combination)for(const path of change.apply)await apply(path);
      for(const change of [...combination].reverse())await apply(change.rollback);
      check('Combined rollback restores definitions, effective privileges, policies and triggers: '+combination.map(change=>change.name).join('+'),await snapshot(),before);
    }finally{
      await db.exec('ROLLBACK TO SAVEPOINT combined_rollback; RELEASE SAVEPOINT combined_rollback');
    }
  }
}
