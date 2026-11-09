// Side effects (decoding images, canvas work, OCR, downloads) live in thunks; reducers stay pure.
// Page-level actions are addressed with forPage(id, ...) so background work never lands on the wrong page.
import { a4Pixels, detectCorners, enhanceCanvas, isLandscapeQuad, warpToCanvas } from '../lib/geometry.js';
import { dropImage, getImage, putImage } from '../lib/imageCache.js';
import {
  busyEnded, busyStarted, fileNameSet, ocrLinesReceived, ocrProgressSet, pageReady, quadSet, reorderEnded,
  statusSet, viewSet,
} from './slices.js';
import { forPage, pageMoved, pageOpened, pageRemoved, pagesAdded, selectPendingCount } from './pages.js';
import { redo, undo } from './history.js';
import glyphlessUrl from '../assets/glyphless.ttf?url'; // Tesseract's blank-glyph font (Apache-2.0)

const repaint = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const pageOf = (getState, id) => getState().pages.byId[id];

function withBusy(fn) {
  return async (dispatch, getState) => {
    if (getState().ui.busy) return undefined;
    dispatch(busyStarted());
    await repaint();
    try {
      return await fn(dispatch, getState);
    } catch (err) {
      console.error(err);
      dispatch(statusSet({ key: 'error', args: [String(err?.message || err)] }));
      return undefined;
    } finally {
      dispatch(busyEnded());
    }
  };
}

function fullQuad({ w, h }) {
  return [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
}
function insetQuad({ w, h }, m = 0.08) {
  return [{ x: w * m, y: h * m }, { x: w * (1 - m), y: h * m }, { x: w * (1 - m), y: h * (1 - m) }, { x: w * m, y: h * (1 - m) }];
}
function detect(photo) {
  const quad = detectCorners(getImage(photo.url));
  return quad ? { quad, detected: true } : { quad: insetQuad(photo), detected: false };
}

// ---------- pages ----------

/** Add photos as new pages (in the given order), detecting each page's corners. */
export const addPhotos = (files) => withBusy(async (dispatch, getState) => {
  const images = [...files].filter((f) => f.type.startsWith('image/'));
  const wasEmpty = getState().pages.order.length === 0;
  for (const file of images) {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const url = URL.createObjectURL(file);
    putImage(url, bitmap);
    const photo = { url, w: bitmap.width, h: bitmap.height, name: file.name.replace(/\.[^.]+$/, '') || 'scan' };
    dispatch(pagesAdded([{ photo, ...detect(photo) }]));
    await repaint();
  }
  if (wasEmpty && images.length) dispatch(fileNameSet(images[0].name.replace(/\.[^.]+$/, '') || 'scan'));
  dispatch(statusSet(null));
});

export const removePage = (id) => (dispatch, getState) => {
  const page = pageOf(getState, id);
  if (!page) return;
  dropImage(page.document.photo?.url);
  dropImage(page.document.page?.url);
  dispatch(pageRemoved(id));
};

/** Drop target for drag-and-drop reordering: move the dragged page to the target's position. */
export const finishReorder = () => (dispatch, getState) => {
  const { reorder } = getState().ui;
  dispatch(reorderEnded());
  if (!reorder || reorder.overId === null || reorder.overId === reorder.dragId) return;
  dispatch(pageMoved({ id: reorder.dragId, toIndex: getState().pages.order.indexOf(reorder.overId) }));
};

/** Open a page in the editor: its text if it is already straightened, else its corners. */
export const openPage = (id) => (dispatch, getState) => {
  dispatch(pageOpened(id));
  dispatch(viewSet(pageOf(getState, id)?.document.page ? 'text' : 'corners'));
};

// ---------- corners ----------

export const autoDetect = () => (dispatch, getState) => {
  const { activeId } = getState().pages;
  const photo = pageOf(getState, activeId)?.document.photo;
  if (photo) dispatch(forPage(activeId, quadSet(detect(photo))));
};

export const selectWholeImage = () => (dispatch, getState) => {
  const { activeId } = getState().pages;
  const photo = pageOf(getState, activeId)?.document.photo;
  if (photo) dispatch(forPage(activeId, quadSet({ quad: fullQuad(photo), detected: true })));
};

// ---------- straighten + OCR (internal steps, no busy handling) ----------

const sameSource = (a, b) => a && b && a.orientation === b.orientation && a.dpi === b.dpi && a.enhance === b.enhance
  && a.quad.every((p, i) => p.x === b.quad[i].x && p.y === b.quad[i].y);

/** Straighten one page unless its image was made from the same corners/settings. Returns true if new. */
async function straightenPage(dispatch, getState, id) {
  const doc = pageOf(getState, id).document;
  const { settings } = getState();
  const source = { quad: doc.quad, orientation: settings.orientation, dpi: settings.dpi, enhance: settings.enhance };
  if (sameSource(doc.page?.source, source)) return false; // keep OCR and edits
  const landscape = settings.orientation === 'auto' ? isLandscapeQuad(doc.quad) : settings.orientation === 'landscape';
  const { w, h } = a4Pixels(settings.dpi, landscape);
  const canvas = warpToCanvas(getImage(doc.photo.url), doc.quad, w, h);
  if (settings.enhance) enhanceCanvas(canvas);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
  const url = URL.createObjectURL(blob);
  putImage(url, canvas);
  dropImage(doc.page?.url);
  dispatch(forPage(id, pageReady({ url, w, h, source })));
  return true;
}

async function ocrPage(dispatch, getState, id) {
  const { settings } = getState();
  if (!settings.ocrLangs.length) return;
  dispatch(statusSet({ key: 'ocrLoading' }));
  dispatch(ocrProgressSet(0));
  let lastPct = -1;
  const { recognizeLines } = await import('../lib/ocr.js'); // loaded on first use
  const lines = await recognizeLines(getImage(pageOf(getState, id).document.page.url), settings.ocrLangs, (m) => {
    if (m.status !== 'recognizing text') return;
    const pct = Math.round(m.progress * 100);
    if (pct === lastPct) return;
    if (lastPct < 0) dispatch(statusSet({ key: 'ocrRunning' }));
    lastPct = pct;
    dispatch(ocrProgressSet(m.progress));
  });
  if (!pageOf(getState, id)) return; // page deleted meanwhile
  dispatch(forPage(id, ocrLinesReceived(lines)));
  dispatch(ocrProgressSet(null));
  dispatch(statusSet({ key: 'ocrDone', args: [lines.length] }));
}

/** Next from the corners: straighten, then run OCR automatically the first time a page image is shown. */
export const nextFromCorners = () => withBusy(async (dispatch, getState) => {
  const id = getState().pages.activeId;
  const created = await straightenPage(dispatch, getState, id);
  dispatch(viewSet('text'));
  if (created) { await repaint(); await ocrPage(dispatch, getState, id); }
});

export const runOcr = () => withBusy(async (dispatch, getState) => {
  await ocrPage(dispatch, getState, getState().pages.activeId);
});

// ---------- export ----------

let glyphless = null;

/** Multi-page PDF in page order. Every page must have been processed (opened and straightened) first. */
export const exportPdf = () => withBusy(async (dispatch, getState) => {
  const pending = selectPendingCount(getState());
  if (pending) { dispatch(statusSet({ key: 'pendingPages', args: [pending] })); return; }
  const ids = [...getState().pages.order];
  dispatch(statusSet({ key: 'buildingPdf' }));
  glyphless ??= new Uint8Array(await (await fetch(glyphlessUrl)).arrayBuffer());
  const pages = [];
  for (const id of ids) {
    const { document: doc, textLayer } = pageOf(getState, id);
    const jpeg = await new Promise((r) => getImage(doc.page.url).toBlob(r, 'image/jpeg', 0.85));
    pages.push({ jpeg, size: { w: doc.page.w, h: doc.page.h }, items: textLayer.items });
  }
  const name = (getState().ui.fileName.trim() || 'scan').replace(/[\\/:*?"<>|]/g, '_');
  const { buildPdf } = await import('../lib/pdf.js'); // loaded on first use
  const bytes = await buildPdf(pages, glyphless, { title: name });
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}.pdf`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  dispatch(statusSet({ key: 'pdfDone', args: [ids.length] }));
});

// ---------- undo / redo ----------

const UNDO_SCOPE = { corners: 'corners', text: 'text' };
/** Keyboard shortcuts: undo/redo in the editor's current context (corners or text) of the open page. */
export const undoInView = (isRedo) => (dispatch, getState) => {
  const scope = UNDO_SCOPE[getState().ui.view];
  if (scope) dispatch(isRedo ? redo(scope) : undo(scope));
};
