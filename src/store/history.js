// Undo / redo for two editing contexts, each with its own history:
//   corners — the page corners (step 2)
//   text    — the text boxes: added, removed, moved, resized, edited, OCR results (step 3)
// Implemented as a higher-order reducer around the root reducer (itself a pure function). Selection, busy
// flags, progress and in-progress drags are never part of history.
import { createAction } from '@reduxjs/toolkit';

/** payload: 'corners' | 'text' */
export const undo = createAction('history/undo');
export const redo = createAction('history/redo');

const LIMIT = 100;

const SCOPES = {
  corners: {
    get: (s) => s.document.quad,
    set: (s, quad) => ({ ...s, document: { ...s.document, quad, draggingCorner: null } }),
    dragging: (s) => s.document.draggingCorner !== null,
    dragStart: 'document/cornerDragStarted',
    dragEnd: 'document/cornerDragEnded',
    resetOn: ['document/photoLoaded'],
    group: () => null,
  },
  text: {
    get: (s) => s.textLayer.items,
    set: (s, items) => {
      const selectedId = items.some((i) => i.id === s.textLayer.selectedId) ? s.textLayer.selectedId : null;
      return { ...s, textLayer: { ...s.textLayer, items, selectedId, draft: null, boxDrag: null } };
    },
    dragging: (s) => s.textLayer.boxDrag !== null,
    dragStart: 'textLayer/boxDragStarted',
    dragEnd: 'textLayer/boxDragEnded',
    resetOn: ['document/photoLoaded', 'document/pageReady'], // old images are released
    // Consecutive typing in the same box is one entry.
    group: (a) => (a.type === 'textLayer/itemTextChanged' ? `text:${a.payload.id}` : null),
  },
};

const emptyTrack = { past: [], future: [], pending: null, group: null };
export const emptyHistory = { corners: emptyTrack, text: emptyTrack };

function push(track, value, group) {
  const past = [...track.past, value];
  return { ...track, past: past.length > LIMIT ? past.slice(past.length - LIMIT) : past, future: [], group };
}

/** Update one scope's track for an action that turned `prev` into `next`. */
function record(scope, track, prev, next, action) {
  if (scope.resetOn.includes(action.type)) return emptyTrack;
  const before = scope.get(prev);
  const after = scope.get(next);
  if (action.type === scope.dragStart) return { ...track, pending: before, group: null };
  if (action.type === scope.dragEnd) {
    // One entry per drag, from the value before the drag began; a click without movement records nothing.
    const t = track.pending !== null && track.pending !== after ? push(track, track.pending, null) : track;
    return { ...t, pending: null };
  }
  if (before === after) return track; // reducers keep unchanged references
  if (scope.dragging(prev)) return track; // covered by the pending value
  if (before === null) return track; // first value (e.g. auto-detected corners) is not an undo step
  const group = scope.group(action);
  const t = group && group === track.group ? track : push(track, before, group);
  return { ...t, group };
}

/** @param {(state, action) => object} reducer root reducer for everything except `history` */
export function undoable(reducer) {
  return function rootReducer(state, action) {
    const { history = emptyHistory, ...prev } = state ?? {};
    const current = state ? prev : undefined;

    if (undo.match(action) || redo.match(action)) {
      const scope = SCOPES[action.payload];
      const track = history[action.payload];
      if (!scope || !current?.document || current.ui?.busy) return state; // no time travel mid-operation
      const isUndo = undo.match(action);
      const from = isUndo ? track.past : track.future;
      if (!from.length) return state;
      const target = from[from.length - 1];
      const rest = from.slice(0, -1);
      const now = scope.get(current);
      const nextTrack = isUndo
        ? { past: rest, future: [...track.future, now], pending: null, group: null }
        : { past: [...track.past, now], future: rest, pending: null, group: null };
      return { ...scope.set(current, target), history: { ...history, [action.payload]: nextTrack } };
    }

    const next = reducer(current, action);
    // Store creation (possibly with partial preloaded state): start with empty history.
    if (!current?.document) return { ...next, history: emptyHistory };
    return {
      ...next,
      history: {
        corners: record(SCOPES.corners, history.corners, current, next, action),
        text: record(SCOPES.text, history.text, current, next, action),
      },
    };
  };
}

export const selectCanUndo = (scope) => (s) => s.history[scope].past.length > 0;
export const selectCanRedo = (scope) => (s) => s.history[scope].future.length > 0;
