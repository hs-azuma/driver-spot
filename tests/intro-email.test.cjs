const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const intro=require('../assets/intro-email.js');
test('intro mailto has one recipient and fixed subject/body/site',()=>{
  const href=intro.build('friend+tag@example.invalid');
  const [to,query]=href.slice('mailto:'.length).split('?');
  const params=new URLSearchParams(query);
  assert.equal(decodeURIComponent(to),'friend+tag@example.invalid');
  assert.match(params.get('subject'),/スポドラ/);
  assert.match(params.get('body'),/https:\/\/spodora\.com\//);
  assert.deepEqual([...params.keys()],['subject','body']);
});
test('intro rejects header injection, query injection and multiple recipients',()=>{
  for(const value of ['a@example.com\r\nBcc:other@example.com','a@example.com?bcc=other@example.com',
    'a\0@example.com','a@example.com,b@example.com','a@example.com;b@example.com','javascript:alert(1)','not-email'])assert.equal(intro.build(value),null,value);
});
const html=fs.readFileSync('index.html','utf8');
function simulate({valid=true,to='friend@example.invalid',throws=false}={}){
  const msg={textContent:''},input={value:to,checkValidity:()=>valid};
  const destinations=[];
  const context={document:{getElementById:id=>id==='shareEmail'?input:msg},SpodoraIntroEmail:intro,
    location:{set href(value){if(throws)throw Error('unavailable');destinations.push(value)}},
    fetch:()=>{throw Error('Intro must not call server')}};
  vm.createContext(context);
  const source=html.match(/function sendIntro\(\)\{[\s\S]*?\}(?=<\/script>)/)[0];
  vm.runInContext(source,context);context.sendIntro();
  return {destinations,message:msg.textContent};
}
test('intro UI opens email app without claiming email delivery',()=>{
  const r=simulate();assert.equal(r.destinations.length,1);assert.match(r.destinations[0],/^mailto:/);
  assert(!r.message.includes('送信しました'));assert.match(r.message,/確認して送信/);
  assert(!html.includes('/functions/v1/share-driver-spot-email'));
});
test('intro UI rejects invalid input before navigation',()=>{
  assert.equal(simulate({valid:false}).destinations.length,0);
  assert.equal(simulate({to:'a@example.com?bcc=x@example.com'}).destinations.length,0);
});
test('intro UI handles unavailable mail application without success claim',()=>{
  const r=simulate({throws:true});assert.equal(r.destinations.length,0);assert.match(r.message,/開けませんでした/);
  assert(!r.message.includes('送信しました'));
});
