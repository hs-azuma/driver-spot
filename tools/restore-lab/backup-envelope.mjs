// Synthetic backup lab only. Standard Node AES-GCM/scrypt; no cloud, database, filesystem or logging.
import {randomBytes, scrypt, createCipheriv, createDecipheriv, createHash} from 'node:crypto';
import {promisify} from 'node:util';
const derive=promisify(scrypt);
const MAGIC=Buffer.from('SPODORA-SYNTHETIC-BACKUP\0');
const LIMIT=64*1024*1024;
const NAMES=['application-review.sql','database.pglite.tgz','restore-manifest.json','settings-fixture.json'];
const hash=buffer=>createHash('sha256').update(buffer).digest('hex');
function password(value){if(typeof value!=='string'||Buffer.byteLength(value)<16||Buffer.byteLength(value)>1024)throw Error('backup_passphrase_invalid')}
async function keyFor(value,salt){password(value);return derive(value,salt,32,{N:16384,r:8,p:1,maxmem:64*1024*1024})}
export async function encryptBackup(plaintext,passphrase){
 const input=Buffer.from(plaintext);if(input.length>LIMIT)throw Error('backup_size_limit');
 const salt=randomBytes(16),nonce=randomBytes(12);
 const header=Buffer.from(JSON.stringify({version:1,algorithm:'AES-256-GCM',kdf:'scrypt-N16384-r8-p1',salt:salt.toString('hex'),nonce:nonce.toString('hex')}));
 const size=Buffer.alloc(2);size.writeUInt16BE(header.length);
 const prefix=Buffer.concat([MAGIC,size,header]);const key=await keyFor(passphrase,salt);
 try{const cipher=createCipheriv('aes-256-gcm',key,nonce);cipher.setAAD(prefix);
  return Buffer.concat([prefix,cipher.update(input),cipher.final(),cipher.getAuthTag()]);
 }finally{key.fill(0)}
}
export async function decryptBackup(envelope,passphrase){
 const input=Buffer.from(envelope);
 if(input.length<MAGIC.length+2+16||input.length>LIMIT+2048||!input.subarray(0,MAGIC.length).equals(MAGIC))throw Error('backup_format_invalid');
 const headerLength=input.readUInt16BE(MAGIC.length),offset=MAGIC.length+2+headerLength;
 if(headerLength<1||headerLength>1024||offset+16>input.length)throw Error('backup_format_invalid');
 let header;try{header=JSON.parse(input.subarray(MAGIC.length+2,offset).toString('utf8'))}catch{throw Error('backup_format_invalid')}
 if(header?.version!==1||header.algorithm!=='AES-256-GCM'||header.kdf!=='scrypt-N16384-r8-p1'
  ||typeof header.salt!=='string'||!/^[0-9a-f]{32}$/.test(header.salt)||typeof header.nonce!=='string'||!/^[0-9a-f]{24}$/.test(header.nonce)
  ||Object.keys(header).sort().join(',')!=='algorithm,kdf,nonce,salt,version')throw Error('backup_format_invalid');
 const key=await keyFor(passphrase,Buffer.from(header.salt,'hex'));
 try{const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(header.nonce,'hex'));
  decipher.setAAD(input.subarray(0,offset));decipher.setAuthTag(input.subarray(-16));
  return Buffer.concat([decipher.update(input.subarray(offset,-16)),decipher.final()]);
 }catch{throw Error('backup_authentication_failed')}finally{key.fill(0)}
}
export function packFixture(files){
 if(Object.keys(files).sort().join(',')!==NAMES.join(','))throw Error('backup_fixture_files_invalid');
 const entries=NAMES.map(name=>{const data=Buffer.from(files[name]);return {name,bytes:data.length,sha256:hash(data),base64:data.toString('base64')}});
 const result=Buffer.from(JSON.stringify({format:'spodora-synthetic-bundle/1',synthetic_only:true,files:entries}));
 if(result.length>LIMIT)throw Error('backup_size_limit');return result;
}
export function unpackFixture(plaintext){
 const input=Buffer.from(plaintext);if(input.length>LIMIT)throw Error('backup_size_limit');
 let bundle;try{bundle=JSON.parse(input.toString('utf8'))}catch{throw Error('backup_bundle_invalid')}
 if(bundle?.format!=='spodora-synthetic-bundle/1'||bundle.synthetic_only!==true||!Array.isArray(bundle.files)||bundle.files.length!==NAMES.length)throw Error('backup_bundle_invalid');
 const found=new Map();
 for(const file of bundle.files){
  if(!file||typeof file!=='object'||!NAMES.includes(file.name)||found.has(file.name)||!Number.isSafeInteger(file.bytes)||file.bytes<0||file.bytes>LIMIT
   ||typeof file.base64!=='string'||file.base64.length%4!==0||/[^A-Za-z0-9+/=]/.test(file.base64)
   ||typeof file.sha256!=='string'||!/^[0-9a-f]{64}$/.test(file.sha256))throw Error('backup_bundle_invalid');
  const data=Buffer.from(file.base64,'base64');if(data.toString('base64')!==file.base64||data.length!==file.bytes||hash(data)!==file.sha256)throw Error('backup_integrity_failed');found.set(file.name,data);
 }
 return Object.fromEntries(found);
}
