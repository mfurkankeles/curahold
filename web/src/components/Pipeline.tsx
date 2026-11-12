// Records as a board: deals by stage (drag one to move it, drop it on Won
// or Lost to close it), or any kind of record by one of its choice fields.
// The strip on top adds the money up: open, weighted by stage, closing soon.
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { useMemo, useState } from 'react';
import { labelOf } from '../../../shared/src/fields';
import type { AccountField } from '../../../shared/src/model';
import type { AppRecord, RecordType } from '../../../shared/src/records';
import { useFieldFormat } from '../pages/Accounts';
import { ApiFailure, patch } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useStore } from '../lib/store';
import { dueState, todayIso } from '../lib/time';
import { EmptyState } from './Empty';
import { TargetsPanel } from './Rhythm';
import { Icon } from './icons';
import { CountUp } from './CountUp';
import { Avatar } from './ui';

const NONE = '__none__';

export function groupChoices(type: RecordType) {
  return type.fields.filter((f) => f.type === 'select' && (f.options?.length ?? 0) > 1 && !(type.kind === 'opportunity' && f.key === 'status'));
}

export function RecordBoard({ type, records, groupKey, onOpen, onChanged }: { type: RecordType; records: AppRecord[]; groupKey: string; onOpen: (r: AppRecord) => void; onChanged: (r: AppRecord) => void }) {
  const { t, locale, fmtDate } = useI18n();
  const { canWrite, toast, person } = useStore();
  const fmt = useFieldFormat();
  const [active, setActive] = useState<AppRecord | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));
  const group = type.fields.find((f) => f.key === groupKey);
  const money = type.fields.find((f) => f.key === 'amount' && f.type === 'money') ?? type.fields.find((f) => f.type === 'money');
  const date = type.fields.find((f) => f.key === 'close_date') ?? type.fields.find((f) => f.type === 'date');
  const kind = type.fields.find((f) => f.key === 'kind' && f.type === 'select');
  // Deals have an end: won or lost. Those get their own two columns at the end.
  const status = type.kind === 'opportunity' ? type.fields.find((f) => f.key === 'status' && f.type === 'select') : undefined;
  const closedKeys = status ? ['won', 'lost'].filter((k) => status.options?.some((o) => o.key === k)) : [];
  const isClosed = (r: AppRecord) => !!status && closedKeys.includes(String(r.fields[status.key] ?? ''));
  const today = todayIso();
  const num = (r: AppRecord) => (money ? Number(r.fields[money.key]) || 0 : 0);
  const sum = (list: AppRecord[]) => list.reduce((n, r) => n + num(r), 0);
  const cash = (n: number) => (money ? fmt(money, n) : String(n));

  const columns = useMemo(() => {
    if (!group) return [];
    const open = records.filter((r) => !isClosed(r));
    const cols = (group.options ?? []).map((o, i, all) => ({ key: o.key, label: labelOf(o.label, locale), color: o.color, weight: (i + 1) / (all.length + 1), list: open.filter((r) => r.fields[group.key] === o.key), closed: false }));
    const rest = open.filter((r) => !(group.options ?? []).some((o) => o.key === r.fields[group.key]));
    if (rest.length) cols.unshift({ key: NONE, label: t('pipeline.noValue', { field: labelOf(group.label, locale) }), color: undefined, weight: 0, list: rest, closed: false });
    for (const k of closedKeys) {
      const o = status!.options!.find((x) => x.key === k)!;
      cols.push({ key: `status:${k}`, label: labelOf(o.label, locale), color: k === 'won' ? 'leaf' : 'coral', weight: k === 'won' ? 1 : 0, list: records.filter((r) => r.fields[status!.key] === k), closed: true });
    }
    for (const c of cols) c.list.sort((a, b) => String(a.fields[date?.key ?? ''] ?? '9').localeCompare(String(b.fields[date?.key ?? ''] ?? '9')));
    return cols;
  }, [records, group, status, locale]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!group) return <EmptyState icon="funnel" title={t('pipeline.noField')} body={t('pipeline.noFieldBody')} />;

  const move = async (r: AppRecord, to: string) => {
    const fields: Record<string, string | null> = {};
    if (to.startsWith('status:')) {
      if (r.fields[status!.key] === to.slice(7)) return;
      fields[status!.key] = to.slice(7);
    } else {
      const value = to === NONE ? null : to;
      if (r.fields[group.key] === value && !isClosed(r)) return;
      fields[group.key] = value;
      // Dragged back from Won or Lost: it is open again.
      if (isClosed(r) && status?.options?.some((o) => o.key === 'open')) fields[status.key] = 'open';
    }
    onChanged({ ...r, fields: { ...r.fields, ...fields } });
    try {
      const res = await patch<{ record: AppRecord }>(`/records/${r.id}`, { fields });
      onChanged({ ...r, ...res.record, accountName: r.accountName });
      if (fields[status?.key ?? ''] === 'won') toast(t('pipeline.won', { name: r.name }));
    } catch (e) {
      onChanged(r);
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
    }
  };
  const onEnd = (e: DragEndEvent) => {
    setActive(null);
    const r = records.find((x) => x.id === e.active.id);
    const over = e.over?.id ? String(e.over.id) : null;
    if (r && over?.startsWith('col:')) void move(r, over.slice(4));
  };

  const open = records.filter((r) => !isClosed(r));
  const weighted = columns.filter((c) => !c.closed).reduce((n, c) => n + sum(c.list) * c.weight, 0);
  const monthEnd = `${today.slice(0, 7)}-31`;
  const closing = date ? open.filter((r) => typeof r.fields[date.key] === 'string' && String(r.fields[date.key]) <= monthEnd) : [];
  const late = date ? open.filter((r) => typeof r.fields[date.key] === 'string' && String(r.fields[date.key]) < today) : [];
  const won = status ? records.filter((r) => r.fields[status.key] === 'won') : [];

  const card = (r: AppRecord, overlay = false) => {
    const d = date ? (r.fields[date.key] as string | null) : null;
    const k = kind ? kind.options?.find((o) => o.key === r.fields[kind.key]) : null;
    return (
      <article className={`card dealcard${overlay ? ' card--overlay' : ''}`} data-due={d ? dueState(d, isClosed(r), today) : undefined} onClick={() => onOpen(r)}>
        <div className="card__title">{r.name}</div>
        {r.accountName && <div className="card__account">{r.accountName}</div>}
        <div className="card__meta">
          {money && r.fields[money.key] != null && <strong className="dealcard__amount num">{fmt(money, r.fields[money.key])}</strong>}
          {d && <span className={`due due--${dueState(d, isClosed(r), today)}`}>{fmtDate(d)}</span>}
          {k && (
            <span className="optchip" data-color={k.color}>
              {labelOf(k.label, locale)}
            </span>
          )}
          {r.ownerId && (
            <span className="avatars">
              <Avatar person={person(r.ownerId)} />
            </span>
          )}
        </div>
      </article>
    );
  };

  return (
    <>
      {type.kind === 'opportunity' && <TargetsPanel type={type} records={records} compact />}
      {money && (
        <div className="statstrip">
          <Stat label={t('pipeline.open')} value={cash(sum(open))} sub={t('pipeline.deals', { n: open.length })} />
          {status && <Stat label={t('pipeline.weighted')} value={cash(Math.round(weighted))} sub={t('pipeline.weightedHint')} />}
          {date && <Stat label={t('pipeline.closing')} value={cash(sum(closing))} sub={t('pipeline.deals', { n: closing.length })} tone={late.length ? 'late' : undefined} note={late.length ? t('pipeline.lateN', { n: late.length }) : undefined} />}
          {status && <Stat label={t('pipeline.wonTotal')} value={cash(sum(won))} sub={t('pipeline.deals', { n: won.length })} tone="done" />}
        </div>
      )}
      <DndContext sensors={canWrite ? sensors : []} onDragStart={(e) => setActive(records.find((x) => x.id === e.active.id) ?? null)} onDragEnd={onEnd} onDragCancel={() => setActive(null)}>
        <div className="board board--records">
          {columns.map((c) => (
            <DropColumn key={c.key} id={c.key} label={c.label} color={c.color} count={c.list.length} total={money ? cash(sum(c.list)) : null} closed={c.closed}>
              {c.list.length === 0 && <div className="column__empty">{c.closed ? t('pipeline.dropHere') : t('pipeline.emptyStage')}</div>}
              {c.list.map((r) => (
                <DragCard key={r.id} id={r.id} disabled={!canWrite}>
                  {card(r)}
                </DragCard>
              ))}
            </DropColumn>
          ))}
        </div>
        <DragOverlay>{active ? card(active, true) : null}</DragOverlay>
      </DndContext>
    </>
  );
}

/** A figure with its label. Give `n` (and `fmt`) and it counts up to the value. */
export function Stat({ label, value, sub, tone, note, n, fmt }: { label: string; value: string; sub?: string; tone?: 'late' | 'done' | 'soon'; note?: string; n?: number | null; fmt?: (n: number) => string }) {
  return (
    <div className="stat" data-tone={tone}>
      <span className="stat__label">{label}</span>
      <strong className="stat__value num">{n == null ? value : <CountUp value={n} format={fmt ?? String} />}</strong>
      {(sub || note) && (
        <span className="stat__sub">
          {sub}
          {note && <span className="stat__note"> · {note}</span>}
        </span>
      )}
    </div>
  );
}

function DropColumn({ id, label, color, count, total, closed, children }: { id: string; label: string; color?: string; count: number; total: string | null; closed: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${id}` });
  return (
    <section className="column" ref={setNodeRef} data-over={isOver} data-closed={closed || undefined} data-color={color} aria-label={label}>
      <div className="column__head">
        <span className="column__dot" aria-hidden="true" />
        <span className="column__name">{label}</span>
        <span className="column__count num">{count}</span>
        {total && <span className="column__total num">{total}</span>}
      </div>
      <div className="column__list">{children}</div>
    </section>
  );
}

function DragCard({ id, disabled, children }: { id: string; disabled: boolean; children: React.ReactNode }) {
  const drag = useDraggable({ id, disabled });
  return (
    <div ref={drag.setNodeRef} {...drag.attributes} {...drag.listeners} data-dragging={drag.isDragging}>
      {children}
    </div>
  );
}

/** Field picker for "group by" (shown when a type has more than one choice field). */
export function GroupBy({ fields, value, onChange }: { fields: AccountField[]; value: string; onChange: (k: string) => void }) {
  const { t, locale } = useI18n();
  if (fields.length < 2) return null;
  return (
    <label className="groupby">
      <Icon name="columns" size={15} />
      <span className="sr-only">{t('pipeline.groupBy')}</span>
      <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        {fields.map((f) => (
          <option key={f.key} value={f.key}>
            {t('pipeline.by', { field: labelOf(f.label, locale) })}
          </option>
        ))}
      </select>
    </label>
  );
}
