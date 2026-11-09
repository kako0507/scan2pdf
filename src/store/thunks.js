// Side effects (decoding images, canvas work, OCR, downloads) live in thunks; reducers stay pure.
import { a4Pixels, detectCorners, enhanceCanvas, isLandscapeQuad, warpToCanvas } from '../lib/geometry.js';
import { dropImage, getImage, putImage } from '../lib/imageCache.js';
import {
  busyEnded, busyStarted, ocrLinesReceived, ocrProgressSet, pageReady, photoLoaded, quadSet, statusSet, stepSet,
} from './slices.js';
import { redo, undo } from './history.js';
import glyphlessUrl from '../assets/glyphless.ttf?url'; // Tesseract's blank-glyph font (Apache-2.0)

const repaint = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

function withBusy(fn) {
  return async (dispatch, getState) => {
    if (getState().ui.busy) return;
    dispatch(busyStarted());
    await repaint();
    try {
      return await fn(dispatch, getState);
    } catch (err) {
      console.error(err);
      dispatch(statusSet({ key: 'error', args: [String(err?.message || err)] }));
    } finally {
      dispatch(busyEnded());
    }
  };
}

export const openPhoto = (file) => async (dispatch, getState) => {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const url = URL.createObjectURL(file);
  putImage(url, bitmap);
  const old = getState().document;
  dropImage(old.photo?.url);
  dropImage(old.page?.url);
  dispatch(photoLoaded({ url, w: bitmap.width, h: bitmap.height, name: file.name.replace(/\.[^.]+$/, '') || 'scan' }));
  dispatch(autoDetect());
};

function fullQuad({ w, h }) {
  return [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
}
function insetQuad({ w, h }, m = 0.08) {
  return [{ x: w * m, y: h * m }, { x: w * (1 - m), y: h * m }, { x: w * (1 - m), y: h * (1 - m) }, { x: w * m, y: h * (1 - m) }];
}

export const autoDetect = () => (dispatch, getState) => {
  const { photo } = getState().document;
  if (!photo) return;
  const quad = detectCorners(getImage(photo.url));
  dispatch(quadSet(quad ? { quad, detected: true } : { quad: insetQuad(photo), detected: false }));
};

export const selectWholeImage = () => (dispatch, getState) => {
  const { photo } = getState().document;
  if (photo) dispatch(quadSet({ quad: fullQuad(photo), detected: true }));
};

const sameSource = (a, b) => a && b && a.orientation === b.orientation && a.dpi === b.dpi && a.enhance === b.enhance
  && a.quad.every((p, i) => p.x === b.quad[i].x && p.y === b.quad[i].y);

/**
 * Straighten to A4, unless the current page was made from the same corners/settings.
 * Resolves true when a new page was created.
 */
export const straighten = () => withBusy(async (dispatch, getState) => {
  const { document: doc, settings } = getState();
  const source = { quad: doc.quad, orientation: settings.orientation, dpi: settings.dpi, enhance: settings.enhance };
  if (sameSource(doc.page?.source, source)) { dispatch(stepSet('text')); return false; } // keep OCR and edits
  const landscape = settings.orientation === 'auto' ? isLandscapeQuad(doc.quad) : settings.orientation === 'landscape';
  const { w, h } = a4Pixels(settings.dpi, landscape);
  const canvas = warpToCanvas(getImage(doc.photo.url), doc.quad, w, h);
  if (settings.enhance) enhanceCanvas(canvas);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
  const url = URL.createObjectURL(blob);
  putImage(url, canvas);
  dropImage(doc.page?.url);
  dispatch(pageReady({ url, w, h, source }));
  dispatch(statusSet(null));
  return true;
});

/** Next from the corners step: straighten, then run OCR automatically the first time a page is shown. */
export const nextFromCorners = () => async (dispatch) => {
  if (await dispatch(straighten())) await dispatch(runOcr());
};

export const runOcr = () => withBusy(async (dispatch, getState) => {
  const { document: doc, settings } = getState();
  if (!settings.ocrLangs.length) return;
  dispatch(statusSet({ key: 'ocrLoading' }));
  dispatch(ocrProgressSet(0));
  let lastPct = -1;
  const { recognizeLines } = await import('../lib/ocr.js'); // loaded on first use
  const lines = await recognizeLines(getImage(doc.page.url), settings.ocrLangs, (m) => {
    if (m.status !== 'recognizing text') return;
    const pct = Math.round(m.progress * 100);
    if (pct === lastPct) return;
    if (lastPct < 0) dispatch(statusSet({ key: 'ocrRunning' }));
    lastPct = pct;
    dispatch(ocrProgressSet(m.progress));
  });
  dispatch(ocrLinesReceived(lines));
  dispatch(statusSet({ key: 'ocrDone', args: [lines.length] }));
});

let glyphless = null;
export const exportPdf = () => withBusy(async (dispatch, getState) => {
  const { document: doc, textLayer, ui } = getState();
  glyphless ??= new Uint8Array(await (await fetch(glyphlessUrl)).arrayBuffer());
  const canvas = getImage(doc.page.url);
  const jpeg = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
  const name = (ui.fileName.trim() || 'scan').replace(/[\\/:*?"<>|]/g, '_');
  const { buildPdf } = await import('../lib/pdf.js'); // loaded on first use
  const bytes = await buildPdf(jpeg, { w: doc.page.w, h: doc.page.h }, textLayer.items, glyphless, { title: name });
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}.pdf`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  dispatch(statusSet({ key: 'pdfDone' }));
});

const UNDO_SCOPE = { corners: 'corners', text: 'text' };
/** Keyboard shortcuts: undo/redo in the current step's context, if it has one. */
export const undoInStep = (isRedo) => (dispatch, getState) => {
  const scope = UNDO_SCOPE[getState().ui.step];
  if (scope) dispatch(isRedo ? redo(scope) : undo(scope));
};
