import { useEffect } from 'react';
import { useDispatch, useSelector, useT } from './hooks.js';
import { fileNameSet, langSet, stepSet } from './store/slices.js';
import { exportPdf, undoInStep } from './store/thunks.js';
import PhotoStep from './components/PhotoStep.jsx';
import CornerStep from './components/CornerStep.jsx';
import TextStep from './components/TextStep.jsx';

const STEPS = [['photo', 'stepPhoto'], ['corners', 'stepCorners'], ['text', 'stepText'], ['save', 'stepSave']];

/** Progress indicator; finished steps can be revisited. */
function Stepper() {
  const t = useT();
  const dispatch = useDispatch();
  const step = useSelector((s) => s.ui.step);
  const busy = useSelector((s) => s.ui.busy);
  const hasPhoto = useSelector((s) => s.document.photo !== null);
  const hasPage = useSelector((s) => s.document.page !== null);
  const reachable = { photo: true, corners: hasPhoto, text: hasPage, save: hasPage };
  const current = STEPS.findIndex(([k]) => k === step);
  return (
    <ol className="stepper">
      {STEPS.map(([key, label], i) => (
        <li key={key} className={`${i === current ? 'current' : ''} ${i < current ? 'done' : ''}`}>
          <button type="button" disabled={busy || i === current || !reachable[key]} onClick={() => dispatch(stepSet(key))}>
            <span className="num">{i + 1}</span> {t(label)}
          </button>
        </li>
      ))}
    </ol>
  );
}

function SaveStep() {
  const t = useT();
  const dispatch = useDispatch();
  const page = useSelector((s) => s.document.page);
  const count = useSelector((s) => s.textLayer.items.filter((i) => i.text.trim()).length);
  const { busy, fileName } = useSelector((s) => s.ui);
  return (
    <section id="s4">
      <h2>{t('step4')}</h2>
      <div className="save">
        <img className="preview" src={page.url} alt="" />
        <div>
          <p className="hint">{t('textCount', count)}</p>
          <div className="controls">
            <label>{t('fileName')}
              <input type="text" value={fileName} onChange={(e) => dispatch(fileNameSet(e.target.value))} />
              <span className="suffix">.pdf</span>
            </label>
          </div>
          <button id="pdfBtn" type="button" className="primary" disabled={busy} onClick={() => dispatch(exportPdf())}>{t('download')}</button>
        </div>
      </div>
      <div className="nav">
        <button type="button" className="ghost" disabled={busy} onClick={() => dispatch(stepSet('text'))}>{t('back')}</button>
      </div>
    </section>
  );
}

export default function App() {
  const t = useT();
  const dispatch = useDispatch();
  const lang = useSelector((s) => s.settings.lang);
  const status = useSelector((s) => s.ui.status);
  const step = useSelector((s) => s.ui.step);

  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [step]);

  // Ctrl/Cmd+Z = undo, Ctrl/Cmd+Shift+Z or Ctrl+Y = redo, in the current step's context (corners or text).
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); dispatch(undoInStep(false)); }
      else if ((k === 'z' && e.shiftKey) || (k === 'y' && !e.metaKey)) { e.preventDefault(); dispatch(undoInStep(true)); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch]);

  return (
    <>
      <header>
        <div className="brand">
          <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width="28" height="28" />
          <h1>scan2pdf</h1>
        </div>
        <button id="langBtn" type="button" className="ghost" onClick={() => dispatch(langSet(lang === 'en' ? 'zh-Hant' : 'en'))}>
          {t('langToggle')}
        </button>
      </header>
      <p className="tagline">{t('tagline')}</p>
      <main>
        <Stepper />
        {step === 'photo' && <PhotoStep />}
        {step === 'corners' && <CornerStep />}
        {step === 'text' && <TextStep />}
        {step === 'save' && <SaveStep />}
        <p id="status" className="status" role="status" aria-live="polite">{status ? t(status.key, ...status.args) : ''}</p>
      </main>
      <footer>
        <a href="https://github.com/tesseract-ocr/tesseract">Tesseract</a> ·{' '}
        <a href="https://github.com/naptha/tesseract.js">Tesseract.js</a> ·{' '}
        <a href="https://github.com/Hopding/pdf-lib">pdf-lib</a>
      </footer>
    </>
  );
}
