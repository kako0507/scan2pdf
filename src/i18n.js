// UI strings. Default language follows the browser; the user's choice is remembered on this device.

export const STRINGS = {
  en: {
    tagline: 'Photo → straightened A4 PDF with searchable text. Runs entirely in your browser; your files never leave this device.',
    langToggle: '中文',
    undo: 'Undo',
    redo: 'Redo',
    stepPhoto: 'Photo',
    stepCorners: 'Corners',
    stepText: 'Text',
    stepSave: 'Save',
    back: '← Back',
    next: 'Next →',
    nextStraighten: 'Next: straighten to A4 →',
    continueEditing: 'Continue with this photo →',
    textCount: (n) => `${n} text boxes`,
    step1: '1. Open a photo',
    drop: 'Drop a photo here, or click to choose (camera works on phones)',
    step2: '2. Adjust the page corners',
    cornersHint: 'Drag the four handles onto the page corners.',
    autoDetect: 'Auto-detect',
    fullImage: 'Whole image',
    orientation: 'Orientation',
    orientAuto: 'Auto',
    orientPortrait: 'Portrait',
    orientLandscape: 'Landscape',
    resolution: 'Resolution',
    enhance: 'Scan look (whiter paper)',
    straighten: 'Straighten to A4',
    step3: '3. Text layer',
    ocrLangs: 'Text languages',
    langChiTra: 'Traditional Chinese',
    langEng: 'English',
    runOcr: 'Recognize text',
    rerunOcr: 'Recognize text again',
    ocrHint: 'Drag on the page to add text that was not recognized (signatures, seals). Click a box to select it, then drag it or its handles to move or resize.',
    noItems: 'No text found. Drag on the page to add text, or recognize text again.',
    textPlaceholder: 'Text for this box',
    remove: 'Delete',
    lowConf: 'low confidence, please check',
    added: 'added by you',
    step4: '4. Save',
    fileName: 'File name',
    download: 'Download PDF',
    detectFailed: 'Could not find the page edges automatically; drag the handles instead.',
    working: 'Working…',
    ocrLoading: 'Loading text recognition…',
    ocrRunning: 'Recognising text…',
    ocrDone: (n) => `Found ${n} lines. Check and fix them below.`,
    ocrFailed: (msg) => `Text recognition failed: ${msg}`,
    recognizedConf: (n) => `Recognized · ${n}% sure`,
    error: (msg) => `Error: ${msg}`,
    pdfDone: 'PDF saved.',
    offlineReady: 'Ready to work offline.',
  },
  'zh-Hant': {
    tagline: '照片 → 校正成 A4、可搜尋文字的 PDF。全部在瀏覽器內處理，檔案不會離開這台裝置。',
    langToggle: 'EN',
    undo: '復原',
    redo: '重做',
    stepPhoto: '照片',
    stepCorners: '四角',
    stepText: '文字',
    stepSave: '儲存',
    back: '← 上一步',
    next: '下一步 →',
    nextStraighten: '下一步：校正為 A4 →',
    continueEditing: '繼續編輯這張照片 →',
    textCount: (n) => `${n} 個文字框`,
    step1: '1. 開啟照片',
    drop: '把照片拖到這裡，或點一下選擇（手機可直接拍照）',
    step2: '2. 調整文件四角',
    cornersHint: '把四個圓點拖到文件的四個角。',
    autoDetect: '自動偵測',
    fullImage: '整張圖片',
    orientation: '方向',
    orientAuto: '自動',
    orientPortrait: '直式',
    orientLandscape: '橫式',
    resolution: '解析度',
    enhance: '掃描效果（紙張更白）',
    straighten: '校正為 A4',
    step3: '3. 文字層',
    ocrLangs: '辨識語言',
    langChiTra: '繁體中文',
    langEng: '英文',
    runOcr: '文字辨識',
    rerunOcr: '重新文字辨識',
    ocrHint: '在頁面上拖曳一個框，可以補上沒辨識到的字（簽名、印章）。點一下框可選取，拖曳框或邊角的控制點可移動、調整大小。',
    noItems: '沒有文字。可在頁面上拖曳新增文字，或重新文字辨識。',
    textPlaceholder: '這個框的文字',
    remove: '刪除',
    lowConf: '信心較低，請確認',
    added: '手動新增',
    step4: '4. 儲存',
    fileName: '檔名',
    download: '下載 PDF',
    detectFailed: '無法自動找到文件邊緣，請手動拖曳四個圓點。',
    working: '處理中…',
    ocrLoading: '載入文字辨識…',
    ocrRunning: '辨識文字中…',
    ocrDone: (n) => `找到 ${n} 行文字，請在下方檢查與修正。`,
    ocrFailed: (msg) => `文字辨識失敗：${msg}`,
    recognizedConf: (n) => `自動辨識 · 把握度 ${n}%`,
    error: (msg) => `發生錯誤：${msg}`,
    pdfDone: 'PDF 已儲存。',
    offlineReady: '已可離線使用。',
  },
};

const KEY = 'scan2pdf.lang';

export function initialLang() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && STRINGS[saved]) return saved;
  } catch { /* storage unavailable */ }
  const prefs = navigator.languages?.length ? navigator.languages : [navigator.language || 'en'];
  return prefs[0]?.toLowerCase().startsWith('zh') ? 'zh-Hant' : 'en';
}

export function saveLang(lang) {
  try { localStorage.setItem(KEY, lang); } catch { /* storage unavailable */ }
}

/** Translate a key (string entries, or function entries called with args). */
export function translate(lang, key, ...args) {
  const v = STRINGS[lang]?.[key] ?? STRINGS.en[key] ?? key;
  return typeof v === 'function' ? v(...args) : v;
}
