import test from 'node:test';
import assert from 'node:assert/strict';
import { readLimited, formatMB, MAX_PAGE_BYTES } from '../src/lib/readlimit.js';

function streamed(sizes, headers = {}) {
  let i = 0;
  let cancelled = false;
  const body = new ReadableStream({
    pull(controller) {
      if (i >= sizes.length) return controller.close();
      controller.enqueue(new Uint8Array(sizes[i++]).fill(9));
    },
    cancel() { cancelled = true; },
  });
  const response = new Response(body, { headers });
  return { response, pulled: () => i, cancelled: () => cancelled };
}

test('reads a body under the limit in full', async () => {
  const { response } = streamed([3, 4, 5]);
  const bytes = await readLimited(response, 100);
  assert.equal(bytes.length, 12);
  assert.ok(bytes.every((b) => b === 9));
});

test('stops reading as soon as the limit is passed', async () => {
  const { response, pulled, cancelled } = streamed([60, 60, 60, 60, 60]);
  await assert.rejects(readLimited(response, 100), (e) => e.tooLarge === true && /The page is larger than/.test(e.message));
  assert.ok(pulled() < 5);
  assert.ok(cancelled());
});

test('refuses up front when the server announces a bigger size', async () => {
  const { response, pulled } = streamed([10], { 'content-length': String(30 * 1024 * 1024) });
  await assert.rejects(readLimited(response, MAX_PAGE_BYTES), /larger than 25 MB \(30 MB\)/);
  assert.equal(pulled(), 0);
});

test('PDFs are named in the message', async () => {
  const { response } = streamed([200]);
  await assert.rejects(readLimited(response, 100, { pdf: true }), /^Error: The PDF is larger than/);
});

test('pages the size of large marketing pages are within the limit', () => {
  // A real product download page sends about 17.5 MB of HTML.
  assert.ok(MAX_PAGE_BYTES > 17.5 * 1024 * 1024);
  // Sent to the page reader as one message: tabs escape to two bytes, and
  // Chrome refuses messages over 64 MB.
  assert.ok(MAX_PAGE_BYTES * 2 < 64 * 1024 * 1024);
});

test('sizes read naturally', () => {
  assert.equal(formatMB(25 * 1024 * 1024), '25 MB');
  assert.equal(formatMB(1.25 * 1024 * 1024), '1.3 MB');
});
