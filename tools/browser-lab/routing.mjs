import {resolve,sep} from 'node:path';
export const origin='https://spodora.test';
export const csp="default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; frame-src 'none'; worker-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'";
export function localResource(raw,method,root,fontRoot){
 const url=new URL(raw);if(url.origin!==origin||method!=='GET')return null;
 let path;try{path=decodeURIComponent(url.pathname)}catch{return null}
 if(path==='/')return {landing:true};
 if(['/apply-confirm.html','/driver.html','/company.html'].includes(path))return {file:resolve(root,'.'+path),html:true};
 for(const [prefix,base,extensions] of [['/assets/',resolve(root,'assets'),/\.(js|css|png|svg|webp|jpg|jpeg)$/],['/__lab_font/',resolve(fontRoot),/\.(css|woff2|woff)$/]]){
  if(!path.startsWith(prefix)||!extensions.test(path))continue;
  const file=resolve(base,path.slice(prefix.length));if(file.startsWith(base+sep))return {file};
 }
 return null;
}
