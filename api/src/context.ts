import type { Context } from 'hono';
import type { Locale, Terms } from '../../shared/src/i18n';
import type { Perm, Seat } from '../../shared/src/model';
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
}

export interface Deps {
  db: Db;
  email: EmailSender;
  storage: Storage;
  config: Config;
  fetch?: typeof fetch;
  now?: () => Date;
}

export interface OrgRow {
  id: string;
  slug: string;
  name: string;
  locale: Locale;
  timezone: string;
  terms: Terms;
  settings: Record<string, unknown>;
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
