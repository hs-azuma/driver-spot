// Synthetic objects only. Credentials, plaintext archive and keys remain in memory.
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {encryptBackup,decryptBackup} from '../restore-lab/backup-envelope.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
export async function storageRoundtrip({admin,owner,outsider,anon,check}){
 const source='v4-synthetic',target='v4-restored';
 const fixtures=[{path:'fixture.txt',type:'text/plain'}, {path:'nested/binary.bin',type:'application/octet-stream',body:Buffer.from([0,255,128,13,10,0,42])}, {path:'zero.bin',type:'application/octet-stream',body:Buffer.alloc(0)}];
 for(const f of fixtures.slice(1)){const r=await owner.storage.from(source).upload(f.path,f.body,{contentType:f.type,upsert:false});check('Storage creates '+f.path+' fixture',!r.error)}
 const files=[];
 for(const f of fixtures){const r=await owner.storage.from(source).download(f.path);check('Storage exports bytes '+f.path,!r.error);const bytes=Buffer.from(await r.data.arrayBuffer());files.push({path:f.path,type:f.type,bytes:bytes.length,sha256:hash(bytes),base64:bytes.toString('base64')})}
 const plaintext=Buffer.from(JSON.stringify({format:'spodora-storage-synthetic/1',synthetic_only:true,source,files}));
 const key=randomBytes(32).toString('base64url'),ciphertext=await encryptBackup(plaintext,key);
 await assert.rejects(decryptBackup(ciphertext,key+'wrong'));check('Storage archive refuses wrong key',true);
 const tampered=Buffer.from(ciphertext);tampered[tampered.length-17]^=1;await assert.rejects(decryptBackup(tampered,key));check('Storage archive refuses tampering',true);
 const bundle=JSON.parse((await decryptBackup(ciphertext,key)).toString());assert.equal(bundle.format,'spodora-storage-synthetic/1');assert.equal(bundle.synthetic_only,true);assert.equal(bundle.source,source);assert.deepEqual(bundle.files.map(f=>f.path),fixtures.map(f=>f.path));
 for(const f of bundle.files){const b=Buffer.from(f.base64,'base64');assert.equal(b.length,f.bytes);assert.equal(hash(b),f.sha256)}
 check('Storage decrypted manifest hashes validated',true);
 const removed=await admin.storage.from(source).remove(fixtures.map(f=>f.path));check('Synthetic source objects removed after encrypted backup',!removed.error);
 for(const f of fixtures){const r=await admin.storage.from(source).download(f.path);check('Source object absent '+f.path,!!r.error)}
 const bucket=await admin.storage.createBucket(target,{public:false});check('Separate restore bucket created private',!bucket.error);
 for(const f of bundle.files){const r=await owner.storage.from(target).upload(f.path,Buffer.from(f.base64,'base64'),{contentType:f.type,upsert:false});check('Storage restores '+f.path,!r.error);
  const d=await owner.storage.from(target).download(f.path);check('Owner reads restored '+f.path,!d.error);const b=Buffer.from(await d.data.arrayBuffer());check('Restored byte hash and length '+f.path,hash(b)===f.sha256&&b.length===f.bytes);check('Restored content type '+f.path,d.data.type.split(';')[0]===f.type);
  const foreign=await outsider.storage.from(target).download(f.path);check('Other user denied restored '+f.path,!!foreign.error);
  const publicRead=await anon.storage.from(target).download(f.path);check('Anonymous denied restored '+f.path,!!publicRead.error);
 }
 const metadata=await admin.storage.getBucket(target);check('Restored bucket remains private',!metadata.error&&metadata.data.public===false);
 return {transfer:{key,ciphertext:ciphertext.toString('base64')},status:'PASS_SYNTHETIC_STORAGE_BUCKET_RESTORE',files:files.map(({path,type,bytes,sha256})=>({path,type,bytes,sha256})),ciphertext_sha256:hash(ciphertext),key_stored:false,archive_stored:false,independent_host:false,owner_mapping:'original synthetic user JWT re-upload; original object UUIDs not preserved'};
}
