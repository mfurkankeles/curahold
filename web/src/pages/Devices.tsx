// The person's own signed-in devices, with signing one out. Uses GET/DELETE /api/me/sessions.
import { PageIcon } from '../components/icons';
import { useEffect, useState } from 'react';
import type { SessionInfo } from '../../../shared/src/model';
import { LoadError, SkeletonRows } from '../components/Empty';
import { ApiFailure, del, get } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useSaver } from '../lib/saver';
import { relativeTime } from '../lib/time';
import { post } from '../lib/api';
import { SignInSecurity } from '../components/SignInSecurity';
import { Icon } from '../components/icons';

/** The person's signed-in devices and the company's device limit. */
export function DevicesPage() {
  const { t } = useI18n();
  const save = useSaver();
  const [data, setData] = useState<{ sessions: SessionInfo[]; maxDevices: number } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const load = () => {
    setFailed(null);
    return get<{ sessions: SessionInfo[]; maxDevices: number }>('/me/sessions').then(setData, (e) =>
      setFailed(e instanceof ApiFailure ? e.body.message : t('errors.loadFailed')),
    );
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
        <div className="form">
          <div className="sheet u-max-width-640">
            {!data && !failed && <SkeletonRows rows={3} label={t('common.loading')} />}
            {failed && <LoadError message={failed} onRetry={() => void load()} />}
            {data && <p className="sheet__hint">{t('devices.hint', { max: data.maxDevices })}</p>}
            {data?.sessions.map((s) => (
              <div key={s.id} className="filerow filerow--ruled">
                <div className="u-flex-1">
                  <div className="u-font-weight-500">
                    {s.deviceLabel || t('devices.unknown')} {s.current && <span className="badge badge--active">{t('devices.thisDevice')}</span>}
                  </div>
                  <div className="muted u-fs-s">
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
                  <Icon name="logout" size={16} />
                  {t('devices.signOut')}
                </button>
              </div>
            ))}
            {data && data.sessions.length > 1 && (
              <div className="toolbar">
                <button
                  className="btn btn--small"
                  onClick={async () => {
                    let n = 0;
                    if (await save(async () => (n = (await post<{ signedOut: number }>('/me/sessions/sign-out-others', {})).signedOut), false)) {
                      setNote(t('sec.signedOutOthers', { n }));
                      void load();
                    }
                  }}
                >
                  <Icon name="logout" size={16} />
                  {t('sec.signOutOthers')}
                </button>
                {note && <span className="muted">{note}</span>}
              </div>
            )}
          </div>
          <div className="sheet">
            <SignInSecurity />
          </div>
        </div>
      </div>
    </>
  );
}
