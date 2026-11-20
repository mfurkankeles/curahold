// The owner's cockpit inside the console (desk.<domain>): what only the
// platform owner sees — the business at a glance, revenue and invoices,
// trials and free companies, trial requests to decide, the approval queue
// one card at a time, Plan & targets, the go-live checklist one task at a
// time, support at a glance, the system and everything staff did.
// Desktop first (a command layout with a top bar), phone stacked.
// Turkish and English only, by the owner's choice (words: shared/src/i18n/owner.ts).
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { CHECKLIST_AREAS, CHECKLIST_PRIORITIES, type ChecklistEntry } from '../../../shared/src/checklist';
import { LOCALE_INFO, normalizeLocale } from '../../../shared/src/i18n';
import { ownerWord, type OwnerKey } from '../../../shared/src/i18n/owner';
import type { Approval, Pause, Seat } from '../../../shared/src/office';
import type { OwnerActivity, OwnerBarData, OwnerChecklist, OwnerOverview, OwnerPlan, OwnerRevenue, OwnerSupport, OwnerSystem, OwnerTrial, Pace, PlanMetric } from '../../../shared/src/ownerConsole';
import { CONSENT_REGIONS, LAW_NAME, type ConsentRegion } from '../../../shared/src/trialForm';
import { TRIAL_DEPARTMENTS, type TrialDepartment, type TrialRequestDetail, type TrialRequestRow } from '../../../shared/src/trialRequest';
import { DateField } from '../components/DateField';
import { EmptyState, LoadError, SkeletonCards, SkeletonRows } from '../components/Empty';
import { Icon, type IconName } from '../components/icons';
import { formatDate, formatMoney, formatNumber, formatPercent } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { relativeTime } from '../lib/time';
import { typingIn } from '../lib/undo';
import { ConsoleChart, periodOf } from './ConsoleChart';
import '../surfaces/owner.css';

export type OwnerSection = 'today' | 'revenue' | 'trials' | 'requests' | 'approvals' | 'plan' | 'checklist' | 'supportview' | 'system' | 'activity';
export interface OwnerGo {
  (to: { section: OwnerSection | 'customers' | 'support'; c?: string | null; r?: string | null; q?: string | null }): void;
}

class OwnerError extends Error {
  constructor(readonly status: number, readonly body: unknown) {
    super(String(status));
  }
}
async function api<T>(method: string, path: string, body?: unknown, keepalive = false): Promise<T> {
  const res = await fetch(`/api/desk${path}`, { method, keepalive, headers: { 'x-curahold-desk': '1', ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new OwnerError(res.status, json);
  return json as T;
}

/** The owner's words in the console's language (Turkish or English). */
export function useOwnerWords() {
  const { locale } = useI18n();
  const l = normalizeLocale(locale);
  const o = useCallback((k: OwnerKey, vars?: Record<string, string | number>) => ownerWord(l, k, vars), [l]);
  return { o, locale: l };
}

function useData<T>(path: string, beat: number, failed: (e: unknown) => void) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    api<T>('GET', path)
      .then((d) => {
        if (!live) return;
        setData(d);
        setError(false);
      })
      .catch((e) => {
        failed(e);
        if (live) setError(true);
      });
    return () => {
      live = false;
    };
  }, [path, beat, attempt, failed]);
  return { data, error, reload: () => setAttempt((a) => a + 1), setData };
}

function Page({ title, sub, tools, children, wide }: { title: string; sub?: ReactNode; tools?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <div className="console__page oc" data-wide={wide ? '' : undefined}>
      <header className="oc__head">
        <div>
          <h1 className="oc__title">{title}</h1>
          {sub ? <p className="oc__sub">{sub}</p> : null}
        </div>
        {tools ? <div className="oc__tools">{tools}</div> : null}
      </header>
      {children}
    </div>
  );
}
function Loading<T>({ data, error, reload, children, cards }: { data: T | null; error: boolean; reload: () => void; children: (d: T) => ReactNode; cards?: boolean }) {
  const { t } = useI18n();
  if (data) return <>{children(data)}</>;
  if (error) return <LoadError onRetry={reload} />;
  return cards ? <SkeletonCards count={6} label={t('common.loading')} /> : <SkeletonRows rows={8} label={t('common.loading')} />;
}

/** A figure's change on the period before: the period's words, and whether a rise is good news. */
interface Change {
  now: number;
  before: number;
  period: '30' | 'Month' | '24h';
  good: 'up' | 'down';
  show: (v: number) => string;
}

/**
 * "▲ +3 on the previous 30 days": the arrow, the signed amount and the period in words; the colour only repeats
 * what the words say, and a screen reader also hears whether the move is good news.
 */
function Delta({ c }: { c: Change }) {
  const { o } = useOwnerWords();
  const diff = c.now - c.before;
  if (diff === 0)
    return (
      <span className="ocdelta" data-dir="same">
        <Icon name="dot" size={14} />
        <span>{o(`delta.same${c.period}` as OwnerKey)}</span>
      </span>
    );
  const up = diff > 0;
  const good = up === (c.good === 'up');
  return (
    <span className="ocdelta" data-dir={up ? 'up' : 'down'} data-good={good ? 'yes' : 'no'}>
      <Icon name={up ? 'chevronUp' : 'chevronDown'} size={14} />
      <span>{o(`delta.prev${c.period}` as OwnerKey, { delta: `${up ? '+' : '−'}${c.show(Math.abs(diff))}` })}</span>
      <span className="sr-only">{`, ${o(up ? (good ? 'delta.upGood' : 'delta.upBad') : good ? 'delta.downGood' : 'delta.downBad')}`}</span>
    </span>
  );
}

/** A small line of the last months under a figure: the shape only (the figure and its change are the words). */
function Spark({ values }: { values: number[] }) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const points = values.map((v, i) => `${((i / (values.length - 1)) * 100).toFixed(2)},${(29 - ((v - min) / span) * 26).toFixed(2)}`).join(' ');
  return (
    <svg className="ocspark" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={points} />
    </svg>
  );
}

/** A figure tile that opens where it comes from, with its change on the period before. */
function Tile({ label, value, sub, onOpen, lead, tone, change, spark }: { label: string; value: string; sub?: string; onOpen?: () => void; lead?: boolean; tone?: Tone; change?: Change; spark?: number[] }) {
  const body = (
    <>
      <span className="ctile__label">
        {tone ? <Icon name={TONE_ICON[tone]} size={14} /> : null}
        {label}
      </span>
      <span className="ctile__value">{value}</span>
      {change ? <Delta c={change} /> : null}
      {spark ? <Spark values={spark} /> : null}
      {sub ? <span className="ctile__sub">{sub}</span> : null}
    </>
  );
  return onOpen ? (
    <button type="button" className="ctile octile" data-lead={lead ? '' : undefined} data-tone={tone} onClick={onOpen}>
      {body}
    </button>
  ) : (
    <div className="ctile octile" data-lead={lead ? '' : undefined} data-tone={tone}>
      {body}
    </div>
  );
}

const PACE_ICON: Record<Pace, IconName> = { 'on-track': 'checkCircle', close: 'clock', behind: 'alert', 'no-target': 'dot' };

/** A state's tone: good (done), needs a look (soon), needs action (late). */
type Tone = 'done' | 'soon' | 'late';
const TONE_ICON: Record<Tone, IconName> = { done: 'checkCircle', soon: 'clock', late: 'alert' };

/**
 * A state in a few words. A tone always carries its icon next to the words, so the state is never
 * told by colour alone (WCAG 1.4.1; docs/design/tokens.md "Status").
 */
function Pill({ tone, children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className="ocpill" data-tone={tone}>
      {tone ? <Icon name={TONE_ICON[tone]} size={12} /> : null}
      {children}
    </span>
  );
}

function usePlanFormat() {
  const { locale } = useOwnerWords();
  return (metric: PlanMetric, v: number | null) => (v == null ? '—' : metric === 'mrr' || metric === 'arr' ? formatMoney(v, 'USD', locale, { compact: v >= 100000 }) : formatNumber(v, locale, { compact: v >= 100000 }));
}

// ================================================================ the top bar

/** A small choice kept on this device (localStorage); null clears it. Storage may be off: then nothing is kept. */
const PRIVACY_FOLDED = 'oc_privacy_folded';
function readFlag(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeFlag(key: string, value: string | null) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage off: the choice lasts this visit */
  }
}

/** Always on top: the privacy line, the agents' usage this week, the pause switch, and what waits for a decision. */
/**
 * Pause every agent (after a confirmation) or resume them: in the top bar on a desktop, in "More" on a phone.
 * Pausing stops proposals and writing at once; the AI team's gate and monitor are untouched (ADR 0011).
 */
export function PauseAllButton({ beat, failed, onChanged }: { beat: number; failed: (e: unknown) => void; onChanged?: () => void }) {
  const { o } = useOwnerWords();
  const [busy, setBusy] = useState(false);
  const pauses = useData<{ pauses: Pause[] }>('/office/pauses', beat, failed);
  const all = pauses.data?.pauses.find((p) => p.scope === 'all');
  const toggle = async () => {
    if (!all && !window.confirm(o('bar.pauseConfirm'))) return;
    setBusy(true);
    try {
      if (all) await api('DELETE', `/office/pauses/${all.id}`);
      else await api('POST', '/office/pauses', { scope: 'all', reason: o('bar.pauseReason') });
      pauses.reload();
      onChanged?.();
    } catch (e) {
      failed(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" className={all ? 'btn btn--small btn--primary ocpause' : 'btn btn--small btn--danger ocpause'} onClick={toggle} disabled={busy || !pauses.data}>
      <Icon name={all ? 'play' : 'hourglass'} size={14} />
      {all ? o('bar.resumeAll') : o('bar.pauseAll')}
    </button>
  );
}

/** What waits for a decision and the AI team's week (the top bar's figures; the phone tabs' counts). */
export function useOwnerBar(beat: number, failed: (e: unknown) => void) {
  return useData<OwnerBarData>('/owner/bar', beat, failed);
}

export function OwnerBar({ beat, failed, go }: { beat: number; failed: (e: unknown) => void; go: OwnerGo }) {
  const { o, locale } = useOwnerWords();
  const { data, reload } = useOwnerBar(beat, failed);
  const u = data?.usage;
  const share = u && u.budget > 0 ? Math.min(1, u.tokens / u.budget) : 0;
  // The privacy note says what the owner can and cannot see. Read once, it folds into a "Privacy" button that
  // opens it again, so it never disappears (remembered on this device only).
  const [privacyOpen, setPrivacyOpen] = useState(() => readFlag(PRIVACY_FOLDED) !== '1');
  const fold = (open: boolean) => {
    setPrivacyOpen(open);
    writeFlag(PRIVACY_FOLDED, open ? null : '1');
  };
  return (
    <div className="ocbar" role="region" aria-label={o('bar.label')} data-privacy={privacyOpen ? 'open' : undefined}>
      {privacyOpen ? (
        <p className="ocbar__privacy" id="oc-privacy">
          <Icon name="lock" size={14} />
          <span>{o('privacy.line')}</span>
          <button type="button" className="btn btn--small btn--quiet ocbar__fold" aria-label={o('privacy.hideLabel')} onClick={() => fold(false)}>
            <Icon name="close" size={14} />
            {o('privacy.hide')}
          </button>
        </p>
      ) : (
        <button type="button" className="ocbar__chip ocbar__privacybtn" aria-label={o('privacy.showLabel')} onClick={() => fold(true)}>
          <Icon name="lock" size={14} />
          {o('privacy.show')}
        </button>
      )}
      <div className="ocbar__right">
        {data ? (
          <button type="button" className="ocbar__chip" data-on={data.approvalsPending ? '' : undefined} onClick={() => go({ section: 'approvals' })} aria-keyshortcuts="a">
            <Icon name="checkCircle" size={14} />
            {o('bar.approvals', { n: formatNumber(data.approvalsPending, locale) })}
          </button>
        ) : null}
        {data ? (
          <button type="button" className="ocbar__chip" data-on={data.requestsNew ? '' : undefined} onClick={() => go({ section: 'requests' })} aria-keyshortcuts="r">
            <Icon name="form" size={14} />
            {o('bar.requests', { n: formatNumber(data.requestsNew, locale) })}
          </button>
        ) : null}
        {u ? (
          <span className="ocbar__meter" title={o('bar.usageTitle')}>
            <span className="ocbar__meterlabel">{o('bar.usage', { tokens: formatNumber(u.tokens, locale, { compact: true }), budget: u.budget ? formatNumber(u.budget, locale, { compact: true }) : '—' })}</span>
            <span className="ocmeter" aria-hidden="true">
              <i style={{ '--w': `${Math.round(share * 100)}%` } as React.CSSProperties} data-high={share >= 0.8 ? '' : undefined} />
            </span>
          </span>
        ) : null}
        <PauseAllButton beat={beat} failed={failed} onChanged={reload} />
      </div>
    </div>
  );
}

// ================================================================ overview

/**
 * The first screen: what waits for the owner's decision first, then the business in a few figures (each with its
 * change on the period before; a figure at zero is left out), then customers, the site, the checklist and the
 * system. The order is the owner's question order: "what do I have to do", "how are we doing", "is anything broken".
 */
export function OverviewSection({ beat, failed, go }: { beat: number; failed: (e: unknown) => void; go: OwnerGo }) {
  const { o, locale } = useOwnerWords();
  const { data, error, reload } = useData<OwnerOverview>('/owner/overview', beat, failed);
  const fmt = usePlanFormat();
  const n = (v: number) => formatNumber(v, locale);
  return (
    <Page wide title={o('nav.overview')} sub={data ? `${formatDate(data.today.asOf, locale, { weekday: 'long', day: 'numeric', month: 'long' })} · ${o(data.today.mode === 'live' ? 'mode.live' : 'mode.demo')}` : undefined}>
      <Loading data={data} error={error} reload={reload} cards>
        {(d) => {
          const usd = (v: number) => formatMoney(v, d.today.currency, locale, { compact: v >= 1_000_000 });
          const pct = (v: number | null) => (v == null ? '—' : formatPercent(v * 100, locale, v > 0 && v < 0.01 ? 2 : v < 0.1 ? 1 : 0));
          const trend = d.today.revenue.trend;
          const lastMonth = trend.length > 1 ? trend[trend.length - 2].v : null;
          const errors = d.errors.server24h + d.errors.syncFailed24h;
          return (
            <>
              {d.today.mode === 'demo' ? <p className="ctoday__note">{o('mode.demoNote')}</p> : null}
              <DecideBand d={d} go={go} beat={beat} failed={failed} />

              <section className="ocsec" aria-labelledby="oc-biz">
                <h2 className="ocsec__title" id="oc-biz">
                  {o('business.title')}
                </h2>
                <div className="octiles">
                  <Tile
                    lead
                    label={o('tile.mrr')}
                    value={usd(d.today.revenue.mrr)}
                    sub={o('tile.arr', { amount: usd(d.today.revenue.arr) })}
                    change={lastMonth == null ? undefined : { now: d.today.revenue.mrr, before: lastMonth, period: 'Month', good: 'up', show: (v) => usd(v) }}
                    spark={trend.length > 2 ? trend.map((p) => p.v) : undefined}
                    onOpen={() => go({ section: 'revenue' })}
                  />
                  {d.invoices.paid30 || d.prev.paid30 ? (
                    <Tile
                      label={o('tile.invoices')}
                      value={n(d.invoices.paid30)}
                      sub={o('tile.invoicesSub', { failed: n(d.invoices.failed30), upcoming: n(d.invoices.upcoming30) })}
                      change={{ now: d.invoices.paid30, before: d.prev.paid30, period: '30', good: 'up', show: n }}
                      onOpen={() => go({ section: 'revenue' })}
                    />
                  ) : null}
                  {d.growth.signups30 || d.prev.signups30 ? (
                    <Tile
                      label={o('tile.signups')}
                      value={n(d.growth.signups30)}
                      sub={o('tile.signupsSub', { n: n(d.growth.activations30) })}
                      change={{ now: d.growth.signups30, before: d.prev.signups30, period: '30', good: 'up', show: n }}
                      onOpen={() => go({ section: 'trials' })}
                    />
                  ) : null}
                  {d.site.requests30 || d.prev.requests30 ? (
                    <Tile
                      label={o('tile.trialRequests')}
                      value={n(d.site.requests30)}
                      sub={o('tile.trialRequestsSub')}
                      change={{ now: d.site.requests30, before: d.prev.requests30, period: '30', good: 'up', show: n }}
                      onOpen={() => go({ section: 'requests' })}
                    />
                  ) : null}
                  {errors ? (
                    <Tile
                      tone="late"
                      label={o('tile.errors')}
                      value={n(errors)}
                      sub={o('tile.errorsSub', { server: n(d.errors.server24h), sync: n(d.errors.syncFailed24h), conn: n(d.errors.connectionsInError) })}
                      change={{ now: errors, before: d.prev.server24h + d.prev.syncFailed24h, period: '24h', good: 'down', show: n }}
                      onOpen={() => go({ section: 'system' })}
                    />
                  ) : null}
                </div>
                <button type="button" className="ocstrip" onClick={() => go({ section: 'plan' })} title={o('strip.label')}>
                  <span className="ocstrip__sum">
                    <strong>{o('strip.title')}</strong>
                    {d.strip.rows.length ? <span>{o('strip.counts', { on: n(d.strip.onTrack), close: n(d.strip.close), behind: n(d.strip.behind) })}</span> : <span>{o('strip.none')}</span>}
                  </span>
                  <span className="ocstrip__rows">
                    {d.strip.rows.map((r) => (
                      <span key={r.metric} className="ocpace" data-pace={r.pace}>
                        <Icon name={PACE_ICON[r.pace]} size={12} />
                        {o(`metric.${r.metric}` as OwnerKey)} {fmt(r.metric, r.actual)}/{fmt(r.metric, r.target)}
                      </span>
                    ))}
                  </span>
                  <Icon name="chevronRight" size={16} className="ocstrip__go" />
                </button>
              </section>

              <div className="occols">
                <section className="ccard" aria-labelledby="oc-states">
                  <h2 className="ccard__title" id="oc-states">{o('states.title')}</h2>
                  <ul className="ocstates">
                    {(['paying', 'trial', 'free', 'requested', 'churned'] as const).map((k) => (
                      <li key={k}>
                        <button type="button" className="ocstate" data-state={k} onClick={() => go({ section: k === 'requested' ? 'requests' : k === 'trial' || k === 'free' ? 'trials' : 'customers' })}>
                          <span className="ocstate__dot" aria-hidden="true" />
                          <span className="ocstate__label">{o(`states.${k}` as OwnerKey)}</span>
                          <strong>{n(d.states[k])}</strong>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <h2 className="ccard__title">{o('growth.title')}</h2>
                  <dl className="cfacts">
                    <div>
                      <dt>{o('growth.signups')}</dt>
                      <dd>{n(d.growth.signups30)}</dd>
                    </div>
                    <div>
                      <dt>{o('growth.activations')}</dt>
                      <dd>{n(d.growth.activations30)}</dd>
                    </div>
                    <div>
                      <dt>{o('growth.trialToPaid')}</dt>
                      <dd>{pct(d.today.trialToPaid.rate)}</dd>
                    </div>
                    <div>
                      <dt>{o('growth.churn')}</dt>
                      <dd>{n(d.today.churn.companies)}</dd>
                    </div>
                  </dl>
                </section>

                <section className="ccard" aria-labelledby="oc-site">
                  <h2 className="ccard__title" id="oc-site">{o('site.title')}</h2>
                  {d.site.connected ? (
                    <>
                      <dl className="cfacts">
                        <div>
                          <dt>{o('site.visitors')}</dt>
                          <dd>{n(d.site.visitors30 ?? 0)}</dd>
                        </div>
                        <div>
                          <dt>{o('site.requests')}</dt>
                          <dd>{n(d.site.requests30)}</dd>
                        </div>
                        <div>
                          <dt>{o('site.conversion')}</dt>
                          <dd>{pct(d.site.conversion)}</dd>
                        </div>
                      </dl>
                      {d.site.variants.length > 1 ? (
                        <table className="octable octable--dense">
                          <thead>
                            <tr>
                              <th scope="col">{o('site.variant')}</th>
                              <th scope="col" className="num">{o('site.visitors')}</th>
                              <th scope="col" className="num">{o('site.requests')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {d.site.variants.map((v) => (
                              <tr key={v.variant}>
                                <td>{v.variant}</td>
                                <td className="num">{n(v.visitors)}</td>
                                <td className="num">{n(v.requests)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <p className="oc__muted">{o('site.notConnected')}</p>
                      <dl className="cfacts">
                        <div>
                          <dt>{o('site.requests')}</dt>
                          <dd>{n(d.site.requests30)}</dd>
                        </div>
                      </dl>
                    </>
                  )}
                  {d.growth.signups.length > 1 ? (
                    <>
                      <h2 className="ccard__title">{o('growth.signupsChart')}</h2>
                      <ConsoleChart kind="columns" points={d.growth.signups} label={o('growth.signupsChart')} value={(v) => n(v)} tick={(v) => n(v)} when={(p) => periodOf(p, locale)} />
                    </>
                  ) : null}
                </section>

                <section className="ccard" aria-labelledby="oc-next">
                  <h2 className="ccard__title" id="oc-next">{o('check.nextTitle')}</h2>
                  <p className="oc__big">{o('check.progress', { done: n(d.checklist.done), total: n(d.checklist.total) })}</p>
                  <Bar value={d.checklist.total ? d.checklist.done / d.checklist.total : 0} />
                  {d.checklist.next ? (
                    <button type="button" className="ocnextlink" onClick={() => go({ section: 'checklist' })}>
                      <span>{o(`checklist.${d.checklist.next}.title` as OwnerKey)}</span>
                      <Icon name="chevronRight" size={16} />
                    </button>
                  ) : (
                    <p className="oc__muted">{o('check.allDone')}</p>
                  )}
                  <h2 className="ccard__title">{o('usage.title')}</h2>
                  <dl className="cfacts">
                    <div>
                      <dt>{o('usage.tokens')}</dt>
                      <dd>{formatNumber(d.usage.tokens, locale, { compact: true })}</dd>
                    </div>
                    <div>
                      <dt>{o('usage.budget')}</dt>
                      <dd>{d.usage.budget ? formatNumber(d.usage.budget, locale, { compact: true }) : '—'}</dd>
                    </div>
                    <div>
                      <dt>{o('usage.cost')}</dt>
                      <dd>{formatMoney(d.usage.costUsd, 'USD', locale)}</dd>
                    </div>
                  </dl>
                  {d.usage.pausedAll ? (
                    <p className="flag flag--late">
                      <Icon name="alert" size={14} />
                      {o('usage.pausedAll')}
                    </p>
                  ) : null}
                </section>
              </div>

              {errors || d.errors.connectionsInError ? null : (
                <p className="ochealthy">
                  <Icon name="checkCircle" size={16} />
                  <span>{o('system.healthy')}</span>
                  <button type="button" className="btn btn--small btn--quiet" onClick={() => go({ section: 'system' })}>
                    <Icon name="shield" size={14} />
                    {o('system.toSystem')}
                  </button>
                </p>
              )}
            </>
          );
        }}
      </Loading>
    </Page>
  );
}

/**
 * What waits for the owner, first on the screen: proposals to decide, new trial requests, failed payments, and the
 * customers who need the team. Only what is there is shown; with nothing waiting, one calm line says what would come
 * here and offers the next useful step.
 */
function DecideBand({ d, go, beat, failed }: { d: OwnerOverview; go: OwnerGo; beat: number; failed: (e: unknown) => void }) {
  const { o, locale } = useOwnerWords();
  const { t } = useI18n();
  const n = (v: number) => formatNumber(v, locale);
  const first = useData<{ approvals: Approval[] }>('/office/approvals?status=open', beat, failed);
  const top = first.data?.approvals[0];
  const people = d.today.attention;
  const cards = [
    d.approvalsPending > 0 && (
      <article key="ap" className="ocwait__card" data-kind="approvals">
        <Icon name="checkCircle" size={20} className="ocwait__icon" />
        <div className="ocwait__main">
          <h3>{o('decide.approvals', { n: n(d.approvalsPending) })}</h3>
          <p>{top ? o('decide.approvalsFirst', { title: top.title }) : o('tile.approvalsSub')}</p>
        </div>
        <button type="button" className="btn btn--primary" onClick={() => go({ section: 'approvals' })} aria-keyshortcuts="a">
          <Icon name="check" size={16} />
          {o('decide.toApprovals')}
        </button>
      </article>
    ),
    d.requests.new > 0 && (
      <article key="rq" className="ocwait__card" data-kind="requests">
        <Icon name="form" size={20} className="ocwait__icon" />
        <div className="ocwait__main">
          <h3>{o('decide.requests', { n: n(d.requests.new) })}</h3>
          <p>{o('decide.requestsSub')}</p>
        </div>
        <button type="button" className="btn" onClick={() => go({ section: 'requests' })} aria-keyshortcuts="r">
          <Icon name="arrowRight" size={16} />
          {o('decide.toRequests')}
        </button>
      </article>
    ),
    d.invoices.failed30 > 0 && (
      <article key="inv" className="ocwait__card" data-kind="payments">
        <Icon name="alert" size={20} className="ocwait__icon" />
        <div className="ocwait__main">
          <h3>{o('decide.failed', { n: n(d.invoices.failed30) })}</h3>
          <p>{o('decide.failedSub')}</p>
        </div>
        <button type="button" className="btn" onClick={() => go({ section: 'revenue' })}>
          <Icon name="coins" size={16} />
          {o('decide.toRevenue')}
        </button>
      </article>
    ),
  ].filter(Boolean);
  const shown = people.slice(0, 5);
  return (
    <section className="ocwait" aria-labelledby="oc-decide">
      <h2 className="ocsec__title" id="oc-decide">
        {o('decide.title')}
        {cards.length + people.length ? <span className="ccard__count">{n(d.approvalsPending + d.requests.new + d.invoices.failed30 + people.length)}</span> : null}
      </h2>
      {cards.length + people.length === 0 ? (
        <EmptyState icon="checkCircle" tone="done" compact title={o('decide.noneTitle')} body={o('decide.noneBody')}>
          <button type="button" className="btn" onClick={() => go({ section: 'plan' })}>
            <Icon name="target" size={16} />
            {o('decide.noneAction')}
          </button>
        </EmptyState>
      ) : (
        <>
          {cards.length ? <div className="ocwait__cards">{cards}</div> : null}
          {shown.length ? (
            <div className="ccard ccard--need">
              <h3 className="ccard__title">{o('decide.people')}</h3>
              <ul className="cneeds">
                {shown.map((a, i) => (
                  <li key={`${a.kind}:${i}`}>
                    <button type="button" className="cneed" data-kind={a.kind} onClick={() => (a.kind === 'request' ? go({ section: 'support', r: a.ref }) : go({ section: 'customers', c: a.orgId }))}>
                      <span className="cneed__icon" aria-hidden="true">
                        <Icon name={a.kind === 'request' ? 'lifebuoy' : a.kind === 'payment' ? 'alert' : 'hourglass'} size={16} />
                      </span>
                      <span className="cneed__main">
                        <span className="cneed__what">{a.kind === 'request' ? a.title : o(a.kind === 'payment' ? 'need.payment' : 'need.trial', { company: a.company })}</span>
                        <span className="cneed__meta">{[a.kind === 'request' ? a.company : null, a.at ? formatDate(a.at, locale, { day: 'numeric', month: 'short' }) : null].filter(Boolean).join(' · ')}</span>
                        {a.kind === 'request' && a.blocking ? (
                          <span className="flag flag--late">
                            <Icon name="alert" size={12} />
                            {t('desk.blocking')}
                          </span>
                        ) : null}
                      </span>
                      <Icon name="chevronRight" size={16} className="cneed__go" />
                    </button>
                  </li>
                ))}
              </ul>
              {people.length > shown.length ? (
                <button type="button" className="btn btn--small btn--quiet" onClick={() => go({ section: 'support' })}>
                  <Icon name="lifebuoy" size={14} />
                  {o('decide.more', { n: n(people.length - shown.length) })}
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
function Bar({ value, tone }: { value: number; tone?: Pace }) {
  return (
    <span className="ocprogress" data-pace={tone} aria-hidden="true">
      <i style={{ '--w': `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` } as React.CSSProperties} />
    </span>
  );
}

// ================================================================ revenue

export function RevenueSection({ beat, failed, go }: { beat: number; failed: (e: unknown) => void; go: OwnerGo }) {
  const { o, locale } = useOwnerWords();
  const { data, error, reload } = useData<OwnerRevenue>('/owner/revenue', beat, failed);
  return (
    <Page wide title={o('nav.revenue')} sub={o('revenue.sub')}>
      <Loading data={data} error={error} reload={reload} cards>
        {(d) => {
          const usd = (v: number) => formatMoney(v, d.currency, locale);
          return (
            <>
              <div className="octiles">
                <Tile lead label={o('tile.mrr')} value={usd(d.mrr)} sub={o('tile.arr', { amount: usd(d.arr) })} />
                <Tile label={o('revenue.paid')} value={formatNumber(d.totals.paid, locale)} sub={usd(d.totals.paidAmount)} tone="done" />
                <Tile label={o('revenue.failed')} value={formatNumber(d.totals.failed, locale)} tone={d.totals.failed ? 'late' : undefined} />
                <Tile label={o('revenue.upcoming')} value={formatNumber(d.upcoming.length, locale)} />
              </div>
              <div className="occols occols--2">
                <section className="ccard" aria-labelledby="oc-inv">
                  <h2 className="ccard__title" id="oc-inv">{o('revenue.invoices')}</h2>
                  {d.invoices.length === 0 ? (
                    <EmptyState compact icon="coins" title={o('revenue.noInvoices')} />
                  ) : (
                    <table className="octable">
                      <thead>
                        <tr>
                          <th scope="col">{o('col.company')}</th>
                          <th scope="col">{o('col.date')}</th>
                          <th scope="col">{o('col.status')}</th>
                          <th scope="col" className="num">{o('col.amount')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.invoices.map((i, k) => (
                          <tr key={k}>
                            <td>
                              <button type="button" className="oclink" onClick={() => go({ section: 'customers', c: i.orgId })}>
                                {i.company}
                              </button>
                            </td>
                            <td>{i.issuedAt ? formatDate(i.issuedAt, locale, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>
                            <td>
                              <Pill tone={/paid|completed/.test(i.status) ? 'done' : /fail|past/.test(i.status) ? 'late' : undefined}>
                                {o(/paid|completed/.test(i.status) ? 'inv.paid' : /fail|past/.test(i.status) ? 'inv.failed' : 'inv.other')}
                              </Pill>
                            </td>
                            <td className="num">{formatMoney(i.amountCents / 100, i.currency, locale)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </section>
                <div className="occolstack">
                  {d.trend.length > 1 ? (
                    <section className="ccard" aria-labelledby="oc-trend">
                      <h2 className="ccard__title" id="oc-trend">{o('revenue.trend')}</h2>
                      <ConsoleChart kind="line" points={d.trend} label={o('revenue.trend')} value={(v) => usd(v)} tick={(v, s) => formatMoney(v, d.currency, locale, { compact: s })} when={(p) => periodOf(p, locale)} />
                    </section>
                  ) : null}
                  <section className="ccard" aria-labelledby="oc-up">
                    <h2 className="ccard__title" id="oc-up">{o('revenue.upcomingTitle')}</h2>
                    {d.upcoming.length === 0 ? (
                      <p className="oc__muted">{o('revenue.noUpcoming')}</p>
                    ) : (
                      <ul className="oclist">
                        {d.upcoming.map((u) => (
                          <li key={u.orgId}>
                            <button type="button" className="oclink" onClick={() => go({ section: 'customers', c: u.orgId })}>
                              {u.company}
                            </button>
                            <span>{formatDate(u.at, locale, { day: 'numeric', month: 'short' })}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </div>
              </div>
            </>
          );
        }}
      </Loading>
    </Page>
  );
}

// ================================================================ trials & free

export function TrialsSection({ beat, failed, go }: { beat: number; failed: (e: unknown) => void; go: OwnerGo }) {
  const { o, locale } = useOwnerWords();
  const { data, error, reload } = useData<{ trials: OwnerTrial[] }>('/owner/trials', beat, failed);
  const [state, setState] = useState<'all' | OwnerTrial['state']>('all');
  const rows = (data?.trials ?? []).filter((t) => state === 'all' || t.state === state);
  return (
    <Page
      wide
      title={o('nav.trials')}
      sub={o('trials.sub')}
      tools={
        <div className="ocseg" role="group" aria-label={o('trials.filter')}>
          {(['all', 'trial', 'expired', 'free'] as const).map((s) => (
            <button key={s} type="button" aria-pressed={state === s} onClick={() => setState(s)}>
              {o(`trials.${s}` as OwnerKey)}
              {data ? <span className="desk__count">{formatNumber(s === 'all' ? data.trials.length : data.trials.filter((t) => t.state === s).length, locale)}</span> : null}
            </button>
          ))}
        </div>
      }
    >
      <Loading data={data} error={error} reload={reload}>
        {() =>
          rows.length === 0 ? (
            <EmptyState icon="hourglass" title={o('trials.empty')} />
          ) : (
            <div className="ccard octablewrap">
              <table className="octable">
                <thead>
                  <tr>
                    <th scope="col">{o('col.company')}</th>
                    <th scope="col">{o('col.state')}</th>
                    <th scope="col">{o('col.ends')}</th>
                    <th scope="col" className="num">{o('col.seats')}</th>
                    <th scope="col">{o('col.departments')}</th>
                    <th scope="col">{o('col.lastActive')}</th>
                    <th scope="col">{o('col.request')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => (
                    <tr key={t.orgId}>
                      <td>
                        <button type="button" className="oclink" onClick={() => go({ section: 'customers', c: t.orgId })}>
                          {t.company}
                        </button>
                      </td>
                      <td>
                        <Pill tone={t.state === 'expired' ? 'late' : t.state === 'trial' && t.daysLeft != null && t.daysLeft <= 7 ? 'soon' : undefined}>
                          {o(`trials.${t.state}` as OwnerKey)}
                        </Pill>
                      </td>
                      <td>{t.endsAt ? `${formatDate(t.endsAt, locale, { day: 'numeric', month: 'short', year: 'numeric' })}${t.daysLeft != null && t.daysLeft > 0 ? ` · ${o('trials.daysLeft', { n: t.daysLeft })}` : ''}` : '—'}</td>
                      <td className="num" data-over={t.seatCap != null && t.people > t.seatCap ? '' : undefined}>
                        {t.seatCap != null ? o('trials.seatsOf', { n: formatNumber(t.people, locale), cap: formatNumber(t.seatCap, locale) }) : formatNumber(t.people, locale)}
                      </td>
                      <td>{t.departments.length ? t.departments.map((x) => o(`dept.${x}` as OwnerKey)).join(', ') : '—'}</td>
                      <td>{t.lastActiveAt ? formatDate(t.lastActiveAt, locale, { day: 'numeric', month: 'short' }) : '—'}</td>
                      <td>
                        {t.fromRequest ? (
                          <button type="button" className="oclink" onClick={() => go({ section: 'requests', q: t.fromRequest })}>
                            {t.fromRequest}
                          </button>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </Loading>
    </Page>
  );
}

// ================================================================ trial requests

type RequestList = { requests: TrialRequestRow[]; settings: { 'trial.seatCap': number; 'trial.months': number } };

export function RequestsSection({ beat, failed, open, go }: { beat: number; failed: (e: unknown) => void; open: string | null; go: OwnerGo }) {
  const { o } = useOwnerWords();
  const { t } = useI18n();
  const [status, setStatus] = useState<'open' | 'new' | 'contacted' | 'approved' | 'rejected' | 'all'>('open');
  const list = useData<RequestList>(`/owner/requests?status=${status}`, beat, failed);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const rows = useMemo(() => list.data?.requests ?? [], [list.data]);
  const chosen = open && /^TQ-/.test(open) ? (rows.find((r) => r.ref === open)?.id ?? null) : open;
  useEffect(() => {
    if (!open && rows.length && window.matchMedia('(min-width: 1080px)').matches) go({ section: 'requests', q: rows[0].id });
  }, [open, rows, go]);
  return (
    <Page
      wide
      title={o('nav.requests')}
      sub={o('requests.sub')}
      tools={
        <>
          <div className="ocseg" role="group" aria-label={o('requests.filter')}>
            {(['open', 'new', 'contacted', 'approved', 'rejected', 'all'] as const).map((s) => (
              <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)}>
                {o(`req.status.${s}` as OwnerKey)}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn--small" aria-expanded={settingsOpen} onClick={() => setSettingsOpen((x) => !x)}>
            <Icon name="sliders" size={14} />
            {o('requests.settings')}
          </button>
        </>
      }
    >
      {settingsOpen && list.data ? <RequestSettings settings={list.data.settings} onSaved={list.reload} failed={failed} /> : null}
      <Loading data={list.data} error={list.error} reload={list.reload}>
        {() =>
          rows.length === 0 ? (
            <EmptyState icon="form" title={o('requests.empty')} body={o('requests.emptyBody')} />
          ) : (
            <div className="ocsplit" data-open={chosen ? '' : undefined}>
              <ul className="ocreqs" aria-label={o('nav.requests')}>
                {rows.map((r) => (
                  <li key={r.id}>
                    <button type="button" className="ocreq" aria-current={chosen === r.id ? 'true' : undefined} onClick={() => go({ section: 'requests', q: r.id })}>
                      <span className="ocreq__top">
                        <strong>{r.company}</strong>
                        <Pill tone={r.status === 'new' ? 'soon' : r.status === 'approved' ? 'done' : r.status === 'rejected' ? 'late' : undefined}>
                          {o(`req.status.${r.status}` as OwnerKey)}
                        </Pill>
                      </span>
                      <span className="ocreq__meta">
                        {r.name} · {r.country} · {r.seats ? o('req.seats', { n: r.seats }) : '—'} · {relativeTime(r.createdAt, t)}
                      </span>
                      {r.duplicateOf ? <span className="flag flag--soon">{o('req.duplicateOf', { ref: r.duplicateOf })}</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
              <div className="ocreqdetail">
                {chosen ? (
                  <RequestDetail key={chosen} id={chosen} beat={beat} failed={failed} defaults={list.data?.settings ?? { 'trial.seatCap': 25, 'trial.months': 3 }} onDecided={list.reload} onBack={() => go({ section: 'requests' })} go={go} />
                ) : (
                  <EmptyState icon="form" title={o('requests.pick')} />
                )}
              </div>
            </div>
          )
        }
      </Loading>
    </Page>
  );
}

function RequestSettings({ settings, onSaved, failed }: { settings: RequestList['settings']; onSaved: () => void; failed: (e: unknown) => void }) {
  const { o } = useOwnerWords();
  const [cap, setCap] = useState(String(settings['trial.seatCap']));
  const [months, setMonths] = useState(String(settings['trial.months']));
  const [saved, setSaved] = useState(false);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api('PUT', '/owner/settings', { 'trial.seatCap': Number(cap), 'trial.months': Number(months) });
      setSaved(true);
      onSaved();
    } catch (err) {
      failed(err);
    }
  };
  return (
    <form className="ccard ocsettings" onSubmit={save}>
      <label>
        <span>{o('settings.seatCap')}</span>
        <input className="input input--num" type="number" min={1} max={100000} value={cap} onChange={(e) => (setCap(e.target.value), setSaved(false))} />
      </label>
      <label>
        <span>{o('settings.months')}</span>
        <input className="input input--num" type="number" min={1} max={12} value={months} onChange={(e) => (setMonths(e.target.value), setSaved(false))} />
      </label>
      <p className="oc__muted">{o('settings.note')}</p>
      <button type="submit" className="btn btn--small btn--primary">
        {saved ? o('common.saved') : o('common.save')}
      </button>
    </form>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  if (value == null || value === '' || (Array.isArray(value) && !value.length)) return null;
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function addMonths(months: number): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate())).toISOString().slice(0, 10);
}

function RequestDetail({ id, beat, failed, defaults, onDecided, onBack, go }: { id: string; beat: number; failed: (e: unknown) => void; defaults: RequestList['settings']; onDecided: () => void; onBack: () => void; go: OwnerGo }) {
  const { o, locale } = useOwnerWords();
  const { data, error, reload } = useData<TrialRequestDetail>(`/owner/requests/${id}`, beat, failed);
  // The owner's choices; until he changes one, the request's own (or the console's default).
  const [depsSet, setDeps] = useState<TrialDepartment[] | null>(null);
  const [capSet, setCap] = useState<string | null>(null);
  const [endsSet, setEnds] = useState<string | null>(null);
  const deps = depsSet ?? (data ? (data.departments.length ? data.departments : (['sales'] as TrialDepartment[])) : null);
  const cap = capSet ?? (data?.seats ? String(Math.min(data.seats, defaults['trial.seatCap'])) : String(defaults['trial.seatCap']));
  const ends = endsSet ?? addMonths(defaults['trial.months']);
  const [mode, setMode] = useState<'none' | 'approve' | 'reject'>('none');
  const [reason, setReason] = useState('');
  const [draft, setDraft] = useState<{ subject: string; draft: string; to: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setProblem(null);
    try {
      await fn();
      reload();
      onDecided();
    } catch (e) {
      const code = (e as OwnerError).body as { error?: { code?: string } } | null;
      setProblem(code?.error?.code === 'slug_taken' ? o('req.slugTaken') : o('req.failed'));
      failed(e);
    } finally {
      setBusy(false);
    }
  };
  if (!data) return error ? <LoadError onRetry={reload} /> : <SkeletonRows rows={6} label={o('common.loading')} />;
  const d = data;
  const decided = d.status === 'approved' || d.status === 'rejected';
  const day = (iso: string | null) => (iso ? formatDate(iso, locale, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
  const toolList = (Object.entries(d.tools) as [string, string[] | string | null | undefined][])
    .filter(([, v]) => (Array.isArray(v) ? v.length : !!v))
    .map(([k, v]) => `${o(`tool.${k}` as OwnerKey)}: ${Array.isArray(v) ? v.join(', ') : v}`);
  return (
    <article className="ocreqcard" aria-labelledby="oc-req-h">
      <button type="button" className="btn btn--quiet btn--small ocback" onClick={onBack}>
        <Icon name="arrowLeft" size={14} />
        {o('common.back')}
      </button>
      <header className="ocreqcard__head">
        <div>
          <p className="oc__ref">
            {d.ref} · {day(d.createdAt)}
          </p>
          <h2 className="ocreqcard__title" id="oc-req-h">{d.company}</h2>
          <p className="oc__muted">
            {d.name}
            {d.title ? `, ${d.title}` : ''} · {d.email}
          </p>
        </div>
        <Pill tone={d.status === 'new' ? 'soon' : d.status === 'approved' ? 'done' : d.status === 'rejected' ? 'late' : undefined}>
          {o(`req.status.${d.status}` as OwnerKey)}
        </Pill>
      </header>
      <div className="ocflags">
        {d.duplicates.length ? <span className="flag flag--soon">{o('req.duplicates', { refs: d.duplicates.map((x) => x.ref).join(', ') })}</span> : null}
        {d.freeMailNote ? <span className="flag flag--soon">{o('req.freeMail', { note: d.freeMailNote })}</span> : null}
        {d.emailVerifiedAt ? <span className="flag">{o('req.verified')}</span> : null}
      </div>

      <div className="ocreqgrid">
        <section>
          <h3 className="ocreq__h">{o('req.person')}</h3>
          <dl className="ocdl">
            <Field label={o('req.email')} value={d.email} />
            <Field label={o('req.phone')} value={d.phone} />
            <Field
              label={o('req.linkedin')}
              value={
                d.linkedinUrl ? (
                  <a href={d.linkedinUrl} target="_blank" rel="noopener noreferrer nofollow">
                    {d.linkedinUrl.replace(/^https:\/\/(www\.)?/, '')}
                  </a>
                ) : null
              }
            />
            <Field label={o('req.language')} value={LOCALE_INFO[normalizeLocale(d.language)]?.name ?? d.language} />
            <Field label={o('req.contactTime')} value={d.contactTime} />
          </dl>
        </section>
        <section>
          <h3 className="ocreq__h">{o('req.company')}</h3>
          <dl className="ocdl">
            <Field label={o('req.website')} value={d.website} />
            <Field label={o('req.place')} value={[d.city, d.country].filter(Boolean).join(', ')} />
            <Field label={o('req.industry')} value={d.industry} />
            <Field label={o('req.size')} value={d.companySize} />
            <Field label={o('req.teamSize')} value={d.teamSize} />
            <Field label={o('req.customers')} value={d.customersManaged} />
          </dl>
        </section>
        <section>
          <h3 className="ocreq__h">{o('req.needs')}</h3>
          <dl className="ocdl">
            <Field label={o('req.departments')} value={d.departments.map((x) => o(`dept.${x}` as OwnerKey)).join(', ')} />
            <Field
              label={o('req.seatsAsked')}
              value={
                d.seats
                  ? `${d.seats}${Object.keys(d.seatsByDepartment).length ? ` (${Object.entries(d.seatsByDepartment).map(([k, v]) => `${o(`dept.${k}` as OwnerKey)} ${v}`).join(', ')})` : ''}`
                  : null
              }
            />
            <Field label={o('req.problems')} value={[d.problems.join(', '), d.problemText].filter(Boolean).join(' — ')} />
            <Field label={o('req.tools')} value={toolList.join(' · ')} />
            <Field label={o('req.timeline')} value={d.timeline} />
            <Field label={o('req.heard')} value={[d.heardFrom, d.source].filter(Boolean).join(' · ')} />
          </dl>
        </section>
        <section>
          <h3 className="ocreq__h">{o('req.consent')}</h3>
          <ul className="occonsents">
            {d.consents.map((c) => (
              <li key={c.key} data-granted={c.granted ? '' : undefined}>
                <Icon name={c.granted ? 'check' : 'close'} size={14} />
                <span title={c.key}>{consentLabel(c.key, o)}</span>
                <span className="oc__muted">v{c.version}</span>
              </li>
            ))}
            <li data-granted={d.marketing ? '' : undefined}>
              <Icon name={d.marketing ? 'check' : 'close'} size={14} />
              <span>{o('req.marketing')}</span>
            </li>
          </ul>
          <p className="oc__muted">{o('req.consentNote', { country: d.ipCountry ?? '—' })}</p>
        </section>
      </div>

      {decided ? (
        <section className="ocdecided" aria-label={o('req.decision')}>
          {d.status === 'approved' ? (
            <>
              <p>
                {o('req.approvedLine', { by: d.decidedBy ?? '', date: day(d.decidedAt), cap: d.seatCap ?? '—', ends: day(d.trialEndsAt) })}
              </p>
              {d.orgId ? (
                <button type="button" className="btn btn--small" onClick={() => go({ section: 'customers', c: d.orgId })}>
                  <Icon name="building" size={14} />
                  {o('req.openCompany')}
                </button>
              ) : null}
            </>
          ) : (
            <>
              <p>{o('req.rejectedLine', { by: d.decidedBy ?? '', date: day(d.decidedAt) })}</p>
              {d.replyDraft ? <ReplyDraft to={d.email} subject={draft?.subject ?? o('req.replySubject', { company: d.company })} body={d.replyDraft} /> : null}
            </>
          )}
        </section>
      ) : (
        <section className="ocdecide" aria-label={o('req.decision')}>
          {mode === 'approve' && deps ? (
            <form
              className="ocapprove"
              onSubmit={(e) => {
                e.preventDefault();
                void act(() => api('POST', `/owner/requests/${id}/approve`, { departments: deps, seatCap: Number(cap), endsOn: ends || null }));
              }}
            >
              <fieldset className="ocdeps">
                <legend>{o('req.departments')}</legend>
                {TRIAL_DEPARTMENTS.map((x) => (
                  <label key={x} className="occheck">
                    <input type="checkbox" checked={deps.includes(x)} onChange={(e) => setDeps(e.target.checked ? [...deps, x] : deps.filter((y) => y !== x))} />
                    {o(`dept.${x}` as OwnerKey)}
                  </label>
                ))}
              </fieldset>
              <label className="ocfield">
                <span>{o('req.seatCap')}</span>
                <input className="input input--num" type="number" min={1} max={100000} required value={cap} onChange={(e) => setCap(e.target.value)} />
              </label>
              <div className="ocfield">
                <span>{o('req.endsOn')}</span>
                <DateField value={ends} onChange={setEnds} min={new Date().toISOString().slice(0, 10)} label={o('req.endsOn')} />
              </div>
              <p className="oc__muted ocapprove__note">{o('req.approveNote', { email: d.email })}</p>
              <div className="ocbuttons">
                <button type="submit" className="btn btn--primary" disabled={busy || !deps.length}>
                  <Icon name="check" size={16} />
                  {o('req.approveNow')}
                </button>
                <button type="button" className="btn btn--quiet" onClick={() => setMode('none')}>
                  {o('common.cancel')}
                </button>
              </div>
            </form>
          ) : mode === 'reject' ? (
            <form
              className="ocapprove"
              onSubmit={(e) => {
                e.preventDefault();
                void act(async () => setDraft(await api('POST', `/owner/requests/${id}/reject`, { reason: reason || null })));
              }}
            >
              <label className="ocfield ocfield--wide">
                <span>{o('req.reason')}</span>
                <textarea className="textarea" rows={3} value={reason} maxLength={2000} onChange={(e) => setReason(e.target.value)} />
              </label>
              <p className="oc__muted ocapprove__note">{o('req.rejectNote')}</p>
              <div className="ocbuttons">
                <button type="submit" className="btn btn--danger" disabled={busy}>
                  {o('req.rejectNow')}
                </button>
                <button type="button" className="btn btn--quiet" onClick={() => setMode('none')}>
                  {o('common.cancel')}
                </button>
              </div>
            </form>
          ) : (
            <div className="ocbuttons">
              <button type="button" className="btn btn--primary" onClick={() => setMode('approve')} aria-keyshortcuts="y">
                <Icon name="check" size={16} />
                {o('req.approve')}
              </button>
              {d.status === 'new' ? (
                <button type="button" className="btn" disabled={busy} onClick={() => void act(() => api('POST', `/owner/requests/${id}/contacted`, { note: null }))}>
                  <Icon name="phone" size={16} />
                  {o('req.contacted')}
                </button>
              ) : null}
              <button type="button" className="btn btn--danger" onClick={() => setMode('reject')}>
                {o('req.reject')}
              </button>
            </div>
          )}
          {problem ? <p className="flag flag--late">{problem}</p> : null}
        </section>
      )}
      {draft && d.status !== 'rejected' ? <ReplyDraft to={draft.to} subject={draft.subject} body={draft.draft} /> : null}
    </article>
  );
}

function ReplyDraft({ to, subject, body }: { to: string; subject: string; body: string }) {
  const { o } = useOwnerWords();
  const [copied, setCopied] = useState(false);
  return (
    <div className="ocdraft">
      <p className="ocreq__h">{o('req.draftTitle')}</p>
      <pre className="ocdraft__text">{body}</pre>
      <div className="ocbuttons">
        <button
          type="button"
          className="btn btn--small"
          onClick={() =>
            void navigator.clipboard?.writeText(body).then(() => {
              setCopied(true);
            })
          }
        >
          <Icon name="copy" size={14} />
          {copied ? o('common.copied') : o('common.copy')}
        </button>
        <a className="btn btn--small" href={`mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}>
          <Icon name="mail" size={14} />
          {o('req.openMail')}
        </a>
      </div>
    </div>
  );
}

// ================================================================ approvals

/** How long a decision waits in this tab before it is sent, so it can be taken back (Undo or Z). */
export const HOLD_MS = 7000;
type Verdict = { decision: 'approve'; edits?: Record<string, string> } | { decision: 'reject'; note: string | null } | { decision: 'meeting' };
interface Held {
  a: Approval;
  body: Verdict;
  until: number;
  timer: number;
}

/**
 * The approval queue: the waiting proposals on one side, the one being decided beside them, the latest decisions
 * after. Keys: A approve, R reject, E edit, M meeting, J / K next and previous, Z undo.
 *
 * AI approval gate (ADR 0011, api/src/team/gate.ts): a decision is still only the owner's own act in his own
 * session, sent to the same /decide route with the same body. What changes is when: the decision waits HOLD_MS in
 * this tab and can be taken back before it leaves, because once the server has it an approved action may already
 * have run (there is no "unapprove"). Leaving the page sends what is waiting; closing the tab sends it too
 * (keepalive). Nothing here can decide without the owner's key press or click.
 */
export function ApprovalsSection({ beat, failed, go }: { beat: number; failed: (e: unknown) => void; go: OwnerGo }) {
  const { o, locale } = useOwnerWords();
  const pending = useData<{ approvals: Approval[] }>('/office/approvals?status=open', beat, failed);
  const seats = useData<{ seats: Seat[] }>('/office/seats', beat, failed);
  /** A seat by the agent's name and its title ("Vela · Chief Financial Officer"); the seat key while unknown. */
  const who = (seat: string) => {
    const x = seats.data?.seats.find((y) => y.seat === seat);
    return x ? [x.agent?.name, x.title].filter(Boolean).join(' · ') : seat;
  };
  const recent = useData<{ approvals: Approval[] }>('/office/approvals?status=all', beat, failed);
  const [held, setHeld] = useState<Held[]>([]);
  const heldRef = useRef<Held[]>([]);
  heldRef.current = held;
  const [curId, setCurId] = useState<string | null>(null);
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null);
  const [, tick] = useState(0);
  const list = (pending.data?.approvals ?? []).filter((a) => !held.some((h) => h.a.id === a.id));
  const at = Math.max(0, list.findIndex((a) => a.id === curId));
  const cur = list[at];
  const decidedList = (recent.data?.approvals ?? []).filter((a) => a.status !== 'pending').slice(0, 12);

  const send = useCallback(
    (h: Held, keepalive = false) => {
      window.clearTimeout(h.timer);
      setHeld((x) => x.filter((y) => y !== h));
      api('POST', `/office/approvals/${h.a.id}/decide`, h.body, keepalive)
        .catch((e) => {
          failed(e);
          setNote({ text: o('approvals.sendFailed', { title: h.a.title }), bad: true });
        })
        .finally(() => {
          pending.reload();
          recent.reload();
        });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload functions change identity each render; the latest is read when it runs
    [failed, o],
  );
  /** The owner decided: the card leaves the queue now, the decision leaves the tab after HOLD_MS. */
  const hold = (a: Approval, body: Verdict) => {
    const next = list[at + 1] ?? list[at - 1];
    setCurId(next?.id ?? null);
    setNote(null);
    const h: Held = { a, body, until: Date.now() + HOLD_MS, timer: 0 };
    h.timer = window.setTimeout(() => send(h), HOLD_MS);
    setHeld((x) => [...x, h]);
  };
  const undo = useCallback(() => {
    const h = heldRef.current[heldRef.current.length - 1];
    if (!h) return;
    window.clearTimeout(h.timer);
    setHeld((x) => x.filter((y) => y !== h));
    setCurId(h.a.id);
    setNote({ text: o('approvals.undone', { title: h.a.title }) });
  }, [o]);
  // The countdown on the undo bar, once a second while something waits.
  useEffect(() => {
    if (!held.length) return;
    const id = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [held.length]);
  // Leaving the section or closing the tab sends what the owner already decided (once, on the way out: a change
  // of language must not send early, so the latest `send` is read through a ref).
  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(() => {
    const out = () => heldRef.current.forEach((h) => sendRef.current(h, true));
    window.addEventListener('pagehide', out);
    return () => {
      window.removeEventListener('pagehide', out);
      out();
    };
  }, []);
  // Z (or Ctrl/⌘+Z) takes back the latest, while the focus is not in a text.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.altKey || e.key.toLowerCase() !== 'z' || typingIn(e.target) || !heldRef.current.length) return;
      e.preventDefault();
      e.stopPropagation();
      undo();
    };
    window.addEventListener('keydown', on, true);
    return () => window.removeEventListener('keydown', on, true);
  }, [undo]);
  const step = (d: number) => {
    const next = list[at + d];
    if (next) setCurId(next.id);
  };
  const last = held[held.length - 1];
  const resultText = (a: Approval) => {
    if (!a.result || a.status === 'failed') return null;
    if (a.result === 'Decision recorded.') return o('approvals.result.recorded');
    const q = /^Queued for ([^:]+): (.*)$/s.exec(a.result);
    return q ? o('approvals.result.queued', { seat: who(q[1]), title: q[2] }) : a.result;
  };
  return (
    <Page
      wide
      title={o('nav.approvals')}
      sub={o('approvals.sub')}
      tools={
        list.length > 1 ? (
          <div className="ocpager">
            <button type="button" className="btn btn--icon btn--small" aria-label={o('common.previous')} aria-keyshortcuts="k" disabled={at === 0} onClick={() => step(-1)}>
              <Icon name="chevronLeft" size={16} />
            </button>
            <span>{o('approvals.counter', { i: formatNumber(at + 1, locale), n: formatNumber(list.length, locale) })}</span>
            <button type="button" className="btn btn--icon btn--small" aria-label={o('common.next')} aria-keyshortcuts="j" disabled={at >= list.length - 1} onClick={() => step(1)}>
              <Icon name="chevronRight" size={16} />
            </button>
          </div>
        ) : undefined
      }
    >
      <Loading data={pending.data} error={pending.error} reload={pending.reload}>
        {() => (
          <>
            {note ? (
              <p className={note.bad ? 'flag flag--late ocnote' : 'flag ocnote'} role={note.bad ? 'alert' : 'status'}>
                <Icon name={note.bad ? 'alert' : 'undo'} size={14} />
                {note.text}
              </p>
            ) : null}
            <div className="ocq" data-empty={cur ? undefined : ''}>
              {list.length > 1 ? (
                <nav className="ocq__list ccard" aria-label={o('approvals.queueLabel')}>
                  <h2 className="ccard__title">
                    {o('approvals.queue')}
                    <span className="ccard__count">{formatNumber(list.length, locale)}</span>
                  </h2>
                  <ol>
                    {list.map((a) => (
                      <li key={a.id}>
                        <button type="button" className="ocq__item" aria-current={a.id === cur?.id ? 'true' : undefined} onClick={() => setCurId(a.id)}>
                          <span className="ocq__title">{a.title}</span>
                          <span className="ocq__meta">
                            {a.priority === 'urgent' ? <Pill tone="late">{o('ap.priority.urgent')}</Pill> : null}
                            <span>{who(a.proposedBy)}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ol>
                </nav>
              ) : null}
              <div className="ocq__card">
                {cur ? (
                  <ApprovalCard key={cur.id} a={cur} who={who} failed={failed} onDone={() => undefined} go={go} onDecide={(body) => hold(cur, body)} keys={{ next: () => step(1), prev: () => step(-1) }} />
                ) : (
                  <EmptyState icon="checkCircle" tone="done" title={o('approvals.none')} body={o('approvals.noneBody')}>
                    <button type="button" className="btn" onClick={() => go({ section: 'today' })}>
                      <Icon name="gauge" size={16} />
                      {o('nav.overview')}
                    </button>
                  </EmptyState>
                )}
                {cur ? <p className="oc__muted ocq__keys">{o('approvals.keys')}</p> : null}
              </div>
              <section className="ccard ocq__recent" aria-labelledby="oc-decided">
                <h2 className="ccard__title" id="oc-decided">{o('approvals.recent')}</h2>
                {decidedList.length === 0 ? (
                  <p className="oc__muted">{o('approvals.noRecentBody')}</p>
                ) : (
                  <ul className="oclist oclist--decided">
                    {decidedList.map((a) => (
                      <li key={a.id}>
                        <Pill tone={a.status === 'rejected' || a.status === 'failed' ? 'late' : a.status === 'meeting' ? 'soon' : 'done'}>{o(`ap.status.${a.status}` as OwnerKey)}</Pill>
                        <span className="oclist__main">
                          <strong>{a.title}</strong>
                          <span className="oc__muted" title={a.status === 'failed' && a.result ? a.result : undefined}>
                            {a.ref} · {a.decidedAt ? formatDate(a.decidedAt, locale, { day: 'numeric', month: 'short' }) : ''}
                            {resultText(a) ? ` · ${resultText(a)}` : ''}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="oc__muted oc__gap">{o('approvals.rule')}</p>
              </section>
            </div>
            {last ? (
              <div className="ocundo" role="status">
                <Icon name={last.body.decision === 'approve' ? 'checkCircle' : last.body.decision === 'reject' ? 'close' : 'people'} size={16} />
                <span className="ocundo__text">
                  <strong>{o(`approvals.held.${last.body.decision}` as OwnerKey, { title: last.a.title })}</strong>
                  <span>
                    {o('approvals.held.when', { s: formatNumber(Math.max(1, Math.ceil((last.until - Date.now()) / 1000)), locale) })}
                    {held.length > 1 ? ` · ${o('approvals.held.more', { n: formatNumber(held.length - 1, locale) })}` : ''}
                  </span>
                </span>
                <button type="button" className="btn ocundo__btn" onClick={undo} aria-keyshortcuts="z">
                  <Icon name="undo" size={16} />
                  {o('approvals.undo')}
                  <kbd className="ockey" aria-hidden="true">
                    Z
                  </kbd>
                </button>
              </div>
            ) : null}
          </>
        )}
      </Loading>
    </Page>
  );
}

/**
 * One proposal and the owner's choices on it. In the Office it sends the decision at once; in the console queue
 * (`onDecide`) it hands the decision to the queue, which holds it for Undo, and answers the queue's keys (`keys`).
 */
export function ApprovalCard({
  a,
  who: name,
  failed,
  onDone,
  go,
  onDecide,
  keys,
}: {
  a: Approval;
  who: (seat: string) => string;
  failed: (e: unknown) => void;
  onDone: () => void;
  go: OwnerGo;
  onDecide?: (body: Verdict) => void;
  keys?: { next: () => void; prev: () => void };
}) {
  const { o, locale } = useOwnerWords();
  const [mode, setMode] = useState<'view' | 'edit' | 'reject'>('view');
  const [title, setTitle] = useState(a.title);
  const [summary, setSummary] = useState(a.summary);
  const [changes, setChanges] = useState(a.whatChanges);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const decide = async (body: Verdict) => {
    if (onDecide) return onDecide(body);
    setBusy(true);
    try {
      await api('POST', `/office/approvals/${a.id}/decide`, body);
      onDone();
    } catch (e) {
      failed(e);
    } finally {
      setBusy(false);
    }
  };
  const who = a.discussedWith.length ? o('ap.talked', { a: name(a.proposedBy), b: a.discussedWith.map(name).join(', ') }) : o('ap.proposed', { a: name(a.proposedBy) });
  void go;
  const approveEdited = () => {
    const edits: Record<string, string> = {};
    if (title.trim() !== a.title) edits.title = title.trim();
    if (summary.trim() !== a.summary) edits.summary = summary.trim();
    if (changes.trim() !== a.whatChanges) edits.whatChanges = changes.trim();
    void decide({ decision: 'approve', edits });
  };
  // The queue's keys (console only). Capture phase, so the console's own section keys (A approvals, R requests)
  // do not fire while a proposal is open; a key typed into a field stays with the field.
  const live = useRef({ mode, note, busy });
  live.current = { mode, note, busy };
  useEffect(() => {
    if (!keys) return;
    const on = (e: KeyboardEvent) => {
      const { mode: m, note: n, busy: b } = live.current;
      if (b || e.altKey) return;
      const done = () => (e.preventDefault(), e.stopPropagation());
      if (m === 'reject' && (e.ctrlKey || e.metaKey) && e.key === 'Enter') return done(), void decide({ decision: 'reject', note: n.trim() || null });
      if (m !== 'view' && e.key === 'Escape') return done(), setMode('view');
      if (e.ctrlKey || e.metaKey || typingIn(e.target) || m !== 'view') return;
      const k = e.key.toLowerCase();
      if (k === 'a') done(), void decide({ decision: 'approve' });
      else if (k === 'r') done(), setMode('reject');
      else if (k === 'e') done(), setMode('edit');
      else if (k === 'm') done(), void decide({ decision: 'meeting' });
      else if (k === 'j') done(), keys.next();
      else if (k === 'k') done(), keys.prev();
    };
    window.addEventListener('keydown', on, true);
    return () => window.removeEventListener('keydown', on, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- decide reads the latest state through `live`
  }, [keys]);
  const kbd = (k: string) =>
    keys ? (
      <kbd className="ockey" aria-hidden="true">
        {k}
      </kbd>
    ) : null;
  return (
    <article className="ccard ocap" data-priority={a.priority} aria-labelledby="oc-ap-h">
      <p className="oc__ref">
        {a.ref} · {formatDate(a.createdAt, locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
        {a.priority !== 'normal' ? <Pill tone={a.priority === 'urgent' ? 'late' : undefined}>{o(`ap.priority.${a.priority}` as OwnerKey)}</Pill> : null}
      </p>
      <p className="ocap__who">{who}</p>
      {mode === 'edit' ? (
        <div className="ocapedit">
          <label className="ocfield ocfield--wide">
            <span>{o('ap.title')}</span>
            <input className="input" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="ocfield ocfield--wide">
            <span>{o('ap.summary')}</span>
            <textarea className="textarea" rows={3} value={summary} maxLength={4000} onChange={(e) => setSummary(e.target.value)} />
          </label>
          <label className="ocfield ocfield--wide">
            <span>{o('ap.whatChanges')}</span>
            <textarea className="textarea" rows={3} value={changes} maxLength={4000} onChange={(e) => setChanges(e.target.value)} />
          </label>
        </div>
      ) : (
        <>
          <h2 className="ocap__title" id="oc-ap-h">{a.title}</h2>
          {a.summary ? <p className="ocap__summary">{a.summary}</p> : null}
        </>
      )}
      <dl className="ocapfacts">
        {a.why ? (
          <div>
            <dt>{o('ap.why')}</dt>
            <dd>{a.why}</dd>
          </div>
        ) : null}
        {mode !== 'edit' && a.whatChanges ? (
          <div>
            <dt>{o('ap.whatChanges')}</dt>
            <dd>{a.whatChanges}</dd>
          </div>
        ) : null}
        <div>
          <dt>{o('ap.risk')}</dt>
          <dd>
            <Pill tone={a.risk === 'high' ? 'late' : a.risk === 'medium' ? 'soon' : 'done'}>
              {o(`ap.risk.${a.risk}` as OwnerKey)}
            </Pill>
            {a.riskNote ? ` ${a.riskNote}` : ''}
          </dd>
        </div>
        <div>
          <dt>{o('ap.cost')}</dt>
          <dd>
            {[a.costUsd != null ? formatMoney(a.costUsd, 'USD', locale) : null, a.usageTokens != null ? o('ap.tokens', { n: formatNumber(a.usageTokens, locale, { compact: true }) }) : null].filter(Boolean).join(' · ') || o('ap.noCost')}
          </dd>
        </div>
        <div>
          <dt>{o('ap.reversible')}</dt>
          <dd>
            {o(a.reversible ? 'ap.reversibleYes' : 'ap.reversibleNo')}
            {a.undoNote ? ` — ${a.undoNote}` : ''}
          </dd>
        </div>
        {a.link ? (
          <div>
            <dt>{o('ap.link')}</dt>
            <dd>
              <a href={a.link} target="_blank" rel="noopener noreferrer">
                {o('ap.openLink')}
              </a>
            </dd>
          </div>
        ) : null}
      </dl>
      {mode === 'reject' ? (
        <label className="ocfield ocfield--wide">
          <span>{o('ap.rejectNote')}</span>
          <textarea className="textarea" rows={2} value={note} maxLength={4000} onChange={(e) => setNote(e.target.value)} autoFocus={!!keys} />
          {keys ? <span className="oc__muted">{o('approvals.rejectKeys')}</span> : null}
        </label>
      ) : null}
      <div className="ocbuttons ocap__buttons">
        {mode === 'view' ? (
          <>
            <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void decide({ decision: 'approve' })} aria-keyshortcuts={keys ? 'a' : undefined}>
              <Icon name="check" size={16} />
              {o('ap.approve')}
              {kbd('A')}
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => setMode('edit')} aria-keyshortcuts={keys ? 'e' : undefined}>
              <Icon name="edit" size={16} />
              {o('ap.edit')}
              {kbd('E')}
            </button>
            <button type="button" className="btn btn--danger" disabled={busy} onClick={() => setMode('reject')} aria-keyshortcuts={keys ? 'r' : undefined}>
              <Icon name="close" size={16} />
              {o('ap.reject')}
              {kbd('R')}
            </button>
            <button type="button" className="btn btn--quiet" disabled={busy} onClick={() => void decide({ decision: 'meeting' })} aria-keyshortcuts={keys ? 'm' : undefined}>
              <Icon name="people" size={16} />
              {o('ap.meeting')}
              {kbd('M')}
            </button>
          </>
        ) : mode === 'edit' ? (
          <>
            <button type="button" className="btn btn--primary" disabled={busy || !title.trim()} onClick={approveEdited}>
              <Icon name="check" size={16} />
              {o('ap.approveEdited')}
            </button>
            <button type="button" className="btn btn--quiet" onClick={() => setMode('view')}>
              {o('common.cancel')}
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn--danger" disabled={busy} onClick={() => void decide({ decision: 'reject', note: note.trim() || null })} aria-keyshortcuts={keys ? 'Control+Enter' : undefined}>
              <Icon name="close" size={16} />
              {o('ap.rejectNow')}
            </button>
            <button type="button" className="btn btn--quiet" onClick={() => setMode('view')}>
              {o('common.cancel')}
            </button>
          </>
        )}
      </div>
    </article>
  );
}

// ================================================================ plan & targets

const nextMonths = (n: number) => {
  const d = new Date();
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + i, 1)).toISOString().slice(0, 7));
};

export function PlanSection({ beat, failed }: { beat: number; failed: (e: unknown) => void }) {
  const { o, locale } = useOwnerWords();
  const { data, error, reload, setData } = useData<OwnerPlan>('/owner/plan', beat, failed);
  const fmt = usePlanFormat();
  const months = useMemo(() => nextMonths(3), []);
  const [period, setPeriod] = useState(months[0]);
  // What the owner typed, by "period:metric"; anything untouched shows the stored target.
  const [typed, setEdit] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [task, setTask] = useState('');
  const [due, setDue] = useState(new Date().toISOString().slice(0, 10));
  const valueOf = (metric: string) => typed[`${period}:${metric}`] ?? String(data?.targets[metric]?.[period] ?? '');
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!data) return;
    try {
      const targets = data.rows.map((r) => ({ metric: r.metric, period, target: valueOf(r.metric).trim() === '' ? null : Number(valueOf(r.metric)) }));
      setData(await api<OwnerPlan>('PUT', '/owner/plan/targets', { targets }));
      setEdit({});
      setSaved(true);
    } catch (err) {
      failed(err);
    }
  };
  const addTask = async (e: FormEvent) => {
    e.preventDefault();
    if (!task.trim()) return;
    try {
      await api('POST', '/owner/plan/tasks', { title: task.trim(), dueOn: due });
      setTask('');
      reload();
    } catch (err) {
      failed(err);
    }
  };
  const toggle = async (id: string, done: boolean) => {
    try {
      await api('PATCH', `/owner/plan/tasks/${id}`, { done });
      reload();
    } catch (err) {
      failed(err);
    }
  };
  return (
    <Page wide title={o('nav.plan')} sub={data ? o('plan.sub', { month: periodOf(data.period, locale), pct: formatPercent(data.elapsed * 100, locale) }) : undefined}>
      <Loading data={data} error={error} reload={reload}>
        {(d) => {
          const isNow = period === d.period;
          return (
            <div className="occols occols--plan">
              <form className="ccard" onSubmit={save} aria-labelledby="oc-targets">
                <div className="ccard__row">
                  <h2 className="ccard__title" id="oc-targets">{o('plan.targets')}</h2>
                  <div className="ocseg" role="group" aria-label={o('plan.month')}>
                    {months.map((m) => (
                      <button key={m} type="button" aria-pressed={period === m} onClick={() => (setPeriod(m), setSaved(false))}>
                        {periodOf(m, locale)}
                      </button>
                    ))}
                  </div>
                </div>
                <table className="octable octable--plan">
                  <thead>
                    <tr>
                      <th scope="col">{o('plan.metric')}</th>
                      <th scope="col" className="num">{o('plan.target')}</th>
                      {isNow ? (
                        <>
                          <th scope="col" className="num">{o('plan.actual')}</th>
                          <th scope="col" className="num ocwide">{o('plan.expected')}</th>
                          <th scope="col">{o('plan.pace')}</th>
                        </>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {d.rows.map((r) => (
                      <tr key={r.metric}>
                        <th scope="row">{o(`metric.${r.metric}` as OwnerKey)}</th>
                        <td className="num">
                          <input
                            className="input input--num"
                            type="number"
                            min={0}
                            step="any"
                            aria-label={o('plan.targetFor', { metric: o(`metric.${r.metric}` as OwnerKey) })}
                            value={valueOf(r.metric)}
                            onChange={(e) => (setEdit({ ...typed, [`${period}:${r.metric}`]: e.target.value }), setSaved(false))}
                          />
                        </td>
                        {isNow ? (
                          <>
                            <td className="num">{r.actual == null ? <span className="oc__muted">{o('plan.notMeasured')}</span> : fmt(r.metric, r.actual)}</td>
                            <td className="num ocwide">{fmt(r.metric, r.expected)}</td>
                            <td>
                              <span className="ocpace" data-pace={r.pace}>
                                <Icon name={PACE_ICON[r.pace]} size={12} />
                                {o(`pace.${r.pace}` as OwnerKey)}
                              </span>
                              {r.target ? <Bar value={(r.actual ?? 0) / r.target} tone={r.pace} /> : null}
                            </td>
                          </>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="ocbuttons">
                  <button type="submit" className="btn btn--primary btn--small">
                    {saved ? o('common.saved') : o('plan.save')}
                  </button>
                  <span className="oc__muted">{o('plan.paceNote')}</span>
                </div>
              </form>

              <section className="ccard" aria-labelledby="oc-tasks">
                <h2 className="ccard__title" id="oc-tasks">{o('plan.tasks')}</h2>
                <form className="octaskadd" onSubmit={addTask}>
                  <input className="input" value={task} maxLength={300} placeholder={o('plan.taskPlaceholder')} aria-label={o('plan.taskPlaceholder')} onChange={(e) => setTask(e.target.value)} />
                  <DateField value={due} onChange={setDue} label={o('plan.due')} />
                  <button type="submit" className="btn btn--small" disabled={!task.trim()}>
                    <Icon name="plus" size={14} />
                    {o('plan.add')}
                  </button>
                </form>
                {(['overdue', 'today', 'week', 'month'] as const).map((k) =>
                  d.tasks[k].length || k !== 'overdue' ? (
                    <div key={k} className="octasks" data-kind={k}>
                      <h3 className="ocreq__h">
                        {o(`plan.when.${k}` as OwnerKey)} <span className="oc__muted">{formatNumber(d.tasks[k].length, locale)}</span>
                      </h3>
                      {d.tasks[k].length === 0 ? (
                        <p className="oc__muted">{o('plan.noTasks')}</p>
                      ) : (
                        <ul>
                          {d.tasks[k].map((x) => (
                            <li key={x.id}>
                              <label className="occheck" data-done={x.doneAt ? '' : undefined}>
                                <input type="checkbox" checked={!!x.doneAt} onChange={(e) => void toggle(x.id, e.target.checked)} />
                                <span>{x.title}</span>
                              </label>
                              <span className="oc__muted">{formatDate(x.dueOn, locale, { day: 'numeric', month: 'short' })}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : null,
                )}
              </section>
            </div>
          );
        }}
      </Loading>
    </Page>
  );
}

// ================================================================ checklist

export function ChecklistSection({ beat, failed }: { beat: number; failed: (e: unknown) => void }) {
  const { o, locale } = useOwnerWords();
  const { data, error, reload, setData } = useData<OwnerChecklist>('/owner/checklist', beat, failed);
  const [note, setNote] = useState('');
  const [evidence, setEvidence] = useState('');
  const [prio, setPrio] = useState<'all' | (typeof CHECKLIST_PRIORITIES)[number]>('all');
  const mark = async (item: string, status: 'done' | 'skipped' | 'todo') => {
    try {
      setData(await api<OwnerChecklist>('PUT', `/owner/checklist/${item}`, { status, note: note || null, evidence: evidence || null }));
      setNote('');
      setEvidence('');
    } catch (e) {
      failed(e);
    }
  };
  const cost = (e: ChecklistEntry) =>
    !e.cost
      ? o('check.free')
      : [e.cost.once ? o('check.once', { amount: formatMoney(e.cost.once, 'USD', locale) }) : null, e.cost.monthly ? o('check.monthly', { amount: formatMoney(e.cost.monthly, 'USD', locale) }) : null].filter(Boolean).join(' + ');
  return (
    <Page wide title={o('nav.checklist')} sub={o('check.sub')}>
      <Loading data={data} error={error} reload={reload}>
        {(d) => {
          const n = d.next;
          const steps = n ? o(`checklist.${n.id}.steps` as OwnerKey).split('\n').filter(Boolean) : [];
          return (
            <>
              <div className="occols occols--card">
                {n ? (
                  <article className="ccard ocnext" aria-labelledby="oc-next-h">
                    <p className="oc__ref">
                      {o('check.next')} · {o(`area.${n.area}` as OwnerKey)} · {o(`owner.${n.owner}` as OwnerKey)}
                      <Pill tone={n.triggered || n.priority === 'must' ? 'late' : undefined}>
                        {n.triggered ? o('check.triggered') : o(`prio.${n.priority}` as OwnerKey)}
                      </Pill>
                    </p>
                    <h2 className="ocap__title" id="oc-next-h">{o(`checklist.${n.id}.title` as OwnerKey)}</h2>
                    <p className="ocap__summary">{o(`checklist.${n.id}.why` as OwnerKey)}</p>
                    {n.triggered ? <p className="flag flag--late">{o('check.triggeredLine', { why: n.triggered.why, due: formatDate(n.triggered.due, locale, { day: 'numeric', month: 'long' }) })}</p> : null}
                    {!n.ready ? <p className="flag flag--soon">{o('check.after', { items: (n.after ?? []).map((x) => o(`checklist.${x}.title` as OwnerKey)).join(', ') })}</p> : null}
                    <ol className="ocsteps">
                      {steps.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ol>
                    <dl className="ocapfacts">
                      <div>
                        <dt>{o('check.cost')}</dt>
                        <dd>{cost(n)}</dd>
                      </div>
                      {n.links?.length ? (
                        <div>
                          <dt>{o('check.links')}</dt>
                          <dd>{n.links.join(', ')}</dd>
                        </div>
                      ) : null}
                    </dl>
                    <div className="ocnext__form">
                      <label className="ocfield ocfield--wide">
                        <span>{o('check.note')}</span>
                        <input className="input" value={note} maxLength={4000} onChange={(e) => setNote(e.target.value)} />
                      </label>
                      <label className="ocfield ocfield--wide">
                        <span>{o('check.evidence')}</span>
                        <input className="input" value={evidence} maxLength={1000} placeholder={n.proof} onChange={(e) => setEvidence(e.target.value)} />
                      </label>
                    </div>
                    <div className="ocbuttons ocap__buttons">
                      <button type="button" className="btn btn--primary" onClick={() => void mark(n.id, 'done')}>
                        <Icon name="check" size={16} />
                        {o('check.done')}
                      </button>
                      <button type="button" className="btn" onClick={() => void mark(n.id, 'skipped')}>
                        {o('check.later')}
                      </button>
                    </div>
                  </article>
                ) : (
                  <EmptyState icon="checkCircle" tone="done" title={o('check.allDone')} />
                )}
                <section className="ccard" aria-labelledby="oc-prog">
                  <h2 className="ccard__title" id="oc-prog">{o('check.progressTitle')}</h2>
                  <ul className="ocprog">
                    {(['all', ...CHECKLIST_AREAS, 'must', 'nice'] as const).map((k) => {
                      const p = d.progress[k] ?? { done: 0, total: 0 };
                      return (
                        <li key={k}>
                          <span>{k === 'all' ? o('check.all') : k === 'must' || k === 'nice' ? o(`prio.${k}` as OwnerKey) : o(`area.${k}` as OwnerKey)}</span>
                          <span className="oc__muted">
                            {formatNumber(p.done, locale)}/{formatNumber(p.total, locale)}
                          </span>
                          <Bar value={p.total ? p.done / p.total : 0} />
                        </li>
                      );
                    })}
                  </ul>
                </section>
              </div>

              <section className="ccard oc__gap" aria-labelledby="oc-all">
                <div className="ccard__row">
                  <h2 className="ccard__title" id="oc-all">{o('check.list')}</h2>
                  <div className="ocseg" role="group" aria-label={o('check.filter')}>
                    {(['all', ...CHECKLIST_PRIORITIES] as const).map((p) => (
                      <button key={p} type="button" aria-pressed={prio === p} onClick={() => setPrio(p)}>
                        {p === 'all' ? o('check.all') : o(`prio.${p}` as OwnerKey)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="ocareas">
                  {CHECKLIST_AREAS.map((area) => (
                    <div key={area}>
                      <h3 className="ocreq__h">{o(`area.${area}` as OwnerKey)}</h3>
                      <ul className="occhecks">
                        {d.entries
                          .filter((e) => e.area === area && (prio === 'all' || e.priority === prio))
                          .map((e) => (
                            <li key={e.id} data-status={e.status} data-current={n?.id === e.id ? '' : undefined}>
                              <button type="button" className="occheckrow" aria-pressed={e.status === 'done'} title={o(e.status === 'done' ? 'check.undo' : 'check.markDone')} onClick={() => void mark(e.id, e.status === 'done' ? 'todo' : 'done')}>
                                <Icon name={e.status === 'done' ? 'checkCircle' : e.status === 'skipped' ? 'clock' : 'dot'} size={16} />
                              </button>
                              <span className="occhecks__main">
                                <span>{o(`checklist.${e.id}.title` as OwnerKey)}</span>
                                <span className="oc__muted">
                                  {o(`owner.${e.owner}` as OwnerKey)} · {cost(e)}
                                  {e.priority === 'later' ? ` · ${e.triggered ? o('check.triggered') : o('check.trigger', { when: triggerText(e, o) })}` : ''}
                                </span>
                              </span>
                              <Pill tone={e.triggered || e.priority === 'must' ? 'late' : e.priority === 'nice' ? undefined : 'soon'}>
                                {o(`prio.${e.priority}` as OwnerKey)}
                              </Pill>
                            </li>
                          ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            </>
          );
        }}
      </Loading>
    </Page>
  );
}

function triggerText(e: ChecklistEntry, o: (k: OwnerKey, v?: Record<string, string | number>) => string): string {
  const t = e.trigger;
  if (!t || t.kind === 'manual') return o('trigger.manual');
  if (t.kind === 'paidInCountry') return o('trigger.paidIn', { countries: t.countries.length > 5 ? o('trigger.eu') : t.countries.join(', ') });
  if (t.kind === 'customerInCountry') return o('trigger.customerIn', { countries: t.countries.join(', ') });
  if (t.kind === 'payingAtLeast') return o('trigger.paying', { n: t.n });
  if (t.kind === 'seatsAtLeast') return o('trigger.seats', { n: t.n });
  return o('trigger.arr', { amount: t.amount });
}

// ================================================================ support, system, activity

export function SupportOverviewSection({ beat, failed, go }: { beat: number; failed: (e: unknown) => void; go: OwnerGo }) {
  const { o, locale } = useOwnerWords();
  const { data, error, reload } = useData<OwnerSupport>('/owner/support', beat, failed);
  const n = (v: number) => formatNumber(v, locale);
  return (
    <Page
      wide
      title={o('nav.support')}
      sub={o('support.sub')}
      tools={
        <button type="button" className="btn btn--small" onClick={() => go({ section: 'support' })}>
          <Icon name="inbox" size={14} />
          {o('support.openQueue')}
        </button>
      }
    >
      <Loading data={data} error={error} reload={reload} cards>
        {(d) => {
          return (
            <>
              <div className="octiles">
                <Tile lead label={o('support.waiting')} value={n(d.waiting)} sub={d.oldestWaitingAt ? o('support.oldest', { date: formatDate(d.oldestWaitingAt, locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }) : undefined} />
                <Tile label={o('support.unclaimed')} value={n(d.unclaimed)} tone={d.unclaimed ? 'soon' : undefined} />
                <Tile label={o('support.blocking')} value={n(d.blocking)} tone={d.blocking ? 'late' : undefined} />
                <Tile label={o('support.answered')} value={n(d.answered)} />
                <Tile label={o('support.solved7')} value={n(d.solved7)} tone="done" />
              </div>
              <section className="ccard oc__gap" aria-labelledby="oc-wait">
                <h2 className="ccard__title" id="oc-wait">{o('support.list')}</h2>
                {d.waitingList.length === 0 ? (
                  <EmptyState compact icon="checkCircle" tone="done" title={o('support.none')} />
                ) : (
                  <ul className="cneeds">
                    {d.waitingList.map((r) => (
                      <li key={r.ref}>
                        <button type="button" className="cneed" data-kind="request" onClick={() => go({ section: 'support', r: r.ref })}>
                          <span className="cneed__icon" aria-hidden="true">
                            <Icon name="lifebuoy" size={16} />
                          </span>
                          <span className="cneed__main">
                            <span className="cneed__what">{r.subject}</span>
                            <span className="cneed__meta">
                              {r.ref} · {r.company}
                              {r.at ? ` · ${formatDate(r.at, locale, { day: 'numeric', month: 'short' })}` : ''}
                            </span>
                            {r.blocking ? <span className="flag flag--late">{o('support.blockingFlag')}</span> : null}
                          </span>
                          <Icon name="chevronRight" size={16} className="cneed__go" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          );
        }}
      </Loading>
    </Page>
  );
}

export function SystemSection({ beat, failed, go }: { beat: number; failed: (e: unknown) => void; go: OwnerGo }) {
  const { o, locale } = useOwnerWords();
  const { data, error, reload } = useData<OwnerSystem>('/owner/system', beat, failed);
  const n = (v: number) => formatNumber(v, locale);
  return (
    <Page wide title={o('nav.system')} sub={o('system.sub')}>
      <Loading data={data} error={error} reload={reload} cards>
        {(d) => {
          return (
            <>
              <div className="octiles">
                <Tile label={o('system.server')} value={n(d.errors.server24h)} tone={d.errors.server24h ? 'late' : 'done'} />
                <Tile label={o('system.browser')} value={n(d.errors.browser24h)} tone={d.errors.browser24h ? 'soon' : 'done'} />
                <Tile label={o('system.syncs')} value={n(d.sync.ran24h)} sub={o('system.syncFailed', { n: n(d.sync.failed24h) })} tone={d.sync.failed24h ? 'late' : undefined} />
                <Tile label={o('system.connections')} value={n(d.sync.inError.length)} tone={d.sync.inError.length ? 'late' : 'done'} />
                <Tile label={o('system.uptime')} value={o('system.uptimeValue')} sub={o('system.uptimeSub')} />
              </div>
              <div className="occols occols--2">
                <section className="ccard" aria-labelledby="oc-err">
                  <h2 className="ccard__title" id="oc-err">{o('system.top')}</h2>
                  {d.errors.top.length === 0 ? (
                    <EmptyState compact icon="checkCircle" tone="done" title={o('system.noErrors')} />
                  ) : (
                    <table className="octable">
                      <thead>
                        <tr>
                          <th scope="col">{o('system.message')}</th>
                          <th scope="col">{o('system.source')}</th>
                          <th scope="col" className="num">{o('system.count')}</th>
                          <th scope="col">{o('system.last')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.errors.top.map((e, i) => (
                          <tr key={i}>
                            <td className="ocwrap">{e.message}</td>
                            <td>{o(e.source === 'browser' ? 'system.browserShort' : 'system.serverShort')}</td>
                            <td className="num">{n(e.n)}</td>
                            <td>{formatDate(e.last, locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </section>
                <section className="ccard" aria-labelledby="oc-conn">
                  <h2 className="ccard__title" id="oc-conn">{o('system.connectionsTitle')}</h2>
                  {d.sync.inError.length === 0 ? (
                    <EmptyState compact icon="plug" tone="done" title={o('system.noConnections')} />
                  ) : (
                    <ul className="oclist">
                      {d.sync.inError.map((c, i) => (
                        <li key={i}>
                          <button type="button" className="oclink" onClick={() => go({ section: 'customers', c: c.orgId })}>
                            {c.company}
                          </button>
                          <span>{c.provider}</span>
                          {c.error ? <span className="oc__muted ocwrap">{c.error}</span> : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </>
          );
        }}
      </Loading>
    </Page>
  );
}

const ACTION_WORD: Record<string, OwnerKey> = {
  signed_in: 'act.signIn',
  account: 'act.account',
  opened: 'act.opened',
  replay: 'act.replay',
  answered: 'act.answer',
  noted: 'act.note',
  took: 'act.claim',
  released: 'act.release',
  'status:received': 'act.status',
  'status:answered': 'act.status',
  'status:solved': 'act.solved',
  entry_link: 'act.entryLink',
  'trial.approved': 'act.trialApproved',
  'trial.rejected': 'act.trialRejected',
  'trial.contacted': 'act.trialContacted',
  'plan.targets': 'act.planTargets',
  'checklist.done': 'act.checklistDone',
  'checklist.skipped': 'act.checklistSkipped',
  'checklist.todo': 'act.checklistTodo',
  'approval.approve': 'act.approvalApprove',
  'approval.reject': 'act.approvalReject',
  'approval.meeting': 'act.approvalMeeting',
  pause: 'act.pause',
  resume: 'act.resume',
  'seat.saved': 'act.seatSaved',
  'seat.key': 'act.seatKey',
  'seat.handover': 'act.seatHandover',
  'meeting.call': 'act.meetingCall',
};

export function ActivitySection({ beat, failed, go }: { beat: number; failed: (e: unknown) => void; go: OwnerGo }) {
  const { o, locale } = useOwnerWords();
  const { data, error, reload } = useData<{ activity: OwnerActivity[] }>('/owner/activity', beat, failed);
  const [more, setMore] = useState<OwnerActivity[]>([]);
  const [end, setEnd] = useState(false);
  const rows = [...(data?.activity ?? []), ...more];
  const loadMore = async () => {
    const last = rows[rows.length - 1];
    if (!last) return;
    try {
      const r = await api<{ activity: OwnerActivity[] }>('GET', `/owner/activity?before=${encodeURIComponent(last.at)}`);
      setMore([...more, ...r.activity]);
      if (r.activity.length < 200) setEnd(true);
    } catch (e) {
      failed(e);
    }
  };
  return (
    <Page wide title={o('nav.activity')} sub={o('activity.sub')}>
      <Loading data={data} error={error} reload={reload}>
        {() =>
          rows.length === 0 ? (
            <EmptyState icon="history" title={o('activity.empty')} />
          ) : (
            <div className="ccard octablewrap">
              <table className="octable">
                <thead>
                  <tr>
                    <th scope="col">{o('col.when')}</th>
                    <th scope="col">{o('col.who')}</th>
                    <th scope="col">{o('col.what')}</th>
                    <th scope="col">{o('col.ref')}</th>
                    <th scope="col">{o('col.company')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a, i) => (
                    <tr key={i}>
                      <td>{formatDate(a.at, locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                      <td>{a.who}</td>
                      <td>{ACTION_WORD[a.action] ? o(ACTION_WORD[a.action]) : a.action}</td>
                      <td>
                        {a.ref && /^CH-/.test(a.ref) ? (
                          <button type="button" className="oclink" onClick={() => go({ section: 'support', r: a.ref })}>
                            {a.ref}
                          </button>
                        ) : (
                          (a.ref ?? '—')
                        )}
                      </td>
                      <td>{a.company ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!end && (data?.activity.length ?? 0) >= 200 ? (
                <button type="button" className="btn btn--small oc__gap" onClick={() => void loadMore()}>
                  {o('activity.more')}
                </button>
              ) : null}
            </div>
          )
        }
      </Loading>
    </Page>
  );
}

/** A stored consent id in the owner's words, with the law it rests on: the compliance package's ('TR.M1', 'AE.C') or the earlier form's ('tr.m1'). */
const CONSENT_KIND: Record<string, OwnerKey> = {
  notice: 'req.consentKind.notice',
  consent: 'req.consentKind.consent',
  transfer: 'req.consentKind.transfer',
  capacity: 'req.consentKind.capacity',
  m1: 'req.consentKind.iys',
  m2: 'req.consentKind.trMarketing',
  marketing: 'req.consentKind.marketing',
};
/** The compliance package's block letters (shared/src/compliance/consentTexts.ts). */
const BLOCK_KIND: Record<string, string> = { N: 'notice', N0: 'notice', R: 'notice', C: 'consent', NC: 'consent', T: 'transfer', A: 'capacity', M: 'marketing', M1: 'm1', M2: 'm2' };
function consentLabel(key: string, o: (k: OwnerKey) => string): string {
  const [set, raw] = key.split('.');
  const what = raw ? (BLOCK_KIND[raw] ?? raw) : undefined;
  const kind = what ? CONSENT_KIND[what] : undefined;
  if (!kind) return key;
  const region = set === 'TW' ? 'twn' : set.toLowerCase();
  const law = (what === 'notice' || what === 'consent' || what === 'transfer') && (CONSENT_REGIONS as readonly string[]).includes(region) ? LAW_NAME[region as ConsentRegion] : null;
  return law ? `${o(kind)} · ${law}` : o(kind);
}
