// "Sign in with SSO" on the login page. Shown only when the company has SSO on;
// resolves the company (it is already on the company's own address) and starts
// the flow. New i18n keys: sso.signIn, sso.required.
import { useEffect, useState } from 'react';
import type { MessageKey } from '../../../shared/src/i18n';
import type { OrgPublic } from '../../../shared/src/model';
import { useI18n } from '../lib/i18n';
import { ssoInfo, startSso, type SsoInfo } from '../lib/sso';

export function SsoSignIn({ org }: { org: OrgPublic }) {
  const { t } = useI18n();
  const [info, setInfo] = useState<SsoInfo | null>(null);
  useEffect(() => {
    let live = true;
    ssoInfo(org.slug)
      .then((i) => live && setInfo(i))
      .catch(() => live && setInfo(null));
    return () => {
      live = false;
    };
  }, [org.slug]);

  if (!info?.enabled) return null;
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <button className="btn" onClick={() => startSso(org.slug)}>
        {t('sso.signIn' as MessageKey)}
      </button>
      {info.enforced && <p className="field__hint">{t('sso.required' as MessageKey)}</p>}
    </div>
  );
}
