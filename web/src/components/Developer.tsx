// The open edges of Curahold: personal API keys, apps and AI assistants
// connected to a person, webhooks for the company, and the consent screen an
// app sends someone to. Everything here acts as a person and inside their
// rights; nothing opens a way around them.
import { Icon } from './icons';
import { docsHref, docsLink } from '../lib/docs';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { WEBHOOK_EVENTS, type ApiKeyInfo, type WebhookInfo } from '../../../shared/src/developer';
import { ApiFailure, del, get, patch, post } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { navigate } from '../lib/router';
import { useStore } from '../lib/store';
import { relativeTime } from '../lib/time';
import { Confirm, Dialog } from './ui';

function useCopy() {
  const { t } = useI18n();
  const { toast } = useStore();
  return useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        toast(t('me.copied'));
      } catch {
        /* the field stays selectable */
      }
    },
    [t, toast],
  );
}

function useFail() {
  const { t } = useI18n();
  const { toast } = useStore();
  return useCallback((e: unknown) => toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error'), [t, toast]);
}

/** A value shown once (a key, a signing secret), with a copy button. */
function ShowOnce({ value, note }: { value: string; note: string }) {
  const { t } = useI18n();
  const copy = useCopy();
  return (
    <div className="once">
      <p className="once__note">{note}</p>
      <div className="toolbar">
        <input className="input once__value" readOnly value={value} onFocus={(e) => e.target.select()} aria-label={note} />
        <button className="btn btn--primary" onClick={() => copy(value)}>
          {t('me.copy')}
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------- AI assistants

/** Profile: how to connect Claude, ChatGPT or any MCP client. */
export function AiConnect() {
  const { t } = useI18n();
  const copy = useCopy();
  const url = `${location.origin}/mcp`;
  return (
    <section className="sheet">
      <h2 className="sheet__title">
            <Icon name="zap" size={18} className="icon--lead" />
            {t('dev.ai.title')}
          </h2>
      <p className="sheet__hint">{t('dev.ai.hint')}</p>
      <label className="field">
        <span className="field__label">{t('dev.ai.url')}</span>
        <div className="toolbar">
          <input className="input" readOnly value={url} style={{ flex: 1, minWidth: 220 }} onFocus={(e) => e.target.select()} />
          <button className="btn" onClick={() => copy(url)}>
            {t('me.copy')}
          </button>
        </div>
      </label>
      <ul className="steps">
        <li>{t('dev.ai.claude')}</li>
        <li>{t('dev.ai.chatgpt')}</li>
      </ul>
      <p className="field__hint">{t('dev.ai.examples')}</p>
    </section>
  );
}

// ------------------------------------------------------------- keys and apps

function KeyRow({ k, owner, onRevoke }: { k: ApiKeyInfo; owner?: string; onRevoke: () => void }) {
  const { t } = useI18n();
  return (
    <li className="keyrow">
      <div className="keyrow__main">
        <div className="keyrow__name">
          {k.name} <span className="badge">{k.kind === 'oauth' ? t('dev.keys.app') : t('dev.keys.key')}</span>{' '}
          <span className={k.canWrite ? 'badge badge--active' : 'badge'}>{k.canWrite ? t('dev.keys.readWrite') : t('dev.keys.readOnly')}</span>
        </div>
        <div className="keyrow__meta">
          {owner && <span>{owner} · </span>}
          {k.kind === 'key' && <code>{k.prefix}…</code>} {k.lastUsedAt ? t('dev.keys.used', { when: relativeTime(k.lastUsedAt, t) }) : t('dev.keys.unused')}
          {k.expiresAt && k.kind === 'key' && <> · {t('dev.keys.until', { date: k.expiresAt.slice(0, 10) })}</>}
        </div>
      </div>
      <button className="btn btn--quiet btn--small" onClick={onRevoke}>
        {t('dev.keys.revoke')}
      </button>
    </li>
  );
}

/** Profile: this person's keys and connected apps. With `all`, the company's (for people admins). */
export function KeyList({ all = false }: { all?: boolean }) {
  const { t, locale } = useI18n();
  const { me, people, toast } = useStore();
  const fail = useFail();
  const [keys, setKeys] = useState<ApiKeyInfo[] | null>(null);
  const [making, setMaking] = useState(false);
  const [revoking, setRevoking] = useState<ApiKeyInfo | null>(null);
  const load = useCallback(() => get<{ keys: ApiKeyInfo[] }>(`/dev/keys${all ? '?scope=all' : ''}`).then((r) => setKeys(r.keys)), [all]);
  useEffect(() => {
    void load();
  }, [load]);
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? '—';
  const readOnlySeat = me.user.seat !== 'full';

  return (
    <section className="sheet">
      <h2 className="sheet__title">
            <Icon name="key" size={18} className="icon--lead" />
            {all ? t('dev.keys.all') : t('dev.keys.title')}
          </h2>
      <p className="sheet__hint">{all ? t('dev.keys.allHint') : t('dev.keys.hint')}</p>
      {keys && keys.length > 0 && (
        <ul className="keylist">
          {keys.map((k) => (
            <KeyRow key={k.id} k={k} owner={all ? nameOf(k.userId) : undefined} onRevoke={() => setRevoking(k)} />
          ))}
        </ul>
      )}
      {keys && !keys.length && <p className="muted">{t('dev.keys.none')}</p>}
      {!all && (
        <div className="toolbar" style={{ marginTop: 12 }}>
          <button className="btn" onClick={() => setMaking(true)}>
            {t('dev.keys.new')}
          </button>
          <a className="btn btn--quiet" href={docsHref(`${locale}/api-keys`)} {...docsLink}>
            {t('dev.docs')}
          </a>
        </div>
      )}
      {making && <NewKey readOnlySeat={readOnlySeat} onClose={() => setMaking(false)} onMade={load} />}
      {revoking && (
        <Confirm
          title={t('dev.keys.revokeTitle', { name: revoking.name })}
          body={t('dev.keys.revokeBody')}
          confirmLabel={t('dev.keys.revoke')}
          danger
          onClose={() => setRevoking(null)}
          onConfirm={async () => {
            try {
              await del(`/dev/keys/${revoking.id}`);
              toast(t('dev.keys.revoked'));
              await load();
            } catch (e) {
              fail(e);
            }
            setRevoking(null);
          }}
        />
      )}
    </section>
  );
}

function NewKey({ readOnlySeat, onClose, onMade }: { readOnlySeat: boolean; onClose: () => void; onMade: () => void }) {
  const { t } = useI18n();
  const fail = useFail();
  const [name, setName] = useState('');
  const [canWrite, setCanWrite] = useState(false);
  const [days, setDays] = useState<number | null>(90);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await post<{ token: string }>('/dev/keys', { name: name.trim() || t('dev.keys.key'), canWrite, expiresInDays: days });
      setToken(r.token);
      onMade();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };
  if (token) {
    return (
      <Dialog
        title={t('dev.keys.new')}
        onClose={onClose}
        footer={
          <button className="btn btn--primary" onClick={onClose}>
            {t('dev.done')}
          </button>
        }
      >
        <ShowOnce value={token} note={t('dev.keys.copyNow')} />
      </Dialog>
    );
  }
  return (
    <Dialog
      title={t('dev.keys.new')}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--quiet" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn btn--primary" form="newkey" disabled={busy}>
            <Icon name="plus" size={16} />
            {t('dev.keys.create')}
          </button>
        </>
      }
    >
      <form id="newkey" className="form" onSubmit={submit}>
        <label className="field">
          <span className="field__label">{t('dev.keys.name')}</span>
          <input className="input" value={name} maxLength={80} placeholder={t('dev.keys.namePh')} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={canWrite} disabled={readOnlySeat} onChange={(e) => setCanWrite(e.target.checked)} />
          <span>{t('dev.keys.write')}</span>
        </label>
        <span className="field__hint">{readOnlySeat ? t('connect.viewer') : t('dev.keys.writeHint')}</span>
        <label className="field">
          <span className="field__label">{t('dev.keys.expires')}</span>
          <select className="select" value={days ?? ''} onChange={(e) => setDays(e.target.value ? Number(e.target.value) : null)}>
            {[30, 90, 365].map((n) => (
              <option key={n} value={n}>
                {t('dev.keys.days', { n })}
              </option>
            ))}
            <option value="">{t('dev.keys.never')}</option>
          </select>
        </label>
      </form>
    </Dialog>
  );
}

// ------------------------------------------------------------------ webhooks

/** Settings → Developers: webhooks, the company's keys and where the docs are. */
export function DeveloperTab() {
  const { t, words, locale } = useI18n();
  const { can, toast } = useStore();
  const fail = useFail();
  const [hooks, setHooks] = useState<WebhookInfo[] | null>(null);
  const [making, setMaking] = useState(false);
  const [deleting, setDeleting] = useState<WebhookInfo | null>(null);
  const load = useCallback(() => get<{ webhooks: WebhookInfo[] }>('/dev/webhooks').then((r) => setHooks(r.webhooks)), []);
  useEffect(() => {
    if (can('connections.manage')) void load();
  }, [can, load]);
  const eventLabel = (e: string) => t(`dev.event.${e}` as any, { account: words.one });

  return (
    <div className="form" style={{ maxWidth: 760 }}>
      <section className="sheet">
        <h2 className="sheet__title">
            <Icon name="code" size={18} className="icon--lead" />
            {t('dev.api.title')}
          </h2>
        <p className="sheet__hint">{t('dev.api.hint')}</p>
        <dl className="kv">
          <dt>{t('dev.api.base')}</dt>
          <dd>
            <code>{`${location.origin}/api`}</code>
          </dd>
          <dt>{t('dev.ai.url')}</dt>
          <dd>
            <code>{`${location.origin}/mcp`}</code>
          </dd>
        </dl>
        <div className="toolbar">
          <a className="btn" href={docsHref(`${locale}/developers`)} {...docsLink}>
            {t('dev.docs')}
          </a>
          <a
            className="btn btn--quiet"
            href="/profile"
            onClick={(e) => {
              e.preventDefault();
              navigate('/profile');
            }}
          >
            {t('dev.api.myKeys')}
          </a>
        </div>
      </section>

      {can('connections.manage') && (
        <section className="sheet">
          <h2 className="sheet__title">
            <Icon name="send" size={18} className="icon--lead" />
            {t('dev.hooks.title')}
          </h2>
          <p className="sheet__hint">{t('dev.hooks.hint')}</p>
          {hooks && hooks.length > 0 && (
            <ul className="keylist">
              {hooks.map((h) => (
                <li key={h.id} className="keyrow">
                  <div className="keyrow__main">
                    <div className="keyrow__name">
                      <code>{h.url}</code> <span className={h.active ? 'badge badge--active' : 'badge'}>{h.active ? t('dev.hooks.on') : t('dev.hooks.off')}</span>
                    </div>
                    <div className="keyrow__meta">
                      {h.events.map(eventLabel).join(', ')}
                      {h.lastAt && <> · {t('dev.hooks.last', { status: h.lastStatus || '—', when: relativeTime(h.lastAt, t) })}</>}
                      {h.failures > 0 && <span className="warn"> · {t('dev.hooks.failing', { n: h.failures })}</span>}
                    </div>
                  </div>
                  <div className="toolbar">
                    <button
                      className="btn btn--small"
                      onClick={async () => {
                        try {
                          const r = await post<{ status: number; ok: boolean }>(`/dev/webhooks/${h.id}/test`);
                          toast(r.status === 0 ? t('dev.hooks.testNone') : r.ok ? t('dev.hooks.testOk', { status: r.status }) : t('dev.hooks.testFail', { status: r.status }), r.ok ? undefined : 'error');
                          await load();
                        } catch (e) {
                          fail(e);
                        }
                      }}
                    >
                      {t('dev.hooks.test')}
                    </button>
                    <button
                      className="btn btn--quiet btn--small"
                      onClick={async () => {
                        try {
                          await patch(`/dev/webhooks/${h.id}`, { active: !h.active });
                          await load();
                        } catch (e) {
                          fail(e);
                        }
                      }}
                    >
                      {h.active ? t('dev.hooks.pause') : t('dev.hooks.resume')}
                    </button>
                    <button className="btn btn--quiet btn--small" onClick={() => setDeleting(h)}>
                      {t('dev.hooks.delete')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {hooks && !hooks.length && <p className="muted">{t('dev.hooks.none')}</p>}
          <div className="toolbar" style={{ marginTop: 12 }}>
            <button className="btn" onClick={() => setMaking(true)}>
              {t('dev.hooks.new')}
            </button>
          </div>
          {making && <NewHook eventLabel={eventLabel} onClose={() => setMaking(false)} onMade={load} />}
          {deleting && (
            <Confirm
              title={t('dev.hooks.deleteTitle')}
              body={t('dev.hooks.deleteBody', { url: deleting.url })}
              confirmLabel={t('dev.hooks.delete')}
              danger
              onClose={() => setDeleting(null)}
              onConfirm={async () => {
                try {
                  await del(`/dev/webhooks/${deleting.id}`);
                  await load();
                } catch (e) {
                  fail(e);
                }
                setDeleting(null);
              }}
            />
          )}
        </section>
      )}

      {can('connections.manage') && <InboundTickets />}
      {can('users.manage') && <KeyList all />}
    </div>
  );
}

/** Any support tool that can send a web request: an address to post tickets to. */
function InboundTickets() {
  const { t, locale } = useI18n();
  const fail = useFail();
  const [info, setInfo] = useState<{ enabled: boolean; prefix: string | null; createdAt: string | null; lastAt: string | null } | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [off, setOff] = useState(false);
  const load = useCallback(() => get<NonNullable<typeof info>>('/dev/inbound').then(setInfo), []);
  useEffect(() => {
    void load();
  }, [load]);
  const make = async () => {
    try {
      const r = await post<{ url: string }>('/dev/inbound');
      setUrl(r.url);
      await load();
    } catch (e) {
      fail(e);
    }
  };
  return (
    <section className="sheet">
      <h2 className="sheet__title">
            <Icon name="inbox" size={18} className="icon--lead" />
            {t('inbound.title')}
          </h2>
      <p className="sheet__hint">{t('inbound.hint')}</p>
      {url && <ShowOnce value={url} note={t('inbound.copyNow')} />}
      {info && !url && (
        <p className="field__hint">
          {info.enabled ? t('inbound.on', { prefix: info.prefix ?? '', when: info.lastAt ? relativeTime(info.lastAt, t) : t('dev.keys.unused') }) : t('inbound.off')}
        </p>
      )}
      <pre className="example">{`POST …/api/inbound/tickets/<token>
{
  "source": "my-helpdesk",
  "externalId": "4711",
  "subject": "Export fails",
  "status": "open",
  "priority": "high",
  "requester": "selin@quillfield.example",
  "url": "https://help.example.com/t/4711"
}`}</pre>
      <div className="toolbar" style={{ marginTop: 10 }}>
        <button className="btn" onClick={make}>
          {info?.enabled ? t('inbound.rotate') : t('inbound.create')}
        </button>
        {info?.enabled && (
          <button className="btn btn--quiet" onClick={() => setOff(true)}>
            {t('inbound.disable')}
          </button>
        )}
        <a className="btn btn--quiet" href={docsHref(`${locale}/connect-your-own-tool`)} {...docsLink}>
          {t('dev.docs')}
        </a>
      </div>
      {off && (
        <Confirm
          title={t('inbound.disableTitle')}
          body={t('inbound.disableBody')}
          confirmLabel={t('inbound.disable')}
          danger
          onClose={() => setOff(false)}
          onConfirm={async () => {
            try {
              await del('/dev/inbound');
              setUrl(null);
              await load();
            } catch (e) {
              fail(e);
            }
            setOff(false);
          }}
        />
      )}
    </section>
  );
}

function NewHook({ eventLabel, onClose, onMade }: { eventLabel: (e: string) => string; onClose: () => void; onMade: () => void }) {
  const { t } = useI18n();
  const fail = useFail();
  const [url, setUrl] = useState('https://');
  const [events, setEvents] = useState<string[]>(['task.created', 'task.updated']);
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await post<{ secret: string }>('/dev/webhooks', { url: url.trim(), events });
      setSecret(r.secret);
      onMade();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };
  if (secret) {
    return (
      <Dialog
        title={t('dev.hooks.new')}
        onClose={onClose}
        footer={
          <button className="btn btn--primary" onClick={onClose}>
            {t('dev.done')}
          </button>
        }
      >
        <ShowOnce value={secret} note={t('dev.hooks.secretNow')} />
      </Dialog>
    );
  }
  return (
    <Dialog
      title={t('dev.hooks.new')}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--quiet" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn btn--primary" form="newhook" disabled={busy || !events.length}>
            <Icon name="plus" size={16} />
            {t('dev.hooks.create')}
          </button>
        </>
      }
    >
      <form id="newhook" className="form" onSubmit={submit}>
        <label className="field">
          <span className="field__label">{t('dev.hooks.url')}</span>
          <input className="input" type="url" required value={url} maxLength={500} onChange={(e) => setUrl(e.target.value)} />
        </label>
        <fieldset className="field">
          <legend className="field__label">{t('dev.hooks.events')}</legend>
          {WEBHOOK_EVENTS.map((ev) => (
            <label key={ev} className="checkbox">
              <input type="checkbox" checked={events.includes(ev)} onChange={(e) => setEvents(e.target.checked ? [...events, ev] : events.filter((x) => x !== ev))} />
              <span>{eventLabel(ev)}</span>
            </label>
          ))}
        </fieldset>
      </form>
    </Dialog>
  );
}

// ------------------------------------------------------------ consent screen

/** An app or AI assistant asks to act as this person: allow or decline. */
export function ConnectAiPage() {
  const { t } = useI18n();
  const { me } = useStore();
  const fail = useFail();
  const req = new URLSearchParams(location.search).get('req') ?? '';
  const [info, setInfo] = useState<{ app: string; redirectHost: string; write: boolean; canWrite: boolean } | 'expired' | null>(null);
  const [write, setWrite] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    get<{ app: string; redirectHost: string; write: boolean; canWrite: boolean }>(`/oauth/request?req=${encodeURIComponent(req)}`)
      .then(setInfo)
      .catch(() => setInfo('expired'));
  }, [req]);
  const answer = async (allow: boolean) => {
    if (info === null || info === 'expired') return;
    setBusy(true);
    try {
      const r = await post<{ redirect: string }>('/oauth/approve', { req, allow, write: allow && info.write && info.canWrite && write });
      location.href = r.redirect;
    } catch (e) {
      fail(e);
      setBusy(false);
    }
  };
  return (
    <div className="page">
      <div className="consent">
        {info === null && <p className="muted">…</p>}
        {info === 'expired' && <p>{t('connect.expired')}</p>}
        {info && info !== 'expired' && (
          <>
            <h1 className="consent__title">{t('connect.title', { app: info.app })}</h1>
            <p>{t('connect.lead', { app: info.app, name: me.user.name })}</p>
            <ul className="consent__list">
              <li>{t('connect.can.read')}</li>
              {info.write && info.canWrite && write && <li>{t('connect.can.write')}</li>}
            </ul>
            {info.write && info.canWrite && (
              <label className="checkbox">
                <input type="checkbox" checked={write} onChange={(e) => setWrite(e.target.checked)} />
                <span>{t('connect.allowWrite')}</span>
              </label>
            )}
            {info.write && !info.canWrite && <p className="field__hint">{t('connect.viewer')}</p>}
            <p className="field__hint">
              {t('connect.back', { host: info.redirectHost })} {t('connect.revokeLater')}
            </p>
            <div className="toolbar" style={{ marginTop: 16 }}>
              <button className="btn btn--primary" disabled={busy} onClick={() => answer(true)}>
                {t('connect.allow')}
              </button>
              <button className="btn btn--quiet" disabled={busy} onClick={() => answer(false)}>
                {t('connect.deny')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Signing in on the way to the consent screen comes back to it, even from
// the email link opened in another tab.
const RETURN = 'app-after-login';
export function rememberReturn(to: string) {
  try {
    localStorage.setItem(RETURN, JSON.stringify({ to, exp: Date.now() + 20 * 60_000 }));
  } catch {
    /* no storage: the person starts again from the app */
  }
}
export function takeReturn(): string | null {
  try {
    const raw = localStorage.getItem(RETURN);
    localStorage.removeItem(RETURN);
    const v = raw ? (JSON.parse(raw) as { to: string; exp: number }) : null;
    return v && v.exp > Date.now() && v.to.startsWith('/connect-ai?') ? v.to : null;
  } catch {
    return null;
  }
}
