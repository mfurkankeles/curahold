// What the assistant costs, and the limits that keep it from costing more.
//
// Prices are USD per million tokens (Anthropic's price list, read 19 Nov 2026:
// platform.claude.com/docs/en/about-claude/pricing). A model that is not in the
// list is counted at the most expensive one's price, so an unknown model can
// only make the caps stricter, never looser.
import type { LlmUsage } from './provider';

export interface Price {
  input: number;
  cacheWrite: number;
  cacheRead: number;
  output: number;
}

export const PRICES: Record<string, Price> = {
  'claude-opus-5-5': { input: 4, cacheWrite: 5, cacheRead: 0.2, output: 20 },
  'claude-sonnet-5-5': { input: 2, cacheWrite: 2.5, cacheRead: 0.1, output: 10 },
  // Up to 100K tokens a request (the assistant stays far below).
  'claude-haiku-5-5': { input: 0.1, cacheWrite: 0.125, cacheRead: 0.01, output: 0.5 },
  'claude-opus-5': { input: 5, cacheWrite: 6.25, cacheRead: 0.5, output: 25 },
  'claude-sonnet-5': { input: 2, cacheWrite: 2.5, cacheRead: 0.2, output: 10 },
  'claude-haiku-4-5': { input: 1, cacheWrite: 1.25, cacheRead: 0.1, output: 5 },
  mock: { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 },
};
const DEAREST: Price = { input: 5, cacheWrite: 6.25, cacheRead: 0.5, output: 25 };

/**
 * The price per token of a model. An unknown model is priced as the dearest one, so a new or misspelled model can
 * only make the cost caps stricter, never looser (ADR 0010).
 */
export const priceOf = (model: string): Price => PRICES[model] ?? PRICES[model.replace(/-\d{8}$/, '')] ?? DEAREST;

/** Cost in millionths of a dollar (whole numbers add up exactly in the database). */
export function costMicros(model: string, u: LlmUsage): number {
  const p = priceOf(model);
  return Math.ceil(u.input * p.input + u.cacheWrite * p.cacheWrite + u.cacheRead * p.cacheRead + u.output * p.output);
}

/** The typical question, measured on the evaluation set's shape (see the report's estimate). */
export const TYPICAL: { calls: number; usage: LlmUsage } = {
  // 1.3 calls a question on average (a data question reads once, then answers).
  calls: 1.3,
  // Per call: rules + tools cached (~2,300), docs sections + question + history fresh (~2,600), answer ~300.
  usage: { input: 2_600, cacheRead: 2_300, cacheWrite: 0, output: 300 },
};

/** Estimated USD for 1,000 questions on a model (cache warm; the first question of each 5 minutes writes the cache). */
export function per1000(model: string, cacheHitShare = 0.4): number {
  const p = priceOf(model);
  const u = TYPICAL.usage;
  const one = (u.input * p.input + u.cacheRead * p.cacheRead + u.output * p.output) / 1e6;
  // Questions answered again from the answer cache cost nothing.
  return Math.round(one * TYPICAL.calls * 1000 * (1 - cacheHitShare) * 100) / 100;
}

export interface AssistantConfig {
  /** 'anthropic' or 'off'. */
  provider: 'anthropic' | 'off';
  apiKey?: string;
  model: string;
  /** Whole installation, USD a month. */
  globalMonthlyUsd: number;
  /** Default for each company, USD a month (a company may set a lower one, or a higher one up to its ceiling). */
  companyMonthlyUsd: number;
  /** The highest a company may choose where no plan sets a ceiling (billing off: self-hosted, demo). */
  companyMaxUsd: number;
  /**
   * The plan's ceiling, USD a month per full seat (ASSISTANT_USD_PER_SEAT, e.g. "team:0.55,business:1.1"). A paying
   * company can never spend more on the model than seats × this, whatever its administrator sets: it is the amount the
   * price per seat was costed with (pricing audit, 20 Nov), so the money bound holds however many tokens a question
   * takes. Only the operator lifts it. Absent: the defaults below.
   */
  aiUsdPerSeat?: Record<string, number>;
  /** A company in its trial: one fixed ceiling, USD a month, not raisable (ASSISTANT_TRIAL_USD). */
  trialMonthlyUsd?: number;
  /** The public docs and site chat on its own, USD a month, inside the global cap (ASSISTANT_PUBLIC_MONTHLY_USD). */
  publicMonthlyUsd?: number;
  /** Other products' names the assistant turns away (never in code). */
  blockedNames: string[];
  /** The docs site's and sales site's chat, which anyone may use (rate-limited, global cap). */
  publicChat: boolean;
  /**
   * What lets a new help request's words reach the model for the desk's draft first reply. 'consent' (the default):
   * only when the person who wrote it said yes to the assistant's notice, like every chat door (MASTER-RULES 13).
   * 'company': the company's own switch is the legal basis (the requester never saw the notice; needs the owner's
   * and a lawyer's decision and a DPIA line). Operator-level on purpose: a company cannot choose the basis itself.
   * Absent counts as 'consent'.
   */
  deskFirstReplyBasis?: 'consent' | 'company';
}

export const DEFAULT_MODEL = 'claude-sonnet-5-5';

/** Reads the assistant's settings from the environment (Workers env or process.env). */
export function assistantConfigFrom(env: Record<string, string | undefined>): AssistantConfig {
  const num = (v: string | undefined, d: number) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : d);
  const key = env.ANTHROPIC_API_KEY?.trim() || undefined;
  return {
    provider: env.ASSISTANT_PROVIDER === 'off' ? 'off' : 'anthropic',
    apiKey: key,
    model: env.ASSISTANT_MODEL?.trim() || DEFAULT_MODEL,
    globalMonthlyUsd: num(env.ASSISTANT_GLOBAL_MONTHLY_USD, 100),
    companyMonthlyUsd: num(env.ASSISTANT_COMPANY_MONTHLY_USD, 5),
    companyMaxUsd: num(env.ASSISTANT_COMPANY_MAX_USD, 50),
    blockedNames: (env.ASSISTANT_BLOCKED_NAMES ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    publicChat: env.ASSISTANT_PUBLIC_CHAT !== '0',
    deskFirstReplyBasis: env.ASSISTANT_DESK_FIRST_REPLY_BASIS === 'company' ? 'company' : 'consent',
    aiUsdPerSeat: perSeatFrom(env.ASSISTANT_USD_PER_SEAT),
    trialMonthlyUsd: num(env.ASSISTANT_TRIAL_USD, AI_CEILING_DEFAULTS.trialMonthlyUsd),
    publicMonthlyUsd: num(env.ASSISTANT_PUBLIC_MONTHLY_USD, AI_CEILING_DEFAULTS.publicMonthlyUsd),
  };
}

/**
 * The defaults the pricing audit costed (20 Nov): 0.55 $ a full seat on Team, 1.10 $ on Business, 5 $ for a trial,
 * 10 $ for the public chat. Draft until the owner sets prices (owner-questions, "AI cap"); changed by setting, not code.
 */
export const AI_CEILING_DEFAULTS = { aiUsdPerSeat: { team: 0.55, business: 1.1 } as Record<string, number>, trialMonthlyUsd: 5, publicMonthlyUsd: 10 };

/** "team:0.55,business:1.1" → { team: 0.55, business: 1.1 }; a bad or missing entry keeps its default. */
function perSeatFrom(v: string | undefined): Record<string, number> {
  const out = { ...AI_CEILING_DEFAULTS.aiUsdPerSeat };
  for (const part of (v ?? '').split(',')) {
    const [k, n] = part.split(':').map((s) => s.trim());
    if (k && /^[a-z_]{1,30}$/.test(k) && n !== '' && Number.isFinite(Number(n)) && Number(n) >= 0) out[k] = Number(n);
  }
  return out;
}

/**
 * The most a company may spend on the model this month by its plan, in USD, or null where no plan applies (billing
 * off). A trial has one fixed amount; a paying company seats × its plan's rate. A plan with no rate of its own gets the
 * lowest rate set, so a new plan never opens an unbounded cost. The company's own setting can only be lower.
 */
export function planAiCeilingUsd(access: { state: string; plan: string }, fullSeats: number, cfg: Pick<AssistantConfig, 'aiUsdPerSeat' | 'trialMonthlyUsd'>): number | null {
  if (access.state === 'free') return null;
  if (access.state === 'trial') return cfg.trialMonthlyUsd ?? AI_CEILING_DEFAULTS.trialMonthlyUsd;
  const rates = cfg.aiUsdPerSeat ?? AI_CEILING_DEFAULTS.aiUsdPerSeat;
  const rate = rates[access.plan] ?? Math.min(...Object.values(rates));
  return Math.round(Math.max(1, Math.floor(fullSeats) || 0) * rate * 100) / 100;
}

/** Requests a person, a company and an address may make (token buckets, lib/ratelimit.ts's Limiter). */
export const ASSIST_BUDGETS = {
  /** One person: 6 at once, then one every 10 seconds (a person reading answers asks far fewer). */
  person: { cap: 6, perSec: 1 / 10 },
  /** One company together. */
  company: { cap: 60, perSec: 1 / 2 },
  /** The public docs chat, per network address. */
  ip: { cap: 5, perSec: 1 / 20 },
  /** The public docs chat, everyone together. */
  public: { cap: 60, perSec: 1 / 2 },
};
