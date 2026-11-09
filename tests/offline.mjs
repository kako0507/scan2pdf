// Checks: default language for an English browser, and that the app (incl. OCR) works offline after one visit.
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const site = join(root, 'dist'); // run `npm run build` first
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const f = join(site, p);
  if (!existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(f)] || 'application/octet-stream' }); res.end(readFileSync(f));
}).listen(0);
const url = `http://localhost:${server.address().port}/`;
const executablePath = process.env.BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--lang=en-US'] });
let ok = true;
try {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] }));
  await page.goto(url);
  await page.waitForSelector('#langBtn');
  const lang = await page.evaluate(() => [document.documentElement.lang, document.querySelector('main section h2').textContent]);
  console.log('English browser ->', lang); ok &&= lang[0] === 'en';
  await page.click('#langBtn');
  const toggled = await page.evaluate(() => [document.documentElement.lang, document.querySelector('main section h2').textContent]);
  console.log('after toggle   ->', toggled); ok &&= toggled[0] === 'zh-Hant';
  await page.evaluate(() => navigator.serviceWorker.ready);
  const expected = (readFileSync(join(site, 'sw.js'), 'utf8').match(/^  "/gm) || []).length;
  const cached = () => page.evaluate(async () => {
    const name = (await caches.keys()).find((k) => k.startsWith('scan2pdf-'));
    return name ? (await (await caches.open(name)).keys()).length : 0;
  });
  for (let i = 0; i < 120 && (await cached()) < expected; i++) await new Promise((r) => setTimeout(r, 500));
  const n0 = await cached();
  console.log(`precached files: ${n0}/${expected}`); ok &&= n0 === expected && expected > 0;

  await page.setOfflineMode(true);
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#langBtn');
  console.log('offline reload, remembered language:', await page.evaluate(() => document.documentElement.lang));
  await (await page.$('#file')).uploadFile(join(root, 'tests/fixtures/sample.jpg'));
  await page.waitForSelector('.page-card .thumb');
  await page.waitForFunction(() => !window.__scan2pdfStore.getState().ui.busy);
  await page.click('.page-card .thumb');
  await page.waitForSelector('#warpBtn');
  await page.click('#warpBtn');
  await page.waitForFunction(() => {
    const s = window.__scan2pdfStore.getState();
    return s.ui.view === 'text' && s.pages.byId[s.pages.activeId].textLayer.ocrDone && !s.ui.busy; // OCR runs automatically
  }, { timeout: 120000 });
  const n = await page.evaluate(() => { const s = window.__scan2pdfStore.getState(); return s.pages.byId[s.pages.activeId].textLayer.items.length; });
  console.log('offline OCR lines:', n, '|', await page.evaluate(() => document.getElementById('status').textContent)); ok &&= n > 0;
} finally { await browser.close(); server.close(); }
console.log(ok ? 'PASS' : 'FAIL'); process.exitCode = ok ? 0 : 1;
