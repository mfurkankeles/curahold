// "Ask" in the product: a question in your own words, answered from the docs.
//
// The answering is shared/src/answers.ts, the same code the docs site uses:
// the docs are cut into sections when they are built, loaded here once, and
// matched on this device. No language model, no server, no cost per question,
// and nothing typed here leaves the browser. When the answer does not help,
// support is one click away with the question already written.
//
// Where the company's server has a model (api/src/assistant, GET /assist/status),
// the question goes there instead: the one assistant core every chatbot shares
// writes the answer from the docs and from what this person may see, asks one
// short question back when the question means several things, and says so when
// the docs do not cover it. In the demo, Claude answers on the viewer's own
// account (lib/assistant). Whenever no model can answer, the docs answer as
// before, on this device — still asking back on a question that means several things.
import { Icon } from './icons';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { addressOf, ask, prepare, withLinks, type AnswerIndex, type DocSection, type Found } from '../../../shared/src/answers';
import { ambiguityOf, intentOf, type AssistReply, type AssistTurn } from '../../../shared/src/assist';
import { reply, type Sampler, type Trace, type Turn } from '../../../shared/src/assistant';
import { helpLanguageOf, type MessageKey } from '../../../shared/src/i18n';
import { get, post } from '../lib/api';
import { depsFor, findSampler, Lite } from '../lib/assistant';
import { docsFile, docsHref, docsLink } from '../lib/docs';
import { navigate } from '../lib/router';
import { useI18n } from '../lib/i18n';
import { useStore } from '../lib/store';

type Message =
  | { id: number; by: 'you'; text: string }
  | { id: number; by: 'bot'; say: MessageKey; examples?: boolean; write?: string }
  | { id: number; by: 'bot'; answer: Found; others: Found[]; question: string }
  | { id: number; by: 'bot'; say: MessageKey; picks: Found[]; question: string }
  /** From the assistant core on the server (or its free rules, run here): an answer, one question back, a polite no, or "the docs do not say". */
  | { id: number; by: 'bot'; srv: AssistReply; question: string; created?: boolean }
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

/** Whether the server answers with a model, asked once per page load. */
let serverAnswers: Promise<boolean> | null = null;
const askServer = () => (serverAnswers ??= get<{ available: boolean }>('/assist/status').then((r) => !!r.available, () => false));

export function Ask({ onWrite, onEngine, mode = 'help' }: { onWrite: (question: string) => void; onEngine?: (model: boolean) => void; mode?: 'help' | 'onboarding' }) {
  const { t, locale, words } = useI18n();
  const { me, boards, canWrite } = useStore();
  const [messages, setMessages] = useState<Message[]>([{ id: 0, by: 'bot', say: 'ask.hello', examples: true }]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  // undefined: still finding out whether a model is here; null: there is none.
  const [sampler, setSampler] = useState<Sampler | null | undefined>(undefined);
  const [deep, setDeep] = useState(false);
  // undefined: still finding out; true: the server's assistant answers.
  const [server, setServer] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void askServer().then((on) => live && setServer(on));
    return () => {
      live = false;
    };
  }, []);
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

  const changeSrv = (id: number, more: Partial<Extract<Message, { srv: AssistReply }>>) => setMessages((list) => list.map((m) => (m.id === id && 'srv' in m ? { ...m, ...more } : m)));
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

  /** The server's assistant. Returns false when the docs on this device should answer instead. */
  async function askCore(q: string, intent?: string): Promise<boolean> {
    const history: AssistTurn[] = turns.current.slice(-6);
    const { reply: r } = await post<{ reply: AssistReply }>('/assist', { question: q, history, ...(intentOf(intent) ? { intent } : {}), mode, page: window.location.pathname.slice(0, 200) });
    // The docs search answered on the server (no model now): the same search here shows it better.
    if (r.engine === 'docs') {
      if (r.fallback === 'cap' || r.fallback === 'rate' || r.fallback === 'error') add({ by: 'bot', say: r.fallback === 'cap' ? 'assist.fallback.cap' : 'assist.fallback.busy' });
      return false;
    }
    turns.current.push({ role: 'user', content: q }, { role: 'assistant', content: r.text });
    add({ by: 'bot', srv: r, question: q });
    if (r.opened) navigate(r.opened);
    return true;
  }

  /** On this device: a question that means several things gets one question back, like the server's. */
  function clarifyHere(q: string): boolean {
    const a = ambiguityOf(q);
    if (!a) return false;
    add({
      by: 'bot',
      question: q,
      srv: { kind: 'clarify', text: t(a.question), options: a.options.map((o) => ({ id: o.id, label: t(o.label) })), citations: [], data: [], opened: null, proposal: null, lang: locale, engine: 'rules' },
    });
    return true;
  }

  async function question(raw: string, intent?: string) {
    const q = raw.trim();
    if (!q || busy) return;
    setText('');
    add({ by: 'you', text: q });
    setBusy(true);
    try {
      // A moment for the model to be found, if the question came before that was known.
      const model = sampler === undefined ? await Promise.race([findSampler(), new Promise<null>((r) => setTimeout(() => r(null), 3000))]) : sampler;
      if (model && (await askModel(q, model))) return;
      if ((server ?? (await askServer())) && (await askCore(q, intent).catch(() => false))) return;
      if (!intent && clarifyHere(q)) return;
      // A tapped choice: its own pages answer first.
      const pages = intentOf(intent)?.option.pages;
      const a = ask(await load(locale), q, lastPage.current);
      if (pages) {
        const mine = a.found.filter((f) => pages.some((p) => f.section.u.includes(`/${p}/`)));
        if (mine.length) {
          show(mine[0], mine, q);
          return;
        }
      }
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
  async function createTask(id: number, trace: Pick<Trace, 'proposal'>, done: (id: number) => void = (i) => change(i, { created: true })) {
    const p = trace.proposal;
    const boardId = me.user.prefs?.defaultBoardId ?? boards[0]?.id;
    if (!p || !boardId) return;
    try {
      await post('/tasks', { boardId, title: p.title, ...(p.customer ? { accountId: p.customer.id } : {}), ...(p.dueDate ? { dueDate: p.dueDate } : {}), assigneeIds: [me.user.id] });
      done(id);
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
          ) : 'srv' in m ? (
            <div key={m.id} className="ask__msg ask__msg--bot ask__ai" data-kind={m.srv.kind}>
              <div className="ask__body" dir="auto">
                <Lite text={m.srv.text} />
              </div>
              {m.srv.kind === 'clarify' && m.srv.options && (
                <div className="ask__chips">
                  {m.srv.options.map((o) => (
                    <button key={o.id} type="button" className="ask__chip" disabled={busy} onClick={() => void question(o.label, o.id)}>
                      {o.label}
                    </button>
                  ))}
                </div>
              )}
              {m.srv.proposal && (
                <div className="ask__proposal">
                  <span className="ask__label">{t('ask.ai.task')}</span>
                  <strong>{m.srv.proposal.title}</strong>
                  <span className="muted">
                    {[m.srv.proposal.customer ? t('ask.ai.taskFor', { name: m.srv.proposal.customer.name }) : '', m.srv.proposal.dueDate ? t('ask.ai.taskDue', { date: m.srv.proposal.dueDate }) : ''].filter(Boolean).join(' · ')}
                  </span>
                  {m.created ? (
                    <span className="ask__done">
                      <Icon name="checkCircle" size={16} />
                      {t('ask.ai.created')}
                    </span>
                  ) : canWrite ? (
                    <button type="button" className="btn btn--primary btn--small" onClick={() => void createTask(m.id, m.srv, (i) => changeSrv(i, { created: true }))}>
                      <Icon name="plus" size={14} />
                      {t('ask.ai.create')}
                    </button>
                  ) : (
                    <span className="muted">{t('ask.ai.readonly')}</span>
                  )}
                </div>
              )}
              {m.srv.opened && <p className="ask__from">{t('ask.ai.opened')}</p>}
              {m.srv.fixes && <FixButtons fixes={m.srv.fixes} />}
              {m.srv.citations.length > 0 && (
                <p className="ask__from">
                  {t('ask.ai.sourcesDocs')}{' '}
                  {m.srv.citations.map((d, i) => (
                    <span key={d.url}>
                      {i > 0 && ', '}
                      <a href={`${docsBase}${d.url.replace(/^\/docs\//, '')}`} {...docsLink}>
                        {d.section ? `${d.title} › ${d.section}` : d.title}
                      </a>
                    </span>
                  ))}
                </p>
              )}
              {m.srv.data.length > 0 && <p className="ask__from">{t('ask.ai.sourcesData', { what: m.srv.data.join(', ') })}</p>}
              {m.srv.engine === 'llm' && m.srv.kind === 'answer' && <p className="ask__from">{t('assist.ai.note')}</p>}
              {(m.srv.kind === 'not_covered' || m.srv.ticket) && write(m.question)}
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
              {m.done && m.trace?.fixes && <FixButtons fixes={m.trace.fixes} />}
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
      <p className="field__hint ask__private">{t(sampler ? 'ask.ai.private' : server ? 'assist.private' : 'ask.private')}</p>
    </div>
  );
}

/** The screens that fix what the setup checks found: the person clicks, nothing is fixed for them. */
function FixButtons({ fixes }: { fixes: { label: string; to: string }[] }) {
  const { t, locale } = useI18n();
  if (!fixes.length) return null;
  return (
    <div className="ask__fixes" role="group" aria-label={t('sh.assist.fixes')}>
      {fixes.map((f) =>
        f.to.startsWith('/docs/') ? (
          <a key={f.to} className="btn btn--small" href={docsHref(`${helpLanguageOf(locale)}/${f.to.slice('/docs/'.length)}`)} {...docsLink}>
            {f.label}
          </a>
        ) : (
          <button key={f.to} type="button" className="btn btn--small" onClick={() => navigate(f.to)}>
            {f.label}
          </button>
        ),
      )}
    </div>
  );
}
