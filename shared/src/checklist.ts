// The go-live checklist: one source of truth, kept in the repo. The owner
// console's Checklist section (one task at a time) and the go-live dashboard
// read the same items. Each item's words (title, why, steps) live in the
// owner console's dictionaries under `checklist.<id>.*`; its progress lives in
// the database (checklist_progress). A LATER item carries a trigger: when the
// trigger fires on real data (customer country and plan state, revenue, seats),
// the item becomes a must with a deadline, and comes up as the next task.

import { GO_LIVE_AFTER, GO_LIVE_EVIDENCE, GO_LIVE_ITEMS } from './checklist-golive';

export const CHECKLIST_AREAS = ['technical', 'legal', 'financial', 'marketing'] as const;
export type ChecklistArea = (typeof CHECKLIST_AREAS)[number];

export const CHECKLIST_PRIORITIES = ['must', 'nice', 'later'] as const;
export type ChecklistPriority = (typeof CHECKLIST_PRIORITIES)[number];

/** Who does it: Claude (an agent), the owner himself, or a third party (lawyer, accountant, provider). */
export const CHECKLIST_OWNERS = ['claude', 'owner', 'third'] as const;
export type ChecklistOwner = (typeof CHECKLIST_OWNERS)[number];

/** What makes a LATER item mandatory, read from the product's own data. */
export type ChecklistTrigger =
  /** A company in one of these countries moves from trial to paid. */
  | { kind: 'paidInCountry'; countries: string[]; days: number }
  /** A company (trial or paid) in one of these countries. */
  | { kind: 'customerInCountry'; countries: string[]; days: number }
  /** At least this many paying companies. */
  | { kind: 'payingAtLeast'; n: number; days: number }
  /** Annual recurring revenue at least this much (in the price currency). */
  | { kind: 'arrAtLeast'; amount: number; days: number }
  /** Paid seats across all companies at least this many. */
  | { kind: 'seatsAtLeast'; n: number; days: number }
  /** Nothing in the data shows it (e.g. a customer asks for a security questionnaire): the owner marks it. */
  | { kind: 'manual' };

export interface ChecklistItem {
  id: string;
  area: ChecklistArea;
  priority: ChecklistPriority;
  owner: ChecklistOwner;
  /** Rough cost, in USD: one-off and per month; null when free. */
  cost: { once?: number; monthly?: number } | null;
  /** Where the work or its evidence is (docs path, report, test). */
  links?: string[];
  trigger?: ChecklistTrigger;
  /** Items that must be done first. */
  after?: string[];
  /** What proves it is done (a command's output, a screen, a file); the console's evidence field shows it as a hint. */
  proof?: string;
}

/** The EU and EEA, for "first EU customer" triggers. */
export const EU_COUNTRIES = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO'];

const BASE_ITEMS: ChecklistItem[] = [
  // ---- technical
  { id: 'domain', area: 'technical', priority: 'must', owner: 'owner', cost: { monthly: 3 } },
  { id: 'cloudflare-account', area: 'technical', priority: 'must', owner: 'owner', cost: null, after: ['domain'] },
  { id: 'dns-records', area: 'technical', priority: 'must', owner: 'claude', cost: null, after: ['cloudflare-account'], links: ['docs/ENVIRONMENT.md'] },
  { id: 'database-hosting', area: 'technical', priority: 'must', owner: 'owner', cost: { monthly: 25 } },
  { id: 'migrations-runbook', area: 'technical', priority: 'must', owner: 'claude', cost: null, after: ['database-hosting'] },
  { id: 'email-provider', area: 'technical', priority: 'must', owner: 'owner', cost: { monthly: 7 }, after: ['domain'] },
  { id: 'email-auth', area: 'technical', priority: 'must', owner: 'claude', cost: null, after: ['email-provider'] },
  { id: 'backups-restore', area: 'technical', priority: 'must', owner: 'claude', cost: null, after: ['database-hosting'] },
  { id: 'monitoring', area: 'technical', priority: 'must', owner: 'claude', cost: null },
  { id: 'status-page', area: 'technical', priority: 'nice', owner: 'claude', cost: null },
  { id: 'security-txt', area: 'technical', priority: 'must', owner: 'owner', cost: null },
  { id: 'pen-test', area: 'technical', priority: 'later', owner: 'third', cost: { once: 4000 }, trigger: { kind: 'manual' } },
  { id: 'certification', area: 'technical', priority: 'later', owner: 'third', cost: { once: 15000 }, trigger: { kind: 'manual' } },
  // ---- legal
  { id: 'legal-entity', area: 'legal', priority: 'must', owner: 'owner', cost: { once: 1000 } },
  { id: 'employment-check', area: 'legal', priority: 'must', owner: 'third', cost: { once: 300 } },
  { id: 'legal-drafts', area: 'legal', priority: 'must', owner: 'claude', cost: null },
  { id: 'lawyer-review', area: 'legal', priority: 'must', owner: 'third', cost: { once: 1500 }, after: ['legal-drafts'] },
  { id: 'trademark', area: 'legal', priority: 'nice', owner: 'owner', cost: { once: 600 } },
  { id: 'kvkk-transfer', area: 'legal', priority: 'later', owner: 'third', cost: { once: 500 }, trigger: { kind: 'customerInCountry', countries: ['TR'], days: 30 } },
  { id: 'eu-representative', area: 'legal', priority: 'later', owner: 'third', cost: { monthly: 100 }, trigger: { kind: 'paidInCountry', countries: EU_COUNTRIES, days: 30 } },
  { id: 'security-questionnaire', area: 'legal', priority: 'later', owner: 'claude', cost: null, trigger: { kind: 'manual' } },
  // ---- financial
  { id: 'paddle-account', area: 'financial', priority: 'must', owner: 'owner', cost: null, after: ['legal-entity'] },
  { id: 'paddle-wiring', area: 'financial', priority: 'must', owner: 'claude', cost: null, after: ['paddle-account'] },
  { id: 'bank-account', area: 'financial', priority: 'must', owner: 'owner', cost: null, after: ['legal-entity'] },
  { id: 'accountant', area: 'financial', priority: 'must', owner: 'owner', cost: { monthly: 150 }, after: ['legal-entity'] },
  { id: 'pricing-decision', area: 'financial', priority: 'must', owner: 'owner', cost: null },
  { id: 'zatca', area: 'financial', priority: 'later', owner: 'third', cost: { monthly: 50 }, trigger: { kind: 'paidInCountry', countries: ['SA'], days: 30 } },
  { id: 'uae-vat', area: 'financial', priority: 'later', owner: 'third', cost: { once: 300 }, trigger: { kind: 'paidInCountry', countries: ['AE'], days: 30 } },
  { id: 'tr-einvoice', area: 'financial', priority: 'later', owner: 'third', cost: { monthly: 30 }, trigger: { kind: 'paidInCountry', countries: ['TR'], days: 14 } },
  { id: 'cyber-insurance', area: 'financial', priority: 'later', owner: 'owner', cost: { monthly: 80 }, trigger: { kind: 'payingAtLeast', n: 10, days: 60 } },
  { id: 'support-hire', area: 'financial', priority: 'later', owner: 'owner', cost: { monthly: 1500 }, trigger: { kind: 'payingAtLeast', n: 25, days: 60 } },
  // ---- marketing & operations
  { id: 'social-accounts', area: 'marketing', priority: 'must', owner: 'owner', cost: null },
  { id: 'support-mailbox', area: 'marketing', priority: 'must', owner: 'owner', cost: null, after: ['email-provider'] },
  { id: 'analytics-consent', area: 'marketing', priority: 'must', owner: 'claude', cost: null },
  { id: 'ab-decision', area: 'marketing', priority: 'nice', owner: 'owner', cost: null },
  { id: 'first-pocs', area: 'marketing', priority: 'must', owner: 'owner', cost: null },
  { id: 'go-live', area: 'marketing', priority: 'must', owner: 'owner', cost: null, after: ['dns-records', 'lawyer-review', 'paddle-wiring', 'backups-restore'] },
];

/** The checklist: the items above with the go-live items (shared/src/checklist-golive.ts) after the technical ones, and their evidence. */
export const CHECKLIST: ChecklistItem[] = (() => {
  const withEvidence = BASE_ITEMS.map((i) => {
    const e = GO_LIVE_EVIDENCE[i.id];
    const after = i.id === 'go-live' ? [...new Set([...(i.after ?? []), ...GO_LIVE_AFTER])] : i.after;
    return { ...i, ...(after ? { after } : {}), ...(e ? { proof: e.proof, links: [...new Set([...(i.links ?? []), ...(e.links ?? [])])] } : {}) };
  });
  // Before the first LATER technical item (pen test, certification).
  const at = withEvidence.findIndex((i) => i.area === 'technical' && i.priority === 'later');
  return [...withEvidence.slice(0, at), ...GO_LIVE_ITEMS, ...withEvidence.slice(at)];
})();

export type ChecklistStatus = 'todo' | 'done' | 'skipped';

/** One item as the console shows it: the repo's definition with its progress and trigger state. */
export interface ChecklistEntry extends ChecklistItem {
  status: ChecklistStatus;
  note: string | null;
  evidence: string | null;
  at: string | null;
  /** A LATER item whose trigger fired: now a must, due by `due`. */
  triggered: { at: string; why: string; due: string } | null;
  /** Every item in `after` is done. */
  ready: boolean;
}

/** The order the "next task" card follows: triggered first (earliest due), then must, nice; ready before blocked; list order. */
export function nextTask(entries: ChecklistEntry[]): ChecklistEntry | null {
  // "Later" (skipped) puts a task at the back of the line; it comes round again when the rest is done.
  const open = entries.filter((e) => e.status !== 'done' && (e.priority !== 'later' || e.triggered));
  const rank = (e: ChecklistEntry) => (e.status === 'skipped' ? 6 : 0) + (e.triggered ? 0 : e.priority === 'must' ? 1 : 2) * 2 + (e.ready ? 0 : 1);
  return open.map((e, i) => ({ e, i })).sort((a, b) => rank(a.e) - rank(b.e) || (a.e.triggered && b.e.triggered ? a.e.triggered.due.localeCompare(b.e.triggered.due) : 0) || a.i - b.i)[0]?.e ?? null;
}
