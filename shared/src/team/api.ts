// Wire types of the AI team's owner API (/api/desk/team/*), used by the
// console's Ekip / Sohbet / Toplantılar screens and by the 3D Office.
import type { Seat } from '../office';
import type { Level } from './orgChart';

export interface TeamSeat extends Seat {
  name: string;
  level: Level | null;
  /** Passed its golden tasks (and not dormant). */
  active: boolean;
  activatedAt: string | null;
  /** Golden tasks: passed / total (latest result per task). */
  golden: { passed: number; total: number; judge: 'model' | 'checks' | null };
  /** Expected tokens a week from its cadences (shared/src/team/cadence.ts). */
  estimate: { runs: number; wakes: number; tokens: number };
  /** Last wake: 'skipped' (pre-check, no model), 'ran', 'paused'… */
  lastWake: { at: string; result: string; skipped: number; ran: number } | null;
  /** What it is doing now, for the Office: 'working' | 'meeting' | 'waiting-approval' | 'queued' | 'idle' | 'paused' | 'dormant'. */
  activity: 'working' | 'meeting' | 'waiting-approval' | 'queued' | 'idle' | 'paused' | 'dormant';
}

export interface TeamOrg {
  seats: TeamSeat[];
  pauses: { id: string; scope: 'all' | 'team' | 'seat'; target: string | null; reason: string | null; pausedAt: string }[];
  week: { tokens: number; costUsd: number; budget: number };
  month: { costUsd: number; capUsd: number };
  model: { available: boolean };
  alerts: { id: number; at: string; body: string }[];
}

export interface ThreadRow {
  id: string;
  seat: string;
  title: string;
  createdAt: string;
  lastAt: string;
  messages: number;
}

export interface MessageRow {
  id: number;
  role: 'owner' | 'agent' | 'system';
  body: string;
  at: string;
  meta: { status?: string; tokens?: number; costUsd?: number; effects?: { proposals: { kind: string; title: string }[]; tasks: { seat: string; title: string }[] }; findings?: { rule: string; severity: string }[] };
}

export interface MemoryView {
  summary: { value: string; updatedAt: string } | null;
  facts: { key: string; value: string; updatedAt: string }[];
}
