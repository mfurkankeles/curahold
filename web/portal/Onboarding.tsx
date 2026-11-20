// The customer's own onboarding plan in the company's portal (in the
// company's colours): what is next and whose turn it is, how far along it is,
// the steps by phase with why a locked one waits, their own manual steps to
// tick, a step's short form (written to their record), the data rows to say
// look right, the shared issues (and a way to raise one), the people of both
// sides and the goals. Read from /papi/onboarding (portal_onboarding()).
import { useState } from 'react';
import type { MessageKey } from '../../shared/src/i18n/core';
import { fieldState, milestones, nextStep, ordered, phaseLabel, phaseOrder, progressOf, turnOf, type PlanPhase, type PlanStep, type StepSide } from '../../shared/src/onboarding';
import type { PortalMe, PortalOrg } from '../../shared/src/portal';
import { formatDate } from '../src/lib/format';
import { call, callWith, Failure, FilePick, Files, Ico, link, State, useLoad, type Ctx } from './Portal';
import './onboarding.css';

interface PStep {
  id: string;
  key: string;
  titleKey: string | null;
  title: string | null;
  body: string;
  phase: PlanStep['phase'];
  side: StepSide;
  status: PlanStep['status'];
  signal: string | null;
  dueOn: string | null;
  doneAt: string | null;
  doneHow: PlanStep['doneHow'];
  startOn: string | null;
  updatedAt: string;
  dependsOn: string[];
  form: string[];
  position: number;
  required: boolean;
  upload: boolean;
  person: string | null;
  files: { id: string; name: string; size: number; mine: boolean }[];
}
interface PPlan {
  id: string;
  name: string;
  phases: PlanPhase[];
  status: string;
  welcome: string;
  account: string;
  startedOn: string;
  targetOn: string | null;
  owner: string | null;
  steps: PStep[];
  goals: { id: string; titleKey: string | null; title: string | null; priority: string; status: string; targetOn: string | null }[];
  people: { id: string; side: 'vendor' | 'customer'; name: string; role: string; duty: string; contact: string; me: boolean }[];
  issues: { id: string; title: string; side: 'vendor' | 'customer'; urgency: string; status: 'open' | 'waiting' | 'resolved'; openedOn: string; dueOn: string | null }[];
  fields: { id: string; name: string; source: string; example: string; type: any; required: boolean; received: string | null; autoOk: boolean | null; fixedAt: string | null; checkedAt: string | null; verifiedAt: string | null }[];
  formFields: { key: string; label: Record<string, string> | string; type: string }[];
  fieldValues: Record<string, unknown>;
}

const today = () => new Date().toISOString().slice(0, 10);
const asStep = (s: PStep) => ({ ...s, dueOn: s.dueOn?.slice(0, 10) ?? null, updatedAt: s.updatedAt ?? s.doneAt ?? today() });

/** A line above the requests: "Your onboarding: 60% · next: …" (only while a plan runs). */
export function OnboardingBanner({ ctx }: { ctx: Ctx }) {
  const { data } = useLoad(() => call<{ plans: PPlan[] }>('GET', '/onboarding').then((r) => r.plans), [], () => undefined);
  const plan = (data ?? []).find((p) => p.status === 'active' || p.status === 'paused');
  if (!plan) return null;
  const steps = plan.steps.map(asStep);
  const pct = progressOf(steps, [], today()).pct;
  return (
    <div className="p-wrap">
      <a className="p-ob-banner" {...link('/onboarding')}>
        <span className="p-ob-banner__pct">{pct}%</span>
        <span>
          <strong>{ctx.t('pob.banner')}</strong>
          <small>{plan.name}</small>
        </span>
        {/* Forward, to the plan: a left arrow here would read as Back. */}
        <Ico name="next" flip />
      </a>
    </div>
  );
}

/** The customer's view of their onboarding plan in the portal: steps, whose turn each is, files and progress. */
export function PortalOnboarding({ ctx, org, me, onSignedOut }: { ctx: Ctx; org: PortalOrg; me: PortalMe; onSignedOut: (n?: string) => void }) {
  const { t } = ctx;
  const { data, failed, reload, setData } = useLoad(() => call<{ plans: PPlan[] }>('GET', '/onboarding').then((r) => r.plans), [], onSignedOut);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const act = async (id: string, kind: 'tick' | 'check' | 'issue' | 'answer', body: Record<string, string> = {}) => {
    setBusy(true);
    setProblem(null);
    try {
      setData((await call<{ plans: PPlan[] }>('POST', `/onboarding/${id}/${kind}`, body)).plans);
    } catch (e) {
      if (e instanceof Failure && e.status === 401) onSignedOut('expired');
      else setProblem(e instanceof Failure && e.message ? e.message : t('pob.failed'));
    } finally {
      setBusy(false);
    }
  };
  /** Files for a step of the plan (the server checks type, size and the company's allowance again). */
  const send = async (stepId: string, files: File[]) => {
    setBusy(true);
    setProblem(null);
    try {
      setData((await callWith<{ plans: PPlan[] }>('POST', `/onboarding-steps/${stepId}/files`, {}, files)).plans);
      return true;
    } catch (e) {
      if (e instanceof Failure && e.status === 401) onSignedOut('expired');
      else setProblem(e instanceof Failure && e.message ? e.message : t('pob.failed'));
      return false;
    } finally {
      setBusy(false);
    }
  };
  if (failed)
    return (
      <div className="p-wrap p-page">
        <State page icon="alert" tone="error" title={t('portal.errorTitle')} body={t('portal.errorBody')}>
          <button className="p-btn" onClick={reload}>
            {t('common.retry')}
          </button>
        </State>
      </div>
    );
  if (!data) return <div className="p-wrap p-page" aria-busy="true" />;
  const plan = data.find((p) => p.status === 'active' || p.status === 'paused') ?? data[0];
  if (!plan)
    return (
      <div className="p-wrap p-page">
        <State page icon="inbox" title={t('pob.noneTitle')} body={t('pob.none')} />
      </div>
    );
  return <PlanView ctx={ctx} company={org.name} me={me} plan={plan} busy={busy} problem={problem} act={act} send={send} />;
}

function PlanView({ ctx, company, me, plan, busy, problem, act, send }: { ctx: Ctx; company: string; me: PortalMe; plan: PPlan; busy: boolean; problem: string | null; act: (id: string, kind: 'tick' | 'check' | 'issue' | 'answer', body?: Record<string, string>) => Promise<void>; send: (stepId: string, files: File[]) => Promise<boolean> }) {
  const { t, locale } = ctx;
  const tt = (k: string, v?: Record<string, string | number>) => t(k as MessageKey, v);
  // The plan's own phases, in its order and with its own names (the built-in names are ob.phase.*).
  const phases = phaseOrder(plan.phases, plan.steps.map((s) => s.phase));
  const phaseName = (key: string) => phaseLabel(key, phases, (k) => tt(`ob.phase.${k.replace(/^ob\.phase\./, '')}`));
  const steps = plan.steps.map((s) => ({ ...asStep(s), phaseAt: phases.findIndex((p) => p.key === s.phase) }));
  const [chosen, setChosen] = useState<File[]>([]);
  const progress = progressOf(steps, plan.issues.map((i) => ({ ...i, openedOn: i.openedOn.slice(0, 10), dueOn: i.dueOn?.slice(0, 10) ?? null })), today(), plan.status as any, plan.startedOn.slice(0, 10));
  const next = nextStep(steps);
  const nextTurn = next ? turnOf(next, steps, plan.startedOn, today()) : null;
  const day = (d: string) => formatDate(d, locale, { day: 'numeric', month: 'short' });
  // A few built-in steps read differently from the customer's side ("Sign in to the portal", not "They signed in").
  const OWN: Record<string, string> = { portalActive: t('pob.step.portalActive'), firstRequest: t('pob.step.firstRequest') };
  const title = (s: Pick<PStep, 'title' | 'titleKey' | 'key'>) => s.title ?? OWN[s.titleKey ?? s.key] ?? tt(`ob.step.${s.titleKey ?? s.key}.title`);
  const side = (s: StepSide) => (s === 'both' ? t('pob.side.both') : s === 'customer' ? t('pob.side.you') : company);
  const [open, setOpen] = useState<string | null>(null);
  const [issue, setIssue] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(plan.fieldValues ?? {}).map(([k, v]) => [k, v == null ? '' : String(v)])));
  const labelOf = (f: PPlan['formFields'][number]) => (typeof f.label === 'string' ? f.label : (f.label?.[locale] ?? f.label?.en ?? f.key));
  return (
    <>
      <section className="p-hero">
        <div className="p-wrap">
          <span className="p-hero__kicker">{plan.account}</span>
          <div className="p-hero__row p-head">
            <h1>{plan.name}</h1>
          </div>
          {plan.welcome && <p className="p-ob-welcome">{plan.welcome}</p>}
        </div>
      </section>
      <div className="p-wrap p-page p-ob">
        {problem && (
          <p className="p-ob-problem" role="alert">
            {problem}
          </p>
        )}
        <div className="p-ob-grid">
          <div className="p-ob-main">
            <section className="p-card p-ob-next" data-mine={next?.side !== 'vendor' || undefined}>
              <span className="p-ob-label">{t('pob.next')}</span>
              {next ? (
                <>
                  <h2>{title(next)}</h2>
                  <p className="p-muted">
                    {t('pob.turn', { name: side(next.side) })}
                    {nextTurn && nextTurn.days > 0 ? ` · ${t('pob.days', { n: nextTurn.days })}` : ''}
                    {next.dueOn ? ` · ${t('pob.due', { date: day(next.dueOn) })}` : ''}
                  </p>
                </>
              ) : (
                <h2>{t('pob.allDone')}</h2>
              )}
            </section>
            {phases.map((p) => p.key).filter((ph) => steps.some((s) => s.phase === ph)).map((ph) => (
              <section className="p-card p-ob-phase" key={ph}>
                <h2>{phaseName(ph)}</h2>
                <ol className="p-ob-steps">
                  {ordered(steps.filter((s) => s.phase === ph)).map((s) => {
                    const turn = turnOf(s, steps, plan.startedOn, today());
                    const closed = s.status === 'done' || s.status === 'skipped';
                    const locked = !closed && turn.locked;
                    const mine = s.side !== 'vendor';
                    const fields = plan.formFields.filter((f) => s.form.includes(f.key));
                    return (
                      <li key={s.id} data-status={s.status} data-locked={locked || undefined}>
                        <button type="button" className="p-ob-step" aria-expanded={open === s.id} onClick={() => (setOpen(open === s.id ? null : s.id), setChosen([]))}>
                          <span className="p-ob-step__mark" aria-hidden="true">
                            {closed ? <Ico name="check" /> : locked ? <Ico name="clock" /> : null}
                          </span>
                          <span className="p-ob-step__text">
                            <strong>{title(s)}</strong>
                            <small>
                              {side(s.side)}
                              {s.person ? ` · ${s.person}` : ''}
                              {s.dueOn && !closed ? ` · ${t('pob.due', { date: day(s.dueOn) })}` : ''}
                              {closed && s.doneHow === 'auto' ? ` · ${t('pob.doneAuto')}` : ''}
                            </small>
                            {locked && (
                              <small className="p-ob-lock">
                                {t('pob.waits', { steps: turn.waitingOn.map((k) => title(steps.find((x) => x.key === k)!)).join(', '), name: side(turn.turn) })}
                              </small>
                            )}
                          </span>
                        </button>
                        {open === s.id && (
                          <div className="p-ob-step__body">
                            {(s.body || !s.title) && <p>{s.body || tt(`ob.step.${s.titleKey ?? s.key}.body`)}</p>}
                            {mine && !closed && !locked && fields.length > 0 && (
                              <form
                                className="p-ob-form"
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  void act(s.id, 'answer', Object.fromEntries(fields.map((f) => [f.key, answers[f.key] ?? ''])));
                                }}
                              >
                                {fields.map((f) => (
                                  <label className="p-field" key={f.key}>
                                    <span>{labelOf(f)}</span>
                                    <input type={f.type === 'date' ? 'date' : f.type === 'url' ? 'url' : 'text'} value={answers[f.key] ?? ''} onChange={(e) => setAnswers({ ...answers, [f.key]: e.target.value })} />
                                  </label>
                                ))}
                                <button className="p-btn p-btn--primary" disabled={busy}>
                                  {t('pob.send')}
                                </button>
                              </form>
                            )}
                            {mine && !closed && !locked && !s.signal && s.form.length === 0 && (
                              <button className="p-btn p-btn--primary" disabled={busy} onClick={() => void act(s.id, 'tick')}>
                                <Ico name="check" /> {t('pob.done')}
                              </button>
                            )}
                            {s.signal && !closed && <p className="p-muted">{t('pob.autoNote')}</p>}
                            <Files ctx={ctx} files={s.files ?? []} />
                            {(mine || s.upload) && (plan.status === 'active' || plan.status === 'paused') && (
                              <div className="p-ob-upload">
                                <p className="p-muted">{t('pob.filesLead')}</p>
                                <FilePick ctx={ctx} files={chosen} setFiles={setChosen} />
                                {chosen.length > 0 && (
                                  <button className="p-btn p-btn--primary" disabled={busy} onClick={() => void send(s.id, chosen).then((ok) => ok && setChosen([]))}>
                                    <Ico name="clip" /> {t('pob.filesSend')}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
            {plan.fields.length > 0 && (
              <section className="p-card p-ob-data">
                <h2>{t('pob.data')}</h2>
                <p className="p-muted">{t('pob.dataLead')}</p>
                <ul className="p-ob-rows">
                  {plan.fields.map((f) => {
                    const st = fieldState({ ...f, fixedAt: f.fixedAt });
                    return (
                      <li key={f.id} data-state={st}>
                        <span>
                          <strong>{f.source === 'custom' && ['name', 'email', 'value', 'start'].includes(f.name) ? tt(`ob.fieldRow.${f.name}`) : f.name}</strong>
                          <small>
                            {tt(`ob.type.${f.type}`)}
                            {f.example ? ` · ${f.example}` : ''}
                            {f.received != null ? ` · ${t('pob.received', { value: f.received || '∅' })}` : ''}
                          </small>
                        </span>
                        {st === 'failing' && <span className="p-ob-bad">{t('pob.fix')}</span>}
                        {f.checkedAt ? (
                          <span className="p-ob-ok">
                            <Ico name="check" /> {t('pob.checked')}
                          </span>
                        ) : (
                          <button className="p-btn" disabled={busy} onClick={() => void act(f.id, 'check')}>
                            {t('pob.looksRight')}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
            <section className="p-card p-ob-issues">
              <h2>{t('pob.issues')}</h2>
              <ul className="p-ob-rows">
                {plan.issues
                  .filter((i) => i.status !== 'resolved')
                  .map((i) => (
                    <li key={i.id}>
                      <span>
                        <strong>{i.title}</strong>
                        <small>
                          {t('pob.waitsOn', { name: side(i.side) })} · {day(i.openedOn)}
                        </small>
                      </span>
                    </li>
                  ))}
                {!plan.issues.some((i) => i.status !== 'resolved') && <li className="p-muted">{t('pob.noIssues')}</li>}
              </ul>
              <form
                className="p-ob-ask"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (issue.trim()) void act(plan.id, 'issue', { title: issue.trim() }).then(() => setIssue(''));
                }}
              >
                <label className="p-field">
                  <span>{t('pob.raise')}</span>
                  <input value={issue} maxLength={200} onChange={(e) => setIssue(e.target.value)} />
                </label>
                <button className="p-btn" disabled={busy || !issue.trim()}>
                  {t('pob.raiseSend')}
                </button>
              </form>
            </section>
          </div>
          <aside className="p-ob-side">
            <section className="p-card p-ob-progress">
              <span className="p-ob-label">{t('pob.progress')}</span>
              <strong className="p-ob-pct">{progress.pct}%</strong>
              <div className="p-ob-bars">
                {milestones(steps).map((m) => (
                  <div key={m.phase}>
                    <small>{phaseName(m.phase)}</small>
                    <span className="p-ob-bar">
                      <span style={{ width: `${m.pct}%` }} />
                    </span>
                  </div>
                ))}
              </div>
              {plan.targetOn && <p className="p-muted">{t('pob.target', { date: day(plan.targetOn) })}</p>}
            </section>
            {plan.goals.length > 0 && (
              <section className="p-card">
                <h2>{t('pob.goals')}</h2>
                <ul className="p-ob-goals">
                  {plan.goals.map((g) => (
                    <li key={g.id} data-status={g.status}>
                      {g.status === 'done' && <Ico name="check" />}
                      {g.title ?? tt(`ob.goal.${g.titleKey}`)}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section className="p-card p-ob-people">
              <h2>{t('pob.people')}</h2>
              {(['vendor', 'customer'] as const).map((sd) => (
                <div key={sd}>
                  <h3>{sd === 'vendor' ? company : me.account.name}</h3>
                  <ul>
                    {plan.people
                      .filter((p) => p.side === sd)
                      .map((p) => (
                        <li key={p.id}>
                          <strong>{p.name}</strong>
                          <small>
                            {tt(`ob.role.${p.role}`)}
                            {p.contact ? ` · ${p.contact}` : ''}
                          </small>
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </section>
          </aside>
        </div>
      </div>
    </>
  );
}
