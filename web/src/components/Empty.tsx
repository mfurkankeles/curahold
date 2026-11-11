// An empty screen is an invitation: say what goes here and offer the first
// step. While something loads, its shape shows instead of a word.
import type { ReactNode } from 'react';
import { Icon, type IconName } from './icons';

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
          <i style={{ width: `${46 + ((i * 37) % 38)}%` }} />
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
          <i style={{ width: `${52 + ((i * 29) % 36)}%` }} />
          <i style={{ width: '38%' }} />
          {!columns && <i style={{ width: '64%' }} />}
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
