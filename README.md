# scan2pdf

**English** | [繁體中文](README.zh-TW.md)

Photos → straightened, multi-page A4 PDF with a searchable text layer. Runs entirely in the browser: no upload, no server, works offline after the first visit.

## Features

- **Multiple pages**: pick several photos at once (or add more later), reorder them by drag and drop or with ◀ ▶, and remove pages. The page list is the main screen; open a page to edit it.
- **Per-page editing**: corners, then text, one screen at a time. Going back and forward without changes keeps the recognized text and your edits.
- **Multi-page PDF** in the order of the list, available once every page has been processed (opened and straightened).
- **Edge detection and perspective correction** to A4 (portrait/landscape, 150/200/300 dpi); drag the corners to adjust.
- **Text recognition** with Tesseract (Traditional Chinese + English), run automatically when a new page reaches the text step. The text is an invisible layer: the PDF looks exactly like the photo but is searchable and copyable.
- **Edit and add text**: fix recognition mistakes, and drag a box on the page to add text that cannot be recognized (signatures, seals).
- **Move and resize boxes** with the handles of the selected box.
- **Undo / redo** while adjusting the corners and while editing the text layer, with separate histories: ↶ ↷ in each step, or Ctrl/⌘+Z, Ctrl/⌘+Shift+Z, Ctrl+Y.
- **Offline and installable** (service worker, web app manifest).
- **UI in English and Traditional Chinese**, defaulting to the browser language.

## Privacy

Images are processed in memory in your browser and never sent anywhere. The site only serves static files.

## Limits

- Text recognition cannot read handwriting, signatures or seal script; add those by hand. Bold or decorative fonts and text on busy backgrounds may be missed.
- Automatic edge detection expects a light page on a darker or more colourful background; otherwise drag the corners.
- The first visit downloads about 17 MB (recognition engine and language data).

## Development

Built with **React**, **Redux Toolkit** (react-redux) and **Vite**.

```
src/
  main.jsx            store + <Provider>, language persistence, service worker registration
  App.jsx             page list or page editor, keyboard shortcuts
  components/         PageList (+ PDF export), CornerStep, TextStep (page editor + text list), PageHeading, UndoRedo
  store/
    slices.js         settings, ui, and the single-page document / textLayer slices
    pages.js          page list (order, open page) and routing of page actions to one page
    history.js        per-page undo/redo for the corners and the text layer (higher-order reducer)
    thunks.js         image decoding, perspective warp, text recognition, PDF download
  lib/                geometry (edge detection, homography, warp), OCR, PDF, image cache
  assets/             glyphless.ttf (Tesseract's blank-glyph font for the invisible text layer)
  sw-template.js      service worker; the build fills in the precache list
```

Tesseract.js loads its worker, WASM core and language data by URL at runtime, so they cannot be bundled.
`vite-plugin-static-copy` copies them from `node_modules` to `vendor/tesseract/` in the build (and serves them in dev);
nothing third-party is committed, and upgrading is just `npm update`.

```sh
npm install
npm run dev          # http://localhost:5173
npm run build        # dist/
npm run test:unit    # Vitest: reducers, pages, undo/redo, geometry, text cleanup
npm run test:e2e     # build, then a 2-page flow in system Edge/Chrome (puppeteer-core); BROWSER=/path if needed
npm run test:offline # build, then language default + offline text recognition
```

### Adding a README translation

Add `README.<language>.md` (for example `README.ja.md`) and add a link to it in the language line at the top of every README.

## Deployment

Push to `main`: `.github/workflows/deploy.yml` runs the unit tests, builds and publishes `dist/` to GitHub Pages.
In the repository settings, set **Settings → Pages → Source** to **GitHub Actions**.

## License

[MIT](LICENSE) © 2026 Tim Kuo. Third-party components keep their own licences (below).

## Third-party components

- [Tesseract.js](https://github.com/naptha/tesseract.js) and tesseract.js-core — Apache-2.0
- [Tesseract](https://github.com/tesseract-ocr/tesseract) language data (`chi_tra`, `eng`, best_int) and `glyphless.ttf` (Tesseract's `pdf.ttf`, see [its licence](src/assets/glyphless.ttf.LICENSE)) — Apache-2.0
- [pdf-lib](https://github.com/Hopding/pdf-lib) — MIT
- [React](https://react.dev), [Redux Toolkit](https://redux-toolkit.js.org), [Vite](https://vite.dev) — MIT
