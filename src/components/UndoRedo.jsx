import { useDispatch, useSelector, useT } from '../hooks.js';
import { redo, selectCanRedo, selectCanUndo, undo } from '../store/history.js';

const MOD = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';

/** Undo/redo buttons for one editing context ('corners' or 'text'). */
export default function UndoRedo({ scope }) {
  const t = useT();
  const dispatch = useDispatch();
  const canUndo = useSelector(selectCanUndo(scope));
  const canRedo = useSelector(selectCanRedo(scope));
  const busy = useSelector((s) => s.ui.busy);
  return (
    <span className="undo-redo">
      <button type="button" className="ghost icon undo" disabled={!canUndo || busy}
        title={`${t('undo')} (${MOD}Z)`} aria-label={t('undo')} onClick={() => dispatch(undo(scope))}>↶</button>
      <button type="button" className="ghost icon redo" disabled={!canRedo || busy}
        title={`${t('redo')} (${MOD}Shift+Z)`} aria-label={t('redo')} onClick={() => dispatch(redo(scope))}>↷</button>
    </span>
  );
}
