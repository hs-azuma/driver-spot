const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const auth=require('../assets/auth-session.js');
(async()=>{
 const info=auth.callbackInfo('#access_token=test&refresh_token=test&type=signup');
 assert.equal(info.present,true);
 assert.equal(auth.callbackInfo('#work-44').present,false);
 assert.equal(auth.callbackInfo('#error=access_denied&error_code=otp_expired').failed,true);
 let resolve,done=false;
 const pending=new Promise(r=>resolve=r);
 const session={user:{id:'test',user_metadata:{driver_name:'テスト'}}};
 const ready=auth.ready({auth:{getSession:()=>pending}},info).then(s=>{done=true;return s});
 await Promise.resolve();assert.equal(done,false,'Must wait for URL session persistence');
 resolve({data:{session},error:null});
 assert.equal(await ready,session);
 assert.equal(auth.destination(session.user),'./driver.html');
 assert.equal(auth.destination({user_metadata:{company_name:'テスト企業'}}),'./company-register.html');
 assert.equal(await auth.ready({auth:{getSession:async()=>({data:{session:null},error:null})}},auth.callbackInfo('')),null);
 for(const response of [{data:{session:null},error:null},{data:{session},error:new Error('do not expose tokens')}]){
  await assert.rejects(auth.ready({auth:{getSession:async()=>response}},info),/確認リンク/);
 }
 await assert.rejects(auth.ready({auth:{getSession:async()=>({data:{session},error:null})}},auth.callbackInfo('#error=access_denied')),/確認リンク/);
 assert.deepEqual(auth.options.auth,{flowType:'implicit',detectSessionInUrl:true,persistSession:true,autoRefreshToken:true});
 for(const path of ['driver.html','driver-register.html','company-register.html','index.html']){
  const html=fs.readFileSync(require('node:path').join(__dirname,'..',path),'utf8');
  for(const [,script] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(script,{filename:path});
  assert.match(html,/auth-session\.js/);
 }
 const company=fs.readFileSync(require('node:path').join(__dirname,'..','company-register.html'),'utf8');
 assert.match(company,/emailRedirectTo:new URL\('\.\/company-register\.html',location.href\)\.href/);
 assert.doesNotMatch(company,/emailRedirectTo:'https:\/\/hs-azuma/);
 console.log('Auth callback tests passed: delayed session, routing, invalid links, persistence and page syntax.');
})().catch(e=>{console.error(e);process.exitCode=1});
