import { useEffect } from 'react';
import { useDispatch, useSelector, useT } from './hooks.js';
import { langSet } from './store/slices.js';
import { undoInView } from './store/thunks.js';
import PageList from './components/PageList.jsx';
import CornerStep from './components/CornerStep.jsx';
import TextStep from './components/TextStep.jsx';

/** Two views: the page list (with PDF export), or the editor for one page (corners, then text). */
export default function App() {
  const t = useT();
  const dispatch = useDispatch();
  const lang = useSelector((s) => s.settings.lang);
  const status = useSelector((s) => s.ui.status);
  const view = useSelector((s) => s.ui.view);

  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [view]);

  // Ctrl/Cmd+Z = undo, Ctrl/Cmd+Shift+Z or Ctrl+Y = redo, in the editor's current context (corners or text).
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); dispatch(undoInView(false)); }
      else if ((k === 'z' && e.shiftKey) || (k === 'y' && !e.metaKey)) { e.preventDefault(); dispatch(undoInView(true)); }
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
        {view === 'pages' && <PageList />}
        {view === 'corners' && <CornerStep />}
        {view === 'text' && <TextStep />}
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
