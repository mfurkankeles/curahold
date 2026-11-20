// The customer's money, read at a glance, under the band at the top of the
// customer page: what is still open, what is overdue and for how long, the last
// payment, and the invoices one tap away — from the connected accounting
// program. Shown only to people whose role has "See finance figures"; nothing
// is drawn (and nothing asked) for anyone else or where no program is connected.
import { useEffect, useId, useState } from 'react';
import type { FinanceSummary } from '../../../shared/src/accounting';
import type { MessageKey } from '../../../shared/src/i18n';
import { get } from '../lib/api';
import { formatDate, formatMoney, formatNumber } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { navigate } from '../lib/router';
import { useStore } from '../lib/store';
import { relativeTime } from '../lib/time';
import { PROVIDER_NAMES } from './Connections';
import { Icon } from './icons';
import './finance.css';

interface FinInvoiceLine {
  id: string;
  number: string | null;
  issuedOn: string | null;
  dueOn: string | null;
  currency: string;
  total: number;
  balance: number;
  status: 'open' | 'paid' | 'void' | 'draft';
  provider: string | null;
  url: string | null;
}
type Finance =
  | { linked: false; sources: { provider: string; label: string }[] }
  | { linked: true; summary: FinanceSummary; invoices: FinInvoiceLine[]; sources: { provider: string; label: string; syncedAt: string | null }[] };

const cache = new Map<string, Finance | null>();

/** On a customer page: the accounting figures (open balance, overdue, last payment). Needs finance.view. */
export function FinanceBand({ accountId, today }: { accountId: string; today: string }) {
  const { t, locale } = useI18n();
  const { can, me } = useStore();
  const allowed = can('finance.view');
  const [data, setData] = useState<Finance | null>(() => cache.get(accountId) ?? null);
  const [open, setOpen] = useState(false);
  const listId = useId();
  useEffect(() => {
    if (!allowed) return;
    let live = true;
    void get<{ finance: Finance | null }>(`/accounts/${accountId}/finance`)
      .then((r) => {
        cache.set(accountId, r.finance);
        if (live) setData(r.finance);
      })
      .catch(() => live && setData(null));
    return () => {
      live = false;
    };
  }, [accountId, allowed]);
  if (!allowed || !data) return null;
  const app = (p: string | null | undefined) => (p ? (PROVIDER_NAMES[p] ?? p) : '');

  if (!data.linked) {
    // Connected, but this customer is not matched to anyone in the program yet.
    return (
      <section className="fin-band fin-band--quiet" aria-label={t('fin.band.title' as MessageKey)}>
        <p className="fin-band__note">
          <Icon name="coins" size={16} className="icon--lead" />
          {t('fin.band.notLinked' as MessageKey, { app: app(data.sources[0]?.provider) })}
          {can('connections.manage') && (
            <>
              {' '}
              <a
                href="/settings/sources"
                onClick={(e) => {
                  e.preventDefault();
                  navigate('/settings/sources');
                }}
              >
                {t('fin.band.review' as MessageKey)}
              </a>
            </>
          )}
        </p>
      </section>
    );
  }

  const s = data.summary;
  const main = s.byCurrency[0];
  const code = main?.currency ?? me.org.currency ?? 'USD';
  const others = s.byCurrency.slice(1);
  const money = (n: number, c = code) => formatMoney(n, c, locale);
  const source = data.sources[0];
  const openCount = s.byCurrency.reduce((n, f) => n + f.openInvoices, 0);
  const late = (main?.overdue ?? 0) > 0;
  return (
    <section className="fin-band" aria-label={t('fin.band.title' as MessageKey)}>
      <div className="fin-band__head">
        <span className="fin-band__title">
          <Icon name="coins" size={16} className="icon--lead" />
          {t('fin.band.title' as MessageKey)}
        </span>
        {source && (
          <span className="muted fin-band__from">
            {t('fin.band.from' as MessageKey, { app: app(source.provider) })}
            {source.syncedAt ? ` · ${t('sync.lastSync', { when: relativeTime(source.syncedAt, t) })}` : ''}
          </span>
        )}
      </div>
      <div className="acc-band__tiles fin-band__tiles">
        <div className="acc-tile">
          <span className="acc-tile__label">{t('fin.band.open' as MessageKey)}</span>
          <span className="acc-tile__value">
            <span className="acc-tile__money num">{money(main?.open ?? 0)}</span>
          </span>
          {others.length > 0 && <span className="acc-tile__sub">{others.map((o) => money(o.open, o.currency)).join(' · ')}</span>}
        </div>
        <div className="acc-tile" data-tone={late ? 'late' : undefined}>
          <span className="acc-tile__label">{t('fin.band.overdue' as MessageKey)}</span>
          <span className="acc-tile__value">
            <span className="acc-tile__money num fin-band__overdue">{money(main?.overdue ?? 0)}</span>
          </span>
          <span className="acc-tile__sub">{s.lateDays > 0 ? t('fin.band.lateDays' as MessageKey, { n: s.overdueInvoices, days: formatNumber(s.lateDays, locale) }) : t('fin.band.nothingLate' as MessageKey)}</span>
        </div>
        <div className="acc-tile">
          <span className="acc-tile__label">{t('fin.band.lastPayment' as MessageKey)}</span>
          <span className="acc-tile__value">
            <span className="acc-tile__state">{s.lastPayment ? formatDate(s.lastPayment.on, locale, { day: 'numeric', month: 'long', year: s.lastPayment.on.slice(0, 4) === today.slice(0, 4) ? undefined : 'numeric' }) : '—'}</span>
          </span>
          <span className="acc-tile__sub">{s.lastPayment ? money(s.lastPayment.amount, s.lastPayment.currency ?? code) : t('fin.band.noPayment' as MessageKey)}</span>
        </div>
        <div className="acc-tile">
          <span className="acc-tile__label">{t('fin.band.invoices' as MessageKey)}</span>
          <span className="acc-tile__value">
            <span className="acc-tile__score num">{formatNumber(openCount, locale)}</span>
            <span className="acc-tile__state">{t('fin.band.openWord' as MessageKey)}</span>
          </span>
          <button type="button" className="linkbtn acc-tile__sub" aria-expanded={open} aria-controls={listId} onClick={() => setOpen((o) => !o)}>
            {open ? t('fin.band.hideInvoices' as MessageKey) : t('fin.band.showInvoices' as MessageKey)}
          </button>
        </div>
      </div>
      {open && (
        <div className="fin-band__list" id={listId}>
          <table className="table fin-invoices">
            <thead>
              <tr>
                <th scope="col">{t('fin.inv.number' as MessageKey)}</th>
                <th scope="col">{t('fin.inv.due' as MessageKey)}</th>
                <th scope="col" className="num">{t('fin.inv.total' as MessageKey)}</th>
                <th scope="col" className="num">{t('fin.inv.left' as MessageKey)}</th>
                <th scope="col">{t('fin.inv.status' as MessageKey)}</th>
              </tr>
            </thead>
            <tbody>
              {data.invoices.map((i) => {
                const overdue = i.status === 'open' && !!i.dueOn && i.dueOn < today;
                return (
                  <tr key={`${i.provider}:${i.id}`} data-late={overdue || undefined}>
                    <td>
                      {i.url ? (
                        <a href={i.url} target="_blank" rel="noreferrer noopener">
                          {i.number ?? i.id}
                          <Icon name="external" size={12} />
                          <span className="sr-only"> ({t('fin.inv.openIn' as MessageKey, { app: app(i.provider) })})</span>
                        </a>
                      ) : (
                        (i.number ?? i.id)
                      )}
                    </td>
                    <td>{i.dueOn ? formatDate(i.dueOn, locale, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>
                    <td className="num">{money(i.total, i.currency)}</td>
                    <td className="num">{i.balance > 0 ? money(i.balance, i.currency) : '—'}</td>
                    <td>
                      <span className="badge" data-tone={overdue ? 'late' : i.status === 'paid' ? 'done' : undefined}>
                        {t(`fin.inv.state.${overdue ? 'overdue' : i.status}` as MessageKey)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
