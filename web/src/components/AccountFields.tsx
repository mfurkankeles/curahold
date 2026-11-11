// The facts a company keeps about each account (renewal date, annual
// value, health…) and about the records under it (contacts, opportunities,
// risks…). Add, rename, reorder, change choices — no code. Account fields
// can also be worked out from records ("open pipeline").
import { useCallback, useEffect, useState } from 'react';
import { labelOf, optionKey } from '../../../shared/src/fields';
import type { MessageKey } from '../../../shared/src/i18n';
import { FIELD_TYPES, type AccountField, type FieldType, type Rollup } from '../../../shared/src/model';
import { ROLLUP_PRESETS, typeLabel, type RecordType } from '../../../shared/src/records';
import { ApiFailure, api, del, get, patch, post } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useStore } from '../lib/store';
import { Confirm, Dialog } from './ui';

const newKey = (label: string, taken: Set<string>) => {
  let k = optionKey(label).replace(/^[^a-z]+/, '') || 'field';
  k = k.slice(0, 36);
  let n = 2;
  let out = k;
  while (taken.has(out)) out = `${k}_${n++}`;
  return out;
};

export function useRecordTypes() {
  const [types, setTypes] = useState<RecordType[] | null>(null);
  const load = useCallback(() => get<{ types: RecordType[] }>('/record-types').then((r) => setTypes(r.types)), []);
  useEffect(() => {
    void load();
  }, [load]);
  return { types, load };
}

/** "Sum of Amount on open Opportunities" — a rollup in words. */
export function useRollupText(types: RecordType[] | null) {
  const { t, locale } = useI18n();
  return (r: Rollup) => {
    const type = types?.find((x) => x.key === r.type);
    const name = type ? typeLabel(type, locale) : r.type;
    const field = r.field ? labelOf(type?.fields.find((f) => f.key === r.field)?.label, locale) || r.field : '';
    const whereField = r.where ? type?.fields.find((f) => f.key === r.where!.field) : null;
    const where = r.where ? labelOf(whereField?.options?.find((o) => o.key === r.where!.option)?.label, locale) || r.where.option : '';
    return t(`fields.rollup.${r.fn}${r.where ? 'Where' : ''}` as MessageKey, { type: name, field, value: where });
  };
}

function FieldListEditor({ initial, onSave, rollups, types }: { initial: AccountField[]; onSave: (list: AccountField[]) => Promise<void>; rollups?: boolean; types?: RecordType[] | null }) {
  const { t, locale } = useI18n();
  const { toast } = useStore();
  const other = locale === 'tr' ? 'en' : 'tr';
  const [list, setList] = useState<AccountField[]>(() => JSON.parse(JSON.stringify(initial)));
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState<{ label: string; type: FieldType } | null>(null);
  const [rolling, setRolling] = useState(false);
  const rollupText = useRollupText(types ?? null);
  useEffect(() => setList(JSON.parse(JSON.stringify(initial))), [initial]);
  const dirty = JSON.stringify(list) !== JSON.stringify(initial);

  const upd = (i: number, f: Partial<AccountField>) => setList(list.map((x, j) => (j === i ? { ...x, ...f } : x)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    setList(next);
  };
  const save = async () => {
    setBusy(true);
    try {
      await onSave(list);
      toast(t('common.saved'));
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fields-editor">
      {list.length === 0 && <div className="empty">{t('fields.empty')}</div>}
      {list.map((f, i) => (
        <div className="field-row" key={f.key}>
          <div className="field-row__order">
            <button className="btn btn--quiet btn--small" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t('fields.up')}>
              ↑
            </button>
            <button className="btn btn--quiet btn--small" disabled={i === list.length - 1} onClick={() => move(i, 1)} aria-label={t('fields.down')}>
              ↓
            </button>
          </div>
          <div className="field-row__main">
            <div className="form__row">
              <input className="input" value={f.label[locale] ?? ''} placeholder={labelOf(f.label, other)} aria-label={t('fields.label')} onChange={(e) => upd(i, { label: { ...f.label, [locale]: e.target.value } })} maxLength={80} />
              <input className="input" value={f.label[other] ?? ''} placeholder={t(other === 'en' ? 'fields.labelEn' : 'fields.labelTr')} aria-label={t(other === 'en' ? 'fields.labelEn' : 'fields.labelTr')} onChange={(e) => upd(i, { label: { ...f.label, [other]: e.target.value } })} maxLength={80} />
            </div>
            <div className="field-row__meta">
              <span className="badge">{t(`fields.type.${f.type}` as MessageKey)}</span>
              {f.rollup && <span className="badge badge--calc">{t('fields.calculated')}: {rollupText(f.rollup)}</span>}
              {f.type === 'select' && !f.rollup && (
                <div className="options">
                  {(f.options ?? []).slice(0, 40).map((o, k) => (
                    <span className="option-chip" key={o.key}>
                      <input
                        className="option-chip__input"
                        value={o.label[locale] ?? labelOf(o.label, other)}
                        aria-label={t('fields.option')}
                        onChange={(e) => upd(i, { options: (f.options ?? []).map((x, m) => (m === k ? { ...x, label: { ...x.label, [locale]: e.target.value } } : x)) })}
                        size={Math.max(4, (o.label[locale] ?? labelOf(o.label, other)).length)}
                      />
                      <button aria-label={t('common.remove')} onClick={() => upd(i, { options: (f.options ?? []).filter((_, m) => m !== k) })}>
                        ✕
                      </button>
                    </span>
                  ))}
                  {(f.options?.length ?? 0) > 40 && <span className="muted">{t('fields.moreOptions', { n: (f.options?.length ?? 0) - 40 })}</span>}
                  <button
                    className="btn btn--quiet btn--small"
                    onClick={() => {
                      const label = t('fields.newOption');
                      const taken = new Set((f.options ?? []).map((o) => o.key));
                      upd(i, { options: [...(f.options ?? []), { key: newKey(label, taken), label: { [locale]: label } }] });
                    }}
                  >
                    {t('fields.addOption')}
                  </button>
                </div>
              )}
            </div>
          </div>
          <button className="btn btn--quiet btn--small" onClick={() => setList(list.filter((_, j) => j !== i))} aria-label={t('common.remove')}>
            ✕
          </button>
        </div>
      ))}
      {adding ? (
        <div className="field-row field-row--new">
          <div className="field-row__main">
            <div className="form__row">
              <input className="input" autoFocus value={adding.label} placeholder={t('fields.newLabel')} aria-label={t('fields.label')} onChange={(e) => setAdding({ ...adding, label: e.target.value })} maxLength={80} />
              <select className="select" value={adding.type} aria-label={t('fields.type')} onChange={(e) => setAdding({ ...adding, type: e.target.value as FieldType })}>
                {FIELD_TYPES.map((ty) => (
                  <option key={ty} value={ty}>
                    {t(`fields.type.${ty}` as MessageKey)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="inline-actions">
            <button
              className="btn btn--small"
              disabled={!adding.label.trim()}
              onClick={() => {
                const key = newKey(adding.label, new Set(list.map((x) => x.key)));
                setList([...list, { key, label: { [locale]: adding.label.trim() }, type: adding.type, ...(adding.type === 'select' ? { options: [] } : {}) }]);
                setAdding(null);
              }}
            >
              {t('common.add')}
            </button>
            <button className="btn btn--quiet btn--small" onClick={() => setAdding(null)}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <div className="toolbar">
          <button className="btn btn--small" onClick={() => setAdding({ label: '', type: 'text' })}>
            {t('fields.add')}
          </button>
          {rollups && (types?.length ?? 0) > 0 && (
            <button className="btn btn--small" onClick={() => setRolling(true)}>
              {t('fields.addCalculated')}
            </button>
          )}
        </div>
      )}
      <div className="savebar" data-dirty={dirty ? 'true' : 'false'}>
        <span>{dirty ? t('fields.unsaved') : t('fields.allSaved')}</span>
        <button className="btn btn--quiet btn--small" disabled={!dirty || busy} onClick={() => setList(JSON.parse(JSON.stringify(initial)))}>
          {t('fields.discard')}
        </button>
        <button className="btn btn--primary btn--small" disabled={!dirty || busy} onClick={save}>
          {t('common.save')}
        </button>
      </div>
      {rolling && types && <RollupDialog types={types} taken={new Set(list.map((x) => x.key))} onClose={() => setRolling(false)} onAdd={(f) => setList([...list, f])} />}
    </div>
  );
}

function RollupDialog({ types, taken, onClose, onAdd }: { types: RecordType[]; taken: Set<string>; onClose: () => void; onAdd: (f: AccountField) => void }) {
  const { t, locale } = useI18n();
  const [typeKey, setTypeKey] = useState(types[0].key);
  const type = types.find((x) => x.key === typeKey)!;
  const [fn, setFn] = useState<Rollup['fn']>('count');
  const [field, setField] = useState('');
  const [whereField, setWhereField] = useState('');
  const [whereOption, setWhereOption] = useState('');
  const [label, setLabel] = useState('');
  const presets = ROLLUP_PRESETS.filter((p) => types.some((x) => x.kind === p.kind && x.key === p.field.rollup!.type) && !taken.has(p.field.key));
  const numeric = type.fields.filter((f) => f.type === 'number' || f.type === 'money');
  const comparable = type.fields.filter((f) => f.type === 'number' || f.type === 'money' || f.type === 'date');
  const selects = type.fields.filter((f) => f.type === 'select');
  const choices = fn === 'sum' ? numeric : comparable;
  const target = type.fields.find((f) => f.key === field);
  const outType: FieldType = fn === 'count' ? 'number' : target?.type === 'date' ? 'date' : target?.type === 'money' ? 'money' : 'number';
  const ready = label.trim() && (fn === 'count' || field) && (!whereField || whereOption);
  return (
    <Dialog
      title={t('fields.addCalculated')}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--quiet" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            className="btn btn--primary"
            disabled={!ready}
            onClick={() => {
              onAdd({
                key: newKey(label, taken),
                label: { [locale]: label.trim() },
                type: outType,
                rollup: { type: typeKey, fn, ...(fn !== 'count' ? { field } : {}), ...(whereField ? { where: { field: whereField, option: whereOption } } : {}) },
              });
              onClose();
            }}
          >
            {t('common.add')}
          </button>
        </>
      }
    >
      <p className="field__hint">{t('fields.calculatedHint')}</p>
      {presets.length > 0 && (
        <div className="field">
          <span className="field__label">{t('fields.calculatedPresets')}</span>
          <div className="chips-row">
            {presets.map((p) => (
              <button
                key={p.field.key}
                className="btn btn--small"
                onClick={() => {
                  onAdd(JSON.parse(JSON.stringify(p.field)));
                  onClose();
                }}
              >
                {labelOf(p.field.label, locale)}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="form">
        <label className="field">
          <span className="field__label">{t('fields.label')}</span>
          <input className="input" value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} />
        </label>
        <div className="form__row">
          <label className="field">
            <span className="field__label">{t('fields.calc.what')}</span>
            <select className="select" value={fn} onChange={(e) => setFn(e.target.value as Rollup['fn'])}>
              {(['count', 'sum', 'min', 'max'] as const).map((x) => (
                <option key={x} value={x}>
                  {t(`fields.calc.${x}` as MessageKey)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">{t('fields.calc.of')}</span>
            <select className="select" value={typeKey} onChange={(e) => { setTypeKey(e.target.value); setField(''); setWhereField(''); }}>
              {types.map((x) => (
                <option key={x.key} value={x.key}>
                  {typeLabel(x, locale)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {fn !== 'count' && (
          <label className="field">
            <span className="field__label">{t('fields.calc.field')}</span>
            <select className="select" value={field} onChange={(e) => setField(e.target.value)}>
              <option value="" />
              {choices.map((f) => (
                <option key={f.key} value={f.key}>
                  {labelOf(f.label, locale)}
                </option>
              ))}
            </select>
          </label>
        )}
        {selects.length > 0 && (
          <div className="form__row">
            <label className="field">
              <span className="field__label">{t('fields.calc.onlyWhere')}</span>
              <select className="select" value={whereField} onChange={(e) => { setWhereField(e.target.value); setWhereOption(''); }}>
                <option value="">{t('fields.calc.all')}</option>
                {selects.map((f) => (
                  <option key={f.key} value={f.key}>
                    {labelOf(f.label, locale)}
                  </option>
                ))}
              </select>
            </label>
            {whereField && (
              <label className="field">
                <span className="field__label">{t('fields.calc.is')}</span>
                <select className="select" value={whereOption} onChange={(e) => setWhereOption(e.target.value)}>
                  <option value="" />
                  {(selects.find((f) => f.key === whereField)?.options ?? []).map((o) => (
                    <option key={o.key} value={o.key}>
                      {labelOf(o.label, locale)}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}

export function AccountFieldsEditor() {
  const { t } = useI18n();
  const { me, reloadMe } = useStore();
  const { types } = useRecordTypes();
  return (
    <>
      <p className="sheet__hint">{t('fields.hint')}</p>
      <FieldListEditor
        initial={me.org.accountFields}
        rollups
        types={types}
        onSave={async (list) => {
          await api('PUT', '/account-fields', { fields: list });
          await reloadMe();
        }}
      />
    </>
  );
}

/** Settings → kinds of records: contacts, opportunities and the company's own. */
export function RecordTypesEditor() {
  const { t, locale } = useI18n();
  const { toast, reloadMe } = useStore();
  const { types, load } = useRecordTypes();
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<RecordType | null>(null);
  if (!types) return <div className="empty">{t('common.loading')}</div>;
  const has = (k: string) => types.some((x) => x.kind === k);
  const addBuiltin = async (kind: 'contact' | 'opportunity') => {
    try {
      await post('/record-types', { kind });
      await load();
      await reloadMe();
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
    }
  };
  return (
    <div className="record-types">
      <p className="sheet__hint">{t('records.types.hint')}</p>
      {types.length === 0 && <div className="empty">{t('records.types.empty')}</div>}
      {types.map((ty) => (
        <section className="sheet record-type" key={ty.id}>
          <div className="record-type__head">
            <button className="record-type__toggle" aria-expanded={open === ty.id} onClick={() => setOpen(open === ty.id ? null : ty.id)}>
              <strong>{typeLabel(ty, locale)}</strong>
              <span className="muted">{t('records.types.summary', { n: ty.count ?? 0, fields: ty.fields.length })}</span>
            </button>
            {ty.kind !== 'custom' && <span className="badge">{t(`records.kind.${ty.kind}` as MessageKey)}</span>}
            <button className="btn btn--quiet btn--small" onClick={() => setRemoving(ty)}>
              {t('common.delete')}
            </button>
          </div>
          {open === ty.id && (
            <>
              <TypeNames type={ty} onSaved={load} />
              <FieldListEditor
                initial={ty.fields}
                onSave={async (fields) => {
                  await patch(`/record-types/${ty.id}`, { fields });
                  await load();
                }}
              />
            </>
          )}
        </section>
      ))}
      <div className="toolbar" style={{ marginTop: 12 }}>
        {!has('contact') && (
          <button className="btn btn--small" onClick={() => addBuiltin('contact')}>
            {t('records.types.addContacts')}
          </button>
        )}
        {!has('opportunity') && (
          <button className="btn btn--small" onClick={() => addBuiltin('opportunity')}>
            {t('records.types.addOpportunities')}
          </button>
        )}
        <button className="btn btn--small" onClick={() => setAdding(true)}>
          {t('records.types.addOwn')}
        </button>
      </div>
      {adding && <NewType onClose={() => setAdding(false)} onDone={load} />}
      {removing && (
        <Confirm
          title={t('records.types.deleteTitle', { name: typeLabel(removing, locale) })}
          body={t('records.types.deleteBody')}
          confirmLabel={t('common.delete')}
          danger
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            try {
              await del(`/record-types/${removing.id}`);
            } catch (e) {
              toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
            }
            await load();
          }}
        />
      )}
    </div>
  );
}

function TypeNames({ type, onSaved }: { type: RecordType; onSaved: () => unknown }) {
  const { t, locale } = useI18n();
  const { toast } = useStore();
  const [one, setOne] = useState(type.name.one[locale] ?? labelOf(type.name.one, locale));
  const [other, setOther] = useState(type.name.other[locale] ?? labelOf(type.name.other, locale));
  const changed = one !== labelOf(type.name.one, locale) || other !== labelOf(type.name.other, locale);
  return (
    <div className="form__row" style={{ margin: '10px 0 14px' }}>
      <label className="field">
        <span className="field__label">{t('records.types.one')}</span>
        <input className="input" value={one} maxLength={60} onChange={(e) => setOne(e.target.value)} />
      </label>
      <label className="field">
        <span className="field__label">{t('records.types.other')}</span>
        <input className="input" value={other} maxLength={60} onChange={(e) => setOther(e.target.value)} />
      </label>
      <button
        className="btn btn--small"
        style={{ alignSelf: 'end' }}
        disabled={!changed || !one.trim() || !other.trim()}
        onClick={async () => {
          try {
            await patch(`/record-types/${type.id}`, { name: { one: { ...type.name.one, [locale]: one.trim() }, other: { ...type.name.other, [locale]: other.trim() } } });
            toast(t('common.saved'));
            await onSaved();
          } catch (e) {
            toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
          }
        }}
      >
        {t('common.save')}
      </button>
    </div>
  );
}

function NewType({ onClose, onDone }: { onClose: () => void; onDone: () => unknown }) {
  const { t, locale } = useI18n();
  const { toast } = useStore();
  const [one, setOne] = useState('');
  const [other, setOther] = useState('');
  return (
    <Dialog
      title={t('records.types.addOwn')}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--quiet" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            className="btn btn--primary"
            disabled={!one.trim() || !other.trim()}
            onClick={async () => {
              try {
                await post('/record-types', { kind: 'custom', name: { one: { [locale]: one.trim() }, other: { [locale]: other.trim() } } });
                await onDone();
                onClose();
              } catch (e) {
                toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
              }
            }}
          >
            {t('common.create')}
          </button>
        </>
      }
    >
      <p className="field__hint">{t('records.types.ownHint')}</p>
      <div className="form__row">
        <label className="field">
          <span className="field__label">{t('records.types.one')}</span>
          <input className="input" autoFocus value={one} maxLength={60} placeholder={t('records.types.onePlaceholder')} onChange={(e) => setOne(e.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">{t('records.types.other')}</span>
          <input className="input" value={other} maxLength={60} placeholder={t('records.types.otherPlaceholder')} onChange={(e) => setOther(e.target.value)} />
        </label>
      </div>
    </Dialog>
  );
}
