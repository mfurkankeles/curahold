// "Ask" in the product: a question in your own words, answered from the docs.
//
// The answering is shared/src/answers.ts, the same code the docs site uses:
// the docs are cut into sections when they are built, loaded here once, and
// matched on this device. No language model, no server, no cost per question,
// and nothing typed here leaves the browser. When the answer does not help,
// support is one click away with the question already written.
//
// Where a model is available (the demo, where Claude answers on the viewer's
// own account), the same chat hands the question to it instead: it reads the
// docs and the workspace through tools and writes the answer (lib/assistant).
// Whenever the model cannot answer, the docs answer as before.
import { Icon } from './icons';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { addressOf, ask, prepare, withLinks, type AnswerIndex, type DocSection, type Found } from '../../../shared/src/answers';
import { reply, type Sampler, type Trace, type Turn } from '../../../shared/src/assistant';
import type { MessageKey } from '../../../shared/src/i18n';
import { post } from '../lib/api';
import { depsFor, findSampler, Lite } from '../lib/assistant';
import { docsFile, docsHref, docsLink } from '../lib/docs';
import { useI18n } from '../lib/i18n';
import { useStore } from '../lib/store';

type Message =
  | { id: number; by: 'you'; text: string }
  | { id: number; by: 'bot'; say: MessageKey; examples?: boolean; write?: string }
  | { id: number; by: 'bot'; answer: Found; others: Found[]; question: string }
  | { id: number; by: 'bot'; say: MessageKey; picks: Found[]; question: string }
  /** Written by the model: grows while it writes, then carries what it read. */
  | { id: number; by: 'bot'; ai: string; done: boolean; trace?: Trace; note?: MessageKey; created?: boolean; question: string };

/** The model is gone for this view (declined, switched off): stop asking it. */
const GONE = new Set(['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed', 'session_expired']);

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

export function Ask({ onWrite, onEngine }: { onWrite: (question: string) => void; onEngine?: (model: boolean) => void }) {
  const { t, locale, words } = useI18n();
  const { me, boards, canWrite } = useStore();
  const [messages, setMessages] = useState<Message[]>([{ id: 0, by: 'bot', say: 'ask.hello', examples: true }]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  // undefined: still finding out whether a model is here; null: there is none.
  const [sampler, setSampler] = useState<Sampler | null | undefined>(undefined);
  const [deep, setDeep] = useState(false);
  const turns = useRef<Turn[]>([]);
  const running = useRef<AbortController | null>(null);
  const deps = useMemo(() => depsFor(me, locale, words, me.user.roleKey), [me, locale, words]);
  useEffect(() => {
    let live = true;
    void findSampler().then((s) => {
      if (!live) return;
      // A function kept in state has to be wrapped, or React calls it as an updater.
      setSampler(() => s);
      onEngine?.(!!s);
    });
    return () => {
      live = false;
    };
  }, [onEngine]);
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

  const change = (id: number, more: Partial<Extract<Message, { ai: string }>>) => setMessages((list) => list.map((m) => (m.id === id && 'ai' in m ? { ...m, ...more } : m)));

  /** The model's answer, written into one message as it arrives. Returns false when the docs should answer instead. */
  async function askModel(q: string, model: Sampler): Promise<boolean> {
    const id = nextId.current++;
    setMessages((list) => [...list, { id, by: 'bot', ai: '', done: false, question: q }]);
    turns.current.push({ role: 'user', content: q });
    const ctl = new AbortController();
    running.current = ctl;
    let shown = '';
    try {
      const r = await reply(model, deps, turns.current, {
        signal: ctl.signal,
        deep,
        onText: (text) => {
          shown = text;
          change(id, { ai: text });
        },
      });
      turns.current.push({ role: 'assistant', content: r.text });
      change(id, { ai: r.text, done: true, trace: r.trace, note: r.truncated ? 'ask.ai.cut' : undefined });
      return true;
    } catch (e) {
      const code = (e as { code?: string })?.code ?? 'upstream_error';
      const kept = (e as { text?: string })?.text ?? (code === 'cancelled' ? shown : '');
      if (code === 'cancelled') {
        // Stopped by the person: what was written stays, marked as stopped.
        if (kept) turns.current.push({ role: 'assistant', content: kept });
        else turns.current.pop();
        change(id, { ai: kept, done: true, note: 'ask.ai.stopped' });
        return true;
      }
      turns.current.pop();
      setMessages((list) => list.filter((m) => m.id !== id));
      if (GONE.has(code)) {
        setSampler(null);
        onEngine?.(false);
        add({ by: 'bot', say: 'ask.ai.off' });
      } else add({ by: 'bot', say: code === 'rate_limited' ? 'ask.ai.limit' : 'ask.ai.failed' });
      return false;
    } finally {
      running.current = null;
    }
  }

  async function question(raw: string) {
    const q = raw.trim();
    if (!q || busy) return;
    setText('');
    add({ by: 'you', text: q });
    setBusy(true);
    try {
      // A moment for the model to be found, if the question came before that was known.
      const model = sampler === undefined ? await Promise.race([findSampler(), new Promise<null>((r) => setTimeout(() => r(null), 3000))]) : sampler;
      if (model && (await askModel(q, model))) return;
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
      // On a phone, focusing the field again would bring the keyboard up over the answer.
      if (!window.matchMedia?.('(pointer: coarse)').matches) input.current?.focus();
    }
  }

  /** The task the model prepared, made real only when the person presses the button. */
  async function createTask(id: number, trace: Trace) {
    const p = trace.proposal;
    const boardId = me.user.prefs?.defaultBoardId ?? boards[0]?.id;
    if (!p || !boardId) return;
    try {
      await post('/tasks', { boardId, title: p.title, ...(p.customer ? { accountId: p.customer.id } : {}), ...(p.dueDate ? { dueDate: p.dueDate } : {}), assigneeIds: [me.user.id] });
      change(id, { created: true });
    } catch {
      add({ by: 'bot', say: 'ask.failed' });
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
          ) : 'ai' in m ? (
            <div key={m.id} className="ask__msg ask__msg--bot ask__ai" data-live={!m.done || undefined}>
              {m.ai ? (
                <div className="ask__body">
                  <Lite text={m.ai} />
                </div>
              ) : (
                <p className="ask__wait" role="status">
                  {t('ask.ai.thinking')}
                </p>
              )}
              {m.note && <p className="ask__from">{t(m.note)}</p>}
              {m.done && m.trace?.proposal && (
                <div className="ask__proposal">
                  <span className="ask__label">{t('ask.ai.task')}</span>
                  <strong>{m.trace.proposal.title}</strong>
                  <span className="muted">
                    {[m.trace.proposal.customer ? t('ask.ai.taskFor', { name: m.trace.proposal.customer.name }) : '', m.trace.proposal.dueDate ? t('ask.ai.taskDue', { date: m.trace.proposal.dueDate }) : ''].filter(Boolean).join(' · ')}
                  </span>
                  {m.created ? (
                    <span className="ask__done">
                      <Icon name="checkCircle" size={16} />
                      {t('ask.ai.created')}
                    </span>
                  ) : canWrite ? (
                    <button type="button" className="btn btn--primary btn--small" onClick={() => void createTask(m.id, m.trace!)}>
                      <Icon name="plus" size={14} />
                      {t('ask.ai.create')}
                    </button>
                  ) : (
                    <span className="muted">{t('ask.ai.readonly')}</span>
                  )}
                </div>
              )}
              {m.done && m.trace?.opened && <p className="ask__from">{t('ask.ai.opened')}</p>}
              {m.done && m.trace && m.trace.docs.length > 0 && (
                <p className="ask__from">
                  {t('ask.ai.sourcesDocs')}{' '}
                  {m.trace.docs.map((d, i) => (
                    <span key={d.url}>
                      {i > 0 && ', '}
                      <a href={d.url} {...docsLink}>
                        {d.section ? `${d.title} › ${d.section}` : d.title}
                      </a>
                    </span>
                  ))}
                </p>
              )}
              {m.done && m.trace && m.trace.data.length > 0 && <p className="ask__from">{t('ask.ai.sourcesData', { what: m.trace.data.join(', ') })}</p>}
              {m.done && m.ai && !m.note && !judged.has(m.id) && (
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
                      add({ by: 'bot', say: 'ask.sorry', picks: [], question: m.question });
                    }}
                  >
                    {t('common.no')}
                  </button>
                </div>
              )}
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
              <p>{t(sampler && m.say === 'ask.hello' ? 'ask.ai.hello' : m.say)}</p>
              {'examples' in m && m.examples && (
                <div className="ask__chips">
                  {(sampler ? (['ask.ai.example1', 'ask.ai.example2', 'ask.ai.example3', 'ask.ai.example4'] as const) : (['ask.example1', 'ask.example2', 'ask.example3'] as const)).map((k) => (
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
        {busy && !messages.some((m) => 'ai' in m && !m.done) && (
          <div className="ask__msg ask__msg--bot ask__wait" role="status">
            {t('ask.loading')}
          </div>
        )}
      </div>
      {sampler && (
        <label className="ask__mode" title={t('ask.ai.deepHint')}>
          <input type="checkbox" checked={deep} onChange={(e) => setDeep(e.target.checked)} />
          <span>{t('ask.ai.deep')}</span>
        </label>
      )}
      <form className="ask__form" onSubmit={submit}>
        <input ref={input} className="input" value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder={t('ask.placeholder')} aria-label={t('ask.tab')} />
        {busy && sampler ? (
          <button className="btn" type="button" onClick={() => running.current?.abort()}>
            <Icon name="close" size={16} />
            {t('ask.ai.stop')}
          </button>
        ) : (
          <button className="btn btn--primary" type="submit" disabled={busy || !text.trim()}>
            <Icon name="send" size={16} />
            {t('ask.send')}
          </button>
        )}
      </form>
      <p className="field__hint ask__private">{t(sampler ? 'ask.ai.private' : 'ask.private')}</p>
    </div>
  );
}
