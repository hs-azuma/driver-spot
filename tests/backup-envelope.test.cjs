const {test}=require('node:test');
const assert=require('node:assert/strict');
const api=import('../tools/restore-lab/backup-envelope.mjs');
const passphrase='synthetic-test-passphrase-only';
const files=()=>({'application-review.sql':Buffer.from('synthetic schema'),'database.pglite.tgz':Buffer.from('synthetic bytes'),'restore-manifest.json':Buffer.from('{}'),'settings-fixture.json':Buffer.from('{"synthetic_only":true}')});
test('backup encrypt/decrypt preserves binary fixture and validates file hashes',async()=>{
 const m=await api,packed=m.packFixture(files());const encrypted=await m.encryptBackup(packed,passphrase);
 assert(!encrypted.includes(Buffer.from('synthetic schema')));
 const restored=m.unpackFixture(await m.decryptBackup(encrypted,passphrase));assert.deepEqual(restored,files());
});
test('backup random salt and nonce produce different ciphertext for identical inputs',async()=>{
 const m=await api,a=await m.encryptBackup(Buffer.from('same fixture'),passphrase),b=await m.encryptBackup(Buffer.from('same fixture'),passphrase);assert.notDeepEqual(a,b);
});
test('backup wrong key is refused',async()=>{
 const m=await api,e=await m.encryptBackup(Buffer.from('fixture'),passphrase);await assert.rejects(m.decryptBackup(e,'different-synthetic-password'),/authentication_failed/);
});
test('backup tampered ciphertext is refused',async()=>{
 const m=await api,e=await m.encryptBackup(Buffer.from('fixture'),passphrase);e[e.length-17]^=1;await assert.rejects(m.decryptBackup(e,passphrase),/authentication_failed/);
});
test('backup authenticated nonce header cannot be changed',async()=>{
 const m=await api,e=await m.encryptBackup(Buffer.from('fixture'),passphrase),magic=Buffer.byteLength('SPODORA-SYNTHETIC-BACKUP\0');
 const length=e.readUInt16BE(magic),offset=magic+2,header=JSON.parse(e.subarray(offset,offset+length).toString());
 header.nonce=(header.nonce[0]==='0'?'1':'0')+header.nonce.slice(1);
 Buffer.from(JSON.stringify(header)).copy(e,offset);await assert.rejects(m.decryptBackup(e,passphrase),/authentication_failed/);
});
test('backup truncated or unrecognized envelopes are refused',async()=>{
 const m=await api,e=await m.encryptBackup(Buffer.from('fixture'),passphrase);await assert.rejects(m.decryptBackup(e.subarray(0,20),passphrase),/format_invalid/);e[0]^=1;await assert.rejects(m.decryptBackup(e,passphrase),/format_invalid/);
});
test('backup short passphrases are refused',async()=>{await assert.rejects((await api).encryptBackup(Buffer.from('fixture'),'short'),/passphrase_invalid/)});
test('backup bundle rejects path traversal and missing files',async()=>{
 const m=await api,original=files();delete original['settings-fixture.json'];assert.throws(()=>m.packFixture(original),/files_invalid/);
 const parsed=JSON.parse(m.packFixture(files()).toString());parsed.files[0].name='../private.key';assert.throws(()=>m.unpackFixture(Buffer.from(JSON.stringify(parsed))),/bundle_invalid/);
});
test('backup bundle rejects checksum mismatch and non-synthetic flag',async()=>{
 const m=await api,parsed=JSON.parse(m.packFixture(files()).toString());parsed.files[0].sha256='0'.repeat(64);assert.throws(()=>m.unpackFixture(Buffer.from(JSON.stringify(parsed))),/integrity_failed/);
 parsed.synthetic_only=false;assert.throws(()=>m.unpackFixture(Buffer.from(JSON.stringify(parsed))),/bundle_invalid/);
});
test('backup bundle validates multi-megabyte binary data without recursive regex',async()=>{
 const m=await api,input=files();input['database.pglite.tgz']=Buffer.alloc(2*1024*1024,0xa5);
 assert.deepEqual(m.unpackFixture(m.packFixture(input))['database.pglite.tgz'],input['database.pglite.tgz']);
});
