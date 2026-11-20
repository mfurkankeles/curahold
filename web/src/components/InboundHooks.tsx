// Settings → Data sources → Incoming webhooks: for any tool that can call a web address (e-signature, telephony,
// chat widgets, payment services, Zapier, Make, your own code). One hook per source: its address and secret, what a
// delivery becomes, the mapping (templates like {{data.status}} filled from each delivery), a test screen and the log.
import { useCallback, useEffect, useState } from 'react';
import { HOOK_TARGETS, problemOf, type HookDelivery, type HookMapping, type HookRecipe, type HookTarget, type InboundHook } from '../../../shared/src/inboundHooks';
import type { MessageKey } from '../../../shared/src/i18n';
import { ApiFailure, del, get, patch, post } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { useStore } from '../lib/store';
import { Icon } from './icons';
import { Confirm, Dialog } from './ui';

type Recipe = Omit<HookRecipe, 'key'> & { key: string };
/** The mapping fields each target uses, in the order the screen asks for them. */
const FIELDS: Record<HookTarget, (keyof HookMapping)[]> = {
  task: ['title', 'description', 'due', 'status', 'assigneeEmail'],
  ticket: ['subject', 'status', 'priority', 'requester', 'url'],
  activity: ['body', 'title', 'happenedAt', 'minutes'],
  deal_note: ['body', 'dealId', 'dealName'],
};

/** Settings: incoming webhooks from recipes, with their address, secret and deliveries. */
/** A delivery's problem in the reader's language (the log stores a code, never English words). */
function whyText(t: (key: MessageKey, vars?: Record<string, string>) => string, error: string | null): string {
  const p = problemOf(error);
  return p ? t(`hooks.why.${p.code}` as MessageKey, { value: p.value }) : '—';
}

export function InboundHooks() {
  const { t, locale } = useI18n();
  const { toast } = useStore();
  const [hooks, setHooks] = useState<InboundHook[] | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await get<{ hooks: InboundHook[]; recipes: Recipe[] }>('/inbound-hooks');
    setHooks(r.hooks);
    setRecipes(r.recipes);
  }, []);
  useEffect(() => {
    void load().catch(() => setHooks([]));
  }, [load]);
  if (!hooks) return null;
  const current = hooks.find((h) => h.id === open) ?? null;
  return (
    <section className="u-mt-20" data-tour="inbound-hooks">
      <h3 className="section__head">{t('hooks.title' as MessageKey)}</h3>
      <p className="field__hint">{t('hooks.lede' as MessageKey)}</p>
      {hooks.length > 0 && (
        <div className="table-wrap u-mt-8">
          <table className="table">
            <thead>
              <tr>
                <th>{t('hooks.col.name' as MessageKey)}</th>
                <th>{t('hooks.col.makes' as MessageKey)}</th>
                <th>{t('hooks.col.week' as MessageKey)}</th>
                <th>{t('hooks.col.last' as MessageKey)}</th>
                <th aria-label={t('hooks.open' as MessageKey)} />
              </tr>
            </thead>
            <tbody>
              {hooks.map((h) => (
                <tr key={h.id} data-state={h.enabled ? 'on' : 'off'}>
                  <td>
                    <strong>{h.name}</strong>
                    <div className="muted">{t(`hooks.recipe.${h.source}` as MessageKey)}</div>
                  </td>
                  <td>{t(`hooks.target.${h.target}` as MessageKey)}</td>
                  <td>
                    <span className="badge badge--active">{h.counts.ok}</span> <span className="badge">{h.counts.skipped}</span>{' '}
                    <span className={h.counts.failed ? 'badge badge--disabled' : 'badge'}>{h.counts.failed}</span>
                  </td>
                  <td className="muted">{h.lastDeliveryAt ? formatDateTime(h.lastDeliveryAt, locale) : t('hooks.never' as MessageKey)}</td>
                  <td>
                    <button className="btn btn--small" onClick={() => setOpen(h.id)} data-tour="hook-open">
                      <Icon name="chevronRight" size={16} />
                      {t('hooks.open' as MessageKey)}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <button className="btn btn--small u-mt-8" onClick={() => setAdding(true)} data-tour="hook-add">
        <Icon name="plus" size={16} />
        {t('hooks.add' as MessageKey)}
      </button>
      {adding && (
        <AddHook
          recipes={recipes}
          onClose={() => setAdding(false)}
          onMade={async (h) => {
            setAdding(false);
            await load();
            setOpen(h.id);
            toast(t('hooks.made' as MessageKey));
          }}
        />
      )}
      {current && <HookSheet hook={current} recipe={recipes.find((r) => r.key === current.source)} onClose={() => setOpen(null)} onChanged={load} />}
    </section>
  );
}

function AddHook({ recipes, onClose, onMade }: { recipes: Recipe[]; onClose: () => void; onMade: (h: InboundHook) => Promise<void> }) {
  const { t } = useI18n();
  const [recipe, setRecipe] = useState(recipes[0]?.key ?? 'custom');
  const r = recipes.find((x) => x.key === recipe);
  const [name, setName] = useState('');
  const [target, setTarget] = useState<HookTarget>(r?.target ?? 'activity');
  const [boardId, setBoardId] = useState('');
  const [boards, setBoards] = useState<{ id: string; name: string }[]>([]);
  const [senderSecret, setSenderSecret] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void get<{ boards: { id: string; name: string }[] }>('/boards').then((b) => setBoards(b.boards)).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (r) setTarget(r.target);
  }, [r]);
  const needsSecret = !!r?.auth.senderSecret;
  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const mapping = { ...(r?.mapping ?? {}), ...(target === 'task' ? { boardId } : {}) };
      const made = await post<{ hook: InboundHook }>('/inbound-hooks', { name: name.trim() || t(`hooks.recipe.${recipe}` as MessageKey), recipe, target, mapping, ...(senderSecret.trim() ? { senderSecret: senderSecret.trim() } : {}) });
      await onMade(made.hook);
    } catch (e) {
      setError(e instanceof ApiFailure ? e.body.message : t('errors.server'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      title={t('hooks.add' as MessageKey)}
      onClose={onClose}
      footer={
        <button className="btn btn--primary" disabled={busy || (target === 'task' && !boardId) || (needsSecret && senderSecret.trim().length < 8)} onClick={submit} data-tour="hook-create">
          <Icon name="plus" size={16} />
          {t('hooks.create' as MessageKey)}
        </button>
      }
    >
      <div className="form">
        <label className="field">
          <span className="field__label">{t('hooks.from' as MessageKey)}</span>
          <select className="select" value={recipe} onChange={(e) => setRecipe(e.target.value)}>
            {recipes.map((x) => (
              <option key={x.key} value={x.key}>
                {t(`hooks.recipe.${x.key}` as MessageKey)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">{t('conn.name')}</span>
          <input className="input" value={name} maxLength={120} placeholder={t(`hooks.recipe.${recipe}` as MessageKey)} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">{t('hooks.makes' as MessageKey)}</span>
          <select className="select" value={target} onChange={(e) => setTarget(e.target.value as HookTarget)}>
            {HOOK_TARGETS.map((x) => (
              <option key={x} value={x}>
                {t(`hooks.target.${x}` as MessageKey)}
              </option>
            ))}
          </select>
        </label>
        {target === 'task' && (
          <label className="field">
            <span className="field__label">{t('hooks.board' as MessageKey)}</span>
            <select className="select" value={boardId} onChange={(e) => setBoardId(e.target.value)}>
              <option value="">—</option>
              {boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {needsSecret && (
          <label className="field">
            <span className="field__label">{t('hooks.senderSecret' as MessageKey)}</span>
            <input className="input" value={senderSecret} autoComplete="off" onChange={(e) => setSenderSecret(e.target.value)} />
            <span className="field__hint">{t(`hooks.senderSecretHint.${recipe}` as MessageKey)}</span>
          </label>
        )}
        {error && <p className="error-text">{error}</p>}
      </div>
    </Dialog>
  );
}

function HookSheet({ hook, recipe, onClose, onChanged }: { hook: InboundHook; recipe?: Recipe; onClose: () => void; onChanged: () => Promise<void> }) {
  const { t, locale } = useI18n();
  const { toast } = useStore();
  const [tab, setTab] = useState<'setup' | 'map' | 'test' | 'log'>('setup');
  const [mapping, setMapping] = useState<HookMapping>(hook.mapping);
  const [sample, setSample] = useState(JSON.stringify(recipe?.sample ?? {}, null, 2));
  const [preview, setPreview] = useState<{ preview: Record<string, string>; paths: string[] } | null>(null);
  const [outcome, setOutcome] = useState<string>('');
  const [log, setLog] = useState<HookDelivery[] | null>(null);
  const [removing, setRemoving] = useState(false);
  // A task hook's board can change here: when its board is archived, the hook is fixed in place and keeps its address.
  const [boards, setBoards] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (tab === 'map' && hook.target === 'task' && !boards.length) void get<{ boards: { id: string; name: string }[] }>('/boards').then((b) => setBoards(b.boards)).catch(() => undefined);
  }, [tab, hook.target, boards.length]);
  const copy = (text: string) => void navigator.clipboard?.writeText(text).then(() => toast(t('devtools.copied')));
  const fail = (e: unknown) => toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
  useEffect(() => {
    if (tab === 'log') void get<{ deliveries: HookDelivery[] }>(`/inbound-hooks/${hook.id}/deliveries`).then((r) => setLog(r.deliveries)).catch(fail);
  }, [tab, hook.id]);
  const parsed = () => {
    try {
      return JSON.parse(sample);
    } catch {
      toast(t('hooks.test.badJson' as MessageKey), 'error');
      return undefined;
    }
  };
  const save = async () => {
    try {
      await patch(`/inbound-hooks/${hook.id}`, { mapping });
      toast(t('common.saved'));
      await onChanged();
    } catch (e) {
      fail(e);
    }
  };
  const row = (label: string, value: string, tour: string) => (
    <label className="field u-display-block u-mt-8" data-tour={tour}>
      <span className="field__label">{label}</span>
      <span className="u-display-flex u-gap-8">
        <input className="input" readOnly value={value} onFocus={(e) => e.currentTarget.select()} />
        <button className="btn btn--small" onClick={() => copy(value)}>
          {t('devtools.copy')}
        </button>
      </span>
    </label>
  );
  const set = (k: keyof HookMapping, v: string) => setMapping((m) => ({ ...m, [k]: v }));
  const setCustomer = (k: 'email' | 'domain' | 'name' | 'id', v: string) => setMapping((m) => ({ ...m, customer: { ...(m.customer ?? {}), [k]: v } }));
  return (
    <Dialog wide title={hook.name} onClose={onClose}>
      <div className="seg u-mb-12" role="tablist">
        {(['setup', 'map', 'test', 'log'] as const).map((x) => (
          <button key={x} type="button" role="tab" aria-pressed={tab === x} onClick={() => setTab(x)} data-tour={`hook-tab-${x}`}>
            {t(`hooks.tab.${x}` as MessageKey)}
          </button>
        ))}
      </div>
      {tab === 'setup' && (
        <div className="form">
          <p className="field__hint">{t(`hooks.how.${hook.source}` as MessageKey)}</p>
          {row(t('hooks.url' as MessageKey), hook.url, 'hook-url')}
          {hook.secret ? row(t('hooks.secret' as MessageKey), hook.secret, 'hook-secret') : <p className="field__hint">{t(hook.senderSecretSet ? ('hooks.senderSet' as MessageKey) : ('hooks.senderMissing' as MessageKey))}</p>}
          <p className="field__hint">{t(`hooks.scheme.${hook.auth.scheme}` as MessageKey)}</p>
          <div className="toolbar u-mt-12">
            <button className="btn btn--small" onClick={async () => (await patch(`/inbound-hooks/${hook.id}`, { enabled: !hook.enabled }).catch(fail), await onChanged())}>
              {t(hook.enabled ? ('hooks.pause' as MessageKey) : ('hooks.resume' as MessageKey))}
            </button>
            {hook.secret && (
              <button className="btn btn--small btn--quiet" onClick={async () => (await patch(`/inbound-hooks/${hook.id}`, { rotate: true }).catch(fail), await onChanged(), toast(t('hooks.rotated' as MessageKey)))}>
                {t('hooks.rotate' as MessageKey)}
              </button>
            )}
            <button className="btn btn--small btn--quiet" onClick={() => setRemoving(true)}>
              {t('hooks.remove' as MessageKey)}
            </button>
          </div>
        </div>
      )}
      {tab === 'map' && (
        <div className="form" data-tour="hook-mapping">
          <p className="field__hint">{t('hooks.map.lede' as MessageKey)}</p>
          <datalist id="hook-paths">{(preview?.paths ?? []).map((p) => <option key={p} value={`{{${p}}}`} />)}</datalist>
          <label className="field">
            <span className="field__label">{t('hooks.field.externalId' as MessageKey)}</span>
            <input className="input" list="hook-paths" value={mapping.externalId ?? ''} onChange={(e) => set('externalId', e.target.value)} />
          </label>
          <div className="form__row">
            {(['email', 'domain', 'name'] as const).map((k) => (
              <label className="field" key={k}>
                <span className="field__label">{t(`hooks.customer.${k}` as MessageKey)}</span>
                <input className="input" list="hook-paths" value={mapping.customer?.[k] ?? ''} onChange={(e) => setCustomer(k, e.target.value)} />
              </label>
            ))}
          </div>
          {hook.target === 'task' && (
            <label className="field">
              <span className="field__label">{t('hooks.board' as MessageKey)}</span>
              <select className="select" value={mapping.boardId ?? ''} onChange={(e) => set('boardId', e.target.value)} data-tour="hook-board">
                <option value="">—</option>
                {boards.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {FIELDS[hook.target].map((k) => (
            <label className="field" key={k}>
              <span className="field__label">{t(`hooks.field.${k}` as MessageKey)}</span>
              <input className="input" list="hook-paths" value={String(mapping[k] ?? '')} onChange={(e) => set(k, e.target.value)} />
            </label>
          ))}
          <div className="form__row">
            <label className="field">
              <span className="field__label">{t('hooks.when.value' as MessageKey)}</span>
              <input className="input" list="hook-paths" value={mapping.when?.value ?? ''} onChange={(e) => setMapping((m) => ({ ...m, when: e.target.value ? { value: e.target.value, equals: m.when?.equals ?? '' } : null }))} />
            </label>
            <label className="field">
              <span className="field__label">{t('hooks.when.equals' as MessageKey)}</span>
              <input className="input" value={mapping.when?.equals ?? ''} onChange={(e) => setMapping((m) => ({ ...m, when: { value: m.when?.value ?? '', equals: e.target.value } }))} />
            </label>
          </div>
          <div className="toolbar">
            <button className="btn btn--primary btn--small" onClick={save} data-tour="hook-save">
              <Icon name="check" size={16} />
              {t('common.save')}
            </button>
          </div>
        </div>
      )}
      {tab === 'test' && (
        <div className="form" data-tour="hook-test">
          <p className="field__hint">{t('hooks.test.lede' as MessageKey)}</p>
          <textarea className="input" rows={10} value={sample} onChange={(e) => setSample(e.target.value)} />
          <div className="toolbar">
            <button
              className="btn btn--small"
              data-tour="hook-preview"
              onClick={async () => {
                const payload = parsed();
                if (payload === undefined) return;
                try {
                  setPreview(await post(`/inbound-hooks/${hook.id}/test`, { payload, dryRun: true }));
                } catch (e) {
                  fail(e);
                }
              }}
            >
              <Icon name="eye" size={16} />
              {t('hooks.test.preview' as MessageKey)}
            </button>
            <button
              className="btn btn--primary btn--small"
              data-tour="hook-send-test"
              onClick={async () => {
                const payload = parsed();
                if (payload === undefined) return;
                try {
                  const r = await post<{ status: string; error?: string; result?: { kind: string; how: string } }>(`/inbound-hooks/${hook.id}/test`, { payload });
                  setOutcome(r.status === 'ok' ? t('hooks.test.ok' as MessageKey, { what: t(`hooks.target.${r.result?.kind ?? hook.target}` as MessageKey), action: t(`hooks.action.${r.result?.how ?? 'created'}` as MessageKey) }) : `${t(`hooks.status.${r.status}` as MessageKey)}: ${r.error ?? ''}`);
                  await onChanged();
                } catch (e) {
                  fail(e);
                }
              }}
            >
              <Icon name="send" size={16} />
              {t('hooks.test.send' as MessageKey)}
            </button>
          </div>
          {preview && (
            <table className="table u-mt-8">
              <tbody>
                {Object.entries(preview.preview).map(([k, v]) => (
                  <tr key={k}>
                    <th>{k}</th>
                    <td>{v || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {outcome && (
            <p className="notice u-mt-8" role="status">
              {outcome}
            </p>
          )}
        </div>
      )}
      {tab === 'log' && (
        <div className="table-wrap" data-tour="hook-log">
          {log && log.length === 0 && <p className="field__hint">{t('hooks.log.empty' as MessageKey)}</p>}
          {log && log.length > 0 && (
            <table className="table">
              <thead>
                <tr>
                  <th>{t('hooks.log.when' as MessageKey)}</th>
                  <th>{t('hooks.log.status' as MessageKey)}</th>
                  <th>{t('hooks.log.event' as MessageKey)}</th>
                  <th>{t('hooks.log.what' as MessageKey)}</th>
                </tr>
              </thead>
              <tbody>
                {log.map((d) => (
                  <tr key={d.id}>
                    <td className="muted">{formatDateTime(d.receivedAt, locale)}</td>
                    <td>
                      <span className={d.status === 'ok' ? 'badge badge--active' : d.status === 'skipped' ? 'badge' : 'badge badge--disabled'}>{t(`hooks.status.${d.status}` as MessageKey)}</span>
                      {d.test && <span className="badge u-ms-4">{t('hooks.log.test' as MessageKey)}</span>}
                    </td>
                    <td className="muted">{d.eventId ?? '—'}</td>
                    <td>{d.result ? `${t(`hooks.target.${d.result.kind}` as MessageKey)} · ${t(`hooks.action.${d.result.how}` as MessageKey)}` : whyText(t, d.error)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      {removing && (
        <Confirm
          danger
          title={t('hooks.remove' as MessageKey)}
          body={t('hooks.removeBody' as MessageKey)}
          confirmLabel={t('hooks.remove' as MessageKey)}
          onClose={() => setRemoving(false)}
          onConfirm={async () => {
            await del(`/inbound-hooks/${hook.id}`).catch(fail);
            onClose();
            await onChanged();
          }}
        />
      )}
    </Dialog>
  );
}
