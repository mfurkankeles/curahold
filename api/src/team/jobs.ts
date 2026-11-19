// "Koltuğu devret": everything a person needs to take a seat — the handover
// pack (card, open work, memory, recent log, access list) and a job
// description with an interview kit, both generated from the seat's card, so
// the human uses the same title, queues, log and approval rules as the agent.
import type { Deps } from '../context';
import { LADDER } from '../../../shared/src/team/orgChart';
import { goldenTasks } from '../../../shared/src/team/golden';
import { seatPolicy } from './policy';

type Lang = 'tr' | 'en';
const W = {
  tr: { mission: 'Misyon', does: 'Sorumluluklar', kpis: 'Başarı ölçütleri', inputs: 'Girdiler', outputs: 'Çıktılar', access: 'Erişimler (en az yetki)', reports: 'Bağlı olduğu kişi', level: 'Kademe', rules: 'Çalışma kuralları', kit: 'Mülakat seti', sample: 'Örnek iş (altın görev)', ask: 'Soru', ceo: 'CEO', gate: 'Dışarıya etkisi olan her iş (canlıya alma, gönderim, harcama, silme, sözleşme) CEO onayıyla yapılır; aynı onay kuyruğu ve şirket kaydı kullanılır.', probe: (r: string) => `"${r}" konusunda son yaptığınız işi anlatın: neyi, nasıl ölçtünüz?` },
  en: { mission: 'Mission', does: 'Responsibilities', kpis: 'Success measures', inputs: 'Inputs', outputs: 'Outputs', access: 'Access (least privilege)', reports: 'Reports to', level: 'Level', rules: 'Working rules', kit: 'Interview kit', sample: 'Work sample (golden task)', ask: 'Question', ceo: 'CEO', gate: 'Anything with an outside effect (go-live, sending, spending, deleting, contracts) needs the CEO’s approval; the same approval queue and company log are used.', probe: (r: string) => `Tell us about the last time you did "${r}": what did you measure, and how?` },
};

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
    lang === 'tr' ? c.missionTr || c.mission : c.mission,
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
