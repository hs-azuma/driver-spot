// Strict format for the three synthetic native drill objects, not a general production backup parser.
import {createHash} from 'node:crypto';
import {decryptBackup} from '../restore-lab/backup-envelope.mjs';
const paths=['fixture.txt','nested/binary.bin','zero.bin'];
export async function decodeStorageTransfer(transfer){
 if(!transfer||typeof transfer.ciphertext!=='string'||transfer.ciphertext.length>2*1024*1024||typeof transfer.key!=='string')throw Error('storage_transfer_invalid');
 const bytes=Buffer.from(transfer.ciphertext,'base64');if(bytes.toString('base64')!==transfer.ciphertext)throw Error('storage_transfer_invalid');
 const data=await decryptBackup(bytes,transfer.key);let b;try{b=JSON.parse(data.toString())}catch{throw Error('storage_manifest_invalid')}
 if(b?.format!=='spodora-storage-synthetic/1'||b.synthetic_only!==true||b.source!=='v4-synthetic'||!Array.isArray(b.files)||b.files.length!==3||b.files.some((f,i)=>f?.path!==paths[i]))throw Error('storage_manifest_invalid');
 for(const f of b.files){if(!['text/plain','application/octet-stream'].includes(f.type)||!Number.isSafeInteger(f.bytes)||f.bytes<0||f.bytes>1024*1024||typeof f.base64!=='string'||typeof f.sha256!=='string'||!/^[0-9a-f]{64}$/.test(f.sha256))throw Error('storage_manifest_invalid');
  const content=Buffer.from(f.base64,'base64');if(content.toString('base64')!==f.base64||content.length!==f.bytes||createHash('sha256').update(content).digest('hex')!==f.sha256)throw Error('storage_manifest_integrity');
 }
 return b;
}
