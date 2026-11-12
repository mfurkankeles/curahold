// The CRM and spreadsheet adapters, and which of them this server can offer
// (each needs Curahold's own app registration with the service).
import type { ProviderInfo } from '../../../../shared/src/model';
import type { CrmProvider } from '../../../../shared/src/sync';
import type { Config } from '../../context';
import { demo } from './demo';
import { dynamics } from './dynamics';
import { hubspot } from './hubspot';
import { pipedrive } from './pipedrive';
import { excel, gsheets } from './sheets';
import { salesforce } from './salesforce';
import type { CrmAdapter, OAuthClient } from './types';
import { zoho } from './zoho';
import { freshdesk, intercom, jsm, zendesk } from './support';
import { SUPPORT_PROVIDERS } from '../../../../shared/src/sync';

export const CRM_ADAPTERS: Record<CrmProvider, CrmAdapter> = { salesforce, hubspot, dynamics, pipedrive, zoho, gsheets, excel, zendesk, freshdesk, intercom, jsm, demo };

export const isCrm = (p: string): p is CrmProvider => p in CRM_ADAPTERS;

/** Curahold's own registration with the service; spreadsheets reuse the sign-in apps. */
export function oauthClient(cfg: Config, provider: CrmProvider): OAuthClient | null {
  if (CRM_ADAPTERS[provider]?.keyed) return null;
  const own = cfg.connectors.crm?.[provider as keyof NonNullable<typeof cfg.connectors.crm>];
  if (own) return own;
  if (provider === 'gsheets') return cfg.oauth.google ?? null;
  if (provider === 'excel' || provider === 'dynamics') return cfg.oauth.microsoft ?? null;
  if (provider === 'demo') return cfg.connectors.demoCrm ? { clientId: 'demo', clientSecret: 'demo' } : null;
  return null;
}

export function crmProviders(cfg: Config): ProviderInfo[] {
  const list: CrmProvider[] = ['salesforce', 'hubspot', 'dynamics', 'pipedrive', 'zoho', 'gsheets', 'excel'];
  if (cfg.connectors.demoCrm) list.push('demo');
  return [
    ...list.map((id): ProviderInfo => ({ id, kind: 'source', twoWay: true, available: !!oauthClient(cfg, id), setup: 'oauth' })),
    // Support tools need nothing on this server: the administrator brings an API key.
    ...SUPPORT_PROVIDERS.map((id): ProviderInfo => ({ id, kind: 'source', twoWay: false, available: true, setup: 'key' })),
  ];
}

export function recordUrl(provider: string, config: Record<string, any>, object: string, remoteId: string): string | null {
  if (!isCrm(provider)) return null;
  try {
    return CRM_ADAPTERS[provider].url(config, object, remoteId);
  } catch {
    return null;
  }
}
