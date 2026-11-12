// Curahold's own support desk, at the central address (/desk): the queues on
// the left, the requests of the chosen queue beside them, and the request
// that is open on the right — the conversation, the company it comes from and
// the team's own notes. Only people on Curahold's staff list can sign in.
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { Locale, MessageKey } from '../../../shared/src/i18n';
import { EmptyState } from '../components/Empty';
import { Icon, type IconName } from '../components/icons';
import { useI18n } from '../lib/i18n';
import { relativeTime } from '../lib/time';
import '../desk.css';

type Status = 'received' | 'answered' | 'solved';
interface Row {
  ref: string;
  subject: string;
  impact: string | null;
  status: Status;
  lastMessageAt: string;
  neededBy: string | null;
  company: { slug: string; name: string };
  from: { name: string | null; email: string | null };
  owner: string | null;
  notes: number;
}
interface Message {
  id: string;
  author: 'user' | 'support';
  name: string | null;
  body: string;
  internal: boolean;
  via: string;
  createdAt: string;
}
interface Detail extends Omit<Row, 'company' | 'from' | 'notes' | 'lastMessageAt'> {
  description: string;
  steps: string | null;
  pageUrl: string | null;
  createdAt: string;
  company: { slug: string; name: string; url: string; plan: string | null; people: number; since: string; trialEndsAt: string | null };
  from: { name: string | null; email: string | null; role: string | null };
  files: { name: string; size: number; url: string }[];
  access: { level: 'view' | 'edit'; until: string } | null;
  others: { ref: string; subject: string; status: Status }[];
  messages: Message[];
}
interface Me {
  staff: { email: string; name: string };
  counts: { received: number; answered: number; solved: number; mine: number; unclaimed: number };
}

class DeskError extends Error {
  constructor(readonly status: number) {
    super(String(status));
  }
}
/** Every change carries a header a form on another site could not set. */
async function desk<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/desk${path}`, { method, headers: { 'x-curahold-desk': '1', ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!res.ok) throw new DeskError(res.status);
  return (await res.json()) as T;
}

const QUEUES: { key: string; query: string; icon: IconName; count?: keyof Me['counts'] }[] = [
  { key: 'received', query: 'status=received', icon: 'inbox', count: 'received' },
  { key: 'unclaimed', query: 'status=received&unclaimed=1', icon: 'flag', count: 'unclaimed' },
  { key: 'mine', query: 'mine=1', icon: 'user', count: 'mine' },
  { key: 'answered', query: 'status=answered', icon: 'hourglass', count: 'answered' },
  { key: 'solved', query: 'status=solved', icon: 'checkCircle' },
  { key: 'all', query: '', icon: 'list' },
];
const SIGNED_AS = 'desk_signed_as';
const day = (iso: string, locale: string) => new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
const shortName = (email: string) => email.split('@')[0];
/** A plan by its name; one this screen has no word for shows as it is stored. */
const planName = (plan: string, t: (k: MessageKey) => string) => (plan === 'trial' ? t('desk.plan.trial') : plan === 'team' || plan === 'business' ? t(`billing.plan.${plan}`) : plan);

/** English first; Turkish is a choice, kept on this device like everywhere else. */
function Languages({ onLocale }: { onLocale: (l: Locale) => void }) {
  const { locale, t } = useI18n();
  return (
    <div className="seg desk__langs" role="group" aria-label={t('nav.language')}>
      {(['en', 'tr'] as Locale[]).map((l) => (
        <button key={l} type="button" aria-pressed={locale === l} onClick={() => onLocale(l)}>
          {l === 'en' ? 'English' : 'Türkçe'}
        </button>
      ))}
    </div>
  );
}

export default function DeskApp({ onLocale }: { onLocale: (l: Locale) => void }) {
  const { t } = useI18n();
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setMe(await desk<Me>('GET', '/me'));
    } catch {
      setMe(null);
    }
  }, []);
  useEffect(() => void load(), [load]);
  useEffect(() => {
    document.title = `${t('desk.title')} · Curahold`;
  }, [t]);

  if (me === undefined) return <div className="center-note muted" />;
  if (me === null) return <SignIn notice={notice} onIn={load} onLocale={onLocale} />;
  return (
    <Desk
      me={me}
      onLocale={onLocale}
      refreshCounts={load}
      onOut={async (expired) => {
        if (!expired) await desk('POST', '/sign-out').catch(() => undefined);
        setNotice(expired ? t('desk.signedOut') : null);
        setMe(null);
      }}
    />
  );
}

function SignIn({ notice, onIn, onLocale }: { notice: string | null; onIn: () => void; onLocale: (l: Locale) => void }) {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await desk<{ devCode?: string }>('POST', '/sign-in', { email });
      setDevCode(r.devCode ?? null);
      setSent(true);
      setWrong(false);
    } catch {
      setWrong(true);
    }
    setBusy(false);
  };
  const enter = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await desk('POST', '/sign-in/verify', { email, code });
      onIn();
    } catch {
      setWrong(true);
      setBusy(false);
    }
  };
  return (
    <main className="desk-signin">
      <form className="desk-signin__card" onSubmit={sent ? enter : send}>
        <div className="desk-signin__top">
          <span className="desk-signin__mark" aria-hidden="true">
            <Icon name="lifebuoy" size={24} />
          </span>
          <Languages onLocale={onLocale} />
        </div>
        <h1>{t('desk.title')}</h1>
        <p className="muted">{notice ?? t('desk.signin.lead')}</p>
        <label className="field">
          <span className="field__label">{t('desk.signin.email')}</span>
          <input className="input" type="email" autoComplete="username" required autoFocus disabled={sent} value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {sent && (
          <>
            <p className="field__hint">{t('desk.signin.sent')}</p>
            <label className="field">
              <span className="field__label">{t('desk.signin.code')}</span>
              <input className="input desk-signin__code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
            </label>
            {devCode && (
              <button type="button" className="btn btn--small desk-signin__dev" onClick={() => setCode(devCode)}>
                {devCode}
              </button>
            )}
          </>
        )}
        {wrong && <p className="desk-signin__wrong">{t(sent ? 'desk.signin.wrong' : 'desk.error')}</p>}
        <button className="btn btn--primary" disabled={busy}>
          <Icon name={sent ? 'arrowRight' : 'mail'} size={16} />
          {t(sent ? 'desk.signin.enter' : 'desk.signin.send')}
        </button>
        {sent && (
          <button
            type="button"
            className="btn btn--quiet"
            onClick={() => {
              setSent(false);
              setCode('');
              setWrong(false);
            }}
          >
            {t('desk.signin.again')}
          </button>
        )}
      </form>
    </main>
  );
}

function Desk({ me, refreshCounts, onOut, onLocale }: { me: Me; refreshCounts: () => void; onOut: (expired: boolean) => void; onLocale: (l: Locale) => void }) {
  const { t } = useI18n();
  const [queue, setQueue] = useState('received');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [open, setOpen] = useState<string | null>(() => new URLSearchParams(location.search).get('r'));
  const failed = useCallback((e: unknown) => (e instanceof DeskError && (e.status === 403 || e.status === 401) ? onOut(true) : undefined), [onOut]);

  const load = useCallback(async () => {
    const base = QUEUES.find((x) => x.key === queue)!.query;
    try {
      const r = await desk<{ requests: Row[] }>('GET', `/requests?${base}${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ''}`);
      setRows(r.requests);
    } catch (e) {
      failed(e);
    }
  }, [queue, q, failed]);
  useEffect(() => {
    const id = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(id);
  }, [load, q]);
  // A queue is only useful if it is current: look again every half minute, and when the tab is looked at again.
  useEffect(() => {
    const again = () => {
      if (document.visibilityState === 'visible') {
        void load();
        refreshCounts();
      }
    };
    const id = setInterval(again, 30_000);
    document.addEventListener('visibilitychange', again);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', again);
    };
  }, [load, refreshCounts]);
  const choose = (ref: string | null) => {
    setOpen(ref);
    history.replaceState(null, '', ref ? `/desk?r=${ref}` : '/desk');
  };
  const changed = () => {
    void load();
    refreshCounts();
  };

  return (
    <div className="desk" data-open={open ? '' : undefined}>
      <aside className="desk__rail">
        <div className="desk__brand">
          <span className="desk__mark" aria-hidden="true">
            <Icon name="lifebuoy" size={18} />
          </span>
          <strong>{t('desk.title')}</strong>
        </div>
        <nav className="desk__queues" aria-label={t('desk.title')}>
          {QUEUES.map((x) => (
            <button key={x.key} className="desk__queue" aria-current={queue === x.key || undefined} onClick={() => setQueue(x.key)}>
              <Icon name={x.icon} size={16} />
              <span>{t(`desk.queue.${x.key}` as MessageKey)}</span>
              {x.count && me.counts[x.count] > 0 && <span className="desk__count">{me.counts[x.count]}</span>}
            </button>
          ))}
        </nav>
        <div className="desk__who">
          <Languages onLocale={onLocale} />
          <span className="muted">{me.staff.email}</span>
          <button className="btn btn--quiet btn--small" onClick={() => onOut(false)}>
            <Icon name="logout" size={14} />
            {t('desk.signout')}
          </button>
        </div>
      </aside>

      <section className="desk__list" aria-label={t(`desk.queue.${queue}` as MessageKey)}>
        <label className="desk__search">
          <Icon name="search" size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('desk.search')} aria-label={t('desk.search')} />
        </label>
        {rows && rows.length === 0 && <EmptyState icon="inbox" tone="done" compact title={t('desk.empty')} body={t('desk.emptyBody')} />}
        <ul className="desk__rows">
          {(rows ?? []).map((r) => (
            <li key={r.ref}>
              <button className="desk__row" aria-current={open === r.ref || undefined} onClick={() => choose(r.ref)}>
                <span className="desk__rowtop">
                  <span className="desk__dot" data-status={r.status} aria-hidden="true" />
                  <strong>{r.subject}</strong>
                </span>
                <span className="desk__rowmeta">
                  {r.company.name} · {r.from.name ?? r.from.email ?? '—'} · {relativeTime(r.lastMessageAt, t)}
                </span>
                <span className="desk__rowtags">
                  {r.impact === 'blocking' && <span className="flag flag--late">{t('desk.blocking')}</span>}
                  {r.neededBy && <span className="flag flag--soon">{t('desk.neededBy', { date: r.neededBy })}</span>}
                  {r.owner && <span className="badge">{r.owner === me.staff.email ? t('desk.queue.mine') : shortName(r.owner)}</span>}
                  {r.notes > 0 && <span className="badge desk__notes">{t('desk.notes', { n: r.notes })}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="desk__detail">
        {open ? <Request key={open} reference={open} me={me} onBack={() => choose(null)} onChanged={changed} onOpen={choose} failed={failed} /> : <EmptyState icon="lifebuoy" title={t('desk.pick')} body={t('desk.pickBody')} />}
      </section>
    </div>
  );
}

function Request({ reference, me, onBack, onChanged, onOpen, failed }: { reference: string; me: Me; onBack: () => void; onChanged: () => void; onOpen: (ref: string) => void; failed: (e: unknown) => void }) {
  const { t, locale } = useI18n();
  const [d, setD] = useState<Detail | null>(null);
  const [mode, setMode] = useState<'public' | 'internal'>('public');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [signedAs, setSignedAs] = useState(() => {
    try {
      return localStorage.getItem(SIGNED_AS) ?? me.staff.name;
    } catch {
      return me.staff.name;
    }
  });
  const end = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      setD((await desk<{ request: Detail }>('GET', `/requests/${reference}`)).request);
    } catch (e) {
      failed(e);
    }
  }, [reference, failed]);
  useEffect(() => void load(), [load]);
  // In braces on purpose: newer browsers hand back a promise from scrollIntoView, and an effect must not return one.
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [d?.messages.length]);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(false);
    try {
      await fn();
      await load();
      onChanged();
    } catch (e) {
      setError(true);
      failed(e);
    }
    setBusy(false);
  };
  const send = (solved: boolean) =>
    act(async () => {
      const name = signedAs.trim().length >= 2 ? signedAs.trim() : me.staff.name;
      try {
        localStorage.setItem(SIGNED_AS, name);
      } catch {
        /* private mode */
      }
      await desk('POST', `/requests/${reference}/messages`, { body: text, staff: name, internal: mode === 'internal', ...(solved && mode === 'public' ? { status: 'solved' } : {}) });
      setText('');
    });
  const enter = () =>
    act(async () => {
      const r = await desk<{ url: string }>('POST', `/requests/${reference}/enter-link`);
      window.open(r.url, '_blank', 'noopener');
    });

  if (!d) return <div className="center-note muted" />;
  const mine = d.owner === me.staff.email;
  return (
    <div className="deskreq">
      <header className="deskreq__head">
        <button className="btn btn--quiet btn--small deskreq__back" onClick={onBack}>
          <Icon name="arrowLeft" size={16} />
          {t('desk.back')}
        </button>
        <div className="deskreq__title">
          <span className="muted">{d.ref}</span>
          <h1>{d.subject}</h1>
        </div>
        <div className="deskreq__tools">
          <span className="desk__status" data-status={d.status}>
            {t(`desk.status.${d.status}` as MessageKey)}
          </span>
          <button className="btn btn--small" disabled={busy} onClick={() => act(() => desk('PUT', `/requests/${reference}/owner`, { mine: !mine }))}>
            <Icon name={mine ? 'undo' : 'user'} size={14} />
            {t(mine ? 'desk.release' : 'desk.take')}
          </button>
          <button className="btn btn--small" disabled={busy} onClick={() => act(() => desk('PUT', `/requests/${reference}/status`, { status: d.status === 'solved' ? 'received' : 'solved' }))}>
            <Icon name={d.status === 'solved' ? 'refresh' : 'check'} size={14} />
            {t(d.status === 'solved' ? 'desk.reopen' : 'desk.markSolved')}
          </button>
        </div>
      </header>

      <div className="deskreq__body">
        <div className="deskreq__thread">
          <p className="deskreq__owner muted">{mine ? t('desk.ownerYou') : d.owner ? t('desk.owner', { name: shortName(d.owner) }) : t('desk.nobody')}</p>
          <article className="deskmsg" data-by="user">
            <header>
              <strong>{d.from.name ?? d.from.email ?? '—'}</strong>
              <span className="muted">{day(d.createdAt, locale)}</span>
            </header>
            <h2>{t('desk.asked')}</h2>
            <p className="deskmsg__text">{d.description}</p>
            {d.steps && (
              <>
                <h2>{t('desk.steps')}</h2>
                <p className="deskmsg__text">{d.steps}</p>
              </>
            )}
            {d.pageUrl && (
              <p className="muted">
                {t('desk.page')}: <code>{d.pageUrl}</code>
              </p>
            )}
            {d.files.length > 0 && (
              <ul className="deskreq__files" aria-label={t('desk.files')}>
                {d.files.map((f) => (
                  <li key={f.url}>
                    <a href={f.url} target="_blank" rel="noreferrer">
                      <Icon name="paperclip" size={14} />
                      {f.name}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </article>
          {d.messages.map((m) => (
            <article key={m.id} className="deskmsg" data-by={m.internal ? 'note' : m.author}>
              <header>
                <strong>{m.name ?? (m.author === 'support' ? 'Curahold' : '—')}</strong>
                {m.internal && <span className="badge deskmsg__tag">{t('desk.internalTag')}</span>}
                <span className="muted">
                  {relativeTime(m.createdAt, t)}
                  {m.via === 'email' ? ` · ${t('desk.via.email')}` : ''}
                </span>
              </header>
              <p className="deskmsg__text">{m.body}</p>
            </article>
          ))}
          <div ref={end} />

          <form
            className="deskreply"
            data-mode={mode}
            onSubmit={(e) => {
              e.preventDefault();
              void send(false);
            }}
          >
            <div className="seg" role="radiogroup">
              <button type="button" role="radio" aria-checked={mode === 'public'} onClick={() => setMode('public')}>
                <Icon name="send" size={14} />
                {t('desk.reply.public')}
              </button>
              <button type="button" role="radio" aria-checked={mode === 'internal'} onClick={() => setMode('internal')}>
                <Icon name="lock" size={14} />
                {t('desk.reply.internal')}
              </button>
            </div>
            <textarea className="input deskreply__text" rows={5} required value={text} onChange={(e) => setText(e.target.value)} placeholder={t(mode === 'public' ? 'desk.reply.placeholder' : 'desk.reply.notePlaceholder')} aria-label={t(mode === 'public' ? 'desk.reply.public' : 'desk.reply.internal')} />
            <p className="field__hint">{t(mode === 'public' ? 'desk.reply.publicHint' : 'desk.reply.internalHint')}</p>
            {error && <p className="desk-signin__wrong">{t('desk.error')}</p>}
            <div className="deskreply__foot">
              <label className="deskreply__name">
                <span className="muted">{t('desk.reply.name')}</span>
                <input className="input" value={signedAs} maxLength={80} onChange={(e) => setSignedAs(e.target.value)} />
              </label>
              {mode === 'public' && (
                <button type="button" className="btn" disabled={busy || !text.trim()} onClick={() => send(true)}>
                  <Icon name="check" size={16} />
                  {t('desk.reply.sendSolved')}
                </button>
              )}
              <button className="btn btn--primary" disabled={busy || !text.trim()}>
                <Icon name={mode === 'public' ? 'send' : 'lock'} size={16} />
                {t(mode === 'public' ? 'desk.reply.send' : 'desk.reply.saveNote')}
              </button>
            </div>
          </form>
        </div>

        <aside className="deskreq__side">
          <section>
            <h2>{t('desk.company')}</h2>
            <p>
              <strong>{d.company.name}</strong>
              {d.company.plan ? <span className="badge">{planName(d.company.plan, t)}</span> : null}
            </p>
            <p className="muted">
              {t('desk.company.people', { n: d.company.people })} · {t('desk.company.since', { date: day(d.company.since, locale) })}
            </p>
            {d.company.trialEndsAt && <p className="muted">{t('desk.company.trial', { date: day(d.company.trialEndsAt, locale) })}</p>}
            <a className="btn btn--small" href={d.company.url} target="_blank" rel="noreferrer">
              <Icon name="external" size={14} />
              {t('desk.company.open')}
            </a>
          </section>
          <section>
            <h2>{t('desk.from')}</h2>
            <p>
              <strong>{d.from.name ?? '—'}</strong>
              {d.from.role ? <span className="badge">{d.from.role}</span> : null}
            </p>
            <p className="muted">{d.from.email}</p>
            {d.impact === 'blocking' && <span className="flag flag--late">{t('desk.blocking')}</span>}
            {d.neededBy && <span className="flag flag--soon">{t('desk.neededBy', { date: d.neededBy })}</span>}
          </section>
          <section className="deskreq__access" data-on={d.access ? '' : undefined}>
            <p>{d.access ? t(d.access.level === 'edit' ? 'desk.access.edit' : 'desk.access.view', { when: day(d.access.until, locale) }) : t('desk.access.none')}</p>
            {d.access && (
              <>
                <button className="btn btn--small" disabled={busy} onClick={enter}>
                  <Icon name="eye" size={14} />
                  {t('desk.access.enter')}
                </button>
                <p className="field__hint">{t('desk.access.note')}</p>
              </>
            )}
          </section>
          {d.others.length > 0 && (
            <section>
              <h2>{t('desk.others')}</h2>
              <ul className="deskreq__others">
                {d.others.map((o) => (
                  <li key={o.ref}>
                    <button className="linklike" onClick={() => onOpen(o.ref)}>
                      <span className="desk__dot" data-status={o.status} aria-hidden="true" />
                      {o.subject}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
