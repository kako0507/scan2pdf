import { describe, expect, it } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { rootReducer } from './index.js';
import {
  cornerDragEnded, cornerDragStarted, cornerMoved, draftCommitted, draftMoved, draftStarted, itemRemoved,
  itemTextChanged, langSet, ocrLangToggled, ocrLinesReceived, pageReady, quadSet, viewSet,
} from './slices.js';
import { P, QUAD, onePage, run } from './testUtils.js';

const page = pageReady({ url: 'blob:page', w: 2480, h: 3508, source: null });
const line = (text) => ({ text, x0: 0, y0: 0, x1: 10, y1: 10, conf: 90 });
const draw = (x0, y0, x1, y1) => [draftStarted({ x: x0, y: y0 }), draftMoved({ x: x1, y: y1 }), draftCommitted({ minSide: 16, w: 2480, h: 3508 })];

describe('single-page reducers (routed to the open page)', () => {
  it('drags a corner, clamps it to the photo and re-orders swapped corners', () => {
    const s = run([...onePage(), cornerDragStarted(0), cornerMoved({ x: 2000, y: 900 }), cornerDragEnded()]);
    expect(P(s).document.draggingCorner).toBe(null);
    expect(P(s).document.quad).toContainEqual({ x: 1000, y: 800 });
    expect(P(s).document.quad[0]).toEqual({ x: 5, y: 780 }); // smallest x+y is the new top-left
  });

  it('ignores corner moves when no drag is active', () => {
    expect(P(run([...onePage(), cornerMoved({ x: 1, y: 1 })])).document.quad).toEqual(QUAD);
  });

  it('remembers failed detection on the page', () => {
    expect(P(run([...onePage(), quadSet({ quad: QUAD, detected: false })])).document.detectFailed).toBe(true);
  });

  it('keeps manual boxes when OCR runs again and replaces OCR lines', () => {
    const s = run([...onePage(), page, ...draw(100, 3000, 600, 3100), ocrLinesReceived([line('A')]), ocrLinesReceived([line('B')])]);
    expect(P(s).textLayer.items.map((i) => i.text)).toEqual(['B', '']);
    expect(new Set(P(s).textLayer.items.map((i) => i.id)).size).toBe(2);
  });

  it('discards tiny drafts and clamps boxes to the page', () => {
    expect(P(run([...onePage(), page, ...draw(5, 5, 8, 8)])).textLayer.items).toHaveLength(0);
    const s = run([...onePage(), page, ...draw(2400, 3400, 2600, 3600)]);
    expect(P(s).textLayer.items[0]).toMatchObject({ x1: 2480, y1: 3508, added: true });
    expect(P(s).textLayer.selectedId).toBe(P(s).textLayer.items[0].id);
  });

  it('edits and removes items', () => {
    const base = run([...onePage(), page, ocrLinesReceived([line('x')])]);
    const id = P(base).textLayer.items[0].id;
    const s = run([itemTextChanged({ id, text: '劉添華' })], base);
    expect(P(s).textLayer.items[0].text).toBe('劉添華');
    expect(P(run([itemRemoved(id)], s)).textLayer.items).toHaveLength(0);
  });

  it('a new page image clears the text layer and the OCR flag', () => {
    const s = run([...onePage(), page, ocrLinesReceived([line('x')])]);
    expect(P(s).textLayer.ocrDone).toBe(true);
    expect(P(run([viewSet('pages'), viewSet('text')], s)).textLayer.ocrDone).toBe(true);
    const next = run([page], s);
    expect(P(next).textLayer.items).toHaveLength(0);
    expect(P(next).textLayer.ocrDone).toBe(false);
  });

  it('page-level actions do nothing when no page is open', () => {
    const s = run([cornerMoved({ x: 1, y: 1 }), ocrLinesReceived([line('x')])]);
    expect(s.pages.order).toEqual([]);
  });
});

describe('settings and ui', () => {
  it('settings', () => {
    const s = run([langSet('zh-Hant'), ocrLangToggled('eng')]);
    expect(s.settings.lang).toBe('zh-Hant');
    expect(s.settings.ocrLangs).toEqual(['chi_tra']);
  });

  it('starts on the page list', () => {
    expect(run([]).ui.view).toBe('pages');
    expect(run([viewSet('corners')]).ui.view).toBe('corners');
  });

  it('works in a real store with RTK immutability and serialisability checks', () => {
    const store = configureStore({ reducer: rootReducer });
    [...onePage(), page, ...draw(1, 1, 99, 99)].forEach((a) => store.dispatch(a));
    expect(P(store.getState()).textLayer.items).toHaveLength(1);
  });
});
