// The AI team's clock. The Worker's second cron (wrangler.toml, every 10
// minutes, free) calls scheduledTeamTick; it is the same work as
// POST /api/desk/team/tick, with cost guards in front so an idle team, a
// missing key or a spent cap costs one cheap look and nothing more:
//
//   off      TEAM_SCHEDULER=off                          → nothing is read
//   no-key   no model key (ANTHROPIC_API_KEY unset/off)  → nothing is read
//   paused   the owner paused everyone (Ekip → Duraklat)  → one query
//   cap      the team's monthly USD cap is spent          → two queries
//   idle     no cadence due in the window, no queued work → three queries, no wake
//   ran      due seats wake through the pre-check (team/precheck.ts): a seat with
//            nothing new is skipped without a model call; the weekly token budget
//            and the monthly cap are checked again inside every run.
import { nowOf, type Deps } from '../context';
import { CADENCES } from '../../../shared/src/team/cadence';
import { cronMatches, tick } from './precheck';
import { teamConfig, teamProvider } from './config';
import { teamSpendThisMonth } from './runtime';

/** The Worker cron that drives the team; must match wrangler.toml [triggers]. Every cadence minute is a multiple of 10. */
export const TEAM_CRON = '*/10 * * * *';
export const TEAM_WINDOW_MIN = 10;

export type TeamTickStatus = 'off' | 'no-key' | 'paused' | 'cap' | 'idle' | 'ran';

export interface TeamTickResult {
  status: TeamTickStatus;
  woke: { seat: string; ran: boolean; reason: string }[];
}

/** Is the scheduled clock on, and if not, why (for the console and the go-live checklist). */
export function teamScheduleState(deps: Deps): 'on' | 'off' | 'no-key' {
  if (teamConfig(deps).scheduler === 'off') return 'off';
  return teamProvider(deps, teamConfig(deps).models.light) ? 'on' : 'no-key';
}

/** Which cadences fall in the minutes (now - window, now]. */
export function dueCadenceSeats(now: Date, windowMin: number): Set<string> {
  const due = new Set<string>();
  for (let i = 0; i < Math.max(1, Math.min(windowMin, 60)); i++) {
    const at = new Date(now.getTime() - i * 60_000);
    for (const c of CADENCES) if (cronMatches(c.cron, at)) due.add(c.seat);
  }
  return due;
}

/**
 * The scheduled wake for the AI team (the Worker's cron calls it). Does nothing when the schedule is off, everything is
 * paused, or the monthly cap is reached; otherwise wakes the seats that are due or have queued tasks.
 */
export async function scheduledTeamTick(deps: Deps, windowMin = TEAM_WINDOW_MIN): Promise<TeamTickResult> {
  const state = teamScheduleState(deps);
  if (state !== 'on') return { status: state, woke: [] };
  const now = nowOf(deps);
  const gate = await deps.db.system(async (q) => {
    const [all] = await q.query(`select 1 from agent_pauses where resumed_at is null and scope = 'all' limit 1`);
    if (all) return 'paused' as const;
    if ((await teamSpendThisMonth(q, now)) >= teamConfig(deps).monthlyUsd) return 'cap' as const;
    if (dueCadenceSeats(now, windowMin).size) return 'due' as const;
    const [queued] = await q.query(`select 1 from agent_tasks where status = 'queued' limit 1`);
    return queued ? ('due' as const) : ('idle' as const);
  });
  if (gate !== 'due') return { status: gate, woke: [] };
  return { status: 'ran', woke: await tick(deps, windowMin) };
}
