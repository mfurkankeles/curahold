// Writes every setup check into the help page "Setup health" in each of the
// nine languages, from the dictionaries themselves (sh.<id>.problem / .why /
// .fix): what we notice, why it matters, and the button that fixes it, grouped
// by area. A check cannot ship without its help text: tests/setup-health.test.ts
// fails until this has been run and the page holds the block word for word.
//
//   npx tsx scripts/docs/setup-health-page.ts
//
// Only the part between the two markers is written; the rest of the page is
// written by hand.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LOCALES, translate, type Locale, type MessageKey } from '../../shared/src/i18n';
import { CHECKS, SETUP_AREAS, SEVERITIES } from '../../shared/src/setupHealth';

export const HELP_PAGE = 'setup-health.md';
const START = '<!-- setup-checks:start (scripts/docs/setup-health-page.ts writes this part) -->';
const END = '<!-- setup-checks:end -->';

/** A table cell: one line, no pipes. */
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

/** The block for one language: a table per area, worst first within it. */
export function helpBlock(l: Locale): string {
  const say = (k: string) => translate(l, k as MessageKey, { n: '…', ref: '…' });
  const head = `| ${say('sh.doc.col.notice')} | ${say('sh.doc.col.why')} | ${say('sh.doc.col.button')} |\n| --- | --- | --- |`;
  const parts = SETUP_AREAS.filter((a) => CHECKS.some((c) => c.area === a)).map((a) => {
    const rows = CHECKS.filter((c) => c.area === a)
      .sort((x, y) => SEVERITIES.indexOf(x.severity) - SEVERITIES.indexOf(y.severity))
      .map((c) => `| ${cell(say(`sh.${c.id}.problem`))} (${cell(say(`sh.sev.${c.severity}`))}) | ${cell(say(`sh.${c.id}.why`))} | **${cell(say(`sh.${c.id}.fix`))}** |`);
    return `### ${say(`sh.area.${a}`)}\n\n${head}\n${rows.join('\n')}`;
  });
  return `${START}\n\n${parts.join('\n\n')}\n\n${END}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const l of LOCALES) {
    const file = join(import.meta.dirname, '..', '..', 'docs', 'site', l, HELP_PAGE);
    const page = readFileSync(file, 'utf8');
    const a = page.indexOf(START);
    const b = page.indexOf(END);
    if (a < 0 || b < a) throw new Error(`${l}/${HELP_PAGE}: the two markers are missing`);
    writeFileSync(file, page.slice(0, a) + helpBlock(l) + page.slice(b + END.length));
    console.log(`${l}/${HELP_PAGE}`);
  }
}
