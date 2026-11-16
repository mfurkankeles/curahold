// The console's charts (web/src/pages/ConsoleChart.tsx): a round axis, and period names under it that
// never touch, at a phone's width or a desktop's, in Turkish, Japanese or Arabic.
import { describe, expect, it } from 'vitest';
import { labelled, ticksFor } from '../web/src/pages/ConsoleChart';

const months = (names: string[]) => names;
const tr = months(['Ara 2025', 'Oca 2026', 'Şub 2026', 'Mar 2026', 'Nis 2026', 'May 2026', 'Haz 2026', 'Tem 2026', 'Ağu 2026', 'Eyl 2026', 'Eki 2026', 'Kas 2026']);
const ja = tr.map((_, i) => `${i ? 2026 : 2025}年${i ? i : 12}月`);
const ar = ['ديسمبر 2025', 'يناير 2026', 'فبراير 2026', 'مارس 2026', 'أبريل 2026', 'مايو 2026', 'يونيو 2026', 'يوليو 2026', 'أغسطس 2026', 'سبتمبر 2026', 'أكتوبر 2026', 'نوفمبر 2026'];
const line = (n: number) => (k: number) => (k / (n - 1)) * 100;
const cols = (n: number) => (k: number) => ((k + 0.5) / n) * 100;

describe('the console chart', () => {
  it('rounds the axis up to at most four clean steps', () => {
    expect(ticksFor(3722)).toEqual([0, 1000, 2000, 3000, 4000]);
    expect(ticksFor(13)).toEqual([0, 5, 10, 15]);
    expect(ticksFor(0)).toEqual([0, 1]);
  });

  it('writes the first and the last period and a steady step between, never two touching', () => {
    for (const names of [tr, ja, ar])
      for (const width of [0, 180, 265, 340, 520, 900])
        for (const x of [line(names.length), cols(names.length)]) {
          const shown = [...labelled(names, width, x)].sort((a, b) => a - b);
          expect(shown.at(-1)).toBe(names.length - 1);
          if (width >= 265) expect(shown.length).toBeGreaterThanOrEqual(2);
          const steps = shown.slice(1, -1).map((k, i) => k - shown[i]);
          expect(new Set(steps).size).toBeLessThanOrEqual(1);
        }
    expect([...labelled(tr, 265, line(12))]).toEqual([0, 4, 11]);
    expect(labelled(tr, 900, line(12)).size).toBeGreaterThanOrEqual(6);
  });
});
