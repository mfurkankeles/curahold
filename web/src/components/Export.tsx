// "Export" — an Excel or CSV file of what is on screen, made in the browser.
import { useState } from 'react';
import { download, type Table } from '../lib/export';
import { useI18n } from '../lib/i18n';
import { useStore } from '../lib/store';

export function ExportMenu({ make, disabled }: { make: () => Table | Promise<Table>; disabled?: boolean }) {
  const { t, locale } = useI18n();
  const { toast } = useStore();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = async (kind: 'xlsx' | 'csv') => {
    setOpen(false);
    setBusy(true);
    try {
      const table = await make();
      download(table, kind, locale);
      toast(t('export.done', { n: table.rows.length }));
    } catch {
      toast(t('errors.server'), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="menu-wrap">
      <button className="btn" aria-haspopup="menu" aria-expanded={open} disabled={disabled || busy} onClick={() => setOpen(!open)}>
        {t('export.button')}
      </button>
      {open && (
        <div className="menu" role="menu" onMouseLeave={() => setOpen(false)}>
          <button role="menuitem" className="menu__item" onClick={() => run('xlsx')}>
            {t('export.xlsx')}
          </button>
          <button role="menuitem" className="menu__item" onClick={() => run('csv')}>
            {t('export.csv')}
          </button>
        </div>
      )}
    </div>
  );
}
