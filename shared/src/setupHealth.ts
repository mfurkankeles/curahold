// Setup health: what an administrator can get wrong or leave missing while
// setting a company up, found by cheap queries (no model, no cost), each with
// a plain sentence, the reason it matters and one click to the screen that
// fixes it. And "Test your setup": the steps a person takes after setting up,
// to see with their own eyes that it works.
//
// This file is the registry both sides read: the server runs the checks
// (api/src/lib/setupHealth.ts), the app shows them (web/src/pages/SetupHealth.tsx),
// the assistant reads them through a read-only tool. Nothing here fixes
// anything: the person always clicks.
//
// Adding a check (docs/DEVELOPER.md, "Setup health"):
//   1. an entry in CHECKS below;
//   2. its query in api/src/lib/setupHealth.ts (SQL_CHECKS or CONFIG_CHECKS);
//   3. sh.<id>.problem / .why / .fix in all eleven dictionaries;
//   4. `npx tsx scripts/docs/setup-health-page.ts` to write it into the help pages.
// tests/setup-health.test.ts fails until all four are there.
import type { DepartmentKey, Perm } from './model';

export const SETUP_AREAS = ['team', 'departments', 'import', 'sync', 'finance', 'analytics', 'portal', 'automations', 'data', 'email', 'privacy', 'billing', 'assistant'] as const;
export type SetupArea = (typeof SETUP_AREAS)[number];

export const SEVERITIES = ['high', 'medium', 'low'] as const;
export type Severity = (typeof SEVERITIES)[number];

/** Who can fix it: a permission, or the person who runs this Curahold (the platform owner). */
export type Fixer = Perm | 'owner';

export interface SetupCheckDef {
  id: string;
  area: SetupArea;
  severity: Severity;
  /** Any one of these lets a person see and fix the check. Administrators see every company check. */
  fixer: Fixer[];
  /** And all of these (a check that reads something only they can see in full). */
  needs?: Perm[];
  /** The screen that fixes it, in the app; `{ref}` is filled with what the check found (a connection, a customer). */
  fix: string;
  /** Cannot be checked from here (DNS records): passes once the person confirms they did it. */
  manual?: true;
}

/** Every check, in the order they are read within an area. */
export const CHECKS: SetupCheckDef[] = [
  // ---- the team
  { id: 'team.alone', area: 'team', severity: 'high', fixer: ['users.manage'], fix: '/settings/people' },
  { id: 'team.invitesWaiting', area: 'team', severity: 'low', fixer: ['users.manage'], fix: '/settings/people' },
  { id: 'team.emptyRoles', area: 'team', severity: 'low', fixer: ['users.manage'], fix: '/settings/roles' },
  // ---- departments
  { id: 'dept.empty', area: 'departments', severity: 'medium', fixer: ['org.manage', 'users.manage'], fix: '/settings/departments' },
  { id: 'dept.noLead', area: 'departments', severity: 'medium', fixer: ['org.manage', 'users.manage'], fix: '/settings/departments' },
  // ---- moving data in
  { id: 'import.failedRows', area: 'import', severity: 'medium', fixer: ['accounts.manage'], fix: '/import' },
  { id: 'import.missingName', area: 'import', severity: 'medium', fixer: ['accounts.manage'], fix: '/import' },
  { id: 'import.badDates', area: 'import', severity: 'medium', fixer: ['accounts.manage'], fix: '/import' },
  { id: 'import.badMoney', area: 'import', severity: 'medium', fixer: ['accounts.manage'], fix: '/import' },
  { id: 'import.duplicates', area: 'import', severity: 'low', fixer: ['accounts.manage'], fix: '/accounts?q={ref}' },
  // ---- CRM and Jira
  { id: 'sync.notAuthorised', area: 'sync', severity: 'high', fixer: ['connections.manage'], fix: '/settings/sources/{ref}' },
  { id: 'sync.lastRunFailed', area: 'sync', severity: 'high', fixer: ['connections.manage'], fix: '/settings/sources/{ref}' },
  { id: 'sync.hooksFailing', area: 'sync', severity: 'medium', fixer: ['connections.manage'], fix: '/settings/sources' },
  { id: 'sync.whatsappSilent', area: 'sync', severity: 'medium', fixer: ['connections.manage'], fix: '/settings/sources/{ref}' },
  { id: 'sync.mappingIncomplete', area: 'sync', severity: 'medium', fixer: ['connections.manage'], fix: '/settings/sources/{ref}' },
  { id: 'sync.stuckChanges', area: 'sync', severity: 'medium', fixer: ['connections.manage'], fix: '/settings/sources/{ref}' },
  { id: 'sync.conflicts', area: 'sync', severity: 'low', fixer: ['connections.manage'], fix: '/settings/sources/{ref}' },
  { id: 'sync.keyExpiring', area: 'sync', severity: 'medium', fixer: ['connections.manage'], fix: '/settings/developer' },
  // ---- accounting programs
  { id: 'finance.failing', area: 'finance', severity: 'high', fixer: ['connections.manage'], fix: '/settings/sources/{ref}' },
  { id: 'finance.stale', area: 'finance', severity: 'medium', fixer: ['connections.manage'], fix: '/settings/sources/{ref}' },
  // ---- BI tools
  { id: 'bi.stale', area: 'analytics', severity: 'low', fixer: ['data.export'], fix: '/settings/analytics' },
  { id: 'bi.keyExpiring', area: 'analytics', severity: 'medium', fixer: ['data.export'], fix: '/settings/analytics' },
  // ---- the customer portal
  { id: 'portal.noChannel', area: 'portal', severity: 'medium', fixer: ['org.manage'], fix: '/settings/portal' },
  { id: 'portal.nobodyInvited', area: 'portal', severity: 'low', fixer: ['org.manage'], fix: '/settings/portal' },
  { id: 'portal.unbranded', area: 'portal', severity: 'low', fixer: ['org.manage'], fix: '/settings/portal' },
  // ---- automations
  { id: 'auto.none', area: 'automations', severity: 'low', fixer: ['automations.manage'], fix: '/settings/automations' },
  { id: 'auto.deletedField', area: 'automations', severity: 'high', fixer: ['automations.manage'], fix: '/settings/automations' },
  { id: 'auto.deletedBoard', area: 'automations', severity: 'high', fixer: ['automations.manage'], needs: ['boards.view_all'], fix: '/settings/automations' },
  // ---- the data itself
  { id: 'data.customersNoOwner', area: 'data', severity: 'medium', fixer: ['accounts.manage'], fix: '/accounts/{ref}' },
  { id: 'data.dealsNoStage', area: 'data', severity: 'medium', fixer: ['accounts.manage'], fix: '/records/opportunity' },
  { id: 'data.ticketsNoOwner', area: 'data', severity: 'low', fixer: ['accounts.manage'], fix: '/records/ticket' },
  // ---- mail (the install's, so its owner's)
  { id: 'email.notSetUp', area: 'email', severity: 'high', fixer: ['owner'], fix: '/docs/mail-smtp-relay' },
  { id: 'email.domainRecords', area: 'email', severity: 'medium', fixer: ['owner'], fix: '/docs/mail-google-workspace', manual: true },
  // ---- privacy and consent
  { id: 'privacy.noOwner', area: 'privacy', severity: 'medium', fixer: ['org.manage', 'users.manage'], fix: '/settings/roles' },
  // ---- the trial and the bill
  { id: 'billing.trialEnding', area: 'billing', severity: 'medium', fixer: ['org.manage'], fix: '/settings/billing' },
  { id: 'billing.seatsFull', area: 'billing', severity: 'medium', fixer: ['org.manage', 'users.manage'], fix: '/settings/people' },
  // ---- the assistant (the install's key, so its owner's)
  { id: 'assistant.noKey', area: 'assistant', severity: 'medium', fixer: ['owner'], fix: '/docs/ai-assistants' },
];

/** The ids of every setup health check. */
export const CHECK_IDS = CHECKS.map((c) => c.id);
/** A setup health check by id, or null. */
export const checkDef = (id: string) => CHECKS.find((c) => c.id === id) ?? null;

/** One check's result, as the API returns it (already in the reader's language). */
export interface SetupCheckResult {
  id: string;
  area: SetupArea;
  severity: Severity;
  status: 'fail' | 'ok';
  /** How many things it found (rows, customers, connections). */
  count: number;
  /** The screen that fixes it, with what it found filled in. */
  fix: string;
  manual: boolean;
  /** For a manual check: when, and who, said it is done. */
  confirmed: { at: string; by: string | null } | null;
  /** Failed at some point and passes now. */
  fixed: boolean;
  /** Failing since the last daily check said it was fine. */
  isNew: boolean;
  problem: string;
  why: string;
  fixLabel: string;
}

export interface SetupHealth {
  checks: SetupCheckResult[];
  failing: number;
  /** Problems found at some point (failing now, or fixed since). */
  found: number;
  fixed: number;
  checkedAt: string;
  /** The last automatic (daily) check. */
  dailyAt: string | null;
}

/** Severity first, then the registry's own order. */
export function bySeverity<T extends { id: string; severity: Severity }>(list: T[]): T[] {
  return [...list].sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) || CHECK_IDS.indexOf(a.id) - CHECK_IDS.indexOf(b.id));
}

/**
 * Whether a person sees a check: administrators see every company check; the
 * install's owner sees the owner checks; anyone else the ones a permission of
 * theirs fixes.
 */
export function canSeeCheck(def: SetupCheckDef, who: { perms: readonly string[]; admin: boolean; owner: boolean }): boolean {
  const ownerOnly = def.fixer.length === 1 && def.fixer[0] === 'owner';
  if (ownerOnly) return who.owner;
  if (def.needs?.some((p) => !who.perms.includes(p)) && !who.admin) return false;
  return who.admin || def.fixer.some((f) => f !== 'owner' && who.perms.includes(f));
}

// ------------------------------------------------------------------ test your setup

/** Where a test step sits: a department, or the company as a whole. */
export type TestGroup = DepartmentKey | 'company';

/** What a step is tried with, kept for the next time (a customer, a connection, a colleague). */
export type TestInput = 'account' | 'connection' | 'user';

export interface TestStepDef {
  id: string;
  group: TestGroup;
  /** The server can run it ("Test it"); otherwise the person looks and says whether it worked. */
  auto: boolean;
  /** Must pass before "Setup complete" (when it applies: a sync step needs a connection, the import step an import). */
  required: boolean;
  /** About how long it takes, in minutes. */
  minutes: number;
  /** What it is tried with, chosen once and kept. */
  input?: TestInput;
  /** Any one of these lets a person run it and record the result. */
  fixer: Perm[];
  /** Where to go when it fails. */
  fix: string;
}

export const TEST_STEPS: TestStepDef[] = [
  { id: 'invite', group: 'company', auto: false, required: true, minutes: 3, input: 'user', fixer: ['users.manage'], fix: '/settings/people' },
  { id: 'import', group: 'company', auto: false, required: true, minutes: 2, fixer: ['accounts.manage'], fix: '/import' },
  { id: 'automation', group: 'company', auto: true, required: false, minutes: 1, fixer: ['automations.manage'], fix: '/settings/automations' },
  { id: 'crm', group: 'sales', auto: true, required: true, minutes: 2, input: 'connection', fixer: ['connections.manage'], fix: '/settings/sources' },
  { id: 'ticket', group: 'success', auto: true, required: true, minutes: 1, input: 'account', fixer: ['accounts.manage'], fix: '/settings/developer' },
  { id: 'portal', group: 'success', auto: false, required: true, minutes: 3, fixer: ['org.manage'], fix: '/settings/portal' },
  { id: 'jira', group: 'product', auto: true, required: true, minutes: 2, input: 'connection', fixer: ['connections.manage'], fix: '/settings/sources' },
  { id: 'accounting', group: 'finance', auto: true, required: true, minutes: 2, input: 'connection', fixer: ['connections.manage'], fix: '/settings/sources' },
];
/** The ids of every go-live test step. */
export const TEST_IDS = TEST_STEPS.map((s) => s.id);
/** A go-live test step by id, or null. */
export const testStepDef = (id: string) => TEST_STEPS.find((s) => s.id === id) ?? null;

/**
 * Named groups of steps run together. "Before go-live": every step that must
 * pass. "Monthly check": the steps the server can run by itself, to see that
 * nothing broke since. The words are sh.test.bundle.<id>.title / .body.
 */
export const TEST_BUNDLES: { id: 'golive' | 'monthly'; steps: string[] }[] = [
  { id: 'golive', steps: TEST_STEPS.filter((s) => s.required).map((s) => s.id) },
  { id: 'monthly', steps: TEST_STEPS.filter((s) => s.auto).map((s) => s.id) },
];

export type TestStatus = 'todo' | 'pass' | 'fail' | 'skipped';

/** One try of a step, kept with what it saw: the evidence. */
export interface TestRun {
  id: string;
  status: Exclude<TestStatus, 'todo'>;
  /** run: the server tried it; person: someone looked and said. */
  how: 'run' | 'person';
  /** Why it failed, as a key under sh.test.reason.*. */
  reason: string | null;
  /** What it saw (counts, names, the address it opened). The expectation is sh.test.<step>.expect. */
  seen: Record<string, string | number | boolean | null>;
  note: string | null;
  at: string;
  by: string | null;
}

/** The issue a failed step was turned into (the onboarding plan's issue list shows it too). */
export interface TestIssue {
  status: 'open' | 'resolved';
  title: string;
  at: string;
  by: string | null;
  /** The issue row in the onboarding plan, when the company has one. */
  ref: string | null;
}

export interface TestStepResult {
  id: string;
  group: TestGroup;
  auto: boolean;
  /** Must pass for "Setup complete", here and now. */
  required: boolean;
  /** It can be tried here: the connection, the import, the portal exist. */
  applies: boolean;
  minutes: number;
  status: TestStatus;
  /** Why it failed, as a key under sh.test.reason.* (the app says what to do). */
  reason: string | null;
  /** What the last try saw, and what the screen knows now (the last import's counts, the portal's address). */
  detail: Record<string, string | number | boolean | null>;
  at: string | null;
  by: string | null;
  fix: string;
  /** The last tries, newest first. */
  runs: TestRun[];
  issue: TestIssue | null;
  /** What it is tried with: the kept choice and the choices. */
  input: { kind: TestInput; value: string | null; choices: { value: string; label: string }[] } | null;
  /** This person may run it and record the result. */
  canRun: boolean;
}

export interface Approval {
  at: string;
  by: string | null;
}

export interface SetupTest {
  steps: TestStepResult[];
  passed: number;
  total: number;
  bundles: { id: string; steps: string[]; minutes: number }[];
  /** The go-live gate: the required steps, then two approvals, then "Setup complete". */
  gate: {
    required: number;
    requiredPassed: number;
    /** The company's administrator, and Curahold's side (the platform owner or support staff with edit access). */
    approvals: { customer: Approval | null; vendor: Approval | null };
    canApprove: { customer: boolean; vendor: boolean };
  };
  /** "Setup complete": when the last approval came, and whose it was. */
  doneAt: string | null;
  doneBy: string | null;
}

/** The required steps all pass: approvals may be given. */
export const gateOpen = (steps: Pick<TestStepResult, 'required' | 'status'>[]) => steps.every((s) => !s.required || s.status === 'pass');

// ------------------------------------------------------------------ the assistant's free rule

// "What's wrong with my setup?" in every language: answered from the checks
// themselves, without a model (zero cost). Kept narrow on purpose: a question
// that names something else goes the usual way.
const ASKS: RegExp[] = [
  /\bwhat'?s wrong with (my|our|the) (setup|set-up|workspace|configuration|account)\b/i,
  /\bwhy (is|isn'?t|does|doesn'?t) (it|this|my setup|our setup|anything|something) (not )?work/i,
  /\b(is|check) (my|our) (setup|set-up|configuration)\b/i,
  /\bsetup (health|problems?|issues?|errors?)\b/i,
  /\b(what'?s|what is) (still )?missing (in|from) (my|our|the) (setup|set-up|configuration|workspace)\b/i,
  /\b(neden|niye|niçin) çalışmıyor\b/i,
  /\bkurulum(um|umuz|da|unda)? (sağlığı|doğru mu|tamam mı|eksik|hata|sorun)/i,
  /\b(kurulumda|ayarlarda) (ne )?(eksik|yanlış|sorun|hata)/i,
  /\bne eksik\b/i,
  /\bkurulum(umuzda|umda)\b.{0,20}\beksik\b/i,
  /ما (المشكلة|الخطأ) في (إعدادي|الإعداد|إعداداتي)|لماذا لا يعمل|(ما|ماذا) (الذي )?(لا يزال )?(ناقص|ينقص|ناقصًا) في (إعدادي|إعدادنا|الإعداد)/,
  /מה לא בסדר (בהגדרה|בהגדרות|בהתקנה)|למה (זה )?לא עובד|מה (עוד )?חסר (בהגדרה|בהגדרות|בהתקנה)/,
  /(چه|چی) (مشکلی|ایرادی) (در|توی) (تنظیمات|راه‌اندازی)|چرا کار نمی‌کند|چه چیزی (در|توی) (تنظیمات|راه‌اندازی)( ما| من)? کم است/,
  /(设置|配置)(有什么|哪里)(问题|不对)|为什么(不工作|用不了|不能用)|(设置|配置)(还)?缺(什么|少什么)/,
  /(設定|配置)(有什麼|哪裡)(問題|不對)|為什麼(不能用|無法運作|不工作)|(設定|配置)(還)?缺(什麼|少什麼)/,
  /(設定|セットアップ)(の|に)?(何が|どこが)(問題|おかしい|間違)|なぜ(動かない|うまくいかない)|(設定|セットアップ)(で|に)(まだ)?足りない/,
  /(설정|셋업)(에|이)? (뭐가|무엇이|어디가) (문제|잘못)|왜 (작동|동작)(하지 않|이 안|안 하)|(설정|셋업)에서 (아직 )?빠진/,
  /(सेटअप|सेटिंग|कॉन्फ़िगरेशन)\s?(में)? (क्या|कहां) (गड़बड़|गलत|समस्या|दिक्कत)|(सेटअप|सेटिंग) में (अभी )?(भी )?(क्या )?कमी|सेटअप हेल्थ|(यह|ये) काम क्यों नहीं (कर रहा|करता)/,
  /\bapa yang (salah|tidak kena|tak kena|kurang|masih kurang|belum lengkap) (dengan|dalam|pada) (persediaan|tetapan|konfigurasi)\b|\bkesihatan persediaan\b|\bkenapa (ia )?tidak berfungsi\b|\bmengapa (ia )?tidak berfungsi\b/i,
];

/** Whether an assistant question is about the company's setup, so it may be answered from setup health. */
export function asksAboutSetup(question: string): boolean {
  const q = question.trim();
  return q.length <= 200 && ASKS.some((r) => r.test(q));
}
