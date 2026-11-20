// Settings → Company: deleting the whole company (api/src/routes/admin.ts,
// api/src/lib/companyDeletion.ts). The administrator types the company's
// address back; the purge happens after the grace period, during which any
// administrator can cancel — so an export is still possible and a mistake is
// not final. Only administrators see it.
import { useEffect, useState } from 'react';
import { del, get, post } from '../lib/api';
import { formatDate } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { useStore } from '../lib/store';
import { Icon } from './icons';

interface View {
  deletion: { id: string; requestedAt: string; purgeAfter: string } | null;
  graceDays: number;
}

/** The "Delete the company" card: ask (with the address typed back) or cancel. */
export function CompanyDeletion({ slug }: { slug: string }) {
  const { t, locale } = useI18n();
  const { toast } = useStore();
  const [view, setView] = useState<View | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void get<View>('/admin/company/deletion').then(setView, () => setView(null));
  }, []);
  if (!view) return null;
  const act = async (fn: () => Promise<View>, done: string) => {
    setBusy(true);
    try {
      setView(await fn());
      setTyped('');
      toast(done);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="sheet" data-test="company-deletion">
      <h3 className="section__head">{t('companyDelete.title')}</h3>
      {view.deletion ? (
        <>
          <p className="notice" role="status">
            {t('companyDelete.scheduled', { date: formatDate(view.deletion.purgeAfter, locale, { day: 'numeric', month: 'long', year: 'numeric' }) })}
          </p>
          <button type="button" className="btn" disabled={busy} onClick={() => void act(() => del<View>('/admin/company/deletion'), t('companyDelete.cancelled'))}>
            <Icon name="close" size={16} />
            {t('companyDelete.cancel')}
          </button>
        </>
      ) : (
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            if (typed.trim().toLowerCase() === slug.toLowerCase()) void act(() => post<View>('/admin/company/deletion', { confirm: typed.trim() }), t('companyDelete.requested'));
          }}
        >
          <p className="field__hint">{t('companyDelete.lead', { days: view.graceDays })}</p>
          <label className="field">
            <span className="field__label">{t('companyDelete.confirm', { slug })}</span>
            <input className="input" value={typed} autoComplete="off" spellCheck={false} onChange={(e) => setTyped(e.target.value)} />
          </label>
          <button type="submit" className="btn btn--danger" disabled={busy || typed.trim().toLowerCase() !== slug.toLowerCase()}>
            <Icon name="trash" size={16} />
            {t('companyDelete.button')}
          </button>
        </form>
      )}
    </section>
  );
}
