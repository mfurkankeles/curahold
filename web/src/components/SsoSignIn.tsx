// "Sign in with SSO" on the login page. Shown only when the company has SSO on;
// resolves the company (it is already on the company's own address) and starts
// the flow. When the company requires SSO, the login page shows only this way in
// (plus the backup administrators' sign-in) and puts it first itself.
import { useEffect, useState } from 'react';
import type { OrgPublic } from '../../../shared/src/model';
import { useI18n } from '../lib/i18n';
import { ssoInfo, startSso, type SsoInfo } from '../lib/sso';

/** Whether the company has SSO on, and requires it: undefined while asking, null when it could not be told. */
export function useSsoInfo(slug: string): SsoInfo | null | undefined {
  const [info, setInfo] = useState<SsoInfo | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    ssoInfo(slug)
      .then((i) => live && setInfo(i))
      .catch(() => live && setInfo(null));
    return () => {
      live = false;
    };
  }, [slug]);
  return info;
}

export function SsoSignIn({ org, info, primary }: { org: OrgPublic; info: SsoInfo | null | undefined; primary?: boolean }) {
  const { t } = useI18n();
  if (!info?.enabled) return null;
  return (
    <button type="button" className={primary ? 'btn btn--primary' : 'btn'} onClick={() => startSso(org.slug)}>
      {t('sso.signIn')}
    </button>
  );
}
