import { useRef } from 'react';
import { svgPoint, useDispatch, usePage, useSelector, useT } from '../hooks.js';
import { cornerDragEnded, cornerDragStarted, cornerMoved, dpiSet, enhanceSet, orientationSet, viewSet } from '../store/slices.js';
import PageHeading from './PageHeading.jsx';
import UndoRedo from './UndoRedo.jsx';
import { autoDetect, nextFromCorners, selectWholeImage } from '../store/thunks.js';

export default function CornerStep() {
  const t = useT();
  const dispatch = useDispatch();
  const photo = usePage((p) => p.document.photo);
  const quad = usePage((p) => p.document.quad);
  const dragging = usePage((p) => p.document.draggingCorner);
  const detectFailed = usePage((p) => p.document.detectFailed);
  const settings = useSelector((s) => s.settings);
  const busy = useSelector((s) => s.ui.busy);
  const svgRef = useRef(null);

  if (!photo || !quad) return null;
  const r = Math.max(photo.w, photo.h) * 0.02;

  const onDown = (e) => {
    if (e.target.dataset.i === undefined) return;
    svgRef.current.setPointerCapture(e.pointerId);
    dispatch(cornerDragStarted(Number(e.target.dataset.i)));
    e.preventDefault();
  };
  const onMove = (e) => {
    if (dragging === null) return;
    const p = svgPoint(svgRef.current, e);
    dispatch(cornerMoved({ x: p.x, y: p.y }));
  };
  const onUp = () => dispatch(cornerDragEnded());

  return (
    <section id="s2">
      <h2>{t('cornersTitle')}</h2>
      <PageHeading />
      <p className="hint">{t('cornersHint')}</p>
      {detectFailed && <p className="hint warn">{t('detectFailed')}</p>}
      <div className="stage corner-stage">
        <img src={photo.url} alt="" draggable={false} />
        <svg ref={svgRef} viewBox={`0 0 ${photo.w} ${photo.h}`} onPointerDown={onDown} onPointerMove={onMove}
          onPointerUp={onUp} onPointerCancel={onUp}>
          <polygon className="quad" points={quad.map((p) => `${p.x},${p.y}`).join(' ')} vectorEffect="non-scaling-stroke" strokeWidth="2" />
          {quad.map((p, i) => (
            <circle key={i} className="handle" data-i={i} cx={p.x} cy={p.y} r={r} vectorEffect="non-scaling-stroke" strokeWidth="2" />
          ))}
        </svg>
      </div>
      <div className="controls">
        <UndoRedo scope="corners" />
        <button type="button" className="ghost" disabled={busy} onClick={() => dispatch(autoDetect())}>{t('autoDetect')}</button>
        <button type="button" className="ghost" disabled={busy} onClick={() => dispatch(selectWholeImage())}>{t('fullImage')}</button>
        <label>{t('orientation')}
          <select value={settings.orientation} onChange={(e) => dispatch(orientationSet(e.target.value))}>
            <option value="auto">{t('orientAuto')}</option>
            <option value="portrait">{t('orientPortrait')}</option>
            <option value="landscape">{t('orientLandscape')}</option>
          </select>
        </label>
        <label>{t('resolution')}
          <select value={settings.dpi} onChange={(e) => dispatch(dpiSet(Number(e.target.value)))}>
            {[150, 200, 300].map((d) => <option key={d} value={d}>{d} dpi</option>)}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={settings.enhance} onChange={(e) => dispatch(enhanceSet(e.target.checked))} /> {t('enhance')}
        </label>
      </div>
      <div className="nav">
        <button type="button" className="ghost" disabled={busy} onClick={() => dispatch(viewSet('pages'))}>{t('backToPages')}</button>
        <button id="warpBtn" type="button" className="primary" disabled={busy} onClick={() => dispatch(nextFromCorners())}>{t('nextStraighten')}</button>
      </div>
    </section>
  );
}
