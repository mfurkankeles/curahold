// "Setup health": what we noticed in the company's setup that this person can
// fix, worst first and grouped by area, each with why it matters and the one
// screen that fixes it. Calm on purpose: nothing here is an emergency, and
// nothing changes until the person clicks.
import { useEffect, useState } from 'react';
import type { MessageKey } from '../../../shared/src/i18n';
import { SETUP_AREAS, type SetupArea, type SetupCheckResult } from '../../../shared/src/setupHealth';
import { EmptyState, SkeletonRows } from '../components/Empty';
import { Icon, PageIcon } from '../components/icons';
import { post } from '../lib/api';
import { docsHref, docsLink } from '../lib/docs';
import { formatDate } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { navigate } from '../lib/router';
import { checkSetupHealth, fixTarget, setupChanged, useSetupHealth } from '../lib/setupHealth';
import { useStore } from '../lib/store';
import { helpLanguageOf } from '../../../shared/src/i18n';
import '../surfaces/setup.css';

/** Setup health: every check with its status and what to do (ADR 0013). */
export function SetupHealthPage() {
  const { t, locale } = useI18n();
  const data = useSetupHealth();
  const [checking, setChecking] = useState(false);
  const [showFixed, setShowFixed] = useState(false);

  const { canWrite } = useStore();
  const again = async () => {
    setChecking(true);
    if (canWrite) await checkSetupHealth();
    else setupChanged();
    setChecking(false);
  };
  // Opening the panel checks now and remembers what failed, so "x of y fixed" counts every find.
  useEffect(() => {
    if (canWrite) void checkSetupHealth();
  }, [canWrite]);
  const confirm = async (c: SetupCheckResult, done: boolean) => {
    await post(`/setup-health/${encodeURIComponent(c.id)}/confirm`, { done });
    setupChanged();
  };
  const open = (c: SetupCheckResult) => {
    const to = fixTarget(c.fix, locale);
    if (to.external) window.open(to.href, '_blank', 'noreferrer');
    else navigate(to.href);
  };

  const failing = data?.checks.filter((c) => c.status === 'fail') ?? [];
  const fixed = data?.checks.filter((c) => c.status === 'ok' && (c.fixed || c.confirmed)) ?? [];
  const areas = SETUP_AREAS.filter((a) => failing.some((c) => c.area === a));
  // Areas in the order of their worst problem, so the first thing on the page is the first thing to do.
  const rank = (a: SetupArea) => failing.findIndex((c) => c.area === a);
  areas.sort((a, b) => rank(a) - rank(b));
  const helpHref = docsHref(`${helpLanguageOf(locale)}/setup-health`);

  return (
    <>
      <header className="topbar">
        <div className="topbar__titles topbar__titles--icon">
          <PageIcon name="lifebuoy" />
          <h1 className="topbar__title">{t('sh.title')}</h1>
          {data && data.found > 0 && <p className="topbar__sub">{t('sh.progress', { fixed: data.fixed, found: data.found })}</p>}
        </div>
        <div className="topbar__spacer" />
        <button className="btn btn--quiet btn--small" onClick={() => navigate('/setup-test')} data-tour="setup-test-link">
          <Icon name="checkCircle" size={16} />
          {t('sh.toTest')}
        </button>
      </header>
      <div className="page sh-page">
        {!data ? (
          <SkeletonRows rows={5} label={t('common.loading')} />
        ) : (
          <>
            <section className="sh-summary" data-state={failing.length ? 'some' : 'none'} aria-live="polite">
              <div className="sh-summary__text">
                <h2 className="sh-summary__title">{failing.length ? t('sh.summary.some', { n: failing.length }) : t('sh.summary.none')}</h2>
                <p className="sh-summary__lead">{failing.length ? t('sh.summary.lead') : t('sh.summary.noneLead')}</p>
              </div>
              {data.found > 0 && (
                <div className="sh-meter" role="img" aria-label={t('sh.progress', { fixed: data.fixed, found: data.found })}>
                  <span className="sh-meter__fill" style={{ inlineSize: `${Math.round((data.fixed / data.found) * 100)}%` }} />
                </div>
              )}
              <div className="sh-summary__foot">
                <span className="muted">
                  {t('sh.checkedAt', { when: formatDate(data.checkedAt, locale, { hour: 'numeric', minute: '2-digit' }) })}
                  {data.dailyAt ? ` · ${t('sh.dailyAt', { when: formatDate(data.dailyAt, locale) })}` : ''}
                </span>
                <button className="btn btn--small" onClick={again} disabled={checking} aria-busy={checking || undefined} data-tour="setup-recheck">
                  <Icon name="refresh" size={16} />
                  {t('sh.again')}
                </button>
                <a className="btn btn--quiet btn--small" href={helpHref} {...docsLink}>
                  {t('sh.help')}
                </a>
              </div>
            </section>

            {!data.checks.length && <EmptyState icon="shield" title={t('sh.nothing.title')} body={t('sh.nothing.body')} compact />}
            {data.checks.length > 0 && !failing.length && (
              <EmptyState icon="checkCircle" tone="done" title={t('sh.allGood.title')} body={t('sh.allGood.body')}>
                <button className="btn btn--primary" onClick={() => navigate('/setup-test')}>
                  <Icon name="arrowRight" size={16} />
                  {t('sh.toTest')}
                </button>
              </EmptyState>
            )}

            {areas.map((a) => {
              const list = failing.filter((c) => c.area === a);
              return (
                <section key={a} className="sh-area" aria-labelledby={`sh-area-${a}`}>
                  <h3 className="sh-area__title" id={`sh-area-${a}`}>
                    {t(`sh.area.${a}` as MessageKey)}
                    <span className="sh-area__n num">{list.length}</span>
                  </h3>
                  <ul className="sh-list">
                    {list.map((c, i) => (
                      <li key={c.id} className="sh-item" data-sev={c.severity} data-tour={i === 0 && a === areas[0] ? 'setup-first' : undefined}>
                        <span className="sh-item__sev">
                          <span className="sh-dot" aria-hidden="true" />
                          <span>{t(`sh.sev.${c.severity}` as MessageKey)}</span>
                          {c.isNew && <span className="sh-tag">{t('sh.new')}</span>}
                        </span>
                        <div className="sh-item__body">
                          <strong className="sh-item__problem">{c.problem}</strong>
                          <p className="sh-item__why">{c.why}</p>
                        </div>
                        <div className="sh-item__actions">
                          <button type="button" className="btn btn--small btn--primary" onClick={() => open(c)} data-tour={i === 0 && a === areas[0] ? 'setup-fix' : undefined}>
                            {c.fixLabel}
                            <Icon name={fixTarget(c.fix, locale).external ? 'external' : 'arrowRight'} size={14} className="sh-flip" />
                          </button>
                          {c.manual && (
                            <button type="button" className="btn btn--small btn--quiet" onClick={() => void confirm(c, true)}>
                              <Icon name="check" size={16} />
                              {t('sh.confirm')}
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}

            {fixed.length > 0 && (
              <section className="sh-fixed" aria-labelledby="sh-fixed-title">
                <button type="button" className="sh-fixed__toggle" aria-expanded={showFixed} onClick={() => setShowFixed((v) => !v)} id="sh-fixed-title">
                  <Icon name={showFixed ? 'chevronDown' : 'chevronRight'} size={16} className="sh-flip" />
                  {t('sh.fixedList', { n: fixed.length })}
                </button>
                {showFixed && (
                  <ul className="sh-list sh-list--done">
                    {fixed.map((c) => (
                      <li key={c.id} className="sh-item sh-item--done">
                        <span className="sh-item__sev">
                          <Icon name="check" size={16} />
                        </span>
                        <div className="sh-item__body">
                          <span className="sh-item__problem">{c.problem}</span>
                          {c.confirmed && (
                            <p className="sh-item__why">
                              {t('sh.confirmedBy', { by: c.confirmed.by ?? t('common.unknownUser'), when: formatDate(c.confirmed.at, locale) })}{' '}
                              <button type="button" className="sh-link" onClick={() => void confirm(c, false)}>
                                {t('sh.unconfirm')}
                              </button>
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </>
  );
}
