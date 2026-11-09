# scan2pdf

[English](README.md) | **繁體中文**

照片 → 校正成 A4、可搜尋文字的 PDF。全部在瀏覽器內處理：不上傳、不需要伺服器，第一次開啟後即可離線使用。

## 功能

- **逐步操作**：照片 → 四角 → 文字 → 儲存，一次只顯示一個步驟。返回上一步且沒有修改時，辨識結果和編輯都會保留。
- **自動抓文件邊緣並透視校正**為 A4（直式／橫式，150／200／300 dpi），可拖曳四角微調。
- **文字辨識**：使用 Tesseract（繁體中文＋英文），新頁面進入文字步驟時自動執行。文字是看不見的一層：PDF 外觀和照片一樣，但可以搜尋、複製。
- **修正與補字**：可修正辨識錯誤，並在頁面上拖曳一個框，補上辨識不到的字（簽名、印章）。
- **移動、調整框的大小**：選取框後拖曳框本身或控制點。
- **復原／重做**：調整四角和編輯文字層時都可以使用，兩者歷史分開。使用各步驟的 ↶ ↷ 按鈕，或 Ctrl/⌘+Z、Ctrl/⌘+Shift+Z、Ctrl+Y。
- **可離線、可安裝**到主畫面（Service Worker、Web App Manifest）。
- **介面中英切換**，預設依瀏覽器語言。

## 隱私

圖片只在你的瀏覽器記憶體中處理，不會傳送到任何地方；網站只提供靜態檔案。

## 限制

- 文字辨識讀不出手寫、簽名和篆字印章，需手動補上；粗體、花俏字型或背景複雜的字可能漏掉。
- 自動偵測邊緣適合「淺色紙張＋較深或有顏色的背景」，其他情況請手動拖曳四角。
- 第一次開啟約下載 17 MB（辨識引擎與語言資料）。

## 開發

以 **React**、**Redux Toolkit**（react-redux）與 **Vite** 開發。

```
src/
  main.jsx            store 與 <Provider>、語言設定保存、註冊 Service Worker
  App.jsx             步驟指示、目前步驟、儲存步驟、快捷鍵
  components/         PhotoStep、CornerStep、TextStep（頁面編輯與文字清單）、UndoRedo
  store/
    slices.js         settings、document、textLayer、ui
    history.js        四角與文字層的復原／重做（higher-order reducer）
    thunks.js         圖片解碼、透視校正、文字辨識、下載 PDF
  lib/                幾何（邊緣偵測、homography、校正）、OCR、PDF、圖片快取
  assets/             glyphless.ttf（Tesseract 的無字形字型，用於看不見的文字層）
  sw-template.js      Service Worker；建置時填入快取清單
```

Tesseract.js 在執行時才依網址載入 worker、WASM 核心和語言資料，無法打包進 bundle。
建置時由 `vite-plugin-static-copy` 從 `node_modules` 複製到 `vendor/tesseract/`（開發模式下直接提供）；
git 裡不放任何第三方檔案，升級只要 `npm update`。

```sh
npm install
npm run dev          # http://localhost:5173
npm run build        # 輸出到 dist/
npm run test:unit    # Vitest：reducer、復原／重做、幾何、文字整理
npm run test:e2e     # 建置後在系統的 Edge/Chrome 跑完整流程（puppeteer-core）；必要時設定 BROWSER=/路徑
npm run test:offline # 建置後測試預設語言與離線文字辨識
```

### 新增 README 翻譯

新增 `README.<語言>.md`（例如 `README.ja.md`），並在每份 README 開頭的語言列加上連結。

## 部署

推送到 `main` 後，`.github/workflows/deploy.yml` 會執行單元測試、建置，並把 `dist/` 發佈到 GitHub Pages。
請在 repo 設定中把 **Settings → Pages → Source** 設為 **GitHub Actions**。

## 授權

[MIT](LICENSE) © 2026 Tim Kuo。第三方元件依其各自的授權（見下方）。

## 第三方元件

- [Tesseract.js](https://github.com/naptha/tesseract.js) 與 tesseract.js-core — Apache-2.0
- [Tesseract](https://github.com/tesseract-ocr/tesseract) 語言資料（`chi_tra`、`eng`，best_int）與 `glyphless.ttf`（Tesseract 的 `pdf.ttf`，見[授權](src/assets/glyphless.ttf.LICENSE)）— Apache-2.0
- [pdf-lib](https://github.com/Hopding/pdf-lib) — MIT
- [React](https://react.dev)、[Redux Toolkit](https://redux-toolkit.js.org)、[Vite](https://vite.dev) — MIT
