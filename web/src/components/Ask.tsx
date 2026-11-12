// "Ask" in the product: a question in your own words, answered from the docs.
//
// The answering is shared/src/answers.ts, the same code the docs site uses:
// the docs are cut into sections when they are built, loaded here once, and
// matched on this device. No language model, no server, no cost per question,
// and nothing typed here leaves the browser. When the answer does not help,
// support is one click away with the question already written.
import { Icon } from './icons';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { addressOf, ask, prepare, withLinks, type AnswerIndex, type DocSection, type Found } from '../../../shared/src/answers';
import type { MessageKey } from '../../../shared/src/i18n';
import { docsFile, docsHref, docsLink } from '../lib/docs';
import { useI18n } from '../lib/i18n';

type Message =
  | { id: number; by: 'you'; text: string }
  | { id: number; by: 'bot'; say: MessageKey; examples?: boolean; write?: string }
  | { id: number; by: 'bot'; answer: Found; others: Found[]; question: string }
  | { id: number; by: 'bot'; say: MessageKey; picks: Found[]; question: string };

const loaded: Partial<Record<string, Promise<AnswerIndex>>> = {};
/** The docs' sections for a language, read once. */
function load(locale: string): Promise<AnswerIndex> {
  return (loaded[locale] ??= fetch(docsFile(`${locale}/answers.json`))
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json() as Promise<DocSection[]>;
    })
    .then(prepare)
    .catch((e) => {
      delete loaded[locale];
      throw e;
    }));
}

// Where the docs live for this reader, in the form the answers' links need.
const docsBase = docsHref().replace(/index\.html$/, '');
const docsTail = docsHref().endsWith('index.html') ? 'index.html' : '';

/** One section of the docs shown as an answer; a long one starts folded. */
function Section({ found }: { found: Found }) {
  const { t } = useI18n();
  const body = useRef<HTMLDivElement>(null);
  const [folded, setFolded] = useState<boolean | null>(null);
  useEffect(() => {
    if (body.current && folded === null) setFolded(body.current.scrollHeight > 340);
  }, [folded]);
  const s = found.section;
  return (
    <article className="ask__answer">
      <h4>{s.h || s.t}</h4>
      {/* The docs' own HTML, written by us at build time. */}
      <div ref={body} className="ask__body" data-folded={folded || undefined} dangerouslySetInnerHTML={{ __html: withLinks(s.m, docsBase, docsTail) }} />
      {folded && (
        <button type="button" className="ask__more" onClick={() => setFolded(false)}>
          {t('ask.more')}
        </button>
      )}
      <p className="ask__from">
        {t('ask.from')}{' '}
        <a href={addressOf(s, docsBase, docsTail)} {...docsLink}>
          {s.t}
          {s.h ? ` › ${s.h}` : ''}
        </a>
      </p>
    </article>
  );
}

export function Ask({ onWrite }: { onWrite: (question: string) => void }) {
  const { t, locale } = useI18n();
  const [messages, setMessages] = useState<Message[]>([{ id: 0, by: 'bot', say: 'ask.hello', examples: true }]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [judged, setJudged] = useState<Set<number>>(new Set());
  const lastPage = useRef<string | null>(null);
  const nextId = useRef(1);
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  // Start reading the docs as soon as the panel opens, so the first answer is instant.
  useEffect(() => void load(locale).catch(() => undefined), [locale]);
  // The start of the newest message is what should be on screen.
  useEffect(() => {
    const last = log.current?.lastElementChild;
    if (messages.length > 1) last?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [messages]);

  const add = (...more: (Message extends infer M ? (M extends { id: number } ? Omit<M, 'id'> : never) : never)[]) =>
    setMessages((list) => [...list, ...more.map((m) => ({ ...m, id: nextId.current++ }) as Message)]);

  const show = (answer: Found, others: Found[], question: string) => {
    lastPage.current = answer.section.u;
    add({ by: 'bot', answer, others, question });
  };

  async function question(raw: string) {
    const q = raw.trim();
    if (!q || busy) return;
    setText('');
    add({ by: 'you', text: q });
    setBusy(true);
    try {
      const a = ask(await load(locale), q, lastPage.current);
      if (a.kind === 'hello') add({ by: 'bot', say: 'ask.hi' });
      else if (a.kind === 'thanks') add({ by: 'bot', say: 'ask.thanks' });
      else if (a.kind === 'empty') add({ by: 'bot', say: 'ask.empty' });
      else if (!a.found.length) add({ by: 'bot', say: 'ask.none', write: q });
      else if (a.confident) show(a.found[0], a.found, q);
      else add({ by: 'bot', say: 'ask.unsure', picks: a.found.slice(0, 4), question: q });
    } catch {
      add({ by: 'bot', say: 'ask.failed', write: q });
    } finally {
      setBusy(false);
      input.current?.focus();
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void question(text);
  };

  const pickLabel = (f: Found) => (f.section.h ? `${f.section.t} › ${f.section.h}` : f.section.t);
  const picks = (items: Found[], all: Found[], q: string) => (
    <div className="ask__chips">
      {items.map((f) => (
        <button key={`${f.section.u}#${f.section.a}`} type="button" className="ask__chip" onClick={() => show(f, all, q)}>
          {pickLabel(f)}
        </button>
      ))}
    </div>
  );
  const write = (q: string) => (
    <button type="button" className="btn btn--small ask__write" onClick={() => onWrite(q)}>
      {t('ask.write')}
    </button>
  );

  return (
    <div className="ask">
      <div className="ask__log" ref={log} role="log" aria-live="polite">
        {messages.map((m) =>
          m.by === 'you' ? (
            <div key={m.id} className="ask__msg ask__msg--you">
              <span className="sr-only">{t('ask.you')}: </span>
              {m.text}
            </div>
          ) : 'answer' in m ? (
            <div key={m.id} className="ask__msg ask__msg--bot">
              <Section found={m.answer} />
              {m.others.filter((o) => o.section !== m.answer.section).length > 0 && (
                <>
                  <p className="ask__label">{t('ask.also')}</p>
                  {picks(m.others.filter((o) => o.section !== m.answer.section).slice(0, 3), m.others, m.question)}
                </>
              )}
              {!judged.has(m.id) && (
                <div className="ask__helped">
                  <span>{t('ask.helped')}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setJudged((s) => new Set(s).add(m.id));
                      add({ by: 'bot', say: 'ask.thanks' });
                    }}
                  >
                    {t('common.yes')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setJudged((s) => new Set(s).add(m.id));
                      add({ by: 'bot', say: 'ask.sorry', picks: m.others.filter((o) => o.section !== m.answer.section).slice(0, 3), question: m.question });
                    }}
                  >
                    {t('common.no')}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div key={m.id} className="ask__msg ask__msg--bot">
              <p>{t(m.say)}</p>
              {'examples' in m && m.examples && (
                <div className="ask__chips">
                  {(['ask.example1', 'ask.example2', 'ask.example3'] as const).map((k) => (
                    <button key={k} type="button" className="ask__chip" onClick={() => void question(t(k))}>
                      {t(k)}
                    </button>
                  ))}
                </div>
              )}
              {'picks' in m && m.picks.length > 0 && picks(m.picks, m.picks, m.question)}
              {'picks' in m && write(m.question)}
              {'write' in m && m.write && write(m.write)}
            </div>
          ),
        )}
        {busy && (
          <div className="ask__msg ask__msg--bot ask__wait" role="status">
            {t('ask.loading')}
          </div>
        )}
      </div>
      <form className="ask__form" onSubmit={submit}>
        <input ref={input} className="input" value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder={t('ask.placeholder')} aria-label={t('ask.tab')} autoFocus />
        <button className="btn btn--primary" type="submit" disabled={busy || !text.trim()}>
          <Icon name="send" size={16} />
          {t('ask.send')}
        </button>
      </form>
      <p className="field__hint ask__private">{t('ask.private')}</p>
    </div>
  );
}
