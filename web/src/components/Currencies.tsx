// Settings → Currencies. A company keeps one currency of its own (totals,
// targets and reports are in it) and may work in others: a customer or a
// deal can be in US dollars while the company counts in lira. For each other
// currency an administrator says what one unit is worth in the company's
// currency. Curahold doesn't fetch rates from anywhere: they are the
// company's own, kept the way its finance team keeps them.
//
// How the rates are used: shared/src/money.ts (toBase/fromBase), the web's
// useMoney() (web/src/lib/money.ts) and, on the server, fxRate() in
// api/src/lib/fx.ts, which converts inside the SQL that adds amounts up.
// Saved with PUT /admin/fx (api/src/routes/admin.ts).
import { useMemo, useState } from 'react';
import { COMMON_CURRENCIES, CURRENCY_RE } from '../../../shared/src/money';
import { ApiFailure, put } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { allCurrencies, useMoney } from '../lib/money';
import { navigate } from '../lib/router';
import { useStore } from '../lib/store';
import { EmptyState } from './Empty';
import { Icon } from './icons';

/** One row being edited: the text as typed, so "34," can be on its way to "34,25". */
interface Row {
  code: string;
  text: string;
}

/** "34,25" or "34.25" → 34.25; anything else → null. */
const parseRate = (text: string): number | null => {
  const n = Number(text.trim().replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 && n < 1e9 ? n : null;
};

export function CurrencySettings() {
  const { t, locale, fmtDate } = useI18n();
  const { me, reloadMe, toast } = useStore();
  const money = useMoney();
  const base = me.org.currency;
  const tag = locale === 'tr' ? 'tr-TR' : 'en-GB';
  const plain = (n: number) => new Intl.NumberFormat(tag, { maximumFractionDigits: 6 }).format(n);
  const [rows, setRows] = useState<Row[]>(() =>
    Object.entries(me.org.fx?.rates ?? {})
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([code, rate]) => ({ code, text: plain(rate) })),
  );
  const [adding, setAdding] = useState('');
  const [busy, setBusy] = useState(false);

  // Every ISO currency the browser knows, the usual ones first; minus those already here.
  const choices = useMemo(() => {
    const taken = new Set([base, ...rows.map((r) => r.code)]);
    const all = allCurrencies();
    const first = COMMON_CURRENCIES.filter((c) => all.includes(c));
    return [...first, ...all.filter((c) => !first.includes(c))].filter((c) => !taken.has(c));
  }, [base, rows]);

  const bad = rows.filter((r) => parseRate(r.text) === null);
  const add = () => {
    if (!CURRENCY_RE.test(adding)) return;
    setRows([...rows, { code: adding, text: '' }]);
    setAdding('');
  };

  const save = async () => {
    const rates = Object.fromEntries(rows.map((r) => [r.code, parseRate(r.text)]).filter(([, v]) => v !== null));
    setBusy(true);
    try {
      await put('/admin/fx', { rates });
      await reloadMe();
      toast(t('common.saved'));
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="currencies">
      <section className="sheet">
        <h2 className="sheet__title">{t('fx.base')}</h2>
        <p className="currencies__base">
          <span className="curchip">{base}</span>
          <span>{money.nameOf(base)}</span>
        </p>
        <p className="sheet__hint">
          {t('fx.baseHint')}{' '}
          <a
            href="/settings/company"
            onClick={(e) => {
              e.preventDefault();
              navigate('/settings/company');
            }}
          >
            {t('fx.baseChange')}
          </a>
        </p>
      </section>

      <section className="sheet">
        <h2 className="sheet__title">{t('fx.others')}</h2>
        <p className="sheet__hint">{t('fx.othersHint', { base })}</p>
        {rows.length === 0 ? (
          <EmptyState compact icon="globe" title={t('fx.emptyTitle')} body={t('fx.emptyBody', { base })} />
        ) : (
          <ul className="fxlist">
            {rows.map((r, i) => {
              const rate = parseRate(r.text);
              return (
                <li key={r.code} className="fxrow" data-bad={rate === null || undefined}>
                  <span className="curchip">{r.code}</span>
                  <span className="fxrow__name">{money.nameOf(r.code)}</span>
                  <label className="fxrow__rate">
                    <span className="muted">1 {r.code} =</span>
                    <input
                      className="input num"
                      inputMode="decimal"
                      value={r.text}
                      placeholder="0"
                      aria-label={t('fx.rateOf', { code: r.code, base })}
                      autoFocus={!r.text}
                      onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                    />
                    <span className="muted">{base}</span>
                  </label>
                  {/* The other way round, which is how some people think of it. */}
                  <span className="fxrow__back muted small">{rate ? `1 ${base} = ${plain(Math.round((1 / rate) * 1e6) / 1e6)} ${r.code}` : t('fx.needRate')}</span>
                  <button type="button" className="btn btn--quiet btn--icon btn--small" aria-label={t('fx.remove', { code: r.code })} title={t('fx.remove', { code: r.code })} onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                    <Icon name="trash" size={15} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="fxadd">
          <select className="select" value={adding} aria-label={t('fx.add')} onChange={(e) => setAdding(e.target.value)}>
            <option value="">{t('fx.pick')}</option>
            {choices.map((c) => (
              <option key={c} value={c}>
                {c} · {money.nameOf(c)}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn--small" disabled={!adding} onClick={add}>
            <Icon name="plus" size={15} /> {t('fx.add')}
          </button>
        </div>
        {me.org.fx?.updatedAt && <p className="field__hint">{t('fx.updated', { date: fmtDate(me.org.fx.updatedAt, { day: 'numeric', month: 'long', year: 'numeric' }) })}</p>}
        <p className="field__hint">{t('fx.removeHint')}</p>
      </section>

      <div className="toolbar">
        {bad.length > 0 && <span className="error-text">{t('fx.fixRates', { codes: bad.map((r) => r.code).join(', ') })}</span>}
        <button className="btn btn--primary" disabled={busy || bad.length > 0} onClick={save}>
          {busy ? t('common.saving') : t('common.save')}
        </button>
      </div>
    </div>
  );
}
