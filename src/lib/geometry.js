// Document edge detection, perspective correction and "scan look" enhancement. No dependencies.

const A4_INCH = { w: 8.2677, h: 11.6929 };

/** Pixel size of an A4 page at the given dpi. */
export function a4Pixels(dpi, landscape) {
  const w = Math.round(A4_INCH.w * dpi);
  const h = Math.round(A4_INCH.h * dpi);
  return landscape ? { w: h, h: w } : { w, h };
}

/** Order 4 points as top-left, top-right, bottom-right, bottom-left. */
export function orderCorners(pts) {
  const cx = pts.reduce((s, p) => s + p.x, 0) / 4;
  const cy = pts.reduce((s, p) => s + p.y, 0) / 4;
  const byAngle = [...pts].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  // byAngle is clockwise on screen (y down) starting near the left; rotate so the top-left (min x+y) is first.
  let start = 0;
  byAngle.forEach((p, i) => { if (p.x + p.y < byAngle[start].x + byAngle[start].y) start = i; });
  return [0, 1, 2, 3].map((i) => byAngle[(start + i) % 4]);
}

/** True when the quad's average width exceeds its average height. */
export function isLandscapeQuad(q) {
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  return (d(q[0], q[1]) + d(q[3], q[2])) > (d(q[0], q[3]) + d(q[1], q[2]));
}

/**
 * Find the document quad in an image source (ImageBitmap/canvas). Works best for a light page on a darker or
 * more colourful background. Returns 4 ordered points in source pixels, or null if nothing convincing was found.
 */
export function detectCorners(source) {
  const maxDim = 512;
  const scale = Math.min(1, maxDim / Math.max(source.width, source.height));
  const w = Math.max(1, Math.round(source.width * scale));
  const h = Math.max(1, Math.round(source.height * scale));
  const cv = new OffscreenCanvas(w, h);
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  // "Paper-ness": bright and unsaturated.
  const score = new Uint8Array(w * h);
  const hist = new Uint32Array(256);
  for (let i = 0, j = 0; i < score.length; i++, j += 4) {
    const r = data[j], g = data[j + 1], b = data[j + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const sat = mx === 0 ? 0 : ((mx - mn) * 255) / mx;
    const v = Math.max(0, Math.min(255, Math.round(mx - sat)));
    score[i] = v;
    hist[v]++;
  }
  const t = otsu(hist, score.length);
  let mask = new Uint8Array(w * h);
  for (let i = 0; i < mask.length; i++) mask[i] = score[i] > t ? 1 : 0;

  const r = Math.max(2, Math.round(Math.max(w, h) / 80));
  mask = erode(dilate(mask, w, h, r), w, h, r); // close: fill text and gaps
  mask = dilate(erode(mask, w, h, r), w, h, r); // open: drop thin bridges to the background

  const comp = largestComponent(mask, w, h);
  if (!comp || comp.area < 0.1 * w * h) return null;

  const quad = quadFromComponent(comp.labels, comp.id, w, h);
  if (!quad) return null;
  return orderCorners(quad.map((p) => ({ x: p.x / scale, y: p.y / scale })));
}

function otsu(hist, total) {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, t = 127;
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; t = i; }
  }
  return t;
}

function boxSum(mask, w, h, r) {
  // Integral image, then the count of set pixels in each (2r+1)^2 window (clipped at the edges).
  const ii = new Uint32Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += mask[y * w + x];
      ii[(y + 1) * (w + 1) + x + 1] = ii[y * (w + 1) + x + 1] + row;
    }
  }
  const out = new Uint32Array(w * h);
  const area = new Uint32Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      out[y * w + x] = ii[y1 * (w + 1) + x1] - ii[y0 * (w + 1) + x1] - ii[y1 * (w + 1) + x0] + ii[y0 * (w + 1) + x0];
      area[y * w + x] = (y1 - y0) * (x1 - x0);
    }
  }
  return { out, area };
}
function dilate(mask, w, h, r) {
  const { out } = boxSum(mask, w, h, r);
  return Uint8Array.from(out, (v) => (v > 0 ? 1 : 0));
}
function erode(mask, w, h, r) {
  const { out, area } = boxSum(mask, w, h, r);
  return Uint8Array.from(out, (v, i) => (v === area[i] ? 1 : 0));
}

function largestComponent(mask, w, h) {
  const labels = new Int32Array(w * h);
  const stack = new Int32Array(w * h);
  let next = 0, bestId = 0, bestArea = 0;
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || labels[s]) continue;
    const id = ++next;
    let sp = 0, area = 0;
    stack[sp++] = s;
    labels[s] = id;
    while (sp) {
      const p = stack[--sp];
      area++;
      const x = p % w, y = (p - x) / w;
      if (x > 0 && mask[p - 1] && !labels[p - 1]) { labels[p - 1] = id; stack[sp++] = p - 1; }
      if (x < w - 1 && mask[p + 1] && !labels[p + 1]) { labels[p + 1] = id; stack[sp++] = p + 1; }
      if (y > 0 && mask[p - w] && !labels[p - w]) { labels[p - w] = id; stack[sp++] = p - w; }
      if (y < h - 1 && mask[p + w] && !labels[p + w]) { labels[p + w] = id; stack[sp++] = p + w; }
    }
    if (area > bestArea) { bestArea = area; bestId = id; }
  }
  return bestId ? { labels, id: bestId, area: bestArea } : null;
}

function quadFromComponent(labels, id, w, h) {
  // Row extremes are enough to build the convex hull of the component.
  const pts = [];
  for (let y = 0; y < h; y++) {
    let l = -1, r = -1;
    for (let x = 0; x < w; x++) if (labels[y * w + x] === id) { if (l < 0) l = x; r = x; }
    if (l >= 0) { pts.push({ x: l, y }); if (r !== l) pts.push({ x: r, y }); }
  }
  const hull = convexHull(pts);
  if (hull.length < 4) return null;
  return maxAreaQuad(hull);
}

function convexHull(points) {
  const p = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [], upper = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** Largest-area quadrilateral with vertices on the hull (hull is reduced to keep this fast). */
function maxAreaQuad(hull) {
  let pts = hull;
  if (pts.length > 64) { const step = pts.length / 64; pts = Array.from({ length: 64 }, (_, i) => hull[Math.floor(i * step)]); }
  const n = pts.length;
  const tri = (a, b, c) => Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2;
  let best = 0, quad = null;
  for (let i = 0; i < n; i++) {
    for (let k = i + 2; k < n; k++) {
      // Best j between i and k, and best l between k and i (wrapping), maximise each triangle independently.
      let bj = -1, aj = 0;
      for (let j = i + 1; j < k; j++) { const a = tri(pts[i], pts[j], pts[k]); if (a > aj) { aj = a; bj = j; } }
      let bl = -1, al = 0;
      for (let l = k + 1; l < n + i; l++) { const a = tri(pts[i], pts[k], pts[l % n]); if (a > al) { al = a; bl = l % n; } }
      if (bj >= 0 && bl >= 0 && aj + al > best) { best = aj + al; quad = [pts[i], pts[bj], pts[k], pts[bl]]; }
    }
  }
  return quad;
}

/** 3x3 homography (row-major, h33 = 1) mapping src[i] -> dst[i] for 4 point pairs. */
export function homography(src, dst) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i], { x: u, y: v } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  const hvec = solve(A, b);
  return [...hvec, 1];
}

function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    if (Math.abs(M[c][c]) < 1e-12) throw new Error('degenerate corners');
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/**
 * Warp the quad of `source` (ImageBitmap/canvas) to an outW x outH canvas with bilinear sampling.
 * Very large sources are downscaled first to bound memory.
 */
export function warpToCanvas(source, quad, outW, outH) {
  const maxSrc = 4800;
  const s = Math.min(1, maxSrc / Math.max(source.width, source.height));
  const sw = Math.round(source.width * s), sh = Math.round(source.height * s);
  const srcCv = new OffscreenCanvas(sw, sh);
  const sctx = srcCv.getContext('2d', { willReadFrequently: true });
  sctx.drawImage(source, 0, 0, sw, sh);
  const src = sctx.getImageData(0, 0, sw, sh).data;

  const q = quad.map((p) => ({ x: p.x * s, y: p.y * s }));
  const H = homography(
    [{ x: 0, y: 0 }, { x: outW, y: 0 }, { x: outW, y: outH }, { x: 0, y: outH }],
    q,
  );
  const out = new ImageData(outW, outH);
  const o = out.data;
  for (let y = 0; y < outH; y++) {
    const yc = y + 0.5;
    let X = H[0] * 0.5 + H[1] * yc + H[2];
    let Y = H[3] * 0.5 + H[4] * yc + H[5];
    let Z = H[6] * 0.5 + H[7] * yc + H[8];
    let oi = y * outW * 4;
    for (let x = 0; x < outW; x++, oi += 4, X += H[0], Y += H[3], Z += H[6]) {
      let fx = X / Z - 0.5, fy = Y / Z - 0.5;
      if (fx < 0) fx = 0; else if (fx > sw - 1.001) fx = sw - 1.001;
      if (fy < 0) fy = 0; else if (fy > sh - 1.001) fy = sh - 1.001;
      const x0 = fx | 0, y0 = fy | 0, ax = fx - x0, ay = fy - y0;
      const i00 = (y0 * sw + x0) * 4, i01 = i00 + 4, i10 = i00 + sw * 4, i11 = i10 + 4;
      for (let c = 0; c < 3; c++) {
        const top = src[i00 + c] + (src[i01 + c] - src[i00 + c]) * ax;
        const bot = src[i10 + c] + (src[i11 + c] - src[i10 + c]) * ax;
        o[oi + c] = top + (bot - top) * ay;
      }
      o[oi + 3] = 255;
    }
  }
  const cv = document.createElement('canvas');
  cv.width = outW; cv.height = outH;
  cv.getContext('2d').putImageData(out, 0, 0);
  return cv;
}

/** Stretch levels so the paper becomes white and ink darker (in place). */
export function enhanceCanvas(cv) {
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, cv.width, cv.height);
  const d = img.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 16) hist[(d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8]++;
  const total = hist.reduce((a, b) => a + b, 0);
  const pct = (p) => { let acc = 0; for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= total * p) return i; } return 255; };
  const lo = pct(0.01), hi = Math.max(lo + 1, pct(0.6));
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) lut[i] = ((i - lo) * 255) / (hi - lo);
  for (let i = 0; i < d.length; i += 4) { d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]]; }
  ctx.putImageData(img, 0, 0);
}
