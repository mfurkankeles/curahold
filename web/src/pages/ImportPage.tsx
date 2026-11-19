// Bring your work over: one page for moving in from another tool. Drop any
// file on it and it tells customers from tasks by the file's headings; or
// pick what to bring. In the demo the whole thing runs in the visitor's tab,
// so their own file can be tried before their trial is approved — and it
// never leaves their device.
import { useEffect, useState } from 'react';
import { Importer } from '../components/Importer';
import { Icon, PageIcon, type IconName } from '../components/icons';
import { TaskImporter } from '../components/TaskImporter';
import { Dialog } from '../components/ui';
import { guessImportMapping, shapeMatrix } from '../../../shared/src/importPlan';
import { useI18n } from '../lib/i18n';
import type { MessageKey } from '../../../shared/src/i18n';
import { navigate } from '../lib/router';
import { readMatrix } from '../lib/sheet';
import { useStore } from '../lib/store';
import '../surfaces/adopt.css';

const DEMO = !!import.meta.env.APP_DEMO;
type Open = { kind: 'tasks' | 'customers'; file: File | null } | null;

/** Tasks when the headings say status, people or dates; customers when they say value, renewal or owner. */
export async function kindOf(file: File): Promise<'tasks' | 'customers'> {
  if (/\.json$/i.test(file.name)) return 'tasks';
  const s = shapeMatrix(await readMatrix(file));
  const m = new Set<string>(Object.values(guessImportMapping(s.headers)));
  const taskish = ['status', 'assignee', 'dueDate', 'startDate', 'parent', 'list', 'points', 'dependsOn', 'priority'].filter((f) => m.has(f)).length;
  const customerish = s.headers.filter((h) => /\b(arr|mrr|revenue|renewal|contract|industry|segment|tier|website|domain|gelir|yenileme|sözleşme|sektör|segment|web sitesi)\b/i.test(h)).length;
  return customerish > taskish ? 'customers' : 'tasks';
}

export function ImportPage() {
  const { t } = useI18n();
  const { can, reloadBoards } = useStore();
  const [open, setOpen] = useState<Open>(null);
  const [dragging, setDragging] = useState(false);
  const canCustomers = can('accounts.manage') && can('accounts.view_all');
  const drop = async (file: File | undefined | null) => {
    setDragging(false);
    if (!file) return;
    const kind = canCustomers ? await kindOf(file).catch(() => 'tasks' as const) : 'tasks';
    setOpen({ kind, file });
  };
  // Keyboard: T for tasks, C for customers, anywhere on the page.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (open || e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement)?.closest?.('input, textarea, select, [contenteditable]')) return;
      if (e.key === 't') setOpen({ kind: 'tasks', file: null });
      if (e.key === 'c' && canCustomers) setOpen({ kind: 'customers', file: null });
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [open, canCustomers]);

  const card = (kind: 'tasks' | 'customers' | 'connect', icon: IconName, key: string, go: () => void) => (
    <button type="button" className="adopt-card" data-tour={`import-${kind}`} onClick={go}>
      <span className="adopt-card__icon">
        <Icon name={icon} size={20} />
      </span>
      <strong>{t(`imp.page.${kind}` as MessageKey)}</strong>
      <p>{t(`imp.page.${kind}Hint` as MessageKey)}</p>
      {key && <kbd>{key}</kbd>}
    </button>
  );

  return (
    <>
      <header className="topbar">
        <div className="topbar__titles topbar__titles--icon">
          <PageIcon name="upload" />
          <h1 className="topbar__title">{t('imp.page.title')}</h1>
          <p className="topbar__sub">{t('imp.page.lead')}</p>
        </div>
      </header>
      <div
        className="page adopt-page"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          void drop(e.dataTransfer.files[0]);
        }}
      >
        <label className="dropzone" data-tour="import-drop" data-over={dragging ? 'true' : undefined}>
          <input type="file" accept=".csv,.xlsx,.json,text/csv,application/json" className="sr-only" onChange={(e) => void drop(e.target.files?.[0])} />
          <strong>{t('imp.page.drop')}</strong>
          <span className="muted">{t('imp.page.dropHint')}</span>
          <span className="btn btn--small" aria-hidden="true">
            {t('import.choose')}
          </span>
        </label>
        <p className="adopt-privacy">{t(DEMO ? 'imp.privacyDemo' : 'imp.privacy')}</p>
        <div className="adopt-start">
          {card('tasks', 'board', 'T', () => setOpen({ kind: 'tasks', file: null }))}
          {canCustomers && card('customers', 'building', 'C', () => setOpen({ kind: 'customers', file: null }))}
          {card('connect', 'plug', '', () => navigate('/settings/connections'))}
        </div>
      </div>
      {open?.kind === 'tasks' && <TaskImporter file={open.file} onClose={() => setOpen(null)} onDone={() => void reloadBoards()} />}
      {open?.kind === 'customers' && (
        <Dialog title={t('imp.page.customers')} onClose={() => setOpen(null)} wide>
          <Importer file={open.file} onImported={() => undefined} />
          <div className="inline-actions u-justify-content-flex-start">
            <button className="btn" onClick={() => navigate('/accounts')}>
              {t('imp.page.seeCustomers')}
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
