import { describe, expect, it } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { appReducer, rootReducer } from './index.js';
import {
  cornerDragEnded, cornerDragStarted, cornerMoved, draftCommitted, draftMoved, draftStarted, itemRemoved,
  itemTextChanged, langSet, ocrLangToggled, ocrLinesReceived, pageReady, photoLoaded, quadSet, stepSet,
} from './slices.js';

const deepFreeze = (o) => { Object.values(o).forEach((v) => v && typeof v === 'object' && deepFreeze(v)); return Object.freeze(o); };
const root = (state, action) => appReducer(state, action);

/** Apply actions to deep-frozen states: any mutation of the input throws, and equal inputs must give equal outputs. */
function run(actions) {
  let s = root(undefined, { type: '@@init' });
  for (const a of actions) {
    deepFreeze(s);
    const next = root(s, a);
    expect(root(s, a)).toEqual(next); // deterministic
    s = next;
  }
  return s;
}

const photo = photoLoaded({ url: 'blob:p', w: 1000, h: 800, name: 'doc' });
const quad = [{ x: 10, y: 10 }, { x: 990, y: 20 }, { x: 980, y: 790 }, { x: 5, y: 780 }];
const page = pageReady({ url: 'blob:page', w: 2480, h: 3508 });

describe('reducers', () => {
  it('loads a photo and names the output after it', () => {
    const s = run([photo]);
    expect(s.document.photo.w).toBe(1000);
    expect(s.ui.fileName).toBe('doc');
  });

  it('drags a corner, clamps it to the photo and re-orders swapped corners', () => {
    const s = run([photo, quadSet({ quad, detected: true }), cornerDragStarted(0), cornerMoved({ x: 2000, y: 900 }), cornerDragEnded()]);
    expect(s.document.draggingCorner).toBe(null);
    expect(s.document.quad).toContainEqual({ x: 1000, y: 800 });
    expect(s.document.quad[0]).toEqual({ x: 5, y: 780 }); // smallest x+y is the new top-left
  });

  it('ignores corner moves when no drag is active', () => {
    const s = run([photo, quadSet({ quad, detected: true }), cornerMoved({ x: 1, y: 1 })]);
    expect(s.document.quad).toEqual(quad);
  });

  it('flags failed detection in the status line', () => {
    expect(run([photo, quadSet({ quad, detected: false })]).ui.status.key).toBe('detectFailed');
  });

  it('keeps manual boxes when OCR runs again and replaces OCR lines', () => {
    const s = run([
      photo, page,
      draftStarted({ x: 100, y: 3000 }), draftMoved({ x: 600, y: 3100 }), draftCommitted({ minSide: 16, w: 2480, h: 3508 }),
      ocrLinesReceived([{ text: 'A', x0: 0, y0: 0, x1: 10, y1: 10, conf: 90 }]),
      ocrLinesReceived([{ text: 'B', x0: 0, y0: 0, x1: 10, y1: 10, conf: 90 }]),
    ]);
    expect(s.textLayer.items.map((i) => i.text)).toEqual(['B', '']);
    expect(new Set(s.textLayer.items.map((i) => i.id)).size).toBe(2);
  });

  it('discards tiny drafts and clamps boxes to the page', () => {
    const tiny = run([photo, page, draftStarted({ x: 5, y: 5 }), draftMoved({ x: 8, y: 8 }), draftCommitted({ minSide: 16, w: 2480, h: 3508 })]);
    expect(tiny.textLayer.items).toHaveLength(0);
    const s = run([photo, page, draftStarted({ x: 2400, y: 3400 }), draftMoved({ x: 2600, y: 3600 }), draftCommitted({ minSide: 16, w: 2480, h: 3508 })]);
    expect(s.textLayer.items[0]).toMatchObject({ x1: 2480, y1: 3508, added: true });
    expect(s.textLayer.selectedId).toBe(s.textLayer.items[0].id);
  });

  it('edits and removes items', () => {
    let s = run([photo, page, ocrLinesReceived([{ text: 'x', x0: 0, y0: 0, x1: 10, y1: 10, conf: 90 }])]);
    const id = s.textLayer.items[0].id;
    s = run([photo, page, ocrLinesReceived([{ text: 'x', x0: 0, y0: 0, x1: 10, y1: 10, conf: 90 }]), itemTextChanged({ id, text: '劉添華' })]);
    expect(s.textLayer.items[0].text).toBe('劉添華');
    expect(root(deepFreeze(s), itemRemoved(id)).textLayer.items).toHaveLength(0);
  });

  it('remembers that OCR ran on the current page until a new page arrives', () => {
    const ocr = ocrLinesReceived([{ text: 'x', x0: 0, y0: 0, x1: 10, y1: 10, conf: 90 }]);
    expect(run([photo, page]).textLayer.ocrDone).toBe(false);
    expect(run([photo, page, ocr]).textLayer.ocrDone).toBe(true);
    expect(run([photo, page, ocr, stepSet('corners'), stepSet('text')]).textLayer.ocrDone).toBe(true);
    expect(run([photo, page, ocr, page]).textLayer.ocrDone).toBe(false);
  });

  it('a new page clears the text layer', () => {
    const s = run([photo, page, ocrLinesReceived([{ text: 'x', x0: 0, y0: 0, x1: 10, y1: 10, conf: 90 }]), page]);
    expect(s.textLayer.items).toHaveLength(0);
  });

  it('moves through the steps', () => {
    expect(run([]).ui.step).toBe('photo');
    expect(run([photo]).ui.step).toBe('corners');
    expect(run([photo, page]).ui.step).toBe('text');
    expect(run([photo, page, stepSet('save')]).ui.step).toBe('save');
    expect(run([photo, page, stepSet('corners')]).document.page.url).toBe('blob:page'); // going back keeps the page
  });

  it('settings', () => {
    const s = run([langSet('zh-Hant'), ocrLangToggled('eng')]);
    expect(s.settings.lang).toBe('zh-Hant');
    expect(s.settings.ocrLangs).toEqual(['chi_tra']);
  });

  it('works in a real store with RTK immutability and serialisability checks', () => {
    const store = configureStore({ reducer: rootReducer });
    [photo, quadSet({ quad, detected: true }), page, draftStarted({ x: 1, y: 1 }), draftMoved({ x: 99, y: 99 }),
      draftCommitted({ minSide: 16, w: 2480, h: 3508 })].forEach((a) => store.dispatch(a));
    expect(store.getState().textLayer.items).toHaveLength(1);
  });
});
