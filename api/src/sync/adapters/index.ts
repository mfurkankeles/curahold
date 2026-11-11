// The CRM and spreadsheet adapters, and which of them this server can offer
// (each needs Tendwell's own app registration with the service).
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

export const CRM_ADAPTERS: Record<CrmProvider, CrmAdapter> = { salesforce, hubspot, dynamics, pipedrive, zoho, gsheets, excel, demo };

export const isCrm = (p: string): p is CrmProvider => p in CRM_ADAPTERS;

/** Tendwell's own registration with the service; spreadsheets reuse the sign-in apps. */
export function oauthClient(cfg: Config, provider: CrmProvider): OAuthClient | null {
  const own = cfg.connectors.crm?.[provider as Exclude<CrmProvider, 'demo'>];
  if (own) return own;
  if (provider === 'gsheets') return cfg.oauth.google ?? null;
  if (provider === 'excel' || provider === 'dynamics') return cfg.oauth.microsoft ?? null;
  if (provider === 'demo') return cfg.connectors.demoCrm ? { clientId: 'demo', clientSecret: 'demo' } : null;
  return null;
}

export function crmProviders(cfg: Config): ProviderInfo[] {
  const list: CrmProvider[] = ['salesforce', 'hubspot', 'dynamics', 'pipedrive', 'zoho', 'gsheets', 'excel'];
  if (cfg.connectors.demoCrm) list.push('demo');
  return list.map((id) => ({ id, kind: 'source', twoWay: true, available: !!oauthClient(cfg, id), setup: 'oauth' }));
}

export function recordUrl(provider: string, config: Record<string, any>, object: string, remoteId: string): string | null {
  if (!isCrm(provider)) return null;
  try {
    return CRM_ADAPTERS[provider].url(config, object, remoteId);
  } catch {
    return null;
  }
}
