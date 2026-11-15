import { useI18n } from '../lib/i18n';
import { useAfter } from './Empty';

// What a screen shows while its code is on the way. Most waits are short: for
// the first 300 ms nothing is drawn (no flash). A longer wait shows a quiet
// skeleton the size of the screen it stands for, so nothing jumps when the
// screen arrives.
/** A whole-page wait (starting up, the sign-in page, sign-up, the desk): blank, then a quiet note. */
export function PageFallback() {
  const { t } = useI18n();
  const late = useAfter(300);
  return <div className="center-note muted" role="status" aria-live="polite" aria-label={late ? t('common.loading') : undefined} />;
}

/** A screen inside the app's frame: its title bar and a few rows, at their final size. */
export function RouteFallback() {
  const { t } = useI18n();
  const late = useAfter(300);
  if (!late) return <div className="route-wait" aria-hidden="true" />;
  return (
    <div className="route-wait" role="status" aria-live="polite" aria-label={t('common.loading')}>
      <header className="topbar route-wait__top">
        <i className="route-wait__title" />
      </header>
      <div className="page skeleton">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="skeleton__row">
            <i className="skeleton__rail" />
            <b className="skeleton__line" />
          </div>
        ))}
      </div>
    </div>
  );
}
