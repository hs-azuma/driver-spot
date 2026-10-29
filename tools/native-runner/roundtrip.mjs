// Synthetic native pg_dump only. stdout is the verified plaintext returned to the CI controller, never logged.
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
import {encryptBackup,decryptBackup} from '../restore-lab/backup-envelope.mjs';
let chunks=[];for await(const chunk of process.stdin)chunks.push(chunk);const input=Buffer.concat(chunks),key=randomBytes(32).toString('base64url');
const encrypted=await encryptBackup(input,key);assert.deepEqual(await decryptBackup(encrypted,key),input);await assert.rejects(decryptBackup(encrypted,key+'wrong'));
const changed=Buffer.from(encrypted);changed[changed.length-20]^=1;await assert.rejects(decryptBackup(changed,key));process.stdout.write(await decryptBackup(encrypted,key));
