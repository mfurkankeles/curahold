// The speed test: a large company on a real Postgres, and how long the
// requests behind each page take there — through the same code, the same
// driver and the same row-level security as production.
//
//   PERF_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres npx tsx scripts/perf.ts
//
// The URL must be a throwaway server whose user may create databases; the
// script makes its own database (app_perf_…) and leaves it there to look at.
// PERF_SCALE=0.2 makes a smaller company; PERF_KEEP=<database> times an
// existing one again without building it.
//
// The company: ~310 people in 30 teams, 42 boards, 6,000 customers, 120,000
// tasks (plus subtasks), 300,000 comments, 42,000 records, 300,000 notices —
// and a second company beside it, to show that one never slows the other.
import postgres from 'postgres';
import { createApp } from '../api/src/app';
import { migrate } from '../api/src/db/migrate';
import { loadMigrations } from '../api/src/db/migrations-fs';
import { postgresDb } from '../api/src/db/postgres';
import { sendNudges } from '../api/src/lib/nudges';
import { archiveFinished, runScheduled } from '../api/src/lib/scheduler';
import { MemoryEmail, MemoryStorage } from '../api/src/lib/services';
import { Client, login, testConfig } from '../tests/helpers';
import { seedDemo } from './seed-demo';

const base = process.env.PERF_DATABASE_URL;
if (!base) {
  console.error('Set PERF_DATABASE_URL to a throwaway Postgres (its user must be able to create databases).');
  process.exit(2);
}
const SCALE = Math.max(0.01, Number(process.env.PERF_SCALE) || 1);
const N = (n: number) => Math.max(1, Math.round(n * SCALE));
const keep = process.env.PERF_KEEP;
const name = keep ?? `app_perf_${Date.now().toString(36)}`;
const url = new URL(base);
if (!keep) {
  const admin = postgres(base, { max: 1, onnotice: () => undefined });
  await admin.unsafe(`create database ${name}`);
  await admin.end({ timeout: 2 });
}
url.pathname = `/${name}`;
const db = postgresDb(url.toString(), { max: 6 });
const raw = postgres(url.toString(), { max: 1, onnotice: () => undefined });

const t0 = Date.now();
const since = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;

if (!keep) {
  await migrate(db, loadMigrations());
  const big = await seedDemo(db, { slug: 'big', locale: 'tr' });
  const other = await seedDemo(db, { slug: 'other', locale: 'en' });
  console.log(`[${since()}] two companies made; filling the big one…`);

  // Everything below is written straight into the tables, with triggers off:
  // the point is the reading, not the writing.
  await raw.begin(async (sql) => {
    await sql.unsafe(`set local session_replication_role = replica`);
    const org = big.orgId;
    const [{ role }] = await sql.unsafe(`select id as role from roles where org_id = $1 and key = 'member'`, [org]);
    await sql.unsafe(
      `insert into users (org_id, email, name, role_id, seat, status)
       select $1, 'kisi' || g || '@big.example', 'Kişi ' || g, $2, 'full', 'active' from generate_series(1, $3::int) g`,
      [org, role, N(300)],
    );
    await sql.unsafe(`create temp table u on commit drop as select id, (row_number() over (order by email)) - 1 as n from users where org_id = $1 and seat = 'full'`, [org]);
    const [{ users }] = await sql.unsafe(`select count(*)::int as users from u`);
    // Teams of ten; the first of each leads it.
    await sql.unsafe(`insert into teams (org_id, name, lead_id) select $1, 'Ekip ' || g, (select id from u where n = (g * 10) % $2::int) from generate_series(1, $3::int) g`, [org, users, N(30)]);
    await sql.unsafe(`create temp table tm on commit drop as select id, (row_number() over (order by name)) - 1 as n from teams where org_id = $1`, [org]);
    const [{ teams }] = await sql.unsafe(`select count(*)::int as teams from tm`);
    await sql.unsafe(
      `insert into team_members (org_id, team_id, user_id)
       select $1, tm.id, u.id from u join tm on tm.n = (u.n / 10) % $2::int on conflict do nothing`,
      [org, teams],
    );
    // A board for every team, and ten for the whole company.
    // Every board belongs to a department (0120, not null): these take the customer-success board's, as its columns.
    const [{ columns, department_id: dept }] = await sql.unsafe(`select columns, department_id from boards where id = $1`, [big.boards.csBoard]);
    await sql.unsafe(
      `insert into boards (org_id, team_id, name, visibility, columns, created_by, created_at, department_id)
       select $1, tm.id, 'Pano ' || tm.n, 'team', $2::jsonb, (select lead_id from teams where id = tm.id), now() - interval '2 years', $3 from tm`,
      [org, columns as any, dept],
    );
    await sql.unsafe(
      `insert into boards (org_id, name, visibility, columns, created_by, created_at, department_id)
       select $1, 'Şirket panosu ' || g, 'org', $2::jsonb, (select id from u where n = g), now() - interval '2 years', $3 from generate_series(1, 10) g`,
      [org, columns as any, dept],
    );
    // Department walls (0120): a person sees a department's boards only as its member, so everyone made here joins it.
    await sql.unsafe(`insert into department_members (org_id, department_id, user_id) select $1, $2, u.id from u on conflict do nothing`, [org, dept]);
    await sql.unsafe(`create temp table b on commit drop as select id, (row_number() over (order by created_at, name)) - 1 as n from boards where org_id = $1 and visibility <> 'private'`, [org]);
    const [{ boards }] = await sql.unsafe(`select count(*)::int as boards from b`);

    await sql.unsafe(
      `insert into accounts (org_id, name, owner_id, team_id, fields, created_at)
       select $1, 'Müşteri ' || g, u.id, (select team_id from team_members where user_id = u.id limit 1),
              jsonb_build_object('renewal_date', to_char(current_date + ((g * 7) % 400) - 30, 'YYYY-MM-DD'), 'arr', 5000 + (g * 37) % 200000,
                                 'health', (array['good', 'good', 'watch', 'risk'])[1 + g % 4], 'tier', (array['enterprise', 'mid', 'smb'])[1 + g % 3]),
              now() - make_interval(days => 30 + g % 700)
         from generate_series(1, $3::int) g join u on u.n = g % $2::int`,
      [org, users, N(6000)],
    );
    await sql.unsafe(`create temp table a on commit drop as select id, (row_number() over (order by name)) - 1 as n from accounts where org_id = $1`, [org]);
    const [{ accounts }] = await sql.unsafe(`select count(*)::int as accounts from a`);
    console.log(`[${since()}] ${users} people, ${teams} teams, ${boards} boards, ${accounts} customers`);

    // Tasks over two years: most are finished; what was finished long ago is in the archive, as the nightly sweep leaves it.
    await sql.unsafe(
      `insert into tasks (org_id, board_id, title, status, assignee_ids, account_id, due_date, start_date, priority, position, created_by, updated_by,
                          created_at, updated_at, done_at, archived_at)
       select $1, b.id, 'Görev ' || g || ' ' || (array['yenileme', 'rapor', 'toplantı', 'teklif', 'eğitim', 'entegrasyon'])[1 + g % 6],
              x.status,
              case when g % 9 = 0 then '{}'::uuid[] when g % 4 = 0 then array[u.id, u2.id] else array[u.id] end,
              case when g % 10 < 7 then a.id end,
              current_date - x.age + 5 + g % 20,
              case when g % 6 = 0 then current_date - x.age end,
              (array['normal', 'normal', 'normal', 'high', 'urgent', 'low'])[1 + g % 6],
              g * 1024.0, u.id, u.id,
              now() - make_interval(days => x.age + 3), now() - make_interval(days => x.touched),
              case when x.status = 'done' then now() - make_interval(days => x.touched) end,
              case when x.status = 'done' and x.touched > 90 then now() - make_interval(days => x.touched - 90) end
         from generate_series(1, $5::int) g
         cross join lateral (select case when g % 20 < 12 then 'done' when g % 20 < 17 then 'todo' else 'doing' end as status,
                                    case when g % 20 < 12 then (g * 13) % 720 else (g * 7) % 60 end as age) s
         cross join lateral (select s.status, s.age, greatest(0, s.age - g % 5) as touched) x
         join b on b.n = (g * 31) % $2::int
         join u on u.n = (g * 17) % $3::int
         join u u2 on u2.n = (g * 29 + 1) % $3::int
         join a on a.n = (g * 23) % $4::int`,
      [org, boards, users, accounts, N(120000)],
    );
    await sql.unsafe(`create temp table tk on commit drop as select id, board_id, (row_number() over (order by created_at, id)) - 1 as n from tasks where org_id = $1 and parent_id is null`, [org]);
    await sql.unsafe(`create index on tk (n)`);
    const [{ tasks }] = await sql.unsafe(`select count(*)::int as tasks from tk`);
    await sql.unsafe(
      `insert into tasks (org_id, board_id, parent_id, title, status, assignee_ids, position, created_by, updated_by)
       select $1, tk.board_id, tk.id, 'Alt görev ' || g, case when g % 2 = 0 then 'done' else 'todo' end, array[u.id], g * 1024.0, u.id, u.id
         from generate_series(1, $4::int) g join tk on tk.n = (g * 7) % $2::int join u on u.n = g % $3::int`,
      [org, tasks, users, N(30000)],
    );
    await sql.unsafe(
      `insert into comments (org_id, task_id, author_id, body, created_at)
       select $1, tk.id, u.id, 'Not ' || g || ': müşteriyle konuşuldu, sonraki adım belli.', now() - make_interval(hours => g % 9000)
         from generate_series(1, $4::int) g join tk on tk.n = (g * 11) % $2::int join u on u.n = g % $3::int`,
      [org, tasks, users, N(300000)],
    );
    await sql.unsafe(
      `insert into task_events (org_id, task_id, actor_id, kind, data, created_at)
       select $1, tk.id, u.id, (array['created', 'status', 'due', 'assignees'])[1 + g % 4], '{}'::jsonb, now() - make_interval(hours => g % 9000)
         from generate_series(1, $4::int) g join tk on tk.n = (g * 13) % $2::int join u on u.n = g % $3::int`,
      [org, tasks, users, N(250000)],
    );
    await sql.unsafe(
      `insert into task_links (org_id, from_id, to_id, kind)
       select $1, x.id, y.id, 'blocks' from generate_series(1, $3::int) g join tk x on x.n = (g * 97) % $2::int join tk y on y.n = (g * 97 + 1) % $2::int
       on conflict do nothing`,
      [org, tasks, N(4000)],
    );
    await sql.unsafe(
      `insert into activities (org_id, account_id, author_id, kind, body, happened_at)
       select $1, a.id, u.id, (array['note', 'call', 'meeting', 'email', 'review'])[1 + g % 5], 'Görüşme notu ' || g, now() - make_interval(days => (g * 3) % 400)
         from generate_series(1, $4::int) g join a on a.n = (g * 19) % $2::int join u on u.n = g % $3::int`,
      [org, accounts, users, N(120000)],
    );
    await sql.unsafe(
      `insert into notifications (org_id, user_id, kind, task_id, actor_id, data, state, read_at, created_at)
       select $1, u.id, (array['assigned', 'comment', 'mentioned', 'followed'])[1 + g % 4], tk.id, u2.id, '{"excerpt": "bakabilir misin?"}'::jsonb, 'sent',
              case when g % 20 <> 0 then now() - make_interval(hours => g % 2000) end, now() - make_interval(hours => g % 2100)
         from generate_series(1, $4::int) g join u on u.n = g % $3::int join u u2 on u2.n = (g + 7) % $3::int join tk on tk.n = (g * 5) % $2::int`,
      [org, tasks, users, N(300000)],
    );
    await sql.unsafe(
      `insert into time_entries (org_id, task_id, user_id, minutes, day)
       select $1, tk.id, u.id, 15 + (g % 8) * 15, current_date - (g % 120) from generate_series(1, $4::int) g join tk on tk.n = (g * 3) % $2::int join u on u.n = g % $3::int`,
      [org, tasks, users, N(50000)],
    );
    console.log(`[${since()}] ${tasks} tasks with subtasks, comments, history, notices`);

    // The other company is busy too.
    await sql.unsafe(
      `insert into tasks (org_id, board_id, title, status, assignee_ids, position, created_by, updated_by)
       select $1, $2, 'Other ' || g, case when g % 2 = 0 then 'done' else 'todo' end, array[$3::uuid], g * 1024.0, $3, $3 from generate_series(1, $4::int) g`,
      [other.orgId, other.boards.csBoard, other.ids.mert, N(60000)],
    );
  });

  // Record kinds through the app (they carry their fields), the records themselves in bulk.
  const boot = createApp({ db, email: new MemoryEmail(), storage: new MemoryStorage(), config: testConfig(), fetch, defer: () => undefined, now: () => new Date() } as any);
  const env0 = { app: boot } as any;
  const ada0 = await login(env0, 'big', 'ada@demo.example');
  const kinds: Record<string, string> = {};
  for (const kind of ['contact', 'opportunity', 'ticket']) kinds[kind] = (await ada0.post('/api/record-types', { kind })).json.type.id;
  await raw.begin(async (sql) => {
    await sql.unsafe(`set local session_replication_role = replica`);
    const org = big.orgId;
    await sql.unsafe(`create temp table a on commit drop as select id, owner_id, (row_number() over (order by name)) - 1 as n from accounts where org_id = $1`, [org]);
    const [{ accounts }] = await sql.unsafe(`select count(*)::int as accounts from a`);
    await sql.unsafe(
      `insert into records (org_id, type_id, account_id, name, owner_id, fields)
       select $1, $2, a.id, 'Kişi ' || g, a.owner_id, jsonb_build_object('title', 'Müdür', 'email', 'kisi' || g || '@musteri.example', 'stance', (array['champion', 'supporter', 'neutral'])[1 + g % 3])
         from generate_series(1, $4::int) g join a on a.n = g % $3::int`,
      [org, kinds.contact, accounts, N(24000)],
    );
    await sql.unsafe(
      `insert into records (org_id, type_id, account_id, name, owner_id, fields, updated_at)
       select $1, $2, a.id, 'Fırsat ' || g, a.owner_id,
              jsonb_build_object('amount', 5000 + (g * 53) % 90000, 'close_date', to_char(current_date + (g % 200) - 100, 'YYYY-MM-DD'),
                                 'stage', (array['discovery', 'proposal', 'negotiation', 'commit'])[1 + g % 4],
                                 'kind', (array['new', 'expansion', 'renewal'])[1 + g % 3],
                                 'status', (array['open', 'open', 'won', 'lost'])[1 + g % 4]),
              now() - make_interval(days => g % 200)
         from generate_series(1, $4::int) g join a on a.n = (g * 3) % $3::int`,
      [org, kinds.opportunity, accounts, N(6000)],
    );
    await sql.unsafe(
      `insert into records (org_id, type_id, account_id, name, fields)
       select $1, $2, a.id, 'Talep ' || g, jsonb_build_object('status', (array['open', 'pending', 'solved', 'closed'])[1 + g % 4], 'priority', (array['low', 'normal', 'high', 'urgent'])[1 + g % 4],
                                                               'opened_at', to_char(current_date - g % 300, 'YYYY-MM-DD'))
         from generate_series(1, $4::int) g join a on a.n = (g * 5) % $3::int`,
      [org, kinds.ticket, accounts, N(12000)],
    );
  });
  await raw.unsafe('analyze');
  console.log(`[${since()}] records in, statistics gathered`);
}

// A kept database is brought up to today's migrations first: the code being
// timed is today's, so its tables, triggers and indexes must be too.
if (keep) {
  const applied = await migrate(db, loadMigrations());
  if (applied.length) {
    await raw.unsafe('analyze');
    console.log(`[${since()}] ${name} brought up to date: ${applied.join(', ')}`);
  }
}

// ------------------------------------------------------------- measuring

const email = new MemoryEmail();
const deps = { db, email, storage: new MemoryStorage(), config: testConfig(), fetch, defer: () => undefined, now: () => new Date() } as any;
const app = createApp(deps);
const env = { app } as any;

const [org] = await raw.unsafe(`select id from orgs where slug = 'big'`);
// A company-wide board, so every one of the three people can open it.
const [busiest] = await raw.unsafe(
  `select t.board_id as id, count(*)::int as n from tasks t join boards b on b.id = t.board_id
    where t.org_id = $1 and b.visibility = 'org' and t.parent_id is null and t.archived_at is null group by 1 order by 2 desc limit 1`,
  [org.id],
);
const [someone] = await raw.unsafe(`select u.id, u.email from users u where u.org_id = $1 and u.email like 'kisi%' order by u.email limit 1`, [org.id]);
const [customer] = await raw.unsafe(`select a.id from accounts a where a.org_id = $1 and a.owner_id = $2 limit 1`, [org.id, someone.id]);
const [task] = await raw.unsafe(`select t.id from tasks t where t.board_id = $1 and t.archived_at is null and t.parent_id is null order by t.updated_at desc limit 1`, [busiest.id]);
const [sizes] = await raw.unsafe(
  `select (select count(*) from tasks)::int as tasks, (select count(*) from comments)::int as comments, (select count(*) from accounts)::int as accounts,
          (select count(*) from records)::int as records, (select count(*) from notifications)::int as notifications, (select count(*) from users)::int as users`,
);
console.log(`\n${name}: ${JSON.stringify(sizes)}; the busiest board holds ${busiest.n} cards\n`);

const month = new Date().toISOString().slice(0, 7);
const today = new Date().toISOString().slice(0, 10);
const plus = (d: number) => new Date(Date.now() + d * 86400_000).toISOString().slice(0, 10);
const reads: [string, string][] = [
  ['Opening the app', '/api/me'],
  ['', '/api/boards'],
  ['', '/api/people'],
  ['Live refresh', '/api/pulse'],
  ['My tasks', '/api/tasks?assignee=me'],
  ['', '/api/tasks/counts'],
  ['Home', '/api/me/start'],
  ['A board (the busiest)', `/api/boards/${busiest.id}/tasks`],
  ['', `/api/boards/${busiest.id}/tasks?per=100`],
  ['', `/api/boards/${busiest.id}/tasks?limit=200`],
  ['', `/api/boards/${busiest.id}/tasks?per=100&filters=${encodeURIComponent(JSON.stringify({ q: 'görev', priority: ['normal'] }))}`],
  ['Its archive', `/api/boards/${busiest.id}/tasks?archived=1`],
  ['A task', `/api/tasks/${task.id}`],
  ['Calendar (a month)', `/api/tasks?from=${month}-01&to=${month}-28`],
  ['Timeline (six weeks)', `/api/tasks?span=1&from=${today}&to=${plus(42)}`],
  ['Customers (cards)', '/api/accounts?limit=500&signals=1'],
  ['A customer', `/api/accounts/${customer.id}`],
  ['', `/api/accounts/${customer.id}/timeline`],
  ['Pipeline', '/api/records?type=opportunity&limit=500'],
  ['Contacts', '/api/records?type=contact&limit=200'],
  ['Reports', '/api/reports/work'],
  ['Team: one person', `/api/reports/person/${someone.id}`],
  ['Inbox', '/api/notifications?filter=all&limit=40'],
  ['Search', '/api/search?q=yenileme'],
];

async function time(c: Client, path: string) {
  const runs: number[] = [];
  let status = 0;
  let size = 0;
  for (let i = 0; i < 6; i++) {
    const at = performance.now();
    const r = await c.get(path);
    const ms = performance.now() - at;
    status = r.status;
    size = JSON.stringify(r.json ?? '').length;
    if (i) runs.push(ms); // the first run warms the connection
  }
  runs.sort((a, b) => a - b);
  return { ms: runs[Math.floor(runs.length / 2)], status, kb: Math.round(size / 1024) };
}

// One address gets only a few sign-in links in 15 minutes; a timing run signs
// in over and over, so the earlier runs' links go first (this is a throwaway database).
await raw.unsafe('delete from login_tokens');
const people: [string, Client][] = [
  ['member', await login(env, 'big', someone.email)],
  ['team lead', await login(env, 'big', 'mert@demo.example')],
  ['admin', await login(env, 'big', 'ada@demo.example')],
];
// The features added since 16 Nov read tables the fill above never touches:
// give the big company its own onboarding plan and a portfolio of customer
// plans, made through the API as the admin (so every step, person and goal is
// what a real plan holds). Only what is missing is made, so a kept database
// keeps its plans.
{
  const admin = people[2][1];
  await admin.get('/api/onboarding/self');
  const PLANS = N(400);
  const [{ n }] = await raw.unsafe(`select count(*)::int as n from onboarding_plans where org_id = $1 and kind = 'client'`, [org.id]);
  if (n < PLANS) {
    const free = await raw.unsafe(
      `select a.id from accounts a where a.org_id = $1 and a.archived_at is null
          and not exists (select 1 from onboarding_plans p where p.account_id = a.id) order by a.id limit $2`,
      [org.id, PLANS - n],
    );
    for (const a of free) await admin.post('/api/onboarding-plans', { accountId: a.id });
    await admin.post('/api/setup-health/check', {});
    await raw.unsafe('analyze');
    console.log(`[${since()}] ${free.length} customer onboarding plans made`);
  }
}
const [plan] = await raw.unsafe(`select id from onboarding_plans where org_id = $1 and kind = 'client' order by started_on desc, id limit 1`, [org.id]);
reads.push(
  ['Setup health', '/api/setup-health'],
  ['Onboarding hub (own plan)', '/api/onboarding/self'],
  ['', '/api/onboarding/self/summary'],
  ['', '/api/onboarding/checklist'],
  ['Onboarding portfolio', '/api/onboarding-plans'],
  ['A customer plan', `/api/onboarding-plans/${plan.id}`],
  ['Portfolio view', '/api/reports/portfolio'],
  ['Workload', '/api/reports/workload'],
  ['Departments', '/api/departments'],
  ['Customer flow', `/api/accounts/${customer.id}/flow`],
  ['Hand-overs', '/api/handovers'],
  ['Analytics feed', '/api/analytics/v1/Tasks.json'],
  ['', '/api/analytics/v1/Customers.json'],
);
const SLOW = Number(process.env.PERF_SLOW_MS) || 400;
let slow = 0;
console.log(`${'request'.padEnd(58)}${people.map(([n]) => n.padStart(13)).join('')}`);
// PERF_ONLY=writes skips the reads (and the jobs) when only the writing is being looked at.
const only = process.env.PERF_ONLY;
for (const [label, path] of only === 'writes' ? [] : reads) {
  const cells: string[] = [];
  for (const [, c] of people) {
    const r = await time(c, path);
    if (r.ms > SLOW) slow++;
    cells.push(`${r.status === 200 ? '' : `${r.status} `}${r.ms.toFixed(0)} ms${r.ms > SLOW ? ' !' : ''}`.padStart(13));
  }
  console.log(`${(label ? `${label}: ` : '  ').padEnd(24)}${path.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, '…').slice(0, 33).padEnd(34)}${cells.join('')}`);
}

// Writing: one person, many times; then many people at once, as on a busy morning.
const pct = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};
const spread = (xs: number[]) => `p50 ${pct(xs, 0.5).toFixed(0)} · p95 ${pct(xs, 0.95).toFixed(0)} · max ${Math.max(...xs).toFixed(0)} ms`;
const WRITES = Number(process.env.PERF_WRITES) || 40;
async function addAndMove(c: Client, who: string, adds: number[], moves: number[], fails: number[]) {
  let at = performance.now();
  const made = await c.post('/api/tasks', { boardId: busiest.id, title: 'Hız testi görevi', assigneeIds: [who] });
  adds.push(performance.now() - at);
  if (made.status !== 201) return void fails.push(made.status);
  at = performance.now();
  const moved = await c.patch(`/api/tasks/${made.json.task.id}`, { baseVersion: made.json.task.version, status: 'doing' });
  moves.push(performance.now() - at);
  if (moved.status !== 200) fails.push(moved.status);
}
const me = people[0][1];
await addAndMove(me, someone.id, [], [], []); // warms the paths
const adds: number[] = [];
const moves: number[] = [];
const fails: number[] = [];
for (let i = 0; i < WRITES; i++) await addAndMove(me, someone.id, adds, moves, fails);
console.log(`\n${`Adding a task (${WRITES} times)`.padEnd(40)}${spread(adds)}`);
console.log(`${'Moving it to another column'.padEnd(40)}${spread(moves)}`);
const CROWD = Number(process.env.PERF_CROWD) || 50;
const crowdPeople = await raw.unsafe(`select u.id, u.email from users u where u.org_id = $1 and u.email like 'kisi%' and u.id <> $3 order by u.email limit $2`, [org.id, CROWD, someone.id]);
const crowd = await Promise.all(crowdPeople.map(async (u: any) => [u.id, await login(env, 'big', u.email)] as const));
// Two loads. Paced: everyone starts within the same second; each adds a card and
// moves it, then pauses 1.5–3.5 s (a busy person; ~35 writes a second for the
// company). Flat out: nobody pauses at all — how many writes a second this one
// machine can take, the queue showing as waiting.
const cAdds: number[] = [];
const cMoves: number[] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
await Promise.all(crowd.map(async ([id, c]) => { await sleep(Math.random() * 1000); for (let i = 0; i < 5; i++) { await addAndMove(c, id, cAdds, cMoves, fails); await sleep(1500 + Math.random() * 2000); } }));
console.log(`${`${crowd.length} people, paced: adding`.padEnd(40)}${spread(cAdds)}`);
console.log(`${'                     moving'.padEnd(40)}${spread(cMoves)}`);
const fAdds: number[] = [];
const fMoves: number[] = [];
const flatAt = performance.now();
await Promise.all(crowd.map(async ([id, c]) => { for (let i = 0; i < 4; i++) await addAndMove(c, id, fAdds, fMoves, fails); }));
const flatS = (performance.now() - flatAt) / 1000;
console.log(`${`${crowd.length} people, flat out: adding`.padEnd(40)}${spread(fAdds)}`);
console.log(`${'                     moving'.padEnd(40)}${spread(fMoves)}  (${((fAdds.length + fMoves.length) / flatS).toFixed(0)} writes/s)`);
if (fails.length) console.log(`  ${fails.length} write(s) refused: ${[...new Set(fails)].join(', ')}`);
if (pct(adds, 0.95) > 250 || pct(cAdds, 0.95) > 250 || pct(cMoves, 0.95) > 250) slow++; // the target: p95 ≤ 250 ms (paced)

// The jobs that run by themselves.
const job = async (label: string, fn: () => Promise<unknown>) => {
  const at = performance.now();
  let note = '';
  try {
    note = JSON.stringify(await fn()).slice(0, 70);
  } catch (e) {
    note = `failed: ${(e as Error).message.slice(0, 80)}`;
  }
  console.log(`${label.padEnd(58)}${`${((performance.now() - at) / 1000).toFixed(1)} s`.padStart(13)}  ${note}`);
};
console.log('');
if (only !== 'writes') {
const thursday = new Date('2030-03-07T05:00:00Z');
await job('Nudges (Thursday 08:00, every person)', () => sendNudges(deps, thursday));
await job('The nightly archive sweep', () => archiveFinished(deps, new Date()));
await job('The whole hourly run at 03:00 UTC', () => runScheduled(deps, new Date(`${today}T03:00:00Z`)));
}

console.log(`\n${slow ? `${slow} request(s) over ${SLOW} ms` : `every request under ${SLOW} ms`} · ${name} left in place (PERF_KEEP=${name} measures it again)`);
await raw.end({ timeout: 2 });
await db.close?.();
process.exit(slow ? 1 : 0);
