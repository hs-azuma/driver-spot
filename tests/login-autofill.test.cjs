const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
function setup(){
 let queue=[],sent=0;const listeners={},doc={getElementById:()=>true},form={ownerDocument:doc,isConnected:true,checkValidity:()=>true,addEventListener:(t,f)=>listeners[t]=f,requestSubmit:()=>{sent++;listeners.submit()}};
 function field(value,autofill){const events={};return {value,autofill,events,setAttribute(){},matches(){return this.autofill},blur(){},addEventListener(t,f){events[t]=f}}}
 const id=field('example',true),pw=field('test-password',true),status={textContent:'',setAttribute(){}};
 const context={setTimeout:f=>{queue.push(f);return f},clearTimeout:f=>{queue=queue.filter(x=>x!==f)}};vm.createContext(context);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../assets/login-autofill.js'),'utf8'),context);
 context.SpodoraLoginAutofill.enable(form,id,pw,status);
 return {id,pw,form,status,event:(type='input',trusted=true)=>pw.events[type]({type,isTrusted:trusted,animationName:'spodoraAutofillReady'}),flush:()=>{const q=queue;queue=[];q.forEach(f=>f())},sent:()=>sent,submit:()=>listeners.submit()};
}
let s=setup();s.event();s.flush();assert.equal(s.sent(),1);s.event();s.flush();assert.equal(s.sent(),1);
s=setup();s.pw.autofill=false;s.event();s.flush();assert.equal(s.sent(),0);
s=setup();s.event('input',false);s.flush();assert.equal(s.sent(),0);
s=setup();s.pw.value='';s.event();s.flush();assert.equal(s.sent(),0);
s=setup();s.event();s.submit();s.flush();assert.equal(s.sent(),0);
s=setup();s.event();s.form.isConnected=false;s.flush();assert.equal(s.sent(),0);
s=setup();s.event('animationstart');s.flush();assert.equal(s.sent(),1);
console.log('7 autofill login checks passed');
