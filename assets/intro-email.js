(function(root){
  'use strict';
  const subject='スポドラ｜ドライバーと企業をやさしくつなぐ';
  const body='スポドラ\nドライバーと企業をやさしくつなぐ\n\n仕事探し・求人掲載・採用・勤怠管理まで。\n\nhttps://spodora.com/';
  function build(recipient){
    const raw=String(recipient||'');
    if(/[\x00-\x1f\x7f]/.test(raw))return null;
    const to=raw.trim();
    if(to.length>254||!/^[^\s@<>?,;:"\\]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(to))return null;
    return 'mailto:'+encodeURIComponent(to)+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);
  }
  const api=Object.freeze({build});
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.SpodoraIntroEmail=api;
})(typeof globalThis!=='undefined'?globalThis:this);
