// Multiple pages. Each page has its own `document` (photo, corners, straightened image), `textLayer` and
// undo/redo `history`, produced by the single-page reducer below. The pages reducer keeps the order and the
// open page, and routes page-level actions to one page: `action.meta.pageId` if given, else the open page.
import { combineReducers, createSlice } from '@reduxjs/toolkit';
import { undoable } from './history.js';
import { documentSlice, textLayerSlice } from './slices.js';

/** Reducer for one page (with its own undo/redo history). */
export const pageReducer = undoable(combineReducers({
  document: documentSlice.reducer,
  textLayer: textLayerSlice.reducer,
}));

const PAGE_ACTION = /^(document|textLayer|history)\//;

/** Address a page-level action to a specific page (used by thunks that work in the background). */
export const forPage = (pageId, action) => ({ ...action, meta: { ...action.meta, pageId } });

const listSlice = createSlice({
  name: 'pages',
  initialState: {
    order: [], // page ids in output order
    byId: {}, // id -> page state
    activeId: null, // page open in the editor
    nextId: 1,
  },
  reducers: {
    /** payload: [{ photo: { url, w, h, name }, quad, detected }] — appended in this order. */
    pagesAdded: (s, a) => {
      for (const { photo, quad, detected } of a.payload) {
        const id = s.nextId++;
        let page = pageReducer(undefined, { type: '@@page/init' });
        page = pageReducer(page, documentSlice.actions.photoLoaded(photo));
        page = pageReducer(page, documentSlice.actions.quadSet({ quad, detected }));
        s.byId[id] = page;
        s.order.push(id);
      }
    },
    pageRemoved: (s, a) => {
      delete s.byId[a.payload];
      s.order = s.order.filter((id) => id !== a.payload);
      if (s.activeId === a.payload) s.activeId = null;
    },
    /** payload: { id, toIndex } */
    pageMoved: (s, a) => {
      const { id, toIndex } = a.payload;
      const from = s.order.indexOf(id);
      if (from < 0) return;
      s.order.splice(from, 1);
      s.order.splice(Math.max(0, Math.min(s.order.length, toIndex)), 0, id);
    },
    pageOpened: (s, a) => { s.activeId = a.payload; },
  },
});

export function pagesReducer(state, action) {
  if (state && PAGE_ACTION.test(action.type)) {
    const id = action.meta?.pageId ?? state.activeId;
    const page = state.byId[id];
    if (!page) return state;
    const next = pageReducer(page, action);
    return next === page ? state : { ...state, byId: { ...state.byId, [id]: next } };
  }
  return listSlice.reducer(state, action);
}

export const { pagesAdded, pageRemoved, pageMoved, pageOpened } = listSlice.actions;

// ---------- selectors ----------
export const selectActivePage = (s) => s.pages.byId[s.pages.activeId] ?? null;
export const selectPageCount = (s) => s.pages.order.length;
/** A page is processed once it has been straightened (OCR runs automatically right after). */
export const isProcessed = (page) => Boolean(page.document.page);
/** Number of pages that still need to be opened and straightened before export. */
export const selectPendingCount = (s) => s.pages.order.filter((id) => !isProcessed(s.pages.byId[id])).length;
/** 1-based position of the open page. */
export const selectActiveNumber = (s) => s.pages.order.indexOf(s.pages.activeId) + 1;
