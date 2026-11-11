// Creating a company: the org row, its built-in roles, the first admin and
// whatever the chosen template brings (vocabulary, account fields, boards,
// automations). Runs with owner access because no company exists yet.
import type { AutomationPreset } from '../../../shared/src/automation';
import { translate, type Locale } from '../../../shared/src/i18n';
import { PERMS, type Perm } from '../../../shared/src/model';
import { DEFAULT_PAGES } from '../../../shared/src/pages';
import { pick, TEMPLATES, type TemplateKey } from '../../../shared/src/templates';
import type { Db, Q } from '../db';

export const DEFAULT_ROLES: { key: string; perms: Perm[] }[] = [
  { key: 'admin', perms: [...PERMS] },
  { key: 'manager', perms: ['boards.view_all', 'teams.manage', 'tasks.delete_any', 'accounts.manage', 'accounts.view_all', 'automations.manage'] },
  // Everyone sees every customer until an administrator narrows a role.
  { key: 'member', perms: ['accounts.view_all'] },
  { key: 'viewer', perms: ['accounts.view_all'] },
];

export function defaultColumns(locale: Locale) {
  return [
    { key: 'todo', name: translate(locale, 'board.defaultColumns.todo'), done: false },
    { key: 'doing', name: translate(locale, 'board.defaultColumns.doing'), done: false },
    { key: 'done', name: translate(locale, 'board.defaultColumns.done'), done: true },
  ];
}

export interface NewOrg {
  slug: string;
  name: string;
  locale: Locale;
  timezone?: string;
  currency?: string;
  template?: TemplateKey;
  domains?: string[];
  admin: { email: string; name: string };
  /** Use these boards instead of creating the template's (template board key → board id). */
  boardMap?: Record<string, string>;
}

export async function createOrg(db: Db, input: NewOrg) {
  return db.system(async (q: Q) => {
    const template = TEMPLATES[input.template ?? 'blank'];
    const terms = template.terms ?? {};
    const [org] = await q.query<{ id: string }>(
      `insert into orgs (slug, name, locale, timezone, currency, template, domains, terms, account_fields)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
      [
        input.slug.toLowerCase(),
        input.name,
        input.locale,
        input.timezone ?? 'UTC',
        input.currency ?? 'USD',
        template.key,
        input.domains ?? [],
        JSON.stringify(terms),
        JSON.stringify(template.accountFields),
      ],
    );
    const roleIds: Record<string, string> = {};
    for (const r of DEFAULT_ROLES) {
      const [row] = await q.query<{ id: string }>(
        'insert into roles (org_id, key, name, perms, system) values ($1, $2, $3, $4, true) returning id',
        [org.id, r.key, translate(input.locale, `role.${r.key}` as any), r.perms],
      );
      roleIds[r.key] = row.id;
    }
    const [admin] = await q.query<{ id: string }>(
      // The founder set the company up, so their own first-run screen is skipped.
      `insert into users (org_id, email, name, role_id, seat, status, onboarded_at)
       values ($1, $2, $3, $4, 'full', 'active', now()) returning id`,
      [org.id, input.admin.email.toLowerCase(), input.admin.name, roleIds.admin],
    );
    for (const [i, p] of DEFAULT_PAGES.entries()) {
      await q.query('insert into pages (org_id, name, cards, home_for, position, created_by) values ($1, $2, $3, $4, $5, $6)', [
        org.id,
        pick(p.name, input.locale),
        JSON.stringify(p.cards),
        p.homeFor,
        i,
        admin.id,
      ]);
    }
    const boards: Record<string, string> = { ...(input.boardMap ?? {}) };
    if (!input.boardMap) {
      for (const b of template.boards) {
        const id = crypto.randomUUID();
        const columns = b.columns.map((c) => ({ key: c.key, name: pick(c.name, input.locale), done: c.done }));
        await q.query(
          `insert into boards (id, org_id, name, visibility, columns, created_by) values ($1, $2, $3, 'org', $4, $5)`,
          [id, org.id, pick(b.name, input.locale), JSON.stringify(columns), admin.id],
        );
        boards[b.key] = id;
      }
    }
    // With a board map the caller builds its own boards and rules (demo data).
    if (!input.boardMap) {
      for (const preset of template.automations) await insertPreset(q, org.id, admin.id, preset, boards, input.locale);
    }
    return { orgId: org.id, adminId: admin.id, roleIds, boards };
  });
}

/** Turns a template rule into a stored automation for this company's boards and language. */
export async function insertPreset(q: Q, orgId: string, by: string | null, p: AutomationPreset, boards: Record<string, string>, locale: Locale) {
  let action: unknown;
  if (p.action.type === 'create_tasks') {
    const boardId = boards[p.action.board];
    if (!boardId) return null;
    action = {
      type: 'create_tasks',
      boardId,
      tasks: p.action.tasks.map((t) => ({
        title: pick(t.title, locale),
        dueInDays: t.dueInDays,
        assignee: t.assignee,
        subtasks: (t.subtasks ?? []).map((s) => pick(s, locale)),
      })),
    };
  } else {
    action = { type: 'notify', to: p.action.to, message: pick(p.action.message, locale) };
  }
  const trigger = p.trigger.type === 'task_moved' && p.trigger.boardId ? { ...p.trigger, boardId: boards[p.trigger.boardId] ?? null } : p.trigger;
  const id = crypto.randomUUID();
  await q.query(
    `insert into automations (id, org_id, name, trigger, action, preset, created_by) values ($1, $2, $3, $4, $5, $6, $7)`,
    [id, orgId, pick(p.name, locale), JSON.stringify({ ...trigger, conditions: p.conditions ?? [] }), JSON.stringify(action), p.key, by],
  );
  return id;
}
