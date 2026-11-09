import { useSelector, useT } from '../hooks.js';
import { selectActiveNumber, selectActivePage, selectPageCount } from '../store/pages.js';

/** "Page 2 of 5 · photo name" above the editor steps. */
export default function PageHeading() {
  const t = useT();
  const n = useSelector(selectActiveNumber);
  const total = useSelector(selectPageCount);
  const name = useSelector((s) => selectActivePage(s)?.document.photo.name);
  return <p className="page-heading"><strong>{t('pageOfTotal', n, total)}</strong> · {name}</p>;
}
