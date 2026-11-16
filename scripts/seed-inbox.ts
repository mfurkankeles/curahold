// The demo person's inbox (Ada, the admin the demo opens as), as a few working days
// leave it: mentions in comments, work given to her, a story she follows moving on,
// and a renewal heads-up from a rule — some read, some not. Each is made the way the
// product makes it: a comment is written and handed to the code that tells people
// about comments (api/src/lib/taskEvents.ts), an assignment or a move is told with the
// kind and data a real change gives it, and the rule's notice carries what a rule's
// notice carries (api/src/lib/automations.ts), with the rule itself in Settings.
// The customer's reply from the portal arrives when the portal is seeded
// (web/src/demo/portal-seed.ts). Texts are the seed's Turkish, said in the company's
// language (scripts/seed-words). Nothing here is real.
import type { Db } from '../api/src/db';
import { enqueue } from '../api/src/lib/notify';
import { onComment } from '../api/src/lib/taskEvents';
import type { ProductSeed } from './seed-product';
import type { PersonKey, SeedWords } from './seed-words';

type Call = <T = any>(method: string, path: string, body?: unknown) => Promise<T>;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export async function seedInbox(o: {
  call: Call;
  db: Db;
  W: SeedWords;
  tx: (s: string) => string;
  who: (key: PersonKey) => string;
  accounts: Record<string, string>;
  product: ProductSeed;
  /** The renewal task the admin shares with the account's owner (seed-showcase.ts). */
  shared: string | null;
}) {
  const { call, db, W, tx, who, product: P } = o;
  const ada = who('ada');
  const RULE = 'Yenilemeye 30 gün kala haber ver';
  // The rule behind the renewal notices: on, so it keeps telling the owner and the admins.
  const { automation: rule } = await call<{ automation: { id: string; name: string } }>('POST', '/api/automations', {
    name: RULE,
    enabled: true,
    trigger: { type: 'account_date', field: 'renewal_date', daysBefore: 30 },
    conditions: [],
    action: { type: 'notify', to: ['account_owner', 'admins'], message: 'Yenileme teklifini ve onay sürecini bu hafta başlatalım.' },
  }).catch(() => ({ automation: null }));
  // Ada follows the PDF story, so she hears where it goes.
  await call('PUT', `/api/tasks/${P.tasks.a7}/watch`, {}).catch(() => undefined);

  /** A working day before today (1 = the last one) at a time of day, in UTC minutes. */
  const workday = (n: number, minute: number) => P.at(P.active, P.lastDay + 1 - n, minute);
  const now = Date.now();
  const midnight = Date.parse(`${new Date(now).toISOString().slice(0, 10)}T00:00:00Z`);
  /** Earlier today (never in the future, whatever the hour the demo is opened). */
  const today = (minute: number, atLeastAgo: number) => new Date(Math.min(midnight + minute * 60_000, now - atLeastAgo)).toISOString();

  await db.system(async (q) => {
    const [{ org_id: org }] = await q.query<{ org_id: string }>('select org_id from users where id = $1', [ada]);
    const seen = new Set((await q.query<{ id: string }>('select id from notifications where org_id = $1', [org])).map((r) => r.id));
    /** What the step just told people, dated when it happened; Ada has read it or not, the others have. */
    const stamp = async (at: string, read: boolean) => {
      const fresh = (await q.query<{ id: string }>('select id from notifications where org_id = $1', [org])).map((r) => r.id).filter((id) => !seen.has(id));
      fresh.forEach((id) => seen.add(id));
      await q.query(
        `update notifications set created_at = $2::timestamptz, state = 'sent', via = 'inapp', sent_at = $2::timestamptz,
                read_at = case when user_id = $3 and not $4 then null else $2::timestamptz + interval '1 hour' end
          where id = any($1::uuid[])`,
        [fresh, at, ada, read],
      );
    };
    const taskRow = async (id: string) => (await q.query('select * from tasks where id = $1', [id]))[0];
    /** A comment written at a time, told to the people it concerns as the comment route tells them. */
    const comment = async (taskId: string, by: PersonKey, text: string, mention: boolean, at: string, read: boolean) => {
      const body = mention ? `@[${W.people.ada}](${ada}) ${tx(text)}` : tx(text);
      await q.query('insert into comments (org_id, task_id, author_id, body, mentions, created_at) values ($1, $2, $3, $4, $5, $6)', [
        org,
        taskId,
        who(by),
        body,
        mention ? [ada] : [],
        at,
      ]);
      await onComment(q, org, who(by), await taskRow(taskId), body, mention ? [ada] : []);
      await stamp(at, read);
    };
    /** Someone gave Ada a task: its history says so, and she was told. */
    const assigned = async (taskId: string, by: PersonKey, at: string, read: boolean) => {
      await q.query(`insert into task_events (org_id, task_id, actor_id, kind, data, created_at) values ($1, $2, $3, 'assignees', $4, $5)`, [
        org,
        taskId,
        who(by),
        JSON.stringify({ added: [ada], removed: [] }),
        at,
      ]);
      await enqueue(q, [{ orgId: org, userId: ada, kind: 'assigned', taskId, actorId: who(by) }]);
      await stamp(at, read);
    };

    // Four working days ago: the account's owner sent the latest security document round.
    if (o.shared) await comment(o.shared, 'omar', 'Güvenlik dokümanının son sürümünü ekledim. 4. ve 7. sorular hâlâ açık.', false, workday(4, 13 * 60 + 20), true);
    // Three working days ago: Mert gave Ada the privacy text for the app store.
    await assigned(P.tasks.a9, 'mert', workday(3, 8 * 60 + 40), true);
    // Two working days ago: Mert asked the product team about the retention question.
    if (o.shared) await comment(o.shared, 'mert', 'saklama süresi sorusunu ürün ekibine sordum; ayar bu sprintte geliyor, Melis’e cuma dönebiliriz.', true, workday(2, 11 * 60 + 5), true);
    // The last working day: Zeynep moved the PDF story to acceptance testing (Ada follows it), and Lena
    // gave Ada the pilot's release notes.
    const [uat] = await q.query<{ at: Date; column: string }>(
      `select e.created_at as at, (select c->>'name' from boards b, jsonb_array_elements(b.columns) c where b.id = t.board_id and c->>'key' = 'uat') as column
         from task_events e join tasks t on t.id = e.task_id where e.task_id = $1 and e.kind = 'status' and e.data->>'to' = 'uat'`,
      [P.tasks.a7],
    );
    if (uat) {
      await enqueue(q, [{ orgId: org, userId: ada, kind: 'followed', taskId: P.tasks.a7, actorId: who('zeynep'), data: { what: 'status', column: uat.column } }]);
      await stamp(new Date(uat.at).toISOString(), true);
    }
    await assigned(P.tasks.a10, 'lena', workday(1, 15 * 60 + 30), false);
    // Today: the renewal heads-up for the customer that came within 30 days this morning, and Lena's question.
    if (rule) {
      const accounts = await q.query<{ id: string; name: string; owner_id: string | null; due: string }>(
        `select id, name, owner_id, substr(fields->>'renewal_date', 1, 10) as due from accounts
          where org_id = $1 and archived_at is null and fields->>'renewal_date' ~ '^\\d{4}-\\d{2}-\\d{2}'
            and substr(fields->>'renewal_date', 1, 10)::date between current_date and current_date + 30`,
        [org],
      );
      // Every renewal already in the window has had its notice: the rule does not send it twice.
      for (const a of accounts) {
        await q.query('insert into automation_runs (org_id, automation_id, run_key) values ($1, $2, $3) on conflict do nothing', [org, rule.id, `a:${a.id}:date:renewal_date:${a.due}`]);
      }
      // Told: the one that came into the window today, and the one ten days ago.
      const told: [string, string, boolean][] = [
        [o.accounts['Lindenhall Sigorta'], today(6 * 60 + 10, 3 * HOUR), false],
        [o.accounts['Marevo'], new Date(midnight - 10 * DAY + 6 * HOUR + 10 * 60_000).toISOString(), true],
      ];
      for (const [id, at, read] of told) {
        const a = accounts.find((x) => x.id === id);
        if (!a) continue;
        const to = [...new Set([a.owner_id, ada].filter((x): x is string => !!x))];
        await enqueue(q, to.map((u) => ({ orgId: org, userId: u, kind: 'automation', data: { rule: rule.name, message: tx('Yenileme teklifini ve onay sürecini bu hafta başlatalım.'), account: a.name } })));
        await stamp(at, read);
      }
    }
    await comment(P.tasks.a4, 'lena', 'izin penceresindeki metni sen de okur musun? Mağaza incelemesinden önce netleşsin.', true, today(9 * 60 + 40, 50 * 60_000), false);
  });
}
