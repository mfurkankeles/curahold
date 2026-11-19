// The demo hub's tours speak all nine languages, the product and sales roles
// have tours of their own, and the three-question picker answers every
// combination with real tours.
import { describe, expect, it } from 'vitest';
import { LOCALES } from '../shared/src/i18n';
import { ar } from '../shared/src/i18n/ar';
import { en } from '../shared/src/i18n/en';
import { fa } from '../shared/src/i18n/fa';
import { he } from '../shared/src/i18n/he';
import { ja } from '../shared/src/i18n/ja';
import { ko } from '../shared/src/i18n/ko';
import { tr } from '../shared/src/i18n/tr';
import { zhHans } from '../shared/src/i18n/zh-Hans';
import { zhHant } from '../shared/src/i18n/zh-Hant';
import { INTENT_TEAMS, INTENT_TODAY, TOURS, TOUR_GOALS, TOUR_ROLES, intentTable, pickTours, tourById } from '../shared/src/tours';

const DICTS: Record<string, Record<string, string>> = { en, tr, ar, he, fa, 'zh-Hans': zhHans, 'zh-Hant': zhHant, ja, ko } as any;

describe('the tours', () => {
  it('every tour and role has its words in all nine languages', () => {
    expect(Object.keys(DICTS).sort()).toEqual([...LOCALES].sort());
    for (const t of TOURS) {
      const keys = [`demo.tour.${t.id}.title`, `demo.tour.${t.id}.blurb`, ...t.steps.flatMap((_, i) => [`demo.tour.${t.id}.${i + 1}.title`, `demo.tour.${t.id}.${i + 1}.body`])];
      for (const [l, d] of Object.entries(DICTS)) for (const k of keys) expect(d[k], `${l} ${k}`).toBeTruthy();
    }
    for (const r of TOUR_ROLES) for (const [l, d] of Object.entries(DICTS)) expect(d[`demo.tour.role.${r}`], `${l} role ${r}`).toBeTruthy();
  });

  it('product and sales have tours of their own: the sprint, the hand-over', () => {
    expect(TOURS.filter((t) => t.roles.includes('product')).map((t) => t.id)).toContain('sprint');
    expect(TOURS.filter((t) => t.roles.includes('seller')).map((t) => t.id)).toEqual(expect.arrayContaining(['pipeline', 'handover']));
    expect(tourById('sprint')!.steps[0].path).toContain(':product');
    expect(tourById('move-in')!.steps[0].path).toBe('/import');
  });
});

describe('three questions, the right tours', () => {
  it('answers every combination with three real tours', () => {
    const table = intentTable();
    expect(Object.keys(table)).toHaveLength(INTENT_TEAMS.length * TOUR_GOALS.length * INTENT_TODAY.length);
    for (const a of Object.values(table)) {
      expect(a.tours).toHaveLength(3);
      expect(new Set(a.tours).size).toBe(3);
      for (const id of a.tours) expect(tourById(id)).toBeTruthy();
    }
  });

  it('starts each team where it lives', () => {
    expect(pickTours({ team: 'product', goal: 'week', today: 'tracker' }).tours[0]).toBe('sprint');
    expect(pickTours({ team: 'sales', goal: 'grow', today: 'crm' }).tours).toContain('handover');
    const sheet = pickTours({ team: 'success', goal: 'setup', today: 'sheet' });
    expect(sheet.tours[0]).toBe('move-in');
    expect(sheet.ownFile).toBe(true);
    expect(pickTours({ team: 'lead', goal: 'see', today: 'nothing' }).ownFile).toBe(false);
  });
});
