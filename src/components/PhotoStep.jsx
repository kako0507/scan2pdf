import { useDispatch, useSelector, useT } from '../hooks.js';
import { dragOverSet, stepSet } from '../store/slices.js';
import { openPhoto } from '../store/thunks.js';

export default function PhotoStep() {
  const t = useT();
  const dispatch = useDispatch();
  const over = useSelector((s) => s.ui.dragOver);
  const hasPhoto = useSelector((s) => s.document.photo !== null);
  const setOver = (v) => { if (v !== over) dispatch(dragOverSet(v)); };

  const open = (file) => { if (file?.type.startsWith('image/')) dispatch(openPhoto(file)); };

  return (
    <section>
      <h2>{t('step1')}</h2>
      <label
        className={`drop ${over ? 'over' : ''}`}
        onDragEnter={(e) => { e.preventDefault(); setOver(true); }}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); open([...e.dataTransfer.files].find((f) => f.type.startsWith('image/'))); }}
      >
        <input id="file" type="file" accept="image/*" hidden onChange={(e) => open(e.target.files[0])} />
        <span>{t('drop')}</span>
      </label>
      {hasPhoto && (
        <div className="nav">
          <span />
          <button type="button" className="primary" onClick={() => dispatch(stepSet('corners'))}>{t('continueEditing')}</button>
        </div>
      )}
    </section>
  );
}
