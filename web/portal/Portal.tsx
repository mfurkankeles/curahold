// The customer portal: what a customer's people see of the work a company
// does for them. Their requests and the replies written for them, a way to
// open a new one, and nothing else. It talks only to /papi on its own domain.
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { translate, type Locale, type MessageKey, type Vars } from '../../shared/src/i18n';
import type { PortalBoard, PortalMe, PortalOrg, PortalTask, PortalTaskDetail } from '../../shared/src/portal';

// ------------------------------------------------------------------ api

class Failure extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

let apiLocale: Locale = 'en';
async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'x-tendwell-portal': '1', 'x-tendwell-locale': apiLocale };
  if (body !== undefined) headers['content-type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(`/papi${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin' });
  } catch {
    throw new Failure(0, 'network', '');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Failure(res.status, data?.error ?? 'server', data?.message ?? res.statusText);
  return data as T;
}

// --------------------------------------------------------------- router

function go(to: string, replace = false) {
  if (replace) history.replaceState(null, '', to);
  else history.pushState(null, '', to);
  window.dispatchEvent(new Event('tw:portal-nav'));
  window.scrollTo(0, 0);
}
function usePath() {
  const [path, setPath] = useState(() => location.pathname + location.search);
  useEffect(() => {
    const on = () => setPath(location.pathname + location.search);
    window.addEventListener('popstate', on);
    window.addEventListener('tw:portal-nav', on);
    return () => {
      window.removeEventListener('popstate', on);
      window.removeEventListener('tw:portal-nav', on);
    };
  }, []);
  return path;
}
const link = (to: string) => ({
  href: to,
  onClick: (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    go(to);
  },
});

// ------------------------------------------------------------------ i18n

const STORE = 'tw_portal_locale';
function storedLocale(): Locale | null {
  try {
    const v = localStorage.getItem(STORE);
    return v === 'tr' || v === 'en' ? v : null;
  } catch {
    return null;
  }
}

interface Ctx {
  t: (k: MessageKey, v?: Vars) => string;
  locale: Locale;
  when: (iso: string) => string;
}

// ------------------------------------------------------------------- app

type Boot = { kind: 'loading' } | { kind: 'missing' } | { kind: 'error' } | { kind: 'out'; org: PortalOrg; note?: string } | { kind: 'in'; org: PortalOrg; me: PortalMe };

export function PortalApp() {
  return (
    <div className="p-root">
      <Portal />
    </div>
  );
}

function Portal() {
  const [boot, setBoot] = useState<Boot>({ kind: 'loading' });
  const [locale, setLocale] = useState<Locale>(() => storedLocale() ?? (/^tr\b/i.test(navigator.language) ? 'tr' : 'en'));
  apiLocale = locale;
  const ctx = useMemo<Ctx>(
    () => ({
      locale,
      t: (k, v) => translate(locale, k, v),
      when: (iso) => new Date(iso).toLocaleString(locale === 'tr' ? 'tr-TR' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
    }),
    [locale],
  );
  const path = usePath();

  const start = useCallback(async (note?: string) => {
    let org: PortalOrg;
    try {
      org = await call<PortalOrg>('GET', '/org');
    } catch (e) {
      setBoot(e instanceof Failure && e.status === 404 ? { kind: 'missing' } : { kind: 'error' });
      return;
    }
    if (!storedLocale()) setLocale(org.locale);
    document.title = org.name;
    // The one-time link from the email: trade it for a session, and keep it out of the address bar.
    if (location.pathname === '/auth') {
      const token = new URLSearchParams(location.hash.slice(1)).get('token');
      history.replaceState(null, '', '/');
      try {
        if (!token) throw new Error('no token');
        const r = await call<{ locale: Locale | null }>('POST', '/auth/verify', { token });
        if (r.locale && !storedLocale()) setLocale(r.locale);
      } catch {
        setBoot({ kind: 'out', org, note: 'link' });
        return;
      }
    }
    try {
      const me = await call<PortalMe>('GET', '/me');
      if (me.user.locale && !storedLocale()) setLocale(me.user.locale);
      setBoot({ kind: 'in', org, me });
    } catch {
      setBoot({ kind: 'out', org, note });
    }
  }, []);
  useEffect(() => void start(), [start]);

  const changeLocale = (l: Locale) => {
    try {
      localStorage.setItem(STORE, l);
    } catch {
      /* private mode */
    }
    setLocale(l);
  };
  const signedOut = (note?: string) => void start(note ?? 'expired');

  const { t } = ctx;
  if (boot.kind === 'loading') return <div className="p-center" aria-busy="true" />;
  if (boot.kind === 'missing' || boot.kind === 'error')
    return (
      <div className="p-center">
        <p className="p-muted">{t(boot.kind === 'missing' ? 'portal.missing' : 'errors.server')}</p>
      </div>
    );

  const lang = (
    <button className="p-link" onClick={() => changeLocale(locale === 'tr' ? 'en' : 'tr')}>
      {locale === 'tr' ? t('portal.english') : t('portal.turkish')}
    </button>
  );

  if (boot.kind === 'out') return <SignIn ctx={ctx} org={boot.org} note={boot.note} lang={lang} />;

  const { org, me } = boot;
  return (
    <div className="p-shell">
      <header className="p-top">
        <a className="p-brand" {...link('/')}>
          {org.logoUrl ? <img src={org.logoUrl} alt="" /> : <span className="p-brand__mark" aria-hidden="true">{org.name.slice(0, 1)}</span>}
          <span>
            <strong>{org.name}</strong>
            <small>{t('portal.for', { account: me.account.name })}</small>
          </span>
        </a>
        <div className="p-top__me">
          <span className="p-muted">{me.user.name}</span>
          {lang}
          <button
            className="p-link"
            onClick={async () => {
              await call('POST', '/auth/logout').catch(() => undefined);
              void start('out');
            }}
          >
            {t('portal.signOut')}
          </button>
        </div>
      </header>
      <main className="p-main">
        <Route ctx={ctx} me={me} path={path} onSignedOut={signedOut} />
      </main>
      <footer className="p-foot">{t('portal.footer', { company: org.name })}</footer>
    </div>
  );
}

function Route({ ctx, me, path, onSignedOut }: { ctx: Ctx; me: PortalMe; path: string; onSignedOut: (n?: string) => void }) {
  const url = new URL(path, location.origin);
  const task = /^\/t\/([0-9a-f-]{36})$/i.exec(url.pathname)?.[1];
  const boardId = url.searchParams.get('board');
  const board = me.boards.find((b) => b.id === boardId) ?? me.boards[0];
  if (!board) return <Empty>{ctx.t('portal.noBoards')}</Empty>;
  if (task) return <TaskPage key={task} ctx={ctx} id={task} onSignedOut={onSignedOut} />;
  if (url.pathname === '/new') return <NewRequest ctx={ctx} me={me} board={board} onSignedOut={onSignedOut} />;
  return <List ctx={ctx} me={me} board={board} onSignedOut={onSignedOut} />;
}

// --------------------------------------------------------------- sign in

function SignIn({ ctx, org, note, lang }: { ctx: Ctx; org: PortalOrg; note?: string; lang: ReactNode }) {
  const { t } = ctx;
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await call('POST', '/auth/start', { email });
      setSent(true);
    } catch (err) {
      setProblem(err instanceof Failure ? err.message : t('errors.server'));
    } finally {
      setBusy(false);
    }
  };
  const notice = note === 'link' ? t('portal.linkUsed') : note === 'expired' ? t('portal.expired') : null;
  return (
    <div className="p-center">
      <div className="p-card p-signin">
        {org.logoUrl ? <img className="p-signin__logo" src={org.logoUrl} alt={org.name} /> : <div className="p-brand__mark p-brand__mark--big" aria-hidden="true">{org.name.slice(0, 1)}</div>}
        <h1>{t('portal.signInTitle', { company: org.name })}</h1>
        {sent ? (
          <p role="status">{t('portal.checkInbox', { email })}</p>
        ) : (
          <form onSubmit={submit}>
            <p className="p-muted">{t('portal.signInLead', { company: org.name })}</p>
            {notice && <p className="p-note">{notice}</p>}
            <label className="p-field">
              <span>{t('portal.email')}</span>
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            {problem && (
              <p className="p-note p-note--error" role="alert">
                {problem}
              </p>
            )}
            <button className="p-btn p-btn--primary" disabled={busy || !email}>
              {t('portal.sendLink')}
            </button>
          </form>
        )}
        <div className="p-signin__foot">{lang}</div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ list

function useLoad<T>(load: () => Promise<T>, deps: unknown[], onSignedOut: (n?: string) => void) {
  const [data, setData] = useState<T | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const reload = useCallback(() => {
    load().then(setData, (e) => {
      if (e instanceof Failure && e.status === 401) onSignedOut('expired');
      else setFailed(e instanceof Failure ? e.message : 'error');
    });
  }, deps);
  useEffect(reload, [reload]);
  return { data, failed, reload, setData };
}

function Status({ board, status }: { board: PortalBoard; status: string }) {
  const col = board.columns.find((c) => c.key === status);
  const i = board.columns.findIndex((c) => c.key === status);
  return (
    <span className="p-status" data-done={col?.done || undefined} data-step={col?.done ? 'done' : i <= 0 ? 'new' : 'doing'}>
      {col?.name ?? status}
    </span>
  );
}

function List({ ctx, me, board, onSignedOut }: { ctx: Ctx; me: PortalMe; board: PortalBoard; onSignedOut: (n?: string) => void }) {
  const { t, when } = ctx;
  const [show, setShow] = useState<'open' | 'done'>('open');
  const { data, failed } = useLoad(() => call<{ tasks: PortalTask[] }>('GET', `/boards/${board.id}/tasks`).then((r) => r.tasks), [board.id], onSignedOut);
  const done = new Set(board.columns.filter((c) => c.done).map((c) => c.key));
  const list = (data ?? []).filter((x) => (show === 'done') === done.has(x.status));
  const openCount = (data ?? []).filter((x) => !done.has(x.status)).length;
  return (
    <>
      {me.boards.length > 1 && (
        <nav className="p-tabs" aria-label={t('portal.boards')}>
          {me.boards.map((b) => (
            <a key={b.id} aria-current={b.id === board.id ? 'page' : undefined} {...link(`/?board=${b.id}`)}>
              {b.name}
            </a>
          ))}
        </nav>
      )}
      <div className="p-head">
        <div>
          <h1>{t('portal.requests')}</h1>
          <p className="p-muted">{t('portal.requestsLead', { company: me.account.name })}</p>
        </div>
        <a className="p-btn p-btn--primary" {...link(`/new?board=${board.id}`)}>
          {t('portal.new')}
        </a>
      </div>
      <div className="p-seg" role="group">
        <button aria-pressed={show === 'open'} onClick={() => setShow('open')}>
          {t('portal.open', { n: openCount })}
        </button>
        <button aria-pressed={show === 'done'} onClick={() => setShow('done')}>
          {t('portal.closed')}
        </button>
      </div>
      {failed && <p className="p-note p-note--error">{failed}</p>}
      {!data && !failed && <p className="p-muted">{t('common.loading')}</p>}
      {data && list.length === 0 && <Empty>{show === 'open' ? t('portal.noOpen') : t('portal.noClosed')}</Empty>}
      <ul className="p-list">
        {list.map((x) => (
          <li key={x.id}>
            <a className="p-item" {...link(`/t/${x.id}`)}>
              <span className="p-item__title">{x.title}</span>
              <Status board={board} status={x.status} />
              <span className="p-item__meta">
                {x.openedBy ? t('portal.openedBy', { name: x.openedBy }) : t('portal.fromTeam')}
                {' · '}
                {t('portal.updated', { when: when(x.updatedAt) })}
                {x.replies > 0 && <> · {t('portal.replies', { n: x.replies })}</>}
                {x.dueDate && <> · {t('portal.due', { when: new Date(x.dueDate).toLocaleDateString(ctx.locale === 'tr' ? 'tr-TR' : 'en-GB', { day: 'numeric', month: 'short' }) })}</>}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="p-empty">{children}</div>;
}

// ------------------------------------------------------------------- new

function NewRequest({ ctx, me, board, onSignedOut }: { ctx: Ctx; me: PortalMe; board: PortalBoard; onSignedOut: (n?: string) => void }) {
  const { t } = ctx;
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (title.trim().length < 3) return setProblem(t('portal.needTitle'));
    setBusy(true);
    setProblem(null);
    try {
      const r = await call<{ task: PortalTask }>('POST', `/boards/${board.id}/tasks`, { title, description });
      go(`/t/${r.task.id}`, true);
    } catch (err) {
      if (err instanceof Failure && err.status === 401) return onSignedOut('expired');
      setProblem(err instanceof Failure ? err.message : t('errors.server'));
      setBusy(false);
    }
  };
  return (
    <form className="p-card p-form" onSubmit={submit}>
      <a className="p-back" {...link(`/?board=${board.id}`)}>
        {t('portal.back')}
      </a>
      <h1>{t('portal.newTitle')}</h1>
      <p className="p-muted">{t('portal.newLead', { account: me.account.name })}</p>
      <label className="p-field">
        <span>{t('portal.title')}</span>
        <input value={title} maxLength={300} onChange={(e) => setTitle(e.target.value)} placeholder={t('portal.titlePlaceholder')} />
      </label>
      <label className="p-field">
        <span>{t('portal.details')}</span>
        <textarea rows={7} value={description} maxLength={20000} onChange={(e) => setDescription(e.target.value)} placeholder={t('portal.detailsPlaceholder')} />
      </label>
      {problem && (
        <p className="p-note p-note--error" role="alert">
          {problem}
        </p>
      )}
      <div className="p-actions">
        <button className="p-btn p-btn--primary" disabled={busy}>
          {t('portal.send')}
        </button>
        <span className="p-muted">{t('portal.sendHint')}</span>
      </div>
    </form>
  );
}

// ------------------------------------------------------------------ task

function TaskPage({ ctx, id, onSignedOut }: { ctx: Ctx; id: string; onSignedOut: (n?: string) => void }) {
  const { t, when } = ctx;
  const { data, failed, setData } = useLoad(() => call<{ task: PortalTaskDetail }>('GET', `/tasks/${id}`).then((r) => r.task), [id], onSignedOut);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  if (failed) return <Empty>{t('portal.notFound')}</Empty>;
  if (!data) return <p className="p-muted">{t('common.loading')}</p>;
  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!reply.trim()) return;
    setBusy(true);
    setProblem(null);
    try {
      const r = await call<{ task: PortalTaskDetail }>('POST', `/tasks/${id}/comments`, { body: reply });
      setData(r.task);
      setReply('');
    } catch (err) {
      if (err instanceof Failure && err.status === 401) return onSignedOut('expired');
      setProblem(err instanceof Failure ? err.message : t('errors.server'));
    } finally {
      setBusy(false);
    }
  };
  const fields = data.board.fields;
  return (
    <article className="p-card p-task">
      <a className="p-back" {...link(`/?board=${data.boardId}`)}>
        {t('portal.back')}
      </a>
      <div className="p-task__head">
        <h1>{data.title}</h1>
        <Status board={data.board} status={data.status} />
      </div>
      <dl className="p-meta">
        <div>
          <dt>{t('portal.opened')}</dt>
          <dd>
            {when(data.createdAt)}
            {data.openedBy ? ` · ${data.openedBy}` : ''}
          </dd>
        </div>
        {fields.includes('due') && data.dueDate && (
          <div>
            <dt>{t('portal.dueLabel')}</dt>
            <dd>{new Date(data.dueDate).toLocaleDateString(ctx.locale === 'tr' ? 'tr-TR' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</dd>
          </div>
        )}
        {fields.includes('assignee') && data.assignees && data.assignees.length > 0 && (
          <div>
            <dt>{t('portal.workingOn')}</dt>
            <dd>{data.assignees.join(', ')}</dd>
          </div>
        )}
        {fields.includes('priority') && data.priority && (
          <div>
            <dt>{t('portal.priority')}</dt>
            <dd>{t(`task.priority.${data.priority}` as MessageKey)}</dd>
          </div>
        )}
      </dl>
      {data.description && <p className="p-task__desc">{data.description}</p>}
      <section className="p-thread" aria-label={t('portal.conversation')}>
        <h2>{t('portal.conversation')}</h2>
        {data.comments.length === 0 && <p className="p-muted">{t('portal.noReplies')}</p>}
        <ol>
          {data.comments.map((c) => (
            <li key={c.id} className="p-msg" data-side={c.fromCustomer ? 'customer' : 'team'}>
              <div className="p-msg__who">
                <strong>{c.author ?? t('portal.someone')}</strong>
                <span className="p-muted">{when(c.createdAt)}</span>
              </div>
              <p>{c.body.replace(/@\[([^\]]+)\]\([0-9a-f-]{36}\)/g, '@$1')}</p>
            </li>
          ))}
        </ol>
        <form className="p-reply" onSubmit={send}>
          <label className="p-field">
            <span>{t('portal.reply')}</span>
            <textarea rows={3} value={reply} maxLength={10000} onChange={(e) => setReply(e.target.value)} />
          </label>
          {problem && (
            <p className="p-note p-note--error" role="alert">
              {problem}
            </p>
          )}
          <div className="p-actions">
            <button className="p-btn p-btn--primary" disabled={busy || !reply.trim()}>
              {t('portal.sendReply')}
            </button>
          </div>
        </form>
      </section>
    </article>
  );
}
