import type { Context } from 'hono';
import type { Locale, Terms } from '../../shared/src/i18n';
import type { AccountField, Perm, Seat, SetupState } from '../../shared/src/model';
import type { Db, Q } from './db';
import type { ProviderConfig, ProviderId } from './lib/oidc';
import type { EmailSender, Storage } from './lib/services';
import { fail } from './lib/errors';

export interface Config {
  /** e.g. "tendwell.com" — companies live at <slug>.tendwell.com */
  baseDomain: string;
  /** "https" in production, "http" for local development */
  scheme: 'https' | 'http';
  /** Port to append to company URLs in local development, e.g. 5173 */
  publicPort?: number;
  /** Central host that receives OAuth callbacks, e.g. "app.tendwell.com" */
  centralHost: string;
  /** Self-hosted single-company mode: every request belongs to this slug. */
  singleTenantSlug?: string;
  authSecret: string;
  /** Development only: return sign-in tokens in API responses. */
  devExposeTokens: boolean;
  /** Development only: accept the company from the x-tendwell-org header. */
  devOrgHeader: boolean;
  maxDevices: number;
  sessionDays: number;
  oauth: Partial<Record<ProviderId, ProviderConfig>>;
  /** Company sign-up on the central address. Off for a self-hosted install. */
  signupEnabled: boolean;
  /** Seals connector credentials at rest; falls back to authSecret. */
  secretsKey?: string;
  connectors: ConnectorConfig;
}

/** Tendwell's own app registrations with the messaging services. */
export interface ConnectorConfig {
  slack?: { clientId: string; clientSecret: string; signingSecret: string };
  /** Microsoft Teams bot (Azure Bot, single-tenant registration in Tendwell's tenant). */
  teams?: { appId: string; appPassword: string; tenantId: string };
  /** Google Chat app: the Cloud project number (token audience) and its service account. */
  gchat?: { projectNumber: string; serviceAccountEmail: string; privateKey: string };
  /** CRM app registrations (Salesforce connected app, HubSpot public app…). */
  crm?: Partial<Record<'salesforce' | 'hubspot' | 'dynamics' | 'pipedrive' | 'zoho' | 'gsheets' | 'excel', { clientId: string; clientSecret: string }>>;
  /** Development and the live demo: a pretend CRM held in memory. */
  demoCrm?: boolean;
}

export interface Deps {
  db: Db;
  email: EmailSender;
  storage: Storage;
  config: Config;
  fetch?: typeof fetch;
  now?: () => Date;
  /** Runs work after the response (Workers: waitUntil). Defaults to fire-and-forget. */
  defer?: (p: Promise<unknown>) => void;
}

export interface OrgRow {
  id: string;
  slug: string;
  name: string;
  locale: Locale;
  timezone: string;
  terms: Terms;
  settings: Record<string, unknown>;
  domains: string[];
  join_requests: boolean;
  auto_join: boolean;
  currency: string;
  template: string;
  account_fields: AccountField[];
  setup: SetupState;
}

export interface AuthCtx {
  userId: string;
  sessionId: string;
  name: string;
  email: string;
  roleId: string;
  roleKey: string;
  perms: Perm[];
  seat: Seat;
  locale: Locale | null;
}

export type AppEnv = {
  Variables: {
    deps: Deps;
    org: OrgRow;
    locale: Locale;
    auth: AuthCtx;
    /** An administrator looking at Tendwell as someone else (read only). */
    previewBy?: { id: string; name: string };
    /** Set when the caller is an API key or an app's token rather than a signed-in browser. */
    tokenKind?: 'key' | 'oauth';
    /** This app, for calling its own routes (the AI connector uses the same API as the app). */
    self: { request: (input: string, init?: RequestInit) => Response | Promise<Response> };
  };
};

export type C = Context<AppEnv>;

/** Runs `fn` inside a transaction scoped to this company and person. */
export function run<T>(c: C, fn: (q: Q) => Promise<T>): Promise<T> {
  const org = c.get('org');
  const auth = c.get('auth') as AuthCtx | undefined;
  return c.get('deps').db.tenant({ orgId: org.id, userId: auth?.userId ?? null }, fn);
}

export function requirePerm(c: C, perm: Perm) {
  if (!c.get('auth').perms.includes(perm)) fail('forbidden');
}

export function requireWriter(c: C) {
  if (c.get('auth').seat !== 'full') fail('read_only_seat');
}

export function orgUrl(cfg: Config, slug: string): string {
  const port = cfg.publicPort ? `:${cfg.publicPort}` : '';
  if (cfg.singleTenantSlug) return `${cfg.scheme}://${cfg.baseDomain}${port}`;
  return `${cfg.scheme}://${slug}.${cfg.baseDomain}${port}`;
}

export function maxDevices(c: C): number {
  const custom = Number(c.get('org').settings?.maxDevices);
  return Number.isInteger(custom) && custom >= 1 && custom <= 5 ? custom : c.get('deps').config.maxDevices;
}

export const nowOf = (deps: Deps) => (deps.now ?? (() => new Date()))();
export const fetchOf = (deps: Deps) => deps.fetch ?? fetch;
export const secretsKey = (cfg: Config) => cfg.secretsKey || cfg.authSecret;

export function defer(deps: Deps, p: Promise<unknown>) {
  const guarded = p.catch((err) => console.error('[tendwell] background task failed', err));
  if (deps.defer) deps.defer(guarded);
}

export function centralUrl(cfg: Config): string {
  const port = cfg.publicPort ? `:${cfg.publicPort}` : '';
  return `${cfg.scheme}://${cfg.centralHost}${port}`;
}

/** The logo's address on the company host, versioned so browsers refresh it after a change. */
export function logoPath(org: Pick<OrgRow, 'settings'>): string | null {
  const logo = (org.settings as any)?.logo;
  return logo?.key ? `/api/logo?v=${encodeURIComponent(String(logo.v ?? 1))}` : null;
}
