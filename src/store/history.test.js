import { describe, expect, it } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { rootReducer } from './index.js';
import { redo, selectCanRedo, selectCanUndo, undo } from './history.js';
import {
  boxDragEnded, boxDragMoved, boxDragStarted, busyStarted, cornerDragEnded, cornerDragStarted, cornerMoved,
  dragBox, draftCommitted, draftMoved, draftStarted, itemRemoved, itemSelected, itemTextChanged, ocrLinesReceived,
  pageReady, photoLoaded, quadSet,
} from './slices.js';

const PAGE = { w: 2480, h: 3508, minSide: 16 };
const line = (text, y) => ({ text, x0: 100, y0: y, x1: 900, y1: y + 50, conf: 90 });

function setup() {
  const store = configureStore({ reducer: rootReducer }); // includes RTK immutability/serialisability checks
  store.dispatch(photoLoaded({ url: 'blob:p', w: 1000, h: 800, name: 'doc' }));
  store.dispatch(pageReady({ url: 'blob:page', w: PAGE.w, h: PAGE.h }));
  store.dispatch(ocrLinesReceived([line('A', 100), line('B', 300)]));
  return store;
}
const texts = (s) => s.textLayer.items.map((i) => i.text);

describe('dragBox', () => {
  const d = (mode) => ({ mode, startX: 0, startY: 0, orig: { x0: 100, y0: 100, x1: 300, y1: 200 } });
  it('moves and keeps the box on the page', () => {
    expect(dragBox(d('move'), { x: 50, y: 20, ...PAGE })).toEqual({ x0: 150, y0: 120, x1: 350, y1: 220 });
    expect(dragBox(d('move'), { x: -500, y: 99999, ...PAGE })).toEqual({ x0: 0, y0: PAGE.h - 100, x1: 200, y1: PAGE.h });
  });
  it('resizes from each handle and enforces a minimum size', () => {
    expect(dragBox(d('se'), { x: 40, y: 10, ...PAGE })).toEqual({ x0: 100, y0: 100, x1: 340, y1: 210 });
    expect(dragBox(d('nw'), { x: -40, y: -10, ...PAGE })).toEqual({ x0: 60, y0: 90, x1: 300, y1: 200 });
    expect(dragBox(d('e'), { x: -1000, y: 0, ...PAGE })).toMatchObject({ x0: 100, x1: 116 });
    expect(dragBox(d('n'), { x: 0, y: 5000, ...PAGE })).toMatchObject({ y0: 184, y1: 200 });
  });
});

describe('undo / redo', () => {
  it('the OCR result is undoable; a fresh store has nothing to undo', () => {
    const s = setup().getState();
    expect(selectCanUndo('text')(s)).toBe(true); // the OCR result itself is undoable
    const fresh = configureStore({ reducer: rootReducer }).getState();
    expect(selectCanUndo('text')(fresh)).toBe(false);
  });

  it('undoes and redoes a resize as one step, however many moves it had', () => {
    const store = setup();
    const id = store.getState().textLayer.items[0].id;
    store.dispatch(boxDragStarted({ id, mode: 'se', x: 900, y: 150 }));
    for (let i = 1; i <= 20; i++) store.dispatch(boxDragMoved({ x: 900 + i * 10, y: 150 + i, ...PAGE }));
    store.dispatch(boxDragEnded());
    expect(store.getState().textLayer.items[0]).toMatchObject({ x1: 1100, y1: 170 });
    const pastLen = store.getState().history.text.past.length;
    store.dispatch(undo('text'));
    expect(store.getState().history.text.past.length).toBe(pastLen - 1);
    expect(store.getState().textLayer.items[0]).toMatchObject({ x1: 900, y1: 150 });
    store.dispatch(redo('text'));
    expect(store.getState().textLayer.items[0]).toMatchObject({ x1: 1100, y1: 170 });
  });

  it('a click without movement adds no history entry', () => {
    const store = setup();
    const before = store.getState().history.text.past.length;
    const id = store.getState().textLayer.items[0].id;
    store.dispatch(boxDragStarted({ id, mode: 'move', x: 1, y: 1 }));
    store.dispatch(boxDragEnded());
    store.dispatch(itemSelected(null));
    expect(store.getState().history.text.past.length).toBe(before);
  });

  it('groups typing in one box, but not across boxes', () => {
    const store = setup();
    const [a, b] = store.getState().textLayer.items.map((i) => i.id);
    ['A1', 'A12', 'A123'].forEach((text) => store.dispatch(itemTextChanged({ id: a, text })));
    store.dispatch(itemTextChanged({ id: b, text: 'B!' }));
    store.dispatch(undo('text'));
    expect(texts(store.getState())).toEqual(['A123', 'B']);
    store.dispatch(undo('text'));
    expect(texts(store.getState())).toEqual(['A', 'B']);
  });

  it('undoes adding and deleting boxes; a new action clears redo', () => {
    const store = setup();
    store.dispatch(draftStarted({ x: 100, y: 3000 }));
    store.dispatch(draftMoved({ x: 600, y: 3100 }));
    store.dispatch(draftCommitted(PAGE));
    expect(store.getState().textLayer.items).toHaveLength(3);
    store.dispatch(undo('text'));
    expect(store.getState().textLayer.items).toHaveLength(2);
    expect(store.getState().textLayer.selectedId).toBe(null); // the selected box no longer exists
    expect(selectCanRedo('text')(store.getState())).toBe(true);
    store.dispatch(itemRemoved(store.getState().textLayer.items[0].id));
    expect(selectCanRedo('text')(store.getState())).toBe(false);
    store.dispatch(undo('text'));
    expect(texts(store.getState())).toEqual(['A', 'B']);
  });

  it('undoes a corner drag as one step', () => {
    const store = configureStore({ reducer: rootReducer });
    store.dispatch(photoLoaded({ url: 'blob:p', w: 1000, h: 800, name: 'doc' }));
    const quad = [{ x: 10, y: 10 }, { x: 990, y: 10 }, { x: 990, y: 790 }, { x: 10, y: 790 }];
    store.dispatch(quadSet({ quad, detected: true }));
    store.dispatch(cornerDragStarted(0));
    store.dispatch(cornerMoved({ x: 50, y: 60 }));
    store.dispatch(cornerMoved({ x: 80, y: 90 }));
    store.dispatch(cornerDragEnded());
    expect(selectCanUndo('corners')(store.getState())).toBe(true);
    store.dispatch(undo('text')); // other context: no effect
    expect(store.getState().document.quad[0]).toEqual({ x: 80, y: 90 });
    store.dispatch(undo('corners'));
    expect(store.getState().document.quad).toEqual(quad);
    expect(selectCanUndo('corners')(store.getState())).toBe(false); // auto-detected corners are the start
    store.dispatch(redo('corners'));
    expect(store.getState().document.quad[0]).toEqual({ x: 80, y: 90 });
  });

  it('keeps the two contexts separate; a new page clears only the text history', () => {
    const store = configureStore({ reducer: rootReducer });
    store.dispatch(photoLoaded({ url: 'blob:p', w: 1000, h: 800, name: 'doc' }));
    store.dispatch(quadSet({ quad: [{ x: 0, y: 0 }, { x: 9, y: 0 }, { x: 9, y: 9 }, { x: 0, y: 9 }], detected: true }));
    store.dispatch(quadSet({ quad: [{ x: 1, y: 1 }, { x: 9, y: 0 }, { x: 9, y: 9 }, { x: 0, y: 9 }], detected: true }));
    store.dispatch(pageReady({ url: 'blob:page', w: PAGE.w, h: PAGE.h }));
    store.dispatch(ocrLinesReceived([line('A', 100)]));
    expect(selectCanUndo('corners')(store.getState())).toBe(true);
    expect(selectCanUndo('text')(store.getState())).toBe(true);
    store.dispatch(undo('text'));
    expect(store.getState().textLayer.items).toHaveLength(0);
    expect(store.getState().document.quad[0]).toEqual({ x: 1, y: 1 });
    store.dispatch(pageReady({ url: 'blob:page2', w: PAGE.w, h: PAGE.h }));
    expect(selectCanUndo('text')(store.getState())).toBe(false);
    expect(selectCanUndo('corners')(store.getState())).toBe(true);
  });

  it('does nothing while busy or when there is nothing to undo', () => {
    const store = setup();
    store.dispatch(busyStarted());
    const s = store.getState();
    store.dispatch(undo('text'));
    expect(store.getState()).toBe(s);
    const empty = configureStore({ reducer: rootReducer });
    const e = empty.getState();
    empty.dispatch(redo('text'));
    expect(empty.getState()).toBe(e);
  });

  it('a new page clears history', () => {
    const store = setup();
    store.dispatch(pageReady({ url: 'blob:page2', w: PAGE.w, h: PAGE.h }));
    expect(selectCanUndo('text')(store.getState())).toBe(false);
  });
});
