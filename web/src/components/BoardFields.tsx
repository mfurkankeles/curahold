// A board's own task fields ("Type", "Outcome", "Link"…) and its intake
// form, edited inside the board's settings and saved with the rest.
import { labelOf, optionKey } from '../../../shared/src/fields';
import { TASK_FIELD_TYPES, type BoardForm, type Column, type TaskField, type TaskFieldType } from '../../../shared/src/model';
import { useI18n } from '../lib/i18n';
import { Icon } from './icons';

const keyOf = (label: string, taken: Set<string>) => {
  const base = optionKey(label).replace(/^[^a-z]+/, '') || 'field';
  let k = base.slice(0, 36);
  let i = 2;
  while (taken.has(k)) k = `${base.slice(0, 34)}_${i++}`;
  return k;
};

export function TaskFieldsEditor({ value, onChange }: { value: TaskField[]; onChange: (v: TaskField[]) => void }) {
  const { t, locale } = useI18n();
  const set = (i: number, patch: Partial<TaskField>) => onChange(value.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const add = () => {
    const label = t('boardFields.newName');
    onChange([...value, { key: keyOf(label, new Set(value.map((f) => f.key))), label: { [locale]: label }, type: 'text' }]);
  };
  return (
    <div className="field">
      <span className="field__label">{t('boardFields.title')}</span>
      <span className="field__hint">{t('boardFields.hint')}</span>
      <div className="bfields">
        {value.map((f, i) => (
          <div key={f.key} className="bfields__row">
            <input className="input" value={labelOf(f.label, locale)} aria-label={t('boardFields.name')} maxLength={80} onChange={(e) => set(i, { label: { ...f.label, [locale]: e.target.value } })} />
            <select
              className="select"
              value={f.type}
              aria-label={t('boardFields.type')}
              onChange={(e) => {
                const type = e.target.value as TaskFieldType;
                set(i, { type, options: type === 'select' ? (f.options?.length ? f.options : [{ key: 'a', label: { [locale]: t('boardFields.option', { n: 1 }) } }, { key: 'b', label: { [locale]: t('boardFields.option', { n: 2 }) } }]) : undefined });
              }}
            >
              {TASK_FIELD_TYPES.map((ty) => (
                <option key={ty} value={ty}>
                  {t(`boardFields.type.${ty}` as any)}
                </option>
              ))}
            </select>
            <label className="checkbox bfields__req" title={t('task.fieldRequired')}>
              <input type="checkbox" checked={f.required === 'done'} onChange={(e) => set(i, { required: e.target.checked ? 'done' : null })} />
              <span>{t('boardFields.required')}</span>
            </label>
            <button type="button" className="btn btn--quiet btn--icon btn--small" aria-label={t('common.remove')} title={t('common.remove')} onClick={() => onChange(value.filter((_, j) => j !== i))}>
              <Icon name="trash" size={15} />
            </button>
            {f.type === 'select' && (
              <div className="bfields__options">
                {(f.options ?? []).map((o, oi) => (
                  <span key={o.key} className="option-chip">
                    <input
                      className="option-chip__input"
                      value={labelOf(o.label, locale)}
                      size={Math.max(4, labelOf(o.label, locale).length)}
                      aria-label={t('boardFields.option', { n: oi + 1 })}
                      maxLength={80}
                      onChange={(e) => set(i, { options: f.options!.map((x, xi) => (xi === oi ? { ...x, label: { ...x.label, [locale]: e.target.value } } : x)) })}
                    />
                    {(f.options?.length ?? 0) > 1 && (
                      <button type="button" aria-label={t('common.remove')} onClick={() => set(i, { options: f.options!.filter((_, xi) => xi !== oi) })}>
                        ×
                      </button>
                    )}
                  </span>
                ))}
                <button
                  type="button"
                  className="linkbtn"
                  onClick={() => {
                    const label = t('boardFields.option', { n: (f.options?.length ?? 0) + 1 });
                    set(i, { options: [...(f.options ?? []), { key: keyOf(label, new Set((f.options ?? []).map((o) => o.key))), label: { [locale]: label } }] });
                  }}
                >
                  {t('boardFields.addOption')}
                </button>
              </div>
            )}
          </div>
        ))}
        {value.length < 20 && (
          <button type="button" className="btn btn--small bfields__add" onClick={add}>
            <Icon name="plus" size={15} />
            {t('boardFields.add')}
          </button>
        )}
      </div>
    </div>
  );
}

const FORM_BASICS = ['description', 'account', 'due'] as const;

export function BoardFormEditor({ value, fields, columns, onChange }: { value: BoardForm | null; fields: TaskField[]; columns: Column[]; onChange: (v: BoardForm | null) => void }) {
  const { t, locale, words } = useI18n();
  const form = value ?? { on: false, fields: ['description'], column: null };
  const toggle = (k: string) => onChange({ ...form, fields: form.fields.includes(k) ? form.fields.filter((x) => x !== k) : [...form.fields, k] });
  return (
    <div className="field">
      <label className="checkbox">
        <input type="checkbox" checked={form.on} onChange={(e) => onChange({ ...form, on: e.target.checked })} />
        <strong>{t('boardForm.on')}</strong>
      </label>
      <span className="field__hint">{t('boardForm.hint')}</span>
      {form.on && (
        <div className="bform">
          <label className="field">
            <span className="field__label">{t('boardForm.title')}</span>
            <input className="input" value={form.title ?? ''} maxLength={120} placeholder={t('boardForm.titlePlaceholder')} onChange={(e) => onChange({ ...form, title: e.target.value })} />
          </label>
          <label className="field">
            <span className="field__label">{t('boardForm.intro')}</span>
            <textarea className="textarea" style={{ minHeight: 60 }} value={form.intro ?? ''} maxLength={1000} onChange={(e) => onChange({ ...form, intro: e.target.value })} />
          </label>
          <div className="field">
            <span className="field__label">{t('boardForm.asks')}</span>
            <div className="chips-row">
              {FORM_BASICS.map((k) => (
                <label key={k} className="checkbox">
                  <input type="checkbox" checked={form.fields.includes(k)} onChange={() => toggle(k)} />
                  <span>{k === 'account' ? words.one : t(`boardForm.field.${k}` as any)}</span>
                </label>
              ))}
              {fields.map((f) => (
                <label key={f.key} className="checkbox">
                  <input type="checkbox" checked={form.fields.includes(`f:${f.key}`)} onChange={() => toggle(`f:${f.key}`)} />
                  <span>{labelOf(f.label, locale)}</span>
                </label>
              ))}
            </div>
          </div>
          <label className="field">
            <span className="field__label">{t('boardForm.column')}</span>
            <select className="select" value={form.column ?? ''} onChange={(e) => onChange({ ...form, column: e.target.value || null })}>
              {columns.map((col, i) => (
                <option key={col.key} value={i === 0 ? '' : col.key}>
                  {col.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}
