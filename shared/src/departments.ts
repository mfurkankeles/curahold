// What each department starts its boards from. A lead opens a board from one of
// these (or a blank one); the boards are the same ones the company templates use.
import type { DepartmentKey } from './model';
import { TEMPLATES, type TemplateBoard } from './templates';

const FROM: Record<DepartmentKey, (keyof typeof TEMPLATES)[]> = {
  sales: ['sales'],
  success: ['customer_success', 'account_management', 'support'],
  product: ['product'],
  finance: ['finance'],
};

/** The department's board templates, without repeats (keyed "template.board"). */
export function departmentTemplates(key: DepartmentKey): (TemplateBoard & { id: string })[] {
  const seen = new Set<string>();
  const out: (TemplateBoard & { id: string })[] = [];
  for (const t of FROM[key]) {
    for (const b of TEMPLATES[t].boards) {
      const sig = JSON.stringify(b.name);
      if (seen.has(sig)) continue;
      seen.add(sig);
      out.push({ ...b, id: `${t}.${b.key}` });
    }
  }
  return out;
}

/** The department whose band on the customer page a field rule names ("dept:finance"). */
export const deptOfToken = (s: string): DepartmentKey | null => (s.startsWith('dept:') ? (s.slice(5) as DepartmentKey) : null);
