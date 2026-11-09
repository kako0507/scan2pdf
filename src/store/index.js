import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { redo, undo } from './history.js';
import { pagesReducer } from './pages.js';
import { settingsSlice, uiSlice } from './slices.js';

export const appReducer = combineReducers({
  settings: settingsSlice.reducer,
  ui: uiSlice.reducer,
  pages: pagesReducer,
});

/** Root reducer. Undo/redo is ignored while a long operation (straighten, OCR, export) is running. */
export function rootReducer(state, action) {
  if (state?.ui?.busy && (undo.match(action) || redo.match(action))) return state;
  return appReducer(state, action);
}

/** One store for the whole app. RTK's dev checks flag mutations and non-serialisable values. */
export function createAppStore(preloadedState) {
  return configureStore({ reducer: rootReducer, preloadedState });
}
