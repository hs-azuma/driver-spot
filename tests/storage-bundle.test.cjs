const {test}=require('node:test');const assert=require('node:assert/strict');const {createHash}=require('node:crypto');
async function tools(){return {...await import('../tools/native-runner/storage-bundle.mjs'),...await import('../tools/restore-lab/backup-envelope.mjs')}}
const key='synthetic-archive-test-only-passphrase';
function manifest(){return {format:'spodora-storage-synthetic/1',synthetic_only:true,source:'v4-synthetic',files:['fixture.txt','nested/binary.bin','zero.bin'].map(path=>({path,type:'application/octet-stream',bytes:0,base64:'',sha256:createHash('sha256').update('').digest('hex')}))}}
async function transfer(b){const {encryptBackup}=await tools();return {key,ciphertext:(await encryptBackup(Buffer.from(JSON.stringify(b)),key)).toString('base64')}}
test('Storage bundle accepts a complete authenticated synthetic archive',async()=>{const {decodeStorageTransfer}=await tools();assert.equal((await decodeStorageTransfer(await transfer(manifest()))).files.length,3)});
for(const [name,mutate] of [
 ['missing file',b=>b.files.pop()],['duplicate file',b=>b.files[1].path=b.files[0].path],['path traversal',b=>b.files[0].path='../escape'],['wrong length',b=>b.files[0].bytes=1],['wrong hash',b=>b.files[0].sha256='0'.repeat(64)],['noncanonical base64',b=>b.files[0].base64='!'],['non-synthetic manifest',b=>b.synthetic_only=false],['negative size',b=>b.files[0].bytes=-1]
])test('Storage bundle refuses '+name,async()=>{const {decodeStorageTransfer}=await tools();const b=manifest();mutate(b);await assert.rejects(decodeStorageTransfer(await transfer(b)))});
test('Storage bundle refuses truncated ciphertext',async()=>{const {decodeStorageTransfer}=await tools();const t=await transfer(manifest());t.ciphertext=t.ciphertext.slice(0,-12);await assert.rejects(decodeStorageTransfer(t))});
test('Storage bundle refuses missing key without connecting to services',async()=>{const {decodeStorageTransfer}=await tools();await assert.rejects(decodeStorageTransfer({ciphertext:''}))});
