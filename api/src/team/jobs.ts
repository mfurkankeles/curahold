// "Koltuğu devret": everything a person needs to take a seat — the handover
// pack (card, open work, memory, recent log, access list) and a job
// description with an interview kit, both generated from the seat's card, so
// the human uses the same title, queues, log and approval rules as the agent.
import type { Deps } from '../context';
import { LADDER } from '../../../shared/src/team/orgChart';
import { goldenTasks } from '../../../shared/src/team/golden';
import { seatPolicy } from './policy';
import { cardText, JOB_WORDS } from '../../../shared/src/i18n/ownerTeam';

type Lang = 'tr' | 'en';
const W = JOB_WORDS;

export async function jobDescription(deps: Pick<Deps, 'db'>, seat: string, lang: Lang): Promise<string | null> {
  const p = await deps.db.system((q) => seatPolicy(q, seat));
  if (!p) return null;
  const w = W[lang];
  const c = p.card;
  const level = (c as { level?: string }).level;
  const list = (xs: string[] | undefined) => (xs ?? []).map((x) => `- ${x}`).join('\n');
  const tasks = goldenTasks(seat).filter((t) => !t.id.endsWith('.gate'));
  return [
    `# ${p.title}`,
    level && (LADDER as readonly string[]).includes(level) ? `${w.level}: ${level}` : '',
    `${w.reports}: ${p.reportsTo ?? w.ceo}`,
    '',
    `## ${w.mission}`,
    cardText(lang, { tr: c.missionTr }, c.mission),
    '',
    `## ${w.does}`,
    list(c.responsibilities),
    '',
    `## ${w.kpis}`,
    list(c.kpis),
    '',
    `## ${w.inputs} / ${w.outputs}`,
    list(c.inputs),
    list(c.outputs),
    '',
    `## ${w.access}`,
    list(c.permissions),
    '',
    `## ${w.rules}`,
    `- ${w.gate}`,
    list(c.playbook),
    '',
    `## ${w.kit}`,
    ...(c.responsibilities ?? []).slice(0, 4).map((r, i) => `${i + 1}. ${w.ask}: ${w.probe(r)}`),
    ...tasks.map((t, i) => `${(c.responsibilities ?? []).slice(0, 4).length + i + 1}. ${w.sample}: ${t.prompt}`),
  ]
    .filter((x) => x !== '')
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

/** A read-only preview of the handover pack (the handover itself is lib/office.ts handOver). */
export async function handoverPreview(deps: Pick<Deps, 'db'>, seat: string, lang: Lang) {
  const p = await deps.db.system((q) => seatPolicy(q, seat));
  if (!p) return null;
  const data = await deps.db.system(async (q) => ({
    openWork: await q.query(`select id, title, status, priority, due_at from agent_tasks where seat = $1 and status in ('queued', 'running', 'blocked') order by created_at`, [seat]),
    memory: await q.query('select key, value from agent_memory where seat = $1 order by key', [seat]),
    recentLog: await q.query('select at, kind, body, ref from company_log where seat = $1 order by id desc limit 20', [seat]),
    pendingApprovals: await q.query(`select ref, title from approvals where proposed_by = $1 and status = 'pending'`, [seat]),
  }));
  return {
    seat: p.seat,
    title: p.title,
    filledBy: p.filledBy,
    access: { tools: [...p.tools], data: p.card.permissions ?? [], proposes: [...p.proposes], reviews: [...p.reviews] },
    ...data,
    jobDescription: await jobDescription(deps, seat, lang),
  };
}
