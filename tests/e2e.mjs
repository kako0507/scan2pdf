// End-to-end test in a real browser (system Edge or Chrome via puppeteer-core):
// open photo -> detect corners -> straighten -> OCR -> add a manual box -> download PDF.
// Usage: node tests/e2e.mjs [photo] [manualText]
// Writes screenshots and the PDF to tests/out/.
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { extname, join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const site = join(root, 'dist'); // run `npm run build` first
const photo = resolve(process.argv[2] || join(root, 'tests/fixtures/sample.jpg'));
const manualText = process.argv[3] || 'Manual 手動補字';
const outDir = join(root, 'tests/out');
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json', '.gz': 'application/gzip', '.ttf': 'font/ttf' };
const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = join(site, p);
  if (!f.startsWith(site) || !existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
}).listen(0);
const appUrl = process.env.APP_URL || `http://localhost:${server.address().port}/`; // APP_URL: test a dev server

const candidates = [
  process.env.BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const executablePath = candidates.find((c) => existsSync(c));
if (!executablePath) throw new Error('No Chrome/Edge found; set BROWSER=/path/to/browser');

const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--lang=zh-TW'] });
const fail = (msg) => { console.error('FAIL', msg); process.exitCode = 1; };
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 1000 });
  page.on('console', (m) => { if (m.type() === 'error' || /serializ|mutat|immutab/i.test(m.text())) console.log('console:', m.type(), m.text()); });
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  const cdp = await page.createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: outDir });

  await page.goto(appUrl, { waitUntil: 'load' });
  await page.waitForSelector('#langBtn');
  const lang = await page.evaluate(() => document.documentElement.lang);
  console.log('default UI language:', lang);

  await (await page.$('#file')).uploadFile(photo);
  await page.waitForFunction(() => window.__scan2pdfStore.getState().document.quad, { timeout: 30000 });
  const corners = await page.evaluate(() => ({
    quad: window.__scan2pdfStore.getState().document.quad.map((p) => [Math.round(p.x), Math.round(p.y)]),
    size: [window.__scan2pdfStore.getState().document.photo.w, window.__scan2pdfStore.getState().document.photo.h],
    status: document.getElementById('status').textContent,
  }));
  console.log('corners:', JSON.stringify(corners));
  const visible = () => page.evaluate(() => ['#s2', '#s3', '#s4'].filter((id) => document.querySelector(id)));
  console.log('step 2 visible sections:', await visible());
  await (await page.$('#s2')).screenshot({ path: join(outDir, '1-corners.png') });

  // Corner context: drag the top-left handle, undo restores it, redo re-applies it.
  const getQuad = () => page.evaluate(() => window.__scan2pdfStore.getState().document.quad);
  const q0 = await getQuad();
  const h0 = await (await page.$('#s2 circle.handle[data-i="0"]')).boundingBox();
  await page.mouse.move(h0.x + h0.width / 2, h0.y + h0.height / 2);
  await page.mouse.down();
  await page.mouse.move(h0.x + 40, h0.y + 30, { steps: 6 });
  await page.mouse.up();
  const q1 = await getQuad();
  await page.click('#s2 .undo');
  const q2 = await getQuad();
  await page.keyboard.down('Control'); await page.keyboard.press('y'); await page.keyboard.up('Control');
  const q3 = await getQuad();
  await page.click('#s2 .undo');
  console.log('corner undo/redo tl.x:', [q0, q1, q2, q3].map((q) => Math.round(q[0].x)));
  if (q1[0].x === q0[0].x || q2[0].x !== q0[0].x || q3[0].x !== q1[0].x) fail('corner undo/redo mismatch');

  // Next: straighten, then OCR runs automatically for the new page.
  const t0 = Date.now();
  await page.click('#warpBtn');
  await page.waitForFunction(() => {
    const st = window.__scan2pdfStore.getState();
    return st.ui.step === 'text' && st.textLayer.ocrDone && !st.ui.busy;
  }, { timeout: 300000 });
  console.log('step 3 visible sections:', await visible());
  console.log('page size:', await page.evaluate(() => [window.__scan2pdfStore.getState().document.page.w, window.__scan2pdfStore.getState().document.page.h]));
  console.log('OCR button label:', await page.$eval('#ocrBtn', (b) => b.textContent));
  const ocr = await page.evaluate(() => ({
    status: document.getElementById('status').textContent,
    lines: window.__scan2pdfStore.getState().textLayer.items.map((i) => `${i.conf}% ${i.text}`),
  }));
  console.log(`auto OCR (${((Date.now() - t0) / 1000).toFixed(1)}s incl. straighten):`, ocr.status);
  ocr.lines.forEach((l) => console.log('  ', l));
  if (!ocr.lines.length) fail('OCR returned no lines');

  // Draw a manual box near the bottom-left of the page and type into it.
  await page.evaluate(() => {
    const r = document.getElementById('pageSvg').getBoundingClientRect();
    window.scrollBy(0, r.top + r.height * 0.915 - window.innerHeight / 2); // bring the target area on screen
  });
  const box = await (await page.$('#pageSvg')).boundingBox();
  await page.mouse.move(box.x + box.width * 0.10, box.y + box.height * 0.90);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.30, box.y + box.height * 0.93, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.type(manualText);
  const added = await page.evaluate(() => window.__scan2pdfStore.getState().textLayer.items.filter((i) => i.added).map((i) => i.text));
  console.log('manual items:', JSON.stringify(added));
  if (!added.includes(manualText)) fail('manual box not added');

  // Resize the first OCR box with its south-east handle, then time-travel with undo/redo.
  const state = () => page.evaluate(() => window.__scan2pdfStore.getState());
  const first = (await state()).textLayer.items.find((i) => !i.added);
  const boxEl = await page.$(`#pageSvg rect.box[data-id="${first.id}"]`);
  await boxEl.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await boxEl.click();
  const se = await (await page.$('#pageSvg rect.rh-se')).boundingBox();
  await page.mouse.move(se.x + se.width / 2, se.y + se.height / 2);
  await page.mouse.down();
  await page.mouse.move(se.x + 60, se.y + 25, { steps: 8 });
  await page.mouse.up();
  const box1 = async () => (await state()).textLayer.items.find((i) => i.id === first.id);
  const resized = await box1();
  console.log('resize:', [first.x1, first.y1].map(Math.round), '->', [resized.x1, resized.y1].map(Math.round));
  if (!(resized.x1 > first.x1 + 50 && resized.y1 > first.y1 + 20)) fail('resize did not change the box');
  await (await page.$('#s3')).screenshot({ path: join(outDir, '2-editor.png') });

  if (await page.$('#s3 .undo') === null) fail('text undo button missing');
  await page.keyboard.down('Control'); await page.keyboard.press('z'); await page.keyboard.up('Control');
  const undone = await box1();
  await page.keyboard.down('Control'); await page.keyboard.down('Shift'); await page.keyboard.press('z');
  await page.keyboard.up('Shift'); await page.keyboard.up('Control');
  const redone = await box1();
  await page.click('#s3 .undo');
  const undone2 = await box1();
  console.log('undo/redo x1:', [undone.x1, redone.x1, undone2.x1].map(Math.round));
  if (undone.x1 !== first.x1 || redone.x1 !== resized.x1 || undone2.x1 !== first.x1) fail('undo/redo mismatch');
  await page.click('#s3 .redo');

  // Back to the corners step and forward again without changes: OCR and edits are kept.
  const itemsBefore = JSON.stringify((await state()).textLayer.items);
  await page.click('#s3 .nav button.ghost');
  await page.waitForSelector('#s2');
  await page.click('#warpBtn');
  await page.waitForSelector('#s3');
  await new Promise((r) => setTimeout(r, 1500)); // an unwanted OCR run would start within this time
  const after = await state();
  const kept = JSON.stringify(after.textLayer.items) === itemsBefore && !after.ui.busy;
  console.log('back/next keeps edits without re-running OCR:', kept);
  if (!kept) fail('going back and forward changed the text layer');

  await page.click('#nextBtn');
  await page.waitForSelector('#s4');
  console.log('step 4 visible sections:', await visible());
  await (await page.$('#s4')).screenshot({ path: join(outDir, '3-save.png') });

  await page.click('#pdfBtn');
  const deadline = Date.now() + 30000;
  let pdf;
  while (Date.now() < deadline && !(pdf = readdirSync(outDir).find((f) => f.endsWith('.pdf')))) await new Promise((r) => setTimeout(r, 300));
  if (!pdf) fail('no PDF downloaded'); else console.log('PDF:', join(outDir, pdf), statSync(join(outDir, pdf)).size, 'bytes');
} finally {
  await browser.close();
  server.close();
}
