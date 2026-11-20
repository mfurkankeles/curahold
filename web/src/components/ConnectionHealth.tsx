// Settings → Connections: the health of every connection on one list (see the comment below).
import { useEffect, useState, type ReactNode } from 'react';
import type { MessageKey } from '../../../shared/src/i18n';
import type { Connection } from '../../../shared/src/model';
import type { WebhookInfo } from '../../../shared/src/developer';
import { get } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { navigate } from '../lib/router';
import { relativeTime } from '../lib/time';
import { PROVIDER_NAMES } from './Connections';
import { Icon } from './icons';
import { ConnectionTrouble } from './ConnectionTrouble';
import '../surfaces/admin.css';

/**
 * Every connection on one list, worst first: chat apps, channel webhooks, CRMs and
 * spreadsheets, support tools, calendars and developer webhooks — what each is,
 * whether it works, when it last did, and the way to it.
 */
export function ConnectionHealth({ list }: { list: Connection[] }) {
  const { t } = useI18n();
  const [dev, setDev] = useState<WebhookInfo[]>([]);
  useEffect(() => {
    get<{ webhooks: WebhookInfo[] }>('/dev/webhooks')
      .then((r) => setDev(r.webhooks))
      .catch(() => setDev([]));
  }, []);
  type Row = { id: string; name: string; kind: string; state: 'ok' | 'bad' | 'off'; line: ReactNode; to: string };
  const when = (at: string | null) => (at ? t('conn.health.lastOk', { when: relativeTime(at, t) }) : t('conn.health.never'));
  const rows: Row[] = [
    ...list.map((c): Row => {
      const failing = c.sync?.failing ?? 0;
      const bad = c.status === 'error' || c.sync?.lastRun?.status === 'error' || failing > 0;
      const name = c.provider === 'webhook' ? c.label : `${PROVIDER_NAMES[c.standsFor ?? c.provider] ?? PROVIDER_NAMES[c.provider] ?? c.provider}${c.label && c.label !== PROVIDER_NAMES[c.provider] ? ` · ${c.label}` : ''}`;
      return {
        id: c.id,
        name,
        kind: t(`conn.health.kind.${c.provider === 'webhook' ? 'channel' : c.kind}` as MessageKey),
        state: c.status === 'disabled' ? 'off' : bad ? 'bad' : 'ok',
        // A stopped connection says why in plain words, the vendor's text under it; a sync that is only waiting
        // out the service's rate limit says it resumes by itself.
        line:
          c.status === 'error' && c.lastError ? (
            <ConnectionTrouble app={name} message={c.lastError} code={c.kind === 'source' ? 'auth' : null} />
          ) : failing > 0 ? (
            t('conn.health.failing', { n: failing })
          ) : c.sync?.lastRun?.rateLimited ? (
            t('sync.rateWait')
          ) : (
            when(c.lastOkAt ?? c.sync?.lastRun?.at ?? null)
          ),
        to: c.kind === 'source' ? `/settings/sources/${c.id}` : '/settings/connections',
      };
    }),
    ...dev.map((h): Row => ({
      id: h.id,
      name: h.url.replace(/^https?:\/\//, ''),
      kind: t('conn.health.kind.dev'),
      state: !h.active ? 'off' : h.failures > 0 ? 'bad' : 'ok',
      line: h.failures > 0 ? t('conn.health.devFailing', { n: h.failures }) : when(h.lastAt),
      to: '/settings/developer',
    })),
  ];
  const rank = { bad: 0, ok: 1, off: 2 } as const;
  rows.sort((a, b) => rank[a.state] - rank[b.state]);
  const bad = rows.filter((r) => r.state === 'bad').length;
  return (
    <section className="health-list" aria-labelledby="conn-health">
      <div className="health-list__head">
        <h3 className="health-list__title" id="conn-health">
          {t('conn.health.title')}
        </h3>
        {rows.length > 0 && <p className="health-list__sum" data-bad={bad > 0 || undefined}>{bad ? t('conn.health.someBad', { bad, n: rows.length }) : t('conn.health.allGood', { n: rows.length })}</p>}
      </div>
      {rows.length === 0 ? (
        <p className="health-list__none">{t('conn.health.none')}</p>
      ) : (
        <ul className="health-list__rows">
          {rows.map((r) => (
            <li key={r.id} className="health-list__row" data-state={r.state}>
              <span className="health-list__dot" aria-hidden="true" />
              <span className="health-list__text">
                <span className="health-list__name">{r.name}</span>
                <span className="health-list__meta">
                  {r.kind}
                  {typeof r.line === 'string' && (
                    <>
                      {' · '}
                      <span className="health-list__line">{r.line}</span>
                    </>
                  )}
                </span>
                {typeof r.line !== 'string' && <span className="health-list__meta health-list__line">{r.line}</span>}
              </span>
              <span className="health-list__state">{r.state === 'bad' ? t('conn.problem') : r.state === 'off' ? t('conn.health.off') : t('conn.working')}</span>
              <a
                className="btn btn--small btn--quiet health-list__open"
                href={r.to}
                aria-label={`${t('conn.health.open')}: ${r.name}`}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(r.to);
                }}
              >
                <Icon name="chevronRight" size={16} />
                {t('conn.health.open')}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
