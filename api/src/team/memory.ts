// What a seat remembers: a rolling summary and key facts, in the seat's own
// memory (agent_memory, so it stays with the seat when the person or agent in
// it changes). The owner can read, correct and delete every entry; the agent
// reads these instead of whole histories (fewer tokens).
import type { Q } from '../db';

export const SUMMARY_KEY = 'summary';
export const FACT_PREFIX = 'fact.';
const MAX_FACTS = 60;

export interface SeatMemory {
  summary: { value: string; updatedAt: string } | null;
  facts: { key: string; value: string; updatedAt: string }[];
}

/** A seat's memory: its running summary and its saved facts, newest first. */
export async function readMemory(q: Q, seat: string): Promise<SeatMemory> {
  const rows = await q.query<{ key: string; value: string; updated_at: Date }>('select key, value, updated_at from agent_memory where seat = $1 order by updated_at desc', [seat]);
  const at = (d: Date) => new Date(d).toISOString();
  const s = rows.find((r) => r.key === SUMMARY_KEY);
  return {
    summary: s ? { value: s.value, updatedAt: at(s.updated_at) } : null,
    facts: rows.filter((r) => r.key.startsWith(FACT_PREFIX)).map((r) => ({ key: r.key, value: r.value, updatedAt: at(r.updated_at) })),
  };
}

/** Saves or replaces one memory entry for a seat. */
export async function writeMemory(q: Q, seat: string, key: string, value: string) {
  await q.query(`insert into agent_memory (seat, key, value) values ($1, $2, $3) on conflict (seat, key) do update set value = excluded.value, updated_at = now()`, [seat, key, value.slice(0, 16000)]);
}

/** Removes one memory entry; true if it existed. */
export async function deleteMemory(q: Q, seat: string, key: string): Promise<boolean> {
  const r = await q.query('delete from agent_memory where seat = $1 and key = $2 returning key', [seat, key]);
  return r.length > 0;
}

/** A new fact from a conversation; the oldest go when there are too many (the summary keeps the gist). */
export async function addFact(q: Q, seat: string, value: string, now: Date) {
  const text = value.trim().slice(0, 1000);
  if (!text) return null;
  const [same] = await q.query(`select key from agent_memory where seat = $1 and key like 'fact.%' and value = $2`, [seat, text]);
  if (same) return String(same.key);
  const key = `${FACT_PREFIX}${now.toISOString().replace(/\D/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 6)}`;
  await writeMemory(q, seat, key, text);
  await q.query(
    `delete from agent_memory where seat = $1 and key in (select key from agent_memory where seat = $1 and key like 'fact.%' order by updated_at desc offset ${MAX_FACTS})`,
    [seat],
  );
  return key;
}

/** The memory as the agent reads it: short, capped. */
export function memoryBlock(m: SeatMemory, cap = 3000): string {
  const parts: string[] = [];
  if (m.summary) parts.push(`Summary so far:\n${m.summary.value}`);
  if (m.facts.length) parts.push(`Facts (the CEO can correct these):\n${m.facts.map((f) => `- ${f.value}`).join('\n')}`);
  const text = parts.join('\n\n') || 'No memory yet.';
  return text.length > cap ? `${text.slice(0, cap)}…` : text;
}
