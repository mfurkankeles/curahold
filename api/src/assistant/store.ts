// The assistant's usage, cached answers and log in the database
// (db/migrations/0096_assistant.sql), and where the server finds the docs.
import type { HelpLanguage } from '../../../shared/src/i18n';
import { prepare, type AnswerIndex, type DocSection } from '../../../shared/src/answers';
import type { AssistReply } from '../../../shared/src/assist';
import type { Db, Q } from '../db';
import type { OrgBilling } from '../../../shared/src/billing';
import { capsForOrgRow } from '../billing/entitlements';
import { CACHE_TTL_DAYS, type AssistStore, type Spend } from './core';

const MONTH = `date_trunc('month', now())::date`;

/** Usage, cache and log for one company and person (or the public docs: no company). */
export function dbStore(db: Db, ctx: { orgId: string | null; userId: string | null; surface: string; retentionDays: number; billingOn?: boolean }): AssistStore {
  const tx = <T>(fn: (q: Q) => Promise<T>) => db.tenant<T>({ orgId: ctx.orgId, userId: ctx.userId }, fn);
  return {
    async usage() {
      return tx(async (q) => {
        const [g] = await q.query(`select cost_micros from assistant_global where month = ${MONTH}`);
        const [c] = ctx.orgId ? await q.query(`select cost_micros, model_questions from assistant_usage where org_id = $1 and month = ${MONTH}`, [ctx.orgId]) : [];
        // The plan's cap on model-answered questions a month (shared/src/plans.json → caps.aiQuestionsPerSeat × full seats).
        const [o] = ctx.orgId ? await q.query(`select id, billing, trial_ends_at from orgs where id = $1`, [ctx.orgId]) : [];
        const questionCap = o ? (await capsForOrgRow(q, o as { id: string; billing: OrgBilling | null; trial_ends_at: unknown }, !!ctx.billingOn, new Date())).aiQuestionsPerMonth : null;
        return { companyMicros: Number(c?.cost_micros ?? 0), globalMicros: Number(g?.cost_micros ?? 0), companyQuestions: Number(c?.model_questions ?? 0), questionCap };
      });
    },
    async record(s: Spend) {
      await tx(async (q) => {
        const m = s.model ? 1 : 0;
        await q.query(
          `insert into assistant_global (month, questions, model_questions, cost_micros) values (${MONTH}, 1, $1, $2)
           on conflict (month) do update set questions = assistant_global.questions + 1,
             model_questions = assistant_global.model_questions + $1, cost_micros = assistant_global.cost_micros + $2`,
          [m, s.micros],
        );
        if (!ctx.orgId) return;
        await q.query(
          `insert into assistant_usage (org_id, month, questions, model_questions, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_micros)
           values ($1, ${MONTH}, 1, $2, $3, $4, $5, $6, $7)
           on conflict (org_id, month) do update set questions = assistant_usage.questions + 1,
             model_questions = assistant_usage.model_questions + $2, input_tokens = assistant_usage.input_tokens + $3,
             output_tokens = assistant_usage.output_tokens + $4, cache_read_tokens = assistant_usage.cache_read_tokens + $5,
             cache_write_tokens = assistant_usage.cache_write_tokens + $6, cost_micros = assistant_usage.cost_micros + $7`,
          [ctx.orgId, m, s.usage.input, s.usage.output, s.usage.cacheRead, s.usage.cacheWrite, s.micros],
        );
      });
    },
    async cacheGet(key) {
      return tx(async (q) => {
        const [r] = await q.query(`update assistant_cache set hits = hits + 1 where key = $1 and created_at > now() - interval '${CACHE_TTL_DAYS} days' returning reply`, [key]);
        return (r?.reply as AssistReply) ?? null;
      });
    },
    async cachePut(key, reply) {
      await tx((q) =>
        q.query(`insert into assistant_cache (key, org_id, reply) values ($1, $2, $3) on conflict (key) do update set reply = excluded.reply, created_at = now(), hits = 0`, [
          key,
          ctx.orgId,
          JSON.stringify({ ...reply, cached: undefined }),
        ]),
      );
    },
    async log({ question, reply, micros }) {
      if (!ctx.orgId || ctx.retentionDays <= 0) return;
      await tx(async (q) => {
        await q.query(`insert into assistant_log (org_id, user_id, surface, question, kind, engine, sources, cost_micros) values ($1, $2, $3, $4, $5, $6, $7, $8)`, [
          ctx.orgId,
          ctx.userId,
          ctx.surface,
          question.slice(0, 4000),
          reply.kind,
          reply.engine,
          JSON.stringify(reply.citations.map((c) => c.url)),
          micros,
        ]);
        // This person's own entries past the company's retention go as new ones come (the nightly run does everyone's).
        if (ctx.userId) await q.query(`delete from assistant_log where org_id = $1 and user_id = $2 and created_at < now() - make_interval(days => $3)`, [ctx.orgId, ctx.userId, ctx.retentionDays]);
      });
    },
  };
}

/** This month's numbers for a company's settings screen. */
export async function monthUsage(db: Db, orgId: string, userId: string) {
  return db.tenant({ orgId, userId }, async (q) => {
    const [r] = await q.query(`select questions, model_questions, cost_micros from assistant_usage where org_id = $1 and month = ${MONTH}`, [orgId]);
    return { questions: Number(r?.questions ?? 0), modelQuestions: Number(r?.model_questions ?? 0), costUsd: Number(r?.cost_micros ?? 0) / 1e6 };
  });
}

/** Removes log entries older than each company's retention (nightly, lib/scheduler.ts). */
export async function purgeAssistantLogs(db: Db) {
  await db.system(async (q) => {
    await q.query(
      `delete from assistant_log l using orgs o
        where l.org_id = o.id
          and l.created_at < now() - make_interval(days => coalesce(nullif(o.settings->'assistant'->>'retentionDays', '')::int, 30))`,
    );
    await q.query(`delete from assistant_cache where created_at < now() - interval '${CACHE_TTL_DAYS} days'`);
  });
}

/** Docs sections by language, prepared once per process (or isolate) and version. */
export type DocsLoader = (lang: HelpLanguage) => Promise<DocSection[]>;
const prepared = new Map<string, { at: number; index: Promise<AnswerIndex>; version: Promise<string> }>();
export function docsIndex(load: DocsLoader, lang: HelpLanguage, maxAgeMs = 10 * 60_000): { index: Promise<AnswerIndex>; version: Promise<string> } {
  const hit = prepared.get(lang);
  if (hit && Date.now() - hit.at < maxAgeMs) return hit;
  const sections = load(lang);
  const entry = {
    at: Date.now(),
    index: sections.then(prepare),
    // A cheap fingerprint: the number of sections and their total length.
    version: sections.then((s) => `${s.length}:${s.reduce((n, x) => n + x.m.length + x.h.length, 0)}`),
  };
  entry.index.catch(() => prepared.delete(lang));
  prepared.set(lang, entry);
  return entry;
}
