import { PageIcon } from '../components/icons';
import { useEffect, useState } from 'react';
import type { SessionInfo } from '../../../shared/src/model';
import { LoadError, SkeletonRows } from '../components/Empty';
import { ApiFailure, del, get } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useSaver } from '../lib/saver';
import { relativeTime } from '../lib/time';

export function DevicesPage() {
  const { t } = useI18n();
  const save = useSaver();
  const [data, setData] = useState<{ sessions: SessionInfo[]; maxDevices: number } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const load = () => {
    setFailed(null);
    return get<{ sessions: SessionInfo[]; maxDevices: number }>('/me/sessions').then(setData, (e) => setFailed(e instanceof ApiFailure ? e.body.message : t('errors.loadFailed')));
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
      <header className="topbar">
        <h1 className="topbar__title topbar__title--icon">
          <PageIcon name="monitor" />
          <span>{t('devices.title')}</span>
        </h1>
      </header>
      <div className="page">
        <div className="sheet" style={{ maxWidth: 640 }}>
          {!data && !failed && <SkeletonRows rows={3} label={t('common.loading')} />}
          {failed && <LoadError message={failed} onRetry={() => void load()} />}
          {data && <p className="sheet__hint">{t('devices.hint', { max: data.maxDevices })}</p>}
          {data?.sessions.map((s) => (
            <div key={s.id} className="filerow" style={{ borderTop: '1px solid var(--line)', padding: '12px 0' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500 }}>
                  {s.deviceLabel || t('devices.unknown')} {s.current && <span className="badge badge--active">{t('devices.thisDevice')}</span>}
                </div>
                <div className="muted" style={{ fontSize: 13 }}>
                  {t('devices.lastSeen', { when: relativeTime(s.lastSeenAt, t) })}
                </div>
              </div>
              <button
                className="btn btn--small"
                onClick={async () => {
                  if (!(await save(() => del(`/me/sessions/${s.id}`), false))) return;
                  if (s.current) location.href = '/login';
                  else void load();
                }}
              >
                {t('devices.signOut')}
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
