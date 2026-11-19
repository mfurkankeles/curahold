// Settings → Analytics: the read-only feed BI tools read (Power BI, Excel, Fabric,
// Tableau, Looker Studio, Qlik, Zoho Analytics…), its addresses, the analytics
// keys (make, rotate, revoke; limited to datasets and departments, with an end
// date) and who pulled what. A key acts as the person who made it and never
// sees more than they do (api/src/routes/analytics.ts).
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ANALYTICS_DEPARTMENTS, BI_TOOLS, type AnalyticsDatasetInfo, type AnalyticsDepartment, type AnalyticsKeyInfo, type AnalyticsPullInfo } from '../../../shared/src/analytics';
import type { MessageKey } from '../../../shared/src/i18n';
import { ApiFailure, del, get, post } from '../lib/api';
import { docsHref, docsLink } from '../lib/docs';
import { formatNumber } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { useStore } from '../lib/store';
import { relativeTime } from '../lib/time';
import { Icon } from './icons';
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

function CopyField({ label, value }: { label: string; value: string }) {
  const { t } = useI18n();
  const copy = useCopy();
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <div className="toolbar">
        <input className="input u-flex-1 u-min-width-220" readOnly value={value} onFocus={(e) => e.target.select()} />
        <button type="button" className="btn" onClick={() => copy(value)}>
          {t('me.copy')}
        </button>
      </div>
    </label>
  );
}

const toolLabel = (t: (k: MessageKey) => string, tool: string | null) => (tool ? t(`analytics.tool.${tool}` as MessageKey) || tool : '—');
const deptLabel = (t: (k: MessageKey) => string, d: AnalyticsDepartment) => t(`dept.${d}` as MessageKey);

export function AnalyticsTab() {
  const { t, locale } = useI18n();
  const { can, me, people, toast } = useStore();
  const [keys, setKeys] = useState<AnalyticsKeyInfo[] | null>(null);
  const [pulls, setPulls] = useState<AnalyticsPullInfo[] | null>(null);
  const [making, setMaking] = useState(false);
  const [shown, setShown] = useState<{ title: string; token: string } | null>(null);
  const [revoking, setRevoking] = useState<AnalyticsKeyInfo | null>(null);
  const [rotating, setRotating] = useState<AnalyticsKeyInfo | null>(null);
  const manager = can('users.manage') || can('org.manage');
  const mayExport = can('data.export');
  const fail = useCallback((e: unknown) => toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error'), [t, toast]);
  const load = useCallback(async () => {
    const [k, p] = await Promise.all([
      get<{ keys: AnalyticsKeyInfo[] }>(`/dev/analytics/keys${manager ? '?scope=all' : ''}`),
      get<{ pulls: AnalyticsPullInfo[] }>('/dev/analytics/pulls'),
    ]);
    setKeys(k.keys);
    setPulls(p.pulls);
  }, [manager]);
  useEffect(() => {
    void load().catch(fail);
  }, [load, fail]);
  const nameOf = (id: string | null) => (id ? (people.find((p) => p.id === id)?.name ?? '—') : '—');
  const keyName = (id: string | null) => (id ? (keys?.find((k) => k.id === id)?.name ?? t('analytics.keyGone')) : t('analytics.inApp'));
  const odata = `${location.origin}/api/analytics/odata/`;
  const json = `${location.origin}/api/analytics/v1/`;
  const guide = (anchor?: string) => `${docsHref(`${locale}/bi-tools`)}${anchor ? `#${anchor}` : ''}`;

  return (
    <div className="form u-max-width-760">
      <section className="sheet" data-tour="bi-feed">
        <h2 className="sheet__title">
          <Icon name="chart" size={18} className="icon--lead" />
          {t('analytics.title')}
        </h2>
        <p className="sheet__hint">{t('analytics.hint')}</p>
        <div className="form">
          <CopyField label={t('analytics.odata')} value={odata} />
          <CopyField label={t('analytics.json')} value={json} />
        </div>
        <p className="field__hint">{t('analytics.signIn')}</p>
        <p className="field__label u-mt-12">{t('analytics.guides')}</p>
        <div className="toolbar">
          {BI_TOOLS.map((x) => (
            <a key={x.key} className="btn btn--small" href={guide(x.anchor)} {...docsLink}>
              <Icon name="book" size={14} />
              {t(`analytics.guide.${x.key}` as MessageKey)}
            </a>
          ))}
        </div>
      </section>

      <section className="sheet">
        <h2 className="sheet__title">
          <Icon name="key" size={18} className="icon--lead" />
          {t('analytics.keys')}
        </h2>
        <p className="sheet__hint">{manager ? t('analytics.keysAllHint') : t('analytics.keysHint')}</p>
        {keys && keys.length > 0 && (
          <ul className="keylist">
            {keys.map((k) => (
              <li key={k.id} className="keyrow">
                <div className="keyrow__main">
                  <div className="keyrow__name">
                    {k.name} <span className="badge">{t('dev.keys.readOnly')}</span>
                  </div>
                  <div className="keyrow__meta">
                    {manager && <span>{nameOf(k.userId)} · </span>}
                    <code>{k.prefix}</code> · {k.datasets ? t('analytics.someSets', { n: k.datasets.length }) : t('analytics.allSets')} ·{' '}
                    {k.departments ? k.departments.map((d) => deptLabel(t, d)).join(', ') : t('analytics.allDepts')}
                  </div>
                  <div className="keyrow__meta">
                    {k.lastPullAt ? t('analytics.lastPull', { when: relativeTime(k.lastPullAt, t), tool: toolLabel(t, k.lastTool) }) : t('dev.keys.unused')}
                    {' · '}
                    {t('analytics.rows30', { n: formatNumber(k.rows, locale) })}
                    {k.expiresAt && <> · {t('dev.keys.until', { date: k.expiresAt.slice(0, 10) })}</>}
                  </div>
                </div>
                <div className="toolbar">
                  {k.userId === me.user.id && mayExport && (
                    <button type="button" className="btn btn--small" onClick={() => setRotating(k)}>
                      <Icon name="refresh" size={14} />
                      {t('analytics.rotate')}
                    </button>
                  )}
                  <button type="button" className="btn btn--quiet btn--small" onClick={() => setRevoking(k)}>
                    {t('dev.keys.revoke')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {keys && !keys.length && <p className="muted">{t('analytics.noKeys')}</p>}
        {mayExport ? (
          <div className="toolbar u-mt-12">
            <button type="button" className="btn btn--primary" data-tour="bi-new" onClick={() => setMaking(true)}>
              <Icon name="plus" size={16} />
              {t('analytics.newKey')}
            </button>
          </div>
        ) : (
          <p className="field__hint">{t('analytics.needExport')}</p>
        )}
      </section>

      <section className="sheet">
        <h2 className="sheet__title">
          <Icon name="history" size={18} className="icon--lead" />
          {t('analytics.pulls')}
        </h2>
        <p className="sheet__hint">{t('analytics.pullsHint')}</p>
        {pulls && pulls.length > 0 && (
          <ul className="keylist">
            {pulls.slice(0, 25).map((p, i) => (
              <li key={`${p.at}-${i}`} className="keyrow">
                <div className="keyrow__main">
                  <div className="keyrow__name">
                    <code>{p.dataset}</code> · {t('analytics.rowsN', { n: formatNumber(p.rows, locale) })}
                  </div>
                  <div className="keyrow__meta">
                    {relativeTime(p.at, t)} · {nameOf(p.userId)} · {keyName(p.keyId)} · {toolLabel(t, p.tool)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {pulls && !pulls.length && <p className="muted">{t('analytics.noPulls')}</p>}
      </section>

      {making && (
        <NewAnalyticsKey
          onClose={() => setMaking(false)}
          onMade={(token) => {
            setMaking(false);
            setShown({ title: t('analytics.newKey'), token });
            void load();
          }}
        />
      )}
      {shown && <ShowKey title={shown.title} token={shown.token} onClose={() => setShown(null)} />}
      {rotating && (
        <Confirm
          title={t('analytics.rotateTitle', { name: rotating.name })}
          body={t('analytics.rotateBody')}
          confirmLabel={t('analytics.rotate')}
          onClose={() => setRotating(null)}
          onConfirm={async () => {
            try {
              const r = await post<{ token: string }>(`/dev/analytics/keys/${rotating.id}/rotate`);
              setShown({ title: t('analytics.rotateTitle', { name: rotating.name }), token: r.token });
              await load();
            } catch (e) {
              fail(e);
            }
            setRotating(null);
          }}
        />
      )}
      {revoking && (
        <Confirm
          title={t('dev.keys.revokeTitle', { name: revoking.name })}
          body={t('analytics.revokeBody')}
          confirmLabel={t('dev.keys.revoke')}
          danger
          onClose={() => setRevoking(null)}
          onConfirm={async () => {
            try {
              await del(`/dev/analytics/keys/${revoking.id}`);
              toast(t('dev.keys.revoked'));
              await load();
            } catch (e) {
              fail(e);
            }
            setRevoking(null);
          }}
        />
      )}
    </div>
  );
}

/** The key, shown once, with what a BI tool asks for (user name: anything; password: the key). */
function ShowKey({ title, token, onClose }: { title: string; token: string; onClose: () => void }) {
  const { t } = useI18n();
  const copy = useCopy();
  return (
    <Dialog
      title={title}
      onClose={onClose}
      footer={
        <button type="button" className="btn btn--primary" onClick={onClose}>
          {t('dev.done')}
        </button>
      }
    >
      <div className="once">
        <p className="once__note">{t('dev.keys.copyNow')}</p>
        <div className="toolbar">
          <input className="input once__value" readOnly value={token} onFocus={(e) => e.target.select()} aria-label={t('dev.keys.copyNow')} />
          <button type="button" className="btn btn--primary" onClick={() => copy(token)}>
            {t('me.copy')}
          </button>
        </div>
        <ul className="steps">
          <li>{t('analytics.useBasic')}</li>
          <li>{t('analytics.useBearer')}</li>
        </ul>
      </div>
    </Dialog>
  );
}

function NewAnalyticsKey({ onClose, onMade }: { onClose: () => void; onMade: (token: string) => void }) {
  const { t } = useI18n();
  const { me, toast } = useStore();
  const [sets, setSets] = useState<AnalyticsDatasetInfo[] | null>(null);
  const [name, setName] = useState('');
  const [days, setDays] = useState(365);
  const [pickSets, setPickSets] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [pickDepts, setPickDepts] = useState(false);
  const [depts, setDepts] = useState<AnalyticsDepartment[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void get<{ datasets: AnalyticsDatasetInfo[] }>('/dev/analytics/datasets').then((r) => setSets(r.datasets));
  }, []);
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const invalid = (pickSets && !chosen.length) || (pickDepts && !depts.length);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (invalid) return;
    setBusy(true);
    try {
      const r = await post<{ token: string }>('/dev/analytics/keys', {
        name: name.trim() || t('analytics.keyDefault'),
        expiresInDays: days,
        datasets: pickSets ? chosen : null,
        departments: pickDepts ? depts : null,
      });
      onMade(r.token);
    } catch (err) {
      toast(err instanceof ApiFailure ? err.body.message : t('errors.server'), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      title={t('analytics.newKey')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--quiet" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn btn--primary" form="newanalyticskey" disabled={busy || invalid}>
            <Icon name="plus" size={16} />
            {t('dev.keys.create')}
          </button>
        </>
      }
    >
      <form id="newanalyticskey" className="form" onSubmit={submit}>
        <label className="field">
          <span className="field__label">{t('dev.keys.name')}</span>
          <input className="input" value={name} maxLength={80} placeholder={t('analytics.namePh')} onChange={(e) => setName(e.target.value)} />
        </label>
        <fieldset className="field">
          <legend className="field__label">{t('analytics.sets')}</legend>
          <label className="checkbox">
            <input type="radio" name="sets" checked={!pickSets} onChange={() => setPickSets(false)} />
            <span>{t('analytics.allSetsLong')}</span>
          </label>
          <label className="checkbox">
            <input type="radio" name="sets" checked={pickSets} onChange={() => setPickSets(true)} />
            <span>{t('analytics.onlySets')}</span>
          </label>
          {pickSets &&
            (sets ?? []).map((d) => (
              <label key={d.name} className="checkbox">
                <input type="checkbox" checked={chosen.includes(d.name)} onChange={() => setChosen(toggle(chosen, d.name))} />
                <span>
                  <code>{d.name}</code> {d.about}
                </span>
              </label>
            ))}
        </fieldset>
        <fieldset className="field">
          <legend className="field__label">{t('analytics.depts')}</legend>
          <label className="checkbox">
            <input type="radio" name="depts" checked={!pickDepts} onChange={() => setPickDepts(false)} />
            <span>{t('analytics.allDepts')}</span>
          </label>
          <label className="checkbox">
            <input type="radio" name="depts" checked={pickDepts} onChange={() => setPickDepts(true)} />
            <span>{t('analytics.onlyDepts')}</span>
          </label>
          {pickDepts &&
            ANALYTICS_DEPARTMENTS.filter((d) => !me.departments?.length || me.departments.some((x) => x.key === d && x.enabled)).map((d) => (
              <label key={d} className="checkbox">
                <input type="checkbox" checked={depts.includes(d)} onChange={() => setDepts(toggle(depts, d))} />
                <span>{deptLabel(t, d)}</span>
              </label>
            ))}
          <span className="field__hint">{t('analytics.deptsHint')}</span>
        </fieldset>
        <label className="field">
          <span className="field__label">{t('dev.keys.expires')}</span>
          <select className="select" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {[30, 90, 365, 730].map((n) => (
              <option key={n} value={n}>
                {t('dev.keys.days', { n })}
              </option>
            ))}
          </select>
        </label>
        <p className="field__hint">{t('analytics.actsAsYou')}</p>
      </form>
    </Dialog>
  );
}
