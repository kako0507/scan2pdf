// Pixel data (ImageBitmap / canvas) is not serialisable, so it is kept here, keyed by the blob URL that the
// store references. Replacing an entry revokes the old URL.
const cache = new Map();

export function putImage(url, image) { cache.set(url, image); }

export function getImage(url) { return cache.get(url); }

export function dropImage(url) {
  if (!url) return;
  const img = cache.get(url);
  img?.close?.(); // ImageBitmap
  cache.delete(url);
  URL.revokeObjectURL(url);
}
