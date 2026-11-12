// Inbox: everything that was sent to you, in one list. Read it, open it,
// or clear it; filters keep mentions, new tasks and comments apart.
import { useCallback, useEffect, useState } from 'react';
import type { Notification } from '../../../shared/src/model';
import { EmptyState, SkeletonRows } from '../components/Empty';
import { Icon, type IconName } from '../components/icons';
import { Avatar } from '../components/ui';
import { get, post } from '../lib/api';
import { useLive } from '../lib/live';
import { useI18n } from '../lib/i18n';
import { navigate } from '../lib/router';
import { useStore } from '../lib/store';
import { relativeTime } from '../lib/time';

const FILTERS = ['all', 'mentions', 'assigned', 'comments', 'system'] as const;
type Filter = (typeof FILTERS)[number];
const KIND_ICON: Record<string, IconName> = { stale: 'hourglass', escalated: 'alert', assigned: 'checkCircle', mentioned: 'at', comment: 'comment', followed: 'eye', unblocked: 'play', automation: 'zap', digest: 'sun', weekly: 'chart', join_request: 'user' };

export function InboxPage() {
  const { t } = useI18n();
  const { person } = useStore();
  const [filter, setFilter] = useState<Filter>('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [data, setData] = useState<{ notifications: Notification[]; unread: number; more: boolean } | null>(null);
  const load = useCallback(
    async (before?: string) => {
      const p = new URLSearchParams({ filter, limit: '40' });
      if (unreadOnly) p.set('unread', '1');
      if (before) p.set('before', before);
      const r = await get<{ notifications: Notification[]; unread: number; more: boolean }>(`/notifications?${p}`);
      setData((d) => (before && d ? { ...r, notifications: [...d.notifications, ...r.notifications] } : r));
      window.dispatchEvent(new Event('app:inbox-changed'));
    },
    [filter, unreadOnly],
  );
  useEffect(() => {
    setData(null);
    void load();
  }, [load]);
  const paged = (data?.notifications.length ?? 0) > 40;
  useLive('unread', (p) => {
    if (!paged && p.unread !== data?.unread) void load();
  });

  const mark = async (n: Notification, unread: boolean) => {
    setData((d) => (d ? { ...d, unread: Math.max(0, d.unread + (unread ? 1 : -1)), notifications: d.notifications.map((x) => (x.id === n.id ? { ...x, readAt: unread ? null : new Date().toISOString() } : x)) } : d));
    await post('/notifications/read', { ids: [n.id], unread }).catch(() => undefined);
    window.dispatchEvent(new Event('app:inbox-changed'));
  };
  const open = async (n: Notification) => {
    if (!n.readAt) void mark(n, false);
    if (n.url) {
      const u = new URL(n.url, location.origin);
      navigate(u.pathname + u.search);
    }
  };
  const readAll = async () => {
    await post('/notifications/read', { all: true }).catch(() => undefined);
    await load();
  };
  // Grouped by day, newest first.
  const groups: { key: string; label: string; list: Notification[] }[] = [];
  const dayLabel = (iso: string) => {
    const d = new Date(iso);
    const today = new Date();
    const diff = Math.round((new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86_400_000);
    return diff <= 0 ? t('inbox.today') : diff === 1 ? t('inbox.yesterday') : diff < 7 ? t('inbox.thisWeek') : t('inbox.earlier');
  };
  for (const n of data?.notifications ?? []) {
    const label = dayLabel(n.createdAt);
    const g = groups[groups.length - 1];
    if (g && g.label === label) g.list.push(n);
    else groups.push({ key: `${label}:${groups.length}`, label, list: [n] });
  }
  return (
    <>
      <header className="topbar">
        <div className="topbar__titles">
          <h1 className="topbar__title">{t('nav.inbox')}</h1>
          {data && <p className="topbar__sub">{data.unread ? t('inbox.unreadN', { n: data.unread }) : t('inbox.allRead')}</p>}
        </div>
        <div className="topbar__spacer" />
        <button className="btn btn--quiet" onClick={() => navigate('/profile')}>
          <Icon name="sliders" size={16} />
          <span className="hide-phone">{t('inbox.settings')}</span>
        </button>
        <button className="btn" disabled={!data?.unread} onClick={readAll}>
          <Icon name="check" size={16} />
          {t('bell.readAll')}
        </button>
      </header>
      <div className="page inbox">
        <div className="toolbar inbox__bar">
          <div className="seg" role="tablist" aria-label={t('inbox.filter')}>
            {FILTERS.map((f) => (
              <button key={f} role="tab" aria-selected={filter === f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {t(`inbox.filter.${f}` as any)}
              </button>
            ))}
          </div>
          <label className="checkbox">
            <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />
            <span>{t('inbox.unreadOnly')}</span>
          </label>
        </div>
        {!data ? (
          <SkeletonRows rows={7} label={t('common.loading')} />
        ) : data.notifications.length === 0 ? (
          <EmptyState icon="inbox" tone="done" title={unreadOnly || filter !== 'all' ? t('inbox.noneHere') : t('inbox.empty')} body={unreadOnly || filter !== 'all' ? undefined : t('inbox.emptyBody')} />
        ) : (
          <>
            {groups.map((g) => (
              <section key={g.key} className="inbox__group">
                <h2 className="inbox__day">{g.label}</h2>
                <ul className="inbox__list">
                  {g.list.map((n) => (
                    <li key={n.id} className="inbox__item" data-unread={!n.readAt || undefined}>
                      <button className="inbox__main" onClick={() => open(n)}>
                        <span className="inbox__icon" data-kind={n.kind} aria-hidden="true">
                          {n.actorId && person(n.actorId) ? <Avatar person={person(n.actorId)} large /> : <Icon name={KIND_ICON[n.kind] ?? 'bell'} size={18} />}
                        </span>
                        <span className="inbox__text">
                          <strong className="inbox__title">{n.title}</strong>
                          {n.body && <span className="inbox__body">{n.body}</span>}
                        </span>
                        <time className="inbox__time" dateTime={n.createdAt}>
                          {relativeTime(n.createdAt, t)}
                        </time>
                      </button>
                      <button className="btn btn--quiet btn--icon btn--small inbox__mark" title={n.readAt ? t('inbox.markUnread') : t('inbox.markRead')} aria-label={n.readAt ? t('inbox.markUnread') : t('inbox.markRead')} onClick={() => mark(n, !!n.readAt)}>
                        <Icon name={n.readAt ? 'dot' : 'check'} size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {data.more && (
              <button className="btn inbox__more" onClick={() => load(data.notifications[data.notifications.length - 1].createdAt)}>
                {t('inbox.more')}
              </button>
            )}
          </>
        )}
      </div>
    </>
  );
}
