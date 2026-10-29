const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('driver.html','utf8');
const source = html.match(/async function cancelApp\(id,back=false\)\{[\s\S]*?\}(?=\s*async function showDriver\()/)[0];

async function simulate(result, back=false, confirmed=true) {
  const alerts=[], calls=[], refreshed=[];
  const context={
    confirm:()=>confirmed,
    alert:x=>alerts.push(x),
    showMyPage:()=>refreshed.push('my-page'),
    loadJobs:()=>refreshed.push('jobs'),
    db:{from:table=>{
      calls.push(['from',table]);
      return {delete:()=>({eq:(key,value)=>{
        calls.push(['eq',key,value]);
        return {select:async fields=>{calls.push(['select',fields]);return result}};
      }})};
    }}
  };
  vm.createContext(context);
  vm.runInContext('const applicationActions=new Set();\n'+source,context);
  await context.cancelApp(42,back);
  return {alerts,calls,refreshed};
}

test('cancel reports success only for an actually deleted application',async()=>{
  const r=await simulate({data:[{id:42}],error:null});
  assert.deepEqual(r.alerts,['応募をキャンセルしました。']);
  assert.deepEqual(r.calls,[['from','applications'],['eq','id',42],['select','id']]);
  assert.deepEqual(r.refreshed,['jobs']);
});
test('cancel with zero affected rows shows status conflict and refreshes',async()=>{
  const r=await simulate({data:[],error:null});
  assert.match(r.alerts[0],/キャンセルできない状態/);
  assert(!r.alerts.includes('応募をキャンセルしました。'));
  assert.deepEqual(r.refreshed,['jobs']);
});
test('cancel cannot infer success from a missing result',async()=>{
  const r=await simulate({data:null,error:null},true);
  assert.match(r.alerts[0],/キャンセルできない状態/);
  assert.deepEqual(r.refreshed,['my-page']);
});
test('cancel database error preserves its message and never shows success',async()=>{
  const r=await simulate({data:null,error:{message:'permission denied'}});
  assert.deepEqual(r.alerts,['permission denied']);
  assert.deepEqual(r.refreshed,[]);
});
test('cancel confirmation decline never calls database',async()=>{
  const r=await simulate({data:[{id:42}],error:null},false,false);
  assert.deepEqual(r.calls,[]);
  assert.deepEqual(r.alerts,[]);
});
