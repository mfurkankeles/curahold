// Three narrow assistant actions (D11): a hand-over note, a "shipped" message
// to a customer, and the promises and next steps in a meeting's notes.
//
// Each one only drafts. The person reads the draft, changes it and confirms;
// nothing is saved or sent from here. The model is the assistant's own
// (provider.ts, the company switch and the monthly caps of core.ts); without a
// key, switched off, over a cap or on an error, a draft is written from the
// template instead, so the button always gives something useful.
import type { DraftKind, DraftResult } from '../../../shared/src/handoff';
import type { Locale } from '../../../shared/src/i18n';
import type { Deps } from '../context';
import { overCap, settingsOf } from './core';
import { costMicros } from './cost';
import type { LlmProvider, LlmTool } from './provider';
import { dbStore } from './store';

const TOOL: LlmTool = {
  name: 'draft',
  description: 'Return the finished draft.',
  input_schema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'The draft, plain text, ready to edit.' },
      promises: { type: 'array', items: { type: 'string' }, description: 'meeting_promises only: what we promised the customer, one per item.' },
      nextSteps: { type: 'array', items: { type: 'string' }, description: 'meeting_promises only: agreed next steps, short imperative titles.' },
    },
    required: ['text'],
  },
};

const BRIEF: Record<DraftKind, string> = {
  handover_note:
    'Write a hand-over note from Sales to the team taking over a newly won customer: who matters and how they feel about us, what was promised, what they are waiting for from Product, the key dates, and what to do first. At most 180 words, short paragraphs or dashes.',
  shipped_message:
    'Write a short, warm message from the customer owner telling the customer that the work they asked for is now live. Thank them for the request, say in one sentence what it lets them do (only from the facts given), offer a short walkthrough. At most 110 words. No subject line.',
  meeting_promises:
    'Read the meeting notes. List every promise our side made to the customer (promises) and every agreed next step (nextSteps, short imperative task titles). Put a two-line summary in text. Only what the notes say; empty lists when there are none.',
};

const RULES = [
  'You draft text for a person at a B2B company; they will read and edit it before anything is saved or sent.',
  'Use only the facts in the request. Never invent names, dates, prices, numbers or features.',
  'Write in the language whose BCP 47 tag is given as "language". Plain text, no markdown headings.',
  'Finish by calling the draft tool exactly once.',
].join('\n');

export interface DraftEnv {
  deps: Deps;
  provider: LlmProvider | null;
  orgId: string;
  userId: string;
  orgSettings: Record<string, unknown> | null;
  config: import('./cost').AssistantConfig;
}

/** Asks the model for a draft; null (with the reason) when the template should answer instead. */
export async function modelDraft(env: DraftEnv, kind: DraftKind, locale: Locale, facts: Record<string, unknown>): Promise<{ out: Omit<DraftResult, 'ai' | 'why'> | null; why: DraftResult['why'] }> {
  const settings = settingsOf(env.orgSettings?.assistant, env.config);
  if (!env.provider || !settings.enabled) return { out: null, why: 'off' };
  const store = dbStore(env.deps.db, { orgId: env.orgId, userId: env.userId, surface: 'app', retentionDays: 0, billingOn: !!env.deps.config.billing, config: env.config });
  const used = await store.usage().catch(() => ({ companyMicros: Infinity, globalMicros: Infinity }));
  if (overCap(used, env.config.globalMonthlyUsd, settings.monthlyCapUsd)) return { out: null, why: 'cap' };
  try {
    const res = await env.provider.complete({
      system: [{ text: RULES, cache: true }, { text: BRIEF[kind] }],
      messages: [{ role: 'user', content: JSON.stringify({ language: locale, ...facts }).slice(0, 12000) }],
      tools: [TOOL],
      toolChoice: 'any',
      maxTokens: 700,
    });
    await store.record({ model: true, usage: res.usage, micros: costMicros(env.provider.model, res.usage) }).catch(() => undefined);
    const call = res.content.find((b) => b.type === 'tool_use' && b.name === 'draft');
    if (!call || call.type !== 'tool_use') return { out: null, why: 'error' };
    const input = call.input as { text?: unknown; promises?: unknown; nextSteps?: unknown };
    const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x).trim().slice(0, 300)).filter(Boolean).slice(0, 20) : undefined);
    const text = typeof input.text === 'string' ? input.text.trim().slice(0, 4000) : '';
    if (!text && kind !== 'meeting_promises') return { out: null, why: 'error' };
    return { out: { text, promises: list(input.promises), nextSteps: list(input.nextSteps) }, why: null };
  } catch {
    return { out: null, why: 'error' };
  }
}

// Words that mark a promise or a next step in meeting notes, in the eleven languages.
const PROMISE_RE = /\b(we will|we'll|we shall|will send|will share|will deliver|promised?|commit(ted)?|guarantee)\b|(göndereceğiz|yapacağız|paylaşacağız|ileteceğiz|söz|taahhüt|sağlayacağız)|(سنرسل|سنقوم|وعد|نلتزم)|(נשלח|נעשה|הבטח)|(می‌فرستیم|انجام می‌دهیم|قول)|(我们会|我們會|承诺|承諾|将提供|將提供)|(いたします|お送りします|約束|対応します)|(보내드리겠|하겠습니다|약속)/i;
const STEP_RE = /^\s*(?:[-*•]|\d+[.)]|\[ \])\s+|\b(next step|action item|to ?do|follow.?up)\b|(sonraki adım|aksiyon|yapılacak)|(الخطوة التالية)|(הצעד הבא)|(گام بعدی)|(下一步)|(次のステップ|宿題)|(다음 단계)/i;

/** Without the model: promises and steps picked from the notes line by line. */
export function templatePromises(notes: string): { promises: string[]; nextSteps: string[] } {
  const lines = notes
    .split(/\n|(?<=[.!?。！？])\s+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 3);
  const clean = (l: string) => l.replace(/^\s*(?:[-*•]|\d+[.)]|\[ \])\s+/, '').replace(/^(next step|action item|to ?do|sonraki adım|aksiyon)\s*[:：-]\s*/i, '').slice(0, 300);
  const promises = lines.filter((l) => PROMISE_RE.test(l)).map(clean);
  const nextSteps = lines.filter((l) => !PROMISE_RE.test(l) && STEP_RE.test(l)).map(clean);
  return { promises: [...new Set(promises)].slice(0, 20), nextSteps: [...new Set(nextSteps)].slice(0, 20) };
}
