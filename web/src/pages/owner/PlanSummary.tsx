// Plan & targets → Monday summary: the weekly CEO e-mail (on or off, its
// language, when the next one goes, a preview of it as it would be written now,
// and a try that sends it at once) and the owner's phones for alerts — urgent
// help requests, system alerts and the summary itself — by Web Push, free
// through the browser's own push service (api/src/lib/webpush.ts). Turkish and
// English only. Data: GET /api/desk/owner/summary and /owner/push.
import { useState } from 'react';
import { LOCALE_INFO } from '../../../../shared/src/i18n';
import type { CeoSummaryPreview, OwnerPushState } from '../../../../shared/src/ownerPlan';
import { EmptyState } from '../../components/Empty';
import { Icon } from '../../components/icons';
import { formatDate } from '../../lib/format';
import { useI18n } from '../../lib/i18n';
import { relativeTime } from '../../lib/time';
import { api, Loading, useData, useOwnerWords } from './shared';

type Failed = (e: unknown) => void;

/** The summary and the phones, side by side on a desktop, stacked on a phone. */
export function SummaryView({ beat, failed }: { beat: number; failed: Failed }) {
  return (
    <div className="occols occols--plan">
      <SummaryCard beat={beat} failed={failed} />
      <PhonesCard beat={beat} failed={failed} />
    </div>
  );
}

function SummaryCard({ beat, failed }: { beat: number; failed: Failed }) {
  const { o, locale } = useOwnerWords();
  const { t } = useI18n();
  const { data, error, reload, setData } = useData<CeoSummaryPreview>('/owner/summary', beat, failed);
  const [sent, setSent] = useState<string | null>(null);
  const change = async (patch: { enabled?: boolean; locale?: 'tr' | 'en' }) => {
    try {
      setData(await api<CeoSummaryPreview>('PUT', '/owner/summary', patch));
    } catch (err) {
      failed(err);
    }
  };
  const test = async () => {
    try {
      const a = await api<{ queued: boolean; to: string }>('POST', '/owner/summary/test');
      setSent(a.queued ? o('summary.testSent', { to: a.to }) : o('summary.testWait'));
    } catch (err) {
      failed(err);
    }
  };
  return (
    <section className="ccard" aria-labelledby="oc-summary">
      <h2 className="ccard__title" id="oc-summary">
        <Icon name="mail" size={14} />
        {o('summary.title')}
      </h2>
      <Loading data={data} error={error} reload={reload}>
        {(d) => (
          <>
            <p className="oc__muted">{o('summary.body')}</p>
            <div className="ocsettings">
              <label className="occheck">
                <input type="checkbox" checked={d.settings.enabled} onChange={(e) => void change({ enabled: e.target.checked })} />
                <span>{o('summary.enabled')}</span>
              </label>
              <label>
                {o('summary.locale')}
                <select className="input" value={d.settings.locale} onChange={(e) => void change({ locale: e.target.value as 'tr' | 'en' })}>
                  {(['tr', 'en'] as const).map((l) => (
                    <option key={l} value={l}>
                      {LOCALE_INFO[l].name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="oc__muted" role="status">
              {d.settings.enabled ? o('summary.next', { at: formatDate(d.nextAt, locale, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) }) : o('summary.off')}
              {d.lastSentAt ? ` · ${o('summary.last', { ago: relativeTime(d.lastSentAt, t) })}` : ''}
              {d.to ? ` · ${o('summary.to', { to: d.to })}` : ''}
            </p>
            <div className="ocbuttons">
              <button type="button" className="btn btn--small" disabled={!d.to} onClick={() => void test()}>
                <Icon name="send" size={14} />
                {o('summary.test')}
              </button>
              {sent ? <span className="oc__muted" role="status">{sent}</span> : null}
            </div>
            <figure className="ocmail">
              <figcaption>
                <span className="oc__muted">{o('summary.preview')}</span>
                <strong>{d.subject}</strong>
              </figcaption>
              <pre className="ocmail__text">{d.text}</pre>
            </figure>
          </>
        )}
      </Loading>
    </section>
  );
}

/** base64url → bytes, for the server's public key in PushManager.subscribe(). */
function keyBytes(b64u: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64u.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64u.length + 3) % 4));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
/** A name for this device the owner recognises in the list: browser family and phone or computer. */
function deviceLabel(): string {
  const ua = navigator.userAgent;
  const what = /iphone|ipad/i.test(ua) ? 'iPhone / iPad' : /android/i.test(ua) ? 'Android' : /mac/i.test(ua) ? 'Mac' : /windows/i.test(ua) ? 'Windows' : 'Browser';
  const browser = /edg\//i.test(ua) ? 'Edge' : /firefox/i.test(ua) ? 'Firefox' : /chrome|crios/i.test(ua) ? 'Chrome' : /safari/i.test(ua) ? 'Safari' : '';
  return `${what}${browser ? ` · ${browser}` : ''}`;
}

function PhonesCard({ beat, failed }: { beat: number; failed: Failed }) {
  const { o, locale } = useOwnerWords();
  const { t } = useI18n();
  const { data, error, reload, setData } = useData<OwnerPushState>('/owner/push', beat, failed);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const add = async (publicKey: string) => {
    setNote(null);
    if (!pushSupported()) return setNote(o('push.unsupported'));
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return setNote(o('push.denied'));
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register('/sw.js'));
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
      const j = sub.toJSON();
      setData(await api<OwnerPushState>('POST', '/owner/push/devices', { endpoint: j.endpoint, keys: j.keys, label: deviceLabel() }));
      setNote(o('push.added'));
    } catch (err) {
      failed(err);
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id: string) => {
    try {
      setData(await api<OwnerPushState>('DELETE', `/owner/push/devices/${id}`));
    } catch (err) {
      failed(err);
    }
  };
  const test = async () => {
    try {
      setData(await api<OwnerPushState>('POST', '/owner/push/test'));
      setNote(o('push.testSent'));
    } catch (err) {
      failed(err);
    }
  };
  return (
    <section className="ccard" aria-labelledby="oc-phones">
      <h2 className="ccard__title" id="oc-phones">
        <Icon name="phone" size={14} />
        {o('push.title')}
      </h2>
      <Loading data={data} error={error} reload={reload}>
        {(d) =>
          !d.configured ? (
            <EmptyState compact icon="phone" title={o('push.off.title')} body={o('push.off.body')} />
          ) : (
            <>
              <p className="oc__muted">{o('push.body')}</p>
              {d.devices.length ? (
                <ul className="oclist">
                  {d.devices.map((x) => (
                    <li key={x.id}>
                      <span className="oclist__main">
                        <span>{x.label || o('push.unnamed')}</span>
                        <span className="oc__muted">
                          {o('push.since', { date: formatDate(x.createdAt, locale, { day: 'numeric', month: 'short', year: 'numeric' }) })}
                          {x.lastOkAt ? ` · ${o('push.lastOk', { ago: relativeTime(x.lastOkAt, t) })}` : ''}
                          {x.failures ? ` · ${o('push.failures', { n: x.failures })}` : ''}
                        </span>
                      </span>
                      <button type="button" className="btn btn--small btn--quiet" onClick={() => void remove(x.id)}>
                        <Icon name="trash" size={14} />
                        {o('push.remove')}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState compact icon="bell" title={o('push.none.title')} body={o('push.none.body')} />
              )}
              <div className="ocbuttons">
                <button type="button" className="btn btn--primary btn--small" disabled={busy} aria-busy={busy || undefined} onClick={() => void add(d.publicKey!)}>
                  <Icon name="bell" size={14} />
                  {o('push.add')}
                </button>
                {d.devices.length ? (
                  <button type="button" className="btn btn--small" onClick={() => void test()}>
                    <Icon name="send" size={14} />
                    {o('push.test')}
                  </button>
                ) : null}
              </div>
              {note ? (
                <p className="oc__muted" role="status">
                  {note}
                </p>
              ) : null}
            </>
          )
        }
      </Loading>
    </section>
  );
}
