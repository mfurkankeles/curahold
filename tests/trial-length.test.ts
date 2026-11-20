// The trial's length is data (shared/src/plans.json → trial.months), but the words that state it are written by hand in
// every language: the help centre, the app's dictionaries (welcome mail, sign-up), the sales site. Six languages'
// billing pages once said "14 days" for a three-month trial. This reads every sentence that names the trial (or
// "free") next to a length and holds that length to the catalogue, in all eleven languages, so the two cannot
// drift. A sentence about something else that happens to sit beside the trial (a reminder 14 days before its end)
// names days without the trial word in the same sentence, or is listed below with the reason.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dictionaries, LOCALES, type Locale } from '../shared/src/i18n';
import { CATALOGUE } from '../shared/src/billing';
import { COPY, STORY_COPY } from '../site/content';
import { INFO } from '../site/info';

const ROOT = join(import.meta.dirname, '..');
const MONTHS = CATALOGUE.trial.months;

/** Per language: the words that name the trial (or a free start), and a length as number + unit. */
const WORDS: Record<Locale, { trial: RegExp; month: string; day: string; numbers?: Record<string, number> }> = {
  en: { trial: /\btrial\b|\bfree\b/i, month: 'months?', day: 'days?', numbers: { one: 1, two: 2, three: 3, four: 4, six: 6, twelve: 12, fourteen: 14, thirty: 30 } },
  tr: { trial: /deneme|ücretsiz/i, month: 'ay', day: 'gün', numbers: { bir: 1, iki: 2, üç: 3, dört: 4, altı: 6 } },
  ar: { trial: /تجرب|مجان/, month: '(?:شهر|أشهر|شهور)', day: '(?:يوم|أيام|يومًا)', numbers: { ثلاثة: 3, 'ثلاثة أشهر': 3 } },
  he: { trial: /ניסיון|חינם/, month: '(?:חודש|חודשים)', day: '(?:יום|ימים)', numbers: { שלושה: 3 } },
  fa: { trial: /آزمایشی|رایگان/, month: 'ماه', day: 'روز', numbers: { سه: 3 } },
  'zh-Hans': { trial: /试用|免费/, month: '(?:个月)', day: '天', numbers: { 三: 3 } },
  'zh-Hant': { trial: /試用|免費/, month: '(?:個月)', day: '天', numbers: { 三: 3 } },
  ja: { trial: /トライアル/, month: '(?:か月|ヶ月|カ月)', day: '日間?' },
  ko: { trial: /체험|무료/, month: '개월', day: '일', numbers: { 석: 3 } },
  hi: { trial: /ट्रायल|मुफ़्त|मुफ्त/, month: '(?:महीने|महीना|महीनों)', day: 'दिन', numbers: { तीन: 3 } },
  ms: { trial: /percubaan|percuma/i, month: 'bulan', day: 'hari(?! bekerja)', numbers: { tiga: 3, satu: 1 } },
};

/** Sentences that name a length beside the trial word but are not the trial's length (key: file or key + a fragment). */
const NOT_THE_TRIAL: [string, RegExp][] = [];

/**
 * The reminder days before the trial ends ("14, 7 and 1 day before"; TRIAL_DEFAULTS.reminderDays) are days next to the
 * trial word, not its length: the list is taken out before reading.
 */
const REMINDERS = /14\D{1,20}7(?!\d)\D{0,20}(?:1(?!\d))?/gu;

/** Sentence ends: spaced scripts after the stop and a space, Chinese and Japanese right after their full stop. */
const SENTENCE = /(?<=[.!?؟।])\s+|(?<=[。！？])|\n+/;

const digits = (s: string) => s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

/** Every text of a language, by where it lives: help pages (legal ones too: they state the trial), dictionaries, the site. */
function texts(l: Locale): [string, string][] {
  const out: [string, string][] = [];
  const dir = join(ROOT, 'docs', 'site', l);
  if (existsSync(dir))
    // The terms state the trial; the other legal pages' periods (retention, answering a request) are not its length.
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.md') && !x.startsWith('ref-') && (!x.startsWith('legal-') || x === 'legal-terms.md') && f0(x)))
      out.push([`docs/${l}/${f}`, readFileSync(join(dir, f), 'utf8').replace(/```[\s\S]*?```/g, ' ').replace(/\*\*/g, '')]);
  for (const [k, v] of Object.entries(dictionaries[l] as Record<string, string>)) if (typeof v === 'string') out.push([`dict.${k}`, v]);
  const leaves = (o: unknown, p = ''): [string, string][] =>
    typeof o === 'string' ? [[p, o]] : o && typeof o === 'object' ? Object.entries(o).flatMap(([k, v]) => leaves(v, p ? `${p}.${k}` : k)) : [];
  for (const [k, v] of [...leaves(COPY[l as keyof typeof COPY]), ...leaves(STORY_COPY[l as keyof typeof STORY_COPY]), ...leaves((INFO as Record<string, unknown>)[l])]) out.push([`site.${k}`, v]);
  return out;
}
// Release notes describe the past (an older trial length may be history there).
function f0(name: string) {
  return name !== 'release-notes.md';
}

/** The lengths a sentence names, in days, for sentences that name the trial. */
function lengths(l: Locale, sentence: string): { months?: number; days?: number; text: string }[] {
  const w = WORDS[l];
  if (!w.trial.test(sentence)) return [];
  const s = digits(sentence).replace(REMINDERS, ' ');
  const num = `(\\d+|${Object.keys(w.numbers ?? {}).join('|') || '\\d+'})`;
  const found: { months?: number; days?: number; text: string }[] = [];
  const value = (t: string) => (/^\d+$/.test(t) ? Number(t) : (w.numbers?.[t] ?? NaN));
  // A unit ends at a word boundary where words are spaced; Chinese, Japanese and Korean run the next word on.
  const end = /^(zh|ja|ko)/.test(l) ? '' : '(?![\\p{L}])';
  for (const m of s.matchAll(new RegExp(`${num}[\\s-]*${w.month}${end}`, 'giu'))) found.push({ months: value(m[1]!.toLowerCase()), text: m[0] });
  for (const m of s.matchAll(new RegExp(`${num}[\\s-]*${w.day}${end}`, 'giu'))) found.push({ days: value(m[1]!.toLowerCase()), text: m[0] });
  return found;
}

describe('the trial length in words', () => {
  it.each(LOCALES.map((l) => [l] as const))('%s says the trial lasts as long as the catalogue says', (l) => {
    const bad: string[] = [];
    for (const [where, text] of texts(l))
      for (const sentence of text.split(SENTENCE)) {
        if (NOT_THE_TRIAL.some(([k, re]) => where.includes(k) && re.test(sentence))) continue;
        for (const x of lengths(l, sentence)) if (x.days !== undefined || x.months !== MONTHS) bad.push(`${where}: "${x.text}" in ${sentence.trim().slice(0, 120)}`);
      }
    expect(bad.join('\n')).toBe('');
  });

  it('the billing help page of every language states the trial length in its trial section, and no other', () => {
    const wrong = LOCALES.flatMap((l) => {
      const page = join(ROOT, 'docs', 'site', l, 'billing.md');
      if (!existsSync(page)) return [`${l}: no billing page`];
      // The first section is the free trial: every length in it is read as the trial's.
      const first = readFileSync(page, 'utf8').replace(/\*\*/g, '').split(/\n## /)[1] ?? '';
      const trialWord = WORDS[l].trial.source.split('|')[0]!.replace(/\\b/g, '');
      const found = first.split(SENTENCE).flatMap((s) => lengths(l, `${s} ${trialWord}`));
      const off = found.filter((x) => x.days !== undefined || x.months !== MONTHS).map((x) => `${l}: "${x.text}"`);
      return found.some((x) => x.months === MONTHS) ? off : [...off, `${l}: the trial length (${MONTHS} months) is not stated`];
    });
    expect(wrong).toEqual([]);
  });
});
