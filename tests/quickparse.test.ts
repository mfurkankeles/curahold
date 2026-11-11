// Quick add reads due dates, people, customers, priority and rhythm out of
// one line of plain words, in Turkish and English, and leaves the rest as the title.
import { describe, expect, it } from 'vitest';
import { parseQuick, pickAt, removeToken } from '../web/src/lib/quickparse';

const people = [
  { id: 'u1', name: 'Ayşe Yılmaz' },
  { id: 'u2', name: 'Ali Demir' },
  { id: 'u3', name: 'Alim Kaya' },
  { id: 'u4', name: 'Çağrı İnce' },
];
const accounts = [
  { id: 'a1', name: 'Acme' },
  { id: 'a2', name: 'Acme Demo Ltd' },
  { id: 'a3', name: 'Velto Mobility Group Holdings' },
  { id: 'a4', name: 'Quillfield' },
];
const me = { id: 'me', name: 'Ada Demir' };
// Wednesday 11 November 2026
const today = new Date(2026, 10, 11);
const p = (line: string) => parseQuick(line, people, accounts, me, today);

describe('quick add', () => {
  it('reads everyday Turkish dates', () => {
    expect(p('Teklif gönder yarın').dueDate).toBe('2026-11-12');
    expect(p('Teklif gönder bugün').dueDate).toBe('2026-11-11');
    expect(p('Rapor cumaya kadar').dueDate).toBe('2026-11-13');
    expect(p('Rapor cumaya kadar').title).toBe('Rapor');
    expect(p('QBR hazırlığı haftaya').dueDate).toBe('2026-11-16');
    expect(p('Fatura kontrolü ay sonu').dueDate).toBe('2026-11-30');
    expect(p('Yenileme 15 kasım').dueDate).toBe('2026-11-15');
    expect(p('Yenileme 3 ocak').dueDate).toBe('2027-01-03');
    expect(p('Yenileme 15.12').dueDate).toBe('2026-12-15');
    expect(p('Kontrol 3 gün sonra').dueDate).toBe('2026-11-14');
    expect(p('Kontrol çarşamba').dueDate).toBe('2026-11-18');
    expect(p('Kontrol pazartesiye').dueDate).toBe('2026-11-16');
  });

  it('reads everyday English dates', () => {
    expect(p('Send proposal tomorrow').dueDate).toBe('2026-11-12');
    expect(p('Call Acme on friday').title).toBe('Call Acme');
    expect(p('Call Acme on friday').dueDate).toBe('2026-11-13');
    expect(p('Review next week').dueDate).toBe('2026-11-16');
    expect(p('Review in 2 weeks').dueDate).toBe('2026-11-25');
    expect(p('Kickoff nov 20').dueDate).toBe('2026-11-20');
    expect(p('Kickoff 20 Nov').dueDate).toBe('2026-11-20');
  });

  it('leaves look-alike words in the title', () => {
    expect(p('Pazar payı analizi').dueDate).toBeNull();
    expect(p('Yeni pazara açılma planı').dueDate).toBeNull();
    expect(p('Version 1.5 notes').dueDate).toBeNull();
    expect(p('15 market leads').dueDate).toBeNull();
    expect(p('Send 3 per day').dueDate).toBeNull();
    expect(p('Rapor pazar').dueDate).toBe('2026-11-15');
  });

  it('picks people, customers and priority', () => {
    const r = p('Acme ile yenileme görüşmesi cuma @ayşe #acme !yüksek');
    expect(r.title).toBe('Acme ile yenileme görüşmesi');
    expect(r.assignees.map((a) => a.id)).toEqual(['u1']);
    expect(r.account?.id).toBe('a1');
    expect(r.priority).toBe('high');
    expect(r.dueDate).toBe('2026-11-13');
    expect(p('Hazırlık @ben').assignees[0].id).toBe('me');
    expect(p('Hazırlık @Ali Demir').assignees[0].id).toBe('u2');
    expect(p('Hazırlık @cagri').assignees[0].id).toBe('u4');
    // "@ali" fits Ali and Alim: nobody is guessed.
    expect(p('Hazırlık @ali').assignees).toEqual([]);
    expect(p('Plan #Velto Mobility Group Holdings toplantısı').account?.id).toBe('a3');
    expect(p('Plan #Velto Mobility Group Holdings toplantısı').title).toBe('Plan toplantısı');
    expect(p('Hazırla #acme demo sunumu').account?.id).toBe('a1');
    expect(p('Fix !acil').priority).toBe('urgent');
  });

  it('reads a rhythm', () => {
    const r = p('Haftalık rapor her pazartesi');
    expect(r.repeat).toEqual({ every: 1, unit: 'week', from: 'due' });
    expect(r.dueDate).toBe('2026-11-16');
    expect(p('Yedek her 2 haftada bir').repeat).toEqual({ every: 2, unit: 'week', from: 'due' });
    expect(p('Check-in every month').repeat?.unit).toBe('month');
  });

  it('the × on a chip keeps words, drops picks, and quotes stay as written', () => {
    const line = 'Rapor cumaya kadar @ayşe';
    const r = p(line);
    const due = r.tokens.find((t) => t.kind === 'due')!;
    const kept = removeToken(line, due);
    expect(kept).toBe('Rapor "cumaya kadar" @ayşe');
    expect(p(kept).dueDate).toBeNull();
    expect(p(kept).title).toBe('Rapor cumaya kadar');
    expect(removeToken(line, r.tokens.find((t) => t.kind === 'person')!)).toBe('Rapor cumaya kadar');
  });

  it('knows when the caret is on a pick', () => {
    expect(pickAt('Rapor @ay', 9)).toEqual({ kind: '@', query: 'ay', start: 6, end: 9 });
    expect(pickAt('Rapor #', 7)?.kind).toBe('#');
    expect(pickAt('mail@x', 6)).toBeNull();
  });
});
