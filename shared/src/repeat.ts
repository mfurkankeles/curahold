// When a repeating task is next due. Pure date arithmetic on ISO days, so
// the API and the app agree and tests need no clock.
import type { Repeat } from './model';

const pad = (n: number) => String(n).padStart(2, '0');
const toIso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

export function addInterval(iso: string, r: Pick<Repeat, 'every' | 'unit'>): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (r.unit === 'month') {
    // 31 January + 1 month = 28/29 February, not 3 March.
    const target = new Date(Date.UTC(y, m - 1 + r.every, 1));
    const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(d, last));
    return toIso(target);
  }
  const days = r.unit === 'week' ? r.every * 7 : r.every;
  return toIso(new Date(Date.UTC(y, m - 1, d + days)));
}

/** The next due date: from the old due date (catching up past today) or from the day it was done. */
export function nextDue(r: Repeat, due: string | null, today: string): string {
  if (r.from === 'done' || !due) return addInterval(today, r);
  let next = addInterval(due, r);
  for (let i = 0; next <= today && i < 1000; i++) next = addInterval(next, r);
  return next;
}
