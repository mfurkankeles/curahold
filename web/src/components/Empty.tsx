// The five states every screen has, one family (docs/design/tokens.md, "Components"):
//   empty       — EmptyState: an invitation, what goes here and one first step.
//   loading     — SkeletonRows / SkeletonCards (and RouteFallback): nothing for 300 ms,
//                 then the content's shape at its final size, so nothing moves.
//   error       — ErrorState (LoadError inline): what happened, what to do, Try again.
//   offline     — OfflineBar: changes are kept and sent when the connection is back.
//   not allowed — NotAllowed: what is missing and who can give it.
import { Fragment, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useI18n } from '../lib/i18n';
import { useStore } from '../lib/store';
import { useOnline } from '../lib/pwa';
import { changesWaiting, onChangesWaiting } from '../lib/api';
import { navigate } from '../lib/router';
import { useLoadingMark } from '../lib/loading';
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

/** The standard empty state: icon, title, text and actions. */
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
  useLoadingMark();
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
  useLoadingMark();
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

/** A dashboard waiting for its figures: a row of tiles over chart panes (home, reports, dashboards). */
export function SkeletonDash({ tiles = 4, panes = 2, label }: { tiles?: number; panes?: number; label: string }) {
  useLoadingMark();
  return (
    <div className="skeleton skeleton--dash" role="status" aria-label={label}>
      <div className="skeleton__tiles">
        {Array.from({ length: tiles }, (_, i) => (
          <div key={i} className="skeleton__tile">
            <i className="u-width-38pc" />
            <i className="skeleton__big" />
          </div>
        ))}
      </div>
      <div className="skeleton__panes">
        {Array.from({ length: panes }, (_, i) => (
          <div key={i} className="skeleton__pane">
            <i className="skeleton__line" />
            <i className="skeleton__chart" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** A side panel waiting for its record: the title, the fields box, the main button and two sections. */
export function SkeletonPanel({ label }: { label: string }) {
  useLoadingMark();
  return (
    <div className="skeleton skeleton--panel" role="status" aria-label={label}>
      <i className="skeleton__heading" />
      <div className="skeleton__props">
        {Array.from({ length: 4 }, (_, i) => (
          <Fragment key={i}>
            <i />
            <b />
          </Fragment>
        ))}
      </div>
      <i className="skeleton__button" />
      <i className="u-width-38pc" />
      <i className="skeleton__block" />
      <i className="u-width-38pc" />
      <i className="skeleton__line" />
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
            <Icon name="refresh" size={16} />
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
            <Icon name="refresh" size={16} />
            {t('common.retry')}
          </button>
        )}
        {onReload && (
          <button className="btn btn--primary" onClick={onReload}>
            <Icon name="refresh" size={16} />
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
          <Icon name="home" size={16} />
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
