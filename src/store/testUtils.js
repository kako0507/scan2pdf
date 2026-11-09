// Helpers for reducer tests: drive the real root reducer, with deep-frozen states so any mutation throws.
import { expect } from 'vitest';
import { appReducer } from './index.js';
import { pageOpened, pagesAdded } from './pages.js';

export const deepFreeze = (o) => {
  Object.values(o).forEach((v) => v && typeof v === 'object' && !Object.isFrozen(v) && deepFreeze(v));
  return Object.freeze(o);
};

/** Apply actions one by one to frozen states; equal inputs must give equal outputs. */
export function run(actions, state = appReducer(undefined, { type: '@@init' })) {
  let s = state;
  for (const a of actions) {
    deepFreeze(s);
    const next = appReducer(s, a);
    expect(appReducer(s, a)).toEqual(next); // deterministic
    s = next;
  }
  return s;
}

export const QUAD = [{ x: 10, y: 10 }, { x: 990, y: 20 }, { x: 980, y: 790 }, { x: 5, y: 780 }];
export const photo = (name = 'doc') => ({ url: `blob:${name}`, w: 1000, h: 800, name });
export const added = (...names) => pagesAdded(names.map((n) => ({ photo: photo(n), quad: QUAD, detected: true })));
/** Actions that add one page and open it. */
export const onePage = (name = 'doc') => [added(name), pageOpened(1)];
/** The page open in the editor. */
export const P = (s) => s.pages.byId[s.pages.activeId];
