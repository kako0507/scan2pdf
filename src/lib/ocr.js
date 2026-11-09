// Tesseract.js wrapper. All engine and language files are served from this site (works offline once cached).
import { createWorker } from 'tesseract.js';

const CJK = '\\u2E80-\\u9FFF\\uF900-\\uFAFF\\uFE30-\\uFE4F\\uFF00-\\uFFEF';
const MIN_CONFIDENCE = 50;
const CJK_GAP = new RegExp(`([${CJK}])\\s+(?=[${CJK}])`, 'g');

/** Tesseract puts spaces between CJK characters; remove them, keep spaces in Latin text. */
export function tidyText(s) {
  return s.replace(CJK_GAP, '$1').replace(/\s+/g, ' ').trim();
}

/**
 * Recognise text lines on a canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {string[]} langs e.g. ['chi_tra', 'eng']
 * @param {(p:{status:string,progress:number})=>void} onProgress
 * @returns {Promise<{text:string,x0:number,y0:number,x1:number,y1:number,conf:number}[]>}
 */
export async function recognizeLines(canvas, langs, onProgress) {
  const base = new URL(`${import.meta.env.BASE_URL}vendor/tesseract/`, document.baseURI).href;
  const worker = await createWorker(langs, 1 /* LSTM only */, {
    workerPath: `${base}worker.min.js`,
    corePath: `${base}core`,
    langPath: `${base}lang`,
    gzip: true,
    cacheMethod: 'none', // the service worker caches the files
    logger: (m) => onProgress?.(m),
  });
  try {
    // PSM 3 = automatic page segmentation; the tesseract.js default (single block) misses lines on certificates/forms.
    await worker.setParameters({ preserve_interword_spaces: '1', tessedit_pageseg_mode: '3' });
    const { data } = await worker.recognize(canvas, {}, { blocks: true, text: false });
    const lines = [];
    for (const block of data.blocks || []) {
      for (const para of block.paragraphs || []) {
        for (const line of para.lines || []) {
          const text = tidyText((line.words || []).map((w) => w.text).join(' '));
          if (!text || line.confidence < MIN_CONFIDENCE) continue; // drops noise from photos, seals and signatures
          const { x0, y0, x1, y1 } = line.bbox;
          lines.push({ text, x0, y0, x1, y1, conf: Math.round(line.confidence) });
        }
      }
    }
    return lines;
  } finally {
    await worker.terminate();
  }
}
