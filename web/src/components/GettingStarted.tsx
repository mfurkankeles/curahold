// "Getting started" on Home: six first steps, each ticked off by doing it
// (not by clicking a box), each with the button that does it.
import { useEffect, useState } from 'react';
import type { StartStep } from '../../../shared/src/model';
import { get, patch } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { navigate } from '../lib/router';
import { TASKS_CHANGED, useShell } from '../lib/shell';
import { useStore } from '../lib/store';
import { Icon, type IconName } from './icons';

const ICONS: Record<StartStep, IconName> = { task: 'checkCircle', planned: 'calendar', touch: 'phone', mention: 'at', calendar: 'link', notify: 'bell' };

export function GettingStarted() {
  const { t, locale } = useI18n();
  const { canWrite, me } = useStore();
  const shell = useShell();
  const [state, setState] = useState<{ steps: Record<StartStep, boolean>; hidden: boolean } | null>(null);
  useEffect(() => {
    const load = () => void get<{ steps: Record<StartStep, boolean>; hidden: boolean }>('/me/start').then(setState, () => undefined);
    load();
    window.addEventListener(TASKS_CHANGED, load);
    window.addEventListener('focus', load);
    return () => {
      window.removeEventListener(TASKS_CHANGED, load);
      window.removeEventListener('focus', load);
    };
  }, []);
  if (!state || state.hidden || me.previewBy) return null;
  const steps: StartStep[] = canWrite ? ['task', 'planned', 'touch', 'mention', 'calendar', 'notify'] : ['calendar', 'notify'];
  const done = steps.filter((s) => state.steps[s]).length;
  if (done === steps.length) return null;
  const example = locale === 'tr' ? 'Teklifi yarın gönder @ben' : 'Send the proposal tomorrow @me';
  const act: Record<StartStep, () => void> = {
    task: () => shell.quickAdd(),
    planned: () => shell.quickAdd({ text: example }),
    touch: () => shell.logTouch(),
    mention: () => navigate('/my'),
    calendar: () => navigate('/profile'),
    notify: () => navigate('/profile'),
  };
  const hide = async () => {
    setState({ ...state, hidden: true });
    await patch('/me', { prefs: { startHidden: true } }).catch(() => undefined);
  };
  return (
    <section className="start" aria-labelledby="start-title">
      <header className="start__head">
        <div>
          <h2 className="start__title" id="start-title">
            <Icon name="flag" size={18} className="icon--lead" />
            {t('start.title')}
          </h2>
          <p className="start__lead">{t('start.lead')}</p>
        </div>
        <span className="start__count num" aria-label={t('start.progress', { done, all: steps.length })}>
          {done}/{steps.length}
        </span>
        <button className="btn btn--quiet btn--small" onClick={hide}>
          {t('start.hide')}
        </button>
      </header>
      <div className="start__meter" aria-hidden="true">
        {steps.map((s) => (
          <i key={s} data-done={state.steps[s] || undefined} />
        ))}
      </div>
      <ol className="start__steps">
        {steps.map((s) => (
          <li key={s} className="start__step" data-done={state.steps[s] || undefined}>
            <span className="start__mark" aria-hidden="true">
              <Icon name={state.steps[s] ? 'check' : ICONS[s]} size={16} />
            </span>
            <span className="start__text">
              <strong>{t(`start.${s}.title` as any)}</strong>
              <span className="muted">{t(`start.${s}.body` as any)}</span>
            </span>
            {state.steps[s] ? (
              <span className="sr-only">{t('start.done')}</span>
            ) : (
              <button className="btn btn--small" onClick={act[s]}>
                {t(`start.${s}.go` as any)}
              </button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
