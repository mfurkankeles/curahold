// "Test your setup": after setting up, the person tries it the way the team
// will — a test ticket, a test sync, the portal through a customer's eyes, a
// dry run of a rule, the import's counts against the file, a colleague's view.
// Each step says what it proves and how long it takes; every try is kept with
// what it saw (expected against seen, when, by whom); a failed step becomes
// an issue with one click; and the go-live gate asks for the required steps,
// then two approvals, then says "Setup complete" with the date.
import { useEffect, useMemo, useState } from 'react';
import type { MessageKey } from '../../../shared/src/i18n';
import type { DepartmentKey } from '../../../shared/src/model';
import type { Approval, SetupTest, TestGroup, TestRun, TestStatus, TestStepResult } from '../../../shared/src/setupHealth';
import { SkeletonRows } from '../components/Empty';
import { Icon, PageIcon } from '../components/icons';
import { ApiFailure, get, post, startPreview } from '../lib/api';
import { formatDate, formatInt } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { navigate } from '../lib/router';
import { setupChanged } from '../lib/setupHealth';
import { useStore } from '../lib/store';
import '../surfaces/setup.css';

const DEMO = !!import.meta.env.APP_DEMO;
const GROUPS: TestGroup[] = ['company', 'inside_sales', 'sales', 'onboarding', 'success', 'product', 'finance'];
type Seen = TestRun['seen'];

export function SetupTestPage() {
  const { t, locale } = useI18n();
  const { can } = useStore();
  const [data, setData] = useState<SetupTest | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bundle, setBundle] = useState<string | null>(null);
  const [history, setHistory] = useState<Set<string>>(new Set());

  useEffect(() => {
    void get<SetupTest>('/setup-test').then(setData, () => setError(t('sh.test.error')));
  }, [t]);

  const act = async (id: string, what: () => Promise<SetupTest>) => {
    setBusy(id);
    setError(null);
    try {
      setData(await what());
      setupChanged();
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : t('sh.test.error'));
    } finally {
      setBusy(null);
    }
  };
  const runStep = (s: TestStepResult) => act(s.id, () => post<SetupTest>(`/setup-test/${s.id}/run`, {}));
  const mark = (s: TestStepResult, status: TestStatus) => act(s.id, () => post<SetupTest>(`/setup-test/${s.id}/mark`, { status }));
  const keep = (s: TestStepResult, value: string) => act(s.id, () => post<SetupTest>(`/setup-test/${s.id}/input`, { value: value || null }));
  const raise = (s: TestStepResult) => act(s.id, () => post<SetupTest>(`/setup-test/${s.id}/issue`, {}));
  const approve = (side: 'customer' | 'vendor', yes: boolean) => act(`approve-${side}`, () => post<SetupTest>('/setup-test/approve', { side, approve: yes }));
  const reset = () => act('reset', () => post<SetupTest>('/setup-test/reset', {}));
  /** A bundle's steps the server can run, one after another; the ones a person checks stay highlighted. */
  const runBundle = async (id: string) => {
    if (!data) return;
    setBundle(id);
    const ids = data.bundles.find((b) => b.id === id)?.steps ?? [];
    for (const s of data.steps.filter((x) => ids.includes(x.id) && x.auto && x.canRun)) await runStep(s);
  };

  /** "Test it" on a step the person checks with their own eyes: open the thing to look at. */
  const look = (s: TestStepResult) => {
    if (s.id === 'portal') {
      const demo = (globalThis as { __demo?: { as: (who: string) => Promise<void> } }).__demo;
      if (demo) void demo.as('customer');
      else if (s.detail.url) window.open(String(s.detail.url), '_blank', 'noreferrer');
      else navigate('/settings/portal');
    } else if (s.id === 'invite') {
      if (s.detail.userId && !DEMO) startPreview(String(s.detail.userId), String(s.detail.name ?? ''));
      else navigate('/settings/people');
    } else if (s.id === 'import') navigate('/import');
  };
  const canLook = (s: TestStepResult) => (s.id === 'portal' ? !!s.detail.on : s.id === 'invite' ? !!s.detail.userId : s.id === 'import' ? s.detail.created !== undefined : false);

  /** What a try saw, in a sentence (the evidence), or null when there is nothing to say. */
  const seenLine = (id: string, status: TestStatus, d: Seen, reason: string | null): string | null => {
    const n = (v: unknown) => formatInt(Number(v ?? 0), locale);
    if (status === 'fail' && reason && reason !== 'person') return t(`sh.test.reason.${reason}` as MessageKey, { error: '' });
    if (id === 'ticket' && status === 'pass') return t('sh.test.seen.ticket', { customer: String(d.customer ?? '') });
    if (['crm', 'jira', 'accounting'].includes(id) && d.name && status !== 'todo') return t('sh.test.seen.sync', { name: String(d.name), created: n(d.created), updated: n(d.updated) });
    if (id === 'automation' && status === 'pass') return d.event ? t('sh.test.seen.ruleEvent', { name: String(d.name ?? '') }) : t('sh.test.seen.rule', { name: String(d.name ?? ''), n: n(d.count) });
    if (id === 'import')
      return d.created !== undefined
        ? t(d.rows ? 'sh.test.seen.importRows' : 'sh.test.seen.import', { file: String(d.file ?? '—'), rows: n(d.rows), created: n(d.created), updated: n(d.updated), skipped: n(d.skipped) })
        : t('sh.test.seen.noImport');
    // "Pick for me" leaves no name behind: then the plain line, never "through ()".
    if (id === 'invite' && status !== 'todo')
      return d.name ? t(status === 'pass' ? 'sh.run.personPassOf' : 'sh.run.personFailOf', { name: String(d.name), role: String(d.role ?? '') }) : t(status === 'pass' ? 'sh.run.personPass' : 'sh.run.personFail');
    if (id === 'invite') return d.userId ? t('sh.test.seen.invite', { name: String(d.name ?? ''), role: String(d.role ?? '') }) : t('sh.test.seen.noInvite');
    if (id === 'portal') return d.on ? null : t('sh.test.seen.portalOff');
    if (status === 'pass') return t('sh.run.personPass');
    if (status === 'fail') return t('sh.run.personFail');
    return null;
  };
  /** Why a step cannot be tried here yet. */
  const notHere = (s: TestStepResult) => (s.id === 'import' ? t('sh.test.seen.noImport') : s.id === 'portal' ? t('sh.test.seen.portalOff') : t('sh.test.reason.not_connected'));

  const groupLabel = (g: TestGroup) => (g === 'company' ? t('sh.test.group.company') : t(`dept.${g as DepartmentKey}` as MessageKey));
  const inBundle = useMemo(() => (bundle ? new Set(data?.bundles.find((b) => b.id === bundle)?.steps ?? []) : null), [bundle, data]);
  const visible = (data?.steps ?? []).filter((s) => !inBundle || inBundle.has(s.id));
  const groups = GROUPS.filter((g) => visible.some((s) => s.group === g));
  const first = visible.find((s) => s.applies && s.status !== 'pass' && s.status !== 'skipped')?.id;
  const gate = data?.gate;
  const gateReady = !!gate && gate.requiredPassed === gate.required;
  const when = (iso: string) => formatDate(iso, locale, { day: 'numeric', month: 'long', year: 'numeric' });
  const whenTime = (iso: string) => formatDate(iso, locale, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const toggleHistory = (id: string) =>
    setHistory((h) => {
      const next = new Set(h);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const approvalRow = (side: 'customer' | 'vendor', a: Approval | null, canDo: boolean) => (
    <li className="sh-approve" data-done={a ? '' : undefined}>
      <span className="sh-step__mark" aria-hidden="true">
        <Icon name={a ? 'check' : 'dot'} size={16} />
      </span>
      <div className="sh-approve__text">
        <strong>{t(`sh.gate.${side}` as MessageKey)}</strong>
        <span className="muted">{a ? t('sh.gate.approvedBy', { by: a.by ?? t('common.unknownUser'), when: when(a.at) }) : t(`sh.gate.${side}.who` as MessageKey)}</span>
      </div>
      {canDo && !data?.doneAt && (
        <button
          type="button"
          className={`btn btn--small${a ? ' btn--quiet' : ' btn--primary'}`}
          disabled={(!a && !gateReady) || !!busy}
          aria-busy={busy === `approve-${side}` || undefined}
          onClick={() => void approve(side, !a)}
          data-tour={!a && side === 'customer' ? 'setup-approve' : undefined}
        >
          {a ? t('sh.gate.withdraw') : t('sh.gate.approve')}
        </button>
      )}
    </li>
  );

  return (
    <>
      <header className="topbar">
        <div className="topbar__titles topbar__titles--icon">
          <PageIcon name="checkCircle" />
          <h1 className="topbar__title">{t('sh.test.title')}</h1>
          {data && data.total > 0 && <p className="topbar__sub">{t('sh.test.progress', { passed: data.passed, total: data.total })}</p>}
        </div>
        <div className="topbar__spacer" />
        <button className="btn btn--quiet btn--small" onClick={() => navigate('/setup-health')}>
          <Icon name="lifebuoy" size={16} />
          {t('sh.title')}
        </button>
      </header>
      <div className="page sh-page">
        {!data ? (
          error ? (
            <p className="sh-error" role="alert">
              {error}
            </p>
          ) : (
            <SkeletonRows rows={6} label={t('common.loading')} />
          )
        ) : (
          <>
            {data.doneAt ? (
              <section className="sh-done" aria-live="polite" data-tour="setup-done">
                <span className="sh-done__mark" aria-hidden="true">
                  <Icon name="check" size={22} />
                </span>
                <div>
                  <h2 className="sh-done__title">{t('sh.test.done.title')}</h2>
                  <p className="sh-done__lead">{t('sh.test.done.lead', { when: when(data.doneAt), by: data.doneBy ?? t('common.unknownUser') })}</p>
                </div>
                {(can('org.manage') || can('users.manage')) && (
                  <button className="btn btn--quiet btn--small" onClick={() => void reset()} disabled={busy === 'reset'}>
                    {t('sh.test.reset')}
                  </button>
                )}
              </section>
            ) : (
              <section className="sh-summary" data-state="test">
                <div className="sh-summary__text">
                  <h2 className="sh-summary__title">{t('sh.test.lead.title')}</h2>
                  <p className="sh-summary__lead">{t('sh.test.lead.body')}</p>
                </div>
                {data.total > 0 && (
                  <div className="sh-meter" role="img" aria-label={t('sh.test.progress', { passed: data.passed, total: data.total })}>
                    <span className="sh-meter__fill" style={{ inlineSize: `${Math.round((data.passed / data.total) * 100)}%` }} />
                  </div>
                )}
              </section>
            )}

            {data.steps.length > 0 && (
              <section className="sh-bundles" aria-label={t('sh.bundle.label')} data-tour="setup-bundles">
                {data.bundles
                  .filter((b) => b.steps.length)
                  .map((b) => (
                    <div key={b.id} className="sh-bundle" data-on={bundle === b.id || undefined}>
                      <button type="button" className="sh-bundle__pick" aria-pressed={bundle === b.id} onClick={() => setBundle(bundle === b.id ? null : b.id)}>
                        <strong>{t(`sh.bundle.${b.id}.title` as MessageKey)}</strong>
                        <span className="muted">{t(`sh.bundle.${b.id}.body` as MessageKey)}</span>
                        <span className="sh-bundle__meta num">{t('sh.bundle.meta', { n: b.steps.length, minutes: b.minutes })}</span>
                      </button>
                      {data.steps.some((s) => b.steps.includes(s.id) && s.auto && s.canRun) && (
                        <button type="button" className="btn btn--small" onClick={() => void runBundle(b.id)} disabled={!!busy}>
                          <Icon name="play" size={14} className="sh-flip" />
                          {t('sh.bundle.run')}
                        </button>
                      )}
                    </div>
                  ))}
              </section>
            )}

            {error && (
              <p className="sh-error" role="alert">
                {error}
              </p>
            )}
            {!data.steps.length && <p className="muted">{t('sh.test.nothing')}</p>}

            {groups.map((g) => (
              <section key={g} className="sh-area" aria-labelledby={`sh-g-${g}`}>
                <h3 className="sh-area__title" id={`sh-g-${g}`}>
                  {groupLabel(g)}
                </h3>
                <ol className="sh-steps">
                  {visible
                    .filter((s) => s.group === g)
                    .map((s) => {
                      const here = s.id === first;
                      const line = s.status !== 'todo' ? seenLine(s.id, s.status, s.detail, s.reason) : s.id === 'import' || s.id === 'invite' ? seenLine(s.id, 'todo', s.detail, null) : null;
                      const older = s.runs.slice(1);
                      return (
                        <li key={s.id} id={s.id} className="sh-step" data-status={s.status} data-off={!s.applies || undefined} data-current={here || undefined} data-tour={here ? 'setup-step' : s.issue?.status === 'open' ? 'setup-issue' : undefined}>
                          <span className="sh-step__mark" aria-hidden="true">
                            <Icon name={s.status === 'pass' ? 'check' : s.status === 'fail' ? 'alert' : s.status === 'skipped' ? 'arrowRight' : 'dot'} size={16} />
                          </span>
                          <div className="sh-step__body">
                            <div className="sh-step__head">
                              <strong className="sh-step__title">{t(`sh.test.${s.id}.title` as MessageKey)}</strong>
                              <span className="sh-step__tags">
                                <span className="sh-pill" data-status={s.status}>
                                  {t(`sh.test.status.${s.status}` as MessageKey)}
                                </span>
                                <span className="sh-tag" data-kind={s.required ? 'required' : 'optional'}>
                                  {s.required ? t('sh.test.required') : t('sh.test.optional')}
                                </span>
                                <span className="muted num">{t('sh.test.minutes', { n: s.minutes })}</span>
                              </span>
                            </div>
                            <p className="sh-step__how">{t(`sh.test.${s.id}.how` as MessageKey)}</p>
                            <p className="sh-step__proves">
                              <span className="sh-step__label">{t('sh.run.expected')}</span> {t(`sh.test.${s.id}.expect` as MessageKey)}
                            </p>
                            {!s.applies && <p className="sh-step__seen muted">{notHere(s)}</p>}

                            {s.input && s.input.choices.length > 0 && s.canRun && (
                              <label className="sh-step__input">
                                <span>{t(`sh.input.${s.input.kind}` as MessageKey)}</span>
                                <select className="select sh-step__select" value={s.input.value ?? ''} onChange={(e) => void keep(s, e.target.value)} disabled={!!busy}>
                                  <option value="">{t('sh.input.auto')}</option>
                                  {s.input.choices.map((o) => (
                                    <option key={o.value} value={o.value}>
                                      {o.label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            )}

                            {s.status !== 'todo' && s.at ? (
                              <div className="sh-evidence" data-status={s.status}>
                                <p>
                                  <span className="sh-step__label">{t('sh.run.saw')}</span> {(s.runs[0] ? seenLine(s.id, s.runs[0].status, s.runs[0].seen, s.runs[0].reason) : line) ?? '—'}
                                </p>
                                {s.reason === 'sync_error' && s.detail.error ? <span className="sh-step__err">{String(s.detail.error)}</span> : null}
                                <p className="muted">{t('sh.test.when', { when: whenTime(s.at), by: s.by ?? t('common.unknownUser') })}</p>
                              </div>
                            ) : (
                              line && <p className="sh-step__seen">{line}</p>
                            )}

                            {s.id === 'ticket' && s.status === 'pass' && (
                              <button type="button" className="sh-link" onClick={() => navigate('/records/ticket')}>
                                {t('sh.test.ticket.open')}
                              </button>
                            )}

                            {s.status === 'fail' && (
                              <div className="sh-step__fail">
                                {(!s.reason || s.reason === 'person') && (
                                  <p>
                                    <strong>{t('sh.test.ifFails')}</strong> {t('sh.test.reason.person')}
                                  </p>
                                )}
                                <div className="sh-step__actions">
                                  <button type="button" className="btn btn--small" onClick={() => navigate(s.id === 'ticket' && s.reason === 'no_customer' ? '/accounts' : s.detail.connection ? `/settings/sources/${s.detail.connection}` : s.fix)}>
                                    {t('sh.test.openFix')}
                                  </button>
                                  {s.canRun && s.issue?.status !== 'open' && (
                                    <button type="button" className="btn btn--small btn--quiet" onClick={() => void raise(s)} disabled={!!busy}>
                                      <Icon name="flag" size={14} />
                                      {t('sh.issue.open')}
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}
                            {s.issue && (
                              <p className="sh-issue" data-status={s.issue.status}>
                                <Icon name={s.issue.status === 'open' ? 'flag' : 'check'} size={14} />
                                <span>
                                  {t(s.issue.status === 'open' ? 'sh.issue.isOpen' : 'sh.issue.resolved', { by: s.issue.by ?? t('common.unknownUser'), when: when(s.issue.at) })}
                                  {s.issue.ref ? ` ${t('sh.issue.inPlan')}` : ''}
                                </span>
                              </p>
                            )}

                            {s.canRun && s.applies && (
                              <div className="sh-step__actions">
                                {s.auto ? (
                                  <button type="button" className="btn btn--small btn--primary" onClick={() => void runStep(s)} disabled={!!busy} aria-busy={busy === s.id || undefined} data-tour={here ? 'setup-run' : undefined}>
                                    <Icon name="play" size={14} className="sh-flip" />
                                    {busy === s.id ? t('sh.test.running') : s.status === 'todo' ? t('sh.test.run') : t('sh.test.again')}
                                  </button>
                                ) : (
                                  <>
                                    {canLook(s) && (
                                      <button type="button" className="btn btn--small btn--primary" onClick={() => look(s)} data-tour={here ? 'setup-run' : undefined}>
                                        <Icon name="eye" size={14} />
                                        {t(`sh.test.${s.id}.look` as MessageKey, { name: String(s.detail.name ?? '') })}
                                      </button>
                                    )}
                                    {s.status !== 'pass' && (
                                      <button type="button" className="btn btn--small" onClick={() => void mark(s, 'pass')} disabled={!!busy}>
                                        {t('sh.test.worked')}
                                      </button>
                                    )}
                                    {s.status !== 'fail' && (
                                      <button type="button" className="btn btn--small btn--quiet" onClick={() => void mark(s, 'fail')} disabled={!!busy}>
                                        {t('sh.test.didnt')}
                                      </button>
                                    )}
                                  </>
                                )}
                                {(s.status === 'todo' || s.status === 'fail') && !s.required ? (
                                  <button type="button" className="btn btn--small btn--quiet" onClick={() => void mark(s, 'skipped')} disabled={!!busy}>
                                    {t('sh.test.skip')}
                                  </button>
                                ) : s.status !== 'todo' ? (
                                  <button type="button" className="btn btn--small btn--quiet" onClick={() => void mark(s, 'todo')} disabled={!!busy}>
                                    {t('sh.test.undo')}
                                  </button>
                                ) : null}
                              </div>
                            )}
                            {!s.applies && s.canRun && !s.required && s.status === 'todo' && (
                              <div className="sh-step__actions">
                                <button type="button" className="btn btn--small" onClick={() => navigate(s.fix)}>
                                  {t('sh.test.openFix')}
                                </button>
                                <button type="button" className="btn btn--small btn--quiet" onClick={() => void mark(s, 'skipped')} disabled={!!busy}>
                                  {t('sh.test.skip')}
                                </button>
                              </div>
                            )}

                            {older.length > 0 && (
                              <div className="sh-history">
                                <button type="button" className="sh-link" aria-expanded={history.has(s.id)} onClick={() => toggleHistory(s.id)}>
                                  {t('sh.run.history', { n: older.length })}
                                </button>
                                {history.has(s.id) && (
                                  <ul className="sh-history__list">
                                    {older.map((r) => (
                                      <li key={r.id} data-status={r.status}>
                                        <span className="sh-pill" data-status={r.status}>
                                          {t(`sh.test.status.${r.status}` as MessageKey)}
                                        </span>
                                        <span>{seenLine(s.id, r.status, r.seen, r.reason) ?? '—'}</span>
                                        <span className="muted">{t('sh.test.when', { when: whenTime(r.at), by: r.by ?? t('common.unknownUser') })}</span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            )}
                          </div>
                        </li>
                      );
                    })}
                </ol>
              </section>
            ))}

            {gate && gate.required > 0 && (
              <section className="sh-gate" aria-labelledby="sh-gate-title" data-ready={gateReady || undefined} data-tour="setup-gate">
                <div className="sh-gate__head">
                  <h3 className="sh-gate__title" id="sh-gate-title">
                    {t('sh.gate.title')}
                  </h3>
                  <span className="num">{t('sh.gate.required', { passed: gate.requiredPassed, total: gate.required })}</span>
                </div>
                <p className="sh-gate__lead muted">{data.doneAt ? t('sh.gate.doneLead', { when: when(data.doneAt) }) : gateReady ? t(gate.approvals.customer || gate.approvals.vendor ? 'sh.gate.readyOne' : 'sh.gate.ready') : t('sh.gate.waiting')}</p>
                <ol className="sh-gate__list">
                  {approvalRow('customer', gate.approvals.customer, gate.canApprove.customer)}
                  {approvalRow('vendor', gate.approvals.vendor, gate.canApprove.vendor)}
                </ol>
              </section>
            )}
          </>
        )}
      </div>
    </>
  );
}
