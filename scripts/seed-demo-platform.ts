// A demo-only "platform" of invented tenants, so the owner's business-metrics
// screen has a realistic shape to walk an investor through — many companies on
// varied plans, a sign-up funnel, and daily activity. It is NEVER run in
// production: only the in-browser demo server calls it, right after seedDemo.
//
// Everything here is invented. The companies and people do not exist; the
// numbers are sample data. The metrics screen already shows a "Demo data" badge
// (config.billing is unset in the demo), so nothing here is presented as real
// traction. Tenants are isolated by row-level security, so none of this shows
// in the demo user's own account views — only the cross-tenant owner metrics
// aggregate it.
import type { Db } from '../api/src/db';

const PRE = [
  'Northpeak', 'Brightwell', 'Vireo', 'Marisol', 'Keystone', 'Oreli', 'Amberline', 'Cobalt',
  'Fenwick', 'Harborview', 'Larkspur', 'Meridian', 'Novel', 'Opalfield', 'Perchwood', 'Quillark',
  'Rowanvale', 'Solstice', 'Tamarind', 'Umbra', 'Verdeco', 'Wrenly', 'Yarrow', 'Zephyrix',
];
const SUF = [
  'Retail', 'Logistics', 'Labs', 'Foods', 'Mobility', 'Health', 'Cosmetics', 'Finance', 'Travel',
  'Media', 'Systems', 'Analytics', 'Commerce', 'Studios', 'Networks', 'Freight', 'Grocers', 'Apparel',
];
const FIRST = ['Mira', 'Arun', 'Noa', 'Kerem', 'Lina', 'Mateo', 'Sena', 'Ivan', 'Priya', 'Luca', 'Sofia', 'Hana', 'Diego', 'Aya', 'Ravi', 'Nadia'];
const LAST = ['Novak', 'Reyes', 'Okafor', 'Lindqvist', 'Marek', 'Costa', 'Nair', 'Beckett', 'Haas', 'Osei', 'Vega', 'Roca', 'Pike', 'Dunne', 'Weiss', 'Faber'];

type Status = 'active' | 'past_due' | 'trialing' | 'canceled';

/** 48 tenants: 21 paying (2 past due), 14 on trial, 13 cancelled (4 churned in 30d). */
function plan(i: number): { status: Status; plan: 'team' | 'business'; interval: 'month' | 'year'; seats: number; createdAgo: number; eventAgo: number } {
  const planKey = i % 5 < 3 ? 'team' : 'business';
  const interval = i % 10 < 7 ? 'month' : 'year';
  const seats = planKey === 'team' ? 4 + ((i * 7) % 13) : 3 + ((i * 5) % 10);
  const createdAgo = 20 + ((i * 29) % 330); // spread across ~11 months
  if (i < 19) return { status: 'active', plan: planKey, interval, seats, createdAgo, eventAgo: Math.max(5, createdAgo - 10) };
  if (i < 21) return { status: 'past_due', plan: planKey, interval, seats, createdAgo, eventAgo: Math.max(5, createdAgo - 10) };
  if (i < 35) return { status: 'trialing', plan: planKey, interval, seats, createdAgo: 2 + ((i * 3) % 16), eventAgo: 0 };
  // cancelled — four of them within the last 30 days (for churn-30)
  const eventAgo = i < 39 ? 3 + (i % 25) : 40 + ((i * 11) % 200);
  return { status: 'canceled', plan: planKey, interval, seats, createdAgo: eventAgo + 30 + (i % 40), eventAgo };
}

export async function seedPlatform(db: Db, opts: { locale?: 'en' | 'tr' } = {}): Promise<void> {
  const locale = opts.locale ?? 'tr';
  let s = 987654321;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const ago = (d: number) => new Date(Date.now() - d * 86400_000).toISOString();

  await db.system(async (q) => {
    const COUNT = 48;
    const used = new Set<string>();
    const name = (i: number) => {
      let n = `${PRE[i % PRE.length]} ${SUF[(i * 3 + Math.floor(i / PRE.length)) % SUF.length]}`;
      while (used.has(n)) n = `${PRE[(i + used.size) % PRE.length]} ${SUF[(i * 7 + used.size) % SUF.length]}`;
      used.add(n);
      return n;
    };

    const orgIds: string[] = [];
    const auditRows: unknown[][] = [];

    for (let i = 0; i < COUNT; i++) {
      const p = plan(i);
      const slug = `demo-co-${i + 1}`;
      const createdAt = ago(p.createdAgo);
      const billing =
        p.status === 'trialing'
          ? { status: 'trialing' }
          : { status: p.status, plan: p.plan, interval: p.interval, seats: p.seats, eventAt: ago(p.eventAgo) };
      const trialEnds = p.status === 'trialing' ? ago(-(2 + Math.floor(rnd() * 11))) : null;

      const [org] = (await q.query(
        `insert into orgs (slug, name, locale, plan, billing, trial_ends_at, created_at)
         values ($1, $2, $3, $4, $5::jsonb, $6, $7) returning id`,
        [slug, name(i), locale, p.status === 'trialing' ? 'trial' : p.plan, JSON.stringify(billing), trialEnds, createdAt],
      )) as { id: string }[];
      const orgId = org.id;
      orgIds.push(orgId);

      const [role] = (await q.query(`insert into roles (org_id, key, name, system) values ($1, 'owner', 'Owner', true) returning id`, [orgId])) as { id: string }[];

      // Cancelled tenants have gone quiet; the rest have 2–4 people and recent activity.
      const nUsers = p.status === 'canceled' ? 1 : 2 + Math.floor(rnd() * 3);
      for (let u = 0; u < nUsers; u++) {
        const seat = rnd() < 0.78 ? 'full' : 'viewer';
        const status = p.status === 'canceled' ? 'disabled' : 'active';
        const [usr] = (await q.query(
          `insert into users (org_id, email, name, role_id, seat, status, created_at) values ($1, $2, $3, $4, $5, $6, $7) returning id`,
          [orgId, `u${u}@${slug}.example`, `${pick(FIRST)} ${pick(LAST)}`, role.id, seat, status, createdAt],
        )) as { id: string }[];
        if (p.status === 'canceled') continue;
        // Each active user has one most-recent-activity day (so DAU ≪ WAU ≪ MAU,
        // like a real product) plus older rows trailing back, for the trend.
        const roll = rnd();
        const last = roll < 0.18 ? rnd() * 0.9 : roll < 0.58 ? 1 + rnd() * 6 : 7 + rnd() * 23;
        const ev = () => [orgId, usr.id, pick(['view', 'update', 'create']), pick(['board', 'account', 'task', 'meeting'])] as const;
        auditRows.push([...ev(), ago(last)]);
        const older = 1 + Math.floor(rnd() * 6);
        for (let r = 0; r < older; r++) auditRows.push([...ev(), ago(last + rnd() * (30 - last))]);
      }
    }

    // Activity, in one batch.
    for (let i = 0; i < auditRows.length; i += 150) {
      const slice = auditRows.slice(i, i + 150);
      const ph = slice.map((_, r) => `($${r * 5 + 1}, $${r * 5 + 2}, $${r * 5 + 3}, $${r * 5 + 4}, $${r * 5 + 5})`).join(',');
      await q.query(`insert into audit_log (org_id, actor_id, action, entity, at) values ${ph}`, slice.flat());
    }

    // A sign-up funnel: ~132 sign-ups, ~96 verified, 48 became companies.
    const signupRows: unknown[][] = [];
    for (let i = 0; i < 132; i++) {
      const createdAgo = 1 + Math.floor(rnd() * 120);
      const verified = rnd() < 0.73 ? ago(createdAgo - (rnd() < 0.5 ? 0 : 1)) : null;
      const orgId = i < orgIds.length ? orgIds[i] : null; // 48 converted to companies
      signupRows.push([`signup${i}@lead.example`, `demo-seed-${i}`, locale, verified, orgId, ago(createdAgo - 7), ago(createdAgo)]);
    }
    for (let i = 0; i < signupRows.length; i += 150) {
      const slice = signupRows.slice(i, i + 150);
      const ph = slice.map((_, r) => `($${r * 7 + 1}, $${r * 7 + 2}, $${r * 7 + 3}, $${r * 7 + 4}, $${r * 7 + 5}, $${r * 7 + 6}, $${r * 7 + 7})`).join(',');
      await q.query(`insert into signups (email, token_hash, locale, verified_at, org_id, expires_at, created_at) values ${ph}`, slice.flat());
    }
  });
}
