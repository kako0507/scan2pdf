// End-to-end test in a real browser (system Edge or Chrome via puppeteer-core):
// add two photos -> reorder -> open a page -> corners (undo/redo) -> straighten + auto OCR -> add/resize boxes
// (undo/redo) -> back to the page list -> export blocked until page 1 is processed too -> save a 2-page PDF.
// Usage: node tests/e2e.mjs [photo1] [photo2]
// Writes screenshots and the PDF to tests/out/.
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { extname, join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { PDFDocument } from 'pdf-lib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const site = join(root, 'dist'); // run `npm run build` first
const photos = [
  resolve(process.argv[2] || join(root, 'tests/fixtures/sample.jpg')),
  resolve(process.argv[3] || join(root, 'tests/fixtures/sample2.jpg')),
];
const manualText = 'Manual 手動補字';
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 1000 });
  page.on('console', (m) => { if (m.type() === 'error' || /serializ|mutat|immutab/i.test(m.text())) console.log('console:', m.type(), m.text()); });
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  const cdp = await page.createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: outDir });

  const state = () => page.evaluate(() => window.__scan2pdfStore.getState());
  const active = async () => { const s = await state(); return s.pages.byId[s.pages.activeId]; };
  const names = async () => { const s = await state(); return s.pages.order.map((id) => s.pages.byId[id].document.photo.name); };
  const visible = () => page.evaluate(() => ['#s1', '#s2', '#s3', '#s4'].filter((id) => document.querySelector(id)));
  const idle = () => page.waitForFunction(() => !window.__scan2pdfStore.getState().ui.busy, { timeout: 300000 });

  await page.goto(appUrl, { waitUntil: 'load' });
  await page.waitForSelector('#langBtn');
  console.log('default UI language:', await page.evaluate(() => document.documentElement.lang));

  // 1. Pages: add both photos at once, then move the second one first.
  await (await page.$('#file')).uploadFile(...photos);
  await page.waitForFunction(() => window.__scan2pdfStore.getState().pages.order.length === 2, { timeout: 30000 });
  await idle();
  console.log('pages added:', await names());
  await (await page.$('#s1')).screenshot({ path: join(outDir, '0-pages.png') });
  await page.click('.page-card:nth-child(2) .page-actions button:nth-child(1)'); // ◀ on the second card
  const order = await names();
  console.log('after ◀ on page 2:', order);
  if (order[0] !== 'sample2') fail('reorder with ◀ did not move the page');
  // Drag-and-drop reordering (synthetic HTML5 drag events): drag card 1 onto card 2, twice.
  const dragCard = (from, to) => page.evaluate(async (i, j) => {
    const cards = document.querySelectorAll('.page-card');
    const dt = new DataTransfer();
    const fire = (el, type) => el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
    const tick = () => new Promise((r) => setTimeout(r, 50));
    fire(cards[i], 'dragstart'); await tick();
    fire(cards[j], 'dragenter'); fire(cards[j], 'dragover'); await tick();
    fire(cards[j], 'drop'); await tick();
    fire(cards[i], 'dragend'); await tick();
  }, from, to);
  await dragCard(0, 1);
  const dragged = await names();
  await dragCard(0, 1);
  console.log('drag-and-drop:', dragged, '->', await names());
  if (dragged[0] !== 'sample' || (await names())[0] !== 'sample2') fail('drag-and-drop reorder failed');

  // 2. Open "sample" (now page 2): corners step.
  await page.click('.page-card:nth-child(2) .thumb');
  await page.waitForSelector('#s2');
  console.log('editing:', await page.$eval('.page-heading', (e) => e.textContent), '| visible:', await visible());
  const getQuad = async () => (await active()).document.quad;
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

  // 3. Next: straighten, then OCR runs automatically for the new page image.
  const t0 = Date.now();
  await page.click('#warpBtn');
  await page.waitForFunction(() => {
    const s = window.__scan2pdfStore.getState();
    return s.ui.view === 'text' && s.pages.byId[s.pages.activeId].textLayer.ocrDone && !s.ui.busy;
  }, { timeout: 300000 });
  const lines = (await active()).textLayer.items.map((i) => `${i.conf}% ${i.text}`);
  console.log(`auto OCR (${((Date.now() - t0) / 1000).toFixed(1)}s incl. straighten): ${lines.length} lines; visible:`, await visible());
  lines.forEach((l) => console.log('  ', l));
  if (!lines.length) fail('OCR returned no lines');

  // Add a manual box near the bottom-left and type into it.
  await page.evaluate(() => {
    const r = document.getElementById('pageSvg').getBoundingClientRect();
    window.scrollBy(0, r.top + r.height * 0.915 - window.innerHeight / 2);
  });
  const box = await (await page.$('#pageSvg')).boundingBox();
  await page.mouse.move(box.x + box.width * 0.10, box.y + box.height * 0.90);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.30, box.y + box.height * 0.93, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.type(manualText);
  const added = (await active()).textLayer.items.filter((i) => i.added).map((i) => i.text);
  console.log('manual items:', JSON.stringify(added));
  if (!added.includes(manualText)) fail('manual box not added');

  // Resize the first OCR box, then undo/redo it.
  const first = (await active()).textLayer.items.find((i) => !i.added);
  const boxEl = await page.$(`#pageSvg rect.box[data-id="${first.id}"]`);
  await boxEl.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await boxEl.click();
  const se = await (await page.$('#pageSvg rect.rh-se')).boundingBox();
  await page.mouse.move(se.x + se.width / 2, se.y + se.height / 2);
  await page.mouse.down();
  await page.mouse.move(se.x + 60, se.y + 25, { steps: 8 });
  await page.mouse.up();
  const box1 = async () => (await active()).textLayer.items.find((i) => i.id === first.id);
  const resized = await box1();
  console.log('resize:', [first.x1, first.y1].map(Math.round), '->', [resized.x1, resized.y1].map(Math.round));
  if (!(resized.x1 > first.x1 + 50 && resized.y1 > first.y1 + 20)) fail('resize did not change the box');
  await (await page.$('#s3')).screenshot({ path: join(outDir, '2-editor.png') });
  await page.keyboard.down('Control'); await page.keyboard.press('z'); await page.keyboard.up('Control');
  const undone = await box1();
  await page.keyboard.down('Control'); await page.keyboard.down('Shift'); await page.keyboard.press('z');
  await page.keyboard.up('Shift'); await page.keyboard.up('Control');
  const redone = await box1();
  console.log('undo/redo x1:', [undone.x1, redone.x1].map(Math.round));
  if (undone.x1 !== first.x1 || redone.x1 !== resized.x1) fail('undo/redo mismatch');

  // Back to corners and forward without changes: OCR is not re-run, edits are kept.
  const before = JSON.stringify((await active()).textLayer.items);
  await page.click('#s3 .nav button.ghost');
  await page.waitForSelector('#s2');
  await page.click('#warpBtn');
  await page.waitForSelector('#s3');
  await sleep(1500);
  const kept = JSON.stringify((await active()).textLayer.items) === before && !(await state()).ui.busy;
  console.log('back/next keeps edits without re-running OCR:', kept);
  if (!kept) fail('going back and forward changed the text layer');

  // Done -> page list; reopening the page goes straight to the text step.
  await page.click('#doneBtn');
  await page.waitForSelector('#s1');
  const badges = await page.$$eval('.page-card .badge', (b) => b.map((x) => x.textContent));
  console.log('badges:', badges);
  await page.click('.page-card:nth-child(2) .thumb');
  await page.waitForSelector('#s3');
  await page.click('#doneBtn');
  await page.waitForSelector('#s1');

  // 4. Export is blocked until every page has been processed.
  const pdfDisabled = () => page.$eval('#pdfBtn', (b) => b.disabled);
  console.log('with page 1 unprocessed -> download disabled:', await pdfDisabled(), '|', await page.$eval('#save .hint', (e) => e.textContent));
  if (!(await pdfDisabled())) fail('download should be disabled while a page is unprocessed');
  await (await page.$('#s1')).screenshot({ path: join(outDir, '3-list-pending.png') });

  // Process page 1: open, next (straighten + auto OCR), done.
  await page.click('.page-card:nth-child(1) .thumb');
  await page.waitForSelector('#warpBtn');
  await page.click('#warpBtn');
  await page.waitForFunction(() => {
    const s = window.__scan2pdfStore.getState();
    return s.ui.view === 'text' && s.pages.byId[s.pages.activeId].textLayer.ocrDone && !s.ui.busy;
  }, { timeout: 300000 });
  await page.click('#doneBtn');
  await page.waitForSelector('#s1');
  console.log('all processed -> download disabled:', await pdfDisabled(), '|', await page.$eval('#save .hint', (e) => e.textContent));
  if (await pdfDisabled()) fail('download should be enabled once every page is processed');

  // Save: 2-page PDF in the list order.
  await page.click('#pdfBtn');
  await idle();
  console.log('status:', await page.$eval('#status', (e) => e.textContent));
  const deadline = Date.now() + 30000;
  let pdf;
  while (Date.now() < deadline && !(pdf = readdirSync(outDir).find((f) => f.endsWith('.pdf')))) await sleep(300);
  if (!pdf) { fail('no PDF downloaded'); } else {
    await sleep(500);
    const doc = await PDFDocument.load(readFileSync(join(outDir, pdf)));
    console.log('PDF:', join(outDir, pdf), statSync(join(outDir, pdf)).size, 'bytes,', doc.getPageCount(), 'pages');
    if (doc.getPageCount() !== 2) fail('expected 2 pages');
  }
} finally {
  await browser.close();
  server.close();
}
