// The CRM and spreadsheet adapters, and which of them this server can offer
// (each needs Curahold's own app registration with the service).
import type { ProviderInfo } from '../../../../shared/src/model';
import type { CrmProvider } from '../../../../shared/src/sync';
import type { Config } from '../../context';
import { bigquery } from './bigquery';
import { demo } from './demo';
import { dynamics } from './dynamics';
import { hubspot } from './hubspot';
import { jira } from './jira';
import { bitrix24, freshsales, zendesksell } from './keyed';
import { gcal, outlookcal } from './calendar';
import { gmail, outlook } from './mailbox';
import { odoocrm } from './odoocrm';
import { pipedrive } from './pipedrive';
import { segment } from './segment';
import { whatsapp } from './whatsapp';
import { excel, gsheets } from './sheets';
import { snowflake } from './snowflake';
import { salesforce } from './salesforce';
import type { CrmAdapter, OAuthClient } from './types';
import { zoho } from './zoho';
import { finfile } from './accounting/finfile';
import { freee } from './accounting/freee';
import { odooAdapter } from './accounting/odoo';
import { parasut } from './accounting/parasut';
import { quickbooks } from './accounting/quickbooks';
import { stripe } from './accounting/stripe';
import { xeroAdapter } from './accounting/xero';
import { zohobooks } from './accounting/zohobooks';
import { ACCOUNTING_ALL } from '../../../../shared/src/accounting';
import { freshdesk, front, intercom, jsm, zendesk, zohodesk } from './support';
import { CALENDAR_PROVIDERS, DEV_PROVIDERS, EVENT_PROVIDERS, MESSAGE_PROVIDERS, KEYED_CRM_PROVIDERS, MAILBOX_PROVIDERS, READ_ONLY_PROVIDERS, SUPPORT_PROVIDERS, WAREHOUSE_PROVIDERS } from '../../../../shared/src/sync';

export const CRM_ADAPTERS: Record<CrmProvider, CrmAdapter> = { salesforce, hubspot, dynamics, pipedrive, zoho, bitrix24, freshsales, zendesksell, odoocrm, gsheets, excel, zendesk, freshdesk, intercom, jsm, front, zohodesk, bigquery, snowflake, gmail, outlook, gcal, outlookcal, segment, whatsapp, jira, demo, zohobooks, xero: xeroAdapter, odoo: odooAdapter, freee, parasut, quickbooks, stripe, finfile };

export const isCrm = (p: string): p is CrmProvider => p in CRM_ADAPTERS;

/** Curahold's own registration with the service; spreadsheets reuse the sign-in apps. */
export function oauthClient(cfg: Config, provider: CrmProvider): OAuthClient | null {
  // Key-only services have no app registration; Jira has both (sign-in where registered, an API token otherwise).
  if (CRM_ADAPTERS[provider]?.keyed && !CRM_ADAPTERS[provider]?.oauth) return null;
  const own = cfg.connectors.crm?.[provider as keyof NonNullable<typeof cfg.connectors.crm>];
  if (own) return own;
  if (provider === 'gsheets' || provider === 'gmail' || provider === 'gcal') return cfg.oauth.google ?? null;
  // One Zoho app registration serves Zoho CRM, Zoho Books and Zoho Desk (each asks for its own scopes).
  if (provider === 'zohobooks' || provider === 'zohodesk') return cfg.connectors.crm?.zoho ?? null;
  if (provider === 'excel' || provider === 'dynamics' || provider === 'outlook' || provider === 'outlookcal') return cfg.oauth.microsoft ?? null;
  if (provider === 'demo') return cfg.connectors.demoCrm ? { clientId: 'demo', clientSecret: 'demo' } : null;
  return null;
}

export function crmProviders(cfg: Config): ProviderInfo[] {
  const crms: CrmProvider[] = ['salesforce', 'hubspot', 'dynamics', 'pipedrive', 'zoho'];
  const sheets: CrmProvider[] = ['gsheets', 'excel'];
  if (cfg.connectors.demoCrm) sheets.push('demo');
  const signIn = (id: CrmProvider): ProviderInfo => ({
    id,
    kind: 'source',
    twoWay: true,
    available: !!oauthClient(cfg, id),
    setup: 'oauth',
    ...(id === 'salesforce' && cfg.connectors.salesforceInstallUrl ? { installUrl: cfg.connectors.salesforceInstallUrl } : {}),
  });
  return [
    ...crms.map(signIn),
    // These CRMs need nothing on this server: the administrator brings a key or a webhook address from the CRM.
    ...KEYED_CRM_PROVIDERS.map((id): ProviderInfo => ({ id, kind: 'source', twoWay: true, available: true, setup: 'key' })),
    ...sheets.map(signIn),
    // Support tools need nothing on this server either: the administrator brings an API key. Most also take changes back.
    // Zoho Desk signs in with Zoho, where this server has the Zoho registration.
    ...SUPPORT_PROVIDERS.map((id): ProviderInfo => (CRM_ADAPTERS[id].oauth ? { id, kind: 'source', twoWay: true, available: !!oauthClient(cfg, id), setup: 'oauth' } : { id, kind: 'source', twoWay: !READ_ONLY_PROVIDERS.includes(id), available: true, setup: 'key' })),
    // Warehouses: the administrator brings a service-account / key-pair key and a query; read only.
    ...WAREHOUSE_PROVIDERS.map((id): ProviderInfo => ({ id, kind: 'source', twoWay: false, available: true, setup: 'key' })),
    // Mailboxes (Gmail, Outlook): signed in with Google / Microsoft where registered, otherwise connected with an injected token. Two-way (a reply can be sent).
    ...MAILBOX_PROVIDERS.map((id): ProviderInfo => ({ id, kind: 'source', twoWay: true, available: true, setup: oauthClient(cfg, id) ? 'oauth' : 'key' })),
    // Calendars, the same way: meetings come in, a meeting planned here goes out.
    ...CALENDAR_PROVIDERS.map((id): ProviderInfo => ({ id, kind: 'source', twoWay: true, available: true, setup: oauthClient(cfg, id) ? 'oauth' : 'key' })),
    // Event streams (Segment): the administrator sets a shared secret; events are pushed to the inbound address. Read only.
    ...EVENT_PROVIDERS.map((id): ProviderInfo => ({ id, kind: 'source', twoWay: false, available: true, setup: 'key' })),
    // WhatsApp Business with the company's own Meta app: messages in at a signed callback, replies out. Nothing here to register.
    ...MESSAGE_PROVIDERS.map((id): ProviderInfo => ({ id, kind: 'source', twoWay: true, available: true, setup: 'key' })),
    // Developer tools (Jira Cloud): always connectable with an API token; "oauth" says the Atlassian sign-in is registered here too.
    ...DEV_PROVIDERS.map((id): ProviderInfo => ({ id, kind: 'source', twoWay: true, available: true, setup: oauthClient(cfg, id) ? 'oauth' : 'key' })),
    // Accounting programs, read only: a sign-in where this server is registered with the program, a key (Odoo,
    // Paraşüt), or a file in the template's columns for every other program.
    ...ACCOUNTING_ALL.map((id): ProviderInfo => {
      const adapter = CRM_ADAPTERS[id];
      return { id, kind: 'source', twoWay: false, available: adapter.oauth ? !!oauthClient(cfg, id) : true, setup: adapter.oauth ? 'oauth' : 'key' };
    }),
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
