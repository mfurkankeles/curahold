// The bulk bars of the customer list (cards and table) and the records lists share
// the tasks' rule: at most 500 things per change, "select all that match" up to that,
// and every change offered back with Undo (useServerUndo).
import { useI18n } from '../lib/i18n';
import '../surfaces/exports-views.css';

/** The most one change takes (the server refuses more: routes/accounts.ts, routes/records.ts). */
export const BULK_MAX = 500;

/** "Select all N that match" — or the first 500 of them — once some are picked. */
export function SelectMatching({ picked, matching, onPick }: { picked: number; matching: number; onPick: () => void }) {
  const { t } = useI18n();
  if (matching <= picked || picked >= BULK_MAX) return null;
  return (
    <button type="button" className="linkbtn" onClick={onPick}>
      {matching > BULK_MAX ? t('bulk.selectFirstN', { n: BULK_MAX, total: matching }) : t('bulk.selectAllN', { n: matching })}
    </button>
  );
}
