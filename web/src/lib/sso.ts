// Client helpers for enterprise SSO: the login-page lookup and redirect, and
// the admin settings read/write. Thin wrappers over the api() fetch client.
import { get, post, put } from './api';
import { deviceLabel, getDeviceId } from './device';

export type SsoProtocol = 'saml' | 'oidc';

export interface SsoInfo {
  enabled: boolean;
  enforced: boolean;
  protocol: SsoProtocol | null;
}

/** Whether a company has SSO on (read by the login page). */
export const ssoInfo = (slug: string) => get<SsoInfo>(`/sso/${slug}/info`);

/** Leave the SPA and begin SSO at the company's IdP (full-page redirect). */
export function startSso(slug: string) {
  const device = encodeURIComponent(getDeviceId());
  const label = encodeURIComponent(deviceLabel() ?? '');
  location.href = `/api/sso/${slug}/start?device=${device}&dl=${label}`;
}

export interface SsoConfig {
  protocol: SsoProtocol | null;
  enabled: boolean;
  enforced: boolean;
  issuer: string | null;
  ssoUrl: string | null;
  tokenUrl: string | null;
  jwksUrl: string | null;
  clientId: string | null;
  attrEmail: string;
  attrName: string | null;
  scimEnabled: boolean;
  certSet: boolean;
  clientSecretSet: boolean;
}

export interface SsoSp {
  entityId: string;
  acsUrl: string;
  metadataUrl: string;
  redirectUri: string;
  scimBaseUrl: string;
}

export interface SsoSettings {
  config: SsoConfig | null;
  sp: SsoSp;
}

export const getSsoSettings = () => get<SsoSettings>('/sso/settings');
export const saveSsoSettings = (body: Partial<SsoConfig> & { cert?: string; clientSecret?: string }) => put<{ ok: true; sp: SsoSp }>('/sso/settings', body);
export const rotateScimToken = () => post<{ token: string; baseUrl: string; hint: string }>('/sso/settings/scim-token');
