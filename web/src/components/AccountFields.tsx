// The facts a company keeps about each account (renewal date, annual
// value, health…). Add, rename, reorder, change choices — no code.
import { useState } from 'react';
import { labelOf, optionKey } from '../../../shared/src/fields';
import type { MessageKey } from '../../../shared/src/i18n';
import { FIELD_TYPES, type AccountField, type FieldType } from '../../../shared/src/model';
import { ApiFailure, api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useStore } from '../lib/store';

const newKey = (label: string, taken: Set<string>) => {
  let k = optionKey(label).replace(/^[^a-z]+/, '') || 'field';
  k = k.slice(0, 36);
  let n = 2;
  let out = k;
  while (taken.has(out)) out = `${k}_${n++}`;
  return out;
};

export function AccountFieldsEditor() {
  const { t, locale } = useI18n();
  const { me, reloadMe, toast } = useStore();
  const other = locale === 'tr' ? 'en' : 'tr';
  const [list, setList] = useState<AccountField[]>(() => JSON.parse(JSON.stringify(me.org.accountFields)));
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState<{ label: string; type: FieldType } | null>(null);
  const dirty = JSON.stringify(list) !== JSON.stringify(me.org.accountFields);

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
      await api('PUT', '/account-fields', { fields: list });
      await reloadMe();
      toast(t('common.saved'));
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fields-editor">
      <p className="sheet__hint">{t('fields.hint')}</p>
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
              <input className="input" value={f.label[locale] ?? ''} placeholder={labelOf(f.label, other)} aria-label={t('fields.label')} onChange={(e) => upd(i, { label: { ...f.label, [locale]: e.target.value } })} maxLength={60} />
              <input className="input" value={f.label[other] ?? ''} placeholder={t(other === 'en' ? 'fields.labelEn' : 'fields.labelTr')} aria-label={t(other === 'en' ? 'fields.labelEn' : 'fields.labelTr')} onChange={(e) => upd(i, { label: { ...f.label, [other]: e.target.value } })} maxLength={60} />
            </div>
            <div className="field-row__meta">
              <span className="badge">{t(`fields.type.${f.type}` as MessageKey)}</span>
              {f.type === 'select' && (
                <div className="options">
                  {(f.options ?? []).map((o, k) => (
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
              <input className="input" autoFocus value={adding.label} placeholder={t('fields.newLabel')} aria-label={t('fields.label')} onChange={(e) => setAdding({ ...adding, label: e.target.value })} maxLength={60} />
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
        <button className="btn btn--small" onClick={() => setAdding({ label: '', type: 'text' })}>
          {t('fields.add')}
        </button>
      )}
      <div className="savebar" data-dirty={dirty ? 'true' : 'false'}>
        <span>{dirty ? t('fields.unsaved') : t('fields.allSaved')}</span>
        <button className="btn btn--quiet btn--small" disabled={!dirty || busy} onClick={() => setList(JSON.parse(JSON.stringify(me.org.accountFields)))}>
          {t('fields.discard')}
        </button>
        <button className="btn btn--primary btn--small" disabled={!dirty || busy} onClick={save}>
          {t('common.save')}
        </button>
      </div>
    </div>
  );
}
