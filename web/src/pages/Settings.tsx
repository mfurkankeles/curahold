// Company settings: the company itself, people (with devices and the
// KVKK/GDPR tools), teams, roles and the activity log.
import { DepartmentsTab } from '../components/Departments';
import { Icon, PageIcon } from '../components/icons';
import { Fragment, useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { accountWords, helpLanguageOf, LOCALE_INFO, LOCALES, translate, type Locale, type MessageKey } from '../../../shared/src/i18n';
import { SETTINGS_HELP } from '../../../shared/src/helpLinks';
import { docsHref, docsLink } from '../lib/docs';
import { LOGO_TYPES, MAX_LOGO_KB, type AdminUser, type AuditEntry, type JoinRequest, type Role, type SessionInfo } from '../../../shared/src/model';
import { AccountFieldsEditor, RecordTypesEditor } from '../components/AccountFields';
import { SourceDetail, Sources } from '../components/Sources';
import { AutomationList } from '../components/Automations';
import { Connections } from '../components/Connections';
import { DeveloperTab } from '../components/Developer';
import { AnalyticsTab } from '../components/Analytics';
import { HealthSettings } from '../components/Timeline';
import { RhythmSettings } from '../components/Rhythm';
import { BillingSettings } from '../components/Billing';
import { SsoSettings } from '../components/SsoSettings';
import { CompanySecurity } from '../components/CompanySecurity';
import { CompanyDeletion } from '../components/CompanyDeletion';
import { PrivacyRequests } from '../components/PrivacyRequests';
import { AuditExport } from '../components/AuditExport';
import { CurrencySettings } from '../components/Currencies';
import { PlaybooksSettings } from '../components/Plans';
import { SupportAccessSettings } from '../components/Help';
import { PortalSettingsTab } from '../components/PortalAdmin';
import { SetupWarnings } from '../components/SetupWarnings';
import { AccessDialog, RolesTab } from '../components/Roles';
import { Avatar, Confirm, Dialog, Mark, PeoplePicker, RowMenu } from '../components/ui';
import { ApiFailure, del, get, patch, post } from '../lib/api';
import { allCurrencies, useMoney } from '../lib/money';
import { useI18n } from '../lib/i18n';
import { nameIt, navigate, navigateFresh, setBeforeLeave } from '../lib/router';
import { useSaver } from '../lib/saver';
import { useUndo } from '../lib/undo';
import { useDeleteLater } from '../lib/deleteLater';
import { formatDateTime, formatMoney } from '../lib/format';
import { useStore } from '../lib/store';
import { relativeTime } from '../lib/time';
import { EmptyState, ErrorState, NotAllowed, SkeletonRows } from '../components/Empty';
import { FilterGroup, FilterSheet, usePhone } from '../components/FilterSheet';
import { forgetUnsaved, hasUnsaved, useUnsaved, useUnsavedForm } from '../lib/unsaved';
import { fold, groupLabel, SETTINGS_GROUPS, SETTINGS_TOPICS, topicAbout, topicLabel, topicMatches, type SettingsTab } from '../lib/settingsIndex';
import '../surfaces/admin.css';
import '../surfaces/admin-2.css';
import { AssistantSettings } from '../components/AssistantSettings';

// The admin area: one topic per screen. A wide screen has the topics on the
// left (with a search on top) and the topic on the right; a phone has the
// list of topics at /settings and one topic per screen under it.
export function SettingsPage({ tab, sub }: { tab: SettingsTab | null; sub?: string }) {
  const { t, words, locale } = useI18n();
  const { can, me } = useStore();
  const phone = usePhone();
  const [q, setQ] = useState('');
  const allowed = SETTINGS_TOPICS.filter((x) => x.allowed(can, !!me.org.billingOn));
  // A topic that exists but is not this person's to open says so (and who can grant it) instead of showing another one.
  // A topic this workspace does not use (billing switched off) is not a missing permission: an administrator
  // must not be told to ask an administrator.
  const unused = !!tab && SETTINGS_TOPICS.some((x) => x.key === tab && x.allowed(can, true) && !x.allowed(can, !!me.org.billingOn));
  const refused = !allowed.length || (SETTINGS_TOPICS.some((x) => x.key === tab) && !allowed.some((x) => x.key === tab));
  const listOnly = phone && !allowed.some((x) => x.key === tab) && !refused;
  const current: SettingsTab | null = allowed.find((x) => x.key === tab)?.key ?? (listOnly ? null : (allowed[0]?.key ?? null));
  // A topic that cannot be shown keeps its own name on top, not the name of the one shown in its place.
  const asked = refused && tab && SETTINGS_TOPICS.some((x) => x.key === tab) ? tab : current;
  const currentLabel = asked ? topicLabel(t, words, asked) : '';
  // The way back to here says which settings, not just "Settings".
  useEffect(() => {
    if (current) nameIt(`/settings/${current}`, currentLabel);
  }, [current, currentLabel]);

  // Unsaved changes: one bar while there are some, and a question before leaving the topic.
  const unsaved = useUnsavedForm();
  const [leaving, setLeaving] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setBeforeLeave((to) => {
      if (!hasUnsaved() || to.split('?')[0] === location.pathname) return true;
      setLeaving(to);
      return false;
    });
    return () => setBeforeLeave(null);
  }, []);
  const saveNow = async () => {
    if (!unsaved || saving) return false;
    setSaving(true);
    try {
      return await unsaved.save();
    } finally {
      setSaving(false);
    }
  };

  const go = (key: SettingsTab | null) => navigateFresh(key ? `/settings/${key}` : '/settings');
  const found = q.trim() ? allowed.filter((x) => topicMatches(t, words, x.key, q)) : allowed;
  const nav = (
    <nav className="admin__nav" aria-label={t('settings.title')}>
      <div className="admin__search">
        <Icon name="search" size={16} />
        <input
          type="search"
          className="input"
          value={q}
          placeholder={t('settings.search')}
          aria-label={t('settings.search')}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && found[0]) {
              e.preventDefault();
              setQ('');
              go(found[0].key);
            }
            if (e.key === 'Escape' && q) {
              e.preventDefault();
              setQ('');
            }
          }}
        />
      </div>
      {SETTINGS_GROUPS.map((g) => {
        const items = found.filter((x) => x.group === g);
        if (!items.length) return null;
        return (
          <section className="admin__group" key={g} aria-labelledby={`admin-group-${g}`}>
            <h2 className="admin__grouplabel" id={`admin-group-${g}`}>
              {groupLabel(t, words, g)}
            </h2>
            <ul className="admin__links">
              {items.map(({ key, icon }) => (
                <li key={key}>
                  <a
                    href={`/settings/${key}`}
                    className="admin__link"
                    aria-current={key === current && !refused ? 'page' : undefined}
                    onClick={(e) => {
                      e.preventDefault();
                      go(key);
                    }}
                  >
                    <span className="admin__linkicon" aria-hidden="true">
                      <Icon name={icon} size={16} />
                    </span>
                    <span className="admin__linktext">
                      <span className="admin__linklabel">{topicLabel(t, words, key)}</span>
                      {(listOnly || q.trim()) && <span className="admin__linkabout">{topicAbout(t, key)}</span>}
                    </span>
                    {listOnly && <Icon name="chevronRight" size={16} className="admin__chev" />}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {q.trim() && !found.length && <p className="admin__none">{t('settings.searchNone', { q: q.trim() })}</p>}
    </nav>
  );

  return (
    <>
      <header className="topbar">
        {/* On a phone the topic's name is the title; the way back is the bar above it (BackBar: "← Settings"), one Back only. */}
        {phone && current ? (
          <h1 className="topbar__title admin__phonetitle">
            <span>{currentLabel}</span>
          </h1>
        ) : (
          <h1 className="topbar__title topbar__title--icon">
            <PageIcon name="sliders" />
            <span>{t('settings.title')}</span>
          </h1>
        )}
      </header>
      {!allowed.length ? (
        <div className="page">
          <NotAllowed />
        </div>
      ) : (
        <div className="page admin" data-list={listOnly || undefined}>
          {(!phone || listOnly) && nav}
          {current && (
            <div className="admin__content">
              {unused ? (
                <EmptyState icon="sliders" title={t('settings.unused.title', { topic: currentLabel })} body={t('settings.unused.body')}>
                  <button type="button" className="btn" onClick={() => go(null)}>
                    <Icon name="arrowLeft" size={16} />
                    {t('settings.backTo')}
                  </button>
                </EmptyState>
              ) : refused ? (
                <NotAllowed />
              ) : (
                <>
                  <header className="admin__head">
                    {!phone && <h2 className="admin__title">{currentLabel}</h2>}
                    <p className="admin__about">
                      {topicAbout(t, current)}
                      {SETTINGS_HELP[current] && (
                        <>
                          {' · '}
                          <a className="admin__help" href={`${docsHref(`${helpLanguageOf(locale)}/${SETTINGS_HELP[current].page}`)}${SETTINGS_HELP[current].anchor ? `#${SETTINGS_HELP[current].anchor}` : ''}`} {...docsLink}>
                            {t('settings.help')}
                          </a>
                        </>
                      )}
                    </p>
                  </header>
                  <SetupWarnings path={sub ? `/settings/${current}/${sub}` : `/settings/${current}`} />
                  {current === 'company' && <CompanyTab />}
                  {current === 'fields' && <AccountFieldsEditor />}
                  {current === 'records' && <RecordTypesEditor />}
                  {current === 'health' && <HealthSettings />}
                  {current === 'rhythm' && <RhythmSettings />}
                  {current === 'billing' && <BillingSettings />}
                  {current === 'currencies' && <CurrencySettings />}
                  {current === 'playbooks' && <PlaybooksSettings />}
                  {current === 'support' && (
                    <>
                      <SupportAccessSettings />
                      <AssistantSettings />
                    </>
                  )}
                  {current === 'portal' && <PortalSettingsTab />}
                  {current === 'people' && <PeopleTab />}
                  {current === 'joining' && <JoiningTab />}
                  {current === 'departments' && <DepartmentsTab />}
                  {current === 'teams' && <TeamsTab />}
                  {current === 'roles' && <RolesTab />}
                  {current === 'sso' && <SsoSettings />}
                  {current === 'signin' && <CompanySecurity />}
                  {current === 'connections' && <Connections />}
                  {current === 'sources' && (sub ? <SourceDetail id={sub} key={sub} /> : <Sources />)}
                  {current === 'automations' && <AutomationList />}
                  {current === 'developer' && <DeveloperTab />}
                  {current === 'analytics' && <AnalyticsTab />}
                  {current === 'audit' && <AuditTab />}
                  {current === 'errors' && <ErrorsTab />}
                </>
              )}
              {unsaved && (
                <div className="admin__unsaved" role="region" aria-label={t('settings.unsaved.bar')}>
                  <span className="admin__unsavedtext">
                    <span className="admin__unsaveddot" aria-hidden="true" />
                    {t('settings.unsaved.bar')}
                  </span>
                  <button type="button" className="btn btn--quiet" onClick={() => unsaved.discard()}>
                    <Icon name="trash" size={16} />
                    {t('settings.unsaved.discard')}
                  </button>
                  <button type="button" className="btn btn--primary" disabled={saving} onClick={() => void saveNow()}>
                    <Icon name="check" size={16} />
                    {t('common.save')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {leaving && (
        <Dialog
          title={t('settings.unsaved.title')}
          onClose={() => setLeaving(null)}
          footer={
            <>
              <button type="button" className="btn btn--quiet" onClick={() => setLeaving(null)}>
                <Icon name="close" size={16} />
                {t('settings.unsaved.stay')}
              </button>
              <button
                type="button"
                className="btn btn--danger"
                onClick={() => {
                  const to = leaving;
                  setLeaving(null);
                  unsaved?.discard();
                  forgetUnsaved();
                  navigate(to);
                }}
              >
                <Icon name="logout" size={16} />
                {t('settings.unsaved.leave')}
              </button>
            </>
          }
        >
          <p>{t('settings.unsaved.body', { topic: currentLabel })}</p>
        </Dialog>
      )}
    </>
  );
}

const TIMEZONES = ['Europe/Istanbul', 'Europe/London', 'Europe/Berlin', 'Europe/Amsterdam', 'Europe/Madrid', 'Europe/Warsaw', 'Asia/Dubai', 'Asia/Riyadh', 'Asia/Singapore', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'UTC'];

export const CURRENCIES = ['TRY', 'USD', 'EUR', 'GBP', 'CHF', 'AED', 'SAR', 'QAR', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'RON', 'CAD', 'AUD', 'SGD', 'INR', 'JPY', 'BRL', 'MXN', 'ZAR'];

function CompanyTab() {
  const { me, can } = useStore();
  return (
    <>
      <CompanyForm />
      {/* Deleting the company: administrators only (the server checks the same). */}
      {me?.user.roleKey === 'admin' && me.org.slug && <CompanyDeletion slug={me.org.slug} />}
      {/* The log of requests about personal data: privacy.manage only (the server and row security check the same). */}
      {can('privacy.manage') && <PrivacyRequests />}
    </>
  );
}

/** The company's own settings form (name, language, time zone, currency, week), also used during setup. */
export function CompanyForm({ onSaved, submitLabel }: { onSaved?: () => void; submitLabel?: string }) {
  const { t, locale: viewer } = useI18n();
  const { me, reloadMe, toast } = useStore();
  const offer = useUndo();
  const money = useMoney();
  // What is saved, and what is on screen: the difference is "unsaved", and its effect shows before saving.
  const savedForm = () => ({
    name: me.org.name,
    locale: me.org.locale,
    timezone: me.org.timezone,
    currency: me.org.currency,
    // Every language the product speaks, so a preset can fill them all and a save never drops one.
    terms: Object.fromEntries(LOCALES.map((l) => [l, { one: me.org.terms.account?.[l]?.one ?? '', other: me.org.terms.account?.[l]?.other ?? '' }])) as Record<Locale, { one: string; other: string }>,
  });
  type Form = ReturnType<typeof savedForm>;
  const [base, setBase] = useState<Form>(savedForm);
  const [form, setForm] = useState<Form>(base);
  const { name, locale, timezone: tz, currency, terms } = form;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setTerms = (v: Form['terms']) => set('terms', v);
  const dirty = JSON.stringify(form) !== JSON.stringify(base);
  const zones = TIMEZONES.includes(tz) ? TIMEZONES : [tz, ...TIMEZONES];
  const inSettings = !submitLabel;

  const body = (f: Form) => ({ name: f.name, locale: f.locale, timezone: f.timezone, currency: f.currency, terms: { account: f.terms } });
  async function save(): Promise<boolean> {
    const before = base;
    const now = form;
    try {
      await patch('/admin/org', body(now));
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
      return false;
    }
    setBase(now);
    await reloadMe();
    const topic = t('settings.tab.company');
    // Saved, with a way back for ten seconds: the old values go back the same way.
    if (inSettings)
      offer(t('settings.savedTopic', { topic }), async () => {
        await patch('/admin/org', body(before));
        setBase(before);
        setForm(before);
        await reloadMe();
      });
    else toast(t('common.saved'));
    onSaved?.();
    return true;
  }
  useUnsaved(inSettings && dirty, { save, discard: () => setForm(base) });

  async function submit(e: FormEvent) {
    e.preventDefault();
    await save();
  }
  // The words this company will see, in the language on screen (English otherwise).
  const shown = accountWords(viewer, { account: terms });
  // Typed words for English, the company's language and the reader's own; the presets fill every language.
  const typed = [...new Set<Locale>(['en', locale, viewer])];
  const word = (l: Locale, k: 'one' | 'other', label: string) => (
    <label className="field">
      <span className="field__label">{label}</span>
      <input className="input" maxLength={40} value={terms[l][k]} placeholder={accountWords(l)[k]} onChange={(e) => setTerms({ ...terms, [l]: { ...terms[l], [k]: e.target.value } })} />
    </label>
  );
  return (
    <form className="form" onSubmit={submit}>
      <LogoEditor />
      <div className="sheet">
        <div className="form">
          <label className="field">
            <span className="field__label">{t('settings.company.name')}</span>
            <input className="input" value={name} maxLength={120} onChange={(e) => set('name', e.target.value)} />
          </label>
          <div className="field">
            <span className="field__label">{t('settings.company.address')}</span>
            <span className="num">{location.host}</span>
          </div>
          <div className="form__row">
            <label className="field">
              <span className="field__label">{t('settings.company.language')}</span>
              <select className="select" value={locale} onChange={(e) => set('locale', e.target.value as Locale)}>
                {LOCALES.map((l) => (
                  <option key={l} value={l}>
                    {LOCALE_INFO[l].name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">{t('settings.company.timezone')}</span>
              <select className="select" value={tz} onChange={(e) => set('timezone', e.target.value)}>
                {zones.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="field u-max-width-360">
            <span className="field__label">{t('settings.company.currency')}</span>
            <select className="select" value={currency} onChange={(e) => set('currency', e.target.value)}>
              {(CURRENCIES.includes(currency) ? CURRENCIES : [currency, ...CURRENCIES]).map((c) => (
                <option key={c} value={c}>
                  {c} · {money.nameOf(c)}
                </option>
              ))}
              <option disabled>──────</option>
              {allCurrencies()
                .filter((c) => !CURRENCIES.includes(c) && c !== currency)
                .map((c) => (
                  <option key={c} value={c}>
                    {c} · {money.nameOf(c)}
                  </option>
                ))}
            </select>
            {/* The rates say what other currencies are worth in this one, so a new one starts them over. */}
            {currency !== me.org.currency && Object.keys(me.org.fx?.rates ?? {}).length > 0 && <span className="field__hint field__hint--warn">{t('fx.baseClears')}</span>}
          </label>
        </div>
      </div>
      <div className="sheet">
        <h2 className="sheet__title">
            <Icon name="edit" size={18} className="icon--lead" />
            {t('settings.company.vocabulary')}
          </h2>
        <p className="sheet__hint">{t('settings.company.vocabularyHint')}</p>
        <div className="field u-mb-12">
          <span className="field__label">{t('settings.company.vocabularyPick')}</span>
          <div className="rb-chips">
            {VOCAB.map((id) => {
              const of = (l: Locale) => ({ one: translate(l, `settings.vocab.${id}.one`), other: translate(l, `settings.vocab.${id}.other`) });
              return (
                <button key={id} type="button" className="rb-chip" aria-pressed={terms.en.one === of('en').one && terms[viewer].one === of(viewer).one} onClick={() => setTerms(Object.fromEntries(LOCALES.map((l) => [l, of(l)])) as Form['terms'])}>
                  {t(`settings.vocab.${id}.one`)}
                </button>
              );
            })}
          </div>
        </div>
        <p className="field__hint u-m-0-0-8">{t('settings.company.vocabularyOwn')}</p>
        <div className="form__row">
          {typed.flatMap((l) => [
            <Fragment key={`${l}-one`}>{word(l, 'one', `${LOCALE_INFO[l].name} · ${t('settings.company.singular')}`)}</Fragment>,
            <Fragment key={`${l}-other`}>{word(l, 'other', `${LOCALE_INFO[l].name} · ${t('settings.company.plural')}`)}</Fragment>,
          ])}
        </div>
      </div>
      {/* The effect of what is on screen, before it is saved. */}
      <section className="sheet admin-effect" aria-labelledby="company-effect" aria-live="polite">
        <h2 className="sheet__title" id="company-effect">
          <Icon name="eye" size={18} className="icon--lead" />
          {t('settings.company.effect')}
        </h2>
        <ul className="admin-effect__list">
          <li data-changed={tz !== base.timezone || undefined}>{t('settings.company.effectTime', { time: formatDateTime(new Date(), viewer, { weekday: 'long', hour: '2-digit', minute: '2-digit', timeZone: tz }) })}</li>
          <li data-changed={currency !== base.currency || undefined}>{t('settings.company.effectMoney', { amount: formatMoney(12500, currency, viewer) })}</li>
          <li data-changed={locale !== base.locale || undefined}>{t('settings.company.effectLanguage', { language: LOCALE_INFO[locale].name })}</li>
          <li data-changed={JSON.stringify(terms) !== JSON.stringify(base.terms) || undefined}>
            {t('settings.company.effectWords', { one: shown.one, other: shown.other })}
          </li>
        </ul>
      </section>
      {!inSettings && (
        <div>
          <button className="btn btn--primary"><Icon name="send" size={16} /> {submitLabel}</button>
        </div>
      )}
    </form>
  );
}

/** What companies most often call the organisations they look after: one click fills the words in every language
 * (`settings.vocab.<id>.one/.other` in each dictionary). */
const VOCAB = ['customer', 'partner', 'account', 'dealer', 'brand', 'member', 'company'] as const;

function PeopleTab() {
  const { t } = useI18n();
  const { me, teams, reloadPeople, toast } = useStore();
  const save = useSaver();
  const offer = useUndo();
  const [data, setData] = useState<{ users: AdminUser[]; seatsUsed: number } | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [invite, setInvite] = useState(false);
  const [devicesOf, setDevicesOf] = useState<AdminUser | null>(null);
  const [erase, setErase] = useState<AdminUser | null>(null);
  const [handover, setHandover] = useState<AdminUser | null>(null);
  const [accessOf, setAccessOf] = useState<AdminUser | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'invited' | 'disabled'>('all');

  const load = useCallback(async () => {
    const [u, r] = await Promise.all([get('/admin/users'), get('/admin/roles')]);
    setData(u);
    setRoles(r.roles);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  // A role, seat or status change applies at once and can be taken back for 10 seconds.
  const update = async (u: AdminUser, body: { roleId?: string; seat?: string; status?: string }) => {
    const before = { ...(body.roleId !== undefined ? { roleId: u.roleId } : {}), ...(body.seat !== undefined ? { seat: u.seat } : {}), ...(body.status !== undefined ? { status: u.status } : {}) };
    if (!(await save(() => patch(`/admin/users/${u.id}`, body), false))) return;
    await load();
    await reloadPeople();
    const what = body.roleId !== undefined
      ? t('settings.people.roleSet', { name: u.name, role: roles.find((r) => r.id === body.roleId)?.name ?? '' })
      : body.seat !== undefined
        ? t('settings.people.seatSet', { name: u.name, seat: t(`settings.people.seat.${body.seat}` as MessageKey) })
        : t('settings.people.statusSet', { name: u.name, status: t(`settings.people.status.${body.status}` as MessageKey) });
    offer(what, () => patch(`/admin/users/${u.id}`, before), async () => {
      await load();
      await reloadPeople();
    });
  };

  // Through the API client, so "Confirm it's you" can ask first (a personal export needs a fresh sign-in).
  async function exportData(u: AdminUser) {
    try {
      const data = await get<unknown>(`/admin/users/${u.id}/export`);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      a.download = `curahold-personal-data-${u.name.replace(/\s+/g, '-').toLowerCase()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast(t('settings.people.exported', { name: u.name }));
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
    }
  }

  if (!data) return <SkeletonRows rows={6} label={t('common.loading')} />;
  const needle = q.trim().toLocaleLowerCase();
  const shown = data.users.filter(
    (u) => (status === 'all' ? u.status !== 'deleted' : u.status === status) && (!needle || u.name.toLocaleLowerCase().includes(needle) || u.email.includes(needle)),
  );
  const viewers = data.users.filter((u) => u.seat === 'viewer' && u.status !== 'deleted' && u.status !== 'disabled').length;
  return (
    <>
      <div className="seat-summary">
        <div>
          <strong className="num">{data.seatsUsed}</strong>
          <span>{t('settings.people.paidSeats')}</span>
        </div>
        <div>
          <strong className="num">{viewers}</strong>
          <span>{t('settings.people.freeViewers')}</span>
        </div>
        <p className="field__hint">{t('settings.people.seatHint', { max: me.org.maxDevices })}</p>
      </div>
      <div className="toolbar people__tools">
        <FilterSheet
          count={status === 'all' ? 0 : 1}
          onClear={() => setStatus('all')}
          search={<input className="input search" type="search" value={q} placeholder={t('settings.people.search')} aria-label={t('settings.people.search')} onChange={(e) => setQ(e.target.value)} />}
          after={
            <button className="btn btn--primary people__invite" onClick={() => setInvite(true)}>
              <Icon name="userPlus" size={16} />
              {t('settings.people.invite')}
            </button>
          }
        >
          <FilterGroup label={t('settings.people.status')}>
            <select className="select" value={status} aria-label={t('settings.people.status')} onChange={(e) => setStatus(e.target.value as typeof status)}>
              <option value="all">{t('settings.people.filter.all')}</option>
              <option value="active">{t('settings.people.status.active')}</option>
              <option value="invited">{t('settings.people.status.invited')}</option>
              <option value="disabled">{t('settings.people.status.disabled')}</option>
            </select>
          </FilterGroup>
        </FilterSheet>
      </div>
      <table className="table people-table">
        <thead>
          <tr>
            <th>{t('settings.people.name')}</th>
            <th>{t('settings.people.role')}</th>
            <th>{t('settings.people.seat')}</th>
            <th>{t('settings.people.status')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                {t('settings.people.noMatch')}
              </td>
            </tr>
          )}
          {shown.map((u) => {
            const deleted = u.status === 'deleted';
            return (
              <tr key={u.id}>
                <td className="people-table__who">
                  <div className="u-display-flex u-gap-8 u-align-items-center">
                    <Avatar person={u} />
                    <div>
                      <div className="u-font-weight-500">{u.name}</div>
                      {!deleted && <div className="muted u-fs-xs">{u.email}</div>}
                    </div>
                  </div>
                </td>
                <td className="people-table__role">
                  <select className="select" value={u.roleId} disabled={deleted} aria-label={`${t('settings.people.role')}: ${u.name}`} onChange={(e) => update(u, { roleId: e.target.value })}>
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="people-table__seat">
                  <select className="select" value={u.seat} disabled={deleted} aria-label={`${t('settings.people.seat')}: ${u.name}`} onChange={(e) => update(u, { seat: e.target.value })}>
                    <option value="full">{t('settings.people.seat.full')}</option>
                    <option value="viewer">{t('settings.people.seat.viewer')}</option>
                  </select>
                </td>
                <td className="people-table__status">
                  <span className={`badge badge--${u.status}`}>{t(`settings.people.status.${u.status}`)}</span>
                </td>
                <td>
                  {!deleted && (
                    <RowMenu
                      label={t('settings.people.actions', { name: u.name })}
                      items={[
                        { label: t('settings.roles.whatCan'), onClick: () => setAccessOf(u) },
                        { label: t('settings.people.devices'), onClick: () => setDevicesOf(u) },
                        { label: t('settings.people.handover'), onClick: () => setHandover(u) },
                        ...(u.id !== me.user.id
                          ? [{ label: u.status === 'disabled' ? t('settings.people.enable') : t('settings.people.disable'), onClick: () => update(u, { status: u.status === 'disabled' ? 'active' : 'disabled' }) }]
                          : []),
                        { label: t('settings.people.export'), onClick: () => exportData(u) },
                        ...(u.id !== me.user.id ? [{ label: t('settings.people.erase'), danger: true, onClick: () => setErase(u) }] : []),
                      ]}
                    />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {invite && <InviteDialog roles={roles} teams={teams} onClose={() => setInvite(false)} onDone={async () => { await load(); await reloadPeople(); }} />}
      {devicesOf && <UserDevices user={devicesOf} onClose={() => setDevicesOf(null)} />}
      {accessOf && <AccessDialog userId={accessOf.id} roles={roles} onChanged={load} onClose={() => setAccessOf(null)} />}
      {handover && <HandoverDialog user={handover} users={data.users} onClose={() => setHandover(null)} />}
      {erase && (
        <Confirm
          title={t('settings.people.erase')}
          body={t('settings.people.eraseConfirm', { name: erase.name })}
          confirmLabel={t('settings.people.erase')}
          danger
          onClose={() => setErase(null)}
          onConfirm={async () => {
            if (await save(() => post(`/admin/users/${erase.id}/erase`))) {
              await load();
              await reloadPeople();
            }
          }}
        />
      )}
    </>
  );
}

function InviteDialog({ roles, teams, onClose, onDone }: { roles: Role[]; teams: { id: string; name: string }[]; onClose: () => void; onDone: () => Promise<void> }) {
  const { t } = useI18n();
  const { toast } = useStore();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [roleId, setRoleId] = useState(roles.find((r) => r.key === 'member')?.id ?? roles[0]?.id ?? '');
  const [seat, setSeat] = useState<'full' | 'viewer'>('full');
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    setError(null);
    try {
      await post('/admin/users', { email, name, roleId, seat, teamIds });
      toast(t('settings.people.invited', { email }));
      await onDone();
      onClose();
    } catch (e) {
      setError(e instanceof ApiFailure ? e.body.message : t('errors.server'));
    }
  }
  return (
    <Dialog
      title={t('settings.people.invite')}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--quiet" onClick={onClose}>
            <Icon name="close" size={16} />
            {t('common.cancel')}
          </button>
          <button className="btn btn--primary" disabled={!email || !name} onClick={submit}>
            <Icon name="userPlus" size={16} />
            {t('settings.people.invite')}
          </button>
        </>
      }
    >
      {error && <div className="notice notice--error">{error}</div>}
      <label className="field">
        <span className="field__label">{t('settings.people.name')}</span>
        <input className="input" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        <span className="field__label">{t('settings.people.email')}</span>
        <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <div className="form__row">
        <label className="field">
          <span className="field__label">{t('settings.people.role')}</span>
          <select className="select" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">{t('settings.people.seat')}</span>
          <select className="select" value={seat} onChange={(e) => setSeat(e.target.value as 'full' | 'viewer')}>
            <option value="full">{t('settings.people.seat.full')}</option>
            <option value="viewer">{t('settings.people.seat.viewer')}</option>
          </select>
        </label>
      </div>
      {teams.length > 0 && (
        <div className="field">
          <span className="field__label">{t('settings.people.teams')}</span>
          {teams.map((tm) => (
            <label key={tm.id} className="checkbox">
              <input type="checkbox" checked={teamIds.includes(tm.id)} onChange={(e) => setTeamIds(e.target.checked ? [...teamIds, tm.id] : teamIds.filter((x) => x !== tm.id))} />
              <span>{tm.name}</span>
            </label>
          ))}
        </div>
      )}
    </Dialog>
  );
}

function UserDevices({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const { t } = useI18n();
  const save = useSaver();
  const [list, setList] = useState<SessionInfo[] | null>(null);
  const load = useCallback(() => get(`/admin/users/${user.id}/sessions`).then((r) => setList(r.sessions)), [user.id]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <Dialog title={`${t('settings.people.devices')}: ${user.name}`} onClose={onClose} footer={<button className="btn" onClick={onClose}><Icon name="close" size={16} /> {t('common.close')}</button>}>
      {list?.length === 0 && <p className="muted">{t('common.none')}</p>}
      {list?.map((s) => (
        <div key={s.id} className="filerow">
          <div className="u-flex-1">
            <div>{s.deviceLabel || t('devices.unknown')}</div>
            <div className="muted u-fs-xs">{t('devices.lastSeen', { when: relativeTime(s.lastSeenAt, t) })}</div>
          </div>
          <button className="btn btn--small" onClick={async () => { if (await save(() => del(`/admin/sessions/${s.id}`), false)) await load(); }}>
            <Icon name="logout" size={16} />
            {t('devices.signOut')}
          </button>
        </div>
      ))}
    </Dialog>
  );
}

function TeamsTab() {
  const { t } = useI18n();
  const { teams, people, reloadPeople } = useStore();
  const save = useSaver();
  const [name, setName] = useState('');
  const [gone, setGone] = useState<string[]>([]);
  const later = useDeleteLater();
  const active = people.filter((p) => p.status !== 'deleted');
  return (
    <div className="u-max-width-760">
      <form
        className="toolbar u-mb-12"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await save(() => post('/admin/teams', { name, memberIds: [] }))) {
            setName('');
            await reloadPeople();
          }
        }}
      >
        <input className="input u-max-width-320" placeholder={t('settings.teams.new')} aria-label={t('settings.teams.new')} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        <button className="btn btn--primary" disabled={!name.trim()}>
          <Icon name="plus" size={16} />
          {t('common.create')}
        </button>
      </form>
      {teams.length === 0 && <EmptyState compact icon="people" title={t('settings.teams.empty')} />}
      {teams.filter((tm) => !gone.includes(tm.id)).map((tm) => (
        <div className="sheet" key={tm.id}>
          <div className="toolbar u-mb-12">
            <h2 className="sheet__title u-m-0">
              <Icon name="people" size={18} className="icon--lead" />
              {tm.name}
            </h2>
            <div className="topbar__spacer" />
            <button
              className="btn btn--small btn--quiet"
              onClick={() =>
                later(t('settings.teams.deleted', { name: tm.name }), {
                  hide: () => setGone((g) => [...g, tm.id]),
                  unhide: () => setGone((g) => g.filter((x) => x !== tm.id)),
                  commit: () => del(`/admin/teams/${tm.id}`),
                  after: reloadPeople,
                })
              }
            >
              <Icon name="trash" size={16} />
              {t('common.delete')}
            </button>
          </div>
          <div className="form__row">
            <label className="field">
              <span className="field__label">{t('settings.teams.lead')}</span>
              <select className="select" value={tm.leadId ?? ''} onChange={async (e) => { if (await save(() => patch(`/admin/teams/${tm.id}`, { leadId: e.target.value || null }))) await reloadPeople(); }}>
                <option value="">{t('common.none')}</option>
                {active.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="field">
              <span className="field__label">{t('settings.teams.members')}</span>
              <PeoplePicker label={t('settings.teams.members')} people={active} value={tm.memberIds} max={500} onChange={async (ids) => { if (await save(() => patch(`/admin/teams/${tm.id}`, { memberIds: ids }), false)) await reloadPeople(); }} />
            </div>
          </div>
        </div>
      ))}

    </div>
  );
}

const AUDIT_KINDS = ['access', 'people', 'signin', 'keys', 'exports', 'deletes', 'settings'] as const;

/** The activity log: newest first, narrowed by kind, person and words; older pages on request; exportable. */
function AuditTab() {
  const { t, fmtDate } = useI18n();
  const { person, people } = useStore();
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState('');
  const [actor, setActor] = useState('');
  const [q, setQ] = useState('');
  const query = useCallback((before?: string) => {
    const p = new URLSearchParams();
    if (before) p.set('before', before);
    if (kind) p.set('kind', kind);
    if (actor) p.set('actor', actor);
    return get<{ entries: AuditEntry[] }>(`/admin/audit?${p}`);
  }, [kind, actor]);
  const load = useCallback(() => {
    setFailed(false);
    setEntries(null);
    query()
      .then((r) => {
        setEntries(r.entries);
        setMore(r.entries.length >= 200);
      })
      .catch(() => setFailed(true));
  }, [query]);
  useEffect(load, [load]);
  const older = async () => {
    const last = entries?.at(-1);
    if (!last || busy) return;
    setBusy(true);
    try {
      const r = await query(last.at);
      setEntries((e) => [...(e ?? []), ...r.entries]);
      setMore(r.entries.length >= 200);
    } finally {
      setBusy(false);
    }
  };
  const label = (e: AuditEntry) => {
    const key = `audit.${e.action}` as MessageKey;
    const l = t(key);
    return l === key ? e.action : l;
  };
  const who = (e: AuditEntry) => (e.actorId ? (person(e.actorId)?.name ?? t('common.unknownUser')) : t('audit.system'));
  const needle = fold(q.trim());
  const shown = (entries ?? []).filter((e) => !needle || fold(`${label(e)} ${who(e)} ${e.staff ?? ''}`).includes(needle));
  const filtered = !!(kind || actor || q.trim());
  const clear = () => (setKind(''), setActor(''), setQ(''));
  const everyone = [...people].filter((p) => p.status !== 'disabled').sort((x, y) => x.name.localeCompare(y.name));
  return (
    <div className="audit">
      <div className="toolbar audit__tools">
        <FilterSheet
          count={(kind ? 1 : 0) + (actor ? 1 : 0)}
          onClear={() => (setKind(''), setActor(''))}
          search={<input className="input search" type="search" value={q} placeholder={t('settings.audit.search')} aria-label={t('settings.audit.search')} onChange={(e) => setQ(e.target.value)} />}
          after={<span className="audit__export"><AuditExport /></span>}
        >
          <FilterGroup label={t('settings.audit.kind')}>
            <select className="select" value={kind} aria-label={t('settings.audit.kind')} onChange={(e) => setKind(e.target.value)}>
              <option value="">{t('settings.audit.kind.all')}</option>
              {AUDIT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`settings.audit.kind.${k}` as MessageKey)}
                </option>
              ))}
            </select>
          </FilterGroup>
          <FilterGroup label={t('settings.audit.person')}>
            <select className="select" value={actor} aria-label={t('settings.audit.person')} onChange={(e) => setActor(e.target.value)}>
              <option value="">{t('settings.audit.anyone')}</option>
              {everyone.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </FilterGroup>
        </FilterSheet>
      </div>
      {failed ? (
        <ErrorState compact onRetry={load} />
      ) : !entries ? (
        <SkeletonRows rows={8} label={t('common.loading')} />
      ) : !shown.length ? (
        filtered ? (
          <EmptyState compact icon="history" title={t('settings.audit.none')}>
            <button type="button" className="btn" onClick={clear}>
              <Icon name="close" size={16} />
              {t('settings.audit.clear')}
            </button>
          </EmptyState>
        ) : (
          <EmptyState compact icon="history" title={t('settings.audit.empty')} />
        )
      ) : (
        <>
          <ol className="audit__list">
            {shown.map((e) => (
              <li key={e.id} className="audit__row">
                <time className="audit__when" dateTime={e.at}>
                  {fmtDate(e.at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </time>
                <span className="audit__who">{who(e)}</span>
                <span className="audit__what">
                  {label(e)}
                  {e.staff && <span className="muted"> · {t('support.byStaff', { staff: e.staff })}</span>}
                </span>
              </li>
            ))}
          </ol>
          {more && (
            <button type="button" className="btn audit__more" disabled={busy} onClick={() => void older()}>
              <Icon name="chevronDown" size={16} />
              {t('settings.audit.older')}
            </button>
          )}
        </>
      )}
    </div>
  );
}

interface ErrRow {
  id: string;
  at: string;
  source: 'server' | 'browser';
  method: string | null;
  path: string | null;
  message: string;
  detail: string | null;
  agent: string | null;
  byId: string | null;
}

/** Recent errors: what broke and where, so a real fault can be seen and fixed. */
function ErrorsTab() {
  const { t, fmtDate } = useI18n();
  const { person } = useStore();
  const [source, setSource] = useState<'' | 'server' | 'browser'>('');
  const [rows, setRows] = useState<ErrRow[] | null>(null);
  useEffect(() => {
    setRows(null);
    get<{ errors: ErrRow[] }>(`/admin/errors?limit=200${source ? `&source=${source}` : ''}`)
      .then((r) => setRows(r.errors))
      .catch(() => setRows([]));
  }, [source]);
  return (
    <div className="u-max-width-900">
      <p className="muted small">{t('settings.errors.intro')}</p>
      <div className="seg u-mb-12" role="group" aria-label={t('settings.errors.filter')}>
        {(['', 'server', 'browser'] as const).map((s) => (
          <button key={s || 'all'} type="button" aria-pressed={source === s} onClick={() => setSource(s)}>
            {t(`settings.errors.${s || 'all'}` as any)}
          </button>
        ))}
      </div>
      {!rows ? (
        <SkeletonRows rows={5} label={t('common.loading')} />
      ) : rows.length === 0 ? (
        <EmptyState compact tone="done" icon="checkCircle" title={t('settings.errors.empty')} />
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>{t('settings.errors.when')}</th>
              <th>{t('settings.errors.where')}</th>
              <th>{t('settings.errors.what')}</th>
              <th>{t('settings.errors.who')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id}>
                <td className="num muted">{fmtDate(e.at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                <td className="muted">
                  {t(`settings.errors.${e.source}` as any)}
                  {e.path && (
                    <>
                      <br />
                      <span className="small">{`${e.method ? `${e.method} ` : ''}${e.path}`}</span>
                    </>
                  )}
                </td>
                <td>
                  {e.detail ? (
                    <details>
                      <summary>{e.message}</summary>
                      <pre className="errdetail">{e.detail}</pre>
                    </details>
                  ) : (
                    e.message
                  )}
                </td>
                <td className="muted">{e.byId ? (person(e.byId)?.name ?? t('common.unknownUser')) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function HandoverDialog({ user, users, onClose }: { user: AdminUser; users: AdminUser[]; onClose: () => void }) {
  const { t, words } = useI18n();
  const { toast } = useStore();
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const targets = users.filter((u) => u.id !== user.id && u.seat === 'full' && (u.status === 'active' || u.status === 'invited'));
  const run = async () => {
    setBusy(true);
    try {
      const r = await post<{ accounts: number; tasks: number }>(`/admin/users/${user.id}/handover`, { toUserId: to });
      toast(t('settings.people.handedOver', { accounts: r.accounts, tasks: r.tasks, name: targets.find((x) => x.id === to)?.name ?? '' }));
      onClose();
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      title={t('settings.people.handoverTitle', { name: user.name })}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--quiet" onClick={onClose}>
            <Icon name="close" size={16} />
            {t('common.cancel')}
          </button>
          <button className="btn btn--primary" disabled={!to || busy} onClick={run}>
            <Icon name="arrowRight" size={16} />
            {t('settings.people.handoverGo')}
          </button>
        </>
      }
    >
      <p className="sheet__hint">{t('settings.people.handoverHint', { accounts: words.other.toLocaleLowerCase() })}</p>
      <label className="field">
        <span className="field__label">{t('settings.people.handoverTo')}</span>
        <select className="select" value={to} onChange={(e) => setTo(e.target.value)}>
          <option value="" />
          {targets.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </label>
    </Dialog>
  );
}

// Who may join, and how: invitations, requests from the company's own
// domains (approved here), or joining straight away.
function JoiningTab() {
  const { t } = useI18n();
  const { me, reloadMe, reloadPeople, toast } = useStore();
  const save = useSaver();
  const [requests, setRequests] = useState<JoinRequest[] | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [roleFor, setRoleFor] = useState<Record<string, string>>({});
  const [domainEmail, setDomainEmail] = useState('');
  const [pendingDomain, setPendingDomain] = useState<string | null>(null);
  const [removingDomain, setRemovingDomain] = useState<string | null>(null);
  const [goneDomains, setGoneDomains] = useState<string[]>([]);
  const later = useDeleteLater();
  const offer = useUndo();
  const [code, setCode] = useState('');
  const load = useCallback(async () => {
    const [r, ro] = await Promise.all([get<{ requests: JoinRequest[] }>('/admin/join-requests'), get<{ roles: Role[] }>('/admin/roles')]);
    setRequests(r.requests);
    setRoles(ro.roles);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const memberRole = roles.find((r) => r.key === 'member')?.id ?? '';
  const decide = async (r: JoinRequest, ok: boolean) => {
    const roleId = roleFor[r.id] || memberRole;
    const role = roles.find((x) => x.id === roleId);
    if (
      await save(
        () => post(`/admin/join-requests/${r.id}/${ok ? 'approve' : 'reject'}`, ok ? { roleId, seat: role?.key === 'viewer' ? 'viewer' : 'full' } : {}),
        false,
      )
    ) {
      toast(ok ? t('join.approved', { name: r.name }) : t('join.declined', { name: r.name }));
      await load();
      await reloadPeople();
    }
  };
  const setPolicy = async (body: Record<string, boolean>) => {
    const before = { joinRequests: me.org.joinRequests, autoJoin: me.org.autoJoin };
    if (!(await save(() => patch('/admin/org', body), false))) return;
    await reloadMe();
    offer(t('settings.savedTopic', { topic: t('join.policyTitle') }), () => patch('/admin/org', before), reloadMe);
  };
  const policy = me.org.autoJoin ? 'auto' : me.org.joinRequests ? 'requests' : 'invite';

  return (
    <div className="form u-max-width-760">
      <section className="sheet">
        <h3 className="section__head">{t('join.requestsTitle', { n: requests?.length ?? 0 })}</h3>
        {!requests ? (
          <p className="muted">{t('common.loading')}</p>
        ) : requests.length === 0 ? (
          <p className="muted">{t('join.noRequests')}</p>
        ) : (
          <table className="table">
            <tbody>
              {requests.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.name}</strong>
                    <div className="muted">{r.email}</div>
                    {r.note && <div className="join-note">“{r.note}”</div>}
                  </td>
                  <td>
                    <select className="select" value={roleFor[r.id] || memberRole} aria-label={t('settings.people.role')} onChange={(e) => setRoleFor({ ...roleFor, [r.id]: e.target.value })}>
                      {roles.map((ro) => (
                        <option key={ro.id} value={ro.id}>
                          {ro.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <div className="inline-actions">
                      <button className="btn btn--small btn--primary" onClick={() => decide(r, true)}>
                        <Icon name="check" size={16} />
                        {t('join.approve')}
                      </button>
                      <button className="btn btn--small btn--quiet" onClick={() => decide(r, false)}>
                        <Icon name="close" size={16} />
                        {t('join.decline')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="sheet">
        <h3 className="section__head">{t('join.policyTitle')}</h3>
        <div className="choice-list" role="radiogroup" aria-label={t('join.policyTitle')}>
          {(
            [
              ['invite', t('join.policy.invite'), t('join.policy.inviteHint'), { joinRequests: false, autoJoin: false }],
              ['requests', t('join.policy.requests'), t('join.policy.requestsHint'), { joinRequests: true, autoJoin: false }],
              ['auto', t('join.policy.auto'), t('join.policy.autoHint'), { joinRequests: true, autoJoin: true }],
            ] as const
          ).map(([key, label, hint, body]) => (
            <label key={key} className="choice" data-on={policy === key ? 'true' : undefined}>
              <input type="radio" name="join-policy" checked={policy === key} onChange={() => setPolicy(body)} />
              <span>
                <strong>{label}</strong>
                <span className="muted">{hint}</span>
              </span>
            </label>
          ))}
        </div>
        {policy !== 'invite' && me.org.domains.length === 0 && <p className="notice">{t('join.needDomain')}</p>}
      </section>

      <section className="sheet">
        <h3 className="section__head">{t('join.domainsTitle')}</h3>
        <p className="sheet__hint">{t('join.domainsHint')}</p>
        <div className="chips-row">
          {me.org.domains.filter((d) => !goneDomains.includes(d)).map((d) => (
            <span className="option-chip" key={d}>
              <span>@{d}</span>
              <button aria-label={`${t('common.remove')} @${d}`} onClick={() => setRemovingDomain(d)}>
                ✕
              </button>
            </span>
          ))}
          {me.org.domains.length === 0 && <span className="muted">{t('join.noDomains')}</span>}
        </div>
        {pendingDomain ? (
          <div className="toolbar u-mt-12">
            <span>{t('join.codeSent', { email: pendingDomain })}</span>
            <input className="input code-input u-width-120" inputMode="numeric" maxLength={6} value={code} aria-label={t('join.code')} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
            <button
              className="btn btn--small btn--primary"
              disabled={code.length !== 6}
              onClick={async () => {
                if (await save(() => post('/admin/domains/verify', { email: pendingDomain, code }))) {
                  setPendingDomain(null);
                  setCode('');
                  setDomainEmail('');
                  await reloadMe();
                }
              }}
            >
              <Icon name="check" size={16} />
              {t('join.verify')}
            </button>
            <button className="btn btn--small btn--quiet" onClick={() => setPendingDomain(null)}>
              <Icon name="close" size={16} />
              {t('common.cancel')}
            </button>
          </div>
        ) : (
          <div className="toolbar u-mt-12">
            <input className="input u-width-260" type="email" value={domainEmail} placeholder={t('join.domainEmail')} aria-label={t('join.domainEmail')} onChange={(e) => setDomainEmail(e.target.value)} />
            <button
              className="btn btn--small"
              disabled={!domainEmail.includes('@')}
              onClick={async () => {
                try {
                  const r = await post<{ verified: boolean; devCode?: string }>('/admin/domains', { email: domainEmail.trim() });
                  if (r.verified) toast(t('join.alreadyVerified'));
                  else {
                    setPendingDomain(domainEmail.trim());
                    if (import.meta.env.DEV && r.devCode) setCode(r.devCode);
                  }
                } catch (e) {
                  toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
                }
              }}
            >
              <Icon name="send" size={16} />
              {t('join.sendCode')}
            </button>
          </div>
        )}
        {removingDomain && (
          <Confirm
            title={t('join.domainRemoveTitle', { domain: removingDomain })}
            body={t('join.domainRemoveBody', { domain: removingDomain })}
            confirmLabel={t('common.remove')}
            danger
            onClose={() => setRemovingDomain(null)}
            onConfirm={() => {
              const d = removingDomain;
              setRemovingDomain(null);
              later(t('join.domainRemoved', { domain: d }), {
                hide: () => setGoneDomains((g) => [...g, d]),
                unhide: () => setGoneDomains((g) => g.filter((x) => x !== d)),
                commit: () => del(`/admin/domains/${d}`),
                after: reloadMe,
              });
            }}
          />
        )}
      </section>
    </div>
  );
}

/** The company logo: upload, replace, remove — it shows up wherever the company's name does. */
function LogoEditor() {
  const { t } = useI18n();
  const { me, reloadMe, toast } = useStore();
  const save = useSaver();
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_LOGO_KB * 1024 || !(LOGO_TYPES as readonly string[]).includes(file.type)) {
      toast(t('settings.company.logoBad'), 'error');
      return;
    }
    setBusy(true);
    const form = new FormData();
    form.append('file', file);
    try {
      await post('/admin/logo', form);
      await reloadMe();
      toast(t('settings.company.logoAdded'));
    } catch (e) {
      toast(e instanceof ApiFailure && e.code !== 'validation' ? e.body.message : t('settings.company.logoBad'), 'error');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  return (
    <div className="sheet logo-editor">
      <div className="logo-editor__preview" aria-hidden="true">
        {me.org.logoUrl ? <img src={me.org.logoUrl} alt="" /> : <Mark size={40} />}
      </div>
      <div className="logo-editor__body">
        <span className="field__label">{t('settings.company.logo')}</span>
        <span className="field__hint">{me.org.logoUrl ? t('settings.company.logoHint') : `${t('settings.company.logoNone')} ${t('settings.company.logoHint')}`}</span>
        <div className="inline-actions u-justify-content-flex-start">
          <input ref={input} type="file" accept={LOGO_TYPES.join(',')} className="sr-only" aria-label={t('settings.company.logoUpload')} onChange={(e) => upload(e.target.files?.[0])} />
          <button type="button" className="btn btn--small" disabled={busy} onClick={() => input.current?.click()}>
            <Icon name="upload" size={16} />
            {me.org.logoUrl ? t('settings.company.logoReplace') : t('settings.company.logoUpload')}
          </button>
          {me.org.logoUrl && (
            <button
              type="button"
              className="btn btn--small btn--quiet"
              disabled={busy}
              onClick={async () => {
                if (await save(() => del('/admin/logo'), false)) await reloadMe();
              }}
            >
              <Icon name="trash" size={16} />
              {t('settings.company.logoRemove')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
