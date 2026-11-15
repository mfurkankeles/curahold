// Settings → Sign-in: who must use a second step after the emailed link, who
// has one, and resetting someone's (a lost phone). Enforced on the server.
import { useEffect, useState } from 'react';
import { SECOND_STEP_POLICIES, type PersonSecurity, type SecondStepPolicy } from '../../../shared/src/identity';
import { ApiFailure, del, get, put } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useSaver } from '../lib/saver';
import { useStore } from '../lib/store';
import { LoadError, SkeletonRows } from './Empty';
import { Confirm } from './ui';

export function CompanySecurity() {
  const { t } = useI18n();
  const save = useSaver();
  const { me } = useStore();
  const [data, setData] = useState<{ policy: SecondStepPolicy; people: PersonSecurity[] } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [resetting, setResetting] = useState<PersonSecurity | null>(null);
  const load = () => {
    setFailed(null);
    return get<{ policy: SecondStepPolicy; people: PersonSecurity[] }>('/admin/security').then(setData, (e) => setFailed(e instanceof ApiFailure ? e.body.message : t('errors.loadFailed')));
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const without = data?.people.filter((p) => !p.totp && !p.passkeys) ?? [];

  return (
    <div className="form">
      <div className="sheet">
        <h2 className="sheet__title">{t('sec.policy.title')}</h2>
        <p className="sheet__hint">{t('sec.policy.hint')}</p>
        {!data && !failed && <SkeletonRows rows={2} label={t('common.loading')} />}
        {failed && <LoadError message={failed} onRetry={() => void load()} />}
        {data && (
          <label className="field">
            <span className="field__label">{t('sec.policy.who')}</span>
            <select
              className="select"
              value={data.policy}
              onChange={async (e) => {
                const policy = e.target.value as SecondStepPolicy;
                if (await save(() => put('/admin/security', { secondStep: policy }))) setData({ ...data, policy });
              }}
            >
              {SECOND_STEP_POLICIES.map((p) => (
                <option key={p} value={p}>
                  {t(`sec.policy.${p}`)}
                </option>
              ))}
            </select>
            {data.policy !== 'off' && without.length > 0 && <span className="field__hint">{t('sec.policy.without', { n: without.length })}</span>}
          </label>
        )}
      </div>
      {data && (
        <div className="sheet">
          <h2 className="sheet__title">{t('sec.policy.people')}</h2>
          <ul className="keylist">
            {data.people.map((p) => (
              <li className="keyrow" key={p.id}>
                <div className="keyrow__main">
                  <div>{p.name}</div>
                  <div className="muted">
                    {[p.totp ? t('sec.app') : null, p.passkeys ? t('sec.status.passkeys', { n: p.passkeys }) : null].filter(Boolean).join(' · ') || t('sec.status.none')}
                  </div>
                </div>
                {(p.totp || p.passkeys > 0) && p.id !== me?.user.id && (
                  <button
                    className="btn btn--small"
                    onClick={() => setResetting(p)}
                  >
                    {t('sec.policy.reset')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {resetting && (
        <Confirm
          title={t('sec.policy.resetTitle', { name: resetting.name })}
          body={t('sec.policy.resetBody')}
          confirmLabel={t('sec.policy.reset')}
          danger
          onClose={() => setResetting(null)}
          onConfirm={async () => {
            const id = resetting.id;
            setResetting(null);
            if (await save(() => del(`/admin/users/${id}/second-step`))) void load();
          }}
        />
      )}
    </div>
  );
}
