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
  /** Default for each company, USD a month (a company may set a lower one, or a higher one up to `companyMaxUsd`). */
  companyMonthlyUsd: number;
  companyMaxUsd: number;
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
  };
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
