// "Ask" on the docs site: a small chat that answers from these pages.
//
// The answering itself is shared/src/answers.ts (the same code the app uses);
// this file is only the panel: a button, a list of messages and an input. It
// is bundled into assets/ask.js when the docs are built. No server is asked
// and nothing typed here leaves the page.
import { addressOf, ask, prepare, withLinks, type AnswerIndex, type DocSection, type Found } from '../../../shared/src/answers';

interface Cfg {
  lang: 'en' | 'tr';
  base?: string;
  index?: string;
}
const cfg = (window as unknown as { APP_DOCS: Cfg }).APP_DOCS;
const base = cfg.base || '/docs/';
const tail = cfg.index || '';

const WORDS = {
  en: {
    open: 'Ask',
    title: 'Ask Curahold',
    close: 'Close',
    hello: 'Ask how to do something in Curahold, in your own words. I answer from these docs and show where each answer comes from.',
    hi: 'Hello! What would you like to do in Curahold?',
    thanks: 'Glad that helped. Ask another whenever you like.',
    empty: 'Write a few words about what you want to do.',
    placeholder: 'How do I import my customers?',
    send: 'Ask',
    from: 'From',
    more: 'Show all of it',
    also: 'Related',
    unsure: 'I am not sure this is it, but these are the closest parts of the docs:',
    none: 'I could not find that in the docs. Try other words, or get in touch with support.',
    support: 'Contact support',
    helped: 'Did this answer it?',
    yes: 'Yes',
    no: 'No',
    sorry: 'Try asking it another way, or pick one of these:',
    loading: 'Reading the docs…',
    failed: 'The docs could not be loaded. Check your connection and try again.',
    you: 'You',
    examples: ['How do I connect Salesforce?', 'How do I make an API key?', 'What can each role see?'],
  },
  tr: {
    open: 'Sor',
    title: 'Curahold’a sor',
    close: 'Kapat',
    hello: 'Curahold’da bir şeyin nasıl yapıldığını kendi cümlelerinle sor. Cevabı bu belgelerden veririm ve nereden geldiğini gösteririm.',
    hi: 'Merhaba! Curahold’da ne yapmak istiyorsun?',
    thanks: 'İşine yaradıysa ne güzel. İstediğin zaman yine sor.',
    empty: 'Ne yapmak istediğini birkaç kelimeyle yaz.',
    placeholder: 'Müşterilerimi nasıl içe aktarırım?',
    send: 'Sor',
    from: 'Kaynak',
    more: 'Tamamını göster',
    also: 'İlgili',
    unsure: 'Tam bu olduğundan emin değilim; belgelerde en yakın yerler şunlar:',
    none: 'Bunu belgelerde bulamadım. Başka kelimelerle dene ya da destekle iletişime geç.',
    support: 'Desteğe yaz',
    helped: 'Sorunu cevapladı mı?',
    yes: 'Evet',
    no: 'Hayır',
    sorry: 'Başka türlü sormayı dene ya da şunlardan birini seç:',
    loading: 'Belgeler okunuyor…',
    failed: 'Belgeler yüklenemedi. Bağlantını kontrol edip yeniden dene.',
    you: 'Sen',
    examples: ['Salesforce’u nasıl bağlarım?', 'API anahtarı nasıl oluşturulur?', 'Hangi rol neyi görür?'],
  },
} as const;
const w = WORDS[cfg.lang === 'tr' ? 'tr' : 'en'];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined) n.innerHTML = html;
  return n;
};

let index: Promise<AnswerIndex> | null = null;
const load = () =>
  (index ??= fetch(`${base}${cfg.lang}/answers.json`)
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json() as Promise<DocSection[]>;
    })
    .then(prepare)
    .catch((e) => {
      index = null;
      throw e;
    }));

// ------------------------------------------------------------------ the panel
const root = el('div', 'ask');
root.innerHTML = `
<button type="button" class="ask__open" aria-expanded="false" aria-controls="ask-panel">
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-4.6 3.7a.6.6 0 0 1-1-.5V16A2.5 2.5 0 0 1 4 13.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8.5 8h7M8.5 11h4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
  <span>${esc(w.open)}</span>
</button>
<section id="ask-panel" class="ask__panel" role="dialog" aria-label="${esc(w.title)}" hidden>
  <header class="ask__head"><strong>${esc(w.title)}</strong><button type="button" class="ask__close" aria-label="${esc(w.close)}">×</button></header>
  <div class="ask__log" role="log" aria-live="polite"></div>
  <form class="ask__form">
    <input class="ask__input" type="text" autocomplete="off" maxlength="300" placeholder="${esc(w.placeholder)}" aria-label="${esc(w.title)}">
    <button class="ask__send" type="submit">${esc(w.send)}</button>
  </form>
</section>`;
document.body.appendChild(root);

const openBtn = root.querySelector<HTMLButtonElement>('.ask__open')!;
const panel = root.querySelector<HTMLElement>('.ask__panel')!;
const log = root.querySelector<HTMLElement>('.ask__log')!;
const form = root.querySelector<HTMLFormElement>('.ask__form')!;
const input = root.querySelector<HTMLInputElement>('.ask__input')!;

let greeted = false;
let lastPage: string | null = null;

function show(on: boolean) {
  panel.hidden = !on;
  openBtn.setAttribute('aria-expanded', String(on));
  root.classList.toggle('ask--open', on);
  if (on) {
    if (!greeted) {
      greeted = true;
      bot(`<p>${esc(w.hello)}</p>`, chips(w.examples as readonly string[]));
    }
    void load().catch(() => undefined);
    setTimeout(() => input.focus(), 30);
  } else openBtn.focus();
}

function chips(items: readonly string[], onPick: (text: string) => void = question): HTMLElement {
  const row = el('div', 'ask__chips');
  for (const text of items) {
    const b = el('button', 'ask__chip');
    b.type = 'button';
    b.textContent = text;
    b.addEventListener('click', () => onPick(text));
    row.appendChild(b);
  }
  return row;
}

function bubble(cls: string, html: string, ...extra: (HTMLElement | null)[]) {
  const b = el('div', `ask__msg ${cls}`, html);
  for (const x of extra) if (x) b.appendChild(x);
  log.appendChild(b);
  // The start of a new answer is what should be on screen, not its end.
  b.scrollIntoView({ block: 'start', behavior: 'smooth' });
  return b;
}
const bot = (html: string, ...extra: (HTMLElement | null)[]) => bubble('ask__msg--bot', html, ...extra);

/** One section of the docs as an answer: its heading, its content, where it is from. */
function sectionCard(f: Found): HTMLElement {
  const s = f.section;
  const card = el('article', 'ask__answer');
  const heading = s.h || s.t;
  card.innerHTML = `<h4>${esc(heading)}</h4><div class="ask__body">${withLinks(s.m, base, tail)}</div>
    <p class="ask__from">${esc(w.from)}: <a href="${esc(addressOf(s, base, tail))}">${esc(s.t)}${s.h ? ` › ${esc(s.h)}` : ''}</a></p>`;
  const body = card.querySelector<HTMLElement>('.ask__body')!;
  // A long section starts folded: the first screenful answers most questions.
  requestAnimationFrame(() => {
    if (body.scrollHeight > 340) {
      body.classList.add('ask__body--folded');
      const more = el('button', 'ask__more');
      more.type = 'button';
      more.textContent = w.more;
      more.addEventListener('click', () => {
        body.classList.remove('ask__body--folded');
        more.remove();
      });
      body.after(more);
    }
  });
  return card;
}

function showSection(f: Found, others: Found[]) {
  lastPage = f.section.u;
  const related = others.filter((o) => o.section !== f.section).slice(0, 3);
  const box = bot('', sectionCard(f));
  if (related.length) {
    const label = el('p', 'ask__label');
    label.textContent = w.also;
    box.appendChild(label);
    box.appendChild(pickList(related, others));
  }
  box.appendChild(helped(others));
}

/** Other parts of the docs to open instead, as buttons. */
function pickList(items: Found[], all: Found[]): HTMLElement {
  const row = el('div', 'ask__chips');
  for (const f of items) {
    const b = el('button', 'ask__chip');
    b.type = 'button';
    b.textContent = f.section.h ? `${f.section.t} › ${f.section.h}` : f.section.t;
    b.addEventListener('click', () => showSection(f, all));
    row.appendChild(b);
  }
  return row;
}

function helped(others: Found[]): HTMLElement {
  const row = el('div', 'ask__helped');
  row.innerHTML = `<span>${esc(w.helped)}</span>`;
  const yes = el('button');
  yes.type = 'button';
  yes.textContent = w.yes;
  const no = el('button');
  no.type = 'button';
  no.textContent = w.no;
  yes.addEventListener('click', () => {
    row.remove();
    bot(`<p>${esc(w.thanks)}</p>`);
  });
  no.addEventListener('click', () => {
    row.remove();
    const rest = others.slice(1, 4);
    bot(`<p>${esc(w.sorry)}</p>`, rest.length ? pickList(rest, others) : null, supportLink());
  });
  row.append(yes, no);
  return row;
}

function supportLink(): HTMLElement {
  const p = el('p', 'ask__support');
  p.innerHTML = `<a href="${base}${cfg.lang}/getting-help/${tail}">${esc(w.support)}</a>`;
  return p;
}

async function question(text: string) {
  const q = text.trim();
  if (!q) return;
  bubble('ask__msg--you', `<span class="ask__who">${esc(w.you)}</span><p>${esc(q)}</p>`);
  const wait = bot(`<p class="ask__wait">${esc(w.loading)}</p>`);
  try {
    const answer = ask(await load(), q, lastPage);
    wait.remove();
    if (answer.kind === 'hello') return void bot(`<p>${esc(w.hi)}</p>`);
    if (answer.kind === 'thanks') return void bot(`<p>${esc(w.thanks)}</p>`);
    if (answer.kind === 'empty') return void bot(`<p>${esc(w.empty)}</p>`);
    if (!answer.found.length) return void bot(`<p>${esc(w.none)}</p>`, supportLink());
    if (answer.confident) return showSection(answer.found[0], answer.found);
    bot(`<p>${esc(w.unsure)}</p>`, pickList(answer.found.slice(0, 4), answer.found), supportLink());
  } catch {
    wait.remove();
    bot(`<p>${esc(w.failed)}</p>`);
  }
}

openBtn.addEventListener('click', () => show(panel.hidden));
root.querySelector('.ask__close')!.addEventListener('click', () => show(false));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !panel.hidden) show(false);
});
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = input.value;
  input.value = '';
  void question(text);
});

// Anything on the page can start a question: <button data-ask="How do I…">, or the home page's big box.
document.addEventListener('click', (e) => {
  const from = (e.target as Element | null)?.closest?.('[data-ask]');
  if (!from) return;
  e.preventDefault();
  show(true);
  const text = from.getAttribute('data-ask');
  if (text) void question(text);
});
document.addEventListener('submit', (e) => {
  const f = e.target as HTMLFormElement;
  if (!f.matches?.('[data-ask-form]')) return;
  e.preventDefault();
  const field = f.querySelector<HTMLInputElement>('input');
  const text = field?.value ?? '';
  if (field) field.value = '';
  show(true);
  if (text.trim()) void question(text);
});
