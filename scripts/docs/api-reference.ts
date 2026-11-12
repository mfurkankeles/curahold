// Builds the developer reference pages (docs/site/<lang>/ref-*.md) from the
// API's own source (routes.ts) and the catalogue of what each address is for.
//
//   npx tsx scripts/docs/api-reference.ts          writes the pages
//   npx tsx scripts/docs/api-reference.ts --check  says what is missing, writes nothing
//
// The pages are kept in the repository like the hand-written ones, so the
// docs build stays simple and a change to an address shows up in review.
// tests/docs-reference.test.ts fails when they are out of step with the code.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { translate, type MessageKey } from '../../shared/src/i18n';
import { GROUPS, INTERNAL, type Pair } from './catalogue';
import { readRoutes, type BodyField, type RouteDoc } from './routes';

const ROOT = join(import.meta.dirname, '..', '..');
const LANGS = ['en', 'tr'] as const;
type Lang = (typeof LANGS)[number];
const pick = (p: Pair, lang: Lang) => p[lang === 'en' ? 0 : 1];

const WORDS: Record<Lang, Record<string, string>> = {
  en: {
    needs: 'Needs', sometimes: 'for some changes:', writer: 'a seat that can write', perm: 'permission', plan: 'plan', query: 'Query', field: 'Field', type: 'Type', notes: 'Notes',
    required: 'required', optional: 'optional', body: 'Body', bodyFree: 'Takes a body whose shape depends on what is sent; see the guide for this area.',
    generated: 'This page is built from the product\'s own code, so it always matches what the API accepts.',
    all: 'Every address', where: 'Details', internalTitle: 'Not part of the API', internalIntro: 'These addresses exist but belong to the browser or to other machines. They are listed so nothing is hidden.',
    objects: 'The shapes are in', shapes: 'Objects',
  },
  tr: {
    needs: 'Gerekenler', sometimes: 'bazı değişiklikler için:', writer: 'yazabilen bir koltuk', perm: 'yetki', plan: 'plan', query: 'Sorgu', field: 'Alan', type: 'Tür', notes: 'Not',
    required: 'zorunlu', optional: 'isteğe bağlı', body: 'Gövde', bodyFree: 'Biçimi gönderilene göre değişen bir gövde alır; bu alanın rehberine bak.',
    generated: 'Bu sayfa ürünün kendi kodundan üretilir; bu yüzden API\'nin kabul ettiğiyle her zaman aynıdır.',
    all: 'Bütün adresler', where: 'Ayrıntılar', internalTitle: 'API\'nin parçası olmayanlar', internalIntro: 'Bu adresler vardır ama tarayıcıya ya da başka makinelere aittir. Hiçbir şey gizli kalmasın diye listelenir.',
    objects: 'Biçimler şurada:', shapes: 'Nesneler',
  },
};

/** A field type or note in Turkish. The English is what routes.ts writes. */
function tr(s: string): string {
  const exact: Record<string, string> = {
    text: 'metin', number: 'sayı', 'whole number': 'tam sayı', 'yes/no': 'evet/hayır', id: 'kimlik', email: 'e-posta', 'web address': 'web adresi',
    date: 'tarih', 'date (YYYY-MM-DD)': 'tarih (YYYY-AA-GG)', 'date and time': 'tarih ve saat', 'any value': 'herhangi bir değer', object: 'nesne',
    'object (name → value)': 'nesne (ad → değer)', list: 'liste', value: 'değer', 'may be null': 'boş (null) olabilir',
  };
  if (exact[s]) return exact[s];
  let m: RegExpExecArray | null;
  if ((m = /^list of (.+)$/.exec(s))) return `${tr(m[1])} listesi`;
  if ((m = /^one of (.+)$/.exec(s))) return `şunlardan biri: ${m[1]}`;
  if ((m = /^always (.+)$/.exec(s))) return `her zaman ${m[1]}`;
  if ((m = /^(.+) or (.+)$/.exec(s))) return `${tr(m[1])} ya da ${tr(m[2])}`;
  if ((m = /^at most (.+) characters$/.exec(s))) return `en çok ${m[1]} karakter`;
  if ((m = /^at least (.+) characters$/.exec(s))) return `en az ${m[1]} karakter`;
  if ((m = /^exactly (.+) characters$/.exec(s))) return `tam ${m[1]} karakter`;
  if ((m = /^at most (.+) items$/.exec(s))) return `en çok ${m[1]} öğe`;
  if ((m = /^at least (.+) items$/.exec(s))) return `en az ${m[1]} öğe`;
  if ((m = /^at most (.+)$/.exec(s))) return `en çok ${m[1]}`;
  if ((m = /^at least (.+)$/.exec(s))) return `en az ${m[1]}`;
  if ((m = /^default (.+)$/.exec(s))) return `varsayılan ${m[1]}`;
  return s;
}
const say = (s: string, lang: Lang) => (lang === 'tr' ? tr(s) : s);
/** Table cells cannot hold a bare pipe. */
const cell = (s: string) => s.replace(/\|/g, '\\|');

const keyOf = (r: RouteDoc) => `${r.method} ${r.path}`;
const segment = (r: RouteDoc) => r.path.split('/')[1];

export interface Check {
  /** Addresses in the code with no sentence in the catalogue and not internal. */
  undocumented: string[];
  /** Sentences in the catalogue for addresses that no longer exist. */
  stale: string[];
}

export function check(all = readRoutes()): Check {
  const routes = all.filter((r) => r.api);
  const known = new Set(routes.map(keyOf));
  const documented = new Set(GROUPS.flatMap((g) => g.routes.map(([k]) => k)));
  return {
    undocumented: routes.filter((r) => !documented.has(keyOf(r)) && !INTERNAL[segment(r)]).map(keyOf).sort(),
    stale: [...documented].filter((k) => !known.has(k)).sort(),
  };
}

function fieldTable(fields: BodyField[], lang: Lang): string {
  const w = WORDS[lang];
  const rows = fields.map((f) => `| \`${f.name}\` | ${cell(say(f.type, lang))} | ${f.required ? w.required : w.optional} | ${cell(f.notes.map((n) => say(n, lang)).join('; '))} |`);
  return [`| ${w.field} | ${w.type} | | ${w.notes} |`, '| --- | --- | --- | --- |', ...rows].join('\n');
}

function routeBlock(r: RouteDoc, what: string, lang: Lang): string {
  const w = WORDS[lang];
  const out = [`### \`${r.method} ${r.path}\``, '', what];
  const needs = [r.writer ? w.writer : '', ...r.perms.map((p) => `${w.perm} \`${p}\``), ...r.permsSometimes.map((p) => `${w.sometimes} ${w.perm} \`${p}\``), r.plan ? `${w.plan}: \`${r.plan}\`` : ''].filter(Boolean);
  if (needs.length) out.push('', `**${w.needs}:** ${needs.join(' · ')}`);
  if (r.query.length) out.push('', `**${w.query}:** ${r.query.map((q) => `\`${q}\``).join(', ')}`);
  if (r.body.length) out.push('', fieldTable(r.body, lang));
  else if (r.bodyUnknown) out.push('', w.bodyFree);
  return out.join('\n');
}

export function pages(all = readRoutes()): { file: string; lang: Lang; content: string }[] {
  const routes = all.filter((r) => r.api);
  const byKey = new Map(routes.map((r) => [keyOf(r), r]));
  const out: { file: string; lang: Lang; content: string }[] = [];
  for (const lang of LANGS) {
    const w = WORDS[lang];
    GROUPS.forEach((g, i) => {
      const blocks = g.routes.filter(([k]) => byKey.has(k)).map(([k, en, trText]) => routeBlock(byKey.get(k)!, lang === 'en' ? en : trText, lang));
      const index = [`| | |`, '| --- | --- |', ...g.routes.filter(([k]) => byKey.has(k)).map(([k, en, trText]) => `| \`${k}\` | ${cell((lang === 'en' ? en : trText).split(/(?<=\.)\s/)[0])} |`)].join('\n');
      const content = [
        '---',
        `title: ${pick(g.title, lang)}`,
        'section: reference',
        `order: ${20 + i}`,
        `summary: ${pick(g.summary, lang)}`,
        '---',
        `# ${pick(g.title, lang)}`,
        '',
        pick(g.intro, lang),
        '',
        `> ${w.generated} ${w.objects} [${w.shapes}](/docs/${lang}/ref-objects/).`,
        '',
        `## ${w.all}`,
        '',
        index,
        '',
        `## ${w.where}`,
        '',
        blocks.join('\n\n'),
        '',
      ].join('\n');
      out.push({ file: `ref-${g.id}.md`, lang, content });
    });
    out.push({ file: 'ref-objects.md', lang, content: objectsPage(lang) });
    out.push({ file: 'ref-errors.md', lang, content: errorsPage(lang) });
    out.push({ file: 'ref-internal.md', lang, content: internalPage(routes, lang) });
  }
  return out;
}

/** The shapes the API answers with, lifted from the shared types the server itself uses. */
function objectsPage(lang: Lang): string {
  const sources: [file: string, names: string[]][] = [
    ['shared/src/model.ts', ['Account', 'AccountField', 'Board', 'Column', 'Task', 'TaskDetail', 'Comment', 'FileMeta', 'TimeEntry', 'Person', 'TrashItem', 'TrashRestored', 'ApiError']],
    ['shared/src/records.ts', ['RecordType', 'AppRecord', 'RecordDetail']],
    ['shared/src/timeline.ts', ['Activity', 'Meeting']],
  ];
  const title: Pair = ['Reference: objects', 'Başvuru: nesneler'];
  const summary: Pair = ['The shape of a customer, a task, a record and the rest, as the API answers.', 'API\'nin cevapladığı haliyle müşterinin, görevin, kaydın ve diğerlerinin biçimi.'];
  const intro: Pair = [
    'These are the shapes the API answers with, taken from the types the server itself is built on. A `?` after a name means the field may be missing; `| null` means it can be empty. Dates are `YYYY-MM-DD`, moments are ISO 8601 in UTC, ids are UUIDs.',
    'Bunlar API\'nin cevapladığı biçimlerdir; sunucunun kendi üzerine kurulduğu tiplerden alınır. Adın sonundaki `?` alanın hiç gelmeyebileceğini, `| null` boş olabileceğini söyler. Tarihler `YYYY-AA-GG`, anlar UTC olarak ISO 8601, kimlikler UUID biçimindedir.',
  ];
  const parts: string[] = [];
  for (const [file, names] of sources) {
    const src = readFileSync(join(ROOT, file), 'utf8');
    for (const name of names) {
      const m = new RegExp(`^export interface ${name}( extends [\\w<>, ]+)? \\{[\\s\\S]*?^\\}`, 'm').exec(src);
      if (!m) throw new Error(`${file}: interface ${name} not found`);
      parts.push(`## ${name}`, '', '```ts', m[0].replace(/^export /, ''), '```', '');
    }
  }
  return ['---', `title: ${pick(title, lang)}`, 'section: reference', 'order: 40', `summary: ${pick(summary, lang)}`, '---', `# ${pick(title, lang)}`, '', pick(intro, lang), '', ...parts].join('\n');
}

/** Every error code with its HTTP status and the sentence a person sees, from the server's own list. */
function errorsPage(lang: Lang): string {
  const src = readFileSync(join(ROOT, 'api', 'src', 'lib', 'errors.ts'), 'utf8');
  const block = /const STATUS: Record<ErrorCode, number> = \{([\s\S]*?)\n\};/.exec(src);
  if (!block) throw new Error('errors.ts: the status list was not found');
  const codes = [...block[1].matchAll(/^\s*(\w+): (\d+),/gm)].map((m) => [m[1], Number(m[2])] as const);
  const title: Pair = ['Reference: errors', 'Başvuru: hatalar'];
  const summary: Pair = ['Every error code, its HTTP status and what it means.', 'Her hata kodu, HTTP durumu ve ne anlama geldiği.'];
  const intro: Pair = [
    'An error always has the same shape: `{ "error": "<code>", "message": "<a sentence>" }`, sometimes with `fields` naming what was wrong. Decide by `error`, show `message`: the sentence comes in the language of the person behind the key (or of the `x-curahold-locale` header).',
    'Hata her zaman aynı biçimdedir: `{ "error": "<kod>", "message": "<bir cümle>" }`; bazen neyin yanlış olduğunu söyleyen `fields` ile. Kararı `error` ile ver, `message` değerini göster: cümle, anahtarın arkasındaki kişinin dilinde gelir (ya da `x-curahold-locale` başlığındaki dilde).',
  ];
  const head = lang === 'en' ? '| Code | Status | What the person is told |' : '| Kod | Durum | Kişiye söylenen |';
  const rows = codes.sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])).map(([code, status]) => `| \`${code}\` | ${status} | ${cell(translate(lang, `errors.${code}` as MessageKey).replace(/\{\w+\}/g, '…'))} |`);
  return ['---', `title: ${pick(title, lang)}`, 'section: reference', 'order: 39', `summary: ${pick(summary, lang)}`, '---', `# ${pick(title, lang)}`, '', pick(intro, lang), '', head, '| --- | --- | --- |', ...rows, ''].join('\n');
}

function internalPage(routes: RouteDoc[], lang: Lang): string {
  const w = WORDS[lang];
  const title: Pair = ['Reference: what is not in the API', 'Başvuru: API\'de olmayanlar'];
  const summary: Pair = ['Addresses that belong to the browser, listed so nothing is hidden.', 'Tarayıcıya ait adresler; hiçbir şey gizli kalmasın diye listelenir.'];
  const rows = Object.keys(INTERNAL)
    .sort()
    .map((seg) => `| \`/${seg}/…\` | ${routes.filter((r) => segment(r) === seg).length} | ${cell(pick(INTERNAL[seg], lang))} |`);
  const head = lang === 'en' ? '| Addresses | How many | Why |' : '| Adresler | Kaç tane | Neden |';
  return ['---', `title: ${pick(title, lang)}`, 'section: reference', 'order: 41', `summary: ${pick(summary, lang)}`, '---', `# ${pick(title, lang)}`, '', w.internalIntro, '', head, '| --- | --- | --- |', ...rows, ''].join('\n');
}

if (process.argv[1]?.endsWith('api-reference.ts')) {
  const routes = readRoutes();
  const c = check(routes);
  if (c.undocumented.length) console.log(`No sentence yet (${c.undocumented.length}):\n  ${c.undocumented.join('\n  ')}`);
  if (c.stale.length) console.log(`No longer in the code (${c.stale.length}):\n  ${c.stale.join('\n  ')}`);
  if (process.argv.includes('--check')) process.exit(c.undocumented.length || c.stale.length ? 1 : 0);
  const all = pages(routes);
  for (const p of all) writeFileSync(join(ROOT, 'docs', 'site', p.lang, p.file), p.content);
  console.log(`${all.length} pages written; ${routes.length} addresses, ${GROUPS.reduce((n, g) => n + g.routes.length, 0)} documented.`);
}
