import { describe, expect, it } from 'vitest';
import { forPage, pageMoved, pageOpened, pageRemoved, selectActiveNumber, selectPendingCount } from './pages.js';
import { itemTextChanged, ocrLinesReceived, pageReady, quadSet } from './slices.js';
import { P, QUAD, added, run } from './testUtils.js';

const names = (s) => s.pages.order.map((id) => s.pages.byId[id].document.photo.name);
const img = (url) => pageReady({ url, w: 10, h: 10, source: null });

describe('pages', () => {
  it('adds pages in order, each with its photo and detected corners', () => {
    const s = run([added('a', 'b'), added('c')]);
    expect(names(s)).toEqual(['a', 'b', 'c']);
    expect(s.pages.byId[2].document.quad).toEqual(QUAD);
    expect(s.pages.byId[3].history.corners.past).toEqual([]); // detected corners are the starting point
  });

  it('reorders pages and clamps the target index', () => {
    const base = run([added('a', 'b', 'c')]);
    expect(names(run([pageMoved({ id: 3, toIndex: 0 })], base))).toEqual(['c', 'a', 'b']);
    expect(names(run([pageMoved({ id: 1, toIndex: 99 })], base))).toEqual(['b', 'c', 'a']);
    expect(names(run([pageMoved({ id: 2, toIndex: -5 })], base))).toEqual(['b', 'a', 'c']);
  });

  it('removes pages and closes the editor if the open page is removed', () => {
    const s = run([added('a', 'b'), pageOpened(2), pageRemoved(2)]);
    expect(names(s)).toEqual(['a']);
    expect(s.pages.activeId).toBe(null);
  });

  it('routes page actions to the open page, or to meta.pageId', () => {
    const s = run([
      added('a', 'b'), pageOpened(1), img('blob:p1'),
      forPage(2, img('blob:p2')),
      forPage(2, ocrLinesReceived([{ text: 'two', x0: 0, y0: 0, x1: 5, y1: 5, conf: 90 }])),
    ]);
    expect(P(s).document.page.url).toBe('blob:p1');
    expect(P(s).textLayer.items).toEqual([]);
    expect(s.pages.byId[2].document.page.url).toBe('blob:p2');
    expect(s.pages.byId[2].textLayer.items.map((i) => i.text)).toEqual(['two']);
  });

  it('ignores actions for a page that no longer exists', () => {
    const s = run([added('a'), pageRemoved(1)]);
    expect(run([forPage(1, quadSet({ quad: QUAD, detected: true })), forPage(1, itemTextChanged({ id: 1, text: 'x' }))], s)).toEqual(s);
  });

  it('counts pages that still need processing (straightening) before export', () => {
    const base = run([added('a', 'b', 'c')]);
    expect(selectPendingCount(base)).toBe(3);
    const two = run([forPage(1, img('blob:1')), forPage(3, img('blob:3'))], base);
    expect(selectPendingCount(two)).toBe(1);
    expect(selectPendingCount(run([pageRemoved(2)], two))).toBe(0);
    expect(selectPendingCount(run([]))).toBe(0);
  });

  it('numbers the open page by its position', () => {
    const s = run([added('a', 'b', 'c'), pageOpened(3), pageMoved({ id: 3, toIndex: 0 })]);
    expect(selectActiveNumber(s)).toBe(1);
  });
});
