// Offline filesystem-only preparation tool. Does not connect to or export any database.
import {createReadStream,createWriteStream} from 'node:fs';
import {open,lstat,readdir,mkdir,rm,rename,realpath,chmod} from 'node:fs/promises';
import {resolve,dirname,join,relative,sep} from 'node:path';
import {mkdtemp} from 'node:fs/promises';
import {randomBytes,scrypt as scryptCallback,createCipheriv,createDecipheriv,createHash} from 'node:crypto';
import {promisify} from 'node:util';
import {pipeline} from 'node:stream/promises';
import {Readable} from 'node:stream';
import {fileURLToPath} from 'node:url';
const derive=promisify(scryptCallback),MAGIC=Buffer.from('SPODORA-BACKUP-2\0'),MAX_FILES=100000,MAX_META=32*1024*1024;
function safeName(name){if(typeof name!=='string'||!name||name.includes('\\')||name.includes('\0')||name.startsWith('/')||name.split('/').some(x=>!x||x==='.'||x==='..'||x==='.git')||/^[A-Za-z]:/.test(name))throw Error('unsafe_path');return name}
async function outsideGit(path){let at=resolve(path);for(;;){try{await lstat(join(at,'.git'));throw Error('repository_destination_forbidden')}catch(e){if(e.code!=='ENOENT'&&e.code!=='ENOTDIR')throw e}const parent=dirname(at);if(parent===at)break;at=parent}}
async function absent(path){try{await lstat(path);throw Error('destination_exists')}catch(e){if(e.code!=='ENOENT')throw e}}
async function parentFor(path){const p=await realpath(dirname(resolve(path)));await outsideGit(p);const s=await lstat(p);if(process.platform!=='win32'&&(s.mode&0o077))throw Error('private_parent_required');return join(p,resolve(path).split(sep).at(-1))}
async function keyFor(password,salt){if(typeof password!=='string'||Buffer.byteLength(password)<24||Buffer.byteLength(password)>1024)throw Error('passphrase_length');return derive(password,salt,32,{N:32768,r:8,p:1,maxmem:128*1024*1024})}
async function inventory(root,prefix='',files=[]){for(const name of (await readdir(join(root,prefix))).sort()){const rel=safeName(prefix?prefix+'/'+name:name),path=join(root,rel),s=await lstat(path);if(s.isSymbolicLink())throw Error('symlink_forbidden');if(s.isDirectory())await inventory(root,rel,files);else if(s.isFile()){if(files.length>=MAX_FILES||!Number.isSafeInteger(s.size))throw Error('bundle_limit');const hash=createHash('sha256');await pipeline(createReadStream(path),async function*(source){for await(const c of source)hash.update(c)});files.push({name:rel,bytes:s.size,sha256:hash.digest('hex')})}else throw Error('special_file_forbidden')}return files}
export async function seal(source,destination,password){
 const root=await realpath(source);if(!(await lstat(root)).isDirectory())throw Error('directory_required');await outsideGit(root);
 const target=await parentFor(destination);if(target===root||target.startsWith(root+sep))throw Error('destination_inside_source');await absent(target);
 const files=await inventory(root);if(!files.length)throw Error('empty_bundle');
 const manifest=Buffer.from(JSON.stringify({format:'spodora-offline-files/2',created_at:new Date().toISOString(),files}));if(manifest.length>MAX_META)throw Error('manifest_limit');
 const salt=randomBytes(16),nonce=randomBytes(12),header=Buffer.concat([MAGIC,salt,nonce]),key=await keyFor(password,salt),part=target+'.part-'+randomBytes(8).toString('hex');
 try{const cipher=createCipheriv('aes-256-gcm',key,nonce);cipher.setAAD(header);const output=await open(part,'wx',0o600);await output.write(header);await output.close();
  async function* payload(){const length=Buffer.alloc(4);length.writeUInt32BE(manifest.length);yield length;yield manifest;for(const f of files){const s=await lstat(join(root,f.name));if(!s.isFile()||s.isSymbolicLink()||s.size!==f.bytes)throw Error('source_changed');const hash=createHash('sha256');let count=0;for await(const chunk of createReadStream(join(root,f.name))){count+=chunk.length;hash.update(chunk);yield chunk}if(count!==f.bytes||hash.digest('hex')!==f.sha256)throw Error('source_changed')}}
  await pipeline(Readable.from(payload()),cipher,createWriteStream(part,{flags:'a',mode:0o600}));const out=await open(part,'a');await out.write(cipher.getAuthTag());await out.sync();await out.close();
  // Hard link publishes without overwriting even if the final path appears concurrently.
  const {link}=await import('node:fs/promises');await link(part,target);await rm(part);return {status:'SEALED_OFFLINE_FILES',files:files.length,plaintext_bytes:files.reduce((n,f)=>n+f.bytes,0),database_exported:false};
 }finally{key.fill(0);await rm(part,{force:true})}
}
export async function restore(source,destination,password){
 const target=await parentFor(destination);await absent(target);const s=await lstat(source);if(!s.isFile()||s.isSymbolicLink()||s.size<MAGIC.length+28+16)throw Error('envelope_invalid');
 const sourceHandle=await open(source,'r'),header=Buffer.alloc(MAGIC.length+28),tag=Buffer.alloc(16);await sourceHandle.read(header,0,header.length,0);await sourceHandle.read(tag,0,16,s.size-16);await sourceHandle.close();if(!header.subarray(0,MAGIC.length).equals(MAGIC))throw Error('envelope_invalid');
 const key=await keyFor(password,header.subarray(MAGIC.length,MAGIC.length+16)),scratch=await mkdtemp(join(dirname(target),'.restore-'));await chmod(scratch,0o700);let published=false;
 try{const decipher=createDecipheriv('aes-256-gcm',key,header.subarray(-12));decipher.setAAD(header);decipher.setAuthTag(tag);
  // The spool is private. No extracted file is published before GCM authentication succeeds.
  const spool=join(scratch,'payload');await pipeline(createReadStream(source,{start:header.length,end:s.size-17}),decipher,createWriteStream(spool,{flags:'wx',mode:0o600}));
  const h=await open(spool,'r');let position=0;async function read(n){const b=Buffer.alloc(n);const {bytesRead}=await h.read(b,0,n,position);if(bytesRead!==n)throw Error('truncated_bundle');position+=n;return b}
  try{const n=(await read(4)).readUInt32BE();if(n<1||n>MAX_META)throw Error('manifest_limit');const m=JSON.parse((await read(n)).toString());if(m.format!=='spodora-offline-files/2'||!Array.isArray(m.files)||!m.files.length||m.files.length>MAX_FILES)throw Error('manifest_invalid');
   const names=new Set();let total=0;for(const f of m.files){safeName(f.name);if(names.has(f.name)||!Number.isSafeInteger(f.bytes)||f.bytes<0||!/^([a-f0-9]{64})$/.test(f.sha256))throw Error('manifest_invalid');names.add(f.name);total+=f.bytes;if(!Number.isSafeInteger(total))throw Error('bundle_limit')}
   if(position+total!==(await lstat(spool)).size)throw Error('bundle_size_mismatch');const extracted=join(scratch,'files');await mkdir(extracted,{mode:0o700});
   for(const f of m.files){const path=join(extracted,f.name);await mkdir(dirname(path),{recursive:true,mode:0o700});const out=await open(path,'wx',0o600),hash=createHash('sha256');try{for(let left=f.bytes;left;){const b=await read(Math.min(left,1024*1024));hash.update(b);await out.write(b);left-=b.length}await out.sync()}finally{await out.close()}if(hash.digest('hex')!==f.sha256)throw Error('content_hash_mismatch')}
   // Reserve destination, then rename within it; never overwrite an existing caller directory.
   await mkdir(target,{mode:0o700});published=true;for(const name of await readdir(extracted))await rename(join(extracted,name),join(target,name));return {status:'RESTORED_AUTHENTICATED_OFFLINE_FILES',files:m.files.length,database_restored:false};
  }finally{await h.close()}
 }catch(e){if(published)await rm(target,{recursive:true,force:true});throw e}
 finally{key.fill(0);await rm(scratch,{recursive:true,force:true})}
}
export async function retentionPlan(folder,days,now=Date.now()){
 if(!Number.isInteger(days)||days<1)throw Error('retention_days_required');const base=await realpath(folder);await outsideGit(base);const candidates=[];
 for(const name of await readdir(base)){if(!/^backup-\d{8}T\d{6}Z\.spbk$/.test(name))continue;const s=await lstat(join(base,name));if(s.isFile()&&!s.isSymbolicLink()&&now-s.mtimeMs>days*86400000)candidates.push(name)}
 return {status:'DRY_RUN_ONLY',retention_days:days,candidates:candidates.sort(),deleted:0};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const [command,source,target]=process.argv.slice(2);if(command==='retention-plan'){console.log(JSON.stringify(await retentionPlan(source,Number(target))))}else if(['seal','restore'].includes(command)&&source&&target){
  let password='';for await(const chunk of createReadStream(null,{fd:3,autoClose:false}))password+=chunk;if(password.endsWith('\n'))password=password.slice(0,-1);console.log(JSON.stringify(await (command==='seal'?seal:restore)(source,target,password)));password='';
 }else throw Error('usage: seal|restore source destination (passphrase on private fd 3), or retention-plan folder days')}
 catch{console.error('Backup operation refused or failed. Check private paths, key and file integrity; no credentials are logged.');process.exitCode=1}
}
