// The owner console's own words (shared/src/i18n/owner.ts): Turkish and
// English only, by the owner's choice; both complete and in step, every key
// the screens name exists, and every checklist item and dynamic family has its words.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHECKLIST, CHECKLIST_AREAS, CHECKLIST_OWNERS, CHECKLIST_PRIORITIES } from '../shared/src/checklist';
import { OWNER_EN, OWNER_TR, ownerWord } from '../shared/src/i18n/owner';
import { APPROVAL_STATUSES, PRIORITIES3, RISKS } from '../shared/src/office';
import { PLAN_METRICS } from '../shared/src/ownerConsole';
import { TRIAL_DEPARTMENTS, TRIAL_REQUEST_STATUSES } from '../shared/src/trialRequest';

const ROOT = join(import.meta.dirname, '..');
const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('owner console words', () => {
  it('Turkish and English have the same keys, none empty, the same placeholders', () => {
    expect(Object.keys(OWNER_TR).sort()).toEqual(Object.keys(OWNER_EN).sort());
    for (const [k, v] of Object.entries(OWNER_EN)) {
      expect(v.trim(), k).not.toBe('');
      expect(OWNER_TR[k as keyof typeof OWNER_EN].trim(), k).not.toBe('');
      expect(ph(OWNER_TR[k as keyof typeof OWNER_EN]), k).toEqual(ph(v));
    }
  });

  it('every key the screens name exists', () => {
    const missing: string[] = [];
    for (const f of ['web/src/pages/OwnerConsole.tsx', 'web/src/pages/Desk.tsx']) {
      const src = readFileSync(join(ROOT, f), 'utf8');
      for (const m of src.matchAll(/\bo\('([a-zA-Z0-9_.-]+)'/g)) if (!(m[1] in OWNER_EN)) missing.push(`${f}: ${m[1]}`);
      for (const m of src.matchAll(/'(act\.[a-zA-Z]+)'/g)) if (!(m[1] in OWNER_EN)) missing.push(`${f}: ${m[1]}`);
    }
    expect(missing).toEqual([]);
  });

  it('covers every checklist item and every dynamic family', () => {
    const want = [
      ...CHECKLIST.flatMap((i) => [`checklist.${i.id}.title`, `checklist.${i.id}.why`, `checklist.${i.id}.steps`]),
      ...CHECKLIST_AREAS.map((a) => `area.${a}`),
      ...CHECKLIST_OWNERS.map((a) => `owner.${a}`),
      ...CHECKLIST_PRIORITIES.map((a) => `prio.${a}`),
      ...PLAN_METRICS.map((m) => `metric.${m}`),
      ...['on-track', 'close', 'behind', 'no-target'].map((p) => `pace.${p}`),
      ...[...TRIAL_REQUEST_STATUSES, 'open', 'all'].map((s) => `req.status.${s}`),
      ...TRIAL_DEPARTMENTS.map((d) => `dept.${d}`),
      ...['crm', 'tasks', 'accounting', 'bi', 'other'].map((d) => `tool.${d}`),
      ...APPROVAL_STATUSES.map((s) => `ap.status.${s}`),
      ...PRIORITIES3.map((s) => `ap.priority.${s}`),
      ...RISKS.map((s) => `ap.risk.${s}`),
      ...['paying', 'trial', 'free', 'requested', 'churned'].map((s) => `states.${s}`),
      ...['all', 'trial', 'expired', 'free'].map((s) => `trials.${s}`),
      ...['overdue', 'today', 'week', 'month'].map((s) => `plan.when.${s}`),
    ];
    expect(want.filter((k) => !(k in OWNER_EN))).toEqual([]);
    // Every item says what to do, in at least one step.
    for (const i of CHECKLIST) expect(OWNER_TR[`checklist.${i.id}.steps` as keyof typeof OWNER_EN].split('\n').length, i.id).toBeGreaterThan(0);
  });

  it('reads Turkish or English, and English for any other language', () => {
    expect(ownerWord('tr', 'nav.overview')).toBe('Genel bakış');
    expect(ownerWord('ja', 'nav.overview')).toBe('Overview');
    expect(ownerWord('en', 'bar.approvals', { n: 3 })).toBe('3 to approve');
  });

  it('every checklist item that waits for a trigger has one, and every dependency exists', () => {
    const ids = new Set(CHECKLIST.map((i) => i.id));
    expect(ids.size).toBe(CHECKLIST.length);
    for (const i of CHECKLIST) {
      expect(i.priority === 'later', i.id).toBe(!!i.trigger);
      for (const a of i.after ?? []) expect(ids.has(a), `${i.id} after ${a}`).toBe(true);
    }
  });
});
