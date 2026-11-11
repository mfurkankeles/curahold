// The database seam. Routes only ever see `Q` inside db.tenant(), so every
// query runs with app.org_id / app.user_id set and as the tendwell_app role —
// row-level security in db/migrations decides what is visible.
export type Row = Record<string, any>;

export interface Q {
  query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface TenantCtx {
  orgId: string | null;
  userId: string | null;
}

export interface Db {
  /** A transaction scoped to one company (and optionally one person). */
  tenant<T>(ctx: TenantCtx, fn: (q: Q) => Promise<T>): Promise<T>;
  /** Owner access: migrations, creating a company, demo data. Never used by a request route. */
  system<T>(fn: (q: Q) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export const TENANT_SETUP_SQL =
  "select set_config('app.org_id', $1, true), set_config('app.user_id', $2, true)";
