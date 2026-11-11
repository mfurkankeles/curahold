// The health score: a number from 0 to 100 for each customer, worked out
// from what Tendwell already knows, with weights each company chooses, and
// always shown with its reasons. No black box: every point can be traced to
// a signal a person can see and act on.
import type { AccountField } from './model';

export const HEALTH_SIGNALS = ['touch', 'tasks', 'champion', 'decision', 'blockers', 'judgement', 'number'] as const;
export type HealthSignalKey = (typeof HEALTH_SIGNALS)[number];

export interface HealthSignal {
  /** Unique within the settings (a company may use "number" more than once). */
  id: string;
  key: HealthSignalKey;
  /** Relative weight, 0–100. Signals without data for a customer are left out and the rest share their weight. */
  weight: number;
  /** touch: days still counted as fresh. number: the value that earns full points. */
  good?: number;
  /** touch: days after which it counts as gone quiet. tasks: overdue tasks that take all points. number: the value that earns none. */
  bad?: number;
  /** judgement: a choice field (first option best). number: a number or money field. */
  field?: string;
}

export interface HealthConfig {
  enabled: boolean;
  signals: HealthSignal[];
  /** Score at or above `good` is healthy, at or above `watch` is worth watching, below it is at risk. */
  bands: { watch: number; good: number };
}

export const HEALTH_FIELD = 'health_score';

export const DEFAULT_HEALTH: HealthConfig = {
  enabled: false,
  bands: { watch: 40, good: 70 },
  signals: [
    { id: 'touch', key: 'touch', weight: 25, good: 14, bad: 45 },
    { id: 'tasks', key: 'tasks', weight: 15, bad: 3 },
    { id: 'champion', key: 'champion', weight: 20 },
    { id: 'decision', key: 'decision', weight: 10 },
    { id: 'blockers', key: 'blockers', weight: 10 },
    { id: 'judgement', key: 'judgement', weight: 20, field: 'health' },
  ],
};

export type HealthBand = 'good' | 'watch' | 'risk';
export type TouchKind = 'note' | 'call' | 'meeting' | 'email' | 'task';

/** What the score is worked out from, for one customer. */
export interface HealthInput {
  createdAt: string;
  lastTouchAt: string | null;
  lastTouchKind: TouchKind | null;
  overdue: number;
  /** null when the company does not keep contacts at all. */
  contacts: { id: string; name: string; stance: string | null; decision: string | null }[] | null;
  fields: Record<string, unknown>;
}

export interface HealthPart {
  id: string;
  key: HealthSignalKey;
  weight: number;
  /** 0–100 for this signal, or null when there is nothing to judge by. */
  points: number | null;
  /** Of the 100 points of the score, how many this signal could give, and how many it gave. */
  share: number;
  earned: number;
  detail: {
    days?: number;
    kind?: TouchKind | null;
    count?: number;
    names?: string[];
    skeptics?: string[];
    field?: string;
    value?: string | number | null;
  };
}

export interface HealthResult {
  score: number | null;
  band: HealthBand | null;
  parts: HealthPart[];
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const between = (v: number, good: number, bad: number) => {
  if (good === bad) return v >= good ? 100 : 0;
  return clamp(((v - bad) / (good - bad)) * 100);
};

export function bandOf(score: number | null, cfg: HealthConfig): HealthBand | null {
  if (score === null) return null;
  return score >= cfg.bands.good ? 'good' : score >= cfg.bands.watch ? 'watch' : 'risk';
}

export function computeHealth(cfg: HealthConfig, defs: AccountField[], input: HealthInput, now: Date): HealthResult {
  const parts: HealthPart[] = cfg.signals.map((s) => {
    const part = (points: number | null, detail: HealthPart['detail'] = {}): HealthPart => ({ id: s.id, key: s.key, weight: s.weight, points, share: 0, earned: 0, detail });
    const contacts = input.contacts;
    switch (s.key) {
      case 'touch': {
        const at = new Date(input.lastTouchAt ?? input.createdAt).getTime();
        const days = Math.max(0, Math.floor((now.getTime() - at) / 86_400_000));
        const good = s.good ?? 14;
        const bad = Math.max(good + 1, s.bad ?? 45);
        return part(days <= good ? 100 : between(days, good, bad), { days, kind: input.lastTouchAt ? input.lastTouchKind : null });
      }
      case 'tasks': {
        const bad = Math.max(1, s.bad ?? 3);
        return part(clamp((1 - Math.min(input.overdue, bad) / bad) * 100), { count: input.overdue });
      }
      case 'champion': {
        if (!contacts) return part(null);
        const names = contacts.filter((c) => c.stance === 'champion').map((c) => c.name);
        return part(names.length ? 100 : 0, { names });
      }
      case 'decision': {
        if (!contacts) return part(null);
        const names = contacts.filter((c) => c.decision === 'decision_maker').map((c) => c.name);
        return part(names.length ? 100 : 0, { names });
      }
      case 'blockers': {
        if (!contacts) return part(null);
        const names = contacts.filter((c) => c.stance === 'blocker').map((c) => c.name);
        const skeptics = contacts.filter((c) => c.stance === 'skeptic').map((c) => c.name);
        return part(names.length ? 0 : skeptics.length ? 50 : 100, { names, skeptics });
      }
      case 'judgement': {
        const def = defs.find((d) => d.key === s.field && d.type === 'select');
        const value = def ? input.fields[def.key] : undefined;
        const options = def?.options ?? [];
        const i = options.findIndex((o) => o.key === value);
        if (!def || i < 0) return part(null, { field: s.field });
        return part(options.length < 2 ? 100 : clamp((1 - i / (options.length - 1)) * 100), { field: def.key, value: String(value) });
      }
      case 'number': {
        const def = defs.find((d) => d.key === s.field && (d.type === 'number' || d.type === 'money'));
        const raw = def ? input.fields[def.key] : undefined;
        const v = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' && !Number.isNaN(Number(raw)) ? Number(raw) : null;
        if (!def || v === null || s.good === undefined || s.bad === undefined) return part(null, { field: s.field });
        return part(between(v, s.good, s.bad), { field: def.key, value: v });
      }
    }
  });
  const counted = parts.filter((p) => p.points !== null && p.weight > 0);
  const total = counted.reduce((n, p) => n + p.weight, 0);
  if (!total) return { score: null, band: null, parts };
  for (const p of counted) {
    p.share = Math.round((p.weight / total) * 100);
    p.earned = Math.round(((p.points ?? 0) * p.weight) / total);
  }
  const score = clamp(counted.reduce((n, p) => n + (p.points ?? 0) * p.weight, 0) / total);
  return { score, band: bandOf(score, cfg), parts };
}

/** Settings from storage, made whole and safe. */
export function healthConfig(raw: unknown): HealthConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<HealthConfig>;
  const num = (v: unknown, d: number, lo = 0, hi = 100000) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
  const signals = Array.isArray(r.signals)
    ? r.signals
        .filter((s): s is HealthSignal => !!s && HEALTH_SIGNALS.includes((s as HealthSignal).key) && typeof (s as HealthSignal).id === 'string')
        .slice(0, 12)
        .map((s) => ({
          id: s.id.slice(0, 40),
          key: s.key,
          weight: num(s.weight, 10, 0, 100),
          ...(s.good !== undefined ? { good: num(s.good, 0, -1e9, 1e9) } : {}),
          ...(s.bad !== undefined ? { bad: num(s.bad, 0, -1e9, 1e9) } : {}),
          ...(typeof s.field === 'string' ? { field: s.field.slice(0, 40) } : {}),
        }))
    : DEFAULT_HEALTH.signals;
  const watch = num(r.bands?.watch, DEFAULT_HEALTH.bands.watch, 0, 100);
  const good = Math.max(watch, num(r.bands?.good, DEFAULT_HEALTH.bands.good, 0, 100));
  return { enabled: r.enabled === true, signals, bands: { watch, good } };
}
