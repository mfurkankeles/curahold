// Onboarding plans (shared/src/onboarding.ts, routes/onboardingPlans.ts): one
// mutual plan, used two ways.
//   /onboarding (and /o/<company> in development): the company's own
//     getting-started hub with Curahold, at <company>.<domain>/onboarding.
//   /onboarding/plans: the plans the company runs for its customers (the
//     portfolio, with stall flags), /onboarding/plans/<id> one of them, and
//     /onboarding/templates the templates they are made from.
//   /r/onboarding/<secret>: the progress report behind a shared link (no sign-in).
// The hub reads one answer (the whole plan) and every change answers with the
// plan again, so what is on screen is always what the server worked out.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  checkField,
  fieldState,
  GOAL_PRIORITIES,
  ISSUE_TYPES,
  metricGain,
  milestones,
  nextStep,
  ordered,
  PHASES,
  ROLES,
  SETUP_LINKS,
  SIGNALS,
  SITE_STATUSES,
  turnOf,
  URGENCIES,
  VIEW_SECTIONS,
  viewForRole,
  type HubView,
  type Phase,
  type Plan,
  type PlanField,
  type PlanIssue,
  type PlanReport,
  type PlanStep,
  type PlanSummary,
  type Side,
  type StepSide,
  type Template,
  type TemplateRule,
  type OnboardingSettings as OnboardingSettingsShape,
  type PlanPhase,
  ASK_TEMPLATE,
  MAX_TEMPLATE_RULES,
  MAX_PHASES,
  phaseLabel,
} from '../../../shared/src/onboarding';
import type { MessageKey } from '../../../shared/src/i18n';
import { EmptyState } from '../components/Empty';
import { Icon, PageIcon, type IconName } from '../components/icons';
import { Dialog } from '../components/ui';
import { AccountPicker } from '../components/AccountPicker';
import { ApiFailure, del, get, patch, post, put } from '../lib/api';
import { formatBytes, formatDayShort, formatPercent } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { navigate, useLocation } from '../lib/router';
import { runSetupTest } from '../lib/setupContract';
import { useStore } from '../lib/store';
import { docsHref, docsLink } from '../lib/docs';
import '../surfaces/onboarding.css';
import { LegalNotice } from '../components/LegalNotice';

type T = (key: string, vars?: Record<string, string | number>) => string;
const useT = () => {
  const i = useI18n();
  const t: T = (k, v) => i.t(k as MessageKey, v);
  return { ...i, tt: t };
};
const today = () => new Date().toISOString().slice(0, 10);
/** A help page (with its anchor) in the reader's language. */
const guideHref = (locale: string, guide: string) => {
  const [page, anchor] = guide.split('#');
  return `${docsHref(`${locale}/${page}`)}${anchor ? `#${anchor}` : ''}`;
};

// ------------------------------------------------------------------ words

const stepTitle = (t: T, s: Pick<PlanStep, 'title' | 'titleKey' | 'key'>) => s.title ?? t(`ob.step.${s.titleKey ?? s.key}.title`);
const stepBody = (t: T, s: Pick<PlanStep, 'body' | 'titleKey' | 'key' | 'title'>) => s.body || (s.title ? '' : t(`ob.step.${s.titleKey ?? s.key}.body`));
const goalTitle = (t: T, g: { title: string | null; titleKey: string | null }) => g.title ?? t(`ob.goal.${g.titleKey}`);
const metricTitle = (t: T, m: { title: string | null; titleKey: string | null }) => m.title ?? t(`ob.metric.${m.titleKey}`);
const fieldName = (t: T, f: Pick<PlanField, 'name' | 'source'>) => (f.source === 'custom' && ['name', 'email', 'value', 'start'].includes(f.name) ? t(`ob.fieldRow.${f.name}`) : f.name);
/** "Curahold" / "Your team" on the company's own plan; "Our team" / the customer on a customer's plan. */
const sideName = (t: T, plan: Pick<Plan, 'kind' | 'accountName'>, side: StepSide) =>
  side === 'both' ? t('ob.side.both') : plan.kind === 'self' ? t(`ob.side.${side}.self`) : side === 'vendor' ? t('ob.side.vendor.client') : (plan.accountName ?? t('ob.side.customer.client'));

// ------------------------------------------------------------------ pages

/** The company's own hub with Curahold. */
export function OnboardingSelfPage() {
  const { tt: t } = useT();
  const [plan, setPlan] = useState<Plan | null | undefined>(undefined);
  const load = useCallback(() => get<{ plan: Plan | null }>('/onboarding/self').then((r) => setPlan(r.plan)), []);
  useEffect(() => void load().catch(() => setPlan(null)), [load]);
  if (plan === undefined) return <Loading />;
  if (!plan)
    return (
      <div className="page">
        <EmptyState icon="flag" tone="calm" title={t('ob.self.noneTitle')} body={t('ob.self.none')} />
      </div>
    );
  return <Hub plan={plan} onPlan={setPlan} reload={load} />;
}

/** One customer's plan. */
export function OnboardingPlanPage({ id }: { id: string }) {
  const [plan, setPlan] = useState<Plan | null | undefined>(undefined);
  const load = useCallback(() => get<{ plan: Plan }>(`/onboarding-plans/${id}`).then((r) => setPlan(r.plan)), [id]);
  useEffect(() => void load().catch(() => setPlan(null)), [load]);
  const { tt: t } = useT();
  if (plan === undefined) return <Loading />;
  if (!plan)
    return (
      <div className="page">
        <EmptyState icon="search" title={t('ob.notFound')} />
      </div>
    );
  return <Hub plan={plan} onPlan={setPlan} reload={load} />;
}

function Loading() {
  return (
    <div className="page ob-wait" aria-busy="true">
      <div className="skeleton ob-wait__head" />
      <div className="skeleton ob-wait__body" />
    </div>
  );
}

// ------------------------------------------------------------------ the hub

function Hub({ plan, onPlan, reload }: { plan: Plan; onPlan: (p: Plan) => void; reload: () => Promise<unknown> }) {
  const { tt: t, locale } = useT();
  const { me, toast } = useStore();
  const { search } = useLocation();
  const mine = plan.people.find((p) => p.userId === me.user.id);
  const [view, setView] = useState<HubView>(() => (new URLSearchParams(search).get('view') as HubView) || viewForRole(mine?.role));
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState<string | null>(null);
  const fail = (e: unknown) => toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
  /** Every change answers with the whole plan. */
  const act = async (fn: () => Promise<{ plan: Plan }>, done?: string) => {
    setBusy(true);
    try {
      onPlan((await fn()).plan);
      if (done) toast(done);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  const sections = VIEW_SECTIONS[view];
  const show = (s: (typeof sections)[number]) => sections.includes(s);
  const ctx: Ctx = { plan, t, locale, act, busy, canEdit: plan.canEdit, reload, fail };
  const share = async () => {
    try {
      const r = await post<{ url: string }>(`/onboarding-plans/${plan.id}/share`);
      setSharing(r.url);
    } catch (e) {
      fail(e);
    }
  };
  const meta = [plan.kind === 'client' ? plan.accountName : null, t('ob.started', { date: formatDayShort(plan.startedOn, locale) }), plan.targetOn ? t('ob.target', { date: formatDayShort(plan.targetOn, locale) }) : null].filter(Boolean).join(' · ');
  return (
    <>
      <header className="topbar ob-top">
        <div className="topbar__titles topbar__titles--icon">
          <PageIcon name="flag" />
          <h1 className="topbar__title">{plan.name}</h1>
          <p className="topbar__sub">{meta}</p>
        </div>
        <div className="ob-top__tools">
          <div className="ob-views" role="group" aria-label={t('ob.view.label')} data-tour="ob-views">
            {(['lead', 'sponsor', 'tech'] as const).map((v) => (
              <button key={v} type="button" className="ob-views__btn" aria-pressed={view === v} onClick={() => setView(v)}>
                {t(`ob.view.${v}`)}
              </button>
            ))}
          </div>
          <a className="btn btn--small" href={`/onboarding/report/${plan.id}`} onClick={(e) => (e.preventDefault(), navigate(`/onboarding/report/${plan.id}`))} data-tour="ob-report">
            <Icon name="chart" size={15} /> {t('ob.report.open')}
          </a>
          {plan.canEdit && (
            <button className="btn btn--small" onClick={() => void share()}>
              <Icon name="link" size={15} /> {t('ob.share')}
            </button>
          )}
        </div>
      </header>
      <div className="page ob" data-kind={plan.kind}>
        <div className="ob-grid">
          <div className="ob-main">
            {show('next') && <NextCard ctx={ctx} />}
            {plan.welcome && view !== 'tech' && <Welcome ctx={ctx} />}
            {show('steps') && <Steps ctx={ctx} />}
            {show('timeline') && <Timeline ctx={ctx} compact={view === 'sponsor'} />}
            {show('issues') && <Issues ctx={ctx} />}
            {show('mapping') && <Mapping ctx={ctx} />}
            {show('sites') && plan.sites.length > 0 && <Sites ctx={ctx} />}
            {show('metrics') && plan.metrics.length > 0 && <Metrics ctx={ctx} />}
            <LegalNotice t={t} />
          </div>
          <aside className="ob-side">
            <ProgressCard ctx={ctx} />
            <Health ctx={ctx} />
            {show('goals') && <Goals ctx={ctx} />}
            {show('people') && <People ctx={ctx} />}
            {plan.kind === 'client' && view === 'lead' && <Note ctx={ctx} />}
            {plan.kind === 'client' && view === 'lead' && plan.canEdit && <Finish ctx={ctx} />}
          </aside>
        </div>
      </div>
      {sharing && (
        <Dialog title={t('ob.share.title')} onClose={() => setSharing(null)} footer={<button className="btn btn--primary" onClick={() => setSharing(null)}><Icon name="close" size={16} /> {t('common.close')}</button>}>
          <p>{t('ob.share.body')}</p>
          <div className="ob-copy">
            <input className="input" readOnly value={sharing} aria-label={t('ob.share.title')} onFocus={(e) => e.currentTarget.select()} />
            <button className="btn" onClick={() => void navigator.clipboard?.writeText(sharing).then(() => toast(t('ob.copied')))}>
              <Icon name="copy" size={15} /> {t('ob.copy')}
            </button>
          </div>
          <p className="muted ob-copy__note">{t('ob.share.note')}</p>
        </Dialog>
      )}
    </>
  );
}

interface Ctx {
  plan: Plan;
  t: T;
  locale: ReturnType<typeof useI18n>['locale'];
  act: (fn: () => Promise<{ plan: Plan }>, done?: string) => Promise<void>;
  busy: boolean;
  canEdit: boolean;
  reload: () => Promise<unknown>;
  fail: (e: unknown) => void;
}

function Section({ id, title, count, tools, children, tour }: { id: string; title: string; count?: ReactNode; tools?: ReactNode; children: ReactNode; tour?: string }) {
  return (
    <section className="sheet ob-sec" id={id} aria-labelledby={`${id}-h`} data-tour={tour}>
      <div className="section__head ob-sec__head">
        <h2 id={`${id}-h`}>
          {title}
          {count != null && <span className="ob-count">{count}</span>}
        </h2>
        {tools}
      </div>
      {children}
    </section>
  );
}

// ------------------------------------------------------------------ the next step

function NextCard({ ctx }: { ctx: Ctx }) {
  const { plan, t, locale } = ctx;
  const next = nextStep(plan.steps);
  if (!next)
    return (
      <section className="ob-next" data-done="true" data-tour="ob-next">
        <span className="ob-next__icon" aria-hidden="true">
          <Icon name="trophy" size={22} />
        </span>
        <div>
          <p className="ob-next__label">{t('ob.next.label')}</p>
          <h2 className="ob-next__title">{plan.status === 'done' ? t('ob.next.finished') : t('ob.next.allDone')}</h2>
        </div>
      </section>
    );
  const turn = turnOf(next, plan.steps, plan.startedOn, today());
  const fix = next.fix ?? (next.signal ? SIGNALS[next.signal].fix : null);
  const href = fix && !fix.includes('{account}') ? fix : fix && plan.accountId ? fix.replace('{account}', plan.accountId) : null;
  return (
    <section className="ob-next" data-tour="ob-next" aria-labelledby="ob-next-h">
      <span className="ob-next__icon" aria-hidden="true">
        <Icon name="arrowRight" size={22} />
      </span>
      <div className="ob-next__text">
        <p className="ob-next__label">{t('ob.next.label')}</p>
        <h2 className="ob-next__title" id="ob-next-h">
          {stepTitle(t, next)}
        </h2>
        <p className="ob-next__meta">
          <span className="ob-side-chip" data-side={next.side}>
            {t('ob.turn', { name: sideName(t, plan, next.side) })}
          </span>
          {turn.days > 0 && <span>{t('ob.waitingDays', { n: turn.days })}</span>}
          {next.dueOn && <span>{t('ob.due', { date: formatDayShort(next.dueOn, locale) })}</span>}
          {next.signal && <span className="ob-auto">{t('ob.auto')}</span>}
        </p>
      </div>
      <div className="ob-next__actions">
        {href && href.startsWith('#') ? (
          <a className="btn btn--primary" href={href}>
            {t('ob.doIt')}
          </a>
        ) : href ? (
          <a className="btn btn--primary" href={href} onClick={(e) => (e.preventDefault(), navigate(href))}>
            {t('ob.doIt')}
          </a>
        ) : (
          <a className="btn btn--primary" href={`#step-${next.id}`}>
            {t('ob.openStep')}
          </a>
        )}
      </div>
    </section>
  );
}

function Welcome({ ctx }: { ctx: Ctx }) {
  const { plan, t } = ctx;
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(`ob-welcome:${plan.id}`) === '1';
    } catch {
      return false;
    }
  });
  if (hidden) return null;
  return (
    <section className="ob-welcome" aria-label={t('ob.welcome.label')}>
      <p>{plan.welcome}</p>
      <button
        className="btn btn--small btn--quiet"
        onClick={() => {
          setHidden(true);
          try {
            localStorage.setItem(`ob-welcome:${plan.id}`, '1');
          } catch {
            /* private mode */
          }
        }}
      >
        <Icon name="chevronUp" size={16} />
        {t('ob.welcome.hide')}
      </button>
    </section>
  );
}

// ------------------------------------------------------------------ progress and health

function Ring({ pct, expected }: { pct: number; expected: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const at = (p: number) => (Math.min(100, Math.max(0, p)) / 100) * c;
  const angle = (expected / 100) * 2 * Math.PI - Math.PI / 2;
  return (
    <svg className="ob-ring" viewBox="0 0 80 80" aria-hidden="true">
      <circle cx="40" cy="40" r={r} className="ob-ring__track" />
      <circle cx="40" cy="40" r={r} className="ob-ring__fill" strokeDasharray={`${at(pct)} ${c}`} transform="rotate(-90 40 40)" />
      {expected > 0 && expected < 100 && <circle cx={40 + r * Math.cos(angle)} cy={40 + r * Math.sin(angle)} r="3" className="ob-ring__mark" />}
    </svg>
  );
}

function ProgressCard({ ctx }: { ctx: Ctx }) {
  const { plan, t, locale } = ctx;
  const p = plan.progress;
  return (
    <section className="sheet ob-progress" aria-labelledby="ob-progress-h" data-tour="ob-progress">
      <h2 id="ob-progress-h" className="sr-only">
        {t('ob.progress.title')}
      </h2>
      <div className="ob-progress__top">
        <div className="ob-progress__ring">
          <Ring pct={p.pct} expected={p.expected} />
          <strong>{formatPercent(p.pct, locale)}</strong>
        </div>
        <div className="ob-progress__text">
          <span className="ob-state" data-state={p.state}>
            {t(`ob.state.${p.state}`)}
          </span>
          <p>{t('ob.progress.expected', { pct: formatPercent(p.expected, locale) })}</p>
          <p className="muted">{t('ob.progress.steps', { done: p.done, total: p.total, auto: p.auto })}</p>
        </div>
      </div>
      <dl className="ob-wait-grid">
        <div data-tone={p.waiting.vendorDays >= 7 ? 'late' : undefined}>
          <dt>{t('ob.waitingOn', { name: sideName(t, plan, 'vendor') })}</dt>
          <dd>
            {t('ob.stepsN', { n: p.waiting.vendor })}
            {p.waiting.vendor > 0 && <small>{t('ob.longest', { n: p.waiting.vendorDays })}</small>}
          </dd>
        </div>
        <div data-tone={p.waiting.customerDays >= 7 ? 'late' : undefined}>
          <dt>{t('ob.waitingOn', { name: sideName(t, plan, 'customer') })}</dt>
          <dd>
            {t('ob.stepsN', { n: p.waiting.customer })}
            {p.waiting.customer > 0 && <small>{t('ob.longest', { n: p.waiting.customerDays })}</small>}
          </dd>
        </div>
        <div data-tone={p.issues.stuck ? 'late' : undefined}>
          <dt>{t('ob.issues.open')}</dt>
          <dd>
            {p.issues.open}
            {p.issues.stuck > 0 && <small>{t('ob.issues.stuckN', { n: p.issues.stuck })}</small>}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function Health({ ctx }: { ctx: Ctx }) {
  const { plan, t } = ctx;
  if (!plan.health.length) return null;
  return (
    <section className="sheet ob-health" aria-labelledby="ob-health-h">
      <div className="section__head">
        <h2 id="ob-health-h">{t('ob.health.title')}</h2>
      </div>
      <ul className="ob-health__list">
        {plan.health.map((h) => (
          <li key={h.key} data-tone={h.tone}>
            <span className="ob-dot" aria-hidden="true" />
            <span className="ob-health__text">{t(`ob.health.${h.key}.${h.tone}`, { ...h.vars, side: h.vars.side ? sideName(t, plan, h.vars.side as Side) : '' })}</span>
            <a
              className="ob-health__src"
              href={h.source}
              onClick={(e) => {
                if (h.source.startsWith('#')) return;
                e.preventDefault();
                navigate(h.source);
              }}
            >
              {t(`ob.health.src.${h.key}`)}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ------------------------------------------------------------------ steps by phase

function Steps({ ctx }: { ctx: Ctx }) {
  const { plan, t } = ctx;
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const phases = plan.phases.map((p) => p.key).filter((ph) => plan.steps.some((s) => s.phase === ph));
  const [open, setOpen] = useState<string | null>(() => (location.hash.startsWith('#step-') ? location.hash.slice(6) : null));
  return (
    <Section
      id="steps"
      title={t('ob.steps.title')}
      tour="ob-steps"
      tools={
        ctx.canEdit ? (
          <>
            <button className="btn btn--small btn--quiet" onClick={() => setEditing(!editing)} aria-pressed={editing} data-tour="ob-edit">
              <Icon name={editing ? 'check' : 'edit'} size={15} /> {t(editing ? 'ob.edit.done' : 'ob.edit.open')}
            </button>
            {!editing && (
              <button className="btn btn--small btn--quiet" onClick={() => setAdding(true)}>
                <Icon name="plus" size={15} /> {t('ob.steps.add')}
              </button>
            )}
          </>
        ) : undefined
      }
    >
      {plan.status === 'draft' && plan.kind === 'client' && plan.steps.length === 0 && ctx.canEdit && <ChooseTemplate ctx={ctx} />}
      {editing && <PlanEditor ctx={ctx} />}
      {!editing && phases.map((ph) => {
        const list = ordered(plan.steps.filter((s) => s.phase === ph));
        const done = list.filter((s) => s.status === 'done' || s.status === 'skipped').length;
        return (
          <div className="ob-phase" key={ph}>
            <h3 className="ob-phase__head">
              <span>{phaseLabel(ph, plan.phases, t)}</span>
              <span className="muted">
                {done}/{list.length}
              </span>
            </h3>
            <ol className="ob-steps">
              {list.map((s) => (
                <StepRow key={s.id} ctx={ctx} step={s} open={open === s.id} onToggle={() => setOpen(open === s.id ? null : s.id)} />
              ))}
            </ol>
          </div>
        );
      })}
      {adding && <AddStep ctx={ctx} onClose={() => setAdding(false)} />}
    </Section>
  );
}

/** A draft from a won deal that waits for its template ("ask each time"): pick one, the plan is made from it. */
function ChooseTemplate({ ctx }: { ctx: Ctx }) {
  const { t, plan, fail } = ctx;
  const [list, setList] = useState<{ value: string; label: string }[] | null>(null);
  const [pick, setPick] = useState('');
  useEffect(() => {
    void get('/onboarding-templates')
      .then((r: { builtIn: { key: string; kind: string }[]; templates: Template[] }) => {
        const all = [
          ...r.templates.filter((x) => x.kind === 'client').map((x) => ({ value: x.id, label: x.name })),
          ...r.builtIn.filter((b) => b.kind === 'client').map((b) => ({ value: b.key, label: t(`ob.tpl.${b.key}.name`) })),
        ];
        setList(all);
        setPick(all[0]?.value ?? '');
      })
      .catch(fail);
  }, [t, fail]);
  if (!list) return null;
  return (
    <div className="ob-choose" role="group" aria-label={t('ob.choose.title')}>
      <p>
        <strong>{t('ob.choose.title')}</strong> {t('ob.choose.text')}
      </p>
      <select className="select" value={pick} aria-label={t('ob.settings.template')} onChange={(e) => setPick(e.target.value)}>
        {list.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <button
        className="btn btn--primary btn--small"
        disabled={!pick}
        onClick={() =>
          void post(`/onboarding-plans/${plan.id}/template`, { templateId: pick })
            .then((r: { plan: Plan }) => navigate(`/onboarding/plans/${r.plan.id}`))
            .catch(fail)
        }
      >
        <Icon name="arrowRight" size={16} />
        {t('ob.choose.go')}
      </button>
    </div>
  );
}

/**
 * The plan made its own, like a funnel: phases renamed, moved, added or removed, steps renamed,
 * moved or removed — this plan only, never its template. "Save as template" keeps the result.
 */
function PlanEditor({ ctx }: { ctx: Ctx }) {
  const { plan, t, act, fail } = ctx;
  const [phases, setPhases] = useState<PlanPhase[]>(plan.phases);
  const [newPhase, setNewPhase] = useState('');
  const [tplName, setTplName] = useState<string | null>(null);
  useEffect(() => setPhases(plan.phases), [plan.phases]);
  const savePhases = (next: { key?: string; name: string | null }[]) => act(() => put(`/onboarding-plans/${plan.id}/phases`, { phases: next }));
  const stepsOf = (key: string) => ordered(plan.steps.filter((s) => s.phase === key));
  const swap = <X,>(list: X[], i: number, j: number) => {
    const out = [...list];
    [out[i], out[j]] = [out[j], out[i]];
    return out;
  };
  const order = (phase: string, ids: string[]) => act(() => put(`/onboarding-plans/${plan.id}/steps/order`, { phase, ids }));
  return (
    <div className="ob-edit" data-tour="ob-editor">
      <p className="muted">{t('ob.edit.hint')}</p>
      {phases.map((ph, i) => {
        const list = stepsOf(ph.key);
        return (
          <div className="ob-edit__phase" key={ph.key}>
            <div className="ob-edit__row ob-edit__row--phase">
              <input
                className="input"
                value={ph.name ?? ''}
                placeholder={phaseLabel(ph.key, null, t)}
                maxLength={60}
                aria-label={t('ob.edit.phaseName')}
                onChange={(e) => setPhases(phases.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))}
                onBlur={() => (ph.name ?? '') !== (plan.phases.find((x) => x.key === ph.key)?.name ?? '') && void savePhases(phases)}
              />
              <button className="btn btn--small btn--quiet" disabled={i === 0} aria-label={t('ob.edit.up')} onClick={() => void savePhases(swap(phases, i, i - 1))}>
                <Icon name="chevronUp" size={14} />
              </button>
              <button className="btn btn--small btn--quiet" disabled={i === phases.length - 1} aria-label={t('ob.edit.down')} onClick={() => void savePhases(swap(phases, i, i + 1))}>
                <Icon name="chevronDown" size={14} />
              </button>
              <button
                className="btn btn--small btn--quiet"
                disabled={list.length > 0 || phases.length === 1}
                title={list.length ? t('ob.edit.phaseHasSteps') : undefined}
                aria-label={t('ob.edit.removePhase')}
                onClick={() => void savePhases(phases.filter((_, k) => k !== i))}
              >
                <Icon name="trash" size={14} />
              </button>
            </div>
            <ol className="ob-edit__steps">
              {list.map((s, k) => (
                <li className="ob-edit__row" key={s.id}>
                  <input
                    className="input"
                    defaultValue={stepTitle(t, s)}
                    maxLength={200}
                    aria-label={t('ob.steps.name')}
                    onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== stepTitle(t, s) && void act(() => patch(`/onboarding-steps/${s.id}`, { title: e.target.value.trim() }))}
                  />
                  <select className="select" value={s.phase} aria-label={t('ob.steps.phase')} onChange={(e) => void order(e.target.value, [...stepsOf(e.target.value).map((x) => x.id), s.id])}>
                    {phases.map((p) => (
                      <option key={p.key} value={p.key}>
                        {phaseLabel(p.key, phases, t)}
                      </option>
                    ))}
                  </select>
                  <button className="btn btn--small btn--quiet" disabled={k === 0} aria-label={t('ob.edit.up')} onClick={() => void order(ph.key, swap(list, k, k - 1).map((x) => x.id))}>
                    <Icon name="chevronUp" size={14} />
                  </button>
                  <button className="btn btn--small btn--quiet" disabled={k === list.length - 1} aria-label={t('ob.edit.down')} onClick={() => void order(ph.key, swap(list, k, k + 1).map((x) => x.id))}>
                    <Icon name="chevronDown" size={14} />
                  </button>
                  <button className="btn btn--small btn--quiet" aria-label={t('ob.edit.removeStep')} onClick={() => void act(() => del(`/onboarding-steps/${s.id}`))}>
                    <Icon name="trash" size={14} />
                  </button>
                </li>
              ))}
            </ol>
          </div>
        );
      })}
      {phases.length < MAX_PHASES && (
        <form
          className="ob-edit__row"
          onSubmit={(e) => {
            e.preventDefault();
            if (newPhase.trim()) void savePhases([...phases, { name: newPhase.trim() }]).then(() => setNewPhase(''));
          }}
        >
          <input className="input" value={newPhase} maxLength={60} placeholder={t('ob.edit.newPhase')} aria-label={t('ob.edit.newPhase')} onChange={(e) => setNewPhase(e.target.value)} />
          <button className="btn btn--small" type="submit" disabled={!newPhase.trim()}>
            <Icon name="plus" size={14} /> {t('ob.edit.addPhase')}
          </button>
        </form>
      )}
      <div className="ob-edit__foot">
        {tplName === null ? (
          <button className="btn btn--small btn--quiet" onClick={() => setTplName(plan.name)}>
            <Icon name="copy" size={14} /> {t('ob.edit.saveTpl')}
          </button>
        ) : (
          <form
            className="ob-edit__row"
            onSubmit={(e) => {
              e.preventDefault();
              void post('/onboarding-templates', { name: tplName.trim(), fromPlan: plan.id })
                .then(() => (setTplName(null), ctx.reload()))
                .catch(fail);
            }}
          >
            <input className="input" value={tplName} maxLength={120} aria-label={t('ob.tpl.name')} onChange={(e) => setTplName(e.target.value)} />
            <button className="btn btn--small btn--primary" type="submit" disabled={!tplName.trim()}>
              <Icon name="arrowRight" size={16} />
              {t('ob.edit.saveTplGo')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

const STATUS_ICON: Record<string, IconName> = { done: 'checkCircle', skipped: 'arrowRight', doing: 'clock', blocked: 'alert', todo: 'dot' };

function StepRow({ ctx, step: s, open, onToggle }: { ctx: Ctx; step: PlanStep; open: boolean; onToggle: () => void }) {
  const { plan, t, locale, act, canEdit } = ctx;
  const turn = turnOf(s, plan.steps, plan.startedOn, today());
  const closed = s.status === 'done' || s.status === 'skipped';
  const locked = !closed && turn.locked;
  const late = !closed && !!s.dueOn && s.dueOn < today();
  const waitTitles = turn.waitingOn.map((k) => plan.steps.find((x) => x.key === k)).filter(Boolean).map((x) => stepTitle(t, x!));
  const set = (body: Record<string, unknown>) => act(() => patch(`/onboarding-steps/${s.id}`, body));
  return (
    <li className="ob-step" id={`step-${s.id}`} data-status={s.status} data-locked={locked || undefined} data-late={late || undefined}>
      <button type="button" className="ob-step__row" aria-expanded={open} onClick={onToggle}>
        <span className="ob-step__icon" aria-hidden="true">
          <Icon name={locked ? 'lock' : STATUS_ICON[s.status]} size={18} />
        </span>
        <span className="ob-step__main">
          <span className="ob-step__title">
            {stepTitle(t, s)}
            {!s.required && <span className="ob-tag">{t('ob.optional')}</span>}
          </span>
          <span className="ob-step__meta">
            <span className="ob-side-chip" data-side={s.side}>
              {sideName(t, plan, s.side)}
            </span>
            {s.ownerName && <span>{s.ownerName}</span>}
            {s.dueOn && !closed && <span data-late={late || undefined}>{t('ob.due', { date: formatDayShort(s.dueOn, locale) })}</span>}
            {s.status === 'done' && s.doneHow === 'auto' && <span className="ob-auto">{t('ob.doneAuto')}</span>}
            {s.status === 'done' && s.doneHow === 'portal' && <span className="ob-auto">{t('ob.donePortal')}</span>}
            {s.status === 'skipped' && <span>{t('ob.status.skipped')}</span>}
          </span>
          {locked && (
            <span className="ob-lock">
              {t('ob.lock', { steps: waitTitles.join(', '), name: sideName(t, plan, turn.turn) })}
              {turn.days > 0 && ` · ${t('ob.waitingDays', { n: turn.days })}`}
            </span>
          )}
        </span>
        <Icon name="chevronDown" size={16} className="ob-step__chev" />
      </button>
      {open && (
        <div className="ob-step__body">
          {stepBody(t, s) && <p className="ob-step__desc">{stepBody(t, s)}</p>}
          {(s.effortDays != null || s.handsOnHours != null) && <p className="muted ob-step__effort">{t('ob.effort', { days: s.effortDays ?? 0, hours: s.handsOnHours ?? 0 })}</p>}
          {s.signal && <p className="ob-step__signal">{t('ob.signalNote', { what: t(`ob.signal.${s.signal}`) })}</p>}
          {s.form.length > 0 && !closed && plan.accountId && <StepForm ctx={ctx} step={s} />}
          {s.upload && <StepFiles ctx={ctx} step={s} />}
          {s.work && (
            <p className="ob-step__work">
              <Icon name="link" size={14} /> {t('ob.work', { title: s.work.title, status: s.work.status ?? '' })}
            </p>
          )}
          {s.delayReason && <p className="ob-step__delay">{t('ob.delay', { reason: s.delayReason })}</p>}
          <div className="ob-step__actions">
            {s.fix && !closed && <StepFix ctx={ctx} step={s} />}
            {!s.fix && s.signal && !closed && <StepFix ctx={ctx} step={s} />}
            <a className="btn btn--small btn--quiet" href={guideHref(locale, s.guide ?? (s.signal ? SIGNALS[s.signal].guide : 'onboarding-hub'))} {...docsLink}>
              <Icon name="book" size={14} /> {t('ob.guide')}
            </a>
            {canEdit && !closed && !s.signal && s.form.length === 0 && (
              <button className="btn btn--small btn--primary" disabled={locked || ctx.busy} title={locked ? t('ob.lockedHint') : undefined} onClick={() => void set({ status: 'done' })}>
                <Icon name="check" size={14} /> {t('ob.markDone')}
              </button>
            )}
            {canEdit && !closed && s.status !== 'doing' && !locked && (
              <button className="btn btn--small" disabled={ctx.busy} onClick={() => void set({ status: 'doing' })}>
                <Icon name="arrowRight" size={16} />
                {t('ob.start')}
              </button>
            )}
            {canEdit && !closed && !s.required && (
              <button className="btn btn--small btn--quiet" disabled={ctx.busy} onClick={() => void set({ status: 'skipped' })}>
                <Icon name="close" size={16} />
                {t('ob.skip')}
              </button>
            )}
            {canEdit && closed && s.doneHow !== 'auto' && (
              <button className="btn btn--small btn--quiet" disabled={ctx.busy} onClick={() => void set({ status: 'todo' })}>
                <Icon name="undo" size={16} />
                {t('ob.reopen')}
              </button>
            )}
            {canEdit && !closed && plan.accountId && !s.work && <ProductAsk ctx={ctx} step={s} />}
          </div>
          {canEdit && !closed && <StepOwner ctx={ctx} step={s} />}
        </div>
      )}
    </li>
  );
}

function StepFix({ ctx, step }: { ctx: Ctx; step: PlanStep }) {
  const { t, plan } = ctx;
  const raw = step.fix ?? (step.signal ? SIGNALS[step.signal].fix : null);
  if (!raw) return null;
  // The setup tests run where they live; "Test it" asks them to.
  if (step.signal === 'setup.test')
    return (
      <a className="btn btn--small" href={SETUP_LINKS.tests} onClick={(e) => (e.preventDefault(), navigate(SETUP_LINKS.tests))}>
        <Icon name="play" size={14} /> {t('ob.openTests')}
      </a>
    );
  const href = raw.includes('{account}') ? (plan.accountId ? raw.replace('{account}', plan.accountId) : null) : raw;
  if (!href) return null;
  return (
    <a className="btn btn--small" href={href} onClick={(e) => (href.startsWith('#') ? undefined : (e.preventDefault(), navigate(href)))}>
      <Icon name="arrowRight" size={14} /> {t('ob.doIt')}
    </a>
  );
}

function StepOwner({ ctx, step }: { ctx: Ctx; step: PlanStep }) {
  const { t, act, plan } = ctx;
  const { people } = useStore();
  const side = step.side === 'customer' && plan.kind === 'client' ? 'customer' : 'vendor';
  return (
    <div className="ob-step__owner">
      {side === 'vendor' ? (
        <label className="ob-inline">
          <span>{t('ob.owner')}</span>
          <select className="select" value={step.ownerId ?? ''} onChange={(e) => void act(() => patch(`/onboarding-steps/${step.id}`, { ownerId: e.target.value || null }))}>
            <option value="">{t('ob.owner.none')}</option>
            {people
              .filter((p) => p.status === 'active' || p.status === 'invited')
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </label>
      ) : (
        <label className="ob-inline">
          <span>{t('ob.person')}</span>
          <select className="select" value={step.personId ?? ''} onChange={(e) => void act(() => patch(`/onboarding-steps/${step.id}`, { personId: e.target.value || null }))}>
            <option value="">{t('ob.owner.none')}</option>
            {plan.people
              .filter((p) => p.side === 'customer')
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </label>
      )}
      <label className="ob-inline">
        <span>{t('ob.delayReason')}</span>
        <input
          className="input"
          defaultValue={step.delayReason}
          maxLength={500}
          onBlur={(e) => e.target.value !== step.delayReason && void act(() => patch(`/onboarding-steps/${step.id}`, { delayReason: e.target.value }))}
        />
      </label>
    </div>
  );
}

function StepForm({ ctx, step }: { ctx: Ctx; step: PlanStep }) {
  const { t, plan, act } = ctx;
  const fields = plan.formFields.filter((f) => step.form.includes(f.key));
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.key, String(plan.fieldValues[f.key] ?? '')])));
  if (!fields.length) return null;
  return (
    <form
      className="ob-form"
      onSubmit={(e) => {
        e.preventDefault();
        void act(() => post(`/onboarding-steps/${step.id}/answer`, { values }), t('ob.form.saved'));
      }}
    >
      <p className="muted">{t('ob.form.lead')}</p>
      {fields.map((f) => (
        <label key={f.key} className="field">
          <span className="field__label">{f.label}</span>
          <input className="input" type={f.type === 'date' ? 'date' : f.type === 'url' ? 'url' : f.type === 'email' ? 'email' : 'text'} value={values[f.key] ?? ''} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
        </label>
      ))}
      <button className="btn btn--primary btn--small" disabled={ctx.busy || !ctx.canEdit}>
        <Icon name="check" size={16} />
        {t('ob.form.save')}
      </button>
    </form>
  );
}

function StepFiles({ ctx, step }: { ctx: Ctx; step: PlanStep }) {
  const { t, act, locale } = ctx;
  return (
    <div className="ob-files">
      {step.files.length > 0 && (
        <ul>
          {step.files.map((f) => (
            <li key={f.id}>
              <Icon name="paperclip" size={14} />
              <a href={`/api/files/${f.id}`}>{f.name}</a>
              <span className="muted">{formatBytes(f.size, locale)}</span>
            </li>
          ))}
        </ul>
      )}
      {ctx.canEdit && (
        <label className="btn btn--small ob-files__add">
          <Icon name="upload" size={14} /> {t('ob.files.add')}
          <input
            type="file"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const body = new FormData();
              body.append('file', f);
              void act(() => post(`/onboarding-steps/${step.id}/files`, body), t('ob.files.added'));
              e.target.value = '';
            }}
          />
        </label>
      )}
    </div>
  );
}

/** "Needs product work": link the step to a story on Product's side (one more customer waiting for it). */
function ProductAsk({ ctx, step }: { ctx: Ctx; step: PlanStep }) {
  const { t, act } = ctx;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<{ id: string; title: string }[]>([]);
  useEffect(() => {
    if (!open) return;
    const w = setTimeout(() => void get<{ stories: { id: string; title: string }[] }>(`/stories/linkable?q=${encodeURIComponent(q)}`).then((r) => setFound(r.stories)).catch(() => setFound([])), 200);
    return () => clearTimeout(w);
  }, [q, open]);
  return (
    <>
      <button className="btn btn--small btn--quiet" onClick={() => setOpen(true)}>
        <Icon name="link" size={14} /> {t('ob.product.ask')}
      </button>
      {open && (
        <Dialog title={t('ob.product.title')} onClose={() => setOpen(false)}>
          <p className="muted">{t('ob.product.body')}</p>
          <input className="input" type="search" autoFocus value={q} placeholder={t('ob.product.search')} aria-label={t('ob.product.search')} onChange={(e) => setQ(e.target.value)} />
          <ul className="ob-pick">
            {found.map((s) => (
              <li key={s.id}>
                <button
                  className="ob-pick__btn"
                  onClick={() => {
                    setOpen(false);
                    void act(() => post(`/onboarding-steps/${step.id}/request`, { storyId: s.id }), t('ob.product.linked'));
                  }}
                >
                  {s.title}
                </button>
              </li>
            ))}
            {!found.length && <li className="muted">{t('ob.product.none')}</li>}
          </ul>
        </Dialog>
      )}
    </>
  );
}

function AddStep({ ctx, onClose }: { ctx: Ctx; onClose: () => void }) {
  const { t, act, plan } = ctx;
  const [title, setTitle] = useState('');
  const [phase, setPhase] = useState<Phase>(() => plan.phases.find((p) => p.key === 'setup')?.key ?? plan.phases[0]?.key ?? 'setup');
  const [side, setSide] = useState<StepSide>('vendor');
  const [dueOn, setDue] = useState('');
  return (
    <Dialog
      title={t('ob.steps.add')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            <Icon name="close" size={16} />
            {t('common.cancel')}
          </button>
          <button className="btn btn--primary" disabled={!title.trim()} onClick={() => void act(() => post(`/onboarding-plans/${plan.id}/steps`, { title, phase, side, dueOn: dueOn || null })).then(onClose)}>
            <Icon name="plus" size={16} />
            {t('common.add')}
          </button>
        </>
      }
    >
      <label className="field">
        <span className="field__label">{t('ob.steps.name')}</span>
        <input className="input" autoFocus value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <div className="ob-row2">
        <label className="field">
          <span className="field__label">{t('ob.steps.phase')}</span>
          <select className="select" value={phase} onChange={(e) => setPhase(e.target.value as Phase)}>
            {ctx.plan.phases.map(({ key: p }) => (
              <option key={p} value={p}>
                {phaseLabel(p, ctx.plan.phases, t)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">{t('ob.steps.side')}</span>
          <select className="select" value={side} onChange={(e) => setSide(e.target.value as StepSide)}>
            {(['vendor', 'customer', 'both'] as const).map((x) => (
              <option key={x} value={x}>
                {sideName(t, plan, x)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        <span className="field__label">{t('ob.steps.due')}</span>
        <input className="input" type="date" value={dueOn} onChange={(e) => setDue(e.target.value)} />
      </label>
    </Dialog>
  );
}

// ------------------------------------------------------------------ timeline

function Timeline({ ctx, compact }: { ctx: Ctx; compact: boolean }) {
  const { plan, t, locale } = ctx;
  const [detailed, setDetailed] = useState(false);
  const ms = milestones(plan.steps);
  const dates = plan.steps.flatMap((s) => [s.startOn, s.dueOn]).filter((d): d is string => !!d).sort();
  const from = dates[0] ?? plan.startedOn;
  const to = [dates[dates.length - 1], plan.targetOn].filter((d): d is string => !!d).sort().pop() ?? from;
  const span = Math.max(1, (Date.parse(to) - Date.parse(from)) / 86400000);
  const pos = (d: string | null) => (d ? ((Date.parse(d) - Date.parse(from)) / 86400000 / span) * 100 : 0);
  const now = pos(today());
  return (
    <Section
      id="timeline"
      title={t('ob.timeline.title')}
      tour="ob-timeline"
      tools={
        !compact ? (
          <button className="btn btn--small btn--quiet" aria-pressed={detailed} onClick={() => setDetailed(!detailed)}>
            <Icon name="list" size={16} />
            {detailed ? t('ob.timeline.compact') : t('ob.timeline.detailed')}
          </button>
        ) : undefined
      }
    >
      <div className="ob-tl" role="list">
        {ms.map((m) => (
          <div className="ob-tl__row" role="listitem" key={m.phase}>
            <span className="ob-tl__name">{phaseLabel(m.phase, plan.phases, t)}</span>
            <span className="ob-tl__track">
              <span className="ob-tl__bar" style={{ insetInlineStart: `${pos(m.start)}%`, width: `${Math.max(2, pos(m.end) - pos(m.start))}%` }} data-done={m.pct === 100 || undefined}>
                <span className="ob-tl__fill" style={{ width: `${m.pct}%` }} />
              </span>
              {now > 0 && now < 100 && <span className="ob-tl__now" style={{ insetInlineStart: `${now}%` }} aria-hidden="true" />}
            </span>
            <span className="ob-tl__pct">{formatPercent(m.pct, locale)}</span>
          </div>
        ))}
        <div className="ob-tl__axis" aria-hidden="true">
          <span>{formatDayShort(from, locale)}</span>
          <span>{formatDayShort(to, locale)}</span>
        </div>
      </div>
      {detailed && !compact && (
        <div className="ob-table-wrap">
          <table className="ob-table">
            <thead>
              <tr>
                <th>{t('ob.col.step')}</th>
                <th>{t('ob.col.side')}</th>
                <th>{t('ob.col.after')}</th>
                <th>{t('ob.col.start')}</th>
                <th>{t('ob.col.due')}</th>
                <th>{t('ob.col.done')}</th>
                <th>{t('ob.col.delay')}</th>
              </tr>
            </thead>
            <tbody>
              {ordered(plan.steps).map((s) => (
                <tr key={s.id} data-late={(s.status !== 'done' && s.dueOn && s.dueOn < today()) || undefined}>
                  <td>{stepTitle(t, s)}</td>
                  <td>{sideName(t, plan, s.side)}</td>
                  <td>{s.dependsOn.map((k) => plan.steps.find((x) => x.key === k)).filter(Boolean).map((x) => stepTitle(t, x!)).join(', ') || '—'}</td>
                  <td>{s.startOn ? formatDayShort(s.startOn, locale) : '—'}</td>
                  <td>{s.dueOn ? formatDayShort(s.dueOn, locale) : '—'}</td>
                  <td>{s.doneAt ? formatDayShort(s.doneAt.slice(0, 10), locale) : '—'}</td>
                  <td>{s.delayReason || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

// ------------------------------------------------------------------ issues

function Issues({ ctx }: { ctx: Ctx }) {
  const { plan, t, locale, act, canEdit } = ctx;
  const [adding, setAdding] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const list = plan.issues.filter((i) => showResolved || i.status !== 'resolved');
  const p = plan.progress.issues;
  const stuck = (i: PlanIssue) => i.status !== 'resolved' && (i.dueOn ? i.dueOn < today() : (Date.parse(today()) - Date.parse(i.openedOn)) / 86400000 >= 5);
  return (
    <Section
      id="issues"
      title={t('ob.issues.title')}
      tour="ob-issues"
      count={p.open || undefined}
      tools={
        canEdit ? (
          <button className="btn btn--small btn--quiet" onClick={() => setAdding(true)}>
            <Icon name="plus" size={15} /> {t('ob.issues.add')}
          </button>
        ) : undefined
      }
    >
      <div className="ob-counters">
        <span>{t('ob.issues.pending', { name: sideName(t, plan, 'vendor'), n: p.vendor })}</span>
        <span>{t('ob.issues.pending', { name: sideName(t, plan, 'customer'), n: p.customer })}</span>
        <span data-tone={p.stuck ? 'late' : undefined}>{t('ob.issues.stuckN', { n: p.stuck })}</span>
      </div>
      {list.length === 0 ? (
        <p className="muted ob-none">{t('ob.issues.none')}</p>
      ) : (
        <ul className="ob-issues">
          {list.map((i) => (
            <li key={i.id} className="ob-issue" data-status={i.status} data-stuck={stuck(i) || undefined} data-source={i.source}>
              <div className="ob-issue__main">
                <span className="ob-issue__title">
                  {i.source === 'setup_test' && <Icon name="zap" size={14} label={t('ob.issues.fromTest')} />}
                  {i.title}
                </span>
                <span className="ob-issue__meta">
                  <span className="ob-urg" data-urgency={i.urgency}>
                    {t(`ob.urgency.${i.urgency}`)}
                  </span>
                  <span>{t(`ob.issueType.${i.type}`)}</span>
                  <span>{t('ob.issues.waitsFor', { name: sideName(t, plan, i.side) })}</span>
                  <span>{t('ob.issues.opened', { date: formatDayShort(i.openedOn, locale) })}</span>
                  {stuck(i) && <span className="ob-stuck">{t('ob.issues.stuck')}</span>}
                  {i.fromPortal && <span>{t('ob.issues.fromPortal')}</span>}
                  {i.recordId && (
                    <a href={`?record=${i.recordId}`} onClick={(e) => (e.preventDefault(), navigate(`${location.pathname}?record=${i.recordId}`))}>
                      {t('ob.issues.ticket', { status: i.ticketStatus ?? '' })}
                    </a>
                  )}
                </span>
                {i.body && <p className="ob-issue__body">{i.body}</p>}
              </div>
              <div className="ob-issue__actions">
                {i.source === 'setup_test' && i.sourceRef && i.status !== 'resolved' && (
                  <button
                    className="btn btn--small"
                    onClick={() =>
                      void runSetupTest(i.sourceRef!)
                        .then((ran) => ran && ctx.reload())
                        .catch(ctx.fail)
                    }
                  >
                    <Icon name="refresh" size={14} /> {t('ob.issues.retest')}
                  </button>
                )}
                {canEdit && i.source !== 'setup_test' && i.status !== 'resolved' && (
                  <button className="btn btn--small" onClick={() => void act(() => patch(`/onboarding-issues/${i.id}`, { status: 'resolved' }), t('ob.issues.resolved'))}>
                    <Icon name="check" size={16} />
                    {t('ob.issues.resolve')}
                  </button>
                )}
                {canEdit && i.status !== 'resolved' && !i.recordId && plan.accountId && <TicketLink ctx={ctx} issue={i} />}
                {canEdit && i.status !== 'resolved' && i.source !== 'setup_test' && (
                  <button
                    className="btn btn--small btn--quiet"
                    onClick={() => void act(() => patch(`/onboarding-issues/${i.id}`, { side: i.side === 'vendor' ? 'customer' : 'vendor' }))}
                    title={t('ob.issues.passHint')}
                  >
                    <Icon name="arrowRight" size={16} />
                    {t('ob.issues.pass', { name: sideName(t, plan, i.side === 'vendor' ? 'customer' : 'vendor') })}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {plan.issues.some((i) => i.status === 'resolved') && (
        <button className="btn btn--small btn--quiet ob-more" onClick={() => setShowResolved(!showResolved)}>
          <Icon name="eye" size={16} />
          {showResolved ? t('ob.issues.hideResolved') : t('ob.issues.showResolved')}
        </button>
      )}
      {adding && <AddIssue ctx={ctx} onClose={() => setAdding(false)} />}
    </Section>
  );
}

function TicketLink({ ctx, issue }: { ctx: Ctx; issue: PlanIssue }) {
  const { t, act, plan } = ctx;
  const [open, setOpen] = useState(false);
  const [tickets, setTickets] = useState<{ id: string; name: string }[] | null>(null);
  useEffect(() => {
    if (!open) return;
    void get<{ records: { id: string; name: string }[] }>(`/records?type=ticket&account=${plan.accountId}&limit=20`)
      .then((r) => setTickets(r.records ?? []))
      .catch(() => setTickets([]));
  }, [open, plan.accountId]);
  return (
    <>
      <button className="btn btn--small btn--quiet" onClick={() => setOpen(true)}>
        <Icon name="lifebuoy" size={14} /> {t('ob.issues.linkTicket')}
      </button>
      {open && (
        <Dialog title={t('ob.issues.linkTicket')} onClose={() => setOpen(false)}>
          <p className="muted">{t('ob.issues.linkTicketBody')}</p>
          <ul className="ob-pick">
            {(tickets ?? []).map((r) => (
              <li key={r.id}>
                <button
                  className="ob-pick__btn"
                  onClick={() => {
                    setOpen(false);
                    void act(() => post(`/onboarding-issues/${issue.id}/ticket`, { recordId: r.id }));
                  }}
                >
                  {r.name}
                </button>
              </li>
            ))}
            {tickets && !tickets.length && <li className="muted">{t('ob.issues.noTickets')}</li>}
          </ul>
        </Dialog>
      )}
    </>
  );
}

function AddIssue({ ctx, onClose }: { ctx: Ctx; onClose: () => void }) {
  const { t, act, plan } = ctx;
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [side, setSide] = useState<Side>(plan.kind === 'self' ? 'vendor' : 'customer');
  const [type, setType] = useState<(typeof ISSUE_TYPES)[number]>('question');
  const [urgency, setUrgency] = useState<(typeof URGENCIES)[number]>('normal');
  const [dueOn, setDue] = useState('');
  return (
    <Dialog
      title={t('ob.issues.add')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            <Icon name="close" size={16} />
            {t('common.cancel')}
          </button>
          <button className="btn btn--primary" disabled={!title.trim()} onClick={() => void act(() => post(`/onboarding-plans/${plan.id}/issues`, { title, body, side, type, urgency, dueOn: dueOn || null })).then(onClose)}>
            <Icon name="plus" size={16} />
            {t('common.add')}
          </button>
        </>
      }
    >
      <label className="field">
        <span className="field__label">{t('ob.issues.topic')}</span>
        <input className="input" autoFocus value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="field">
        <span className="field__label">{t('ob.issues.details')}</span>
        <textarea className="input" rows={3} value={body} maxLength={4000} onChange={(e) => setBody(e.target.value)} />
      </label>
      <div className="ob-row2">
        <label className="field">
          <span className="field__label">{t('ob.issues.whoNext')}</span>
          <select className="select" value={side} onChange={(e) => setSide(e.target.value as Side)}>
            {(['vendor', 'customer'] as const).map((x) => (
              <option key={x} value={x}>
                {sideName(t, plan, x)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">{t('ob.issues.type')}</span>
          <select className="select" value={type} onChange={(e) => setType(e.target.value as any)}>
            {ISSUE_TYPES.map((x) => (
              <option key={x} value={x}>
                {t(`ob.issueType.${x}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="ob-row2">
        <label className="field">
          <span className="field__label">{t('ob.issues.urgency')}</span>
          <select className="select" value={urgency} onChange={(e) => setUrgency(e.target.value as any)}>
            {URGENCIES.map((x) => (
              <option key={x} value={x}>
                {t(`ob.urgency.${x}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">{t('ob.steps.due')}</span>
          <input className="input" type="date" value={dueOn} onChange={(e) => setDue(e.target.value)} />
        </label>
      </div>
    </Dialog>
  );
}

// ------------------------------------------------------------------ data mapping

function Mapping({ ctx }: { ctx: Ctx }) {
  const { plan, t, act, canEdit } = ctx;
  const [adding, setAdding] = useState(false);
  const rows = plan.fields;
  const failing = rows.filter((f) => fieldState(f) === 'failing').length;
  return (
    <Section
      id="mapping"
      title={t('ob.map.title')}
      tour="ob-mapping"
      count={failing ? t('ob.map.failingN', { n: failing }) : undefined}
      tools={
        canEdit ? (
          <button className="btn btn--small btn--quiet" onClick={() => setAdding(true)}>
            <Icon name="plus" size={15} /> {t('ob.map.add')}
          </button>
        ) : undefined
      }
    >
      <p className="muted ob-lead">{t('ob.map.lead')}</p>
      {rows.length === 0 ? (
        <p className="muted ob-none">{t('ob.map.none')}</p>
      ) : (
        <div className="ob-table-wrap">
          <table className="ob-table ob-map">
            <thead>
              <tr>
                <th>{t('ob.map.field')}</th>
                <th>{t('ob.map.expected')}</th>
                <th>{t('ob.map.received')}</th>
                <th>{t('ob.map.rules')}</th>
                <th>{t('ob.map.checked', { name: sideName(t, plan, 'customer') })}</th>
                <th>{t('ob.map.verified', { name: sideName(t, plan, 'vendor') })}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => {
                const state = fieldState(f);
                const fails = checkField(f);
                return (
                  <tr key={f.id} data-state={state}>
                    <td>
                      <strong>{fieldName(t, f)}</strong>
                      <small className="ob-map__src">
                        {t(`ob.map.source.${f.source}`)}
                        {f.required ? ` · ${t('ob.map.required')}` : ''}
                      </small>
                    </td>
                    <td>
                      <span className="ob-type">{t(`ob.type.${f.type}`)}</span>
                      {f.example && <small className="ob-map__ex">{f.example}</small>}
                    </td>
                    <td>
                      {canEdit && f.source === 'custom' ? (
                        <input
                          className="input ob-map__input"
                          defaultValue={f.received ?? ''}
                          aria-label={t('ob.map.received')}
                          placeholder={t('ob.map.receivedHint')}
                          onBlur={(e) => e.target.value !== (f.received ?? '') && void act(() => patch(`/onboarding-fields/${f.id}`, { received: e.target.value }))}
                        />
                      ) : (
                        <span className="ob-map__val">{f.received ?? '—'}</span>
                      )}
                    </td>
                    <td>
                      {state === 'waiting' && <span className="muted">{t('ob.map.state.waiting')}</span>}
                      {state === 'ok' && <span className="ob-ok">{t('ob.map.state.ok')}</span>}
                      {state === 'fixed' && <span className="ob-ok">{t('ob.map.state.fixed')}</span>}
                      {state === 'failing' &&
                        (fails.length ? fails : [{ rule: 'type', expected: f.type, received: f.received ?? '' } as const]).map((x) => (
                          <span key={x.rule} className="ob-rule" title={t('ob.map.ruleHint', { expected: x.expected === 'value' ? t('ob.map.aValue') : t(`ob.type.${x.expected}`), received: x.received || '∅' })}>
                            {t(`ob.rule.${f.autoOk === false && !fails.length ? 'read' : x.rule}`)}
                          </span>
                        ))}
                    </td>
                    <td>
                      <Tick on={!!f.checkedAt} label={t('ob.map.checkedBy', { name: f.checkedBy ?? '' })} disabled={!canEdit} onChange={(v) => void act(() => patch(`/onboarding-fields/${f.id}`, { checked: v }))} />
                    </td>
                    <td>
                      <Tick on={!!f.verifiedAt} label={t('ob.map.verifiedBy', { name: f.verifiedBy ?? '' })} disabled={!canEdit} onChange={(v) => void act(() => patch(`/onboarding-fields/${f.id}`, { verified: v }))} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {adding && <AddField ctx={ctx} onClose={() => setAdding(false)} />}
    </Section>
  );
}

function Tick({ on, label, disabled, onChange }: { on: boolean; label: string; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" className="ob-tick" aria-pressed={on} aria-label={label} title={on ? label : undefined} disabled={disabled} onClick={() => onChange(!on)}>
      {on && <Icon name="check" size={14} />}
    </button>
  );
}

function AddField({ ctx, onClose }: { ctx: Ctx; onClose: () => void }) {
  const { t, act, plan } = ctx;
  const [name, setName] = useState('');
  const [type, setType] = useState<PlanField['type']>('text');
  const [required, setRequired] = useState(false);
  const [example, setExample] = useState('');
  return (
    <Dialog
      title={t('ob.map.add')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            <Icon name="close" size={16} />
            {t('common.cancel')}
          </button>
          <button className="btn btn--primary" disabled={!name.trim()} onClick={() => void act(() => post(`/onboarding-plans/${plan.id}/fields`, { name, type, required, example })).then(onClose)}>
            <Icon name="plus" size={16} />
            {t('common.add')}
          </button>
        </>
      }
    >
      <label className="field">
        <span className="field__label">{t('ob.map.field')}</span>
        <input className="input" autoFocus value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="ob-row2">
        <label className="field">
          <span className="field__label">{t('ob.map.type')}</span>
          <select className="select" value={type} onChange={(e) => setType(e.target.value as any)}>
            {(['text', 'number', 'money', 'date', 'email', 'url', 'choice', 'person', 'other'] as const).map((x) => (
              <option key={x} value={x}>
                {t(`ob.type.${x}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">{t('ob.map.example')}</span>
          <input className="input" value={example} maxLength={300} onChange={(e) => setExample(e.target.value)} />
        </label>
      </div>
      <label className="check">
        <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} /> {t('ob.map.required')}
      </label>
    </Dialog>
  );
}

// ------------------------------------------------------------------ sites, metrics, goals, people, note

function Sites({ ctx }: { ctx: Ctx }) {
  const { plan, t, act, canEdit } = ctx;
  const phases = PHASES.filter((ph) => plan.steps.some((s) => s.phase === ph));
  const [name, setName] = useState('');
  const cycle = (v: string | undefined) => SITE_STATUSES[(SITE_STATUSES.indexOf((v ?? 'todo') as any) + 1) % SITE_STATUSES.length];
  return (
    <Section id="sites" title={t('ob.sites.title')} count={plan.sites.length}>
      <div className="ob-table-wrap">
        <table className="ob-table ob-sites">
          <thead>
            <tr>
              <th>{t('ob.sites.site')}</th>
              {phases.map((ph) => (
                <th key={ph}>{t(`ob.phase.${ph}`)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {plan.sites.map((s) => (
              <tr key={s.id}>
                <td>
                  <strong>{s.name}</strong>
                  {s.region && <small className="ob-map__src">{s.region}</small>}
                </td>
                {phases.map((ph) => {
                  const v = s.stages[ph] ?? 'todo';
                  return (
                    <td key={ph}>
                      <button type="button" className="ob-stage" data-stage={v} disabled={!canEdit} onClick={() => void act(() => patch(`/onboarding-sites/${s.id}`, { stages: { [ph]: cycle(v) } }))} aria-label={`${s.name} · ${t(`ob.phase.${ph}`)}: ${t(`ob.siteStatus.${v}`)}`}>
                        {t(`ob.siteStatus.${v}`)}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canEdit && (
        <form
          className="ob-addrow"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) void act(() => post(`/onboarding-plans/${plan.id}/sites`, { name })).then(() => setName(''));
          }}
        >
          <input className="input" value={name} maxLength={120} placeholder={t('ob.sites.add')} aria-label={t('ob.sites.add')} onChange={(e) => setName(e.target.value)} />
          <button className="btn btn--small"><Icon name="plus" size={16} /> {t('common.add')}</button>
        </form>
      )}
    </Section>
  );
}

function Metrics({ ctx }: { ctx: Ctx }) {
  const { plan, t, act, canEdit, locale } = ctx;
  const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));
  return (
    <Section id="metrics" title={t('ob.metrics.title')}>
      <p className="muted ob-lead">{t('ob.metrics.lead')}</p>
      <div className="ob-metrics">
        {plan.metrics.map((m) => {
          const gain = metricGain(m);
          return (
            <div className="ob-metric" key={m.id}>
              <span className="ob-metric__name">
                {metricTitle(t, m)} <small className="muted">{m.unit}</small>
              </span>
              <div className="ob-metric__vals">
                {(['baseline', 'current', 'target'] as const).map((k) => (
                  <label key={k}>
                    <small>{t(`ob.metrics.${k}`)}</small>
                    {canEdit ? (
                      <input className="input" inputMode="decimal" defaultValue={m[k] ?? ''} onBlur={(e) => num(e.target.value) !== m[k] && void act(() => patch(`/onboarding-metrics/${m.id}`, { [k]: num(e.target.value) }))} />
                    ) : (
                      <strong>{m[k] ?? '—'}</strong>
                    )}
                  </label>
                ))}
              </div>
              {gain != null && (
                <span className="ob-gain" data-tone={gain >= 0 ? 'good' : 'bad'}>
                  {t(gain >= 0 ? 'ob.metrics.better' : 'ob.metrics.worse', { pct: formatPercent(Math.abs(gain), locale) })}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function Goals({ ctx }: { ctx: Ctx }) {
  const { plan, t, act, canEdit, locale } = ctx;
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<(typeof GOAL_PRIORITIES)[number]>('must');
  return (
    <section className="sheet ob-goals" id="goals" aria-labelledby="ob-goals-h" data-tour="ob-goals">
      <div className="section__head">
        <h2 id="ob-goals-h">{t('ob.goals.title')}</h2>
      </div>
      <ul className="ob-goallist">
        {plan.goals.map((g) => (
          <li key={g.id} data-status={g.status}>
            <button type="button" className="ob-tick" aria-pressed={g.status === 'done'} aria-label={goalTitle(t, g)} disabled={!canEdit} onClick={() => void act(() => patch(`/onboarding-goals/${g.id}`, { status: g.status === 'done' ? 'doing' : 'done' }))}>
              {g.status === 'done' && <Icon name="check" size={14} />}
            </button>
            <span className="ob-goal__text">
              <span>{goalTitle(t, g)}</span>
              <small className="muted">
                {t(`ob.priority.${g.priority}`)}
                {g.targetOn ? ` · ${t('ob.target', { date: formatDayShort(g.targetOn, locale) })}` : ''}
                {g.doneOn ? ` · ${t('ob.goals.doneOn', { date: formatDayShort(g.doneOn, locale) })}` : ''}
              </small>
            </span>
          </li>
        ))}
      </ul>
      {canEdit && (
        <form
          className="ob-addrow"
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim()) void act(() => post(`/onboarding-plans/${plan.id}/goals`, { title, priority })).then(() => setTitle(''));
          }}
        >
          <input className="input" value={title} maxLength={200} placeholder={t('ob.goals.add')} aria-label={t('ob.goals.add')} onChange={(e) => setTitle(e.target.value)} />
          <select className="select" value={priority} aria-label={t('ob.goals.priority')} onChange={(e) => setPriority(e.target.value as any)}>
            {GOAL_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {t(`ob.priority.${p}`)}
              </option>
            ))}
          </select>
          <button className="btn btn--small"><Icon name="plus" size={16} /> {t('common.add')}</button>
        </form>
      )}
    </section>
  );
}

function People({ ctx }: { ctx: Ctx }) {
  const { plan, t, act, canEdit } = ctx;
  const [adding, setAdding] = useState<Side | null>(null);
  const [name, setName] = useState('');
  const [role, setRole] = useState<(typeof ROLES)[number]>('lead');
  const [duty, setDuty] = useState('');
  const [contact, setContact] = useState('');
  return (
    <section className="sheet ob-people" id="people" aria-labelledby="ob-people-h" data-tour="ob-people">
      <div className="section__head">
        <h2 id="ob-people-h">{t('ob.people.title')}</h2>
      </div>
      <div className="ob-people__cols">
        {(['vendor', 'customer'] as const).map((side) => (
          <div key={side} className="ob-people__col" data-side={side}>
            <h3>{sideName(t, plan, side)}</h3>
            <ul>
              {plan.people
                .filter((p) => p.side === side)
                .map((p) => (
                  <li key={p.id}>
                    <span className="ob-person__name">{p.name}</span>
                    <span className="ob-role">{t(`ob.role.${p.role}`)}</span>
                    {p.duty && <small className="muted">{p.duty}</small>}
                    {p.contact && <small className="ob-person__contact">{p.contact}</small>}
                    {canEdit && (
                      <button className="ob-x" aria-label={t('ob.people.remove', { name: p.name })} onClick={() => void act(() => del(`/onboarding-people/${p.id}`))}>
                        <Icon name="close" size={12} />
                      </button>
                    )}
                  </li>
                ))}
            </ul>
            {canEdit && (
              <button className="btn btn--small btn--quiet" onClick={() => setAdding(side)}>
                <Icon name="userPlus" size={14} /> {t('ob.people.add')}
              </button>
            )}
          </div>
        ))}
      </div>
      {adding && (
        <Dialog
          title={t('ob.people.addTo', { name: sideName(t, plan, adding) })}
          onClose={() => setAdding(null)}
          footer={
            <>
              <button className="btn" onClick={() => setAdding(null)}>
                <Icon name="close" size={16} />
                {t('common.cancel')}
              </button>
              <button
                className="btn btn--primary"
                disabled={!name.trim()}
                onClick={() =>
                  void act(() => post(`/onboarding-plans/${plan.id}/people`, { side: adding, name, role, duty, contact })).then(() => {
                    setAdding(null);
                    setName('');
                    setDuty('');
                    setContact('');
                  })
                }
              >
                <Icon name="plus" size={16} />
                {t('common.add')}
              </button>
            </>
          }
        >
          <label className="field">
            <span className="field__label">{t('ob.people.name')}</span>
            <input className="input" autoFocus value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="ob-row2">
            <label className="field">
              <span className="field__label">{t('ob.people.role')}</span>
              <select className="select" value={role} onChange={(e) => setRole(e.target.value as any)}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t(`ob.role.${r}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">{t('ob.people.contact')}</span>
              <input className="input" value={contact} maxLength={200} onChange={(e) => setContact(e.target.value)} />
            </label>
          </div>
          <label className="field">
            <span className="field__label">{t('ob.people.duty')}</span>
            <input className="input" value={duty} maxLength={300} onChange={(e) => setDuty(e.target.value)} />
          </label>
        </Dialog>
      )}
    </section>
  );
}

function Note({ ctx }: { ctx: Ctx }) {
  const { plan, t, act, canEdit } = ctx;
  if (!plan.note && !canEdit) return null;
  return (
    <section className="sheet ob-note" aria-labelledby="ob-note-h">
      <div className="section__head">
        <h2 id="ob-note-h">{t('ob.note.title')}</h2>
      </div>
      {canEdit ? (
        <textarea className="input ob-note__text" rows={8} defaultValue={plan.note} aria-label={t('ob.note.title')} onBlur={(e) => e.target.value !== plan.note && void act(() => patch(`/onboarding-plans/${plan.id}`, { note: e.target.value }), t('common.saved'))} />
      ) : (
        <p className="ob-note__text">{plan.note}</p>
      )}
      <p className="muted ob-note__hint">{t('ob.note.hint')}</p>
    </section>
  );
}

function Finish({ ctx }: { ctx: Ctx }) {
  const { plan, t, act } = ctx;
  const [ask, setAsk] = useState(false);
  if (plan.status === 'done')
    return (
      <section className="sheet ob-finish" data-done="true">
        <p>{t('ob.finish.done', { score: plan.baseline.health ?? '—' })}</p>
      </section>
    );
  return (
    <section className="sheet ob-finish">
      <div className="ob-finish__row">
        {plan.portalUrl && (
          <a className="btn btn--small btn--quiet" href={plan.portalUrl} target="_blank" rel="noopener">
            <Icon name="globe" size={14} /> {t('ob.portal.open')}
          </a>
        )}
        <button className="btn btn--small btn--quiet" onClick={() => void act(() => patch(`/onboarding-plans/${plan.id}`, { portalVisible: !plan.portalVisible }))}>
          <Icon name="eye" size={16} />
          {plan.portalVisible ? t('ob.portal.hide') : t('ob.portal.show')}
        </button>
      </div>
      <button className="btn" onClick={() => setAsk(true)} data-tour="ob-finish">
        <Icon name="handshake" size={15} /> {t('ob.finish.button')}
      </button>
      {ask && (
        <Dialog
          title={t('ob.finish.title')}
          onClose={() => setAsk(false)}
          footer={
            <>
              <button className="btn" onClick={() => setAsk(false)}>
                <Icon name="close" size={16} />
                {t('common.cancel')}
              </button>
              <button className="btn btn--primary" onClick={() => void act(() => post(`/onboarding-plans/${plan.id}/finish`), t('ob.finish.sent')).then(() => setAsk(false))}>
                <Icon name="check" size={16} />
                {t('ob.finish.confirm')}
              </button>
            </>
          }
        >
          <p>{t(plan.department === 'onboarding' ? 'ob.finish.bodyCs' : 'ob.finish.body')}</p>
          {plan.progress.pct < 100 && <p className="ob-warn">{t('ob.finish.notAll', { pct: plan.progress.pct })}</p>}
        </Dialog>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ the portfolio and templates

/** Opens a plan for one customer from a template: the way in when plans do not open by themselves on a won deal. */
function NewPlanDialog({ onClose, accountId }: { onClose: () => void; accountId: string | null }) {
  const { tt: t } = useT();
  const { toast } = useStore();
  const [account, setAccount] = useState<{ id: string | null; name: string | null }>({ id: accountId, name: null });
  const [templates, setTemplates] = useState<{ value: string; label: string }[]>([]);
  const [template, setTemplate] = useState('');
  const [busy, setBusy] = useState(false);
  // Came from a customer's page: show that customer's name in the picker.
  useEffect(() => {
    if (!accountId) return;
    void get<{ account: { id: string; name: string } }>(`/accounts/${accountId}`)
      .then((r) => setAccount((a) => (a.id === accountId ? { id: accountId, name: r.account.name } : a)))
      .catch(() => undefined);
  }, [accountId]);
  useEffect(() => {
    void get<{ builtIn: { key: string; kind: string }[]; templates: Template[] }>('/onboarding-templates')
      .then((d) => {
        // The company's own first (the one it made its own), then the ready-made ones.
        const list = [
          ...d.templates.filter((x) => x.kind === 'client').map((x) => ({ value: x.id, label: x.name })),
          ...d.builtIn.filter((b) => b.kind === 'client').map((b) => ({ value: b.key, label: t(`ob.tpl.${b.key}.name`) })),
        ];
        setTemplates(list);
        setTemplate((v) => v || list[0]?.value || '');
      })
      .catch(() => setTemplates([]));
  }, [t]);
  const start = async () => {
    if (!account.id) return;
    setBusy(true);
    try {
      const r = await post<{ plan: { id: string } }>('/onboarding-plans', { accountId: account.id, templateId: template || null });
      onClose();
      navigate(`/onboarding/plans/${r.plan.id}`);
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      title={t('ob.new.title')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            <Icon name="close" size={16} />
            {t('common.cancel')}
          </button>
          <button className="btn btn--primary" disabled={!account.id || busy} onClick={() => void start()}>
            <Icon name="arrowRight" size={16} />
            {t('ob.new.start')}
          </button>
        </>
      }
    >
      <p className="field__hint">{t('ob.new.hint')}</p>
      <div className="field">
        <span className="field__label">{t('ob.new.customer')}</span>
        <AccountPicker value={account.id} name={account.name} onChange={(id, name) => setAccount({ id, name: name ?? null })} />
      </div>
      <label className="field">
        <span className="field__label">{t('ob.new.template')}</span>
        <select className="select" value={template} onChange={(e) => setTemplate(e.target.value)}>
          {templates.map((x) => (
            <option key={x.value} value={x.value}>
              {x.label}
            </option>
          ))}
        </select>
      </label>
    </Dialog>
  );
}

export function OnboardingPortfolioPage({ tab }: { tab: 'plans' | 'templates' }) {
  const { tt: t, locale } = useT();
  const { toast, canWrite } = useStore();
  // ?new=<customer id> (or ?new=1) opens "New plan", e.g. from a customer's page.
  const [making, setMaking] = useState<string | null>(() => new URLSearchParams(location.search).get('new'));
  const [plans, setPlans] = useState<PlanSummary[] | null>(null);
  const [filter, setFilter] = useState<'open' | 'stalled' | 'all'>('open');
  useEffect(() => void get<{ plans: PlanSummary[] }>('/onboarding-plans').then((r) => setPlans(r.plans)).catch(() => setPlans([])), []);
  const shown = useMemo(() => (plans ?? []).filter((p) => (filter === 'all' ? true : filter === 'stalled' ? p.progress.state === 'stalled' || p.progress.state === 'behind' : ['draft', 'active', 'paused'].includes(p.status))), [plans, filter]);
  const counts = useMemo(() => {
    const open = (plans ?? []).filter((p) => ['draft', 'active', 'paused'].includes(p.status));
    return { open: open.length, stalled: open.filter((p) => p.progress.state === 'stalled' || p.progress.state === 'behind').length, done: (plans ?? []).filter((p) => p.status === 'done').length };
  }, [plans]);
  return (
    <>
      <header className="topbar">
        <div className="topbar__titles topbar__titles--icon">
          <PageIcon name="flag" />
          <h1 className="topbar__title">{t('ob.portfolio.title')}</h1>
          <p className="topbar__sub">{t('ob.portfolio.sub')}</p>
        </div>
        <div className="topbar__spacer" />
        {canWrite && tab === 'plans' && (
          <button className="btn btn--primary" onClick={() => setMaking('1')}>
            <Icon name="plus" size={16} /> {t('ob.new.button')}
          </button>
        )}
      </header>
      {making && <NewPlanDialog accountId={/^[0-9a-f-]{36}$/i.test(making) ? making : null} onClose={() => setMaking(null)} />}
      <div className="page ob-port">
        <div className="ob-tabs" role="tablist">
          <a role="tab" aria-selected={tab === 'plans'} className="ob-tab" href="/onboarding/plans" onClick={(e) => (e.preventDefault(), navigate('/onboarding/plans'))}>
            {t('ob.portfolio.plans')}
          </a>
          <a role="tab" aria-selected={tab === 'templates'} className="ob-tab" href="/onboarding/templates" onClick={(e) => (e.preventDefault(), navigate('/onboarding/templates'))}>
            {t('ob.portfolio.templates')}
          </a>
        </div>
        {tab === 'templates' ? (
          <Templates canWrite={canWrite} onError={(m) => toast(m, 'error')} />
        ) : (
          <>
            <dl className="ob-kpis">
              <div>
                <dt>{t('ob.portfolio.open')}</dt>
                <dd>{counts.open}</dd>
              </div>
              <div data-tone={counts.stalled ? 'late' : undefined}>
                <dt>{t('ob.portfolio.stalled')}</dt>
                <dd>{counts.stalled}</dd>
              </div>
              <div>
                <dt>{t('ob.portfolio.done')}</dt>
                <dd>{counts.done}</dd>
              </div>
            </dl>
            <div className="toolbar">
              <div className="ob-views" role="group" aria-label={t('ob.portfolio.filter')}>
                {(['open', 'stalled', 'all'] as const).map((f) => (
                  <button key={f} className="ob-views__btn" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                    {t(`ob.portfolio.f.${f}`)}
                  </button>
                ))}
              </div>
            </div>
            {plans && shown.length === 0 ? (
              <div className="sheet">
                <EmptyState compact icon="flag" tone="calm" title={t('ob.portfolio.empty')} body={t('ob.portfolio.emptyBody')} />
              </div>
            ) : (
              <div className="sheet ob-table-wrap" data-tour="ob-portfolio">
                <table className="ob-table ob-port__table">
                  <thead>
                    <tr>
                      <th>{t('ob.portfolio.customer')}</th>
                      <th>{t('ob.portfolio.progress')}</th>
                      <th>{t('ob.portfolio.state')}</th>
                      <th>{t('ob.portfolio.waiting')}</th>
                      <th>{t('ob.portfolio.issues')}</th>
                      <th>{t('ob.portfolio.owner')}</th>
                      <th>{t('ob.portfolio.target')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((p) => (
                      <tr key={p.id} data-state={p.progress.state}>
                        <td>
                          <a href={`/onboarding/plans/${p.id}`} onClick={(e) => (e.preventDefault(), navigate(`/onboarding/plans/${p.id}`))}>
                            <strong>{p.accountName ?? p.name}</strong>
                          </a>
                          {p.status === 'draft' && <span className="ob-tag">{t('ob.status.draft')}</span>}
                        </td>
                        <td>
                          <span className="ob-bar" role="img" aria-label={formatPercent(p.progress.pct, locale)}>
                            <span style={{ width: `${p.progress.pct}%` }} />
                            <i style={{ insetInlineStart: `${p.progress.expected}%` }} />
                          </span>
                          <small>{formatPercent(p.progress.pct, locale)}</small>
                        </td>
                        <td>
                          <span className="ob-state" data-state={p.progress.state}>
                            {t(`ob.state.${p.progress.state}`)}
                          </span>
                        </td>
                        <td>
                          {p.progress.waiting.customer > 0 && <small>{t('ob.portfolio.waitCustomer', { n: p.progress.waiting.customerDays })}</small>}
                          {p.progress.waiting.vendor > 0 && <small>{t('ob.portfolio.waitUs', { n: p.progress.waiting.vendorDays })}</small>}
                        </td>
                        <td>{p.progress.issues.stuck ? <span className="ob-stuck">{t('ob.issues.stuckN', { n: p.progress.issues.stuck })}</span> : p.progress.issues.open || '—'}</td>
                        <td>{p.ownerName ?? '—'}</td>
                        <td>{p.targetOn ? formatDayShort(p.targetOn, locale) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

function Templates({ canWrite, onError }: { canWrite: boolean; onError: (m: string) => void }) {
  const { tt: t } = useT();
  const { me } = useStore();
  const [data, setData] = useState<{ builtIn: { key: string; kind: string; blueprint: any }[]; templates: Template[] } | null>(null);
  const [editing, setEditing] = useState<Template | null>(null);
  const load = useCallback(() => get('/onboarding-templates').then(setData), []);
  useEffect(() => void load().catch(() => undefined), [load]);
  const fail = (e: unknown) => onError(e instanceof ApiFailure ? e.body.message : t('errors.server'));
  const copy = (from: string, name: string) => post('/onboarding-templates', { name, from }).then(load).catch(fail);
  if (!data) return <Loading />;
  return (
    <div className="ob-templates" data-tour="ob-templates">
      <h2 className="ob-h2">{t('ob.tpl.builtIn')}</h2>
      <div className="ob-cards">
        {data.builtIn.map((b) => (
          <div className="sheet ob-card" key={b.key}>
            <h3>{t(`ob.tpl.${b.key}.name`)}</h3>
            <p className="muted">{t(`ob.tpl.${b.key}.summary`)}</p>
            <p className="ob-card__meta">{t('ob.tpl.meta', { steps: b.blueprint.steps.length, days: b.blueprint.days ?? 0 })}</p>
            {canWrite && (
              <button className="btn btn--small" onClick={() => void copy(b.key, t(`ob.tpl.${b.key}.name`))}>
                <Icon name="copy" size={14} /> {t('ob.tpl.copy')}
              </button>
            )}
          </div>
        ))}
      </div>
      <h2 className="ob-h2">{t('ob.tpl.own')}</h2>
      {data.templates.length === 0 ? (
        <p className="muted">{t('ob.tpl.none')}</p>
      ) : (
        <div className="ob-cards">
          {data.templates.map((tp) => (
            <div className="sheet ob-card" key={tp.id}>
              <h3>{tp.name}</h3>
              {tp.summary && <p className="muted">{tp.summary}</p>}
              <p className="ob-card__meta">
                {t('ob.tpl.meta', { steps: tp.blueprint.steps.length, days: tp.blueprint.days ?? 0 })} · {t('ob.tpl.used', { n: tp.used, done: tp.finished })}
              </p>
              {canWrite && (
                <div className="ob-card__actions">
                  <button className="btn btn--small" onClick={() => setEditing(tp)}>
                    <Icon name="edit" size={14} /> {t('common.edit')}
                  </button>
                  <button className="btn btn--small btn--quiet" onClick={() => void copy(tp.id, t('ob.tpl.copyOf', { name: tp.name }))}>
                    <Icon name="copy" size={14} /> {t('ob.tpl.copy')}
                  </button>
                  <button className="btn btn--small btn--quiet" onClick={() => void del(`/onboarding-templates/${tp.id}`).then(load).catch(fail)}>
                    <Icon name="inbox" size={16} />
                    {t('ob.tpl.archive')}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {canWrite && me?.user.perms.includes('org.manage') && <OnboardingSettings templates={data} />}
      {editing && <TemplateEditor tpl={editing} onClose={() => setEditing(null)} onSaved={() => void load().then(() => setEditing(null))} onError={fail} />}
    </div>
  );
}

/** A template's name, summary and steps: titles, phase, side, days and whether each is optional. */
function TemplateEditor({ tpl, onClose, onSaved, onError }: { tpl: Template; onClose: () => void; onSaved: () => void; onError: (e: unknown) => void }) {
  const { tt: t } = useT();
  const [name, setName] = useState(tpl.name);
  const [summary, setSummary] = useState(tpl.summary);
  const [steps, setSteps] = useState(() => tpl.blueprint.steps.map((s) => ({ ...s, title: s.title ?? t(`ob.step.${s.titleKey ?? s.key}.title`) })));
  const setStep = (i: number, v: Partial<(typeof steps)[number]>) => setSteps(steps.map((s, j) => (j === i ? { ...s, ...v } : s)));
  const save = () =>
    patch(`/onboarding-templates/${tpl.id}`, {
      name,
      summary,
      blueprint: {
        ...tpl.blueprint,
        steps: steps.map(({ title, titleKey, ...s }) => {
          const said = titleKey ? t(`ob.step.${titleKey}.title`) : null;
          // A built-in title left as it was stays a key (it is then said in each reader's language).
          return title === said && titleKey ? { ...s, titleKey } : { ...s, title };
        }),
      },
    })
      .then(onSaved)
      .catch(onError);
  return (
    <Dialog
      wide
      title={t('ob.tpl.edit')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            <Icon name="close" size={16} />
            {t('common.cancel')}
          </button>
          <button className="btn btn--primary" onClick={() => void save()}>
            <Icon name="check" size={16} />
            {t('common.save')}
          </button>
        </>
      }
    >
      <div className="ob-row2">
        <label className="field">
          <span className="field__label">{t('ob.tpl.name')}</span>
          <input className="input" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">{t('ob.tpl.summary')}</span>
          <input className="input" value={summary} maxLength={1000} onChange={(e) => setSummary(e.target.value)} />
        </label>
      </div>
      <ol className="ob-tpl-steps">
        {steps.map((s, i) => (
          <li key={s.key}>
            <input className="input" value={s.title ?? ''} maxLength={200} aria-label={t('ob.steps.name')} onChange={(e) => setStep(i, { title: e.target.value })} />
            <select className="select" value={s.phase} aria-label={t('ob.steps.phase')} onChange={(e) => setStep(i, { phase: e.target.value as Phase })}>
              {[...new Set([...(tpl.blueprint.phases ?? []).map((x) => x.key), ...PHASES])].map((p) => (
                <option key={p} value={p}>
                  {phaseLabel(p, tpl.blueprint.phases, t)}
                </option>
              ))}
            </select>
            <select className="select" value={s.side} aria-label={t('ob.steps.side')} onChange={(e) => setStep(i, { side: e.target.value as StepSide })}>
              {(['vendor', 'customer', 'both'] as const).map((x) => (
                <option key={x} value={x}>
                  {t(`ob.sideShort.${x}`)}
                </option>
              ))}
            </select>
            <input className="input ob-tpl-steps__days" type="number" min={0} max={365} value={s.days ?? 1} aria-label={t('ob.tpl.days')} onChange={(e) => setStep(i, { days: Number(e.target.value) })} />
            <label className="check">
              <input type="checkbox" checked={!!s.optional} onChange={(e) => setStep(i, { optional: e.target.checked ? true : undefined })} /> {t('ob.optional')}
            </label>
            <button className="ob-x" aria-label={t('common.delete')} onClick={() => setSteps(steps.filter((_, j) => j !== i).map((x) => ({ ...x, after: (x.after ?? []).filter((k) => k !== s.key) })))}>
              <Icon name="close" size={12} />
            </button>
          </li>
        ))}
      </ol>
      <button className="btn btn--small btn--quiet" onClick={() => setSteps([...steps, { key: `own${Date.now().toString(36)}`, phase: 'setup', side: 'vendor', title: '', days: 1 }])}>
        <Icon name="plus" size={14} /> {t('ob.steps.add')}
      </button>
    </Dialog>
  );
}

// ------------------------------------------------------------------ the report

/** The report inside the app (from the plan), ready to print or save as PDF. */
export function OnboardingReportPage({ id }: { id: string }) {
  const [report, setReport] = useState<PlanReport | null | undefined>(undefined);
  useEffect(() => void get<{ report: PlanReport }>(`/onboarding-plans/${id}/report`).then((r) => setReport(r.report)).catch(() => setReport(null)), [id]);
  if (report === undefined) return <Loading />;
  if (!report) return <EmptyState icon="search" title="—" />;
  return <Report report={report} back={`/onboarding/plans/${id}`} />;
}

/** The report behind a shared link: no sign-in, read only. */
export function SharedReport({ secret }: { secret: string }) {
  const [report, setReport] = useState<PlanReport | null | undefined>(undefined);
  useEffect(() => {
    void fetch(`/api/share/onboarding/${encodeURIComponent(secret)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((r) => setReport(r?.report ?? null))
      .catch(() => setReport(null));
  }, [secret]);
  const { tt: t } = useT();
  if (report === undefined) return <Loading />;
  if (!report)
    return (
      <div className="page">
        <EmptyState icon="lock" title={t('ob.report.gone')} body={t('ob.report.goneBody')} />
      </div>
    );
  return <Report report={report} />;
}

export function Report({ report: r, back }: { report: PlanReport; back?: string }) {
  const { tt: t, locale } = useT();
  const side = (s: StepSide) => (s === 'both' ? t('ob.side.both') : s === 'vendor' ? t('ob.report.vendor', { company: r.company }) : (r.accountName ?? t('ob.side.customer.self')));
  return (
    <div className="ob-report">
      <div className="ob-report__bar no-print">
        {back && (
          <a className="btn btn--small btn--quiet" href={back} onClick={(e) => (e.preventDefault(), navigate(back))}>
            <Icon name="arrowLeft" size={14} /> {t('common.back')}
          </a>
        )}
        <button className="btn btn--small btn--primary" onClick={() => window.print()} data-tour="ob-print">
          <Icon name="download" size={14} /> {t('ob.report.print')}
        </button>
      </div>
      <article className="ob-report__page">
        <header className="ob-report__head">
          <p className="ob-report__kicker">{t('ob.report.kicker', { company: r.company })}</p>
          <h1>{r.name}</h1>
          <p className="muted">{t('ob.report.generated', { date: formatDayShort(r.generatedAt.slice(0, 10), locale) })}</p>
        </header>
        <section className="ob-report__kpis">
          <div>
            <span>{t('ob.report.done')}</span>
            <strong>{formatPercent(r.progress.pct, locale)}</strong>
            <small>{t('ob.progress.expected', { pct: formatPercent(r.progress.expected, locale) })}</small>
          </div>
          <div>
            <span>{t('ob.report.state')}</span>
            <strong className="ob-state" data-state={r.progress.state}>
              {t(`ob.state.${r.progress.state}`)}
            </strong>
          </div>
          <div>
            <span>{t('ob.report.forecast')}</span>
            <strong>{r.forecastOn ? formatDayShort(r.forecastOn, locale) : '—'}</strong>
            {r.targetOn && <small>{t('ob.target', { date: formatDayShort(r.targetOn, locale) })}</small>}
          </div>
          <div>
            <span>{t('ob.report.issues')}</span>
            <strong>{r.progress.issues.open}</strong>
            <small>{t('ob.issues.stuckN', { n: r.progress.issues.stuck })}</small>
          </div>
          {r.tests && (
            <div>
              <span>{t('ob.report.tests')}</span>
              <strong>
                {r.tests.passed}/{r.tests.total}
              </strong>
              {r.tests.failed > 0 && <small>{t('ob.report.testsFailed', { n: r.tests.failed })}</small>}
            </div>
          )}
        </section>
        <h2>{t('ob.report.phases')}</h2>
        <ul className="ob-report__phases">
          {r.phases.map((m) => (
            <li key={m.phase}>
              <span>{m.name || phaseLabel(m.phase, null, t)}</span>
              <span className="ob-bar">
                <span style={{ width: `${m.pct}%` }} />
              </span>
              <span>
                {m.done}/{m.total}
              </span>
            </li>
          ))}
        </ul>
        <h2>{t('ob.report.waiting')}</h2>
        <p>
          {t('ob.report.waitingLine', { vendor: r.progress.waiting.vendor, vendorDays: r.progress.waiting.vendorDays, customer: r.progress.waiting.customer, customerDays: r.progress.waiting.customerDays, company: r.company, them: r.accountName ?? t('ob.side.customer.self') })}
        </p>
        <h2>{t('ob.report.next')}</h2>
        {r.next.length ? (
          <ol>
            {r.next.map((n) => (
              <li key={n.key}>
                {n.title ?? t(`ob.step.${n.titleKey ?? n.key}.title`)} — {side(n.side)}
                {n.dueOn ? ` · ${t('ob.due', { date: formatDayShort(n.dueOn, locale) })}` : ''}
              </li>
            ))}
          </ol>
        ) : (
          <p>{t('ob.next.allDone')}</p>
        )}
        {r.issues.length > 0 && (
          <>
            <h2>{t('ob.issues.title')}</h2>
            <ul>
              {r.issues.map((i, n) => (
                <li key={n}>
                  <strong>{t(`ob.urgency.${i.urgency}`)}</strong> · {i.title} — {t('ob.issues.waitsFor', { name: side(i.side) })}
                </li>
              ))}
            </ul>
          </>
        )}
        <h2>{t('ob.report.data')}</h2>
        <p>{t('ob.report.dataLine', { failing: r.fields.failing, ok: r.fields.ok, waiting: r.fields.waiting })}</p>
        {r.goals.length > 0 && (
          <>
            <h2>{t('ob.goals.title')}</h2>
            <ul>
              {r.goals.map((g, n) => (
                <li key={n} data-status={g.status}>
                  {g.status === 'done' ? '✓ ' : ''}
                  {goalTitle(t, g)} · {t(`ob.priority.${g.priority}`)}
                </li>
              ))}
            </ul>
          </>
        )}
        {r.metrics.some((m) => m.baseline != null) && (
          <>
            <h2>{t('ob.metrics.title')}</h2>
            <table className="ob-table">
              <thead>
                <tr>
                  <th />
                  <th>{t('ob.metrics.baseline')}</th>
                  <th>{t('ob.metrics.current')}</th>
                  <th>{t('ob.metrics.target')}</th>
                </tr>
              </thead>
              <tbody>
                {r.metrics.map((m, n) => (
                  <tr key={n}>
                    <td>
                      {metricTitle(t, m)} ({m.unit})
                    </td>
                    <td>{m.baseline ?? '—'}</td>
                    <td>{m.current ?? '—'}</td>
                    <td>{m.target ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        <p className="muted ob-report__foot">{t('ob.report.foot')}</p>
      </article>
    </div>
  );
}

// ------------------------------------------------------------------ settings (Settings → Onboarding)

export function OnboardingSettings({ templates }: { templates: { builtIn: { key: string; kind: string }[]; templates: Template[] } }) {
  const { tt: t, locale } = useT();
  const { toast, me } = useStore();
  const [s, setS] = useState<OnboardingSettingsShape | null>(null);
  useEffect(() => void get('/onboarding/settings').then((r) => setS(r.settings)), []);
  if (!s || !me) return null;
  const save = (v: Partial<OnboardingSettingsShape>) =>
    put('/onboarding/settings', { ...s, ...v })
      .then((r) => (setS(r.settings), toast(t('common.saved'))))
      .catch((e) => toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error'));
  // What a won customer's plan can open with: the company's own templates, the built-in ones, or "ask each time".
  const choices = [
    ...templates.templates.filter((x) => x.kind === 'client').map((x) => ({ value: x.id, label: x.name })),
    ...templates.builtIn.filter((b) => b.kind === 'client').map((b) => ({ value: b.key, label: t(`ob.tpl.${b.key}.name` as MessageKey) })),
    { value: ASK_TEMPLATE, label: t('ob.settings.ask') },
  ];
  const fields = me.org.accountFields ?? [];
  const label = (f: (typeof fields)[number]) => f.label[locale] ?? f.label.en ?? f.key;
  const rules = s.rules;
  const setRule = (i: number, v: Partial<TemplateRule>) => setS({ ...s, rules: rules.map((r, k) => (k === i ? { ...r, ...v } : r)) });
  const pickTemplate = (value: string, onChange: (v: string) => void, aria: string) => (
    <select className="select" value={value} aria-label={aria} onChange={(e) => onChange(e.target.value)}>
      {choices.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
  return (
    <section className="sheet ob-settings" data-tour="ob-settings">
      <h2>{t('ob.settings.title')}</h2>
      <label className="check">
        <input type="checkbox" checked={s.fromHandover} onChange={(e) => void save({ fromHandover: e.target.checked })} /> {t('ob.settings.fromHandover')}
      </label>
      <p className="muted">{t('ob.settings.fromHandoverHint')}</p>
      {s.fromHandover && (
        <div className="ob-settings__more">
          <label className="field">
            <span className="field__label">{t('ob.settings.template')}</span>
            {pickTemplate(s.templateId ?? choices[0]?.value ?? ASK_TEMPLATE, (v) => void save({ templateId: v }), t('ob.settings.template'))}
          </label>
          <h3 className="ob-settings__h">{t('ob.settings.rules')}</h3>
          <p className="muted">{t('ob.settings.rulesHint')}</p>
          {rules.map((r, i) => (
            <div className="ob-rule" key={i}>
              <select className="select" value={r.field} aria-label={t('ob.settings.ruleField')} onChange={(e) => setRule(i, { field: e.target.value })}>
                {fields.map((f) => (
                  <option key={f.key} value={f.key}>
                    {label(f)}
                  </option>
                ))}
              </select>
              <span className="ob-rule__is">{t('ob.settings.ruleIs')}</span>
              <input className="input" value={r.value} maxLength={120} aria-label={t('ob.settings.ruleValue')} onChange={(e) => setRule(i, { value: e.target.value })} />
              <span className="ob-rule__is">→</span>
              {pickTemplate(r.templateId, (v) => setRule(i, { templateId: v }), t('ob.settings.template'))}
              <button className="btn btn--small btn--quiet" aria-label={t('ob.settings.ruleRemove')} onClick={() => setS({ ...s, rules: rules.filter((_, k) => k !== i) })}>
                <Icon name="close" size={14} />
              </button>
            </div>
          ))}
          <div className="ob-settings__actions">
            {fields.length > 0 && rules.length < MAX_TEMPLATE_RULES && (
              <button className="btn btn--small btn--quiet" onClick={() => setS({ ...s, rules: [...rules, { field: fields[0].key, value: '', templateId: choices[0]?.value ?? ASK_TEMPLATE }] })}>
                <Icon name="plus" size={14} /> {t('ob.settings.ruleAdd')}
              </button>
            )}
            <button className="btn btn--small" onClick={() => void save({ rules: rules.filter((r) => r.value.trim()) })}>
              <Icon name="check" size={16} />
              {t('common.save')}
            </button>
          </div>
        </div>
      )}
      <p className="muted">
        {t('ob.settings.mailHint')} <a href="/profile">{t('ob.settings.mailLink')}</a>
      </p>
    </section>
  );
}
