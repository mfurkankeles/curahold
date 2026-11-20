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

/** An administrator who is (or could be) a backup administrator: without a second step the backup sign-in does not let them in. */
export interface BackupPerson {
  id: string;
  name: string;
  email: string;
  admin: boolean;
  secondStep: boolean;
}

export interface BackupState {
  ids: string[];
  people: BackupPerson[];
}

export interface SsoSettings {
  config: SsoConfig | null;
  sp: SsoSp;
  /** Up to two administrators who keep the emailed link (with their second step) when SSO is required. */
  backup?: BackupState;
  /** The last test sign-in, and whether it proved the details stored now. */
  test?: { at: string; email: string | null; current: boolean } | null;
}

/** GET /api/sso/settings. */
export const getSsoSettings = () => get<SsoSettings>('/sso/settings');
/** PUT /api/sso/settings (needs a recent sign-in; the dialog handles it). */
export const saveSsoSettings = (body: Partial<SsoConfig> & { cert?: string; clientSecret?: string; backupAdminIds?: string[] }) => put<{ ok: true; sp: SsoSp; backup?: BackupState }>('/sso/settings', body);
/** Makes a new SCIM token; the old one stops working. The token is shown only in this answer. */
export const rotateScimToken = () => post<{ token: string; baseUrl: string; hint: string }>('/sso/settings/scim-token');
