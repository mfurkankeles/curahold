// Departments: the customer's path through a company and what each department
// starts its boards from. Pure data, shared by the server, the app and the seeds.
//
// The path: Inside Sales → Sales → Onboarding → Customer Success & Support.
// Onboarding is optional: a company without it hands a won deal straight from
// Sales to Customer Success (handoverAfter). Product and Finance sit beside the
// path and are reached through links and requests from any step.
import { phrase as P } from './i18n';
import type { DepartmentKey } from './model';
import { TEMPLATES, type TemplateBoard } from './templates';

/** The customer's path, in order. */
export const DEPARTMENT_FLOW: DepartmentKey[] = ['inside_sales', 'sales', 'onboarding', 'success'];
/** Linked to every step of the path, not on it. */
export const DEPARTMENT_SIDE: DepartmentKey[] = ['product', 'finance'];
/** A company may leave these out without breaking the path. */
export const OPTIONAL_DEPARTMENTS: DepartmentKey[] = ['onboarding'];

/**
 * Where work goes next on the customer's path, given the departments the company has on:
 * after Sales comes Onboarding, or Customer Success when there is no Onboarding.
 * Null at the end of the path, for Product and Finance, or when nothing later is on.
 */
export function handoverAfter(from: DepartmentKey, enabled: readonly DepartmentKey[]): DepartmentKey | null {
  const i = DEPARTMENT_FLOW.indexOf(from);
  if (i < 0) return null;
  return DEPARTMENT_FLOW.slice(i + 1).find((k) => enabled.includes(k)) ?? null;
}

const COL = (key: string, name: Parameters<typeof P>[0], done = false) => ({ key, name: P(name), done });

/** Inside Sales' own starting board: leads qualified before Sales takes them. */
const LEADS: TemplateBoard = {
  key: 'leads',
  name: P('dept.tpl.leads'),
  columns: [COL('new', 'tpl.new'), COL('contacted', 'dept.tpl.contacted'), COL('qualified', 'dept.tpl.qualified', true), COL('not_fit', 'dept.tpl.notFit', true)],
};

const pickBoards = (t: keyof typeof TEMPLATES, keys?: string[]) => TEMPLATES[t].boards.filter((b) => !keys || keys.includes(b.key)).map((b) => ({ ...b, id: `${t}.${b.key}` }));

const FROM: Record<DepartmentKey, () => (TemplateBoard & { id: string })[]> = {
  inside_sales: () => [{ ...LEADS, id: 'inside_sales.leads' }, ...pickBoards('marketing')],
  sales: () => pickBoards('sales'),
  onboarding: () => pickBoards('customer_success', ['onboarding']),
  success: () => [...pickBoards('customer_success', ['main', 'renewals']), ...pickBoards('support'), ...pickBoards('account_management')],
  product: () => pickBoards('product'),
  finance: () => pickBoards('finance'),
};

/** The department's board templates, without repeats (keyed "template.board"). */
export function departmentTemplates(key: DepartmentKey): (TemplateBoard & { id: string })[] {
  const seen = new Set<string>();
  return FROM[key]().filter((b) => {
    const sig = JSON.stringify(b.name);
    if (seen.has(sig)) return false;
    seen.add(sig);
    return true;
  });
}

/** The department a field rule names ("dept:finance"), or null for a role. */
export const deptOfToken = (s: string): DepartmentKey | null => (s.startsWith('dept:') ? (s.slice(5) as DepartmentKey) : null);
