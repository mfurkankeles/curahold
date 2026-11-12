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
}

export interface Db {
  /** A transaction scoped to one company (and optionally one person). */
  tenant<T>(ctx: TenantCtx, fn: (q: Q) => Promise<T>): Promise<T>;
  /**
   * The customer portal: runs as curahold_portal, which can do nothing but
   * call the portal_* functions, for this signed-in portal person.
   */
  portal<T>(ctx: PortalCtx, fn: (q: Q) => Promise<T>): Promise<T>;
  /** Owner access: migrations, creating a company, demo data. Never used by a request route. */
  system<T>(fn: (q: Q) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export interface PortalCtx {
  orgId: string;
  portalUserId: string | null;
}

export const PORTAL_SETUP_SQL =
  "select set_config('app.org_id', $1, true), set_config('app.user_id', '', true), set_config('app.portal_user', $2, true)";

export const TENANT_SETUP_SQL =
  "select set_config('app.org_id', $1, true), set_config('app.user_id', $2, true), set_config('app.locale', $3, true)";
