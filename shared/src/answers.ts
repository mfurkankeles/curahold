// Answers from the documentation.
//
// "Ask" in the product and on the docs site finds the part of the docs that
// answers a question and shows it, with where it came from. There is no
// language model behind it: the docs are cut into sections when they are
// built, and a question is matched against them here, in the reader's
// browser. So an answer costs nothing, works without a connection once the
// docs are loaded, never invents anything, and nothing the person types
// leaves their device.
//
// The same code runs in the app (React) and on the docs site (a small script).
import { foldText } from './text';

/** One section of a docs page, as the docs build writes it (answers.json). */
export interface DocSection {
  /** The page's address: /docs/en/webhooks/ */
  u: string;
  /** The section's anchor on the page; empty for the page's opening. */
  a: string;
  /** The page's title. */
  t: string;
  /** The section's heading; empty for the page's opening. */
  h: string;
  /** The section as the docs show it (HTML). */
  m: string;
  /** The part of the docs it belongs to: help, developers, reference, releases, legal. */
  s: string;
}

/** Where a word appears: in which sections' headings and page titles, and how often in which sections' text. */
interface Places {
  head: number[];
  title: number[];
  text: [section: number, times: number][];
}

export interface AnswerIndex {
  sections: DocSection[];
  /** Every word of the docs, with where it appears. */
  words: Map<string, Places>;
  /** The words of each section's heading, for matching a whole phrase. */
  heads: string[];
}

export interface Found {
  section: DocSection;
  score: number;
}

export interface Answer {
  /** What kind of thing was asked: a question, or just a greeting or thanks. */
  kind: 'answer' | 'hello' | 'thanks' | 'empty';
  /** Best first. Empty when nothing in the docs is close. */
  found: Found[];
  /** True when the best section is very likely what was asked about. */
  confident: boolean;
}

// Words that carry no meaning for finding a section, in both languages (folded).
const STOP = new Set(
  (
    'a an the and or but if then else of to in on at by for from with without into over under is are was were be been being do does did have has had can could should would will may might ' +
    'i you he she it we they me my your our their this that these those there here what which who whom when where why how not no yes so as than too very just also any some all each every ' +
    'please want need like get make use using about tell show give let much many happen happens ' +
    've veya ama fakat ile icin gibi kadar bu su o bir da de mi mu ki ne nasil neden nicin nerede nereden hangi kim ben sen biz siz onlar benim senin bizim sizin ' +
    'var yok evet hayir cok daha en her hic bazi tum butun olarak olan olur oldu olmak etmek yapmak yapilir yapabilirim istiyorum lazim gerek lutfen bana bize ' +
    'neyi neye nedir neler nelerdir kimler kimi kime hangisi nasildir midir kadar ' +
    // "Again": it stems to "yeni" (new) and would answer every question about adding something with retries.
    'yeniden ' +
    // Short verbs in the polite imperative the help pages use ("… verin", "… alın"): "verin" starts like "veri" (data)
    // and would answer every question about data with any page that says "give".
    'verin alin edin olun yapin ' +
    // Malay.
    'bagaimana macam mana apa apakah di ke dari untuk dengan yang ini itu saya anda kami kita boleh tidak tak ada adakah sila tolong cara dalam pada atau dan juga akan sudah bila mengapa kenapa siapa mahu ingin perlu saja sahaja ' +
    // The product's own name is in nearly every question and every page: it finds nothing.
    'curahold'
  ).split(' '),
);

// Words people use for the same thing, across the Latin-script languages (folded).
const ALIKE: string[][] = [
  ['delete', 'remove', 'trash', 'sil', 'silme', 'kaldir', 'cop', 'padam', 'buang', 'sampah'],
  ['add', 'create', 'new', 'ekle', 'olustur', 'yeni', 'ac', 'tambah', 'cipta', 'baharu'],
  ['change', 'edit', 'update', 'rename', 'degistir', 'duzenle', 'guncelle', 'tukar', 'sunting', 'kemas', 'ubah'],
  ['password', 'sifre', 'parola', 'login', 'signin', 'sign', 'giris', 'oturum', 'laluan', 'masuk'],
  ['price', 'pricing', 'cost', 'billing', 'invoice', 'plan', 'fiyat', 'ucret', 'odeme', 'fatura', 'harga', 'kos', 'bil', 'invois', 'pelan', 'bayaran'],
  ['import', 'csv', 'excel', 'spreadsheet', 'aktar', 'aktarma', 'tablo', 'hamparan'],
  ['key', 'token', 'anahtar', 'kunci'],
  ['permission', 'role', 'access', 'yetki', 'rol', 'erisim', 'izin', 'kebenaran', 'peranan', 'akses'],
  ['customer', 'account', 'musteri', 'hesap', 'pelanggan', 'akaun'],
  ['task', 'todo', 'gorev', 'tugasan', 'tugas'],
  ['notification', 'notify', 'alert', 'bildirim', 'uyari', 'pemberitahuan', 'makluman'],
  ['language', 'dil', 'turkce', 'turkish', 'english', 'ingilizce', 'bahasa', 'melayu', 'inggeris'],
  ['connect', 'connection', 'integration', 'integrate', 'sync', 'bagla', 'baglan', 'baglanti', 'entegrasyon', 'esitleme', 'sambung', 'sambungan', 'integrasi', 'penyepaduan', 'segerak'],
  ['error', 'fail', 'failed', 'problem', 'hata', 'sorun', 'calismiyor', 'ralat', 'gagal', 'masalah'],
  ['invite', 'davet', 'people', 'person', 'user', 'kisi', 'kullanici', 'jemput', 'pengguna', 'orang'],
  ['report', 'dashboard', 'rapor', 'pano', 'gosterge', 'laporan', 'pemuka'],
  ['export', 'download', 'disa', 'indir', 'eksport'],
  ['phone', 'mobile', 'install', 'telefon', 'mobil', 'kur', 'pasang', 'peranti'],
  ['support', 'help', 'ticket', 'destek', 'yardim', 'talep', 'sokongan', 'bantuan', 'tiket'],
  ['server', 'host', 'hosting', 'selfhost', 'sunucu', 'barindir', 'pelayan'],
  ['see', 'view', 'visible', 'gor', 'gorur', 'gorunur', 'lihat', 'nampak'],
  ['stored', 'store', 'kept', 'saklan', 'saklaniyor', 'tutul', 'simpan', 'disimpan'],
  ['close', 'mute', 'stop', 'off', 'kapat', 'sustur', 'durdur', 'tutup', 'senyap', 'henti'],
];

// The endings Turkish adds to a noun or a verb, after folding (so ı/i and ü/u are one letter), and the
// English plural. Taken off from the end, up to three times, while at least four letters remain.
const ENDING = /(lari|leri|lar|ler|imiz|umuz|iniz|unuz|inin|unun|nin|nun|inda|inde|unda|unde|indan|inden|undan|unden|dan|den|tan|ten|yla|yle|ini|unu|ina|ine|una|une|imi|umu|ir|ur|im|um|in|un|da|de|ta|te|ya|ye|yi|yu|i|u|a|e)$/;
const stems = new Map<string, string>();
/** A word without its endings: "görevlerimi" → "gorev", "telefonuma" → "telefon", "tasks" → "task". */
export function stem(w: string): string {
  let out = stems.get(w);
  if (out !== undefined) return out;
  out = w;
  if (/^[a-z]+$/.test(out)) {
    if (out.length > 4 && out.endsWith('s') && !out.endsWith('ss')) out = out.endsWith('ies') ? `${out.slice(0, -3)}y` : out.slice(0, -1);
    for (let i = 0; i < 3; i++) {
      const m = ENDING.exec(out);
      if (!m || out.length - m[0].length < 4) break;
      out = out.slice(0, -m[0].length);
    }
  }
  stems.set(w, out);
  return out;
}

// Scripts without the Latin alphabet: Chinese, Japanese and Korean (often no spaces between
// words), Arabic, Persian and Hebrew (prefixes and suffixes glued to the word).
const OTHER_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\u30fc\p{Script=Hangul}\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Devanagari}]+/gu;
const SPACED = /^[\p{Script=Hangul}\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Devanagari}]+$/u;
/** Arabic and Persian letters that are written several ways, and the marks a reader may or may not type. */
const unify = (w: string) =>
  w
    .replace(/[\u064b-\u065f\u0670\u0640\u0591-\u05c7]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/[ىی]/g, 'ي')
    .replace(/ک/g, 'ك')
    // Hindi: the nukta dot and the two nasal marks are typed either way ("ज़्यादा"/"ज्यादा", "कहाँ"/"कहां").
    .replace(/\u093c/g, '')
    .replace(/\u0901/g, '\u0902')
    .replace(/ة/g, 'ه')
    // The Arabic article ("the") and the one-letter words joined to it: "والعملاء" → "عملاء".
    .replace(/^[وفبكل]?ال(?=.{3})/, '');
const HANGUL = /\p{Script=Hangul}/u;
// Question words and small words in those languages (as unify() writes them): they find nothing.
const STOP_OTHER = new Set(
  (
    'كيف ماذا ما من في على الي إلى عن هل اين متى لماذا التي الذي هذا هذه ثم او و مع كل بعد قبل يمكن يمكنني اريد ' +
    'چطور چگونه چه كجا از به در با را كه اين ان يك مي كنم كنيم است هست براي تا يا ايا ' +
    'איך מה איפה מתי למה את של על עם אם זה זו או גם כל אני אנחנו לי לנו אפשר ' +
    // "Write (me) …": a request for text, never a search; "כתוב" would otherwise find "כתובת" (address).
    'כתוב כתבי כתבו اكتب اكتبي بنويس بنويسيد ' +
    '어떻게 무엇 무엇을 어디서 어디 누구 언제 왜 하나요 있나요 되나요 하려면 수 ' +
    'कैसे क्या कहां कब क्यों कौन का की के में से को पर और या है हैं था मैं हम मुझे मेरा मेरे मेरी अपने अपना अपनी एक यह वह ये वे कर करें करूं करना सकता सकती सकते हूं हो होता होती कोई नहीं लिए भी तो'
  )
    .split(' ')
    .map((w) => unify(w)),
);

/**
 * The pieces of a text in those scripts that a search can match: every two
 * letters side by side ("顧客を" → "顧客", "客を"). Without a dictionary of
 * each language this is what finds "고객을" in "고객" and "استيراد" near
 * "أستورد"; a piece found everywhere counts for little (rarity in ask()).
 */
function piecesOf(s: string): string[] {
  const out: string[] = [];
  for (const [run] of s.normalize('NFKC').matchAll(OTHER_SCRIPT)) {
    const w = unify(run);
    if (STOP_OTHER.has(w)) continue;
    const spaced = SPACED.test(w);
    // A one-letter run means something in Chinese or Japanese ("键"); in the others it is a particle ("은", "و").
    if (w.length === 1) {
      if (!spaced) out.push(w);
      continue;
    }
    // Where words are written apart the whole word counts too, and its pieces are three letters
    // long: Arabic, Persian and Hebrew words share too many two-letter pairs to tell pages apart.
    if (spaced && w.length > 2) out.push(w);
    const k = spaced && !HANGUL.test(w) ? 3 : 2;
    for (let i = 0; i + k <= w.length; i++) out.push(w.slice(i, i + k));
    if (w.length < k) out.push(w);
  }
  return out;
}

/** The meaningful words of a text, folded so that İ, I, ı and i (and ş/s, ç/c…) are the same letter, without their endings. */
export function wordsOf(s: string): string[] {
  const latin = foldText(s)
    .split(/[^a-z0-9_]+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map(stem);
  return /[^\u0000-\u024f]/.test(s) ? [...latin, ...piecesOf(s)] : latin;
}

// Words that say little next to the others in a question ("how do I contact support": support is the subject).
const WEAK = new Set(['contact', 'reach', 'find', 'work', 'list', 'ulas', 'iletisim', 'bul', 'calis', 'liste'].map(stem));

const ALIKE_STEMS = ALIKE.map((group) => [...new Set(group.map(stem))]);
/** Other words people use for the same thing, with the group's own form of the word asked ("ekle" for "eklenir":
 * the person's "eklen" would not find "ekleme" or "ekleyin" by itself). */
const alike = (term: string): string[] => ALIKE_STEMS.find((group) => group.some((w) => sameWord(w, term, alikeMost(w))))?.filter((w) => w !== term) ?? [];

/**
 * Whether two words are forms of the same word. Turkish adds endings to a
 * word ("görev", "görevler", "görevlerimi"), English a few ("task", "tasks"):
 * one starting with the other is the same word, as long as the shorter one is
 * most of the longer one.
 */
export function sameWord(a: string, b: string, most = 0.5): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 4 && long.startsWith(short) && short.length / long.length >= most;
}
// A short word like the person's own must be most of the word it matches: "ekle" (add) stands for "yeni"
// (new), and "yeni" as a mere start would find "yenileme" (renewal) and "yeniden" (again) everywhere. Longer
// ones keep the usual rule, so "bağla" still finds "bağlantı".
const ALIKE_MOST = 0.6;
const alikeMost = (w: string) => (w.length <= 4 ? ALIKE_MOST : 0.5);

const textOf = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(amp|lt|gt|quot|#39);/g, ' ')
    .replace(/\s+/g, ' ');

/** Gets the sections ready to be asked: done once, when the docs are loaded. */
export function prepare(sections: DocSection[]): AnswerIndex {
  const words = new Map<string, Places>();
  const at = (w: string) => {
    let p = words.get(w);
    if (!p) words.set(w, (p = { head: [], title: [], text: [] }));
    return p;
  };
  const heads: string[] = [];
  sections.forEach((s, i) => {
    // A page's opening has no heading of its own: the page's title is its heading.
    const head = wordsOf(s.h || s.t);
    heads.push(head.join(' '));
    for (const w of new Set(head)) at(w).head.push(i);
    for (const w of new Set(wordsOf(s.t))) at(w).title.push(i);
    const counts = new Map<string, number>();
    for (const w of wordsOf(textOf(s.m))) counts.set(w, (counts.get(w) ?? 0) + 1);
    for (const [w, n] of counts) at(w).text.push([i, n]);
  });
  return { sections, words, heads };
}

// Where an answer is more or less likely to be what a person wants. The API reference answers
// questions that sound like a developer's; for everyone else the guides come first.
const WEIGHT: Record<string, number> = { help: 1, developers: 0.95, reference: 0.5, releases: 0.4, legal: 0.6 };
const TECHNICAL = /\b(get|post|patch|put|delete)\s+\/|\/[a-z]+(\/|\b)|\b(api|endpoint|address|adres|field|alan|json|curl|http|status code|payload|request body)\b/i;

// A glossary says what a word means; it is the answer to "what is…", and rarely to "how do I…".
const MEANING = /\b(what is|what are|what does|meaning of|define|nedir|ne demek|anlami)\b/;
const GLOSSARY = /\/glossary\b/;

const HELLO = /^(hi|hello|hey|merhaba|selam|iyi gunler|gunaydin|good (morning|afternoon|evening))\b/;
const THANKS = /^(thanks|thank you|thx|tesekkur|tesekkurler|sagol|sag ol|eyvallah)\b/;

/** Whether every word of the question, or a word like it, is in a section's heading. */
function headSays(head: string, perTerm: { forms: string[] }[]): boolean {
  if (!head) return false;
  const words = head.split(' ');
  return perTerm.every(({ forms }) => forms.some((f, k) => words.some((h) => sameWord(h, f, k === 0 ? 0.5 : alikeMost(f)))));
}

/**
 * Finds the sections that answer a question. `near` is the page the previous
 * answer came from: a follow-up question is probably about the same thing.
 */
export function ask(index: AnswerIndex, question: string, near?: string | null): Answer {
  const folded = foldText(question).trim();
  const terms = [...new Set(wordsOf(question))];
  if (!terms.length) {
    if (HELLO.test(folded)) return { kind: 'hello', found: [], confident: false };
    if (THANKS.test(folded)) return { kind: 'thanks', found: [], confident: false };
    return { kind: 'empty', found: [], confident: false };
  }
  if (terms.length <= 2 && HELLO.test(folded)) return { kind: 'hello', found: [], confident: false };
  if (terms.length <= 2 && THANKS.test(folded)) return { kind: 'thanks', found: [], confident: false };

  const n = index.sections.length;
  const vocabulary = [...index.words.keys()];
  // For each word of the question: how well each section matches it.
  const perTerm = terms.map((term) => {
    const forms = [term, ...alike(term)];
    const hits = new Float32Array(n);
    forms.forEach((form, k) => {
      const own = k === 0 ? 1 : 0.7; // the person's own word counts more than a word like it
      const inHead = new Uint8Array(n);
      const inTitle = new Uint8Array(n);
      const times = new Float32Array(n);
      for (const w of vocabulary) {
        if (!sameWord(w, form, k === 0 ? 0.5 : alikeMost(form))) continue;
        const p = index.words.get(w)!;
        for (const i of p.head) inHead[i] = 1;
        for (const i of p.title) inTitle[i] = 1;
        for (const [i, count] of p.text) times[i] += count;
      }
      for (let i = 0; i < n; i++) {
        const value = own * (inHead[i] * 3 + inTitle[i] * 2.4 + times[i] / (times[i] + 2));
        if (value > hits[i]) hits[i] = value;
      }
    });
    let sectionsWith = 0;
    for (let i = 0; i < n; i++) if (hits[i] > 0) sectionsWith++;
    // A word found in few sections says more than one found everywhere.
    const rarity = Math.log(1 + n / (1 + sectionsWith)) * (terms.length > 1 && WEAK.has(term) ? 0.35 : 1);
    return { hits, rarity, forms };
  });

  const phrase = terms.join(' ');
  const technical = TECHNICAL.test(question);
  const meaning = MEANING.test(folded);
  const found: (Found & { at: number })[] = [];
  for (let i = 0; i < n; i++) {
    let score = 0;
    let matched = 0;
    for (const t of perTerm) {
      if (t.hits[i] > 0) matched++;
      score += t.hits[i] * t.rarity;
    }
    if (!matched) continue;
    const s = index.sections[i];
    const cover = matched / terms.length;
    score *= 0.35 + 0.65 * cover;
    score *= technical && (s.s === 'reference' || s.s === 'developers') ? 1.15 : (WEIGHT[s.s] ?? 1);
    if (GLOSSARY.test(s.u) && !meaning) score *= 0.6;
    // A heading that says the whole question, in the person's words or words like them ("Yenileme ekleme"
    // for "Yenileme nasıl eklenir?"), is the place it is answered.
    if (terms.length > 1 && (index.heads[i].includes(phrase) || headSays(index.heads[i], perTerm))) score *= 1.4;
    // A heading that is about nothing but what was asked ("Salesforce") beats one that only mentions it.
    const head = index.heads[i] ? index.heads[i].split(' ') : [];
    if (head.length) score *= 1 + 0.3 * (head.filter((h) => terms.some((t) => sameWord(h, t))).length / head.length);
    if (near && s.u === near) score *= 1.25;
    // A section with nothing in it but a heading is not an answer.
    if (s.m.length < 40) score *= 0.3;
    found.push({ section: s, score: score / Math.sqrt(terms.length), at: i });
  }
  found.sort((a, b) => b.score - a.score);
  const top = found.slice(0, 5);
  const best = top[0];
  const cover = best ? perTerm.filter((t) => t.hits[best.at] > 0).length / terms.length : 0;
  // Sure of it when the best section covers the question and is clearly ahead of the best one from another page.
  const rival = top.find((f) => f.section.u !== best?.section.u);
  // And only when something solid matched: in Hebrew, Arabic and Persian a three-letter word is also a piece of
  // many longer ones ("שיר", a poem, inside "שירות", service), so three-letter matches alone are a guess.
  const solid = !!best && perTerm.some((t, j) => t.hits[best.at] > 0 && !(SPACED.test(terms[j]) && !HANGUL.test(terms[j]) && terms[j].length <= 3));
  const confident = !!best && solid && best.score >= 2.6 && cover >= 0.6 && (!rival || best.score >= rival.score * 1.2);
  return { kind: 'answer', found: top.map(({ section, score }) => ({ section, score })), confident };
}

// A question written in English: a few of the small words every English question has, and nothing outside ASCII.
const ENGLISH = /\b(how|what|where|why|when|which|who|can|could|do|does|is|are|my|the|to|i|we|you)\b/i;
/** Whether a question is in English (so a reader of another language's docs is best served by the English ones). */
export function looksEnglish(question: string): boolean {
  return /^[\x00-\x7f]*$/.test(question) && ENGLISH.test(question);
}

/**
 * Asks the reader's own docs, or, when the question is in English and the reader's docs are not, the English
 * docs, and then gives back the same sections of the reader's docs. A reader of the Japanese docs who types
 * in English otherwise matches only what is still English there (code blocks, product names). Pages are
 * translated section by section, so a section's place on its page is the same in every language; a page
 * whose sections do not line up answers with its opening.
 */
export function askAcross(local: AnswerIndex, english: AnswerIndex | null | undefined, question: string, near?: string | null): Answer {
  if (!english || english === local || !looksEnglish(question)) return ask(local, question, near);
  const lang = local.sections[0]?.u.split('/')[2];
  const a = ask(english, question, near?.replace(`/docs/${lang}/`, '/docs/en/'));
  if (a.kind !== 'answer' || !lang) return a;
  const pageOf = (idx: AnswerIndex, u: string) => idx.sections.filter((x) => x.u === u);
  const found: Found[] = [];
  for (const f of a.found) {
    const enPage = pageOf(english, f.section.u);
    const mine = pageOf(local, f.section.u.replace('/docs/en/', `/docs/${lang}/`));
    if (!mine.length) continue;
    const section = mine.length === enPage.length ? mine[enPage.indexOf(f.section)] : mine[0];
    if (section && !found.some((x) => x.section === section)) found.push({ section, score: f.score });
  }
  return found.length ? { ...a, found } : ask(local, question, near);
}

/**
 * The section's HTML with its links pointing where the docs live for this
 * reader: `/docs/` on a real address, a folder beside the page in a preview.
 */
export function withLinks(html: string, base = '/docs/', index = ''): string {
  if (base === '/docs/' && !index) return html;
  return html.replace(/href="\/docs\/([a-z]{2}(?:-[A-Z][a-z]{3})?)\/((?:[a-z0-9-]+\/)?)(#[^"]*)?"/g, (_m, lang: string, slug: string, hash?: string) => `href="${base}${lang}/${slug}${index}${hash ?? ''}"`);
}

/** The address of a section for this reader. */
export function addressOf(s: DocSection, base = '/docs/', index = ''): string {
  return `${base}${s.u.replace(/^\/docs\//, '')}${index}${s.a ? `#${s.a}` : ''}`;
}
