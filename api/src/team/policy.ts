// What a seat may do: its tools, the kinds it may propose and review, whether
// it is active. Read from the seat's card in the database (the owner may have
// edited it), falling back to the org chart's definition.
import type { Q } from '../db';
import { seatDef, type SeatDef } from '../../../shared/src/team/orgChart';
import type { ActionKind, ToolId } from '../../../shared/src/team/gate';

export interface SeatPolicy {
  seat: string;
  name: string;
  title: string;
  team: string;
  tier: string;
  state: 'standing' | 'on-call' | 'dormant';
  reportsTo: string | null;
  filledBy: string;
  weeklyBudget: number;
  activatedAt: string | null;
  card: SeatDef['card'];
  model: SeatDef['model'];
  tools: Set<ToolId>;
  proposes: Set<ActionKind>;
  reviews: Set<ActionKind>;
}

export async function seatPolicy(q: Q, seat: string): Promise<SeatPolicy | null> {
  const [r] = await q.query(
    `select s.seat, s.title, s.team, s.tier, s.state, s.reports_to, s.filled_by, s.weekly_budget, s.activated_at, s.card, a.name, a.effort
       from seats s left join agents a on a.seat = s.seat where s.seat = $1`,
    [seat],
  );
  if (!r) return null;
  const def = seatDef(seat);
  const card = { ...(def?.card ?? {}), ...((r.card ?? {}) as object) } as SeatDef['card'];
  return {
    seat: r.seat,
    name: r.name ?? def?.name ?? r.seat,
    title: r.title,
    team: r.team,
    tier: r.tier,
    state: r.state,
    reportsTo: r.reports_to ?? null,
    filledBy: r.filled_by,
    weeklyBudget: Number(r.weekly_budget) || 0,
    activatedAt: r.activated_at ? new Date(r.activated_at).toISOString() : null,
    card,
    model: (['deep', 'standard', 'light'].includes(r.effort) ? r.effort : def?.model) ?? 'standard',
    tools: new Set(card.tools ?? []),
    proposes: new Set(card.proposes ?? ['none']),
    reviews: new Set(card.reviews ?? []),
  };
}

/** Active = not dormant and passed its golden tasks. */
export const isActive = (p: SeatPolicy) => p.state !== 'dormant' && !!p.activatedAt;
