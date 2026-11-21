// The database seam. Routes only ever see `Q` inside db.tenant(), so every
// query runs with app.org_id / app.user_id set and as the curahold_app role —
// row-level security in db/migrations decides what is visible.
export type Row = Record<string, any>;

export interface Q {
  query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface TenantCtx {
  orgId: string | null;
  userId: string | null;
  /** The reader's language: lists come back in its dictionary order (sort_text in the migrations). */
  locale?: string | null;
  /** The company's day (YYYY-MM-DD), by its own time zone: what app_today() answers in this transaction. */
  today?: string | null;
  /** Permissions an API key or app token does not carry (comma-separated); app_has_perm refuses them (0259). */
  withheld?: string | null;
}

export interface Db {
  /** A transaction scoped to one company (and optionally one person). */
  tenant<T>(ctx: TenantCtx, fn: (q: Q) => Promise<T>): Promise<T>;
  /**
   * The customer portal: runs as curahold_portal, which can do nothing but
   * call the portal_* functions, for this signed-in portal person.
   */
  portal<T>(ctx: PortalCtx, fn: (q: Q) => Promise<T>): Promise<T>;
  /**
   * Server work across companies (sign-in look-ups before a company is known, inbound hooks, the scheduler, demo
   * data). Runs as curahold_system: it may read and write every company's rows (its own policy, migration 0254), but it
   * owns nothing, so it cannot change the schema, the policies or the triggers (ADR 0023). Every statement still names
   * org_id itself (tests/rls.test.ts).
   */
  system<T>(fn: (q: Q) => Promise<T>): Promise<T>;
  /**
   * The table owner: migrations only (db/migrate.ts) and tests that check the schema itself. Never in a request path:
   * tests/rls.test.ts fails the build when api/src calls it anywhere else.
   */
  owner<T>(fn: (q: Q) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export interface PortalCtx {
  orgId: string;
  portalUserId: string | null;
}

/** The role db.system() runs as (migration 0254): reads and writes every company's rows, owns nothing. */
export const SYSTEM_ROLE_SQL = 'set local role curahold_system';

export const PORTAL_SETUP_SQL =
  "select set_config('app.org_id', $1, true), set_config('app.user_id', '', true), set_config('app.portal_user', $2, true)";

export const TENANT_SETUP_SQL =
  "select set_config('app.org_id', $1, true), set_config('app.user_id', $2, true), set_config('app.locale', $3, true), set_config('app.today', $4, true), set_config('app.withheld', $5, true)";
