// The AI team in the owner console: Ekip (org chart, seat cards, status,
// weekly usage, kill switches, golden tasks, "Koltuğu devret"), Sohbetler
// (a real-model chat with every seat, full history, what it remembers) and
// Toplantılar (minutes, live view, join). Desktop first; phone stacked.
// Turkish and English only, like the rest of the owner console
// (words: shared/src/i18n/ownerTeam.ts). API: /api/desk/team/* and /office/*.
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { normalizeLocale } from '../../../shared/src/i18n';
import { cardText, teamWord, type TeamKey } from '../../../shared/src/i18n/ownerTeam';
import type { Meeting, MeetingLine } from '../../../shared/src/office';
import type { MemoryView, MessageRow, TeamOrg, TeamSeat, ThreadRow } from '../../../shared/src/team/api';
import { EmptyState, LoadError, SkeletonRows } from '../components/Empty';
import { Icon } from '../components/icons';
import { formatDate, formatMoney, formatNumber } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { relativeTime } from '../lib/time';
import '../surfaces/team.css';

export type TeamSectionName = 'team' | 'chats' | 'meetings';
export type TeamGo = (to: { section: TeamSectionName; q?: string | null }) => void;

class TeamError extends Error {
  constructor(readonly status: number) {
    super(String(status));
  }
}
async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/desk${path}`, { method, headers: { 'x-curahold-desk': '1', ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new TeamError(res.status);
  return json as T;
}

export function useTeamWords() {
  const { locale, t } = useI18n();
  const l = normalizeLocale(locale);
  const w = useCallback((k: TeamKey, vars?: Record<string, string | number>) => teamWord(l, k, vars), [l]);
  return { w, locale: l, t };
}

function useLoad<T>(path: string | null, beat: number, failed: (e: unknown) => void) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!path) return;
    let live = true;
    api<T>('GET', path)
      .then((d) => live && (setData(d), setError(false)))
      .catch((e) => {
        failed(e);
        if (live) setError(true);
      });
    return () => {
      live = false;
    };
  }, [path, beat, n, failed]);
  return { data, error, reload: () => setN((x) => x + 1), setData };
}

function Page({ title, sub, tools, children }: { title: string; sub?: ReactNode; tools?: ReactNode; children: ReactNode }) {
  return (
    <div className="console__page oc tm" data-wide="">
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

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toLocaleUpperCase();

export function Avatar({ seat, size = 'm' }: { seat: Pick<TeamSeat, 'name' | 'team' | 'agent' | 'filledBy'>; size?: 's' | 'm' | 'l' }) {
  const { w } = useTeamWords();
  return (
    <span className="tm-av" data-team={seat.team} data-size={size} aria-hidden="true">
      {seat.agent?.avatar ? <img src={seat.agent.avatar} alt="" loading="lazy" /> : <span>{initials(seat.name)}</span>}
      {seat.filledBy !== 'human' ? <b className="tm-av__ai">{w('ai')}</b> : null}
    </span>
  );
}

export function Status({ seat }: { seat: TeamSeat }) {
  const { w } = useTeamWords();
  if (seat.paused) return <span className="tm-chip" data-tone="late">{w('status.paused')}</span>;
  if (seat.state === 'dormant') return <span className="tm-chip">{w('status.dormant')}</span>;
  if (seat.filledBy === 'human') return <span className="tm-chip" data-tone="info">{w('status.human')}</span>;
  if (seat.active) return <span className="tm-chip" data-tone="done">{w('status.active')}</span>;
  return (
    <span className="tm-chip" data-tone="soon">
      {w('status.exam', { passed: seat.golden.passed, total: seat.golden.total })}
    </span>
  );
}

function Usage({ tokens, budget }: { tokens: number; budget: number }) {
  const { w, locale } = useTeamWords();
  const share = budget > 0 ? Math.min(1, tokens / budget) : 0;
  return (
    <span className="tm-use" title={w('usage.label', { tokens: formatNumber(tokens, locale, { compact: true }), budget: formatNumber(budget, locale, { compact: true }) })}>
      <span className="tm-use__bar">
        <i style={{ '--w': `${Math.round(share * 100)}%` } as React.CSSProperties} data-high={share >= 0.8 ? '' : undefined} />
      </span>
      <span className="tm-use__n">
        {formatNumber(tokens, locale, { compact: true })} / {formatNumber(budget, locale, { compact: true })}
      </span>
    </span>
  );
}

function SeatNode({ seat, onOpen, lead }: { seat: TeamSeat; onOpen: (s: string) => void; lead?: boolean }) {
  const { w, locale } = useTeamWords();
  return (
    <button type="button" className="tm-node" data-lead={lead ? '' : undefined} data-activity={seat.activity} onClick={() => onOpen(seat.seat)}>
      <Avatar seat={seat} size={lead ? 'l' : 'm'} />
      <span className="tm-node__text">
        <strong>{seat.name}</strong>
        <span className="tm-node__title">{seat.title}</span>
        {lead ? <span className="tm-node__tr">{cardText(locale, { tr: seat.titleTr }, seat.card.mission ?? seat.titleTr)}</span> : null}
        <span className="tm-node__meta">
          <Status seat={seat} />
          <span className="tm-dot" data-activity={seat.activity}>
            {w(`activity.${seat.activity}` as TeamKey)}
          </span>
        </span>
        {seat.state !== 'dormant' ? <Usage tokens={seat.usage.tokens} budget={seat.weeklyBudget} /> : null}
      </span>
    </button>
  );
}

// ================================================================ Ekip

const TEAM_ORDER = ['ceo-office', 'engineering', 'product', 'growth', 'customers', 'finance', 'trust'] as const;

export function TeamSection({ beat, failed, go, open }: { beat: number; failed: (e: unknown) => void; go: TeamGo; open: string | null }) {
  const { w, locale } = useTeamWords();
  const org = useLoad<TeamOrg>('/team/org', beat, failed);
  const [busy, setBusy] = useState(false);
  const setOpen = (s: string | null) => go({ section: 'team', q: s });
  if (org.error && !org.data) return <Page title={w('team.title')}><LoadError message={w('team.loadError')} onRetry={org.reload} /></Page>;
  if (!org.data) return <Page title={w('team.title')}><SkeletonRows label={w('common.loading')} /></Page>;
  const d = org.data;
  const live = d.seats.filter((s) => s.state !== 'dormant' && s.tier !== 'advisor');
  const dormant = d.seats.filter((s) => s.state === 'dormant');
  const board = d.seats.filter((s) => s.tier === 'advisor');
  const coo = d.seats.find((s) => s.seat === 'coo');
  const teamPause = (team: string) => d.pauses.find((p) => p.scope === 'team' && p.target === team);
  const toggleTeam = async (team: string) => {
    setBusy(true);
    try {
      const p = teamPause(team);
      if (p) await api('DELETE', `/office/pauses/${p.id}`);
      else await api('POST', '/office/pauses', { scope: 'team', target: team, reason: w('team.pauseTeam') });
      org.reload();
    } catch (e) {
      failed(e);
    } finally {
      setBusy(false);
    }
  };
  const seed = async () => {
    if (!window.confirm(w('team.seedConfirm'))) return;
    await api('POST', '/team/seed', { reset: true }).catch(failed);
    org.reload();
  };
  const selected = open ? d.seats.find((s) => s.seat === open) ?? null : null;
  return (
    <Page
      title={w('team.title')}
      sub={w('team.sub', { active: live.filter((s) => s.active).length || live.length, dormant: dormant.length, advisors: board.length })}
      tools={
        <button type="button" className="btn btn--small btn--quiet" onClick={seed}>
          <Icon name="undo" size={16} /> {w('team.seed')}
        </button>
      }
    >
      <div className="tm-strip">
        <div className="tm-stat">
          <span className="tm-stat__k">{w('team.week')}</span>
          <Usage tokens={d.week.tokens} budget={d.week.budget} />
        </div>
        <div className="tm-stat">
          <span className="tm-stat__k">{w('team.month')}</span>
          <span className="tm-stat__v">{w('team.monthValue', { spent: formatMoney(d.month.costUsd, 'USD', locale), cap: formatMoney(d.month.capUsd, 'USD', locale) })}</span>
        </div>
        <div className="tm-stat">
          <span className="tm-stat__k">{w('team.model')}</span>
          <span className="tm-stat__v" data-tone={d.model.available ? 'done' : 'soon'}>{w(d.model.available ? 'team.modelOn' : 'team.modelOff')}</span>
        </div>
        <div className="tm-stat tm-stat--alerts">
          <span className="tm-stat__k">{w('team.alerts')}</span>
          {d.alerts.length ? (
            <ul className="tm-alerts">
              {d.alerts.slice(0, 3).map((a) => (
                <li key={a.id}>
                  <Icon name="alert" size={14} /> {a.body}
                </li>
              ))}
            </ul>
          ) : (
            <span className="tm-stat__v">{w('team.noAlerts')}</span>
          )}
        </div>
      </div>

      <div className="tm-org" data-open={selected ? '' : undefined}>
        <div className="tm-chart">
          <div className="tm-top">
            <div className="tm-ceo">
              <span className="tm-av" data-size="l" data-team="ceo" aria-hidden="true">
                <Icon name="user" size={20} />
              </span>
              <span className="tm-node__text">
                <strong>{w('ceo')}</strong>
                <span className="tm-node__title">{w('ceo.sub')}</span>
              </span>
            </div>
            {coo ? <SeatNode seat={coo} onOpen={setOpen} lead /> : null}
          </div>
          <div className="tm-teams">
            {TEAM_ORDER.map((team) => {
              const people = live.filter((s) => s.team === team && s.seat !== 'coo');
              if (!people.length) return null;
              const head = people.find((s) => s.tier === 'executive') ?? null;
              const rest = people.filter((s) => s !== head);
              const paused = !!teamPause(team);
              return (
                <section key={team} className="tm-team" data-team={team} aria-label={w(`teamName.${team}` as TeamKey)}>
                  <header className="tm-team__head">
                    <h2>{w(`teamName.${team}` as TeamKey)}</h2>
                    <button type="button" className="btn btn--icon btn--small btn--quiet" disabled={busy} onClick={() => toggleTeam(team)} title={w(paused ? 'team.resumeTeam' : 'team.pauseTeam')} aria-label={w(paused ? 'team.resumeTeam' : 'team.pauseTeam')}>
                      <Icon name={paused ? 'play' : 'lock'} size={14} />
                    </button>
                  </header>
                  {head ? <SeatNode seat={head} onOpen={setOpen} lead /> : null}
                  {rest.map((s) => (
                    <SeatNode key={s.seat} seat={s} onOpen={setOpen} />
                  ))}
                </section>
              );
            })}
          </div>
          <details className="tm-more">
            <summary>
              <strong>{w('team.board')}</strong> · {board.length} · <span>{w('team.boardSub')}</span>
            </summary>
            <div className="tm-grid">
              {board.map((s) => (
                <SeatNode key={s.seat} seat={s} onOpen={setOpen} />
              ))}
            </div>
          </details>
          <details className="tm-more">
            <summary>
              <strong>{w('team.dormant')}</strong> · {dormant.length} · <span>{w('team.dormantSub')}</span>
            </summary>
            <ul className="tm-dormant">
              {dormant.map((s) => (
                <li key={s.seat}>
                  <button type="button" className="tm-dormant__row" onClick={() => setOpen(s.seat)}>
                    <Avatar seat={s} size="s" />
                    <span>
                      <strong>{s.name}</strong> · {s.title}
                      <small>{s.wakeTrigger}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </details>
        </div>
        {selected ? <SeatPanel key={selected.seat} seat={selected} onClose={() => setOpen(null)} onChanged={org.reload} go={go} failed={failed} pauses={d.pauses} /> : null}
      </div>
    </Page>
  );
}

interface SeatDetail {
  seat: TeamSeat;
  def: { card: { mission: string; missionTr: string; responsibilities: string[]; kpis: string[]; inputs: string[]; outputs: string[]; playbook: string[]; tools: string[]; permissions: string[]; proposes: string[] } } | null;
  golden: { tasks: { id: string; prompt: string }[]; latest: { task: string; passed: boolean; judge: string; score: number | null; at: string }[] };
  estimate: { runs: number; wakes: number; tokens: number };
  lastWake: { checked_at: string; last_result: string } | null;
}

export function SeatPanel({ seat, onClose, onChanged, go, failed, pauses }: { seat: TeamSeat; onClose: () => void; onChanged: () => void; go: TeamGo; failed: (e: unknown) => void; pauses: TeamOrg['pauses'] }) {
  const { w, locale, t } = useTeamWords();
  const detail = useLoad<SeatDetail>(`/team/seats/${seat.seat}`, 0, failed);
  const [note, setNote] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState<'card' | 'handover' | 'job'>('card');
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => close.current?.focus(), []);
  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [onClose]);
  const c = { ...(detail.data?.def?.card ?? {}), ...(seat.card as object) } as NonNullable<SeatDetail['def']>['card'];
  const own = pauses.find((p) => p.scope === 'seat' && p.target === seat.seat);
  const act = async (fn: () => Promise<unknown>) => {
    setRunning(true);
    try {
      await fn();
      onChanged();
      detail.reload();
    } catch (e) {
      failed(e);
      setNote(w('common.error'));
    } finally {
      setRunning(false);
    }
  };
  const wake = () =>
    window.confirm(w('seat.wakeConfirm', { name: seat.name, tokens: formatNumber(detail.data?.estimate.tokens ? Math.round(detail.data.estimate.tokens / Math.max(1, detail.data.estimate.runs)) : 8000, locale) })) &&
    act(async () => {
      const r = await api<{ check: { reason: string }; run: { status: string } | null }>('POST', `/team/seats/${seat.seat}/wake`, { force: true });
      setNote(w('seat.wakeDone', { result: r.run ? r.run.status : w(`seat.wakeResult.${r.check.reason}` as TeamKey) }));
    });
  const golden = () =>
    act(async () => {
      const r = await api<{ outcomes: { passed: boolean }[] }>('POST', `/team/seats/${seat.seat}/golden`, {});
      setNote(w('seat.goldenResult', { passed: r.outcomes.filter((o) => o.passed).length, total: r.outcomes.length }));
    });
  const pause = () => act(() => (own ? api('DELETE', `/office/pauses/${own.id}`) : api('POST', '/office/pauses', { scope: 'seat', target: seat.seat, reason: w('seat.pause') })));
  const list = (title: string, xs: string[] | undefined) =>
    xs?.length ? (
      <section className="tm-sec">
        <h3>{title}</h3>
        <ul>
          {xs.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </section>
    ) : null;
  const latest = new Map((detail.data?.golden.latest ?? []).map((l) => [l.task, l]));
  return (
    <aside className="tm-panel" aria-label={seat.name}>
      <header className="tm-panel__head">
        <Avatar seat={seat} size="l" />
        <div>
          <h2>{seat.name}</h2>
          <p className="tm-panel__title">
            {seat.title}
            {seat.level ? ` · ${seat.level}` : ''}
          </p>
          <p className="tm-panel__tr">{seat.titleTr}</p>
          <p className="tm-node__meta">
            <Status seat={seat} />
            <span className="tm-dot" data-activity={seat.activity}>
              {w(`activity.${seat.activity}` as TeamKey)}
            </span>
          </p>
        </div>
        <button ref={close} type="button" className="btn btn--icon btn--quiet" onClick={onClose} aria-label={w('seat.close')}>
          <Icon name="close" size={18} />
        </button>
      </header>
      <div className="tm-panel__actions">
        <button type="button" className="btn btn--small btn--primary" onClick={() => go({ section: 'chats', q: seat.seat })} disabled={seat.filledBy === 'human'}>
          <Icon name="comment" size={16} /> {w('seat.chat')}
        </button>
        <button type="button" className="btn btn--small" onClick={wake} disabled={running || seat.state === 'dormant' || seat.paused}>
          <Icon name="play" size={16} /> {w('seat.wake')}
        </button>
        <button type="button" className="btn btn--small" onClick={golden} disabled={running}>
          <Icon name="checkCircle" size={16} /> {running ? w('seat.goldenRunning') : w('seat.goldenRun')}
        </button>
        <button type="button" className={own ? 'btn btn--small btn--primary' : 'btn btn--small btn--danger'} onClick={pause} disabled={running}>
          <Icon name={own ? 'play' : 'lock'} size={16} /> {w(own ? 'seat.resume' : 'seat.pause')}
        </button>
        <button type="button" className="btn btn--small btn--quiet" aria-pressed={mode === 'handover'} onClick={() => setMode(mode === 'handover' ? 'card' : 'handover')}>
          <Icon name="handshake" size={16} /> {w('seat.handover')}
        </button>
        <button type="button" className="btn btn--small btn--quiet" aria-pressed={mode === 'job'} onClick={() => setMode(mode === 'job' ? 'card' : 'job')}>
          <Icon name="idcard" size={16} /> {w('seat.job')}
        </button>
      </div>
      {note ? (
        <p className="tm-note" role="status">
          {note}
        </p>
      ) : null}
      {mode === 'handover' ? <Handover seat={seat} onDone={onChanged} failed={failed} /> : null}
      {mode === 'job' ? <JobDescription seat={seat.seat} failed={failed} /> : null}
      {mode === 'card' ? (
        <div className="tm-panel__body">
          <section className="tm-sec">
            <h3>{w('seat.mission')}</h3>
            <p>{cardText(locale, { tr: c.missionTr }, c.mission)}</p>
          </section>
          {list(w('seat.does'), c.responsibilities)}
          {list(w('seat.kpis'), c.kpis)}
          <div className="tm-two">
            {list(w('seat.inputs'), c.inputs)}
            {list(w('seat.outputs'), c.outputs)}
          </div>
          {list(w('seat.playbook'), c.playbook)}
          <section className="tm-sec">
            <h3>{w('seat.tools')}</h3>
            <p className="tm-tags">
              {(c.tools ?? []).map((x) => (
                <code key={x}>{x}</code>
              ))}
            </p>
            {list('', c.permissions)}
            <p className="oc__muted">
              {w('seat.proposes')}: {(c.proposes ?? []).join(', ')}
            </p>
          </section>
          <section className="tm-sec">
            <h3>{w('seat.cadence')}</h3>
            <p>{seat.cadence}</p>
            {seat.wakeTrigger ? (
              <p>
                <strong>{w('seat.trigger')}:</strong> {seat.wakeTrigger}
              </p>
            ) : null}
            <p className="oc__muted">
              {w('seat.reportsTo')}: {seat.reportsTo ?? w('ceo')} · {w('seat.budget')}: {formatNumber(seat.weeklyBudget, locale)}
            </p>
            {detail.data ? <p className="oc__muted">{w('seat.estimate', { runs: detail.data.estimate.runs, tokens: formatNumber(detail.data.estimate.tokens, locale), wakes: detail.data.estimate.wakes })}</p> : null}
            {seat.lastWake ? <p className="oc__muted">{w('seat.lastWake', { when: relativeTime(seat.lastWake.at, t), result: w(`seat.wakeResult.${seat.lastWake.result}` as TeamKey) })}</p> : null}
          </section>
          <section className="tm-sec">
            <h3>{w('seat.golden')}</h3>
            {!detail.data?.golden.latest.length ? <p className="oc__muted">{w('seat.goldenNone')}</p> : null}
            <ul className="tm-golden">
              {(detail.data?.golden.tasks ?? []).map((g) => {
                const l = latest.get(g.id);
                return (
                  <li key={g.id} data-state={l ? (l.passed ? 'pass' : 'fail') : 'none'}>
                    <Icon name={l ? (l.passed ? 'checkCircle' : 'alert') : 'dot'} size={14} />
                    <span>
                      {g.prompt}
                      {l ? <small> · {w(l.judge === 'model' ? 'seat.judge.model' : 'seat.judge.checks')}{l.score != null ? ` ${l.score}` : ''} · {formatDate(l.at, locale)}</small> : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      ) : null}
    </aside>
  );
}

function JobDescription({ seat, failed }: { seat: string; failed: (e: unknown) => void }) {
  const { locale } = useTeamWords();
  const job = useLoad<{ markdown: string }>(`/team/seats/${seat}/job?lang=${locale}`, 0, failed);
  return <pre className="tm-md">{job.data?.markdown ?? '…'}</pre>;
}

function Handover({ seat, onDone, failed }: { seat: TeamSeat; onDone: () => void; failed: (e: unknown) => void }) {
  const { w, locale } = useTeamWords();
  const pack = useLoad<{ openWork: { id: string; title: string; status: string }[]; access: { tools: string[]; data: string[]; proposes: string[] } }>(`/team/seats/${seat.seat}/handover?lang=${locale}`, 0, failed);
  const [mode, setMode] = useState<'human' | 'human-with-agent' | 'agent'>('human-with-agent');
  const [email, setEmail] = useState(seat.humanEmail ?? '');
  const [done, setDone] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api('POST', `/office/seats/${seat.seat}/handover`, { filledBy: mode, humanEmail: mode === 'agent' ? null : email });
      setDone(true);
      onDone();
    } catch (err) {
      failed(err);
    }
  };
  return (
    <form className="tm-panel__body tm-handover" onSubmit={submit}>
      <h3>{w('handover.title', { title: seat.title })}</h3>
      <p className="oc__muted">{w('handover.sub')}</p>
      <section className="tm-sec">
        <h3>{w('handover.openWork')}</h3>
        {pack.data?.openWork.length ? (
          <ul>
            {pack.data.openWork.map((x) => (
              <li key={x.id}>
                {x.title} · {x.status}
              </li>
            ))}
          </ul>
        ) : (
          <p className="oc__muted">{w('handover.none')}</p>
        )}
      </section>
      <section className="tm-sec">
        <h3>{w('handover.access')}</h3>
        <p className="tm-tags">
          {(pack.data?.access.tools ?? []).map((x) => (
            <code key={x}>{x}</code>
          ))}
        </p>
        <ul>
          {(pack.data?.access.data ?? []).map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </section>
      <fieldset className="tm-radio">
        <legend>{w('handover.mode')}</legend>
        {(['human-with-agent', 'human', 'agent'] as const).map((m) => (
          <label key={m}>
            <input type="radio" name="mode" checked={mode === m} onChange={() => setMode(m)} /> {w(m === 'human' ? 'handover.human' : m === 'agent' ? 'handover.agent' : 'handover.humanAgent')}
          </label>
        ))}
      </fieldset>
      {mode !== 'agent' ? (
        <label className="field">
          <span>{w('handover.email')}</span>
          <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
        </label>
      ) : null}
      <button type="submit" className="btn btn--primary" disabled={done}>
        {w('handover.go')}
      </button>
      {done ? <p role="status">{w('handover.done')}</p> : null}
    </form>
  );
}

// ================================================================ Sohbetler

const dayKey = (iso: string) => iso.slice(0, 10);

export function ChatSection({ beat, failed, go, seatId }: { beat: number; failed: (e: unknown) => void; go: TeamGo; seatId: string | null }) {
  const { w } = useTeamWords();
  const org = useLoad<TeamOrg>('/team/org', beat, failed);
  const [find, setFind] = useState('');
  const seats = useMemo(() => {
    const all = (org.data?.seats ?? []).filter((s) => s.state !== 'dormant' && s.filledBy !== 'human');
    const f = find.trim().toLocaleLowerCase();
    const fold = (s: string) => s.toLocaleLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
    return f ? all.filter((s) => fold(`${s.name} ${s.title} ${s.titleTr} ${s.team}`).includes(fold(f))) : all;
  }, [org.data, find]);
  const seat = org.data?.seats.find((s) => s.seat === seatId) ?? null;
  return (
    <Page title={w('chat.title')} sub={w('chat.sub')}>
      <div className="tm-chat" data-has={seat ? '' : undefined}>
        <nav className="tm-people" aria-label={w('chat.pick')}>
          <input className="input" type="search" placeholder={w('chat.search')} aria-label={w('chat.search')} value={find} onChange={(e) => setFind(e.target.value)} />
          {!org.data ? <SkeletonRows rows={8} label={w('common.loading')} /> : null}
          <ul>
            {seats.map((s) => (
              <li key={s.seat}>
                <button type="button" className="tm-person" aria-current={s.seat === seatId ? 'true' : undefined} onClick={() => go({ section: 'chats', q: s.seat })}>
                  <Avatar seat={s} size="s" />
                  <span>
                    <strong>{s.name}</strong>
                    <small>{s.title}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
        {seat ? <Conversation key={seat.seat} seat={seat} failed={failed} modelOn={!!org.data?.model.available} onBack={() => go({ section: 'chats', q: null })} /> : <EmptyState icon="comment" title={w('chat.pick')} />}
      </div>
    </Page>
  );
}

function Conversation({ seat, failed, modelOn, onBack }: { seat: TeamSeat; failed: (e: unknown) => void; modelOn: boolean; onBack: () => void }) {
  const { w, locale } = useTeamWords();
  const threads = useLoad<{ threads: ThreadRow[] }>(`/team/seats/${seat.seat}/threads`, 0, failed);
  const [thread, setThread] = useState<string | null>(null);
  // Wide screens keep what the seat remembers beside the chat; narrower ones open it on demand.
  const [mem, setMem] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1680);
  useEffect(() => {
    if (!thread && threads.data) setThread(threads.data.threads[0]?.id ?? null);
  }, [threads.data, thread]);
  const newThread = async () => {
    try {
      const r = await api<{ thread: ThreadRow }>('POST', `/team/seats/${seat.seat}/threads`);
      threads.reload();
      setThread(r.thread.id);
    } catch (e) {
      failed(e);
    }
  };
  const remove = async () => {
    if (!thread || !window.confirm(w('chat.deleteConfirm'))) return;
    await api('DELETE', `/team/threads/${thread}`).catch(failed);
    setThread(null);
    threads.reload();
  };
  return (
    <div className="tm-conv" data-mem={mem ? '' : undefined}>
      <aside className="tm-threads" aria-label={w('chat.history')}>
        <header>
          <button type="button" className="btn btn--quiet btn--small tm-back" onClick={onBack}>
            <Icon name="arrowLeft" size={16} />
          </button>
          <h2>{w('chat.history')}</h2>
          <button type="button" className="btn btn--small" onClick={newThread}>
            <Icon name="plus" size={14} /> {w('chat.new')}
          </button>
        </header>
        <ul>
          {(threads.data?.threads ?? []).map((t) => (
            <li key={t.id}>
              <button type="button" aria-current={t.id === thread ? 'true' : undefined} onClick={() => setThread(t.id)}>
                <strong>{t.title || w('chat.untitled')}</strong>
                <small>
                  {formatDate(t.lastAt, locale)} · {w('chat.messages', { n: t.messages })}
                </small>
              </button>
            </li>
          ))}
        </ul>
        <a className="btn btn--small btn--quiet" href={`/api/desk/team/seats/${seat.seat}/export`} download>
          <Icon name="download" size={14} /> {w('chat.export')}
        </a>
      </aside>
      <Messages key={thread ?? 'none'} seat={seat} thread={thread} onNeedThread={newThread} onDelete={remove} onSent={threads.reload} failed={failed} modelOn={modelOn} mem={mem} onMem={() => setMem(!mem)} />
      {mem ? <MemoryPanel seat={seat} failed={failed} /> : null}
    </div>
  );
}

export function Messages({ seat, thread, onNeedThread, onDelete, onSent, failed, modelOn, mem, onMem }: { seat: TeamSeat; thread: string | null; onNeedThread: () => Promise<void>; onDelete: () => void; onSent: () => void; failed: (e: unknown) => void; modelOn: boolean; mem: boolean; onMem: () => void }) {
  const { w, locale } = useTeamWords();
  const [rows, setRows] = useState<MessageRow[]>([]);
  const [more, setMore] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const load = useCallback(
    async (qs = '') => {
      if (!thread) return setRows([]);
      try {
        const r = await api<{ messages: MessageRow[]; more: boolean }>('GET', `/team/threads/${thread}/messages${qs}`);
        setRows(r.messages);
        setMore(!qs && r.more);
      } catch (e) {
        failed(e);
      }
    },
    [thread, failed],
  );
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    // The list scrolls to its newest message; the page itself stays where it is.
    if (!filter && list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [rows, filter]);
  const older = async () => {
    if (!thread || !rows.length) return;
    const r = await api<{ messages: MessageRow[]; more: boolean }>('GET', `/team/threads/${thread}/messages?before=${rows[0].id}`).catch((e) => (failed(e), null));
    if (r) {
      setRows([...r.messages, ...rows]);
      setMore(r.more);
    }
  };
  const send = async (e: FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    if (!thread) {
      await onNeedThread();
      return;
    }
    setSending(true);
    setError(false);
    try {
      const r = await api<{ messages: MessageRow[] }>('POST', `/team/threads/${thread}/messages`, { text: body });
      setRows((x) => [...x, ...r.messages]);
      setText('');
      onSent();
    } catch (err) {
      failed(err);
      setError(true);
    } finally {
      setSending(false);
    }
  };
  const search = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    setFilter(q || null);
    void load(q ? `?q=${encodeURIComponent(q)}` : '');
  };
  const jump = (date: string) => {
    if (!date) return;
    setFilter(date);
    void load(`?from=${date}`);
  };
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  const dayLabel = (d: string) => (d === today ? w('chat.today') : d === yesterday ? w('chat.yesterday') : formatDate(d, locale, { day: 'numeric', month: 'long', year: 'numeric' }));
  let lastDay = '';
  return (
    <section className="tm-msgs" aria-label={seat.name}>
      <header className="tm-msgs__head">
        <Avatar seat={seat} size="s" />
        <div>
          <strong>{seat.name}</strong>
          <small>{seat.title}</small>
        </div>
        <form className="tm-msgs__tools" onSubmit={search} role="search">
          <input className="input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={w('chat.searchIn')} aria-label={w('chat.searchIn')} />
          <input className="input" type="date" aria-label={w('chat.jump')} title={w('chat.jump')} onChange={(e) => jump(e.target.value)} />
          {filter ? (
            <button type="button" className="btn btn--small btn--quiet" onClick={() => (setFilter(null), setQuery(''), void load())}>
              {w('chat.clear')}
            </button>
          ) : null}
          <button type="button" className="btn btn--small btn--quiet" aria-pressed={mem} onClick={onMem}>
            <Icon name="book" size={14} /> {w('mem.toggle')}
          </button>
          {thread ? (
            <button type="button" className="btn btn--icon btn--small btn--quiet" onClick={onDelete} aria-label={w('chat.delete')} title={w('chat.delete')}>
              <Icon name="trash" size={14} />
            </button>
          ) : null}
        </form>
      </header>
      <div className="tm-msgs__list" aria-live="polite" ref={list}>
        {more && !filter ? (
          <button type="button" className="btn btn--small btn--quiet tm-older" onClick={older}>
            {w('chat.older')}
          </button>
        ) : null}
        {!rows.length ? <p className="tm-empty">{filter ? w('chat.noHits') : modelOn ? w('chat.empty', { name: seat.name }) : w('chat.noModel')}</p> : null}
        {rows.map((m) => {
          const d = dayKey(m.at);
          const sep = d !== lastDay;
          lastDay = d;
          return (
            <div key={m.id}>
              {sep ? <p className="tm-day">{dayLabel(d)}</p> : null}
              <article className="tm-msg" data-role={m.role}>
                <p className="tm-msg__who">
                  {m.role === 'owner' ? w('chat.you') : seat.name} · {formatDate(m.at, locale, { hour: '2-digit', minute: '2-digit' })}
                </p>
                <div className="tm-msg__body">{m.body}</div>
                {m.meta.effects?.tasks?.map((x) => (
                  <p key={x.title} className="tm-msg__fx">
                    <Icon name="list" size={12} /> {w('chat.tasked', { seat: x.seat, title: x.title })}
                  </p>
                ))}
                {m.meta.effects?.proposals?.map((x) => (
                  <p key={x.title} className="tm-msg__fx">
                    <Icon name="checkCircle" size={12} /> {w('chat.proposed', { title: x.title })}
                  </p>
                ))}
                {m.meta.findings?.length ? <p className="tm-msg__fx" data-tone="soon">{w('chat.flag', { rules: m.meta.findings.map((f) => f.rule).join(', ') })}</p> : null}
                {m.role === 'agent' && m.meta.tokens ? <p className="tm-msg__cost">{w('chat.cost', { tokens: formatNumber(m.meta.tokens, locale) })}</p> : null}
              </article>
            </div>
          );
        })}
        {sending ? <p className="tm-typing">{w('chat.sending', { name: seat.name })}</p> : null}
      </div>
      <form className="tm-compose" onSubmit={send}>
        <textarea
          className="input"
          rows={2}
          value={text}
          placeholder={w('chat.placeholder', { name: seat.name })}
          aria-label={w('chat.placeholder', { name: seat.name })}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              (e.currentTarget.form as HTMLFormElement).requestSubmit();
            }
          }}
        />
        <button type="submit" className="btn btn--primary" disabled={sending || !text.trim()}>
          <Icon name="send" size={16} /> {w('chat.send')}
        </button>
        {error ? <p role="alert">{w('chat.failed')}</p> : null}
      </form>
    </section>
  );
}

export function MemoryPanel({ seat, failed }: { seat: TeamSeat; failed: (e: unknown) => void }) {
  const { w, locale } = useTeamWords();
  const mem = useLoad<MemoryView>(`/team/seats/${seat.seat}/memory`, 0, failed);
  const [edit, setEdit] = useState<{ key: string; value: string } | null>(null);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!edit?.value.trim()) return;
    try {
      const r = await api<{ memory: MemoryView }>('PUT', `/team/seats/${seat.seat}/memory/${edit.key}`, { value: edit.value });
      mem.setData(r.memory);
      setEdit(null);
    } catch (err) {
      failed(err);
    }
  };
  const remove = async (key: string) => {
    const r = await api<{ memory: MemoryView }>('DELETE', `/team/seats/${seat.seat}/memory/${key}`).catch((e) => (failed(e), null));
    if (r) mem.setData(r.memory);
  };
  const editor = (
    <form className="tm-memedit" onSubmit={save}>
      <textarea className="input" rows={3} value={edit?.value ?? ''} onChange={(e) => setEdit(edit && { ...edit, value: e.target.value })} aria-label={w('mem.edit')} />
      <span>
        <button type="submit" className="btn btn--small btn--primary">
          {w('mem.save')}
        </button>
        <button type="button" className="btn btn--small btn--quiet" onClick={() => setEdit(null)}>
          {w('mem.cancel')}
        </button>
      </span>
    </form>
  );
  return (
    <aside className="tm-mem" aria-label={w('mem.title', { name: seat.name })}>
      <h2>{w('mem.title', { name: seat.name })}</h2>
      <p className="oc__muted">{w('mem.sub')}</p>
      <section className="tm-sec">
        <h3>
          {w('mem.summary')}
          <button type="button" className="btn btn--small btn--quiet" onClick={() => setEdit({ key: 'summary', value: mem.data?.summary?.value ?? '' })}>
            {w('mem.edit')}
          </button>
        </h3>
        {edit?.key === 'summary' ? editor : <p>{mem.data?.summary?.value ?? w('mem.noSummary')}</p>}
      </section>
      <section className="tm-sec">
        <h3>
          {w('mem.facts')}
          <button type="button" className="btn btn--small btn--quiet" onClick={() => setEdit({ key: 'fact.new', value: '' })}>
            <Icon name="plus" size={12} /> {w('mem.add')}
          </button>
        </h3>
        {edit?.key === 'fact.new' ? editor : null}
        {!mem.data?.facts.length && edit?.key !== 'fact.new' ? <p className="oc__muted">{w('mem.noFacts')}</p> : null}
        <ul className="tm-facts">
          {(mem.data?.facts ?? []).map((f) => (
            <li key={f.key}>
              {edit?.key === f.key ? (
                editor
              ) : (
                <>
                  <span>{f.value}</span>
                  <small>{formatDate(f.updatedAt, locale)}</small>
                  <span className="tm-facts__tools">
                    <button type="button" className="btn btn--icon btn--small btn--quiet" aria-label={w('mem.edit')} onClick={() => setEdit({ key: f.key, value: f.value })}>
                      <Icon name="edit" size={12} />
                    </button>
                    <button type="button" className="btn btn--icon btn--small btn--quiet" aria-label={w('mem.delete')} onClick={() => remove(f.key)}>
                      <Icon name="trash" size={12} />
                    </button>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}

// ================================================================ Toplantılar

interface MeetingView {
  meeting: Meeting;
  lines: MeetingLine[];
  speaking: string | null;
  spentTokens: number;
  round?: { status: string } | null;
}

export function MeetingsSection({ beat, failed, go, open }: { beat: number; failed: (e: unknown) => void; go: TeamGo; open: string | null }) {
  const { w, locale } = useTeamWords();
  const [filter, setFilter] = useState<'all' | 'me' | 'without'>('all');
  const [find, setFind] = useState('');
  const [calling, setCalling] = useState(false);
  const list = useLoad<{ meetings: Meeting[] }>(`/office/meetings${filter === 'all' ? '' : `?with=${filter}`}`, beat, failed);
  const org = useLoad<TeamOrg>('/team/org', 0, failed);
  const names = useMemo(() => new Map((org.data?.seats ?? []).map((s) => [s.seat, s.name])), [org.data]);
  const nameOf = (s: string) => (s === 'owner' ? w('chat.you') : names.get(s) ?? s);
  if (open) return <MeetingDetail id={open} nameOf={nameOf} failed={failed} onBack={() => go({ section: 'meetings', q: null })} />;
  const f = find.trim().toLocaleLowerCase();
  const rows = (list.data?.meetings ?? []).filter((m) => !f || `${m.title} ${m.goal ?? ''}`.toLocaleLowerCase().includes(f));
  return (
    <Page
      title={w('meet.title')}
      sub={w('meet.sub')}
      tools={
        <button type="button" className="btn btn--small btn--primary" onClick={() => setCalling(true)}>
          <Icon name="plus" size={16} /> {w('meet.call')}
        </button>
      }
    >
      {calling && org.data ? (
        <CallMeeting
          seats={org.data.seats.filter((s) => s.state !== 'dormant' && s.filledBy !== 'human')}
          onCancel={() => setCalling(false)}
          onDone={(id) => {
            setCalling(false);
            go({ section: 'meetings', q: id });
          }}
          failed={failed}
        />
      ) : null}
      <div className="tm-filter">
        <div className="tm-seg" role="group">
          {(['all', 'me', 'without'] as const).map((k) => (
            <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>
              {w(k === 'all' ? 'meet.all' : k === 'me' ? 'meet.withMe' : 'meet.withoutMe')}
            </button>
          ))}
        </div>
        <input className="input" type="search" placeholder={w('meet.search')} aria-label={w('meet.search')} value={find} onChange={(e) => setFind(e.target.value)} />
      </div>
      {list.error && !list.data ? <LoadError onRetry={list.reload} /> : null}
      {!list.data && !list.error ? <SkeletonRows label={w('common.loading')} /> : null}
      {list.data && !rows.length ? <EmptyState icon="calendar" title={w('meet.empty')} /> : null}
      <ul className="tm-meetings">
        {rows.map((m) => (
          <li key={m.id}>
            <button type="button" onClick={() => go({ section: 'meetings', q: m.id })}>
              <span className="tm-chip" data-tone={m.status === 'live' ? 'late' : m.status === 'ended' ? 'done' : undefined}>
                {w(`meet.status.${m.status}` as TeamKey)}
              </span>
              <strong>{m.title}</strong>
              <small>
                {w('meet.calledBy', { name: nameOf(m.calledBy) })} · {w('meet.attendees', { n: m.attendees.length + (m.withOwner ? 1 : 0) })} · {formatDate(m.createdAt, locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </small>
              {m.minutes?.decisions.length ? <small>{m.minutes.decisions.slice(0, 2).join(' · ')}</small> : null}
            </button>
          </li>
        ))}
      </ul>
    </Page>
  );
}

export function CallMeeting({ seats, onCancel, onDone, failed }: { seats: TeamSeat[]; onCancel: () => void; onDone: (id: string) => void; failed: (e: unknown) => void }) {
  const { w } = useTeamWords();
  const [title, setTitle] = useState('');
  const [goal, setGoal] = useState('');
  const [who, setWho] = useState<Set<string>>(new Set(['coo', 'note-taker']));
  const [timeBox, setTimeBox] = useState(20);
  const [budget, setBudget] = useState(20000);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const r = await api<{ meeting: Meeting }>('POST', '/office/meetings', { title, goal, attendees: [...new Set([...who, 'note-taker'])], timeBoxMin: timeBox, tokenBudget: budget });
      onDone(r.meeting.id);
    } catch (err) {
      failed(err);
    }
  };
  return (
    <form className="tm-call" onSubmit={submit}>
      <label className="field">
        <span>{w('meet.form.title')}</span>
        <input className="input" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="field">
        <span>{w('meet.form.goal')}</span>
        <textarea className="input" required rows={3} maxLength={2000} value={goal} onChange={(e) => setGoal(e.target.value)} />
      </label>
      <fieldset className="tm-pick">
        <legend>{w('meet.form.attendees')}</legend>
        {seats.map((s) => (
          <label key={s.seat}>
            <input
              type="checkbox"
              checked={who.has(s.seat)}
              disabled={s.seat === 'note-taker'}
              onChange={(e) => {
                const n = new Set(who);
                if (e.target.checked) n.add(s.seat);
                else n.delete(s.seat);
                setWho(n);
              }}
            />
            <Avatar seat={s} size="s" /> {s.name} <small>{s.title}</small>
          </label>
        ))}
      </fieldset>
      <div className="tm-two">
        <label className="field">
          <span>{w('meet.form.timeBox')}</span>
          <input className="input" type="number" min={5} max={120} value={timeBox} onChange={(e) => setTimeBox(Number(e.target.value))} />
        </label>
        <label className="field">
          <span>{w('meet.form.budget')}</span>
          <input className="input" type="number" min={2000} max={200000} step={1000} value={budget} onChange={(e) => setBudget(Number(e.target.value))} />
        </label>
      </div>
      <span className="tm-call__go">
        <button type="submit" className="btn btn--primary" disabled={who.size < 2}>
          {w('meet.form.go')}
        </button>
        <button type="button" className="btn btn--quiet" onClick={onCancel}>
          {w('meet.form.cancel')}
        </button>
      </span>
    </form>
  );
}

export function MeetingDetail({ id, nameOf, failed, onBack }: { id: string; nameOf: (s: string) => string; failed: (e: unknown) => void; onBack: () => void }) {
  const { w, locale } = useTeamWords();
  const [beat, setBeat] = useState(0);
  const view = useLoad<MeetingView>(`/team/meetings/${id}`, beat, failed);
  const [joined, setJoined] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const live = view.data?.meeting.status === 'live' || view.data?.meeting.status === 'scheduled';
  // A live meeting is followed every few seconds (the transcript grows as each attendee speaks).
  useEffect(() => {
    if (!live) return;
    const t = window.setInterval(() => document.visibilityState === 'visible' && setBeat((b) => b + 1), 4000);
    return () => window.clearInterval(t);
  }, [live]);
  const act = async (what: string, fn: () => Promise<MeetingView>) => {
    setBusy(what);
    try {
      const r = await fn();
      view.setData(r);
      if (r.round && r.round.status !== 'spoke') setNote(w(`meet.roundResult.${r.round.status}` as TeamKey));
    } catch (e) {
      failed(e);
      setNote(w('common.error'));
    } finally {
      setBusy(null);
    }
  };
  const say = (e: FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    void act('say', async () => {
      const r = await api<MeetingView>('POST', `/team/meetings/${id}/say`, { text: body });
      setText('');
      return r;
    });
  };
  if (!view.data) return <Page title={w('meet.title')}>{view.error ? <LoadError onRetry={view.reload} /> : <SkeletonRows label={w('common.loading')} />}</Page>;
  const { meeting: m, lines } = view.data;
  const min = m.minutes;
  const items = (title: string, xs: string[] | undefined, extra?: ReactNode) => (
    <section className="tm-sec">
      <h3>{title}</h3>
      {extra}
      {xs?.length ? (
        <ul>
          {xs.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      ) : (
        <p className="oc__muted">{w('meet.none')}</p>
      )}
    </section>
  );
  return (
    <Page
      title={m.title}
      sub={
        <>
          <span className="tm-chip" data-tone={m.status === 'live' ? 'late' : m.status === 'ended' ? 'done' : undefined}>
            {w(`meet.status.${m.status}` as TeamKey)}
          </span>{' '}
          {w('meet.calledBy', { name: nameOf(m.calledBy) })} · {m.attendees.map(nameOf).join(', ')}
          {m.tokenBudget ? ` · ${w('meet.spent', { spent: formatNumber(view.data.spentTokens, locale), budget: formatNumber(m.tokenBudget, locale) })}` : ''}
        </>
      }
      tools={
        <>
          <button type="button" className="btn btn--small btn--quiet" onClick={onBack}>
            <Icon name="arrowLeft" size={16} /> {w('meet.back')}
          </button>
          {live ? (
            <>
              <button type="button" className="btn btn--small" disabled={!!busy} onClick={() => act('round', () => api('POST', `/team/meetings/${id}/round`))}>
                <Icon name="play" size={16} /> {w('meet.round')}
              </button>
              <button type="button" className="btn btn--small" aria-pressed={joined} onClick={() => setJoined(!joined)}>
                <Icon name={joined ? 'logout' : 'userPlus'} size={16} /> {w(joined ? 'meet.leave' : 'meet.join')}
              </button>
              <button type="button" className="btn btn--small btn--primary" disabled={!!busy} onClick={() => act('close', () => api('POST', `/team/meetings/${id}/close`))}>
                <Icon name="note" size={16} /> {busy === 'close' ? w('meet.closing') : w('meet.close')}
              </button>
            </>
          ) : null}
        </>
      }
    >
      {note ? (
        <p className="tm-note" role="status">
          {note}
        </p>
      ) : null}
      {m.goal ? <p className="tm-goal">{m.goal}</p> : null}
      <div className="tm-meet">
        <section className="tm-transcript" aria-label={w('meet.transcript')}>
          <h2>{w('meet.transcript')}</h2>
          {!lines.length ? <p className="oc__muted">{w('meet.noLines')}</p> : null}
          <ol aria-live="polite">
            {lines.map((l) => (
              <li key={l.id} data-owner={l.speaker === 'owner' ? '' : undefined}>
                <strong>{nameOf(l.speaker)}</strong>
                <small>{formatDate(l.at, locale, { hour: '2-digit', minute: '2-digit' })}</small>
                <p>{l.body}</p>
              </li>
            ))}
          </ol>
          {view.data.speaking ? (
            <p className="tm-typing" role="status">
              {w('meet.speaking', { name: nameOf(view.data.speaking) })}
            </p>
          ) : null}
          {joined && live ? (
            <form className="tm-compose" onSubmit={say}>
              <p className="oc__muted">{w('meet.joined')}</p>
              <textarea className="input" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={w('meet.say')} aria-label={w('meet.say')} />
              <button type="submit" className="btn btn--primary" disabled={!!busy || !text.trim()}>
                <Icon name="send" size={16} /> {w('chat.send')}
              </button>
            </form>
          ) : null}
        </section>
        <section className="tm-minutes" aria-label={w('meet.minutes')}>
          <h2>{w('meet.minutes')}</h2>
          {!min ? (
            <>
              <p className="oc__muted">{w('meet.minutesLive')}</p>
              {items(w('meet.agenda'), m.goal ? [m.goal] : [])}
              {items(w('meet.spoke'), [...new Set(lines.map((l) => nameOf(l.speaker)))])}
            </>
          ) : (
            <>
              {items(w('meet.agenda'), min.agenda)}
              <section className="tm-sec">
                <h3>{w('meet.items')}</h3>
                {min.items.length ? (
                  <dl>
                    {min.items.map((i) => (
                      <div key={i.topic}>
                        <dt>{i.topic}</dt>
                        <dd>{i.summary}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="oc__muted">{w('meet.none')}</p>
                )}
              </section>
              {items(w('meet.decisions'), min.decisions, <p className="oc__muted">{w('meet.decisionsNote')}</p>)}
              {items(
                w('meet.actions'),
                min.actions.map((a) => `${nameOf(a.seat)}: ${a.what}${a.due ? ` (${a.due})` : ''}`),
              )}
              {items(w('meet.questions'), min.openQuestions)}
            </>
          )}
        </section>
      </div>
    </Page>
  );
}
