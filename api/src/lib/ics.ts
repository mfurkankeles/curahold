// A personal calendar feed (RFC 5545). Google Calendar, Outlook and Apple
// Calendar subscribe to a URL — no connection or permission needed, and the
// secret URL can be reset at any time.
export interface IcsTask {
  id: string;
  title: string;
  due: string; // YYYY-MM-DD
  url: string;
  account?: string | null;
  updatedAt: Date;
}

const escape = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// Lines longer than 75 octets are folded (continuation lines start with a space).
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let current = '';
  let size = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (size + n > (out.length ? 74 : 75)) {
      out.push(current);
      current = '';
      size = 0;
    }
    current += ch;
    size += n;
  }
  out.push(current);
  return out.join('\r\n ');
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const compact = (iso: string) => iso.replace(/-/g, '');
const nextDay = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
};

export function buildIcs(calName: string, tasks: IcsTask[], now: Date): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Tendwell//Tasks//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${escape(calName)}`, 'REFRESH-INTERVAL;VALUE=DURATION:PT1H'];
  for (const t of tasks) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${t.id}@tendwell`,
      `DTSTAMP:${stamp(now)}`,
      `LAST-MODIFIED:${stamp(t.updatedAt)}`,
      `DTSTART;VALUE=DATE:${compact(t.due)}`,
      `DTEND;VALUE=DATE:${compact(nextDay(t.due))}`,
      `SUMMARY:${escape(t.account ? `${t.title} — ${t.account}` : t.title)}`,
      `URL:${t.url}`,
      `DESCRIPTION:${escape(t.url)}`,
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
