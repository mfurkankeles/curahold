// Loads the business plan's targets file into the owner console's Plan &
// targets: monthly targets, the two milestones, the planned budget, the
// fundraising windows and the plan's tasks, for one scenario. The same reader
// and the same writer as the console's "Load from the plan" button
// (shared/src/ownerPlan.ts readPlanFile, api/src/lib/ownerPlan.ts importPlan),
// so the two can never load a file differently. Loading again is safe: spend
// the owner typed, window statuses and notes are kept, no task is added twice.
//
//   DATABASE_URL=postgres://… npx tsx scripts/plan/load-targets.ts --file path/to/targets.json [--scenario baz] [--dry-run] [--by owner@…]
//
// Without DATABASE_URL it only reads the file and prints what it would load.
import { readFileSync } from 'node:fs';
import { importPlan } from '../../api/src/lib/ownerPlan';
import { postgresDb } from '../../api/src/db/postgres';
import { readPlanFile } from '../../shared/src/ownerPlan';

/** `--name value` from the command line. */
function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : null;
}

const file = arg('file');
if (!file) {
  console.error('Give the plan file: --file path/to/targets.json');
  process.exit(1);
}
const locale = arg('locale') === 'en' ? 'en' : 'tr';
const read = readPlanFile(JSON.parse(readFileSync(file, 'utf8')), arg('scenario'), locale);
if (!read.ok) {
  console.error(`Not loaded. Scenarios in the file: ${read.scenarios.join(', ') || 'none'}`);
  for (const e of read.errors) console.error(`  - ${e}`);
  process.exit(1);
}
const p = read.plan;
console.log(`Scenario ${p.scenario} (budget: ${p.capitalScenario ?? 'none'}): ${p.targets.length} targets, ${p.budget.length} budget lines, ${p.windows.length} windows, ${p.tasks.length} tasks.`);
const url = process.env.DATABASE_URL;
if (process.argv.includes('--dry-run') || !url) {
  if (!url) console.log('No DATABASE_URL: nothing was written.');
  process.exit(0);
}
const db = postgresDb(url, { max: 1 });
try {
  const counts = await importPlan({ db }, p, arg('by') ?? 'plan-loader');
  console.log(`Loaded: ${counts.targets} targets, ${counts.budget} budget lines, ${counts.windows} windows, ${counts.tasks} new tasks.`);
} finally {
  await db.close();
}
