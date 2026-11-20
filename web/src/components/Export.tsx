// "Export" — an Excel or CSV file of a list or a report, made by the server
// (POST /exports): it needs the data.export permission, leaves out fields closed
// to the person's role and writes every export to the activity log. Without the
// permission there is no button and no menu item, so the screen never asks.
import { useState } from 'react';
import { ApiFailure } from '../lib/api';
import { exportFile, type ExportFormat, type ExportRequest } from '../lib/export';
import { formatNumber } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { useStore } from '../lib/store';
import { Icon } from './icons';
import type { MenuItem } from './Menus';

export type ExportKind = ExportFormat;
/** The request, or a way to make it at the moment of the click (the filter as it is then). */
type Ask = ExportRequest | (() => ExportRequest);

/**
 * `run(ask, kind)`: the server makes the file; it is saved, and the toast says how many rows.
 * `items(ask)`: Export's two choices for a "More" menu (a phone header), none without the permission.
 */
export function useExport() {
  const { t, locale } = useI18n();
  const { toast, can } = useStore();
  const [busy, setBusy] = useState(false);
  const allowed = can('data.export');
  const run = async (ask: Ask, kind: ExportKind) => {
    setBusy(true);
    try {
      const { rows } = await exportFile(typeof ask === 'function' ? ask() : ask, kind, locale);
      toast(t('export.done', { n: formatNumber(rows, locale) }));
    } catch (e) {
      toast(e instanceof ApiFailure && e.body.message ? e.body.message : t('errors.server'), 'error');
    } finally {
      setBusy(false);
    }
  };
  const items = (ask: Ask, on = true): MenuItem[] =>
    !allowed || !on
      ? []
      : (['xlsx', 'csv'] as const).map((kind) => ({ key: `export-${kind}`, label: `${t('export.button')} · ${t(`export.${kind}` as const)}`, icon: 'download' as const, onSelect: () => void run(ask, kind) }));
  return { run, busy, allowed, items };
}

/** The export menu (xlsx or csv) for a list, sending its current filters. */
export function ExportMenu({ ask, disabled, quiet }: { ask: Ask; disabled?: boolean; quiet?: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const { run, busy, allowed } = useExport();
  if (!allowed) return null;
  const pick = (kind: ExportKind) => {
    setOpen(false);
    void run(ask, kind);
  };
  return (
    <div className="menu-wrap">
      <button className={quiet ? 'btn btn--quiet' : 'btn'} aria-haspopup="menu" aria-expanded={open} aria-busy={busy || undefined} disabled={disabled || busy} onClick={() => setOpen(!open)}>
        <Icon name="download" size={16} />
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
