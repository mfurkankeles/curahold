// The product team's board in the demo company: the product-development preset
// (Backlog, Ready … Done, Blocked, Rejected), three epics, two dozen stories with
// points and types, three closed sprints behind the running one, and a backlog
// still to plan. It is made through the public API as the admin, like the rest of
// seed-showcase.ts; with the database at hand, its past is written afterwards with
// its own dates — who moved what and when, the daily burndown readings, what each
// sprint committed to and delivered — so the burndown, the velocity and the cycle
// times have a story to tell. Every text is the seed's Turkish, said in the
// company's language on its way in (scripts/seed-words). Nothing here is real.
import type { Db } from '../api/src/db';
import { isoWeekday, weekendOf } from '../shared/src/burndown';
import { translate } from '../shared/src/i18n';
import type { Locale } from '../shared/src/i18n/core';
import type { IssueType } from '../shared/src/model';
import { pmColumns } from '../shared/src/templates';
import type { PersonKey } from './seed-words';

type Call = <T = any>(method: string, path: string, body?: unknown) => Promise<T>;

/** The sprints, oldest first: [name, goal]. The last one is running; each is two working weeks. */
const SPRINTS: [string, string][] = [
  ['Sprint 21', 'Raporlama eklentisinin temelini at'],
  ['Sprint 22', 'Raporlar bağlantıyla paylaşılabilsin'],
  ['Sprint 23', 'Mobil modülün iskeletini kur'],
  ['Sprint 24', 'Mobil modülün ilk sürümünü pilot müşteriye hazırla'],
];
const ACTIVE = SPRINTS.length - 1;
const LENGTH = 10; // working days

const EPICS = ['Mobil uygulama modülü', 'Raporlama eklentisi', 'Kurumsal güvenlik ve uyum'];
const MOBILE = 0;
const REPORTS = 1;
const SECURITY = 2;

/** A move on the board: [sprint, its working day (0 = the first), the column it went to]. */
type Move = [sprint: number, day: number, to: string];

interface Story {
  key: string;
  title: string;
  type: IssueType;
  points: number | null;
  epic: number;
  who: PersonKey | null;
  /** The sprints it was in, oldest first: unfinished work moves on to the next one. */
  sprints: number[];
  /** Added to a sprint that had already started: [sprint, working day]. */
  added?: [number, number];
  moves: Move[];
  account?: string;
  description?: string;
}

const STORIES: Story[] = [
  // Sprint 21: the reporting add-on's groundwork. Sharing by link did not make it and moved on.
  { key: 'c1', title: 'Rapor şablonları için veri modeli', type: 'story', points: 8, epic: REPORTS, who: 'omar', sprints: [0], moves: [[0, 0, 'in_progress'], [0, 4, 'code_review'], [0, 5, 'qa'], [0, 6, 'done']] },
  { key: 'c2', title: 'Haftalık kullanım özeti e-postası', type: 'story', points: 5, epic: REPORTS, who: 'zeynep', sprints: [0], moves: [[0, 1, 'in_progress'], [0, 5, 'code_review'], [0, 7, 'qa'], [0, 8, 'done']] },
  { key: 'c3', title: 'CSV dışa aktarımında özel karakterler bozuluyor', type: 'bug', points: 3, epic: REPORTS, who: 'lena', sprints: [0], moves: [[0, 2, 'in_progress'], [0, 3, 'code_review'], [0, 3, 'qa'], [0, 4, 'done']] },
  // Sprint 22: sharing, with a bug found halfway through.
  { key: 'c4', title: 'Raporu bağlantıyla paylaş', type: 'story', points: 8, epic: REPORTS, who: 'zeynep', sprints: [0, 1], moves: [[0, 7, 'in_progress'], [1, 2, 'code_review'], [1, 4, 'qa'], [1, 5, 'done']] },
  { key: 'c5', title: 'Paylaşılan raporda yetki kontrolü', type: 'story', points: 5, epic: SECURITY, who: 'mert', sprints: [1], moves: [[1, 0, 'in_progress'], [1, 5, 'code_review'], [1, 6, 'qa'], [1, 7, 'done']] },
  { key: 'c6', title: 'Tek oturum açma için deneme ortamı', type: 'spike', points: 3, epic: SECURITY, who: 'omar', sprints: [1], moves: [[1, 1, 'in_progress'], [1, 3, 'done']] },
  { key: 'c7', title: 'Grafik yüklenirken boş ekran', type: 'bug', points: 2, epic: REPORTS, who: 'lena', sprints: [1], added: [1, 4], moves: [[1, 4, 'in_progress'], [1, 5, 'code_review'], [1, 6, 'qa'], [1, 8, 'done']] },
  // Sprint 23: the mobile module's skeleton; a calendar bug turned up late and moved on.
  { key: 'c8', title: 'Mobil uygulama iskeleti ve gezinme', type: 'story', points: 8, epic: MOBILE, who: 'lena', sprints: [2], moves: [[2, 0, 'in_progress'], [2, 4, 'code_review'], [2, 6, 'qa'], [2, 7, 'done']] },
  { key: 'c9', title: 'Mobilde görev listesi', type: 'story', points: 5, epic: MOBILE, who: 'zeynep', sprints: [2], moves: [[2, 1, 'in_progress'], [2, 5, 'code_review'], [2, 6, 'qa'], [2, 8, 'done']] },
  { key: 'c10', title: 'Mobilde müşteri kartı', type: 'story', points: 5, epic: MOBILE, who: 'omar', sprints: [2], moves: [[2, 2, 'in_progress'], [2, 6, 'code_review'], [2, 7, 'qa'], [2, 9, 'done']] },
  { key: 'c11', title: 'Şifre sıfırlama e-postası geç geliyor', type: 'bug', points: 2, epic: SECURITY, who: 'mert', sprints: [2], moves: [[2, 3, 'in_progress'], [2, 4, 'qa'], [2, 5, 'done']] },
  { key: 'a6', title: 'Takvim eşitlemesi bazı telefonlarda çift kayıt açıyor', type: 'bug', points: 2, epic: MOBILE, who: 'omar', sprints: [2, 3], added: [2, 6], moves: [[2, 7, 'in_progress'], [3, 3, 'code_review'], [3, 5, 'qa']] },
  // Sprint 24, running: the first mobile release for the pilot customer.
  { key: 'a1', title: 'Mobil girişte tek kullanımlık kod', type: 'story', points: 3, epic: MOBILE, who: 'lena', sprints: [3], moves: [[3, 0, 'in_progress'], [3, 1, 'code_review'], [3, 2, 'qa'], [3, 2, 'done']] },
  { key: 'a2', title: 'Bildirim tercihleri ekranı', type: 'story', points: 2, epic: MOBILE, who: 'omar', sprints: [3], moves: [[3, 1, 'in_progress'], [3, 2, 'code_review'], [3, 3, 'done']] },
  { key: 'a3', title: 'Oturum zaman aşımı ayarı', type: 'task', points: 2, epic: SECURITY, who: 'mert', sprints: [3], moves: [[3, 3, 'in_progress'], [3, 4, 'done']] },
  { key: 'a4', title: 'Anlık bildirim izni akışı', type: 'story', points: 3, epic: MOBILE, who: 'lena', sprints: [3], moves: [[3, 0, 'in_progress'], [3, 4, 'code_review']] },
  { key: 'a5', title: 'Görev listesini çevrimdışı da göster', type: 'story', points: 3, epic: MOBILE, who: 'zeynep', sprints: [3], moves: [[3, 0, 'in_progress'], [3, 3, 'code_review'], [3, 4, 'qa'], [3, 5, 'done']] },
  { key: 'a7', title: 'Raporu PDF olarak e-postayla gönder', type: 'story', points: 3, epic: REPORTS, who: 'zeynep', sprints: [3], moves: [[3, 1, 'in_progress'], [3, 3, 'code_review'], [3, 4, 'qa'], [3, 6, 'uat']] },
  {
    key: 'a8',
    title: 'Veri saklama süresini müşteri bazında ayarla',
    type: 'story',
    points: 3,
    epic: SECURITY,
    who: 'mert',
    sprints: [3],
    moves: [[3, 0, 'in_progress']],
    account: 'Lindenhall Sigorta',
    description: 'Lindenhall Sigorta’nın bilgi güvenliği ekibi kayıtların 24 ay sonra silinmesini istiyor. Melis yenilemeden önce bu ayarı görmek istiyor.',
  },
  { key: 'a9', title: 'Uygulama mağazası için gizlilik metni', type: 'task', points: 1, epic: MOBILE, who: 'ada', sprints: [3], moves: [[3, 2, 'in_progress'], [3, 5, 'blocked']] },
  { key: 'a10', title: 'Pilot için sürüm notlarını yaz', type: 'task', points: 1, epic: MOBILE, who: 'ada', sprints: [3], moves: [] },
  // Found while the pilot customer tried the first build: added on the sprint's third day.
  { key: 'a11', title: 'Tablet yatay görünümde menü taşıyor', type: 'bug', points: 3, epic: MOBILE, who: 'lena', sprints: [3], added: [3, 2], moves: [[3, 2, 'in_progress']] },
  // Not planned yet. Clearing old records waits for the retention setting; the document waits for both.
  { key: 'b1', title: 'Süresi dolan kayıtları her gece temizle', type: 'story', points: 5, epic: SECURITY, who: null, sprints: [], moves: [] },
  { key: 'b2', title: 'Güvenlik dokümanına saklama bölümü ekle', type: 'task', points: 2, epic: SECURITY, who: null, sprints: [], moves: [] },
  { key: 'b3', title: 'Raporları zamanlanmış olarak gönder', type: 'story', points: 5, epic: REPORTS, who: null, sprints: [], moves: [] },
  { key: 'b4', title: 'Mobilde koyu tema', type: 'story', points: 3, epic: MOBILE, who: null, sprints: [], moves: [] },
  { key: 'b5', title: 'Sesli komutla görev ekleme araştırması', type: 'spike', points: null, epic: MOBILE, who: null, sprints: [], moves: [] },
];

/** a8 blocks b1, which blocks b2. */
const CHAIN: [string, string][] = [
  ['a8', 'b1'],
  ['b1', 'b2'],
];

const DAY = 86_400_000;
const dateOf = (offset: number) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);

export interface ProductSeed {
  board: string;
  /** Story ids by their key above (a1 … b5), and the epics as e0 … e2. */
  tasks: Record<string, string>;
  /** When something happened on a working day of a sprint, as an instant (for the inbox). */
  at: (sprint: number, day: number, minute?: number) => string;
  /** The running sprint's last working day before today. */
  lastDay: number;
  active: number;
}

export async function seedProduct(o: {
  send: Call;
  call: Call;
  db?: Db;
  locale: Locale;
  tx: (s: string) => string;
  who: (key: PersonKey) => string;
  accounts: Record<string, string>;
}): Promise<ProductSeed | null> {
  const { send, call, db, locale: L, tx, who } = o;

  // ---- the calendar: sprints of ten working days, on the company's own weekend
  const weekend = new Set(weekendOf(L));
  const working = (offset: number) => !weekend.has(isoWeekday(dateOf(offset)));
  /** The calendar day (from today) of a sprint's n-th working day; −1 is the working day before it starts. */
  const startOf: number[] = [];
  const cal = (s: number, d: number) => {
    let off = startOf[s];
    while (!working(off)) off++;
    for (let n = 0; n < d; ) if (working(++off)) n++;
    for (let n = 0; n > d; ) if (working(--off)) n--;
    return off;
  };
  // The running sprint started on a Monday: last week's, early in the week; this week's from Thursday on.
  const wd = isoWeekday(dateOf(0));
  startOf[ACTIVE] = wd <= 3 ? -(wd - 1) - 7 : -(wd - 1);
  for (let s = ACTIVE - 1; s >= 0; s--) startOf[s] = startOf[s + 1] - 14;
  // What the running sprint has done so far happened before today.
  let lastDay = 0;
  while (cal(ACTIVE, lastDay + 1) < 0) lastDay++;
  const clamp = (s: number, d: number) => (s === ACTIVE ? Math.min(d, lastDay) : d);
  const midnight = Date.parse(`${dateOf(0)}T00:00:00Z`);
  const at = (s: number, d: number, minute = 600) => new Date(midnight + cal(s, clamp(s, d)) * DAY + minute * 60_000).toISOString();

  // ---- the team and its board, made with the product-development preset
  const { id: team } = await send<{ id: string }>('POST', '/api/admin/teams', {
    name: translate(L, 'tpl.product'),
    leadId: who('lena'),
    memberIds: (['ada', 'mert', 'zeynep', 'omar'] as PersonKey[]).map(who),
  }).catch(() => ({ id: null as string | null }));
  const made = await send<{ board: { id: string } }>('POST', '/api/boards', {
    name: tx('Ürün geliştirme'),
    visibility: team ? 'team' : 'org',
    teamId: team,
    memberIds: [who('ada')],
    columns: pmColumns(L),
  }).catch((e) => (console.warn('[seed] product board', e), null));
  if (!made) return null;
  const board = made.board.id;

  const tasks: Record<string, string> = {};
  const pm = async (id: string, version: number, body: Record<string, unknown>) => call('PATCH', `/api/tasks/${id}/pm`, { baseVersion: version, ...body });
  for (const [i, title] of EPICS.entries()) {
    const { task } = await call('POST', '/api/tasks', { boardId: board, title, status: 'in_progress' });
    await pm(task.id, task.version, { issueType: 'epic' });
    tasks[`e${i}`] = task.id;
  }
  const columnOf = (st: Story) => st.moves.at(-1)?.[2] ?? (st.sprints.length ? 'ready' : 'backlog');
  for (const st of STORIES) {
    const { task } = await call('POST', '/api/tasks', {
      boardId: board,
      title: st.title,
      status: columnOf(st),
      assigneeIds: st.who ? [who(st.who)] : [],
      priority: st.type === 'bug' || st.account ? 'high' : 'normal',
      ...(st.account && o.accounts[st.account] ? { accountId: o.accounts[st.account] } : {}),
      ...(st.description ? { description: st.description } : {}),
    });
    await pm(task.id, task.version, { issueType: st.type, storyPoints: st.points, epicId: tasks[`e${st.epic}`] });
    tasks[st.key] = task.id;
  }
  const sprints: string[] = [];
  for (const [s, [name, goal]] of SPRINTS.entries()) {
    const { sprint } = await call('POST', `/api/boards/${board}/sprints`, { name, goal, startsOn: dateOf(cal(s, 0)), endsOn: dateOf(cal(s, LENGTH - 1)) });
    sprints.push(sprint.id);
    const items = STORIES.filter((st) => st.sprints.at(-1) === s).map((st) => tasks[st.key]);
    if (items.length) await send('PUT', `/api/sprints/${sprint.id}/items`, { taskIds: items });
  }
  await send('PUT', `/api/sprints/${sprints[ACTIVE]}/state`, { state: 'active' });
  for (const [from, to] of CHAIN) await send('POST', `/api/tasks/${tasks[from]}/links`, { otherId: tasks[to], kind: 'blocks' }).catch(() => undefined);

  const out: ProductSeed = { board, tasks, at, lastDay, active: ACTIVE };
  if (!db) return out;

  // ---- the past, written with its own dates
  type Ev = { task: string; actor: string; from: string; to: string; at: string };
  const events: Ev[] = [];
  const rows: { id: string; made: string; touched: string; done: string | null }[] = [];
  /** When each story entered and left Done, and when it joined a sprint after the start. */
  const doneAt = new Map<string, number>();
  const addedAt = new Map<string, number>();
  for (const [i, st] of STORIES.entries()) {
    const actor = who(st.who ?? 'lena');
    const first = st.sprints[0];
    // Written up a few days before the sprint it was planned for (or, unplanned, some weeks ago).
    const made = st.added ? at(st.added[0], st.added[1], 480 + (i % 5) * 20) : first !== undefined ? at(first, -2 - (i % 4), 540 + (i * 37) % 300) : at(1 + (i % 3), 3 + (i % 5), 600);
    let status = 'backlog';
    let last = made;
    const step = (to: string, when: string) => {
      events.push({ task: tasks[st.key], actor, from: status, to, at: when });
      status = to;
      last = when;
    };
    // Planned: moved to Ready the working day before (or when it was added).
    if (first !== undefined) step('ready', st.added && st.added[0] === first ? at(first, st.added[1], 500 + (i % 5) * 20) : at(first, -1, 900 + (i % 6) * 10));
    for (const [j, [s, d, to]] of st.moves.entries()) step(to, at(s, d, 560 + ((i * 41) % 200) + j * 70));
    if (status === 'done') doneAt.set(st.key, Date.parse(last));
    if (st.added) addedAt.set(`${st.key}:${st.added[0]}`, Date.parse(made));
    rows.push({ id: tasks[st.key], made, touched: last, done: status === 'done' ? last : null });
  }
  for (const i of EPICS.keys()) {
    const made = at(0, -6 - i, 600);
    // Each epic opened when its first story was picked up.
    const opened = at(i === MOBILE ? 2 : i === REPORTS ? 0 : 1, 0, 540);
    events.push({ task: tasks[`e${i}`], actor: who('lena'), from: 'backlog', to: 'in_progress', at: opened });
    rows.push({ id: tasks[`e${i}`], made, touched: opened, done: null });
  }

  // The burndown's daily readings, and what each sprint committed to and delivered.
  const pts = (st: Story) => st.points ?? 0;
  const snaps: { sprint: string; day: string; tp: number; rp: number; tc: number; rc: number }[] = [];
  const books: { id: string; start: string; end: string; sp: number; sc: number; dp: number; dc: number; closed: boolean }[] = [];
  for (const s of SPRINTS.keys()) {
    const members = STORIES.filter((st) => st.sprints.includes(s));
    const joined = (st: Story) => addedAt.get(`${st.key}:${s}`) ?? -Infinity;
    const committed = members.filter((st) => !addedAt.has(`${st.key}:${s}`));
    const first = cal(s, 0);
    const end = cal(s, LENGTH - 1);
    const reading = (eod: number) => {
      const inside = members.filter((st) => joined(st) <= eod);
      const done = inside.filter((st) => (doneAt.get(st.key) ?? Infinity) <= eod);
      return { tp: inside.reduce((n, st) => n + pts(st), 0), tc: inside.length, dp: done.reduce((n, st) => n + pts(st), 0), dc: done.length };
    };
    for (let c = first; c <= Math.min(end, -1); c++) {
      const r = reading(midnight + (c + 1) * DAY - 1);
      snaps.push({ sprint: sprints[s], day: dateOf(c), tp: r.tp, rp: r.tp - r.dp, tc: r.tc, rc: r.tc - r.dc });
    }
    const final = reading(midnight + (end + 1) * DAY - 1);
    books.push({
      id: sprints[s],
      start: dateOf(first),
      end: dateOf(end),
      sp: committed.reduce((n, st) => n + pts(st), 0),
      sc: committed.length,
      dp: final.dp,
      dc: final.dc,
      closed: s !== ACTIVE,
    });
  }

  await db.system(async (q) => {
    await q.query(
      `update tasks t set created_at = x.made::timestamptz, updated_at = x.touched::timestamptz, done_at = x.done::timestamptz
         from jsonb_to_recordset($1::jsonb) as x(id uuid, made text, touched text, done text) where t.id = x.id`,
      [JSON.stringify(rows)],
    );
    await q.query(
      `update task_events e set created_at = t.created_at from tasks t where e.task_id = t.id and e.kind = 'created' and t.board_id = $1`,
      [board],
    );
    await q.query(
      `insert into task_events (org_id, task_id, actor_id, kind, data, created_at)
       select t.org_id, x.task, x.actor, 'status', jsonb_build_object('from', x."from", 'to', x."to"), x.at::timestamptz
         from jsonb_to_recordset($1::jsonb) as x(task uuid, actor uuid, "from" text, "to" text, at text) join tasks t on t.id = x.task`,
      [JSON.stringify(events)],
    );
    await q.query(
      `update sprints s set created_at = (x.start::date - 3)::timestamptz, state = case when x.closed then 'closed' else s.state end,
              started_on = x.start::date, start_points = x.sp, start_count = x.sc,
              closed_on = case when x.closed then x.end::date end,
              done_points = case when x.closed then x.dp end, done_count = case when x.closed then x.dc end
         from jsonb_to_recordset($1::jsonb) as x(id uuid, start text, "end" text, sp int, sc int, dp int, dc int, closed boolean) where s.id = x.id`,
      [JSON.stringify(books)],
    );
    await q.query(
      `insert into sprint_burndowns (org_id, board_id, sprint_id, day, total_points, remaining_points, total_count, remaining_count)
       select s.org_id, s.board_id, s.id, x.day::date, x.tp, x.rp, x.tc, x.rc
         from jsonb_to_recordset($1::jsonb) as x(sprint uuid, day text, tp int, rp int, tc int, rc int) join sprints s on s.id = x.sprint
       on conflict (org_id, sprint_id, day) do nothing`,
      [JSON.stringify(snaps)],
    );
    // The people were told about their stories when the stories were written, and have read it since.
    await q.query(
      `update notifications n set created_at = t.created_at, read_at = t.created_at + interval '2 hours', state = 'sent', via = 'inapp', sent_at = t.created_at
         from tasks t where n.task_id = t.id and t.board_id = $1 and n.kind = 'assigned'`,
      [board],
    );
  });
  return out;
}
