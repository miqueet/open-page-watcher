// Reads a fetch response body, giving up as soon as it passes `limit` bytes
// so a huge or endless download can't use up the browser's memory.

// Pages read without running their scripts. Some marketing pages really are
// this big (one product download page sends 17 MB of HTML, mostly
// indentation). The page goes to the page reader in one message, which
// Chrome caps at 64 MB once escaped, and tabs or other control characters
// take two bytes there: 25 MB stays under that cap whatever the page holds.
export const MAX_PAGE_BYTES = 25 * 1024 * 1024;
export const MAX_PDF_BYTES = 20 * 1024 * 1024;

const MB = 1024 * 1024;

export function formatMB(bytes) {
  const mb = bytes / MB;
  return `${mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10} MB`;
}

export function tooLargeError(limit, { pdf = false, size = 0 } = {}) {
  const what = pdf ? 'The PDF' : 'The page';
  const known = size > limit ? ` (${formatMB(size)})` : '';
  const e = new Error(`${what} is larger than ${formatMB(limit)}${known}`);
  e.tooLarge = true;
  return e;
}

export async function readLimited(response, limit, { pdf = false } = {}) {
  // A size the server announces up front saves downloading the page at all.
  // With compression it's the compressed size, which is never more than the
  // page itself, so it only ever refuses pages that are too big anyway.
  const announced = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(announced) && announced > limit) {
    response.body?.cancel?.().catch(() => {});
    throw tooLargeError(limit, { pdf, size: announced });
  }
  if (!response.body) return new Uint8Array(0);
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      reader.cancel().catch(() => {});
      throw tooLargeError(limit, { pdf });
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}
