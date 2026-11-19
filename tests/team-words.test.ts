// The AI-team screens' words (shared/src/i18n/ownerTeam.ts): Turkish and
// English, complete and in step, and every key the screens name exists —
// including the dynamic families (teams, activities, wake results, statuses).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { JOB_WORDS, TEAM_EN, TEAM_TR } from '../shared/src/i18n/ownerTeam';
import { MEETING_STATUSES } from '../shared/src/office';
import { TEAMS } from '../shared/src/team/orgChart';

const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('AI team words', () => {
  it('Turkish and English have the same keys and placeholders, none empty', () => {
    expect(Object.keys(TEAM_TR).sort()).toEqual(Object.keys(TEAM_EN).sort());
    for (const [k, v] of Object.entries(TEAM_EN)) {
      expect(v.trim(), k).not.toBe('');
      expect(ph(TEAM_TR[k as keyof typeof TEAM_EN]), k).toEqual(ph(v));
    }
    expect(Object.keys(JOB_WORDS.tr).sort()).toEqual(Object.keys(JOB_WORDS.en).sort());
  });

  it('every key the screens name exists, and every dynamic family is covered', () => {
    const src = ['web/src/pages/OwnerTeam.tsx', 'web/src/pages/Desk.tsx'].map((f) => readFileSync(join(import.meta.dirname, '..', f), 'utf8')).join('\n');
    const named = [...src.matchAll(/\b(?:w|teamWords)\('([a-zA-Z0-9_.-]+)'/g)].map((m) => m[1]).filter((k) => !k.endsWith('.'));
    expect(named.filter((k) => !(k in TEAM_EN))).toEqual([]);
    const want = [
      ...TEAMS.map((t) => `teamName.${t}`),
      ...['working', 'meeting', 'waiting-approval', 'queued', 'idle', 'paused', 'dormant'].map((a) => `activity.${a}`),
      ...['skipped', 'ran', 'paused', 'inactive', 'dormant', 'budget', 'human'].map((r) => `seat.wakeResult.${r}`),
      ...MEETING_STATUSES.map((s) => `meet.status.${s}`),
      ...['over-budget', 'over-time', 'cancelled'].map((s) => `meet.roundResult.${s}`),
    ];
    expect(want.filter((k) => !(k in TEAM_EN))).toEqual([]);
  });
});
