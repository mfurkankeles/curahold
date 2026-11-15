// The five states every screen has, one family (docs/design/tokens.md, "Components"):
//   empty       — EmptyState: an invitation, what goes here and one first step.
//   loading     — SkeletonRows / SkeletonCards (and RouteFallback): nothing for 300 ms,
//                 then the content's shape at its final size, so nothing moves.
//   error       — ErrorState (LoadError inline): what happened, what to do, Try again.
//   offline     — OfflineBar: changes are kept and sent when the connection is back.
//   not allowed — NotAllowed: what is missing and who can give it.
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useI18n } from '../lib/i18n';
import { useStore } from '../lib/store';
import { useOnline } from '../lib/pwa';
import { changesWaiting, onChangesWaiting } from '../lib/api';
import { navigate } from '../lib/router';
import { Icon, type IconName } from './icons';

/** True once `ms` have passed since the first render: a short wait shows nothing at all. */
export function useAfter(ms: number) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setOn(true), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return on;
}

export function EmptyState({ icon, title, body, children, tone, compact }: { icon: IconName; title: string; body?: ReactNode; children?: ReactNode; tone?: 'calm' | 'done'; compact?: boolean }) {
  return (
    <div className="emptystate" data-tone={tone} data-compact={compact || undefined}>
      <span className="emptystate__icon" aria-hidden="true">
        <Icon name={icon} size={compact ? 20 : 24} />
      </span>
      <h2 className="emptystate__title">{title}</h2>
      {body && <p className="emptystate__body">{body}</p>}
      {children && <div className="emptystate__actions">{children}</div>}
    </div>
  );
}

/** Rows of placeholder lines in the shape of a list. */
export function SkeletonRows({ rows = 6, label }: { rows?: number; label: string }) {
  return (
    <div className="skeleton" role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton__row">
          <i className="skeleton__rail" />
          <i className="skeleton__line" />
          <i className="skeleton__end" />
        </div>
      ))}
    </div>
  );
}

/** Placeholder cards (customer cards, board columns). */
export function SkeletonCards({ count = 6, label, columns }: { count?: number; label: string; columns?: boolean }) {
  return (
    <div className={columns ? 'skeleton skeleton--columns' : 'skeleton skeleton--cards'} role="status" aria-label={label}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton__card">
          <i className="skeleton__line" />
          <i className="u-width-38pc" />
          {!columns && <i className="u-width-64pc" />}
          {columns && (
            <>
              <b />
              <b />
              {i % 2 === 0 && <b />}
            </>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Something failed: what happened, what to do, and a way to try again. `compact` is the
 * inline line inside a screen (a list that did not load); otherwise a centred block for a
 * whole screen or the page.
 */
export function ErrorState({ title, body, onRetry, onReload, compact, className }: { title?: string; body?: string | null; onRetry?: () => void; onReload?: () => void; compact?: boolean; className?: string }) {
  const { t } = useI18n();
  if (compact)
    return (
      <div className="notice notice--error u-display-flex u-gap-12 u-align-items-center u-flex-wrap-wrap" role="alert">
        <span className="u-flex-1 u-min-width-200">{body || t('errors.loadFailed')}</span>
        {onRetry && (
          <button className="btn btn--small" onClick={onRetry}>
            {t('common.retry')}
          </button>
        )}
      </div>
    );
  return (
    <div className={`errorbox${className ? ` ${className}` : ''}`} role="alert">
      <span className="emptystate__icon" data-tone="late" aria-hidden="true">
        <Icon name="alert" size={24} />
      </span>
      <h2 className="u-m-0 u-fs-l">{title ?? t('errors.boundary.title')}</h2>
      <p className="muted u-m-0">{body || t('errors.loadFailed')}</p>
      <div className="inline-actions u-justify-content-center">
        {onRetry && (
          <button className="btn" onClick={onRetry}>
            {t('common.retry')}
          </button>
        )}
        {onReload && (
          <button className="btn btn--primary" onClick={onReload}>
            {t('errors.boundary.reload')}
          </button>
        )}
      </div>
    </div>
  );
}

/** A load that failed — said so, with a way to try again, instead of passing for an empty list. */
export function LoadError({ message, onRetry }: { message?: string | null; onRetry: () => void }) {
  return <ErrorState compact body={message} onRetry={onRetry} />;
}

/** A screen this person may not open: what is missing, and who can give it. */
export function NotAllowed({ what }: { what?: string }) {
  const { t } = useI18n();
  const { me } = useStore();
  return (
    <div className="emptystate" data-tone="calm" role="status">
      <span className="emptystate__icon" aria-hidden="true">
        <Icon name="lock" size={24} />
      </span>
      <h2 className="emptystate__title">{what ?? t('states.notAllowed.title')}</h2>
      <p className="emptystate__body">{t('states.notAllowed.body', { org: me.org.name })}</p>
      <div className="emptystate__actions">
        <button className="btn" onClick={() => navigate('/home')}>
          {t('states.notAllowed.home')}
        </button>
      </div>
    </div>
  );
}

/**
 * Offline: the bar over every screen. Changes made now are not lost — the API holds each
 * one in this tab and sends it, with its key, when the connection is back — and the bar
 * says so, with how many are waiting.
 */
export function OfflineBar() {
  const { t } = useI18n();
  const online = useOnline();
  const waiting = useSyncExternalStore(onChangesWaiting, changesWaiting, () => 0);
  if (online && !waiting) return null;
  return (
    <div className="offlinebar" role="status" aria-live="polite">
      <Icon name={online ? 'refresh' : 'alert'} size={16} />
      <span>{online ? t('states.sending') : t('states.offline')}</span>
      {waiting > 0 && <span className="offlinebar__count num">{t('states.waiting', { n: waiting })}</span>}
    </div>
  );
}
