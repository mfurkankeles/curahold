import type { ProviderInfo } from '../../../../shared/src/model';
import { secretsKey, type Config, type Deps } from '../../context';
import type { Q } from '../../db';
import { unseal } from '../../lib/crypto';
import { gchatAdapter } from './gchat';
import { slackAdapter } from './slack';
import { teamsAdapter } from './teams';
import type { LoadedConnection, MessagingAdapter } from './types';
import { webhookAdapter } from './webhook';

export const ADAPTERS: Record<string, MessagingAdapter> = {
  slack: slackAdapter,
  teams: teamsAdapter,
  gchat: gchatAdapter,
  webhook: webhookAdapter,
};

/** What this server can offer: two-way apps need Tendwell's own registration with the service. */
export function messagingProviders(cfg: Config): ProviderInfo[] {
  return [
    { id: 'slack', kind: 'messaging', twoWay: true, available: !!cfg.connectors.slack, setup: 'oauth' },
    { id: 'teams', kind: 'messaging', twoWay: true, available: !!cfg.connectors.teams && !!cfg.oauth.microsoft, setup: 'oauth' },
    { id: 'gchat', kind: 'messaging', twoWay: true, available: !!cfg.connectors.gchat && !!cfg.oauth.google, setup: 'oauth' },
    { id: 'webhook', kind: 'messaging', twoWay: false, available: true, setup: 'webhook' },
  ];
}

const rowToConn = async (r: any, key: string): Promise<LoadedConnection> => ({
  id: r.id,
  orgId: r.org_id,
  kind: r.kind,
  provider: r.provider,
  label: r.label,
  externalId: r.external_id ?? null,
  config: r.config ?? {},
  secret: await unseal(r.secret ?? null, key),
});

/** Owner access: the request role cannot read sealed credentials. Always filtered by company. */
export async function loadConnection(deps: Deps, orgId: string, id: string): Promise<LoadedConnection | null> {
  const rows = await deps.db.system((q) => q.query(`select * from connections where id = $1 and org_id = $2 and status <> 'disabled'`, [id, orgId]));
  return rows[0] ? rowToConn(rows[0], secretsKey(deps.config)) : null;
}

export async function connectionByExternal(deps: Deps, provider: string, externalId: string): Promise<LoadedConnection | null> {
  const rows = await deps.db.system((q) =>
    q.query(`select * from connections where provider = $1 and external_id = $2 and status <> 'disabled'`, [provider, externalId]),
  );
  return rows[0] ? rowToConn(rows[0], secretsKey(deps.config)) : null;
}

export async function markConnection(q: Q, id: string, ok: boolean, error?: string) {
  if (ok) await q.query(`update connections set status = 'active', last_error = null, last_ok_at = now() where id = $1 and status <> 'disabled'`, [id]);
  else await q.query(`update connections set status = 'error', last_error = $2, updated_at = now() where id = $1 and status <> 'disabled'`, [id, (error ?? '').slice(0, 300)]);
}

export async function upsertIdentity(deps: Deps, conn: LoadedConnection, userId: string, externalId: string, data: Record<string, unknown> = {}) {
  await deps.db.system(async (q) => {
    // One service account belongs to one person; a re-link moves it.
    await q.query('delete from chat_identities where connection_id = $1 and external_id = $2 and user_id <> $3', [conn.id, externalId, userId]);
    await q.query(
      `insert into chat_identities (org_id, connection_id, user_id, external_id, data) values ($1, $2, $3, $4, $5)
       on conflict (connection_id, user_id) do update set external_id = excluded.external_id, data = excluded.data`,
      [conn.orgId, conn.id, userId, externalId, JSON.stringify(data)],
    );
  });
}

export * from './types';
