// A customer's stakeholders as an org chart. Drag a person onto someone to
// make them report to that person, or onto the top strip to put them at the
// top. Works with a mouse, a finger (the ⠿ handle) and the keyboard (the
// menu on each card). Colours show where each person stands towards us.
import { useEffect, useMemo, useRef, useState } from 'react';
import { labelOf } from '../../../shared/src/fields';
import type { AccountField } from '../../../shared/src/model';
import { STANCES, type AppRecord, type RecordType } from '../../../shared/src/records';
import { ApiFailure, patch } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useStore } from '../lib/store';
import { Dialog, initials, RowMenu } from './ui';

export const STANCE_KEYS = STANCES.map((s) => s.key);
// A brand name and its mark, not text to translate.
const LINKEDIN = 'LinkedIn';
const LINKEDIN_MARK = 'in';

/** Where someone stands, as a small coloured label (or nothing when unknown). */
export function StanceBadge({ field, value }: { field?: AccountField; value: unknown }) {
  const { locale } = useI18n();
  if (!value) return null;
  const label = labelOf(field?.options?.find((o) => o.key === value)?.label, locale) || String(value);
  return (
    <span className="stance" data-stance={STANCE_KEYS.includes(String(value)) ? String(value) : 'other'}>
      {label}
    </span>
  );
}

function descendants(id: string, children: Map<string, AppRecord[]>): Set<string> {
  const out = new Set<string>();
  const walk = (x: string) => {
    for (const c of children.get(x) ?? []) {
      if (out.has(c.id)) continue;
      out.add(c.id);
      walk(c.id);
    }
  };
  walk(id);
  return out;
}

interface Drag {
  id: string;
  x: number;
  y: number;
  /** Not a drag until the pointer moved a little, so a click still opens the card. */
  live: boolean;
  startX: number;
  startY: number;
  target: string | 'root' | null;
}

export function OrgChart({ type, records, onChanged, onOpen, onAdd }: { type: RecordType; records: AppRecord[]; onChanged: () => void; onOpen: (r: AppRecord) => void; onAdd: (parentId: string | null) => void }) {
  const { t, locale } = useI18n();
  const { canWrite, toast } = useStore();
  const [drag, setDrag] = useState<Drag | null>(null);
  const [moving, setMoving] = useState<AppRecord | null>(null);
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;
  // The click that ends a drag must not also open the card.
  const justDropped = useRef(false);
  const field = (k: string) => type.fields.find((f) => f.key === k);
  const stanceField = field('stance');
  const decisionField = field('decision');

  const { roots, children } = useMemo(() => {
    const ids = new Set(records.map((r) => r.id));
    const children = new Map<string, AppRecord[]>();
    const roots: AppRecord[] = [];
    for (const r of records) {
      if (r.parentId && ids.has(r.parentId)) children.set(r.parentId, [...(children.get(r.parentId) ?? []), r]);
      else roots.push(r);
    }
    return { roots, children };
  }, [records]);

  const move = async (id: string, parentId: string | null) => {
    const r = records.find((x) => x.id === id);
    if (!r || (r.parentId ?? null) === parentId) return;
    try {
      await patch(`/records/${id}`, { parentId });
      onChanged();
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
    }
  };

  // Pointer tracking while a card is held.
  useEffect(() => {
    if (!drag) return;
    const blocked = descendants(drag.id, children);
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current!;
      const live = d.live || Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 6;
      let target: Drag['target'] = null;
      if (live) {
        const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-drop]');
        const id = el?.dataset.drop ?? null;
        if (id === 'root') target = 'root';
        else if (id && id !== d.id && !blocked.has(id)) target = id;
      }
      setDrag({ ...d, x: e.clientX, y: e.clientY, live, target });
    };
    const onUp = () => {
      const d = dragRef.current!;
      setDrag(null);
      if (!d.live) return;
      justDropped.current = true;
      setTimeout(() => (justDropped.current = false), 80);
      if (d.target === 'root') void move(d.id, null);
      else if (d.target) void move(d.id, d.target);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrag(null);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.id, children]);

  const start = (r: AppRecord, e: React.PointerEvent, fromHandle: boolean) => {
    if (!canWrite || e.button !== 0) return;
    // Fingers drag by the handle only, so the chart can still be scrolled.
    if (e.pointerType !== 'mouse' && !fromHandle) return;
    if (fromHandle) e.preventDefault();
    setDrag({ id: r.id, x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, live: false, target: null });
  };

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of records) {
      const k = String(r.fields.stance ?? '');
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [records]);
  const deciders = records.filter((r) => r.fields.decision === 'decision_maker' || r.fields.decision === 'approver');

  const card = (r: AppRecord) => {
    const stance = String(r.fields.stance ?? '');
    const isDragged = drag?.live && drag.id === r.id;
    return (
      <div
        className="org-card"
        data-drop={r.id}
        data-stance={STANCE_KEYS.includes(stance) ? stance : 'unknown'}
        data-target={drag?.target === r.id || undefined}
        data-dragged={isDragged || undefined}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('a, .rowmenu, .org-card__handle')) return;
          start(r, e, false);
        }}
      >
        {canWrite && (
          <button
            className="org-card__handle"
            aria-hidden="true"
            tabIndex={-1}
            onPointerDown={(e) => {
              e.stopPropagation();
              start(r, e, true);
            }}
          >
            ⠿
          </button>
        )}
        <button className="org-card__main" onClick={() => !justDropped.current && onOpen(r)}>
          <span className="org-card__avatar" aria-hidden="true">
            {initials(r.name)}
          </span>
          <span className="org-card__text">
            <strong>{r.name}</strong>
            {r.fields.title && <span className="muted">{String(r.fields.title)}</span>}
          </span>
        </button>
        <div className="org-card__tags">
          {r.fields.decision && <span className="org-tag">{labelOf(decisionField?.options?.find((o) => o.key === r.fields.decision)?.label, locale) || String(r.fields.decision)}</span>}
          <StanceBadge field={stanceField} value={r.fields.stance} />
        </div>
        <div className="org-card__links">
          {r.fields.email && <a href={`mailto:${r.fields.email}`} aria-label={t('org.email', { name: r.name })} title={String(r.fields.email)}>@</a>}
          {r.fields.phone && <a href={`tel:${String(r.fields.phone).replace(/\s+/g, '')}`} aria-label={t('org.phone', { name: r.name })} title={String(r.fields.phone)}>☎</a>}
          {r.fields.linkedin && (
            <a href={String(r.fields.linkedin)} target="_blank" rel="noreferrer noopener" aria-label={t('org.linkedin', { name: r.name })} title={LINKEDIN}>
              {LINKEDIN_MARK}
            </a>
          )}
          {canWrite && (
            <RowMenu
              label={t('org.actions', { name: r.name })}
              items={[
                { label: t('org.addReport'), onClick: () => onAdd(r.id) },
                { label: t('org.reportsTo'), onClick: () => setMoving(r) },
                ...(r.parentId ? [{ label: t('org.toTop'), onClick: () => void move(r.id, null) }] : []),
                { label: t('common.edit'), onClick: () => onOpen(r) },
              ]}
            />
          )}
        </div>
      </div>
    );
  };

  const tree = (list: AppRecord[]) => (
    <ul>
      {list.map((r) => (
        <li key={r.id}>
          {card(r)}
          {(children.get(r.id)?.length ?? 0) > 0 && tree(children.get(r.id)!)}
        </li>
      ))}
    </ul>
  );

  const dragged = drag?.live ? records.find((r) => r.id === drag.id) : null;
  return (
    <div className="org" data-dragging={drag?.live || undefined}>
      <div className="org__summary">
        {STANCES.filter((s) => counts.get(s.key)).map((s) => (
          <span key={s.key} className="org__count">
            <span className="stance-dot" data-stance={s.key} aria-hidden="true" />
            <span className="num">{counts.get(s.key)}</span> {labelOf(stanceField?.options?.find((o) => o.key === s.key)?.label ?? s.label, locale)}
          </span>
        ))}
        {(counts.get('') ?? 0) > 0 && (
          <span className="org__count muted">
            <span className="stance-dot" data-stance="unknown" aria-hidden="true" />
            <span className="num">{counts.get('')}</span> {t('org.unknown')}
          </span>
        )}
        {deciders.length > 0 && (
          <span className="org__deciders">
            {t('org.deciders')}{' '}
            {deciders.map((d, i) => (
              <span key={d.id}>
                {i > 0 && ', '}
                {d.name}
                {d.fields.stance ? ` (${labelOf(stanceField?.options?.find((o) => o.key === d.fields.stance)?.label, locale)})` : ''}
              </span>
            ))}
          </span>
        )}
      </div>
      {canWrite && (
        <div className="org__root" data-drop="root" data-target={drag?.target === 'root' || undefined}>
          {drag?.live ? t('org.dropTop') : t('org.hint')}
        </div>
      )}
      {records.length === 0 ? (
        <div className="empty">{t('org.empty')}</div>
      ) : (
        <div className="org__scroll">
          <div className="org__tree">{tree(roots)}</div>
        </div>
      )}
      {canWrite && (
        <button className="btn btn--small" onClick={() => onAdd(null)}>
          {t('org.addPerson')}
        </button>
      )}
      {dragged && (
        <div className="org-ghost" style={{ left: drag!.x + 12, top: drag!.y + 12 }} aria-hidden="true">
          {dragged.name}
        </div>
      )}
      {moving && <ReportsTo record={moving} records={records} blocked={descendants(moving.id, children)} onClose={() => setMoving(null)} onPick={(id) => move(moving.id, id)} />}
    </div>
  );
}

/** The keyboard way to change who someone reports to. */
function ReportsTo({ record, records, blocked, onClose, onPick }: { record: AppRecord; records: AppRecord[]; blocked: Set<string>; onClose: () => void; onPick: (id: string | null) => Promise<void> }) {
  const { t } = useI18n();
  const [value, setValue] = useState(record.parentId ?? '');
  return (
    <Dialog
      title={t('org.reportsToTitle', { name: record.name })}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--quiet" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            className="btn btn--primary"
            onClick={async () => {
              await onPick(value || null);
              onClose();
            }}
          >
            {t('common.save')}
          </button>
        </>
      }
    >
      <label className="field">
        <span className="field__label">{t('org.reportsTo')}</span>
        <select className="select" autoFocus value={value} onChange={(e) => setValue(e.target.value)}>
          <option value="">{t('org.nobodyTop')}</option>
          {records
            .filter((r) => r.id !== record.id && !blocked.has(r.id))
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.fields.title ? ` — ${r.fields.title}` : ''}
              </option>
            ))}
        </select>
      </label>
    </Dialog>
  );
}
