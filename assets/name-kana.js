(()=> {
 function normalize(value){return String(value||'').normalize('NFKC').replace(/[ぁ-ゖ]/g,c=>String.fromCharCode(c.charCodeAt(0)+0x60)).replace(/\s+/g,' ').trim()}
 function valid(value){return value.length<=100&&/^[ァ-ヺー・ ]+$/.test(value)&&/[ァ-ヺ]/.test(value)}
 function read(input,required=false){const value=normalize(input.value);input.value=value;return {value,ok:(!required&&!value)||valid(value)}}
 function kanaText(value){const text=String(value||'').normalize('NFKC');return /^[ぁ-ゖァ-ヺー・\s]*$/.test(text)?text.replace(/[ぁ-ゖ]/g,c=>String.fromCharCode(c.charCodeAt(0)+0x60)):null}
 function bind(name,kana,note){
  let previous=name.value,parts=previous?[{text:previous,reading:kana.value||kanaText(previous)}]:[],manual=!!kana.value,lastAuto=kana.value,composition=null;
  const hint=text=>{if(note)note.textContent=text};
  const defaultHint='氏名を入力するとフリガナを自動入力します。読み方を確認し、違う場合は修正してください。';
  function sync(){
   if(kana.value!==lastAuto)manual=!!kana.value;
   if(manual){hint('フリガナは手入力した内容を保持しています。氏名の読み方と合っているか確認してください。');return}
   if(parts.some(p=>p.reading===null)){
    if(kana.value){kana.value='';lastAuto='';kana.dispatchEvent(new Event('input',{bubbles:true}))}
    hint('読み方を自動取得できませんでした。フリガナを全角カタカナで入力してください。');return
   }
   const value=normalize(parts.map(p=>p.reading).join(''));
   if(value!==kana.value){kana.value=value;lastAuto=value;kana.dispatchEvent(new Event('input',{bubbles:true}))}
   hint(defaultHint);
  }
  function sliceParts(start,end){
   let offset=0,result=[];
   for(const part of parts){const left=Math.max(start,offset),right=Math.min(end,offset+part.text.length);if(left<right){const text=part.text.slice(left-offset,right-offset);result.push({text,reading:left===offset&&right===offset+part.text.length?part.reading:kanaText(text)})}offset+=part.text.length}
   return result;
  }
  function update(value,reading,range){
   if(value===previous)return;
   if(parts.map(p=>p.text).join('')!==previous)parts=previous?[{text:previous,reading:kanaText(previous)}]:[];
   let start=0,end=previous.length,newEnd=value.length;
   if(range&&value.startsWith(previous.slice(0,range.start))&&value.endsWith(previous.slice(range.end))){start=range.start;end=range.end;newEnd=value.length-(previous.length-end)}
   else{while(start<previous.length&&start<value.length&&previous[start]===value[start])start++;while(end>start&&newEnd>start&&previous[end-1]===value[newEnd-1]){end--;newEnd--}}
   const inserted=value.slice(start,newEnd);
   parts=[...sliceParts(0,start),...(inserted?[{text:inserted,reading:reading===undefined?kanaText(inserted):reading}]:[]),...sliceParts(end,previous.length)];
   previous=value;sync();
  }
  function reconcile(){if(name.value!==previous){previous=name.value;parts=previous?[{text:previous,reading:kana.value||kanaText(previous)}]:[];lastAuto=kana.value;manual=!!kana.value}}
  name.addEventListener('compositionstart',()=>{reconcile();composition={start:name.selectionStart??previous.length,end:name.selectionEnd??previous.length,reading:null}});
  name.addEventListener('compositionupdate',event=>{if(composition){const value=kanaText(event.data);if(value!==null)composition.reading=value}});
  name.addEventListener('compositionend',event=>{const active=composition;composition=null;if(!active)return;const committed=kanaText(event.data);update(name.value,committed??active.reading,active)});
  name.addEventListener('input',event=>{if(composition||event.isComposing)return;update(name.value)});
  name.addEventListener('focus',reconcile);
  kana.addEventListener('input',()=>{manual=kana.value!==lastAuto&&!!kana.value;if(manual)hint('フリガナは手入力した内容を保持しています。読み方を確認してください。')});
  hint(defaultHint);
 }
 window.SpodoraNameKana={normalize,valid,read,bind};
 document.addEventListener('DOMContentLoaded',()=>{document.querySelectorAll('[data-kana-target]').forEach(name=>{const kana=document.getElementById(name.dataset.kanaTarget);if(kana)bind(name,kana,document.getElementById(kana.id+'Help'))})});
})();
