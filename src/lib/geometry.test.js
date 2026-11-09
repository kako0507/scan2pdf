import { describe, expect, it } from 'vitest';
import { a4Pixels, homography, isLandscapeQuad, orderCorners } from './geometry.js';
import { tidyText } from './ocr.js';

describe('geometry', () => {
  it('A4 pixel sizes', () => {
    expect(a4Pixels(300, false)).toEqual({ w: 2480, h: 3508 });
    expect(a4Pixels(150, true)).toEqual({ w: 1754, h: 1240 });
  });

  it('orders corners tl, tr, br, bl regardless of input order', () => {
    const q = [{ x: 90, y: 95 }, { x: 5, y: 10 }, { x: 8, y: 92 }, { x: 95, y: 3 }];
    expect(orderCorners(q)).toEqual([{ x: 5, y: 10 }, { x: 95, y: 3 }, { x: 90, y: 95 }, { x: 8, y: 92 }]);
  });

  it('homography maps the four corners exactly', () => {
    const src = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 140 }, { x: 0, y: 140 }];
    const dst = [{ x: 12, y: 30 }, { x: 410, y: 8 }, { x: 450, y: 600 }, { x: 3, y: 560 }];
    const H = homography(src, dst);
    src.forEach((p, i) => {
      const z = H[6] * p.x + H[7] * p.y + H[8];
      expect((H[0] * p.x + H[1] * p.y + H[2]) / z).toBeCloseTo(dst[i].x, 6);
      expect((H[3] * p.x + H[4] * p.y + H[5]) / z).toBeCloseTo(dst[i].y, 6);
    });
  });

  it('detects landscape quads', () => {
    expect(isLandscapeQuad([{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 200 }, { x: 0, y: 200 }])).toBe(true);
    expect(isLandscapeQuad([{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 300 }, { x: 0, y: 300 }])).toBe(false);
  });
});

describe('tidyText', () => {
  it('removes spaces between CJK characters but keeps Latin spacing', () => {
    expect(tidyText('國 立 臺 灣 科技 大學')).toBe('國立臺灣科技大學');
    expect(tidyText('電 資 學 院 | DEAN, COLLEGE  OF')).toBe('電資學院 | DEAN, COLLEGE OF');
    expect(tidyText('台 科大 (102) 碩 字 第 0030 號')).toBe('台科大 (102) 碩字第 0030 號');
  });
});
