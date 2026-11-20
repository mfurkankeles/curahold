// The AI team's settings: which model each profile runs on and the monthly
// cap for the whole team's model spend. The key itself is the assistant's
// (api/src/assistant/cost.ts) — one key for every model call the server makes.
import type { Deps } from '../context';
import { anthropicProvider, type LlmProvider } from '../assistant/provider';
import type { ModelProfile } from '../../../shared/src/team/orgChart';

export interface TeamConfig {
  models: Record<ModelProfile, string>;
  /** The judge of golden tasks: an independent call on the deepest model. */
  judgeModel: string;
  /** USD a month for every agent together (chats, wakes, meetings, golden runs). */
  monthlyUsd: number;
  /**
   * The clock that wakes the team (team/schedule.ts, the Worker's 10-minute cron): "auto" runs it
   * whenever a model key is set; "off" stops every scheduled wake (chats and "Şimdi başlat" still work).
   */
  scheduler: 'auto' | 'off';
}

export const TEAM_DEFAULTS: TeamConfig = {
  models: { deep: 'claude-opus-5-5', standard: 'claude-sonnet-5-5', light: 'claude-haiku-5-5' },
  judgeModel: 'claude-opus-5-5',
  monthlyUsd: 40,
  scheduler: 'auto',
};

/**
 * The AI team's settings from the environment: models per profile and the monthly model-spend cap (TEAM_MONTHLY_USD).
 * A missing or invalid cap falls back to the safe default, never to "no cap" (ADR 0010, 0011).
 */
export function teamConfigFrom(env: Record<string, string | undefined>): TeamConfig {
  const n = Number(env.TEAM_MONTHLY_USD);
  return {
    models: {
      deep: env.TEAM_MODEL_DEEP?.trim() || TEAM_DEFAULTS.models.deep,
      standard: env.TEAM_MODEL_STANDARD?.trim() || TEAM_DEFAULTS.models.standard,
      light: env.TEAM_MODEL_LIGHT?.trim() || TEAM_DEFAULTS.models.light,
    },
    judgeModel: env.TEAM_JUDGE_MODEL?.trim() || TEAM_DEFAULTS.judgeModel,
    monthlyUsd: Number.isFinite(n) && n >= 0 && env.TEAM_MONTHLY_USD !== '' && env.TEAM_MONTHLY_USD !== undefined ? n : TEAM_DEFAULTS.monthlyUsd,
    scheduler: env.TEAM_SCHEDULER?.trim().toLowerCase() === 'off' ? 'off' : 'auto',
  };
}

/** The AI team's settings for this installation, or the defaults when none were given. */
export const teamConfig = (deps: Deps): TeamConfig => deps.config.team ?? TEAM_DEFAULTS;

/**
 * The model for a call. Tests (and the evaluation without a key) put a mock in
 * deps.assistant.provider, used for every profile. Without a key: null — the
 * team reads and plans in code only, and says so.
 */
export function teamProvider(deps: Deps, model: string): LlmProvider | null {
  if (deps.assistant && 'provider' in deps.assistant) return deps.assistant.provider ?? null;
  const cfg = deps.config.assistant;
  if (!cfg || cfg.provider === 'off' || !cfg.apiKey) return null;
  return anthropicProvider({ apiKey: cfg.apiKey, model, fetch: deps.fetch, timeoutMs: 60_000 });
}
