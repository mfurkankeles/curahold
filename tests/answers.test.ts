// "Ask" answers from the documentation, with no language model. These tests
// hold it to a standard: everyday questions in both languages find the right
// page, it is sure only when it is right, and it is fast.
//
// The questions are what people actually type, with the pages that answer them
// (more than one page can be a good answer).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { ask, prepare, sameWord, stem, wordsOf, type AnswerIndex } from '../shared/src/answers';

const QUESTIONS: Record<'en' | 'tr', [question: string, pages: string][]> = {
  en: [
    ['How do I import customers from a spreadsheet?', 'customers'],
    ['How do I connect Salesforce?', 'connections'],
    ['What can each role see?', 'roles-and-access'],
    ['How do I make an API key?', 'api-keys|quickstart'],
    ['How do I verify a webhook signature?', 'webhooks'],
    ['How is the health score worked out?', 'timeline-and-health'],
    ['add a task with a due date', 'tasks|quick-add'],
    ['invite a customer to the portal', 'customer-portal'],
    ['what happens when two people edit the same task', 'api-reference|tasks'],
    ['send a change only once', 'api-reference'],
    ['install on my phone', 'getting-started'],
    ['change my language to Turkish', 'getting-started'],
    ['how much does it cost', 'billing'],
    ['run curahold on my own server', 'self-hosting'],
    ['connect claude or chatgpt', 'ai-assistants'],
    ['list of error codes', 'ref-errors|api-reference'],
    ['PATCH /tasks/:id', 'ref-tasks'],
    ['how do I contact support', 'getting-help'],
    ['what is a record', 'customers'],
    ['mute notifications for a task', 'notifications|tasks'],
    ['build my own report', 'pipeline-and-reports'],
    ['device limit', 'getting-started'],
    ['where is my data stored', 'security-and-privacy|legal-privacy'],
    ['keep my own system in sync', 'connect-your-own-tool'],
    ['I deleted a customer by mistake', 'customers|trash'],
    ['how do I get a deleted task back', 'tasks|trash'],
  ],
  tr: [
    ['Müşterileri bir tablodan nasıl içe aktarırım?', 'customers'],
    ['Salesforce’u nasıl bağlarım?', 'connections'],
    ['Hangi rol neyi görür?', 'roles-and-access'],
    ['API anahtarı nasıl oluşturulur?', 'api-keys|quickstart'],
    ['Webhook imzasını nasıl doğrularım?', 'webhooks'],
    ['Sağlık skoru nasıl hesaplanır?', 'timeline-and-health'],
    ['bitiş tarihi olan görev ekle', 'tasks|quick-add'],
    ['müşteriyi portala davet et', 'customer-portal'],
    ['telefonuma nasıl kurarım', 'getting-started'],
    ['dili türkçe yap', 'getting-started'],
    ['fiyatı ne kadar', 'billing'],
    ['kendi sunucumda çalıştırmak', 'self-hosting'],
    ['claude ya da chatgpt bağlamak', 'ai-assistants'],
    ['hata kodları listesi', 'ref-errors|api-reference'],
    ['desteğe nasıl ulaşırım', 'getting-help'],
    ['görev bildirimlerini kapat', 'notifications|tasks'],
    ['kendi raporumu oluştur', 'pipeline-and-reports'],
    ['cihaz sınırı', 'getting-started'],
    ['verilerim nerede saklanıyor', 'security-and-privacy|legal-privacy'],
    ['kendi sistemimi eşit tut', 'connect-your-own-tool'],
    ['silinen görevi nasıl geri alırım', 'tasks|trash'],
    ['kalıcı olarak silmek', 'trash'],
  ],
};

const index = {} as Record<'en' | 'tr', AnswerIndex>;
beforeAll(() => {
  // The docs as they are built for the site; "Ask" reads what that build writes.
  const out = mkdtempSync(join(tmpdir(), 'curahold-docs-'));
  execFileSync(process.execPath, ['--import', 'tsx', 'scripts/build-docs.ts', out, '--relative'], { stdio: 'ignore' });
  for (const lang of ['en', 'tr'] as const) index[lang] = prepare(JSON.parse(readFileSync(join(out, lang, 'answers.json'), 'utf8')));
}, 60_000);

const pageOf = (u: string) => u.split('/')[3];

describe('answers from the docs', () => {
  it('finds the right page for everyday questions, in English and in Turkish', () => {
    let first = 0;
    let topThree = 0;
    let sure = 0;
    let sureAndRight = 0;
    let total = 0;
    const misses: string[] = [];
    for (const lang of ['en', 'tr'] as const) {
      for (const [question, pages] of QUESTIONS[lang]) {
        const want = pages.split('|');
        const a = ask(index[lang], question);
        const got = a.found.map((f) => pageOf(f.section.u));
        total++;
        if (want.includes(got[0])) first++;
        else misses.push(`${question} → ${got[0]}`);
        if (got.slice(0, 3).some((g) => want.includes(g))) topThree++;
        if (a.confident) {
          sure++;
          if (want.includes(got[0])) sureAndRight++;
        }
      }
    }
    // Measured on 12 November 2026: 47 of 48 first, 48 of 48 in the top three, sure of 41 and right on all 41.
    expect(first, misses.join('; ')).toBeGreaterThanOrEqual(44);
    expect(topThree).toBeGreaterThanOrEqual(47);
    expect(sure).toBeGreaterThanOrEqual(35);
    // When it says it is sure, it is right: at most one slip in the whole set.
    expect(sure - sureAndRight).toBeLessThanOrEqual(1);
    expect(total).toBe(48);
  });

  it('says so when the docs do not cover something, instead of guessing', () => {
    for (const q of ['what is the weather in Ankara tomorrow', 'kedim neden miyavlıyor', 'xyzzy plugh']) {
      const a = ask(index[q.includes('kedi') ? 'tr' : 'en'], q);
      expect(a.confident, q).toBe(false);
    }
  });

  it('knows a greeting and a thank-you from a question', () => {
    expect(ask(index.en, 'hello').kind).toBe('hello');
    expect(ask(index.tr, 'Merhaba!').kind).toBe('hello');
    expect(ask(index.en, 'thanks').kind).toBe('thanks');
    expect(ask(index.tr, 'teşekkürler').kind).toBe('thanks');
    expect(ask(index.en, '   ').kind).toBe('empty');
    expect(ask(index.en, 'how do I add a task').kind).toBe('answer');
  });

  it('leans towards the page of the last answer for a follow-up', () => {
    const page = ask(index.en, 'How do I verify a webhook signature?').found[0].section.u;
    const scoreOn = (near?: string) => ask(index.en, 'what if it arrives twice', near).found.find((f) => f.section.u === page)?.score ?? 0;
    expect(scoreOn(page)).toBeGreaterThan(scoreOn());
  });

  it('answers in a few milliseconds', () => {
    const all = [...QUESTIONS.en, ...QUESTIONS.tr];
    const t0 = performance.now();
    for (const [q] of QUESTIONS.en) ask(index.en, q);
    for (const [q] of QUESTIONS.tr) ask(index.tr, q);
    expect((performance.now() - t0) / all.length).toBeLessThan(25);
  });
});

describe('words', () => {
  it('takes Turkish endings and English plurals off', () => {
    expect(stem('gorevlerimi')).toBe(stem('gorev'));
    expect(stem('telefonuma')).toBe(stem('telefona'));
    expect(stem('musterileri')).toBe(stem('musteri'));
    expect(stem('tasks')).toBe('task');
    expect(stem('companies')).toBe('company');
    expect(stem('address')).toBe('address');
  });

  it('folds Turkish letters before comparing', () => {
    expect(wordsOf('İstanbul’daki MÜŞTERİLER')).toEqual(wordsOf('istanbul daki musteriler'));
    expect(sameWord(wordsOf('görevler')[0], wordsOf('GÖREV')[0])).toBe(true);
    expect(sameWord('customer', 'customise')).toBe(false);
  });
});
