// Password-protected backup files. The export is encrypted on this computer
// with AES-256-GCM; the key comes from the password via PBKDF2-SHA-256.
// Nothing is sent anywhere, and the password isn't stored.

export const ENCRYPTED_FORMAT = 'open-page-watcher-encrypted';
export const ITERATIONS = 600_000;
// A file asking for far more work than this could freeze the page.
const MAX_ITERATIONS = 5_000_000;
const MIN_ITERATIONS = 100_000;

const toB64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const fromB64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

async function deriveKey(password, salt, iterations) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function chunkedB64(bytes) {
  // btoa(String.fromCharCode(...big)) overflows the call stack on large
  // files, so encode in slices.
  const u8 = new Uint8Array(bytes);
  let out = '';
  for (let i = 0; i < u8.length; i += 0x8000) out += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(out);
}

export function isEncrypted(data) {
  return data?.format === ENCRYPTED_FORMAT;
}

export async function encryptBackup(data, password, { iterations = ITERATIONS } = {}) {
  if (typeof password !== 'string' || password.length < 8) throw new Error('Use a password of at least 8 characters');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, iterations);
  const plain = new TextEncoder().encode(JSON.stringify(data));
  const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain);
  return {
    format: ENCRYPTED_FORMAT,
    version: 1,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: toB64(salt) },
    cipher: { name: 'AES-GCM', iv: toB64(iv) },
    data: chunkedB64(sealed),
  };
}

export async function decryptBackup(file, password) {
  if (!isEncrypted(file) || file.version !== 1 || file.kdf?.name !== 'PBKDF2' || file.kdf?.hash !== 'SHA-256'
    || file.cipher?.name !== 'AES-GCM' || typeof file.data !== 'string') {
    throw new Error('This backup file is damaged or from a newer version');
  }
  const iterations = Number(file.kdf.iterations);
  if (!Number.isInteger(iterations) || iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) {
    throw new Error('This backup file is damaged or from a newer version');
  }
  let plain;
  try {
    const key = await deriveKey(String(password), fromB64(file.kdf.salt), iterations);
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(file.cipher.iv) }, key, fromB64(file.data));
  } catch {
    throw new Error('Wrong password, or the file is damaged');
  }
  return JSON.parse(new TextDecoder().decode(plain));
}
