// The trash: what was deleted in the last 30 days, putting it back, and
// deleting it for good. People see and restore what they deleted themselves;
// whoever runs the company or looks after privacy sees all of it.
import { Hono } from 'hono';
import { TRASH_DAYS, TRASH_KINDS, type TrashKind } from '../../../shared/src/model';
import { requireWriter, run, type AppEnv } from '../context';
import { audit } from '../lib/audit';
import { fail } from '../lib/errors';
import { recomputeRollups } from '../lib/records';
import { emptyTrash, fromTrash, toTrashItem, trashRefused } from '../lib/trash';
import { param } from '../lib/validate';

export const trashRoutes = new Hono<AppEnv>();

const PAGE = 50;
const manages = (perms: readonly string[]) => perms.includes('org.manage') || perms.includes('privacy.manage');

trashRoutes.get('/trash', async (c) => {
  const auth = c.get('auth');
  const asked = c.req.query('kind');
  const kind = (TRASH_KINDS as readonly string[]).includes(asked ?? '') ? (asked as TrashKind) : null;
  const text = (c.req.query('q') ?? '').trim().slice(0, 100);
  const before = c.req.query('before');
  const rows = await run(c, (q) =>
    q.query(
      `select id, kind, root_ids, label, detail, deleted_by, deleted_at, purge_at
         from trash
        where purge_at > now()
          and ($1::text is null or kind = $1)
          and ($2 = '' or position(fold_text($2) in fold_text(label)) > 0)
          and ($3::timestamptz is null or deleted_at < $3::timestamptz)
        order by deleted_at desc, id
        limit $4`,
      [kind, text, before && !Number.isNaN(Date.parse(before)) ? before : null, PAGE + 1],
    ),
  );
  c.header('cache-control', 'no-store');
  return c.json({ items: rows.slice(0, PAGE).map(toTrashItem), more: rows.length > PAGE, manage: manages(auth.perms), days: TRASH_DAYS });
});

/** Put it back as it was: the thing, what went with it, and the links others held to it. */
trashRoutes.post('/trash/:id/restore', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const org = c.get('org');
  const auth = c.get('auth');
  const out = await run(c, async (q) => {
    const r = await fromTrash(q, id);
    if (r.already) return r;
    // A customer's sums over its records are worked out again when a record returns to it. A customer
    // that comes back whole brings its sums with it; only if some of its records could not come.
    if (r.kind === 'record' || (r.kind === 'account' && r.dropped.records)) await recomputeRollups(q, org.id, org.account_fields, r.accounts);
    await audit(q, {
      orgId: org.id,
      actorId: auth.userId,
      action: 'trash.restored',
      entity: r.kind,
      entityId: r.ids.length === 1 ? r.ids[0] : null,
      meta: { name: r.label, count: r.ids.length, ...(Object.keys(r.dropped).length ? { dropped: r.dropped } : {}) },
    });
    return r;
  });
  const { accounts: _accounts, ...restored } = out;
  return c.json({ restored });
});

/** Delete for good now, files included, without waiting the 30 days. */
trashRoutes.delete('/trash/:id', async (c) => {
  const id = param(c, 'id');
  const org = c.get('org');
  const auth = c.get('auth');
  if (!manages(auth.perms)) fail('forbidden');
  await run(c, async (q) => {
    const [t] = await q.query('select kind, label, root_ids from trash where id = $1 and purge_at > now()', [id]);
    if (!t) fail('not_found');
    let due = false;
    try {
      [{ due }] = await q.query<{ due: boolean }>('select app_trash_expire($1) as due', [id]);
    } catch (e) {
      trashRefused(e);
    }
    // Put back by someone else in this very moment: there is nothing left to delete.
    if (!due) fail('not_found');
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'trash.purged', entity: t.kind, entityId: t.root_ids.length === 1 ? t.root_ids[0] : null, meta: { name: t.label, count: t.root_ids.length } });
  });
  await emptyTrash(c.get('deps'), [id]);
  return c.json({ ok: true });
});
