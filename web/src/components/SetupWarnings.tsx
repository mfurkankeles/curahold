// A screen's own setup warnings: the failing checks whose fix is this very
// screen (an import, the CRM sync, a connector, the portal…), said calmly,
// each with what to do. Nothing is fixed for the person; the panel has the rest.
import { useState } from 'react';
import { bySeverity } from '../../../shared/src/setupHealth';
import { useI18n } from '../lib/i18n';
import { navigate } from '../lib/router';
import { checksFor, seesSetup, useSetupHealth } from '../lib/setupHealth';
import { useStore } from '../lib/store';
import { Icon } from './icons';
import '../surfaces/setup.css';

export function SetupWarnings({ path }: { path: string }) {
  const { t } = useI18n();
  const { me } = useStore();
  const on = seesSetup(me.user.perms, !!me.owner) && !me.previewBy;
  const data = useSetupHealth(on);
  const [open, setOpen] = useState(false);
  const list = bySeverity(checksFor(data, path));
  if (!on || !list.length) return null;
  const shown = open ? list : list.slice(0, 2);
  return (
    <aside className="sh-warn" aria-labelledby="sh-warn-title" data-tour="setup-warning">
      <div className="sh-warn__head">
        <Icon name="lifebuoy" size={16} className="sh-warn__icon" />
        <h3 className="sh-warn__title" id="sh-warn-title">
          {t('sh.warn.title', { n: list.length })}
        </h3>
        <button type="button" className="btn btn--quiet btn--small" onClick={() => navigate('/setup-health')}>
          <Icon name="arrowRight" size={16} />
          {t('sh.warn.all')}
        </button>
      </div>
      <ul className="sh-warn__list">
        {shown.map((c) => (
          <li key={c.id} className="sh-warn__item" data-sev={c.severity}>
            <span className="sh-dot" aria-hidden="true" />
            <span className="sh-warn__text">
              <strong>{c.problem}</strong>
              <span className="muted">{c.why}</span>
            </span>
            {c.fix !== path && (
              <button type="button" className="btn btn--small" onClick={() => navigate(c.fix)}>
                <Icon name="arrowRight" size={16} />
                {c.fixLabel}
              </button>
            )}
          </li>
        ))}
      </ul>
      {list.length > shown.length && (
        <button type="button" className="sh-warn__more" onClick={() => setOpen(true)}>
          {t('sh.warn.more', { n: list.length - shown.length })}
        </button>
      )}
    </aside>
  );
}

/** The way in from the setup wizard (the getting-started area): check what is missing, then test it. */
export function SetupEntry() {
  const { t } = useI18n();
  const data = useSetupHealth();
  return (
    <nav className="sh-entry" aria-label={t('sh.entry.title')} data-tour="setup-entry">
      <strong>{t('sh.entry.title')}</strong>
      <button type="button" className="sh-entry__link" onClick={() => navigate('/setup-health')}>
        <Icon name="lifebuoy" size={16} />
        <span>{t('sh.entry.health')}</span>
        {!!data?.failing && <span className="sh-entry__n num">{data.failing}</span>}
      </button>
      <button type="button" className="sh-entry__link" onClick={() => navigate('/setup-test')}>
        <Icon name="checkCircle" size={16} />
        <span>{t('sh.entry.test')}</span>
      </button>
    </nav>
  );
}
