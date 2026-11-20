// Accessibility findings the check (tests/e2e/a11y.ts) knowingly lets through, each with its reason.
// Only serious and critical findings stop the gate; moderate and minor ones are printed, never fail.
// Keep this list short: an entry is a promise to come back, not a place to hide a failure.
//   rule   — the axe rule id (https://dequeuniversity.com/rules/axe/4.14/<rule>)
//   where  — a part of "surface:screen" (e.g. "console:/office"); empty means everywhere
//   target — a part of the element's selector; empty means every element on those screens
//   reason — why it is accepted, and what would end it
export interface Allowed {
  rule: string;
  where?: string;
  target?: string;
  reason: string;
}

export const ALLOW: Allowed[] = [];
