// Office search: people by name, title (English or Turkish), team or the task
// they are on now. Accent- and case-insensitive in Turkish and English
// ("gulco" finds Gülco, "ılgın" and "ilgin" find each other). Pure.

export interface Findable {
  seat: string;
  name: string;
  title: string;
  titleTr: string;
  /** The team's name in the reader's language, and its key. */
  teamName: string;
  team: string;
  /** Task titles the seat is on (running first). */
  tasks: string[];
}
export interface Hit {
  seat: string;
  /** What matched, for the result line: the task, when it was a task. */
  field: 'name' | 'title' | 'team' | 'task';
  task?: string;
  score: number;
}

const FOLD: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', İ: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
export const fold = (s: string) =>
  s
    .replace(/[çğıİöşüâîû]/g, (c) => FOLD[c])
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** Each word of the query must start a word somewhere in the field (or sit inside a longer one, scored lower). */
function scoreIn(field: string, words: string[]): number {
  const f = fold(field);
  if (!f) return 0;
  const parts = f.split(' ');
  let s = 0;
  for (const w of words) {
    if (parts.some((p) => p === w)) s += 3;
    else if (parts.some((p) => p.startsWith(w))) s += 2;
    else if (f.includes(w)) s += 1;
    else return 0;
  }
  return s;
}

const WEIGHT = { name: 4, title: 3, team: 2, task: 1 } as const;

export function searchPeople(people: Findable[], query: string, limit = 12): Hit[] {
  const words = fold(query).split(' ').filter(Boolean);
  if (!words.length) return [];
  const hits: Hit[] = [];
  for (const p of people) {
    let best: Hit | null = null;
    const take = (field: Hit['field'], text: string, task?: string) => {
      const s = scoreIn(text, words);
      if (s && (!best || s * WEIGHT[field] > best.score)) best = { seat: p.seat, field, task, score: s * WEIGHT[field] };
    };
    take('name', p.name);
    take('title', `${p.title} ${p.titleTr}`);
    take('team', `${p.teamName} ${p.team}`);
    for (const t of p.tasks) take('task', t, t);
    if (best) hits.push(best);
  }
  return hits.sort((a, b) => b.score - a.score || a.seat.localeCompare(b.seat)).slice(0, limit);
}
