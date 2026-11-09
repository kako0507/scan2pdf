import { useDispatch, useSelector, useT } from '../hooks.js';
import { dragOverSet, fileNameSet, reorderOver, reorderStarted } from '../store/slices.js';
import { pageMoved, selectPendingCount } from '../store/pages.js';
import { addPhotos, exportPdf, finishReorder, openPage, removePage } from '../store/thunks.js';

const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');

function PageCard({ id, index, count }) {
  const t = useT();
  const dispatch = useDispatch();
  const page = useSelector((s) => s.pages.byId[id]);
  const reorder = useSelector((s) => s.ui.reorder);
  const busy = useSelector((s) => s.ui.busy);
  const { photo, page: straightened } = page.document;
  const texts = page.textLayer.items.filter((i) => i.text.trim()).length;
  const dragging = reorder?.dragId === id;
  const over = reorder && reorder.overId === id && !dragging;

  return (
    <li
      className={`page-card ${straightened ? '' : 'pending'} ${dragging ? 'dragging' : ''} ${over ? 'over' : ''}`}
      draggable={!busy}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(id)); dispatch(reorderStarted(id)); }}
      onDragOver={(e) => { if (!reorder) return; e.preventDefault(); if (reorder.overId !== id) dispatch(reorderOver(id)); }}
      onDrop={(e) => { if (!reorder) return; e.preventDefault(); e.stopPropagation(); dispatch(finishReorder()); }}
      onDragEnd={() => dispatch(finishReorder())}
    >
      <button type="button" className="thumb" disabled={busy} onClick={() => dispatch(openPage(id))} title={t('pageN', index + 1)}>
        <img src={straightened?.url ?? photo.url} alt="" draggable={false} />
      </button>
      <div className="page-meta">
        <strong>{t('pageN', index + 1)}</strong>
        <span className="name" title={photo.name}>{photo.name}</span>
        <span className={`badge ${straightened ? 'ok' : ''}`}>{straightened ? t('badgeDone', texts) : t('badgeNew')}</span>
      </div>
      <div className="page-actions">
        <button type="button" className="ghost icon" disabled={busy || index === 0} title={t('moveEarlier')} aria-label={t('moveEarlier')}
          onClick={() => dispatch(pageMoved({ id, toIndex: index - 1 }))}>◀</button>
        <button type="button" className="ghost icon" disabled={busy || index === count - 1} title={t('moveLater')} aria-label={t('moveLater')}
          onClick={() => dispatch(pageMoved({ id, toIndex: index + 1 }))}>▶</button>
        <button type="button" className="ghost icon remove" disabled={busy} title={t('removePage')} aria-label={t('removePage')}
          onClick={() => dispatch(removePage(id))}>✕</button>
      </div>
    </li>
  );
}

/** Export: file name and download, enabled once every page has been processed. */
function SavePanel() {
  const t = useT();
  const dispatch = useDispatch();
  const count = useSelector((s) => s.pages.order.length);
  const pending = useSelector(selectPendingCount);
  const { busy, fileName } = useSelector((s) => s.ui);
  return (
    <div className="save-panel" id="save">
      <h3>{t('saveTitle')}</h3>
      <p className={`hint ${pending ? 'warn' : ''}`}>{pending ? t('pendingPages', pending) : t('pagesCount', count)}</p>
      <div className="controls">
        <label>{t('fileName')}
          <input type="text" value={fileName} onChange={(e) => dispatch(fileNameSet(e.target.value))} />
          <span className="suffix">.pdf</span>
        </label>
        <button id="pdfBtn" type="button" className="primary" disabled={busy || pending > 0} onClick={() => dispatch(exportPdf())}>
          {t('download')}
        </button>
      </div>
    </div>
  );
}

export default function PageList() {
  const t = useT();
  const dispatch = useDispatch();
  const order = useSelector((s) => s.pages.order);
  const over = useSelector((s) => s.ui.dragOver);
  const setOver = (v) => { if (v !== over) dispatch(dragOverSet(v)); };

  // Dropping files anywhere on the list adds them as pages (card drags are handled by the cards).
  const fileDrop = {
    onDragEnter: (e) => { if (hasFiles(e)) { e.preventDefault(); setOver(true); } },
    onDragOver: (e) => { if (hasFiles(e)) { e.preventDefault(); setOver(true); } },
    onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(false); },
    onDrop: (e) => { if (!hasFiles(e)) return; e.preventDefault(); setOver(false); dispatch(addPhotos([...e.dataTransfer.files])); },
  };
  // Copy the FileList before resetting the input: it empties when the value is cleared.
  const picker = (
    <input id="file" type="file" accept="image/*" multiple hidden
      onChange={(e) => { dispatch(addPhotos([...e.target.files])); e.target.value = ''; }} />
  );

  return (
    <section id="s1" className={over ? 'file-over' : ''} {...fileDrop}>
      <h2>{t('pagesTitle')}</h2>
      {order.length === 0 ? (
        <label className={`drop ${over ? 'over' : ''}`}>
          {picker}
          <span>{t('drop')}</span>
        </label>
      ) : (
        <>
          <p className="hint">{t('pagesHint')}</p>
          <ol className="page-grid">
            {order.map((id, i) => <PageCard key={id} id={id} index={i} count={order.length} />)}
            <li className="page-add">
              <label className={`drop small ${over ? 'over' : ''}`}>
                {picker}
                <span>{t('addPhotos')}</span>
              </label>
            </li>
          </ol>
          <SavePanel />
        </>
      )}
    </section>
  );
}
