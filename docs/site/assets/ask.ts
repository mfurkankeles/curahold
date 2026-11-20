// "Ask" on the docs site: a small chat that answers from these pages.
//
// Where the docs are served by Curahold itself, the question goes to the one
// assistant core every chatbot shares (POST /api/assist/public, docs only, no
// workspace): it writes the answer from these pages and names the section,
// asks one short question back when a question means several things, and says
// so when the docs do not cover it. When that server has no model (or cannot
// be reached, as in the static demo), the answering is shared/src/answers.ts
// on this page, as before — and a question that means several things still
// gets one question back (shared/src/assist.ts). This file is only the panel.
import { addressOf, ask, prepare, withLinks, type AnswerIndex, type DocSection, type Found } from '../../../shared/src/answers';
import { ambiguityOf, intentOf, type AssistReply, type AssistTurn } from '../../../shared/src/assist';

/** The panel's words, in the page's language: the docs build puts them in the page (docs.ask.* in the dictionaries). */
interface Words {
  open: string;
  title: string;
  close: string;
  hello: string;
  hi: string;
  thanks: string;
  empty: string;
  placeholder: string;
  from: string;
  more: string;
  also: string;
  unsure: string;
  none: string;
  support: string;
  helped: string;
  yes: string;
  no: string;
  sorry: string;
  loading: string;
  failed: string;
  you: string;
  /** Under an answer the model wrote. */
  ai: string;
  examples: string[];
  /** The question back and its choices when a question means several things (assist.clarify.*, assist.opt.*), for when no server answers. */
  clarify: Record<string, string>;
  options: Record<string, string>;
  /** The AI assistant's consent notice and its version (assistConsent.*, shared/src/assistConsent.ts). */
  consent?: Record<string, string> & { version: string };
}
interface Cfg {
  lang: string;
  base?: string;
  index?: string;
  words: Words;
}
// The settings are a JSON block in the page (not an inline script, which the content policy would stop).
const cfg = JSON.parse(document.getElementById('docs-cfg')?.textContent ?? 'null') as Cfg;
const base = cfg.base || '/docs/';
const tail = cfg.index || '';
const w = { ...cfg.words, send: cfg.words.open };

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
    consentNotice();
    consentFoot();
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

// The server's assistant: only where Curahold serves these pages (an absolute base), and only while it has a model.
let serverAnswers = base.startsWith('/') && location.protocol.startsWith('http');

// ------------------------------------------------------------------ consent
// KVKK/GDPR: nothing goes to the server before a "yes" to the current notice.
// The answer is kept here under a random id (curahold_ai_consent, listed on the
// Cookies page) and recorded by the server under the same id; a new notice
// version asks again. Until then, and after a "no", this page answers.
const CONSENT_KEY = 'curahold_ai_consent';
const cw = cfg.words.consent;
type Kept = { id: string; version: string; granted: boolean };
function kept(): Kept | null {
  try {
    const k = JSON.parse(localStorage.getItem(CONSENT_KEY) ?? 'null') as Kept | null;
    return k && cw && k.version === cw.version ? k : null;
  } catch {
    return null;
  }
}
let notNow = false;
const consented = () => kept()?.granted === true;
async function decide(granted: boolean) {
  const id = kept()?.id ?? JSON.parse(localStorage.getItem(CONSENT_KEY) ?? 'null')?.id ?? crypto.randomUUID();
  try {
    const res = await fetch('/api/assist/public/consent', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-curahold-ask': '1' },
      body: JSON.stringify({ consentId: id, granted, lang: cfg.lang, surface: 'docs' }),
    });
    if (!res.ok) throw new Error(String(res.status));
    localStorage.setItem(CONSENT_KEY, JSON.stringify({ id, version: cw!.version, granted }));
  } catch {
    // Not recorded: nothing is sent, this page answers.
    notNow = true;
  }
  consentFoot();
}
/** The notice in the chat, once per page load while there is no answer for this version. */
function consentNotice() {
  if (!cw || !serverAnswers || kept() || notNow || log.querySelector('.ask__consent')) return;
  const box = el('section', 'ask__consent');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', cw.title);
  box.tabIndex = -1;
  box.innerHTML = `<div class="ask__consent-head"><strong>${esc(cw.title)}</strong><button type="button" class="ask__consent-btn" data-c="later" aria-label="${esc(cw.close)}"><span aria-hidden="true">×</span> ${esc(cw.close)}</button></div>
<ul>${['what', 'why', 'keep', 'withdraw'].map((k) => `<li>${esc(cw[k] ?? '')}</li>`).join('')}</ul>
<p><a href="${base}${cfg.lang}/legal-privacy/${tail}" target="_blank" rel="noreferrer">${esc(cw.privacy)}</a></p>
<div class="ask__consent-actions"><button type="button" class="ask__consent-btn" data-c="no"><span aria-hidden="true">✕</span> ${esc(cw.decline)}</button><button type="button" class="ask__consent-btn" data-c="yes"><span aria-hidden="true">✓</span> ${esc(cw.accept)}</button></div>`;
  const done = (fn: () => void) => () => {
    box.remove();
    fn();
  };
  box.querySelector('[data-c="later"]')!.addEventListener('click', done(() => (notNow = true)));
  box.querySelector('[data-c="no"]')!.addEventListener('click', done(() => void decide(false).then(() => bot(`<p>${esc(cw.declined)}</p>`))));
  box.querySelector('[data-c="yes"]')!.addEventListener('click', done(() => void decide(true)));
  box.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    done(() => (notNow = true))();
  });
  log.prepend(box);
  box.focus();
}
/** "Withdraw consent" under the chat while a "yes" is on record. */
function consentFoot() {
  root.querySelector('.ask__consent-foot')?.remove();
  if (!cw || !consented()) return;
  const p = el('p', 'ask__consent-foot');
  const b = el('button', 'ask__consent-btn', esc(cw.withdrawAction));
  b.type = 'button';
  b.addEventListener('click', () => void decide(false).then(() => bot(`<p>${esc(cw.withdrawn)}</p>`)));
  p.appendChild(b);
  panel.appendChild(p);
}
const turns: AssistTurn[] = [];

/** The model's text as the chat shows it: paragraphs, "- " lists and **bold**; everything escaped, nothing a link. */
function lite(text: string): string {
  const bold = (line: string) => esc(line).replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  let out = '';
  let list: string[] = [];
  const flush = () => {
    if (list.length) out += `<ul>${list.map((li) => `<li>${bold(li)}</li>`).join('')}</ul>`;
    list = [];
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const item = /^(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line);
    if (item) list.push(item[1]);
    else {
      flush();
      if (line) out += `<p dir="auto">${bold(line)}</p>`;
    }
  }
  flush();
  return out;
}

function optionChips(options: { id: string; label: string }[]): HTMLElement {
  const row = el('div', 'ask__chips');
  for (const o of options) {
    const b = el('button', 'ask__chip');
    b.type = 'button';
    b.textContent = o.label;
    b.addEventListener('click', () => void question(o.label, intentOf(o.id) ? o.id : undefined));
    row.appendChild(b);
  }
  return row;
}

/** Asks the server. Returns false when this page should answer instead. */
async function askServer(q: string, intent?: string): Promise<boolean> {
  if (!serverAnswers || !consented()) return false;
  try {
    const res = await fetch('/api/assist/public', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-curahold-ask': '1' },
      body: JSON.stringify({ question: q, history: turns.slice(-6), lang: cfg.lang, surface: 'docs', consentId: kept()!.id, ...(intent ? { intent } : {}) }),
    });
    // The server has no "yes" under this id (a cleared record, another server): ask again, answer here meanwhile.
    if (res.status === 403) {
      localStorage.removeItem(CONSENT_KEY);
      consentFoot();
      consentNotice();
      return false;
    }
    if (!res.ok) throw new Error(String(res.status));
    const { reply } = (await res.json()) as { reply: AssistReply };
    // No model there now: the same search runs here, where its answer reads better.
    if (reply.engine === 'docs') {
      if (reply.fallback === 'no_key' || reply.fallback === 'off') serverAnswers = false;
      return false;
    }
    turns.push({ role: 'user', content: q }, { role: 'assistant', content: reply.text });
    const extra: (HTMLElement | null)[] = [];
    if (reply.kind === 'clarify' && reply.options?.length) extra.push(optionChips(reply.options));
    if (reply.citations.length) {
      const from = el('p', 'ask__from');
      from.innerHTML = `${esc(w.from)}: ${reply.citations
        .map((c) => `<a href="${base}${c.url.replace(/^\/docs\//, '')}${tail}">${esc(c.section ? `${c.title} › ${c.section}` : c.title)}</a>`)
        .join(', ')}`;
      extra.push(from);
    }
    if (reply.kind === 'answer') extra.push(el('p', 'ask__from', esc(w.ai)));
    if (reply.kind === 'not_covered') extra.push(supportLink());
    bot(lite(reply.text), ...extra);
    return true;
  } catch {
    // Not served by Curahold here (a static copy): this page answers from now on.
    serverAnswers = false;
    return false;
  }
}

async function question(text: string, intent?: string) {
  const q = text.trim();
  if (!q) return;
  bubble('ask__msg--you', `<span class="ask__who">${esc(w.you)}</span><p>${esc(q)}</p>`);
  const wait = bot(`<p class="ask__wait">${esc(w.loading)}</p>`);
  try {
    if (await askServer(q, intent)) {
      wait.remove();
      return;
    }
    // A question that means several things: one question back, with the choices.
    const unclear = intent ? null : ambiguityOf(q);
    if (unclear) {
      wait.remove();
      return void bot(`<p>${esc(w.clarify[unclear.id] ?? '')}</p>`, optionChips(unclear.options.map((o) => ({ id: o.id, label: w.options[o.id] ?? o.id }))));
    }
    const answer = ask(await load(), q, lastPage);
    wait.remove();
    // A tapped choice: its own pages first.
    const pages = intentOf(intent)?.option.pages;
    const mine = pages ? answer.found.filter((f) => pages.some((p) => f.section.u.includes(`/${p}/`))) : [];
    if (mine.length) return showSection(mine[0], mine);
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
