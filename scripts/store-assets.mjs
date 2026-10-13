// Generates Chrome Web Store screenshots (1280x800) into store/.
//
//   PLAYWRIGHT=/path/to/playwright node scripts/store-assets.mjs
//
// Uses a temporary copy of the extension that pre-grants the demo hostnames,
// which resolve to a local demo server, so no real site is contacted.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.join(root, 'store');
fs.mkdirSync(out, { recursive: true });
const extDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opw-ext-'));
for (const item of ['manifest.json', 'src', 'icons']) fs.cpSync(path.join(root, item), path.join(extDir, item), { recursive: true });
const manifest = JSON.parse(fs.readFileSync(path.join(extDir, 'manifest.json')));
manifest.host_permissions = ['http://*.example.com/*'];
fs.writeFileSync(path.join(extDir, 'manifest.json'), JSON.stringify(manifest));

let price = '$1,299.00';
let stock = 'Only 3 left in stock';
let jobs = ['Senior Backend Engineer, Remote', 'Product Designer, Austin'];
const page = (title, body) => `<!doctype html><html><head><title>${title}</title><style>
  body { font: 16px/1.5 system-ui, sans-serif; margin: 0; color: #1f2937; background: #f9fafb; }
  header { background: #111827; color: #fff; padding: 14px 32px; font-weight: 600; }
  main { max-width: 760px; margin: 32px auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 28px 32px; }
  .price { font-size: 32px; font-weight: 700; color: #047857; margin: 8px 0; }
  li { margin: 6px 0; }
</style></head><body>${body}</body></html>`;

const server = http.createServer((req, res) => {
  res.setHeader('content-type', 'text/html; charset=utf-8');
  if (req.url === '/laptop') {
    return res.end(page('UltraBook 14 Pro', `<header>Example Store</header><main>
      <h1>UltraBook 14 Pro</h1><p>14-inch, 32 GB RAM, 1 TB SSD</p>
      <div class="price" id="price">${price}</div><p id="stock">${stock}</p>
      <p>Free shipping. 30-day returns.</p></main>`));
  }
  if (req.url === '/careers') {
    return res.end(page('Careers', `<header>Example Co</header><main><h1>Open positions</h1>
      <ul id="jobs">${jobs.map((j) => `<li>${j}</li>`).join('')}</ul></main>`));
  }
  if (req.url === '/status') {
    return res.end(page('Service status', `<header>Status</header><main><h1>All systems operational</h1></main>`));
  }
  res.statusCode = 404;
  res.end();
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const shopBase = 'http://shop.example.com';
const coBase = 'http://www.example.com';

const context = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'opw-profile-')), {
  headless: true,
  channel: 'chromium',
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
  colorScheme: 'light',
  args: [
    `--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`,
    // Demo hostnames resolve to the local demo server.
    `--host-resolver-rules=MAP shop.example.com 127.0.0.1:${port}, MAP www.example.com 127.0.0.1:${port}`,
  ],
});
try {
  let [sw] = context.serviceWorkers();
  sw ||= await context.waitForEvent('serviceworker');
  const extId = new URL(sw.url()).host;
  const inbox = await context.newPage();
  inbox.on('pageerror', (e) => console.log('page error:', e.message));
  await inbox.goto(`chrome-extension://${extId}/src/ui/inbox.html`);
  const send = (m) => inbox.evaluate((msg) => chrome.runtime.sendMessage(msg), m);
  const check = (id) => send({ type: 'checkNow', id });

  const { id: laptop } = await send({ type: 'createWatch', watch: {
    url: `${shopBase}/laptop`, name: 'UltraBook 14 Pro price',
    selectors: [{ type: 'css', expr: '#price' }, { type: 'css', expr: '#stock' }],
    condition: { type: 'numberDecreased' }, intervalMinutes: 30, sound: true,
  } });
  const { id: careers } = await send({ type: 'createWatch', watch: {
    url: `${coBase}/careers`, name: 'Example Co careers', selectors: [{ type: 'css', expr: '#jobs' }],
    condition: { type: 'addedContains', value: 'engineer' }, intervalMinutes: 360,
  } });
  await send({ type: 'createWatch', watch: { url: `${coBase}/status`, name: 'Service status page', intervalMinutes: 5 } });
  const histories = () => inbox.evaluate(async () => {
    const all = await chrome.storage.local.get(null);
    return Object.keys(all).filter((k) => k.startsWith('history:') && all[k].length).length;
  });
  for (let i = 0; i < 100 && (await histories()) < 3; i++) await inbox.waitForTimeout(100);

  price = '$1,149.00';
  stock = 'In stock';
  jobs = [...jobs, 'Staff Platform Engineer, Remote'];
  await check(laptop);
  await check(careers);

  await inbox.evaluate((id) => { location.hash = `#/w/${id}`; }, careers);
  await inbox.waitForSelector('.diff .add, .diff ins');
  await inbox.evaluate((id) => chrome.runtime.sendMessage({ type: 'setRead', id, read: false }), laptop);
  await inbox.evaluate((id) => { location.hash = `#/w/${id}`; }, laptop);
  await inbox.waitForSelector('.diff ins');
  await inbox.waitForTimeout(400);
  await inbox.screenshot({ path: path.join(out, 'screenshot-1-inbox.png') });

  const shop = await context.newPage();
  await shop.goto(`${shopBase}/laptop`);
  await sw.evaluate(async (url) => {
    const [t] = await chrome.tabs.query({ url });
    await chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['src/picker.js'] });
  }, `${shopBase}/laptop`);
  await shop.click('#price');
  await shop.mouse.move(400, 260);
  await shop.waitForTimeout(300);
  await shop.screenshot({ path: path.join(out, 'screenshot-2-picker.png') });
  await shop.close();

  await inbox.bringToFront();
  await inbox.evaluate((id) => { location.hash = `#/w/${id}/edit`; }, laptop);
  await inbox.waitForSelector('form');
  await inbox.waitForTimeout(300);
  await inbox.screenshot({ path: path.join(out, 'screenshot-3-options.png') });
} finally {
  await context.close();
  server.close();
}
console.log(`Wrote screenshots to ${out}`);
