import { addDays, localDate } from '../../../shared/src/days';
// Due-date state drives the colour rail on cards, the calendar and My tasks.
export type DueState = 'none' | 'late' | 'today' | 'soon' | 'later' | 'done';

// "Today" follows the company's clock (shared/src/days.ts), the same day the
// server uses: somebody travelling sees the same "due today" as colleagues.
// Until the session is loaded there is no company yet; the device's day does.
let companyZone: string | null = null;

/** Called once the session is known (and again if an admin changes the company's time zone). */
export function setCompanyZone(tz: string | null | undefined) {
  companyZone = tz || null;
}

export function todayIso(now = new Date()): string {
  if (companyZone) return localDate(now, companyZone);
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export { addDays };

export function dueState(due: string | null, done: boolean, today = todayIso()): DueState {
  if (done) return 'done';
  if (!due) return 'none';
  if (due < today) return 'late';
  if (due === today) return 'today';
  if (due <= addDays(today, 3)) return 'soon';
  return 'later';
}

export function relativeTime(iso: string, t: (k: any, v?: any) => string, now = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return t('time.justNow');
  if (min < 60) return t('time.minutesAgo', { n: min });
  const h = Math.floor(min / 60);
  if (h < 24) return t('time.hoursAgo', { n: h });
  return t('time.daysAgo', { n: Math.floor(h / 24) });
}
