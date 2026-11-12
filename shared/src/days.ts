// What day it is for a company.
//
// "Today", "overdue" and "this week" follow the company's own clock, not the
// server's (UTC) and not the device's: at 00:30 in Istanbul the UTC day is
// still yesterday, and somebody travelling should still see the same "due
// today" as their colleagues. Everything that needs the day comes here; the
// database gets the same answer through app_today() (set per request).

/** The calendar day (YYYY-MM-DD) at this moment in a time zone. An unknown zone falls back to UTC. */
export function localDate(now: Date, timeZone: string | null | undefined): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** The hour (0 to 23) at this moment in a time zone. */
export function localHour(now: Date, timeZone: string | null | undefined): number {
  try {
    return Number(new Intl.DateTimeFormat('en-GB', { timeZone: timeZone || 'UTC', hour: '2-digit', hourCycle: 'h23' }).format(now));
  } catch {
    return now.getUTCHours();
  }
}

/** A day plus or minus some days; plain calendar arithmetic, so daylight saving cannot shift it. */
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
