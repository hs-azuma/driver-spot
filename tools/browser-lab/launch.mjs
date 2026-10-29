// Read only the pinned package binary. No root install, chown, remote downloads or host browser profile.
import {createReadStream,createWriteStream} from 'node:fs';
import {mkdtemp,chmod,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {pipeline} from 'node:stream/promises';
import {createBrotliDecompress} from 'node:zlib';
import {chromium} from 'playwright-core';
const here=dirname(fileURLToPath(import.meta.url));
export async function provision(){
 if(process.platform!=='linux'||process.arch!=='x64')throw new Error('This pinned lab runner requires Linux x64');
 const folder=await mkdtemp(join(tmpdir(),'spodora-browser-'));
 try{
  const executablePath=join(folder,'chromium');
  await pipeline(createReadStream(join(here,'node_modules/@sparticuz/chromium/bin/chromium.br')),createBrotliDecompress(),createWriteStream(executablePath,{mode:0o700}));
  await chmod(executablePath,0o700);
  return {async launch(){return chromium.launch({executablePath,headless:true,args:['--no-sandbox','--no-zygote','--single-process','--disable-gpu','--disable-software-rasterizer']})},async close(){await rm(folder,{recursive:true,force:true})}};
 }catch(error){await rm(folder,{recursive:true,force:true});throw error}
}
