// A person's own setup: on first sign-in (Welcome) and later (Profile) —
// name, language, where notifications go, the morning summary and a
// calendar feed. One minute, no administrator needed.
import { useEffect, useState } from 'react';
import type { Locale, MessageKey } from '../../../shared/src/i18n';
import { NOTIFY_EVENTS, type DeliveryOption, type NotifyPrefs } from '../../../shared/src/model';
import { PROVIDER_NAMES } from '../components/Connections';
import { ApiFailure, del, get, patch, post } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { navigate } from '../lib/router';
import { useStore } from '../lib/store';

export function PersonalPage({ mode, onLocale }: { mode: 'welcome' | 'profile'; onLocale: (l: Locale) => void }) {
  const { t, locale } = useI18n();
  const { me, boards, reloadMe, reloadPeople, toast } = useStore();
  const [name, setName] = useState(me.user.name);
  const [prefs, setPrefs] = useState<NotifyPrefs>(me.user.prefs);
  const [options, setOptions] = useState<DeliveryOption[]>([]);
  const [calendar, setCalendar] = useState<{ enabled: boolean; url?: string }>({ enabled: false });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void get<{ options: DeliveryOption[] }>('/me/delivery').then((r) => setOptions(r.options));
    void get<{ enabled: boolean }>('/me/calendar').then((r) => setCalendar(r));
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      await patch('/me', { name: name.trim() || me.user.name, prefs, ...(mode === 'welcome' ? { onboarded: true } : {}) });
      await reloadMe();
      await reloadPeople();
      if (mode === 'welcome') navigate('/my', true);
      else toast(t('common.saved'));
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const makeCalendar = async () => {
    const r = await post<{ url: string }>('/me/calendar', {});
    setCalendar({ enabled: true, url: r.url });
  };
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(t('me.copied'));
    } catch {
      /* the field is selectable as a fallback */
    }
  };
  const chat = options.filter((o) => o.provider !== 'email');
  const auto = prefs.channel === 'auto';
  const autoTarget = chat.find((o) => o.linked);

  return (
    <>
      <header className="topbar">
        <h1 className="topbar__title">{mode === 'welcome' ? t('me.welcome', { name: me.user.name.split(' ')[0] }) : t('me.title')}</h1>
        {mode === 'welcome' && <span className="topbar__sub">{t('me.welcomeSub', { org: me.org.name })}</span>}
      </header>
      <div className="page">
        <div className="form" style={{ maxWidth: 680 }}>
          <section className="sheet">
            <h2 className="sheet__title">{t('me.you')}</h2>
            <div className="form__row">
              <label className="field">
                <span className="field__label">{t('me.name')}</span>
                <input className="input" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
              </label>
              <div className="field">
                <span className="field__label">{t('me.language')}</span>
                <div className="seg">
                  {(['tr', 'en'] as Locale[]).map((l) => (
                    <button key={l} type="button" aria-pressed={locale === l} onClick={() => onLocale(l)}>
                      {l === 'tr' ? 'Türkçe' : 'English'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="sheet">
            <h2 className="sheet__title">{t('me.where')}</h2>
            <p className="sheet__hint">{t('me.whereHint')}</p>
            <div className="choice-list" role="radiogroup" aria-label={t('me.where')}>
              <label className="choice" data-on={auto ? 'true' : undefined}>
                <input type="radio" name="channel" checked={auto} onChange={() => setPrefs({ ...prefs, channel: 'auto' })} />
                <span>
                  <strong>{t('me.channel.auto')}</strong>
                  <span className="muted">{autoTarget ? t('me.channel.autoNow', { app: PROVIDER_NAMES[autoTarget.provider] }) : t('me.channel.autoEmail')}</span>
                </span>
              </label>
              {chat.map((o) => (
                <label key={o.id} className="choice" data-on={prefs.channel === o.id ? 'true' : undefined} data-disabled={o.linked ? undefined : 'true'}>
                  <input type="radio" name="channel" disabled={!o.linked && o.provider !== 'slack'} checked={prefs.channel === o.id} onChange={() => setPrefs({ ...prefs, channel: o.id })} />
                  <span>
                    <strong>
                      {PROVIDER_NAMES[o.provider]} · {o.label}
                    </strong>
                    <span className="muted">{o.linked ? t('me.channel.linked') : t(`me.channel.link.${o.provider}` as MessageKey)}</span>
                  </span>
                </label>
              ))}
              <label className="choice" data-on={prefs.channel === 'email' ? 'true' : undefined}>
                <input type="radio" name="channel" checked={prefs.channel === 'email'} onChange={() => setPrefs({ ...prefs, channel: 'email' })} />
                <span>
                  <strong>{t('me.channel.email')}</strong>
                  <span className="muted">{me.user.email}</span>
                </span>
              </label>
              <label className="choice" data-on={prefs.channel === 'none' ? 'true' : undefined}>
                <input type="radio" name="channel" checked={prefs.channel === 'none'} onChange={() => setPrefs({ ...prefs, channel: 'none' })} />
                <span>
                  <strong>{t('me.channel.none')}</strong>
                  <span className="muted">{t('me.channel.noneHint')}</span>
                </span>
              </label>
            </div>

            <h3 className="section__head" style={{ marginTop: 18 }}>
              {t('me.what')}
            </h3>
            <div className="perms">
              {NOTIFY_EVENTS.map((ev) => (
                <label key={ev} className="checkbox">
                  <input type="checkbox" checked={prefs.events[ev] !== false} onChange={(e) => setPrefs({ ...prefs, events: { ...prefs.events, [ev]: e.target.checked } })} />
                  <span>{t(`me.event.${ev}` as MessageKey)}</span>
                </label>
              ))}
            </div>
            {prefs.events.digest !== false && (
              <label className="field" style={{ marginTop: 12, maxWidth: 260 }}>
                <span className="field__label">{t('me.digestAt')}</span>
                <select className="select" value={prefs.digestHour} onChange={(e) => setPrefs({ ...prefs, digestHour: Number(e.target.value) })}>
                  {[6, 7, 8, 9, 10, 11, 12].map((h) => (
                    <option key={h} value={h}>
                      {`${String(h).padStart(2, '0')}:00`}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <fieldset className="field plain-fieldset quiet-hours">
              <label className="checkbox">
                <input type="checkbox" checked={!!prefs.quiet} onChange={(e) => setPrefs({ ...prefs, quiet: e.target.checked ? { from: 20, to: 8 } : null })} />
                <span>{t('me.quiet')}</span>
              </label>
              {prefs.quiet && (
                <div className="quiet-hours__range">
                  <select className="select" value={prefs.quiet.from} aria-label={t('me.quietFrom')} onChange={(e) => setPrefs({ ...prefs, quiet: { ...prefs.quiet!, from: Number(e.target.value) } })}>
                    {Array.from({ length: 24 }, (_, h) => (
                      <option key={h} value={h}>{`${String(h).padStart(2, '0')}:00`}</option>
                    ))}
                  </select>
                  <span aria-hidden="true">–</span>
                  <select className="select" value={prefs.quiet.to} aria-label={t('me.quietTo')} onChange={(e) => setPrefs({ ...prefs, quiet: { ...prefs.quiet!, to: Number(e.target.value) } })}>
                    {Array.from({ length: 24 }, (_, h) => (
                      <option key={h} value={h}>{`${String(h).padStart(2, '0')}:00`}</option>
                    ))}
                  </select>
                </div>
              )}
              <span className="field__hint">{t('me.quietHint')}</span>
            </fieldset>
            <label className="field" style={{ marginTop: 12, maxWidth: 360 }}>
              <span className="field__label">{t('me.defaultBoard')}</span>
              <select className="select" value={prefs.defaultBoardId ?? ''} onChange={(e) => setPrefs({ ...prefs, defaultBoardId: e.target.value || null })}>
                <option value="">{t('me.defaultBoardAuto')}</option>
                {boards.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <span className="field__hint">{t('me.defaultBoardHint')}</span>
            </label>
          </section>

          <section className="sheet">
            <h2 className="sheet__title">{t('me.calendar')}</h2>
            <p className="sheet__hint">{t('me.calendarHint')}</p>
            {calendar.url ? (
              <>
                <div className="toolbar">
                  <input className="input" readOnly value={calendar.url} style={{ flex: 1, minWidth: 240 }} onFocus={(e) => e.target.select()} aria-label={t('me.calendar')} />
                  <button className="btn" onClick={() => copy(calendar.url!)}>
                    {t('me.copy')}
                  </button>
                </div>
                <p className="field__hint">{t('me.calendarHow')}</p>
              </>
            ) : (
              <div className="toolbar">
                <button className="btn" onClick={makeCalendar}>
                  {calendar.enabled ? t('me.calendarNew') : t('me.calendarMake')}
                </button>
                {calendar.enabled && (
                  <button
                    className="btn btn--quiet"
                    onClick={async () => {
                      await del('/me/calendar');
                      setCalendar({ enabled: false });
                    }}
                  >
                    {t('me.calendarOff')}
                  </button>
                )}
              </div>
            )}
          </section>

          {mode === 'profile' && (
            <section className="sheet">
              <h2 className="sheet__title">{t('devices.title')}</h2>
              <p className="sheet__hint">{t('devices.hint', { max: me.org.maxDevices })}</p>
              <a
                className="btn"
                href="/devices"
                onClick={(e) => {
                  e.preventDefault();
                  navigate('/devices');
                }}
              >
                {t('me.devicesOpen')}
              </a>
            </section>
          )}

          <div className="wizard__nav">
            <button className="btn btn--primary" disabled={busy} onClick={save}>
              {mode === 'welcome' ? t('me.start') : t('common.save')}
            </button>
            {mode === 'welcome' && <span className="field__hint">{t('me.changeLater')}</span>}
          </div>
        </div>
      </div>
    </>
  );
}
