import { localDate } from '../../shared/src/days';
import { claimRepeat, type RepeatKey } from './lib/repeats';
import type { Context } from 'hono';
import { accessOf, allows, planFor, type Access, type Feature, type Interval, type OrgBilling, type PlanKey } from '../../shared/src/billing';
import type { Locale, Terms } from '../../shared/src/i18n';
import type { AccountField, Perm, Seat, SetupState } from '../../shared/src/model';
import type { Db, Q } from './db';
import type { ProviderConfig, ProviderId } from './lib/oidc';
import type { EmailSender, Storage } from './lib/services';
import { fail } from './lib/errors';

export interface Config {
  /** e.g. "curahold.com" — companies live at <slug>.curahold.com */
  baseDomain: string;
  /** "https" in production, "http" for local development */
  scheme: 'https' | 'http';
  /** Port to append to company URLs in local development, e.g. 5173 */
  publicPort?: number;
  /** Central host that receives OAuth callbacks, e.g. "app.curahold.com" */
  centralHost: string;
  /** Curahold's own support desk, on a host of its own; "desk.<baseDomain>" when not given. */
  deskHost?: string;
  /** Self-hosted single-company mode: every request belongs to this slug. */
  singleTenantSlug?: string;
  authSecret: string;
  /** Development only: return sign-in tokens in API responses. */
  devExposeTokens: boolean;
  /** Development only: accept the company from the x-curahold-org header. */
  devOrgHeader: boolean;
  maxDevices: number;
  sessionDays: number;
  oauth: Partial<Record<ProviderId, ProviderConfig>>;
  /** Company sign-up on the central address. Off for a self-hosted install. */
  signupEnabled: boolean;
  /** Seals connector credentials at rest; falls back to authSecret. */
  secretsKey?: string;
  connectors: ConnectorConfig;
  /** Where requests for help go (Curahold's own support desk). */
  support?: {
    email?: string;
    webhookUrl?: string;
    /**
     * The domain that takes answers by email (reply+<token>@<replyDomain>). Without it the
     * emails about a request carry no reply address and answers are written in the product.
     */
    replyDomain?: string;
    /** What whoever hands over incoming mail must present (POST /api/desk/mail). */
    mailKey?: string;
    /** Curahold's own people: mail from these addresses is support answering. */
    staff?: string[];
  };
  /** The customer portal's own registrable domain, e.g. "curahold-portal.com" (companies at <slug>.<portalDomain>). */
  portalDomain?: string;
  /** Curahold support's own key for opening an entry link into a company that granted access. */
  staffKey?: string;
  /** The platform owner's email: who alone may see the whole-business metrics. Defaults to the first support-staff address. */
  owner?: string;
  /** Subscriptions through Paddle. Unset: billing is off and everything is open (self-hosted, demo, tests). */
  billing?: BillingConfig;
}

/** Curahold's Paddle account (https://developer.paddle.com). */
export interface BillingConfig {
  provider: 'paddle';
  /** Paddle's test environment, or real payments. */
  env: 'sandbox' | 'live';
  /** Server-side API key (secret). */
  apiKey: string;
  /** The notification destination's secret key, to check webhooks (secret). */
  webhookSecret: string;
  /** Client-side token for Paddle.js checkout (safe to show to browsers). */
  clientToken: string;
  /** Paddle price ids, by plan and how often it is paid. */
  prices: Record<PlanKey, Record<Interval, string>>;
}

/** Curahold's own app registrations with the messaging services. */
export interface ConnectorConfig {
  slack?: { clientId: string; clientSecret: string; signingSecret: string };
  /** Microsoft Teams bot (Azure Bot, single-tenant registration in Curahold's tenant). */
  teams?: { appId: string; appPassword: string; tenantId: string };
  /** Google Chat app: the Cloud project number (token audience) and its service account. */
  gchat?: { projectNumber: string; serviceAccountEmail: string; privateKey: string };
  /** CRM app registrations (Salesforce connected app, HubSpot public app…). */
  crm?: Partial<Record<'salesforce' | 'hubspot' | 'dynamics' | 'pipedrive' | 'zoho' | 'gsheets' | 'excel', { clientId: string; clientSecret: string }>>;
  /** A relay with a fixed address for Salesforce's token requests (tools/relay); without it they go direct. */
  salesforceRelay?: { url: string; key: string };
  /** The install link of Curahold's Salesforce package (integrations/salesforce), shown before the first sign-in. */
  salesforceInstallUrl?: string;
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
  /** What the billing provider last said (see shared/src/billing.ts). */
  billing: OrgBilling;
  trial_ends_at: string | Date | null;
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
    /** An administrator looking at Curahold as someone else (read only). */
    previewBy?: { id: string; name: string };
    /** Curahold support, inside with a person's consent (see lib/support.ts). */
    supportBy?: { staff: string; level: 'view' | 'edit'; until: string; grantId: string };
    /** Set when the caller is an API key or an app's token rather than a signed-in browser. */
    tokenKind?: 'key' | 'oauth';
    /** The key of a change that must happen once (lib/repeats.ts); claimed by the request's first transaction. */
    repeat?: RepeatKey;
    /** This app, for calling its own routes (the AI connector uses the same API as the app). */
    self: { request: (input: string, init?: RequestInit) => Response | Promise<Response> };
  };
};

export type C = Context<AppEnv>;

/** Runs `fn` inside a transaction scoped to this company and person. */
export function run<T>(c: C, fn: (q: Q) => Promise<T>): Promise<T> {
  const org = c.get('org');
  const auth = c.get('auth') as AuthCtx | undefined;
  const repeat = c.get('repeat');
  // The reader's language goes along: names are ordered the way its dictionary orders them.
  const ctx = { orgId: org.id, userId: auth?.userId ?? null, locale: (c.get('locale') as string | undefined) ?? org.locale, today: todayOf(c) };
  return c.get('deps').db.tenant(ctx, async (q) => {
    // A change that carries a key: the key is written in the same transaction as the change, so
    // the two are saved together or not at all. A key seen before stops here (see lib/repeats.ts).
    if (repeat && !repeat.claimed && auth?.userId) await claimRepeat(q, repeat);
    return fn(q);
  });
}

export function requirePerm(c: C, perm: Perm) {
  if (!c.get('auth').perms.includes(perm)) fail('forbidden');
}

export function requireWriter(c: C) {
  if (c.get('auth').seat !== 'full') fail('read_only_seat');
  // No plan (the trial is over, or a cancelled one ran out): read and export, but no changes.
  if (accessFor(c).readOnly) fail('billing_locked');
}

/**
 * The platform owner: who may see the whole-business metrics across every
 * company. In production this is one configured address and nobody else. When
 * billing is off (a self-hosted install, the demo, tests) there is only ever
 * one company's data to see, so the company's own administrator qualifies.
 */
export function isOwner(c: C): boolean {
  const deps = c.get('deps');
  const email = c.get('auth')?.email?.toLowerCase();
  if (!email) return false;
  if (deps.config.owner) return email === deps.config.owner;
  if (!deps.config.billing) return c.get('auth').perms.includes('org.manage');
  return false;
}

export function requireOwner(c: C) {
  if (!isOwner(c)) fail('forbidden');
}

/** Where this company stands with billing (always open when billing is off). */
export function accessFor(c: C): Access {
  const org = c.get('org');
  const deps = c.get('deps');
  const trial = org.trial_ends_at ? new Date(org.trial_ends_at).toISOString() : null;
  return accessOf(!!deps.config.billing, org.billing, trial, nowOf(deps));
}

/** Only on a plan that includes this (Business): CRM sync, the customer portal, playbooks. */
export function requirePlan(c: C, feature: Feature) {
  const plan = planFor(feature);
  if (!allows(accessFor(c), feature)) fail('plan_required', { plan: plan === 'business' ? 'Business' : 'Team' }, { plan });
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

/**
 * The company's day (YYYY-MM-DD) for this request: its own time zone, and the
 * server's injectable clock. The database answers the same through app_today().
 */
export const todayOf = (c: { get: (k: any) => any }): string => localDate(nowOf(c.get('deps')), c.get('org')?.timezone);
export const fetchOf = (deps: Deps) => deps.fetch ?? fetch;
export const secretsKey = (cfg: Config) => cfg.secretsKey || cfg.authSecret;

export function defer(deps: Deps, p: Promise<unknown>) {
  const guarded = p.catch((err) => console.error('[curahold] background task failed', err));
  if (deps.defer) deps.defer(guarded);
}

/** A company's customer portal, on its own domain; null when this installation has none. */
export function portalUrl(cfg: Config, slug: string): string | null {
  if (!cfg.portalDomain) return null;
  const port = cfg.publicPort ? `:${cfg.publicPort}` : '';
  if (cfg.singleTenantSlug) return `${cfg.scheme}://${cfg.portalDomain}${port}`;
  return `${cfg.scheme}://${slug}.${cfg.portalDomain}${port}`;
}

export function centralUrl(cfg: Config): string {
  const port = cfg.publicPort ? `:${cfg.publicPort}` : '';
  return `${cfg.scheme}://${cfg.centralHost}${port}`;
}

/** The support desk's host name (no port): its own subdomain, apart from sign-up and the sales site. */
export const deskHostOf = (cfg: Config): string => (cfg.deskHost || `desk.${cfg.baseDomain}`).toLowerCase().split(':')[0];

export function deskUrl(cfg: Config): string {
  const port = cfg.publicPort ? `:${cfg.publicPort}` : '';
  return `${cfg.scheme}://${deskHostOf(cfg)}${port}`;
}

/** The logo's address on the company host, versioned so browsers refresh it after a change. */
export function logoPath(org: Pick<OrgRow, 'settings'>): string | null {
  const logo = (org.settings as any)?.logo;
  return logo?.key ? `/api/logo?v=${encodeURIComponent(String(logo.v ?? 1))}` : null;
}
