import { useEffect, useRef } from 'react';
import { svgPoint, useDispatch, useSelector, useT } from '../hooks.js';
import {
  boxDragEnded, boxDragMoved, boxDragStarted, draftCancelled, draftCommitted, draftMoved, draftStarted,
  itemRemoved, itemSelected, itemTextChanged, ocrLangToggled, stepSet,
} from '../store/slices.js';
import UndoRedo from './UndoRedo.jsx';
import { runOcr } from '../store/thunks.js';

const kind = (it) => (it.added ? 'added' : it.conf < 70 ? 'low' : '');

// Resize handles: [mode, x fraction, y fraction]
const HANDLES = [['nw', 0, 0], ['n', 0.5, 0], ['ne', 1, 0], ['e', 1, 0.5], ['se', 1, 1], ['s', 0.5, 1], ['sw', 0, 1], ['w', 0, 0.5]];

function Handles({ item, size }) {
  const w = item.x1 - item.x0, h = item.y1 - item.y0;
  return HANDLES.map(([mode, fx, fy]) => (
    <rect key={mode} className={`rh rh-${mode}`} data-id={item.id} data-mode={mode}
      x={item.x0 + w * fx - size / 2} y={item.y0 + h * fy - size / 2} width={size} height={size}
      vectorEffect="non-scaling-stroke" strokeWidth="1.5" />
  ));
}

function PageEditor() {
  const dispatch = useDispatch();
  const page = useSelector((s) => s.document.page);
  const { items, selectedId, draft, boxDrag } = useSelector((s) => s.textLayer);
  const svgRef = useRef(null);
  const minSide = page.w / 150;
  const selected = items.find((i) => i.id === selectedId);

  const onDown = (e) => {
    const p = svgPoint(svgRef.current, e);
    const { id, mode } = e.target.dataset;
    if (id) {
      // Handles resize; the selected box moves; any other box is just selected.
      if (mode || Number(id) === selectedId) {
        svgRef.current.setPointerCapture(e.pointerId);
        dispatch(boxDragStarted({ id: Number(id), mode: mode || 'move', x: p.x, y: p.y }));
        e.preventDefault();
      } else {
        dispatch(itemSelected(Number(id)));
      }
      return;
    }
    svgRef.current.setPointerCapture(e.pointerId);
    dispatch(draftStarted({ x: p.x, y: p.y }));
    e.preventDefault();
  };
  const onMove = (e) => {
    if (!draft && !boxDrag) return;
    const p = svgPoint(svgRef.current, e);
    if (boxDrag) dispatch(boxDragMoved({ x: p.x, y: p.y, w: page.w, h: page.h, minSide }));
    else dispatch(draftMoved({ x: p.x, y: p.y }));
  };
  const onUp = (e) => {
    if (boxDrag) { dispatch(boxDragEnded()); return; }
    if (!draft) return;
    if (e.type === 'pointercancel') { dispatch(draftCancelled()); return; }
    dispatch(draftCommitted({ minSide, w: page.w, h: page.h }));
  };

  return (
    <div className="stage">
      <img src={page.url} alt="" draggable={false} />
      <svg id="pageSvg" ref={svgRef} viewBox={`0 0 ${page.w} ${page.h}`} onPointerDown={onDown} onPointerMove={onMove}
        onPointerUp={onUp} onPointerCancel={onUp}>
        {items.map((it) => (
          <rect key={it.id} data-id={it.id} className={`box ${kind(it)} ${it.id === selectedId ? 'sel' : ''}`}
            x={it.x0} y={it.y0} width={it.x1 - it.x0} height={it.y1 - it.y0} vectorEffect="non-scaling-stroke" strokeWidth="2" />
        ))}
        {selected && <Handles item={selected} size={page.w / 90} />}
        {draft && (
          <rect className="drawing" x={Math.min(draft.x0, draft.x1)} y={Math.min(draft.y0, draft.y1)}
            width={Math.abs(draft.x1 - draft.x0)} height={Math.abs(draft.y1 - draft.y0)} vectorEffect="non-scaling-stroke" strokeWidth="2" />
        )}
      </svg>
    </div>
  );
}

function ItemRow({ item, selected }) {
  const t = useT();
  const dispatch = useDispatch();
  const liRef = useRef(null);
  const taRef = useRef(null);

  useEffect(() => {
    if (!selected) return;
    liRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    if (document.activeElement !== taRef.current) taRef.current?.focus({ preventScroll: true });
  }, [selected]);

  return (
    <li ref={liRef} className={`${kind(item)} ${selected ? 'sel' : ''}`}>
      <span className="meta">
        {item.added ? t('added') : `${t('recognizedConf', item.conf)}${item.conf < 70 ? ` · ${t('lowConf')}` : ''}`}
      </span>
      <button type="button" onClick={() => dispatch(itemRemoved(item.id))}>{t('remove')}</button>
      <textarea ref={taRef} rows={1} value={item.text} placeholder={t('textPlaceholder')}
        onChange={(e) => dispatch(itemTextChanged({ id: item.id, text: e.target.value }))}
        onFocus={() => { if (!selected) dispatch(itemSelected(item.id)); }} />
    </li>
  );
}

function ItemList() {
  const t = useT();
  const { items, selectedId } = useSelector((s) => s.textLayer);
  return (
    <ol id="items" className="items">
      {items.length === 0 && <li className="empty">{t('noItems')}</li>}
      {items.map((it) => <ItemRow key={it.id} item={it} selected={it.id === selectedId} />)}
    </ol>
  );
}

export default function TextStep() {
  const t = useT();
  const dispatch = useDispatch();
  const page = useSelector((s) => s.document.page);
  const ocrLangs = useSelector((s) => s.settings.ocrLangs);
  const ocrDone = useSelector((s) => s.textLayer.ocrDone);
  const { busy, ocrProgress } = useSelector((s) => s.ui);
  if (!page) return null;

  return (
    <section id="s3">
      <h2>{t('step3')}</h2>
      <div className="controls">
        <span>{t('ocrLangs')}</span>
        {[['chi_tra', 'langChiTra'], ['eng', 'langEng']].map(([code, key]) => (
          <label key={code} className="check">
            <input type="checkbox" checked={ocrLangs.includes(code)} onChange={() => dispatch(ocrLangToggled(code))} /> {t(key)}
          </label>
        ))}
        <button id="ocrBtn" type="button" className="primary" disabled={busy || !ocrLangs.length} onClick={() => dispatch(runOcr())}>
          {t(ocrDone ? 'rerunOcr' : 'runOcr')}
        </button>
        <UndoRedo scope="text" />
      </div>
      {ocrProgress !== null && <progress max="1" value={ocrProgress} />}
      <p className="hint">{t('ocrHint')}</p>
      <div className="editor">
        <PageEditor />
        <ItemList />
      </div>
      <div className="nav">
        <button type="button" className="ghost" disabled={busy} onClick={() => dispatch(stepSet('corners'))}>{t('back')}</button>
        <button id="nextBtn" type="button" className="primary" disabled={busy} onClick={() => dispatch(stepSet('save'))}>{t('next')}</button>
      </div>
    </section>
  );
}
