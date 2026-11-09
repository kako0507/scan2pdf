import { createSlice } from '@reduxjs/toolkit';
import { orderCorners } from '../lib/geometry.js';

// All state is serialisable. Image pixels live outside the store (lib/imageCache.js), referenced by blob URL.

// ---------- settings ----------
export const settingsSlice = createSlice({
  name: 'settings',
  initialState: {
    lang: 'en',
    orientation: 'auto', // 'auto' | 'portrait' | 'landscape'
    dpi: 300,
    enhance: false,
    ocrLangs: ['chi_tra', 'eng'],
  },
  reducers: {
    langSet: (s, a) => { s.lang = a.payload; },
    orientationSet: (s, a) => { s.orientation = a.payload; },
    dpiSet: (s, a) => { s.dpi = a.payload; },
    enhanceSet: (s, a) => { s.enhance = a.payload; },
    ocrLangToggled: (s, a) => {
      s.ocrLangs = s.ocrLangs.includes(a.payload) ? s.ocrLangs.filter((l) => l !== a.payload) : [...s.ocrLangs, a.payload];
    },
  },
});

// ---------- document (photo, corners, straightened page) ----------
export const documentSlice = createSlice({
  name: 'document',
  initialState: {
    photo: null, // { url, w, h, name }
    quad: null, // [{x,y}] x4, source pixels, tl/tr/br/bl
    detectFailed: false,
    draggingCorner: null, // index of the corner handle being dragged
    page: null, // { url, w, h, source: { quad, orientation, dpi, enhance } }
  },
  reducers: {
    photoLoaded: (s, a) => { s.photo = a.payload; s.quad = null; s.page = null; s.detectFailed = false; },
    quadSet: (s, a) => { s.quad = a.payload.quad; s.detectFailed = !a.payload.detected; },
    cornerDragStarted: (s, a) => { s.draggingCorner = a.payload; },
    cornerMoved: (s, a) => {
      if (s.draggingCorner === null) return;
      const { x, y } = a.payload;
      s.quad[s.draggingCorner] = { x: Math.min(s.photo.w, Math.max(0, x)), y: Math.min(s.photo.h, Math.max(0, y)) };
    },
    /** Ends a drag and re-orders the corners in case two handles were swapped. */
    cornerDragEnded: (s) => {
      if (s.draggingCorner === null) return;
      s.draggingCorner = null;
      s.quad = orderCorners(s.quad);
    },
    pageReady: (s, a) => { s.page = a.payload; },
  },
});

// ---------- text layer (OCR lines + boxes added by the user) ----------
/** New box for a move/resize drag: original box + pointer delta, kept inside the page and at least minSide. */
export function dragBox({ mode, startX, startY, orig }, { x, y, w, h, minSide }) {
  const dx = x - startX, dy = y - startY;
  if (mode === 'move') {
    const bw = orig.x1 - orig.x0, bh = orig.y1 - orig.y0;
    const x0 = Math.min(Math.max(0, orig.x0 + dx), w - bw);
    const y0 = Math.min(Math.max(0, orig.y0 + dy), h - bh);
    return { x0, y0, x1: x0 + bw, y1: y0 + bh };
  }
  let { x0, y0, x1, y1 } = orig;
  if (mode.includes('w')) x0 = Math.min(Math.max(0, x0 + dx), x1 - minSide);
  if (mode.includes('e')) x1 = Math.max(Math.min(w, x1 + dx), x0 + minSide);
  if (mode.includes('n')) y0 = Math.min(Math.max(0, y0 + dy), y1 - minSide);
  if (mode.includes('s')) y1 = Math.max(Math.min(h, y1 + dy), y0 + minSide);
  return { x0, y0, x1, y1 };
}

const byPosition = (a, b) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2 || a.x0 - b.x0;

export const textLayerSlice = createSlice({
  name: 'textLayer',
  initialState: {
    items: [], // { id, text, x0, y0, x1, y1, conf, added }
    selectedId: null,
    nextId: 1,
    draft: null, // box being drawn: { x0, y0, x1, y1 } (x0/y0 = start point)
    boxDrag: null, // box being moved/resized: { id, mode, startX, startY, orig: { x0, y0, x1, y1 } }
    ocrDone: false, // OCR has run on the current page
  },
  reducers: {
    ocrLinesReceived: (s, a) => {
      s.items = s.items.filter((it) => it.added);
      for (const l of a.payload) s.items.push({ ...l, id: s.nextId++, added: false });
      s.items.sort(byPosition);
      s.selectedId = null;
      s.ocrDone = true;
    },
    itemTextChanged: (s, a) => {
      const it = s.items.find((x) => x.id === a.payload.id);
      if (it) it.text = a.payload.text;
    },
    itemRemoved: (s, a) => {
      s.items = s.items.filter((x) => x.id !== a.payload);
      if (s.selectedId === a.payload) s.selectedId = null;
    },
    itemSelected: (s, a) => { s.selectedId = a.payload; },
    draftStarted: (s, a) => { s.draft = { x0: a.payload.x, y0: a.payload.y, x1: a.payload.x, y1: a.payload.y }; },
    draftMoved: (s, a) => { if (s.draft) { s.draft.x1 = a.payload.x; s.draft.y1 = a.payload.y; } },
    draftCancelled: (s) => { s.draft = null; },
    /** payload: { minSide, w, h } — boxes smaller than minSide are discarded; w/h clamp to the page. */
    draftCommitted: (s, a) => {
      const d = s.draft;
      s.draft = null;
      if (!d) return;
      const { minSide, w, h } = a.payload;
      const box = {
        x0: Math.max(0, Math.min(d.x0, d.x1)), y0: Math.max(0, Math.min(d.y0, d.y1)),
        x1: Math.min(w, Math.max(d.x0, d.x1)), y1: Math.min(h, Math.max(d.y0, d.y1)),
      };
      if (box.x1 - box.x0 < minSide || box.y1 - box.y0 < minSide) return;
      const id = s.nextId++;
      s.items.push({ id, text: '', ...box, conf: 100, added: true });
      s.items.sort(byPosition);
      s.selectedId = id;
    },
    /** mode: 'move' or a resize handle 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'. */
    boxDragStarted: (s, a) => {
      const { id, mode, x, y } = a.payload;
      const it = s.items.find((i) => i.id === id);
      if (!it) return;
      s.selectedId = id;
      s.boxDrag = { id, mode, startX: x, startY: y, orig: { x0: it.x0, y0: it.y0, x1: it.x1, y1: it.y1 } };
    },
    /** payload: { x, y, w, h, minSide } — pointer position plus page size for clamping. */
    boxDragMoved: (s, a) => {
      const d = s.boxDrag;
      const it = d && s.items.find((i) => i.id === d.id);
      if (!it) return;
      Object.assign(it, dragBox(d, a.payload));
    },
    boxDragEnded: (s) => {
      if (!s.boxDrag) return;
      s.boxDrag = null;
      s.items.sort(byPosition);
    },
  },
  extraReducers: (b) => {
    // A new photo or a re-straightened page invalidates all boxes.
    const reset = (s) => { s.items = []; s.selectedId = null; s.draft = null; s.boxDrag = null; s.ocrDone = false; };
    b.addCase(documentSlice.actions.photoLoaded, reset).addCase(documentSlice.actions.pageReady, reset);
  },
});

// ---------- ui (busy flag, status line, OCR progress, output name) ----------
export const uiSlice = createSlice({
  name: 'ui',
  initialState: {
    busy: false,
    status: null, // { key, args } translated at render time
    ocrProgress: null, // 0..1 while OCR runs
    fileName: 'scan',
    dragOver: false, // a file is being dragged over the drop zone
    step: 'photo', // 'photo' | 'corners' | 'text' | 'save' — only the current step is shown
  },
  reducers: {
    stepSet: (s, a) => { s.step = a.payload; s.status = null; },
    dragOverSet: (s, a) => { s.dragOver = a.payload; },
    busyStarted: (s) => { s.busy = true; s.status = { key: 'working', args: [] }; },
    busyEnded: (s) => { s.busy = false; s.ocrProgress = null; },
    statusSet: (s, a) => { s.status = a.payload ? { key: a.payload.key, args: a.payload.args ?? [] } : null; },
    ocrProgressSet: (s, a) => { s.ocrProgress = a.payload; },
    fileNameSet: (s, a) => { s.fileName = a.payload; },
  },
  extraReducers: (b) => {
    b.addCase(documentSlice.actions.photoLoaded, (s, a) => { s.fileName = a.payload.name || 'scan'; s.step = 'corners'; });
    b.addCase(documentSlice.actions.pageReady, (s) => { s.step = 'text'; });
    b.addCase(documentSlice.actions.quadSet, (s, a) => {
      s.status = a.payload.detected ? null : { key: 'detectFailed', args: [] };
    });
  },
});

export const { langSet, orientationSet, dpiSet, enhanceSet, ocrLangToggled } = settingsSlice.actions;
export const { photoLoaded, quadSet, cornerDragStarted, cornerMoved, cornerDragEnded, pageReady } = documentSlice.actions;
export const {
  ocrLinesReceived, itemTextChanged, itemRemoved, itemSelected,
  draftStarted, draftMoved, draftCancelled, draftCommitted, boxDragStarted, boxDragMoved, boxDragEnded,
} = textLayerSlice.actions;
export const { busyStarted, busyEnded, statusSet, ocrProgressSet, fileNameSet, dragOverSet, stepSet } = uiSlice.actions;
