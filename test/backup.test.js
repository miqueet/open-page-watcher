import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encryptBackup, decryptBackup, isEncrypted } from '../src/lib/backup.js';

const data = { format: 'open-page-watcher', version: 3, watches: [{ url: 'https://intranet.example/report?token=abc' }] };
const fast = { iterations: 100_000 };

test('encrypted backups round-trip and hide their contents', async () => {
  const file = await encryptBackup(data, 'correct horse', fast);
  assert.equal(isEncrypted(file), true);
  assert.ok(!JSON.stringify(file).includes('intranet'));
  assert.deepEqual(await decryptBackup(file, 'correct horse'), data);
});

test('a wrong password or tampered file is rejected', async () => {
  const file = await encryptBackup(data, 'correct horse', fast);
  await assert.rejects(decryptBackup(file, 'wrong horse'), /Wrong password/);
  const bytes = Uint8Array.from(atob(file.data), (c) => c.charCodeAt(0));
  bytes[0] ^= 1;
  const tampered = { ...file, data: btoa(String.fromCharCode(...bytes)) };
  await assert.rejects(decryptBackup(tampered, 'correct horse'), /Wrong password/);
});

test('files asking for too much or too little key stretching are refused', async () => {
  const file = await encryptBackup(data, 'correct horse', fast);
  await assert.rejects(decryptBackup({ ...file, kdf: { ...file.kdf, iterations: 1e9 } }, 'correct horse'), /damaged/);
  await assert.rejects(decryptBackup({ ...file, kdf: { ...file.kdf, iterations: 1 } }, 'correct horse'), /damaged/);
  await assert.rejects(encryptBackup(data, 'short'), /at least 8/);
});
