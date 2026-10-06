(()=> {
 function normalize(value){return String(value||'').normalize('NFKC').replace(/[ぁ-ゖ]/g,c=>String.fromCharCode(c.charCodeAt(0)+0x60)).replace(/\s+/g,' ').trim()}
 function valid(value){return value.length<=100&&/^[ァ-ヺー・ ]+$/.test(value)&&/[ァ-ヺ]/.test(value)}
 function read(input,required=false){const value=normalize(input.value);input.value=value;return {value,ok:(!required&&!value)||valid(value)}}
 window.SpodoraNameKana={normalize,valid,read};
})();
