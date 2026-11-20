// Plan & targets → Budget & investors: the investor side of the owner's plan.
// Budget against spend month by month with the runway the cash gives, the
// plan's two milestones measured on real data, the fundraising windows and the
// owner's own investor pipeline (typed by hand), and loading all of it from the
// business plan's file. Desktop first in two columns; on a phone every block
// stacks and the investor rows become cards. Turkish and English only
// (shared/src/i18n/owner.ts). Data: GET /api/desk/owner/plan/side.
import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import type { OwnerKey } from '../../../../shared/src/i18n/owner';
import {
  INVESTOR_KINDS,
  INVESTOR_STAGES,
  isOwnerLocale,
  readPlanFile,
  WINDOW_STATUSES,
  type FundraisingWindow,
  type Investor,
  type InvestorKind,
  type InvestorStage,
  type OwnerInvestorSide,
  type PlanImportResult,
  type WindowStatus,
} from '../../../../shared/src/ownerPlan';
import { DateField } from '../../components/DateField';
import { EmptyState } from '../../components/Empty';
import { Icon } from '../../components/icons';
import { Dialog } from '../../components/ui';
import { formatDate, formatMoney, formatNumber } from '../../lib/format';
import { periodOf } from '../ConsoleChart';
import { api, Bar, Loading, useData, useOwnerWords } from './shared';

type Failed = (e: unknown) => void;
const STAGE_TONE: Partial<Record<InvestorStage, 'done' | 'soon' | 'late'>> = { committed: 'done', 'term-sheet': 'soon', diligence: 'soon', passed: 'late' };
const STATUS_TONE: Partial<Record<WindowStatus, 'done' | 'soon' | 'late'>> = { open: 'done', preparing: 'soon', skipped: 'late' };
/** A fresh key for one create, so a double click or a retry adds the row once (Idempotency-Key). */
const newKey = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/[^\w.:-]/g, '');

function useMoney() {
  const { locale } = useOwnerWords();
  return (v: number | null | undefined, compact = true) => (v == null ? '—' : formatMoney(v, 'USD', locale, { compact }));
}
const numOrNull = (s: string) => (s.trim() === '' ? null : Number(s));

/** The investor side of Plan & targets, in four blocks. */
export function InvestorSideView({ beat, failed }: { beat: number; failed: Failed }) {
  const { data, error, reload, setData } = useData<OwnerInvestorSide>('/owner/plan/side', beat, failed);
  const [importing, setImporting] = useState(false);
  return (
    <Loading data={data} error={error} reload={reload} cards>
      {(d) => (
        <>
          <div className="occols occols--plan">
            <div className="occolstack">
              <BudgetCard d={d} onChanged={setData} failed={failed} onImport={() => setImporting(true)} />
              <MilestonesCard d={d} onImport={() => setImporting(true)} />
            </div>
            <div className="occolstack">
              <WindowsCard d={d} onChanged={setData} reload={reload} failed={failed} onImport={() => setImporting(true)} />
              <InvestorsCard d={d} onChanged={setData} reload={reload} failed={failed} />
            </div>
          </div>
          {importing ? <ImportDialog onClose={() => setImporting(false)} onDone={reload} failed={failed} /> : null}
        </>
      )}
    </Loading>
  );
}

// ------------------------------------------------------------ budget

function BudgetCard({ d, onChanged, failed, onImport }: { d: OwnerInvestorSide; onChanged: (d: OwnerInvestorSide) => void; failed: Failed; onImport: () => void }) {
  const { o, locale } = useOwnerWords();
  const money = useMoney();
  const [month, setMonth] = useState(d.period);
  const [cash, setCash] = useState(d.budget.cash == null ? '' : String(d.budget.cash));
  const [cashOn, setCashOn] = useState(d.budget.cashOn ?? new Date().toISOString().slice(0, 10));
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [line, setLine] = useState({ category: '', planned: '', actual: '' });
  const [saved, setSaved] = useState<'cash' | 'lines' | null>(null);
  const empty = d.budget.months.every((m) => !m.lines.length) && d.budget.cash == null;
  const m = d.budget.months.find((x) => x.period === month) ?? d.budget.months[0];
  const top = Math.max(1, ...d.budget.months.map((x) => Math.max(x.planned, x.actual ?? 0)));

  const saveCash = async (e: FormEvent) => {
    e.preventDefault();
    try {
      onChanged(await api<OwnerInvestorSide>('PUT', '/owner/plan/cash', { cash: numOrNull(cash), cashOn: cash.trim() ? cashOn : null }));
      setSaved('cash');
    } catch (err) {
      failed(err);
    }
  };
  const saveLines = async (e: FormEvent) => {
    e.preventDefault();
    const lines = Object.entries(typed).map(([category, v]) => ({ period: m.period, category, actual: numOrNull(v) }));
    if (line.category.trim()) lines.push({ period: m.period, category: line.category.trim(), planned: Number(line.planned) || 0, actual: numOrNull(line.actual) } as (typeof lines)[number]);
    if (!lines.length) return;
    try {
      onChanged(await api<OwnerInvestorSide>('PUT', '/owner/plan/budget', { lines }));
      setTyped({});
      setLine({ category: '', planned: '', actual: '' });
      setSaved('lines');
    } catch (err) {
      failed(err);
    }
  };

  return (
    <section className="ccard" aria-labelledby="oc-budget">
      <div className="ccard__row">
        <h2 className="ccard__title" id="oc-budget">
          <Icon name="coins" size={14} />
          {o('budget.title')}
        </h2>
        {d.budget.scenario ? <span className="ocpill">{o('budget.scenario', { name: d.budget.scenario })}</span> : null}
      </div>
      {empty ? (
        <EmptyState compact icon="coins" title={o('budget.empty.title')} body={o('budget.empty.body')}>
          <button type="button" className="btn btn--primary btn--small" onClick={onImport}>
            <Icon name="upload" size={14} />
            {o('import.open')}
          </button>
        </EmptyState>
      ) : null}

      <form className="ocsettings ocrunway" onSubmit={saveCash}>
        <label>
          {o('budget.cash')}
          <input className="input input--num" type="number" min={0} step="any" inputMode="decimal" value={cash} onChange={(e) => (setCash(e.target.value), setSaved(null))} />
        </label>
        <DateField value={cashOn} onChange={(v) => (setCashOn(v), setSaved(null))} label={o('budget.cashOn')} />
        <button type="submit" className="btn btn--small">
          <Icon name="check" size={14} />
          {saved === 'cash' ? o('common.saved') : o('budget.saveCash')}
        </button>
        <p className="oc__muted">
          {d.budget.runwayMonths != null ? (
            <strong className="ocrunway__fig">{o('budget.runway', { months: formatNumber(d.budget.runwayMonths, locale, { digits: 1 }) })}</strong>
          ) : (
            o(d.budget.cash == null ? 'budget.runwayNeedsCash' : 'budget.runwayNone')
          )}{' '}
          {o('budget.runwayNote')}
          {d.budget.capitalNeed != null ? ` ${o('budget.capitalNeed', { amount: money(d.budget.capitalNeed, false) })}` : ''}
        </p>
      </form>

      <div className="octablewrap">
        <table className="octable octable--dense ocbudget">
          <caption className="sr-only">{o('budget.caption')}</caption>
          <thead>
            <tr>
              <th scope="col">{o('plan.month')}</th>
              <th scope="col" className="num">{o('budget.planned')}</th>
              <th scope="col" className="num">{o('budget.spent')}</th>
              <th scope="col" className="num ocwide">{o('budget.revenue')}</th>
            </tr>
          </thead>
          <tbody>
            {d.budget.months.map((x) => (
              <tr key={x.period} data-now={x.period === d.period ? '' : undefined} data-picked={x.period === m.period ? '' : undefined}>
                <th scope="row">
                  <button type="button" className="oclink" aria-pressed={x.period === m.period} onClick={() => (setMonth(x.period), setTyped({}), setSaved(null))}>
                    <Icon name="edit" size={12} />
                    {periodOf(x.period, locale)}
                  </button>
                </th>
                <td className="num">
                  {x.planned ? money(x.planned) : '—'}
                  <Bar value={x.planned / top} />
                </td>
                <td className="num">
                  {x.actual == null ? <span className="oc__muted">{o('budget.notEntered')}</span> : money(x.actual)}
                  {x.actual != null ? <Bar value={x.actual / top} tone={x.planned && x.actual > x.planned ? 'behind' : 'on-track'} /> : null}
                </td>
                <td className="num ocwide">
                  {money(x.revenue)}
                  {x.revenuePlan != null ? <span className="oc__muted"> / {money(x.revenuePlan)}</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form className="ocbudgetlines" onSubmit={saveLines} aria-labelledby="oc-budget-month">
        <h3 className="ocreq__h" id="oc-budget-month">
          {o('budget.linesFor', { month: periodOf(m.period, locale) })}
        </h3>
        {m.lines.length ? (
          <ul className="oclist">
            {m.lines.map((l) => (
              <li key={l.category}>
                <span className="oclist__main">
                  <span>{l.category}</span>
                  <span className="oc__muted">{o('budget.plannedIs', { amount: money(l.planned, false) })}</span>
                </span>
                <input
                  className="input input--num"
                  type="number"
                  min={0}
                  step="any"
                  inputMode="decimal"
                  aria-label={o('budget.spentFor', { category: l.category })}
                  placeholder={o('budget.spent')}
                  value={typed[l.category] ?? (l.actual == null ? '' : String(l.actual))}
                  onChange={(e) => (setTyped({ ...typed, [l.category]: e.target.value }), setSaved(null))}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="oc__muted">{o('budget.noLines')}</p>
        )}
        <div className="ocbudgetadd">
          <input className="input" maxLength={80} placeholder={o('budget.newCategory')} aria-label={o('budget.newCategory')} value={line.category} onChange={(e) => setLine({ ...line, category: e.target.value })} />
          <input className="input input--num" type="number" min={0} step="any" inputMode="decimal" placeholder={o('budget.planned')} aria-label={o('budget.planned')} value={line.planned} onChange={(e) => setLine({ ...line, planned: e.target.value })} />
          <input className="input input--num" type="number" min={0} step="any" inputMode="decimal" placeholder={o('budget.spent')} aria-label={o('budget.spent')} value={line.actual} onChange={(e) => setLine({ ...line, actual: e.target.value })} />
        </div>
        <div className="ocbuttons">
          <button type="submit" className="btn btn--primary btn--small" disabled={!Object.keys(typed).length && !line.category.trim()}>
            <Icon name="check" size={14} />
            {saved === 'lines' ? o('common.saved') : o('budget.save')}
          </button>
          <span className="oc__muted">{o('budget.clearNote')}</span>
        </div>
      </form>
    </section>
  );
}

// ------------------------------------------------------------ milestones

function MilestonesCard({ d, onImport }: { d: OwnerInvestorSide; onImport: () => void }) {
  const { o, locale } = useOwnerWords();
  const none = d.milestones.every((m) => m.target == null && !m.next);
  return (
    <section className="ccard" aria-labelledby="oc-milestones">
      <h2 className="ccard__title" id="oc-milestones">
        <Icon name="flag" size={14} />
        {o('milestones.title')}
      </h2>
      <ul className="ocmiles">
        {d.milestones.map((m) => (
          <li key={m.metric}>
            <div className="ocmiles__head">
              <span className="ocmiles__name">{o(`metric.${m.metric}` as OwnerKey)}</span>
              <span className="oc__big">{formatNumber(m.actual, locale)}</span>
            </div>
            <p className="oc__muted">{o(`milestones.def.${m.metric}` as OwnerKey)}</p>
            <p className="oc__muted">
              {m.target != null ? o('milestones.target', { target: formatNumber(m.target, locale) }) : o('milestones.noTarget')}
              {m.next ? ` · ${o('milestones.next', { target: formatNumber(m.next.target, locale), month: periodOf(m.next.period, locale) })}` : ''}
            </p>
            {m.target ? <Bar value={m.actual / m.target} tone={m.actual >= m.target ? 'on-track' : 'behind'} /> : null}
          </li>
        ))}
      </ul>
      {none ? (
        <div className="ocbuttons">
          <button type="button" className="btn btn--small" onClick={onImport}>
            <Icon name="upload" size={14} />
            {o('import.open')}
          </button>
          <span className="oc__muted">{o('milestones.empty')}</span>
        </div>
      ) : null}
    </section>
  );
}

// ------------------------------------------------------------ fundraising windows

function WindowsCard({ d, onChanged, reload, failed, onImport }: { d: OwnerInvestorSide; onChanged: (d: OwnerInvestorSide) => void; reload: () => void; failed: Failed; onImport: () => void }) {
  const { o, locale } = useOwnerWords();
  const money = useMoney();
  const [edit, setEdit] = useState<FundraisingWindow | 'new' | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const setStatus = async (w: FundraisingWindow, status: WindowStatus) => {
    try {
      onChanged(await api<OwnerInvestorSide>('PATCH', `/owner/plan/windows/${w.id}`, { status }));
    } catch (err) {
      failed(err);
    }
  };
  return (
    <section className="ccard" aria-labelledby="oc-windows">
      <div className="ccard__row">
        <h2 className="ccard__title" id="oc-windows">
          <Icon name="calendar" size={14} />
          {o('fund.title')}
        </h2>
        <button type="button" className="btn btn--small" onClick={() => setEdit('new')}>
          <Icon name="plus" size={14} />
          {o('fund.add')}
        </button>
      </div>
      {!d.windows.length ? (
        <EmptyState compact icon="calendar" title={o('fund.empty.title')} body={o('fund.empty.body')}>
          <button type="button" className="btn btn--primary btn--small" onClick={onImport}>
            <Icon name="upload" size={14} />
            {o('import.open')}
          </button>
        </EmptyState>
      ) : (
        <ul className="ocwindows">
          {d.windows.map((w) => {
            const days = Math.round((Date.parse(w.opensOn) - Date.parse(today)) / 86_400_000);
            const goal = w.targetMin ?? w.targetMax;
            return (
              <li key={w.id} data-status={w.status}>
                <div className="ocwindows__head">
                  <strong>{w.name}</strong>
                  <span className="ocpill" data-tone={STATUS_TONE[w.status]}>
                    {o(`fund.status.${w.status}` as OwnerKey)}
                  </span>
                </div>
                <p className="oc__muted">
                  {formatDate(w.opensOn, locale, { day: 'numeric', month: 'short', year: 'numeric' })} – {formatDate(w.closesOn, locale, { day: 'numeric', month: 'short', year: 'numeric' })}
                  {w.status !== 'closed' && w.status !== 'skipped' ? ` · ${days > 0 ? o('fund.opensIn', { days: formatNumber(days, locale) }) : w.closesOn >= today ? o('fund.openNow') : o('fund.past')}` : ''}
                </p>
                <p className="ocwindows__money">
                  {w.targetMin != null || w.targetMax != null ? o('fund.target', { range: w.targetMax != null && w.targetMin != null ? `${money(w.targetMin)} – ${money(w.targetMax)}` : money(goal) }) : o('fund.noTarget')}
                  {' · '}
                  {o('fund.committed', { amount: money(w.committed), n: formatNumber(w.investors, locale) })}
                </p>
                {goal ? <Bar value={w.committed / goal} tone={w.committed >= goal ? 'on-track' : 'close'} /> : null}
                {w.conditions ? (
                  <details className="ocwindows__more">
                    <summary>{o('fund.conditions')}</summary>
                    <p>{w.conditions}</p>
                  </details>
                ) : null}
                <div className="ocbuttons">
                  <label className="ocfield ocfield--inline">
                    <span className="sr-only">{o('fund.statusFor', { name: w.name })}</span>
                    <select className="input" value={w.status} onChange={(e) => void setStatus(w, e.target.value as WindowStatus)}>
                      {WINDOW_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {o(`fund.status.${s}` as OwnerKey)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="button" className="btn btn--small btn--quiet" onClick={() => setEdit(w)}>
                    <Icon name="edit" size={14} />
                    {o('common.edit')}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {edit ? <WindowDialog w={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onSaved={reload} failed={failed} /> : null}
    </section>
  );
}

function WindowDialog({ w, onClose, onSaved, failed }: { w: FundraisingWindow | null; onClose: () => void; onSaved: () => void; failed: Failed }) {
  const { o } = useOwnerWords();
  const key = useRef(newKey());
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({
    name: w?.name ?? '',
    opensOn: w?.opensOn ?? today,
    closesOn: w?.closesOn ?? today,
    targetMin: w?.targetMin == null ? '' : String(w.targetMin),
    targetMax: w?.targetMax == null ? '' : String(w.targetMax),
    conditions: w?.conditions ?? '',
    note: w?.note ?? '',
  });
  const bad = !f.name.trim() || f.closesOn < f.opensOn || (f.targetMin !== '' && f.targetMax !== '' && Number(f.targetMax) < Number(f.targetMin));
  const save = async (e?: FormEvent) => {
    e?.preventDefault();
    if (bad) return;
    const payload = { name: f.name.trim(), opensOn: f.opensOn, closesOn: f.closesOn, targetMin: numOrNull(f.targetMin), targetMax: numOrNull(f.targetMax), conditions: f.conditions.trim() || null, note: f.note.trim() || null };
    try {
      if (w) await api('PATCH', `/owner/plan/windows/${w.id}`, payload);
      else await fetchWithKey('POST', '/owner/plan/windows', payload, key.current);
      onSaved();
      onClose();
    } catch (err) {
      failed(err);
    }
  };
  return (
    <Dialog
      title={w ? o('fund.edit') : o('fund.add')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--quiet" onClick={onClose}>
            <Icon name="close" size={16} />
            {o('common.cancel')}
          </button>
          <button type="button" className="btn btn--primary" disabled={bad} onClick={() => void save()}>
            <Icon name="check" size={16} />
            {o('common.save')}
          </button>
        </>
      }
    >
      <form className="ocform" onSubmit={save}>
        <label className="ocfield ocfield--wide">
          {o('fund.name')}
          <input className="input" maxLength={120} required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </label>
        <DateField value={f.opensOn} onChange={(v) => setF({ ...f, opensOn: v })} label={o('fund.opensOn')} />
        <DateField value={f.closesOn} onChange={(v) => setF({ ...f, closesOn: v })} label={o('fund.closesOn')} />
        <label className="ocfield">
          {o('fund.targetMin')}
          <input className="input input--num" type="number" min={0} step="any" inputMode="decimal" value={f.targetMin} onChange={(e) => setF({ ...f, targetMin: e.target.value })} />
        </label>
        <label className="ocfield">
          {o('fund.targetMax')}
          <input className="input input--num" type="number" min={0} step="any" inputMode="decimal" value={f.targetMax} onChange={(e) => setF({ ...f, targetMax: e.target.value })} />
        </label>
        <label className="ocfield ocfield--wide">
          {o('fund.conditions')}
          <textarea className="textarea" rows={3} maxLength={2000} value={f.conditions} onChange={(e) => setF({ ...f, conditions: e.target.value })} />
        </label>
        <label className="ocfield ocfield--wide">
          {o('fund.note')}
          <textarea className="textarea" rows={2} maxLength={2000} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </label>
        {f.closesOn < f.opensOn ? <p className="ocform__error" role="alert">{o('fund.datesBad')}</p> : null}
      </form>
    </Dialog>
  );
}

/** A create with its Idempotency-Key (the console's own api() sends none). */
async function fetchWithKey(method: string, path: string, body: unknown, key: string) {
  const res = await fetch(`/api/desk${path}`, { method, headers: { 'x-curahold-desk': '1', 'content-type': 'application/json', 'idempotency-key': key }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

// ------------------------------------------------------------ investors

function InvestorsCard({ d, onChanged, reload, failed }: { d: OwnerInvestorSide; onChanged: (d: OwnerInvestorSide) => void; reload: () => void; failed: Failed }) {
  const { o, locale } = useOwnerWords();
  const money = useMoney();
  const [edit, setEdit] = useState<Investor | 'new' | null>(null);
  const [stage, setStage] = useState<InvestorStage | 'all'>('all');
  const windows = useMemo(() => new Map(d.windows.map((w) => [w.id, w.name])), [d.windows]);
  const shown = d.investors.filter((i) => stage === 'all' || i.stage === stage);
  const counts = useMemo(() => Object.fromEntries(INVESTOR_STAGES.map((s) => [s, d.investors.filter((i) => i.stage === s).length])), [d.investors]);
  const today = new Date().toISOString().slice(0, 10);
  const call = async (method: string, path: string, body?: unknown) => {
    try {
      onChanged(await api<OwnerInvestorSide>(method, path, body));
    } catch (err) {
      failed(err);
    }
  };
  return (
    <section className="ccard" aria-labelledby="oc-investors">
      <div className="ccard__row">
        <h2 className="ccard__title" id="oc-investors">
          <Icon name="handshake" size={14} />
          {o('inv.title')}
        </h2>
        <button type="button" className="btn btn--small" onClick={() => setEdit('new')}>
          <Icon name="userPlus" size={14} />
          {o('inv.add')}
        </button>
      </div>
      {!d.investors.length ? (
        <EmptyState compact icon="handshake" title={o('inv.empty.title')} body={o('inv.empty.body')}>
          <button type="button" className="btn btn--primary btn--small" onClick={() => setEdit('new')}>
            <Icon name="userPlus" size={14} />
            {o('inv.add')}
          </button>
        </EmptyState>
      ) : (
        <>
          <div className="ocseg" role="group" aria-label={o('inv.stage')}>
            <button type="button" aria-pressed={stage === 'all'} onClick={() => setStage('all')}>
              {o('inv.all')} {formatNumber(d.investors.length, locale)}
            </button>
            {INVESTOR_STAGES.filter((s) => counts[s]).map((s) => (
              <button key={s} type="button" aria-pressed={stage === s} onClick={() => setStage(s)}>
                {o(`stage.${s}` as OwnerKey)} {formatNumber(counts[s], locale)}
              </button>
            ))}
          </div>
          <ul className="ocinv">
            {shown.map((i) => (
              <li key={i.id} data-stage={i.stage}>
                <div className="ocinv__who">
                  <strong>{i.name}</strong>
                  <span className="oc__muted">
                    {o(`kind.${i.kind}` as OwnerKey)}
                    {i.windowId && windows.get(i.windowId) ? ` · ${windows.get(i.windowId)}` : ''}
                  </span>
                </div>
                <label className="ocinv__stage">
                  <span className="sr-only">{o('inv.stageFor', { name: i.name })}</span>
                  <select className="input" value={i.stage} onChange={(e) => void call('PATCH', `/owner/plan/investors/${i.id}`, { stage: e.target.value })}>
                    {INVESTOR_STAGES.map((s) => (
                      <option key={s} value={s}>
                        {o(`stage.${s}` as OwnerKey)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="ocinv__next">
                  {i.nextStep || i.nextOn ? (
                    <>
                      <span>{i.nextStep ?? o('inv.nextStep')}</span>
                      {i.nextOn ? (
                        <span className="ocpill" data-tone={i.nextOn < today ? 'late' : i.nextOn === today ? 'soon' : undefined}>
                          <Icon name="clock" size={12} />
                          {formatDate(i.nextOn, locale, { day: 'numeric', month: 'short' })}
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <span className="oc__muted">{o('inv.noNext')}</span>
                  )}
                </div>
                <span className="ocinv__amount num">
                  {i.amount != null ? money(i.amount) : '—'}
                  {STAGE_TONE[i.stage] === 'done' ? <span className="sr-only"> {o('stage.committed')}</span> : null}
                </span>
                <div className="ocinv__acts">
                  <button type="button" className="btn btn--small btn--quiet" onClick={() => setEdit(i)}>
                    <Icon name="edit" size={14} />
                    {o('common.edit')}
                  </button>
                  <button type="button" className="btn btn--small btn--quiet" onClick={() => void call('DELETE', `/owner/plan/investors/${i.id}`)}>
                    <Icon name="trash" size={14} />
                    {o('inv.remove')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {d.removed.length ? (
        <div className="ocinv__removed" role="status">
          {d.removed.slice(0, 3).map((r) => (
            <p key={r.id} className="oc__muted">
              {o('inv.removed', { name: r.name })}{' '}
              <button type="button" className="btn btn--small btn--quiet" onClick={() => void call('POST', `/owner/plan/investors/${r.id}/restore`)}>
                <Icon name="undo" size={14} />
                {o('inv.restore')}
              </button>
            </p>
          ))}
        </div>
      ) : null}
      <p className="oc__muted">{o('inv.privacy')}</p>
      {edit ? <InvestorDialog i={edit === 'new' ? null : edit} windows={d.windows} onClose={() => setEdit(null)} onSaved={reload} failed={failed} /> : null}
    </section>
  );
}

function InvestorDialog({ i, windows, onClose, onSaved, failed }: { i: Investor | null; windows: FundraisingWindow[]; onClose: () => void; onSaved: () => void; failed: Failed }) {
  const { o } = useOwnerWords();
  const key = useRef(newKey());
  const [f, setF] = useState({
    name: i?.name ?? '',
    kind: (i?.kind ?? 'angel') as InvestorKind,
    stage: (i?.stage ?? 'idea') as InvestorStage,
    windowId: i?.windowId ?? '',
    nextStep: i?.nextStep ?? '',
    nextOn: i?.nextOn ?? '',
    amount: i?.amount == null ? '' : String(i.amount),
    note: i?.note ?? '',
  });
  const save = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!f.name.trim()) return;
    const payload = { name: f.name.trim(), kind: f.kind, stage: f.stage, windowId: f.windowId || null, nextStep: f.nextStep.trim() || null, nextOn: f.nextOn || null, amount: numOrNull(f.amount), note: f.note.trim() || null };
    try {
      if (i) await api('PATCH', `/owner/plan/investors/${i.id}`, payload);
      else await fetchWithKey('POST', '/owner/plan/investors', payload, key.current);
      onSaved();
      onClose();
    } catch (err) {
      failed(err);
    }
  };
  return (
    <Dialog
      title={i ? o('inv.edit') : o('inv.add')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--quiet" onClick={onClose}>
            <Icon name="close" size={16} />
            {o('common.cancel')}
          </button>
          <button type="button" className="btn btn--primary" disabled={!f.name.trim()} onClick={() => void save()}>
            <Icon name="check" size={16} />
            {o('common.save')}
          </button>
        </>
      }
    >
      <form className="ocform" onSubmit={save}>
        <label className="ocfield ocfield--wide">
          {o('inv.name')}
          <input className="input" maxLength={160} required value={f.name} placeholder={o('inv.namePlaceholder')} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </label>
        <label className="ocfield">
          {o('inv.kind')}
          <select className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as InvestorKind })}>
            {INVESTOR_KINDS.map((k) => (
              <option key={k} value={k}>
                {o(`kind.${k}` as OwnerKey)}
              </option>
            ))}
          </select>
        </label>
        <label className="ocfield">
          {o('inv.stage')}
          <select className="input" value={f.stage} onChange={(e) => setF({ ...f, stage: e.target.value as InvestorStage })}>
            {INVESTOR_STAGES.map((s) => (
              <option key={s} value={s}>
                {o(`stage.${s}` as OwnerKey)}
              </option>
            ))}
          </select>
        </label>
        <label className="ocfield ocfield--wide">
          {o('inv.window')}
          <select className="input" value={f.windowId} onChange={(e) => setF({ ...f, windowId: e.target.value })}>
            <option value="">{o('inv.noWindow')}</option>
            {windows.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
        <label className="ocfield ocfield--wide">
          {o('inv.nextStep')}
          <input className="input" maxLength={300} value={f.nextStep} placeholder={o('inv.nextPlaceholder')} onChange={(e) => setF({ ...f, nextStep: e.target.value })} />
        </label>
        <DateField value={f.nextOn} onChange={(v) => setF({ ...f, nextOn: v })} label={o('inv.nextOn')} />
        <label className="ocfield">
          {o('inv.amount')}
          <input className="input input--num" type="number" min={0} step="any" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
        </label>
        <label className="ocfield ocfield--wide">
          {o('fund.note')}
          <textarea className="textarea" rows={3} maxLength={2000} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </label>
      </form>
    </Dialog>
  );
}

// ------------------------------------------------------------ loading the plan file

interface ImportAnswer {
  ok: boolean;
  errors?: string[];
  scenario?: string;
  counts?: { targets: number; budget: number; windows: number; tasks: number };
}

/**
 * Loads the business plan's targets.json: read here first (the same reader as the server's, so the counts shown
 * are what will be loaded), then sent once the owner picked the scenario. Nothing is stored before he says so.
 */
function ImportDialog({ onClose, onDone, failed }: { onClose: () => void; onDone: () => void; failed: Failed }) {
  const { o, locale } = useOwnerWords();
  const [file, setFile] = useState<unknown>(null);
  const [name, setName] = useState('');
  const [bad, setBad] = useState(false);
  const [scenario, setScenario] = useState<string | null>(null);
  const [done, setDone] = useState<ImportAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const read: PlanImportResult | null = useMemo(() => (file ? readPlanFile(file, scenario, isOwnerLocale(locale) ? locale : 'tr') : null), [file, scenario, locale]);
  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    setDone(null);
    if (!f) return;
    setName(f.name);
    try {
      const json = JSON.parse(await f.text());
      setFile(json);
      setBad(false);
      setScenario(typeof json?.defaultScenario === 'string' ? json.defaultScenario : null);
    } catch {
      setFile(null);
      setBad(true);
    }
  };
  const load = async () => {
    if (!read?.ok) return;
    setBusy(true);
    try {
      const a = await api<ImportAnswer>('POST', '/owner/plan/import', { file, scenario: read.plan.scenario });
      setDone(a);
      if (a.ok) onDone();
    } catch (err) {
      failed(err);
    } finally {
      setBusy(false);
    }
  };
  const counts = read?.ok ? { targets: read.plan.targets.length, budget: read.plan.budget.length, windows: read.plan.windows.length, tasks: read.plan.tasks.length } : null;
  return (
    <Dialog
      title={o('import.title')}
      onClose={onClose}
      footer={
        done?.ok ? (
          <button type="button" className="btn btn--primary" onClick={onClose}>
            <Icon name="check" size={16} />
            {o('import.done')}
          </button>
        ) : (
          <>
            <button type="button" className="btn btn--quiet" onClick={onClose}>
              <Icon name="close" size={16} />
              {o('common.cancel')}
            </button>
            <button type="button" className="btn btn--primary" disabled={!read?.ok || busy} aria-busy={busy || undefined} onClick={() => void load()}>
              <Icon name="upload" size={16} />
              {o('import.load')}
            </button>
          </>
        )
      }
    >
      <p className="u-m-0">{o('import.body')}</p>
      <label className="ocfield ocfield--wide">
        {o('import.file')}
        <input className="input" type="file" accept="application/json,.json" onChange={(e) => void pick(e)} />
      </label>
      {name ? <p className="oc__muted">{name}</p> : null}
      {bad ? <p className="ocform__error" role="alert">{o('import.notJson')}</p> : null}
      {read && read.scenarios.length ? (
        <label className="ocfield">
          {o('import.scenario')}
          <select className="input" value={read.ok ? read.plan.scenario : (scenario ?? '')} onChange={(e) => setScenario(e.target.value)}>
            {read.scenarios.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {read && !read.ok ? (
        <div className="ocform__error" role="alert">
          <p>{o('import.errors')}</p>
          <ul>
            {read.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {counts && !done ? <p className="oc__muted">{o('import.will', { targets: formatNumber(counts.targets, locale), budget: formatNumber(counts.budget, locale), windows: formatNumber(counts.windows, locale), tasks: formatNumber(counts.tasks, locale) })}</p> : null}
      {done?.ok && done.counts ? (
        <p role="status">
          <Icon name="checkCircle" size={14} /> {o('import.loaded', { targets: formatNumber(done.counts.targets, locale), budget: formatNumber(done.counts.budget, locale), windows: formatNumber(done.counts.windows, locale), tasks: formatNumber(done.counts.tasks, locale) })}
        </p>
      ) : null}
      {done && !done.ok ? (
        <div className="ocform__error" role="alert">
          {(done.errors ?? []).map((e) => (
            <p key={e}>{e}</p>
          ))}
        </div>
      ) : null}
      <p className="oc__muted">{o('import.note')}</p>
    </Dialog>
  );
}
