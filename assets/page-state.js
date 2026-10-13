(function(root){
'use strict';
function read(key,allowed,fallback){const value=new URL(root.location.href).searchParams.get(key);return allowed.includes(value)?value:fallback}
function write(values){const url=new URL(root.location.href);for(const [key,value]of Object.entries(values)){if(value===null||value===undefined||value==='')url.searchParams.delete(key);else url.searchParams.set(key,String(value))}if(url.href!==root.location.href)root.history.replaceState(null,'',url.pathname+url.search+url.hash)}
root.SpodoraPageState={read,write};
})(typeof window==='undefined'?globalThis:window);
