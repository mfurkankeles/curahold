// The security testing calendar, as one command per cadence (docs/security/testing-calendar.md).
//
//   npx tsx scripts/security/scan.ts weekly      own code: production dependency audit, lockfile sources,
//                                                secrets in the tree, and the guard suites
//   npx tsx scripts/security/scan.ts monthly     weekly + known-vulnerable front-end libraries in the build +
//                                                the staging probe (STAGING_URL)
//   npx tsx scripts/security/scan.ts quarterly   monthly + the restore drill (DRILL_PG) + the manual checklist
//
// COST/DEPENDENCIES: the outside scanners run through `npx --yes <package>@<major>` — fetched into npx's own
// cache, never added to package.json (CLAUDE.md: no new runtime dependency). All are free, open-source tools
// that read local files; none sends the code anywhere. SECURITY: nothing here touches production or any
// system that is not ours; the only network target is the staging probe, which refuses other hosts.
// Exit code 1 when any step fails, so a scheduled run can raise an alert.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = join(import.meta.dirname, '..', '..');

/** A step of the calendar: what it checks, and the command (run from the repository root). */
export interface Step {
  name: string;
  cmd: string[];
  /** Why the step is skipped this run (a setting is missing), or nothing. */
  skip?: () => string | undefined;
}

/** The guard suites that encode our own attack cases (isolation, leaks, security probes, the AI team's red team). */
const GUARDS = ['tests/isolation.test.ts', 'tests/isolation-routes.test.ts', 'tests/rls.test.ts', 'tests/leak.test.ts', 'tests/security.test.ts', 'tests/security-probes.test.ts', 'tests/mcp-security.test.ts', 'tests/team-redteam.test.ts'];

/** The steps of each cadence; a longer cadence includes the shorter ones. */
export function steps(cadence: 'weekly' | 'monthly' | 'quarterly'): Step[] {
  const weekly: Step[] = [
    { name: 'Production dependencies: no high or critical advisory', cmd: ['npm', 'audit', '--omit=dev', '--audit-level=high'] },
    { name: 'Lockfile: every package from the npm registry over https', cmd: ['npx', '--yes', 'lockfile-lint@4', '--path', 'package-lock.json', '--type', 'npm', '--allowed-hosts', 'npm', '--validate-https'] },
    {
      name: 'Secrets: no keys, tokens or private keys committed',
      cmd: ['npx', '--yes', '-p', 'secretlint@9', '-p', '@secretlint/secretlint-rule-preset-recommend@9', 'secretlint', '--secretlintrc', 'scripts/security/secretlintrc.json', '--secretlintignore', 'scripts/security/secretlintignore', '**/*'],
    },
    { name: 'Guard suites: tenant isolation, leaks, security probes, AI-team red team', cmd: ['npx', 'vitest', 'run', ...GUARDS, '--maxWorkers=1'] },
  ];
  const monthly: Step[] = [
    ...weekly,
    {
      name: 'Front-end libraries in the built app: none with a known vulnerability',
      cmd: ['npx', '--yes', 'retire@5', '--path', 'dist', '--exitwith', '1'],
      skip: () => (existsSync(join(ROOT, 'dist')) ? undefined : 'no dist/ (run npm run build first)'),
    },
    {
      name: 'Staging probe: headers, security.txt, signed-out API, errors, CORS',
      cmd: ['npx', 'tsx', 'scripts/security/staging-probe.ts'],
      skip: () => (process.env.STAGING_URL ? undefined : 'STAGING_URL not set'),
    },
  ];
  if (cadence === 'weekly') return weekly;
  if (cadence === 'monthly') return monthly;
  return [
    ...monthly,
    {
      name: 'Restore drill: back up, wipe, restore, verify row counts and RLS',
      cmd: ['npx', 'tsx', 'scripts/backup/restore-drill.ts'],
      skip: () => (process.env.DRILL_PG ? undefined : 'DRILL_PG (a throwaway Postgres) not set'),
    },
  ];
}

/** The quarterly items a person does (printed at the end of a quarterly run). */
export const MANUAL_QUARTERLY = [
  'Threat model (docs/security/threat-model.md): walk each surface for new screens, routes and connectors.',
  'ASVS sheet (docs/security/asvs.md): re-check the open items; close or re-date them.',
  'Access review: platform owners, STAFF_KEYS, Cloudflare/Supabase/registrar/GitHub members and their 2FA; remove leavers.',
  'Red-team exercise against staging (OWASP Top 10, API Top 10, LLM Top 10, tenant isolation, the AI gate); findings filed with severity.',
  'Sub-processors: compare the inventory (shared/src/compliance/dataInventory.ts) with the real accounts; renew transfer documents.',
  'Restore drill against a copy of production (Supabase "restore to a new project"), as the runbook asks.',
];

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cadence = process.argv[2] as 'weekly' | 'monthly' | 'quarterly';
  if (!['weekly', 'monthly', 'quarterly'].includes(cadence)) {
    console.error('Usage: npx tsx scripts/security/scan.ts weekly|monthly|quarterly');
    process.exit(2);
  }
  let failed = 0;
  for (const s of steps(cadence)) {
    const why = s.skip?.();
    if (why) {
      console.log(`SKIP  ${s.name} — ${why}`);
      continue;
    }
    const started = Date.now();
    const r = spawnSync(s.cmd[0], s.cmd.slice(1), { cwd: ROOT, stdio: 'inherit', shell: false });
    const ok = r.status === 0;
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${s.name} (${((Date.now() - started) / 1000).toFixed(1)} s)`);
  }
  if (cadence === 'quarterly') for (const m of MANUAL_QUARTERLY) console.log(`TODO  ${m}`);
  process.exit(failed ? 1 : 0);
}
