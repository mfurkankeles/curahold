// "Export" — an Excel or CSV file of what is on screen, made in the browser.
// Nothing the person may not see can be in it: the rows come from the same answers
// the screen shows (field permissions are applied there, tests/field-outs.test.ts).
// Every export is written to the company's activity log (POST /exports).
import { useState } from 'react';
import { download, type Table } from '../lib/export';
import { post } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useStore } from '../lib/store';
import { formatNumber } from '../lib/format';
import { Icon } from './icons';

export type ExportKind = 'xlsx' | 'csv';

/** `run(make, kind)`: makes the file, downloads it, says how many rows, and logs it. */
export function useExport(source: string) {
  const { t, locale } = useI18n();
  const { toast } = useStore();
  const [busy, setBusy] = useState(false);
  const run = async (make: () => Table | Promise<Table>, kind: ExportKind) => {
    setBusy(true);
    try {
      const table = await make();
      download(table, kind, locale);
      toast(t('export.done', { n: formatNumber(table.rows.length, locale) }));
      // The log is kept by the server; a file already in hand is not taken back if it fails.
      void post('/exports', { source, name: table.name.slice(0, 120), rows: table.rows.length, format: kind }).catch(() => undefined);
    } catch {
      toast(t('errors.server'), 'error');
    } finally {
      setBusy(false);
    }
  };
  return { run, busy };
}

export function ExportMenu({ make, disabled, source = 'list', quiet }: { make: () => Table | Promise<Table>; disabled?: boolean; source?: string; quiet?: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const { run, busy } = useExport(source);
  const { can } = useStore();
  // Exporting is a permission of its own (data.export): without it there is no button, and nothing is asked.
  if (!can('data.export')) return null;
  const pick = (kind: ExportKind) => {
    setOpen(false);
    void run(make, kind);
  };
  return (
    <div className="menu-wrap">
      <button className={quiet ? 'btn btn--quiet' : 'btn'} aria-haspopup="menu" aria-expanded={open} disabled={disabled || busy} onClick={() => setOpen(!open)}>
        {quiet && <Icon name="download" size={16} />}
        {t('export.button')}
      </button>
      {open && (
        <div className="menu" role="menu" onMouseLeave={() => setOpen(false)}>
          <button role="menuitem" className="menu__item" onClick={() => pick('xlsx')}>
            {t('export.xlsx')}
          </button>
          <button role="menuitem" className="menu__item" onClick={() => pick('csv')}>
            {t('export.csv')}
          </button>
        </div>
      )}
    </div>
  );
}
