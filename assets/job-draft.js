(function(){
 const ids=['desc','detail','vehicle','head','date','start','end','break','pref','mun','loc','dest','access','license','exp','ptype','pay','fee','feeType','guarantee','notes'];
 function read(doc=document){return Object.fromEntries(ids.map(id=>[id,doc.getElementById(id)?.value??'']))}
 function fill(content,doc=document){const set=(id,value)=>{const el=doc.getElementById(id);if(!el||value==null)return;if(el.tagName==='SELECT'&&value!==''&&!Array.from(el.options).some(o=>o.value===String(value))){const o=doc.createElement('option');o.value=String(value);o.textContent=id==='break'?value+'分':String(value);el.appendChild(o)}el.value=String(value)};set('pref',content.pref);fillMunicipalitySelect(doc.getElementById('mun'),String(content.pref||''));for(const id of ids)set(id,content[id]);doc.getElementById('confirm').checked=false}
 window.SpodoraJobDraft={read,fill,ids};
})();
