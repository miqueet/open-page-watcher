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
for (const item of ['manifest.json', 'managed_schema.json', 'src', 'icons']) fs.cpSync(path.join(root, item), path.join(extDir, item), { recursive: true });
const manifest = JSON.parse(fs.readFileSync(path.join(extDir, 'manifest.json')));
manifest.host_permissions = ['http://127.0.0.1/*'];
fs.writeFileSync(path.join(extDir, 'manifest.json'), JSON.stringify(manifest));

let price = '$10';
let stock = 'In stock';
let cookieSeen = null;
let trackerHits = 0;
let feedItems = ['Hello world', 'Second post'];
const server = http.createServer((req, res) => {
  if (req.url === '/product') {
    cookieSeen = req.headers.cookie || '';
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.setHeader('set-cookie', 'session=secret; Path=/');
    return res.end(`<!doctype html><title>Product</title>
      <script>window.ran = true; document.title = 'scripts ran';</script>
      <style>.x{}</style>
      <h1>Widget</h1><p id="price">${price}</p><p class="stock">${stock}</p>
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
  if (req.url === '/feed.xml') {
    res.setHeader('content-type', 'application/rss+xml');
    return res.end(`<?xml version="1.0"?><rss version="2.0"><channel><title>News</title>
      ${feedItems.map((t, i) => `<item><title>${t}</title><link>${base}/post/${i}</link><pubDate>${new Date().toUTCString()}</pubDate></item>`).join('')}
      </channel></rss>`);
  }
  if (req.url === '/atom.xml') {
    res.setHeader('content-type', 'application/atom+xml');
    return res.end(`<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>A</title>
      <entry><title>First</title><link rel="alternate" href="${base}/a/1"/><updated>2026-01-01T00:00:00Z</updated></entry></feed>`);
  }
  if (req.url === '/sitemap.xml') {
    res.setHeader('content-type', 'application/xml');
    return res.end(`<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>${base}/one</loc><lastmod>2026-01-01</lastmod></url><url><loc>${base}/two</loc></url></urlset>`);
  }
  if (req.url === '/links') {
    res.setHeader('content-type', 'text/html');
    return res.end(`<!doctype html><title>Links</title><div id="box"><p class="keep">Keep ${price}</p>
      <p class="ad">Ad ${Date.now()}</p><a id="dl" href="/files/v${price.replace(/\D/g, '')}.zip" onclick="steal()">Download</a>
      <img src="/tracker.png" onerror="steal()"><form action="https://evil.example/"><input name="q"></form>
      <script>steal()</script></div>`);
  }
  if (req.url === '/broken') {
    res.statusCode = 500;
    return res.end('down');
  }
  if (req.url === '/live') {
    res.setHeader('content-type', 'text/html');
    return res.end(`<!doctype html><title>Live</title><p id="n">0</p>
      <input id="q" value="default"><input id="pw" type="password" value="server-secret">`);
  }
  if (req.url === '/doc.pdf' || req.url === '/download?id=7') {
    // The second address serves the PDF with a generic type, like many download links.
    res.setHeader('content-type', req.url === '/doc.pdf' ? 'application/pdf' : 'application/octet-stream');
    return res.end(fs.readFileSync(path.join(root, 'test/fixtures/standard.pdf')));
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

  await step('checks started together all succeed while the page reader starts', async () => {
    const results = await page.evaluate((b) => Promise.all([1, 2, 3, 4, 5].map(() => chrome.runtime.sendMessage(
      { type: 'createWatch', watch: { url: `${b}/product`, selectors: [{ type: 'css', expr: 'h1' }] } }))), base);
    const ids = results.map((r) => r.id);
    const errors = async () => (await Promise.all(ids.map(watchOf))).map((w) => w.lastError);
    await waitFor(async () => (await Promise.all(ids.map(watchOf))).every((w) => w.lastCheckedAt));
    assert.deepEqual(await errors(), ['', '', '', '', '']);
    // Close the offscreen document and race several checks against its restart.
    for (let round = 0; round < 5; round++) {
      await sw.evaluate(() => chrome.offscreen.closeDocument().catch(() => {}));
      await Promise.all(ids.map((id) => send({ type: 'checkNow', id })));
      assert.deepEqual(await errors(), ['', '', '', '', ''], `round ${round}`);
    }
    for (const id of ids) await send({ type: 'deleteWatch', id });
  });

  let wholeId;
  let linksId;
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
    // The toolbar is in a closed shadow root, so save with the keyboard.
    const before = Object.keys((await page.evaluate(() => chrome.storage.local.get('watches'))).watches).length;
    await tab.keyboard.press('Enter');
    const saved = await waitFor(async () => {
      const n = Object.keys((await page.evaluate(() => chrome.storage.local.get('watches'))).watches).length;
      return n > before;
    }, 5000).catch(() => false);
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

  await step('password-protected export and import', async () => {
    const before = Object.keys((await page.evaluate(() => chrome.storage.local.get('watches'))).watches);
    await page.evaluate(() => { location.hash = '#/'; });
    await page.click('#export');
    await page.check('#backup-protect');
    await page.fill('#backup-password', 'correct horse');
    await page.fill('#backup-password2', 'correct horse');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('dialog button:text("Export")')]);
    const file = path.join(userData, 'backup.json');
    await download.saveAs(file);
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(saved.format, 'open-page-watcher-encrypted');
    assert.ok(!fs.readFileSync(file, 'utf8').includes('127.0.0.1'), 'addresses are not readable');

    await page.setInputFiles('#import-file', file);
    await page.fill('#import-password', 'wrong password');
    await page.click('dialog button:text("Unlock")');
    await page.waitForSelector('#toast:text("Wrong password")');
    await page.setInputFiles('#import-file', file);
    await page.fill('#import-password', 'correct horse');
    await page.click('dialog button:text("Unlock")');
    await page.click('dialog button:text("Cancel")'); // keep current settings
    await page.waitForSelector(`#toast:text("Imported ${before.length} watches")`);
    const after = Object.keys((await page.evaluate(() => chrome.storage.local.get('watches'))).watches);
    await send({ type: 'bulk', ids: after.filter((id) => !before.includes(id)), action: 'delete' });
  });

  await step('keyboard shortcut is registered', async () => {
    const commands = await sw.evaluate(() => chrome.commands.getAll());
    assert.ok(commands.some((c) => c.name === 'watch-part'));
  });

  await step('delete removes the watch and its history', async () => {
    await send({ type: 'deleteWatch', id: priceId });
    assert.equal(await watchOf(priceId), undefined);
    assert.equal((await history(priceId)).length, 0);
  });

  await step('excludes leave out parts; attributes resolve to absolute URLs', async () => {
    const res = await send({
      type: 'createWatch',
      watch: {
        url: `${base}/links`,
        selectors: [{ type: 'css', expr: '#box' }, { type: 'css', expr: '#dl', attr: 'href' }],
        excludes: [{ type: 'css', expr: '.ad' }],
      },
    });
    const h = await waitFor(async () => (await history(res.id))[0]);
    assert.doesNotMatch(h.text, /Ad \d/);
    assert.match(h.text, /Keep \$8/);
    assert.match(h.text, new RegExp(`${base}/files/v8\\.zip$`));
    assert.ok(h.html.includes('class="keep"'));
    assert.ok(!h.html.includes('class="ad"'));
    assert.ok(!/onclick|onerror|<script/i.test(h.html), 'event handlers and scripts are not captured');
    linksId = res.id;
  });

  await step('visual view renders captured HTML inertly with highlights', async () => {
    price = '$7';
    await send({ type: 'checkNow', id: linksId });
    await page.evaluate(() => localStorage.setItem('opw:view', 'visual'));
    await page.evaluate((id) => { location.hash = '#/'; location.hash = `#/w/${id}`; }, linksId);
    await page.reload();
    const frame = await page.waitForSelector('iframe.visual-frame');
    assert.equal(await frame.getAttribute('sandbox'), '');
    const srcdoc = await frame.getAttribute('srcdoc');
    assert.match(srcdoc, /Content-Security-Policy/);
    assert.match(srcdoc, /<mark class="opw-add">\$7<\/mark>/);
    assert.ok(!/<script|onclick|onerror|href=|src=|<form|<input/i.test(srcdoc.split('</style>')[1]), 'active content stripped');
    const hitsBefore = trackerHits;
    await page.waitForTimeout(500);
    assert.equal(trackerHits, hitsBefore, 'visual view loads nothing from the network');
    for (const view of ['Side by side', 'Source', 'Text']) {
      await page.click(`.tabs button:text("${view}")`);
      await page.waitForSelector('.diff');
    }
    assert.ok(await page.$('.diff ins'));
    await page.click('summary:text-matches("Check log")');
    assert.ok((await page.textContent('table.log')).includes('Changed'));
  });

  await step('PDF files are read as text', async () => {
    for (const url of [`${base}/doc.pdf`, `${base}/download?id=7`]) {
      const res = await send({ type: 'createWatch', watch: { url } });
      const h = await waitFor(async () => (await history(res.id))[0]);
      assert.match(h.text, /^Quarterly Report\nThe quick brown fox jumps over the lazy dog\./);
      assert.match(h.text, /Café, naïve façade/);
      await send({ type: 'deleteWatch', id: res.id });
    }
  });

  await step('RSS, Atom and sitemaps become one line per entry', async () => {
    const rss = await send({ type: 'createWatch', watch: { url: `${base}/feed.xml`, condition: { rules: [{ type: 'contains', on: 'added', value: 'third' }] } } });
    const atom = await send({ type: 'createWatch', watch: { url: `${base}/atom.xml` } });
    const map = await send({ type: 'createWatch', watch: { url: `${base}/sitemap.xml` } });
    const h = await waitFor(async () => (await history(rss.id))[0]);
    assert.equal(h.text, `Hello world — ${base}/post/0\nSecond post — ${base}/post/1`);
    assert.equal((await waitFor(async () => (await history(atom.id))[0])).text, `First — ${base}/a/1`);
    assert.equal((await waitFor(async () => (await history(map.id))[0])).text, `${base}/one\n${base}/two`);
    feedItems = [...feedItems, 'Third post'];
    await send({ type: 'checkNow', id: rss.id });
    assert.equal((await watchOf(rss.id)).unread, true);
  });

  await step('labels and bulk actions', async () => {
    const all = Object.keys((await page.evaluate(() => chrome.storage.local.get('watches'))).watches).slice(0, 3);
    assert.equal((await send({ type: 'bulk', ids: all, action: 'addLabel', label: ' Work ' })).ok, true);
    assert.deepEqual((await watchOf(all[0])).labels, ['Work']);
    await send({ type: 'bulk', ids: all, action: 'pause' });
    assert.equal((await watchOf(all[1])).paused, true);
    await send({ type: 'bulk', ids: all, action: 'resume' });
    await send({ type: 'bulk', ids: all, action: 'removeLabel', label: 'work' });
    assert.deepEqual((await watchOf(all[0])).labels, []);
    assert.equal((await send({ type: 'bulk', ids: all, action: 'bogus' })).ok, false);
  });

  await step('repeated failures raise an error alert and are logged', async () => {
    await send({ type: 'saveSettings', settings: { errorAlerts: { enabled: true, after: 2, minIntervalMinutes: 15 } } });
    const res = await send({ type: 'createWatch', watch: { url: `${base}/broken` } });
    await waitFor(async () => (await watchOf(res.id)).errorCount === 1);
    await send({ type: 'checkNow', id: res.id });
    const w = await watchOf(res.id);
    assert.equal(w.errorCount, 2);
    assert.match(w.lastError, /HTTP 500/);
    const times = await sw.evaluate(() => chrome.storage.session.get('errorAlertTimes'));
    assert.ok(times.errorAlertTimes[res.id] > 0, 'error alert was sent');
    const log = await page.evaluate(async (k) => (await chrome.storage.local.get(k))[k], `log:${res.id}`);
    assert.equal(log.length, 2);
    assert.equal(log[1].ok, false);
  });

  await step('time windows skip checks outside the allowed hours', async () => {
    const now = new Date();
    const otherDay = (now.getDay() + 3) % 7;
    const res = await send({
      type: 'createWatch',
      watch: { url: `${base}/product`, schedule: { window: { enabled: true, days: [otherDay], start: '00:00', end: '23:59' } } },
    });
    const due = await page.evaluate(async (id) => {
      const { isDue } = await import('/src/lib/watch.js');
      const { watches } = await chrome.storage.local.get('watches');
      return isDue({ ...watches[id], lastCheckedAt: 0, nextCheckAt: 0 }, Date.now());
    }, res.id);
    assert.equal(due, false);
  });

  await step('ignoring numbers stops false alerts from counters', async () => {
    const watch = (ignore) => ({ url: `${base}/links`, selectors: [{ type: 'css', expr: '.ad' }], ignore });
    const noisy = (await send({ type: 'createWatch', watch: watch({}) })).id;
    const quiet = (await send({ type: 'createWatch', watch: watch({ numbers: true }) })).id;
    await waitFor(async () => (await history(noisy)).length === 1 && (await history(quiet)).length === 1);
    await new Promise((r) => setTimeout(r, 5));
    await send({ type: 'checkNow', id: noisy });
    await send({ type: 'checkNow', id: quiet });
    assert.equal((await history(noisy)).length, 2);
    assert.equal((await history(quiet)).length, 1);
    await send({ type: 'bulk', ids: [noisy, quiet], action: 'delete' });
  });

  await step('changes get a plain summary and number history chart', async () => {
    price = '$10';
    const id = (await send({ type: 'createWatch', watch: { url: `${base}/product`, selectors: [{ type: 'css', expr: '#price' }] } })).id;
    await waitFor(async () => (await history(id)).length === 1);
    for (const p of ['$12', '$8']) {
      price = p;
      await send({ type: 'checkNow', id });
    }
    assert.equal((await watchOf(id)).lastSummary, 'Went down from $12 to $8 (−33.3%)');
    await page.evaluate(() => { location.hash = '#/'; });
    await page.evaluate((i) => { location.hash = `#/w/${i}`; }, id);
    await waitFor(async () => (await watchOf(id)).unread === false);
    await page.waitForTimeout(300); // let the re-render after marking it read settle
    await waitFor(async () => (await page.locator('.num-chart .dot').count()) === 3);
    assert.match(await page.textContent('.summary'), /Went down from \$12 to \$8/);
    assert.equal(await page.locator('.num-table tbody tr').count(), 3);
    await page.focus('.num-chart');
    await page.keyboard.press('ArrowLeft'); // starts at the latest version
    await page.keyboard.press('ArrowLeft');
    assert.match(await page.textContent('.num-tip'), /^12 \(\+2\)/);
    await page.evaluate(() => { location.hash = '#/'; });
    await send({ type: 'deleteWatch', id });
  });

  await step('opening the page highlights what changed', async () => {
    const id = (await send({ type: 'createWatch', watch: { url: `${base}/product`, selectors: [{ type: 'css', expr: '.stock' }] } })).id;
    await waitFor(async () => (await history(id)).length === 1);
    stock = 'Only 3 left';
    await send({ type: 'checkNow', id });
    const opened = context.waitForEvent('page');
    const res = await send({ type: 'openPage', id });
    assert.equal(res.highlighted, 1);
    const tab = await opened;
    const highlighted = await tab.evaluate(() => {
      const h = CSS.highlights.get('open-page-watcher-change');
      return h ? [...h].map((r) => r.toString()) : null;
    }).catch(() => 'isolated');
    // The highlight lives in the extension's isolated world; the page sees the
    // same registry because highlights belong to the document.
    assert.deepEqual(highlighted, ['Only 3 left']);
    await tab.close();
    stock = 'In stock';
    await send({ type: 'deleteWatch', id });
  });

  const notificationIds = async () => Object.keys(await sw.evaluate(() => new Promise((r) => chrome.notifications.getAll(r))));
  const clearNotifications = () => sw.evaluate(async () => {
    const all = await new Promise((r) => chrome.notifications.getAll(r));
    await Promise.all(Object.keys(all).map((id) => chrome.notifications.clear(id)));
  });
  const pending = () => page.evaluate(async () => (await chrome.storage.local.get('pendingAlerts')).pendingAlerts || []);

  await step('quiet hours hold alerts and send them when they end', async () => {
    await page.evaluate(() => { location.hash = '#/'; });
    const allDays = [0, 1, 2, 3, 4, 5, 6];
    await send({ type: 'saveSettings', settings: { quietHours: { enabled: true, days: allDays, start: '00:00', end: '00:00' } } });
    price = '$20';
    const id = (await send({ type: 'createWatch', watch: { url: `${base}/product`, name: 'Quiet', selectors: [{ type: 'css', expr: '#price' }] } })).id;
    await waitFor(async () => (await history(id)).length === 1);
    await clearNotifications();
    price = '$15';
    await send({ type: 'checkNow', id });
    assert.equal((await watchOf(id)).unread, true, 'change is still recorded');
    const held = await pending();
    assert.equal(held.length, 1);
    assert.equal(held[0].summary, 'Went down from $20 to $15 (−25.0%)');
    assert.equal((await notificationIds()).some((n) => n.includes(id)), false, 'no notification during quiet hours');

    await send({ type: 'saveSettings', settings: {} }); // quiet hours off
    assert.equal((await pending()).length, 0);
    assert.ok((await notificationIds()).some((n) => n.startsWith(`watch:${id}:`)), 'held alert sent afterwards');
    await send({ type: 'deleteWatch', id });
  });

  await step('combined alerts bundle several changes into one notification', async () => {
    await send({ type: 'saveSettings', settings: { delivery: { mode: 'digest', digestEveryMinutes: 30 } } });
    await page.evaluate(() => chrome.storage.local.set({ lastDigestAt: Date.now() }));
    price = '$30';
    const ids = [];
    for (const name of ['One', 'Two']) {
      ids.push((await send({ type: 'createWatch', watch: { url: `${base}/product`, name, selectors: [{ type: 'css', expr: '#price' }] } })).id);
    }
    await waitFor(async () => (await history(ids[0])).length === 1 && (await history(ids[1])).length === 1);
    await clearNotifications();
    price = '$25';
    for (const id of ids) await send({ type: 'checkNow', id });
    assert.deepEqual((await pending()).map((p) => p.name).sort(), ['One', 'Two']);
    assert.equal((await notificationIds()).length, 0, 'nothing sent before the summary is due');

    await page.evaluate(() => chrome.storage.local.set({ lastDigestAt: 0 }));
    await send({ type: 'saveSettings', settings: { delivery: { mode: 'digest', digestEveryMinutes: 30 } } });
    const sent = await notificationIds();
    assert.equal(sent.length, 1);
    assert.match(sent[0], /^digest:/);
    await send({ type: 'saveSettings', settings: {} });
    await send({ type: 'bulk', ids, action: 'delete' });
  });

  await step('spoken alerts read the change aloud', async () => {
    await sw.evaluate(() => {
      self.spoken = [];
      chrome.tts.getVoices = async () => [
        { voiceName: 'Online voice', lang: 'en-US', remote: true },
        { voiceName: 'Local voice', lang: 'en-US', remote: false },
      ];
      chrome.tts.speak = (text, options) => self.spoken.push(`${options.voiceName}: ${text}`);
    });
    price = '$40';
    const id = (await send({ type: 'createWatch', watch: { url: `${base}/product`, name: 'Spoken', notify: false, speak: true, selectors: [{ type: 'css', expr: '#price' }] } })).id;
    await waitFor(async () => (await history(id)).length === 1);
    price = '$45';
    await send({ type: 'checkNow', id });
    assert.deepEqual(await sw.evaluate(() => self.spoken), ['Local voice: Spoken changed. Went up from $40 to $45 (+12.5%)']);
    await send({ type: 'deleteWatch', id });
  });

  await step('quick-fill presets, duplicate and keyboard navigation', async () => {
    await page.evaluate(() => { location.hash = '#/new'; });
    await page.click('.presets button:text("All links")');
    assert.equal(await page.inputValue('textarea'), 'a[href] @href');

    const id = (await send({ type: 'createWatch', watch: { url: `${base}/links`, name: 'Links', selectors: [{ type: 'css', expr: 'a[href]', attr: 'href' }] } })).id;
    const h = await waitFor(async () => (await history(id))[0]);
    assert.match(h.text, new RegExp(`^${base}/files/v\\d+\\.zip$`));
    const copy = await send({ type: 'duplicateWatch', id });
    const dup = await watchOf(copy.id);
    assert.equal(dup.name, 'Links (copy)');
    assert.deepEqual(dup.selectors, [{ type: 'css', expr: 'a[href]', attr: 'href' }]);

    await page.evaluate(() => { location.hash = '#/'; });
    await page.waitForTimeout(200);
    await page.locator('body').click({ position: { x: 600, y: 400 } });
    await page.keyboard.press('j');
    await waitFor(() => page.evaluate(() => location.hash.startsWith('#/w/')));
    await page.keyboard.press('e');
    await waitFor(() => page.evaluate(() => location.hash.endsWith('/edit')));
    await page.evaluate(() => { location.hash = '#/'; });
    await send({ type: 'bulk', ids: [id, copy.id], action: 'delete' });
  });

  await step('live mode re-reads an open tab when it changes', async () => {
    const res = await send({ type: 'createWatch', watch: { url: `${base}/live`, live: true, selectors: [{ type: 'css', expr: '#n' }] } });
    await waitFor(async () => (await history(res.id))[0]);
    const tab = await context.newPage();
    await tab.goto(`${base}/live`);
    await tab.waitForTimeout(500);
    await tab.evaluate(() => { document.getElementById('n').textContent = '42'; });
    const h = await waitFor(async () => { const x = await history(res.id); return x.length >= 2 && x; }, 20000);
    assert.equal(h[h.length - 1].text, '42');

    // A whole-page live watch never records what the user types, or passwords.
    const whole = await send({ type: 'createWatch', watch: { url: `${base}/live`, live: true } });
    await waitFor(async () => (await history(whole.id))[0]);
    await tab.fill('#q', 'typed by me');
    await tab.fill('#pw', 'hunter2');
    await tab.evaluate(() => { document.getElementById('n').textContent = '43'; });
    const w = await waitFor(async () => { const x = await history(whole.id); return x.length >= 2 && x; }, 20000);
    const last = w[w.length - 1];
    assert.match(last.text, /43/);
    assert.match(last.text, /default/);
    assert.ok(!/typed by me|hunter2|server-secret/.test(last.text + (last.html || '')), 'typed values and passwords are not recorded');
    const log = await page.evaluate(async (k) => (await chrome.storage.local.get(k))[k], `log:${res.id}`);
    assert.ok(log.some((e) => e.via === 'live'));
    await tab.close();
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
