// Customers at a glance: cards that say what needs attention, the renewals
// coming up month by month, and which customers have which products.
import { useMoney } from '../lib/money';
import { reviewDue } from '../../../shared/src/rhythm';
import { useEffect, useMemo, useState } from 'react';
import { HEALTH_FIELD } from '../../../shared/src/health';
import type { MessageKey } from '../../../shared/src/i18n';
import type { Account, AccountField } from '../../../shared/src/model';
import { AGREEMENT_RE, type RecordType, type RenewalLinks } from '../../../shared/src/records';
import { labelOf } from '../../../shared/src/fields';
import { get } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { navigate, setQuery } from '../lib/router';
import { useShell } from '../lib/shell';
import { useStore } from '../lib/store';
import { useRecordTypes } from './AccountFields';
import { Icon } from './icons';
import { Avatar } from './ui';

export const QUIET_DAYS = 30;
const DAY = 86_400_000;
const daysUntil = (iso: string) => Math.round((Date.parse(iso.slice(0, 10)) - Date.parse(new Date().toISOString().slice(0, 10))) / DAY);

/** The date field that is the renewal, and the money field that is the customer's value. */
export function keyFields(defs: AccountField[]) {
  const renewal = defs.find((f) => f.key === 'renewal_date') ?? defs.find((f) => f.type === 'date' && /renew|yenile/i.test(`${f.key} ${JSON.stringify(f.label)}`));
  const value = defs.find((f) => f.key === 'arr') ?? defs.find((f) => f.type === 'money');
  return { renewal, value };
}

export type Tone = 'red' | 'amber' | 'slate' | 'green';
export interface Chip {
  key: string;
  tone: Tone;
  text: string;
  title: string;
}
const RANK: Record<Tone, number> = { red: 0, amber: 1, slate: 2, green: 3 };

export type Band = 'good' | 'watch' | 'risk' | null;

/** A customer's health band: the worked-out score if it is on, otherwise the team's own judgement. */
export function bandOf(a: Account, health: { enabled: boolean; bands: { watch: number; good: number } } | undefined): Band {
  const score = a.fields[HEALTH_FIELD];
  if (health?.enabled && typeof score === 'number') return score >= health.bands.good ? 'good' : score >= health.bands.watch ? 'watch' : 'risk';
  const v = a.fields.health;
  return v === 'good' || v === 'watch' || v === 'risk' ? v : null;
}

/** What needs attention on a customer, most serious first, and how much in all. */
export function signalsOf(a: Account, defs: AccountField[], health: Parameters<typeof bandOf>[1], t: (k: MessageKey, v?: Record<string, string | number>) => string, reviewDays = 0) {
  const chips: Chip[] = [];
  let attention = 0;
  const band = bandOf(a, health);
  const { renewal } = keyFields(defs);
  if (a.overdueTasks) {
    chips.push({ key: 'overdue', tone: 'red', text: t('acards.overdue', { n: a.overdueTasks }), title: t('acards.overdueTitle') });
    attention += 3 * a.overdueTasks;
  }
  if (band === 'risk') {
    chips.push({ key: 'risk', tone: 'red', text: t('acards.atRisk'), title: t('acards.atRiskTitle') });
    attention += 4;
  } else if (band === 'watch') {
    chips.push({ key: 'watch', tone: 'amber', text: t('acards.watch'), title: t('acards.watchTitle') });
    attention += 1;
  }
  const r = renewal ? a.fields[renewal.key] : null;
  if (typeof r === 'string' && r) {
    const d = daysUntil(r);
    if (d < 0) {
      chips.push({ key: 'renewal', tone: 'red', text: t('acards.renewalPast', { n: -d }), title: t('acards.renewalTitle', { date: r }) });
      attention += 3;
    } else if (d <= 120) {
      chips.push({ key: 'renewal', tone: d < 30 ? 'red' : d < 90 ? 'amber' : 'slate', text: t('acards.renewalIn', { n: d }), title: t('acards.renewalTitle', { date: r }) });
      attention += d < 30 ? 3 : d < 90 ? 1 : 0;
    }
  }
  if (a.stuckTasks) {
    chips.push({ key: 'stuck', tone: 'amber', text: t('acards.stuck', { n: a.stuckTasks }), title: t('acards.stuckTitle') });
    attention += a.stuckTasks;
  }
  const quiet = a.lastTouchAt ? Math.floor((Date.now() - Date.parse(a.lastTouchAt)) / DAY) : null;
  if (quiet === null || quiet >= QUIET_DAYS) {
    chips.push({
      key: 'quiet',
      tone: 'slate',
      text: quiet === null ? t('acards.neverTouched') : t('acards.quiet', { n: quiet }),
      title: t('acards.quietTitle', { n: QUIET_DAYS }),
    });
    attention += 2;
  }
  // A business review that is late — only when the company holds reviews at all.
  const review = reviewDays > 0 ? reviewDue(a, reviewDays, new Date().toISOString().slice(0, 10)) : null;
  if (review?.state === 'overdue') {
    chips.push({ key: 'review', tone: 'amber', text: t('acards.reviewLate', { n: -review.days! }), title: t('acards.reviewTitle', { n: review.every }) });
    attention += 1;
  }
  if (!attention) chips.push({ key: 'clear', tone: 'green', text: t('acards.clear'), title: t('acards.clearTitle') });
  chips.sort((x, y) => RANK[x.tone] - RANK[y.tone]);
  return { chips, attention, band, quietDays: quiet };
}

export const SIGNAL_FILTERS = ['attention', 'overdue', 'stuck', 'quiet', 'renewal', 'review', 'risk', 'clear'] as const;
export type SignalFilter = (typeof SIGNAL_FILTERS)[number] | '';

export function matchesSignal(filter: SignalFilter, chips: Chip[], attention: number) {
  if (!filter) return true;
  if (filter === 'attention') return attention > 0;
  if (filter === 'risk') return chips.some((c) => c.key === 'risk' || c.key === 'watch');
  return chips.some((c) => c.key === filter);
}

function ChipList({ chips }: { chips: Chip[] }) {
  const { t } = useI18n();
  const [all, setAll] = useState(false);
  const shown = all ? chips : chips.slice(0, 3);
  return (
    <div className="acard__chips">
      {shown.map((c) => (
        <span key={c.key} className="schip" data-tone={c.tone} title={c.title}>
          {c.text}
        </span>
      ))}
      {!all && chips.length > 3 && (
        <button type="button" className="schip schip--more" onClick={() => setAll(true)} aria-label={t('acards.moreSignals', { n: chips.length - 3 })}>
          +{chips.length - 3}
        </button>
      )}
    </div>
  );
}

export function AccountCards({
  rows,
  shown,
  fmt,
  OptionValue,
}: {
  rows: { a: Account; chips: Chip[]; attention: number; band: Band }[];
  shown: AccountField[];
  fmt: (f: AccountField, v: unknown, currency?: string | null) => string;
  OptionValue: (p: { field: AccountField; value: unknown; text: string }) => JSX.Element;
}) {
  const { t, words, locale } = useI18n();
  const { person, me } = useStore();
  const score = (a: Account) => a.fields[HEALTH_FIELD];
  return (
    <div className="acards">
      {rows.map(({ a, chips, attention, band }) => {
        const s = score(a);
        const owner = person(a.ownerId);
        return (
          <article key={a.id} className="acard" data-attention={attention > 0 || undefined} data-band={band ?? undefined}>
            <header className="acard__head">
              <a
                className="acard__name"
                href={`/accounts/${a.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(`/accounts/${a.id}`);
                }}
              >
                {a.name}
              </a>
              {me.org.health?.enabled && typeof s === 'number' && (
                <span className="acard__score" data-band={band ?? undefined} title={t('acards.scoreTitle')}>
                  {Math.round(s)}
                </span>
              )}
            </header>
            <ChipList chips={chips} />
            <dl className="acard__facts">
              <div>
                <dt>{t('accounts.owner')}</dt>
                <dd>
                  {owner ? (
                    <span className="owner">
                      <Avatar person={owner} /> {owner.name}
                    </span>
                  ) : (
                    <span className="muted">{t('accounts.noOwner')}</span>
                  )}
                </dd>
              </div>
              {shown.map((f) => (
                <div key={f.key}>
                  <dt>{typeof f.label === 'string' ? f.label : (f.label[locale] ?? f.label.en)}</dt>
                  <dd>{a.fields[f.key] === null || a.fields[f.key] === undefined || a.fields[f.key] === '' ? <span className="muted">—</span> : <OptionValue field={f} value={a.fields[f.key]} text={fmt(f, a.fields[f.key], a.currency)} />}</dd>
                </div>
              ))}
            </dl>
            <footer className="acard__foot">
              <button className="btn btn--small" onClick={() => navigate(`/accounts/${a.id}`)}>
                {t('acards.open', { account: words.one })}
              </button>
              <button className="btn btn--small btn--quiet" onClick={() => navigate(`/accounts/${a.id}#tasks`)}>
                {t('acards.tasks', { n: a.openTasks ?? 0 })}
              </button>
            </footer>
          </article>
        );
      })}
    </div>
  );
}

/** Renewals month by month: what is at stake, and how each one looks. */
/** A link kept in a customer's own fields that is its agreement (a "Contract" URL field). */
function agreementFields(defs: AccountField[]) {
  return defs.filter((f) => f.type === 'url' && AGREEMENT_RE.test(`${f.key} ${JSON.stringify(f.label)}`));
}

export function RenewalsView({ rows, fmt }: { rows: { a: Account; chips: Chip[]; band: Band }[]; fmt: (f: AccountField, v: unknown, currency?: string | null) => string }) {
  const cur = useMoney();
  const { t, fmtDate, locale } = useI18n();
  const { me, person } = useStore();
  const { renewal, value } = keyFields(me.org.accountFields);
  const { types } = useRecordTypes();
  // Each customer's renewal opportunity and agreement records, asked for once for the customers on screen.
  const [links, setLinks] = useState<Record<string, RenewalLinks>>({});
  const ids = rows.filter((r) => renewal && typeof r.a.fields[renewal.key] === 'string').map((r) => r.a.id);
  const idKey = ids.join(',');
  useEffect(() => {
    if (!idKey) return;
    void get<{ links: Record<string, RenewalLinks> }>(`/renewals/links?accounts=${idKey.split(',').slice(0, 500).join(',')}`).then((r) => setLinks(r.links), () => setLinks({}));
  }, [idKey]);
  const ownLinks = agreementFields(me.org.accountFields);
  const stageLabel = (typeKey: string, stage: string | null) => {
    if (!stage) return null;
    const f = types?.find((x) => x.key === typeKey)?.fields.find((x) => x.key === 'stage');
    return labelOf(f?.options?.find((o) => o.key === stage)?.label, locale) || stage;
  };
  if (!renewal) return <div className="empty sheet">{t('acards.noRenewalField')}</div>;
  const groups = new Map<string, { a: Account; chips: Chip[]; band: Band; date: string; days: number }[]>();
  for (const r of rows) {
    const d = r.a.fields[renewal.key];
    if (typeof d !== 'string' || !d) continue;
    const days = daysUntil(d);
    if (days > 366) continue;
    const key = days < 0 ? 'past' : d.slice(0, 7);
    groups.set(key, [...(groups.get(key) ?? []), { ...r, date: d, days }]);
  }
  const keys = [...groups.keys()].sort((x, y) => (x === 'past' ? -1 : y === 'past' ? 1 : x.localeCompare(y)));
  if (!keys.length) return <div className="empty sheet">{t('acards.noRenewals')}</div>;
  const sum = (list: { a: Account }[]) => (value ? list.reduce((n, r) => n + cur.toBase(Number(r.a.fields[value.key]) || 0, r.a.currency), 0) : 0);
  const money = (n: number) => (value ? fmt(value, n) : '');
  return (
    <div className="renewals">
      {keys.map((k) => {
        const list = groups.get(k)!.sort((x, y) => x.days - y.days);
        const risky = list.filter((r) => r.band === 'risk' || r.band === 'watch');
        const month = k === 'past' ? t('acards.renewalsPast') : new Date(`${k}-01T00:00:00Z`).toLocaleDateString(locale === 'tr' ? 'tr-TR' : 'en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
        return (
          <section key={k} className="sheet renewals__month" data-past={k === 'past' || undefined}>
            <header className="renewals__head">
              <h3>{month}</h3>
              <span className="muted">
                {t('acards.renewalsCount', { n: list.length })}
                {value && <> · {money(sum(list))}</>}
                {risky.length > 0 && value && <> · <span className="schip" data-tone="amber">{t('acards.atStake', { value: money(sum(risky)) })}</span></>}
              </span>
            </header>
            <table className="table">
              <tbody>
                {list.map((r) => (
                  <tr key={r.a.id} className="rowlink-row" onClick={() => navigate(`/accounts/${r.a.id}`)}>
                    <td>
                      <a
                        className="rowlink"
                        href={`/accounts/${r.a.id}`}
                        onClick={(e) => {
                          e.preventDefault();
                          navigate(`/accounts/${r.a.id}`);
                        }}
                      >
                        {r.a.name}
                      </a>
                    </td>
                    <td className="hide-phone">{person(r.a.ownerId)?.name ?? <span className="muted">{t('accounts.noOwner')}</span>}</td>
                    <td className="num">{fmtDate(r.date, { day: 'numeric', month: 'short' })}</td>
                    <td className="num muted">{r.days < 0 ? t('acards.daysAgo', { n: -r.days }) : t('acards.inDays', { n: r.days })}</td>
                    {value && <td className="num">{r.a.fields[value.key] === null || r.a.fields[value.key] === undefined ? '—' : fmt(value, r.a.fields[value.key], r.a.currency)}</td>}
                    <td className="renewals__links">
                      <RenewalCell
                        links={links[r.a.id]}
                        own={ownLinks.map((f) => ({ label: labelOf(f.label, locale), url: r.a.fields[f.key] })).filter((x): x is { label: string; url: string } => typeof x.url === 'string' && /^https?:\/\//i.test(x.url))}
                        stageLabel={stageLabel}
                        money={(n, c) => cur.format(n, c)}
                      />
                    </td>
                    <td className="hide-phone">
                      <div className="acard__chips">
                        {r.chips
                          .filter((c) => c.key !== 'renewal')
                          .slice(0, 3)
                          .map((c) => (
                            <span key={c.key} className="schip" data-tone={c.tone} title={c.title}>
                              {c.text}
                            </span>
                          ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}

/**
 * Beside a renewal: the renewal opportunity (opens over the page) and the
 * agreement — a link from the customer's own fields, or an agreement record.
 * Presses here don't open the customer (the row does that).
 */
function RenewalCell({ links, own, stageLabel, money }: { links?: RenewalLinks; own: { label: string; url: string }[]; stageLabel: (typeKey: string, stage: string | null) => string | null; money: (n: number, currency?: string | null) => string }) {
  const { t } = useI18n();
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const deal = links?.deal;
  const docs = [...own.map((o) => ({ key: o.url, name: o.label, url: o.url, recordId: null as string | null })), ...(links?.agreements ?? []).map((a) => ({ key: a.recordId, name: a.name, url: a.url, recordId: a.recordId }))].slice(0, 3);
  if (!deal && !docs.length) return <span className="muted small">{links ? t('renewals.noDeal') : ''}</span>;
  return (
    <div className="renewals__chips">
      {deal && (
        <button
          className="rchip rchip--deal"
          title={t('renewals.openDeal')}
          onClick={(e) => {
            stop(e);
            setQuery('record', deal.id);
          }}
        >
          <Icon name="funnel" size={13} />
          <span className="rchip__name">{deal.name}</span>
          {stageLabel(deal.typeKey, deal.stage) && <span className="rchip__meta">{stageLabel(deal.typeKey, deal.stage)}</span>}
          {deal.amount !== null && <span className="rchip__meta num">{money(deal.amount, deal.currency)}</span>}
        </button>
      )}
      {docs.map((d) =>
        d.url ? (
          <a key={d.key} className="rchip" href={d.url} target="_blank" rel="noreferrer noopener" title={t('renewals.openAgreement')} onClick={stop}>
            <Icon name="paperclip" size={13} />
            <span className="rchip__name">{d.name}</span>
            <Icon name="external" size={12} />
          </a>
        ) : (
          <button
            key={d.key}
            className="rchip"
            title={t('renewals.openAgreement')}
            onClick={(e) => {
              stop(e);
              setQuery('record', d.recordId!);
            }}
          >
            <Icon name="paperclip" size={13} />
            <span className="rchip__name">{d.name}</span>
          </button>
        ),
      )}
    </div>
  );
}

interface Whitespace {
  options: { key: string; label: string | Record<string, string> }[];
  rows: { accountId: string; name: string; ownerId: string | null; have: Record<string, number> }[];
}

/** Customers × products: who has what, and where a cross-sell is waiting. */
export function WhitespaceView({ types }: { types: RecordType[] | null }) {
  const { t, locale, words } = useI18n();
  const { boards, canWrite, toast, person } = useStore();
  const shell = useShell();
  // Every choice field on any kind of record can be the columns; ones that look
  // like products (a "Product", "Module" or "Plan" field) come first.
  const choices = useMemo(() => {
    const all = (types ?? []).flatMap((ty) => ty.fields.filter((f) => f.type === 'select' && (f.options?.length ?? 0) > 1).map((f) => ({ type: ty, field: f })));
    const producty = (c: (typeof all)[number]) => /product|ürün|module|modül|plan|package|paket|edition|license|lisans/i.test(`${c.field.key} ${JSON.stringify(c.field.label)} ${JSON.stringify(c.type.name)}`);
    return [...all.filter(producty), ...all.filter((c) => !producty(c))];
  }, [types]);
  const stored = (() => {
    try {
      return localStorage.getItem('app_whitespace') ?? '';
    } catch {
      return '';
    }
  })();
  const [pick, setPick] = useState(() => (choices.some((c) => `${c.type.id}:${c.field.key}` === stored) ? stored : choices[0] ? `${choices[0].type.id}:${choices[0].field.key}` : ''));
  const [data, setData] = useState<Whitespace | null>(null);
  const [only, setOnly] = useState<'all' | 'gaps'>('all');
  const [board, setBoard] = useState(boards[0]?.id ?? '');
  useEffect(() => {
    if (!pick) return;
    const [type, field] = pick.split(':');
    try {
      localStorage.setItem('app_whitespace', pick);
    } catch {
      /* per-viewer convenience */
    }
    void get<Whitespace>(`/accounts/whitespace?type=${type}&field=${field}`).then(setData, () => setData(null));
  }, [pick]);
  const label = (l: string | Record<string, string>) => (typeof l === 'string' ? l : (l[locale] ?? l.en ?? ''));
  if (!choices.length) return <div className="empty sheet">{t('whitespace.none')}</div>;
  const opts = data?.options ?? [];
  const rows = (data?.rows ?? []).filter((r) => only === 'all' || opts.some((o) => !r.have[o.key]));
  // "+" opens the quick-add box already filled in (board, customer, its owner,
  // a title), so the person sees and can change the task before it is made;
  // the message that follows offers to open it.
  const openTask = (accountId: string, name: string, ownerId: string | null, product: string) => {
    if (!board) return toast(t('whitespace.pickBoard'), 'error');
    shell.quickAdd({
      boardId: board,
      accountId,
      accountName: name,
      assigneeIds: ownerId ? [ownerId] : [],
      text: t('whitespace.taskTitle', { product, account: name }),
      doneText: t('whitespace.taskMade', { product, account: name }),
    });
  };
  return (
    <div className="whitespace">
      <div className="toolbar">
        <label className="field">
          <span className="field__label">{t('whitespace.from')}</span>
          <select className="select" value={pick} onChange={(e) => setPick(e.target.value)}>
            {choices.map((c) => (
              <option key={`${c.type.id}:${c.field.key}`} value={`${c.type.id}:${c.field.key}`}>
                {label(c.type.name.other)} · {label(c.field.label)}
              </option>
            ))}
          </select>
        </label>
        <div className="seg">
          <button aria-pressed={only === 'all'} onClick={() => setOnly('all')}>
            {t('whitespace.all')}
          </button>
          <button aria-pressed={only === 'gaps'} onClick={() => setOnly('gaps')}>
            {t('whitespace.gaps')}
          </button>
        </div>
        {canWrite && (
          <label className="field">
            <span className="field__label">{t('whitespace.taskBoard')}</span>
            <select className="select" value={board} onChange={(e) => setBoard(e.target.value)}>
              {boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <p className="field__hint">{t('whitespace.lead')}</p>
      {!data ? (
        <p className="muted">{t('common.loading')}</p>
      ) : (
        <div className="table-wrap">
          <table className="table whitespace__table">
            <thead>
              <tr>
                <th>{words.one}</th>
                {opts.map((o) => (
                  <th key={o.key} className="num">
                    {label(o.label as any)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.accountId}>
                  <td>
                    <a
                      className="rowlink"
                      href={`/accounts/${r.accountId}`}
                      onClick={(e) => {
                        e.preventDefault();
                        navigate(`/accounts/${r.accountId}`);
                      }}
                    >
                      {r.name}
                    </a>
                    {r.ownerId && <div className="muted small">{person(r.ownerId)?.name}</div>}
                  </td>
                  {opts.map((o) => (
                    <td key={o.key} className="num">
                      {r.have[o.key] ? (
                        <span className="wcell" data-have title={t('whitespace.has', { n: r.have[o.key] })}>
                          ✓
                        </span>
                      ) : canWrite ? (
                        <button className="wcell" title={t('whitespace.openTask')} aria-label={t('whitespace.openTaskFor', { product: label(o.label as any), account: r.name })} onClick={() => openTask(r.accountId, r.name, r.ownerId, label(o.label as any))}>
                          +
                        </button>
                      ) : (
                        <span className="wcell">·</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
