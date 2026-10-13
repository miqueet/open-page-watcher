// End-to-end check: loads the unpacked extension in Chromium and drives it
// against a local test server.
//
//   PLAYWRIGHT=/path/to/playwright node test/e2e.mjs
//
// The test copy of the extension pre-grants http://127.0.0.1/* because the
// real permission prompt can't be clicked in an automated browser.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const extDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opw-ext-'));
for (const item of ['manifest.json', 'src', 'icons']) fs.cpSync(path.join(root, item), path.join(extDir, item), { recursive: true });
const manifest = JSON.parse(fs.readFileSync(path.join(extDir, 'manifest.json')));
manifest.host_permissions = ['http://127.0.0.1/*'];
fs.writeFileSync(path.join(extDir, 'manifest.json'), JSON.stringify(manifest));

let price = '$10';
let cookieSeen = null;
let trackerHits = 0;
const server = http.createServer((req, res) => {
  if (req.url === '/product') {
    cookieSeen = req.headers.cookie || '';
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.setHeader('set-cookie', 'session=secret; Path=/');
    return res.end(`<!doctype html><title>Product</title>
      <script>window.ran = true; document.title = 'scripts ran';</script>
      <style>.x{}</style>
      <h1>Widget</h1><p id="price">${price}</p><p class="stock">In stock</p>
      <img src="/tracker.png" alt="photo">`);
  }
  if (req.url === '/dynamic') {
    res.setHeader('content-type', 'text/html');
    return res.end(`<!doctype html><title>Dyn</title><div id="out">loading</div>
      <script src="/dyn.js"></script>`);
  }
  if (req.url === '/dyn.js') {
    res.setHeader('content-type', 'text/javascript');
    return res.end(`document.getElementById('out').textContent = 'rendered ${price}';`);
  }
  if (req.url === '/data.json') {
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({ price, ok: true }));
  }
  if (req.url === '/tracker.png') trackerHits++;
  res.statusCode = 404;
  res.end('nope');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'opw-profile-'));
const context = await chromium.launchPersistentContext(userData, {
  headless: true,
  channel: 'chromium', // full Chromium; the headless shell can't load extensions
  executablePath: process.env.CHROMIUM || undefined,
  args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
});

let failed = false;
const step = async (name, fn) => {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (e) {
    failed = true;
    console.log(`not ok - ${name}\n  ${e.stack || e}`);
  }
};

try {
  let [sw] = context.serviceWorkers();
  sw ||= await context.waitForEvent('serviceworker');
  const extId = new URL(sw.url()).host;
  const page = await context.newPage();
  page.on('pageerror', (e) => { failed = true; console.log('page error:', e.message); });
  await page.goto(`chrome-extension://${extId}/src/ui/inbox.html`);

  const send = (msg) => page.evaluate((m) => chrome.runtime.sendMessage(m), msg);
  const history = (id) => page.evaluate(async (k) => (await chrome.storage.local.get(k))[k] || [], `history:${id}`);
  const watchOf = (id) => page.evaluate(async (i) => (await chrome.storage.local.get('watches')).watches[i], id);
  const waitFor = async (fn, ms = 15000) => {
    const end = Date.now() + ms;
    for (;;) {
      const v = await fn();
      if (v) return v;
      if (Date.now() > end) throw new Error('timed out');
      await new Promise((r) => setTimeout(r, 200));
    }
  };

  let wholeId;
  await step('whole-page watch captures text without running scripts', async () => {
    const res = await send({ type: 'createWatch', watch: { url: `${base}/product` } });
    assert.equal(res.ok, true, res.error);
    wholeId = res.id;
    const h = await waitFor(async () => (await history(wholeId))[0]);
    assert.match(h.text, /Widget\n\$10\nIn stock/);
    assert.doesNotMatch(h.text, /window\.ran|\.x\{\}/);
    assert.match(h.text, /photo/);
  });

  await step('cookies are not sent by default', async () => {
    await page.evaluate(async (u) => { await fetch(u, { credentials: 'include' }); }, `${base}/product`);
    await send({ type: 'checkNow', id: wholeId });
    assert.equal(cookieSeen, '');
  });

  await step('cookies are sent when the watch opts in', async () => {
    const res = await send({ type: 'createWatch', watch: { url: `${base}/product`, sendCookies: true } });
    await waitFor(async () => (await history(res.id))[0]);
    assert.match(cookieSeen, /session=secret/);
    await send({ type: 'deleteWatch', id: res.id });
  });

  let priceId;
  await step('selector watch, change detection, condition, unread and badge', async () => {
    const res = await send({
      type: 'createWatch',
      watch: { url: `${base}/product`, selectors: [{ type: 'css', expr: '#price' }], condition: { type: 'numberDecreased' } },
    });
    priceId = res.id;
    await waitFor(async () => (await history(priceId)).length === 1);
    assert.equal((await history(priceId))[0].text, '$10');

    price = '$12'; // increase: recorded but no alert
    await send({ type: 'checkNow', id: priceId });
    assert.equal((await history(priceId)).length, 2);
    assert.equal((await watchOf(priceId)).unread, false);

    price = '$8'; // decrease: alert
    await send({ type: 'checkNow', id: priceId });
    assert.equal((await history(priceId)).length, 3);
    assert.equal((await watchOf(priceId)).unread, true);
    const badge = await sw.evaluate(() => chrome.action.getBadgeText({}));
    assert.equal(badge, '1');
  });

  await step('inbox shows a word-level diff and marks the watch read', async () => {
    await page.evaluate((id) => { location.hash = `#/w/${id}`; }, priceId);
    await page.waitForSelector('.diff ins');
    assert.equal(await page.textContent('.diff ins'), '$8');
    assert.equal(await page.textContent('.diff del'), '$12');
    await waitFor(async () => (await watchOf(priceId)).unread === false);
  });

  await step('missing elements are reported as an error', async () => {
    const res = await send({ type: 'createWatch', watch: { url: `${base}/product`, selectors: [{ type: 'css', expr: '#nope' }] } });
    const w = await waitFor(async () => { const x = await watchOf(res.id); return x.lastError && x; });
    assert.match(w.lastError, /None of the selected elements/);
  });

  await step('xpath and regex filter', async () => {
    const res = await send({
      type: 'createWatch',
      watch: { url: `${base}/product`, selectors: [{ type: 'xpath', expr: '//p' }], regexFilter: '\\$(\\d+)' },
    });
    const h = await waitFor(async () => (await history(res.id))[0]);
    assert.equal(h.text, '8');
  });

  await step('JSON responses are pretty-printed', async () => {
    const res = await send({ type: 'createWatch', watch: { url: `${base}/data.json` } });
    const h = await waitFor(async () => (await history(res.id))[0]);
    assert.equal(h.text, JSON.stringify({ price, ok: true }, null, 2));
  });

  await step('fetched pages never load subresources', async () => {
    assert.equal(trackerHits, 0);
  });

  await step('render-in-tab mode runs page scripts', async () => {
    const res = await send({ type: 'createWatch', watch: { url: `${base}/dynamic`, mode: 'tab', renderDelaySeconds: 0, selectors: [{ type: 'css', expr: '#out' }] } });
    const h = await waitFor(async () => (await history(res.id))[0], 30000);
    assert.equal(h.text, 'rendered $8');
  });

  await step('rejects unsafe URLs and messages from web pages', async () => {
    const bad = await send({ type: 'createWatch', watch: { url: 'file:///etc/passwd' } });
    assert.equal(bad.ok, false);
    // A content script context can only use picker:save; UI handlers are refused.
    const tab = await context.newPage();
    await tab.goto(`${base}/product`);
    const result = await sw.evaluate(async (url) => {
      const [t] = await chrome.tabs.query({ url });
      const [r] = await chrome.scripting.executeScript({
        target: { tabId: t.id },
        func: () => chrome.runtime.sendMessage({ type: 'deleteWatch', id: 'x' }).then((v) => v ?? 'no response'),
      });
      return r.result;
    }, `${base}/product`);
    assert.equal(result, 'no response');
    await tab.close();
  });

  await step('picker saves a watch for the clicked element', async () => {
    const tab = await context.newPage();
    await tab.setViewportSize({ width: 1000, height: 700 });
    await tab.goto(`${base}/product`);
    await sw.evaluate(async (url) => {
      const [t] = await chrome.tabs.query({ url });
      await chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['src/picker.js'] });
    }, `${base}/product`);
    await tab.click('p.stock');
    await tab.screenshot({ path: process.env.SHOT || path.join(os.tmpdir(), 'opw-picker.png') });
    // The toolbar is in a closed shadow root; press its Save button by position.
    const before = Object.keys((await page.evaluate(() => chrome.storage.local.get('watches'))).watches).length;
    const box = await tab.evaluate(() => {
      return { w: innerWidth, h: innerHeight };
    });
    let saved = false;
    for (let x = box.w / 2 - 60; x <= box.w / 2 + 160 && !saved; x += 20) {
      await tab.mouse.click(x, box.h - 34);
      saved = await waitFor(async () => {
        const n = Object.keys((await page.evaluate(() => chrome.storage.local.get('watches'))).watches).length;
        return n > before;
      }, 600).catch(() => false);
    }
    assert.ok(saved, 'picker save not detected');
    const all = Object.values((await page.evaluate(() => chrome.storage.local.get('watches'))).watches);
    const w = all.find((x) => x.selectors[0]?.expr === 'p.stock' || x.selectors[0]?.expr.includes('nth-of-type(2)'));
    assert.ok(w, `unexpected selectors: ${JSON.stringify(all.map((x) => x.selectors))}`);
    assert.equal(w.name, 'scripts ran'); // the live tab's title, after its scripts ran
    await tab.close();
  });

  await step('export and import round-trip', async () => {
    const exp = await send({ type: 'exportAll' });
    assert.equal(exp.data.format, 'open-page-watcher');
    const n = exp.data.watches.length;
    const imp = await send({ type: 'importAll', data: exp.data });
    assert.equal(imp.imported, n);
    const total = Object.keys((await page.evaluate(() => chrome.storage.local.get('watches'))).watches).length;
    assert.equal(total, n * 2);
  });

  await step('delete removes the watch and its history', async () => {
    await send({ type: 'deleteWatch', id: priceId });
    assert.equal(await watchOf(priceId), undefined);
    assert.equal((await history(priceId)).length, 0);
  });

  await step('popup renders', async () => {
    const p = await context.newPage();
    await p.goto(`chrome-extension://${extId}/src/ui/popup.html`);
    await p.waitForSelector('#watch-page');
  });

  if (process.env.SHOT_DIR) {
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.evaluate((id) => { location.hash = `#/w/${id}`; }, wholeId);
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(process.env.SHOT_DIR, 'inbox.png') });
    await page.evaluate((id) => { location.hash = `#/w/${id}/edit`; }, wholeId);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(process.env.SHOT_DIR, 'edit.png'), fullPage: true });
  }
} finally {
  await context.close();
  server.close();
}
if (failed) process.exit(1);
