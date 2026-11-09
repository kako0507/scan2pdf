import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { undoable } from './history.js';
import { documentSlice, settingsSlice, textLayerSlice, uiSlice } from './slices.js';

export const appReducer = combineReducers({
  settings: settingsSlice.reducer,
  document: documentSlice.reducer,
  textLayer: textLayerSlice.reducer,
  ui: uiSlice.reducer,
});

/** Root reducer: the app reducer wrapped with undo/redo history (state.history). */
export const rootReducer = undoable(appReducer);

/** One store for the whole app. RTK's dev checks flag mutations and non-serialisable values. */
export function createAppStore(preloadedState) {
  return configureStore({ reducer: rootReducer, preloadedState });
}
