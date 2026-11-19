// The flow between departments on the customer page (api/src/routes/handoff.ts):
//   * the hand-over card of a won deal, confirmed in one step (Ctrl/⌘+Enter);
//   * "What they are waiting for": promises made to the customer, and the product
//     work they asked for — its status, sprint end and department, for anyone who
//     sees the customer, without opening Product's board; when it ships, the owner's
//     drafted message, copied and sent by them (nothing goes out by itself);
//   * the customer's team: one owner per department.
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { AccountFlow, DraftResult, HandoverPacket, LinkableStory, LinkedWork, RequestSource, StoryCustomer } from '../../../shared/src/handoff';
import type { MessageKey } from '../../../shared/src/i18n';
import { labelOf } from '../../../shared/src/fields';
import { STANCES } from '../../../shared/src/records';
import type { Account, PlanTemplate } from '../../../shared/src/model';
import { ApiFailure, del, get, patch, post, put } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { navigate, setQuery } from '../lib/router';
import { useSaver } from '../lib/saver';
import { useStore } from '../lib/store';
import { useUndo } from '../lib/undo';
import { useFormat } from '../lib/useFormat';
import { EmptyState } from './Empty';
import { Icon } from './icons';
import { Avatar, Dialog } from './ui';
import { modKey } from './Shortcuts';
import '../surfaces/flow.css';

// Key captions, the same on every keyboard layout (as on the backlog).
const CAP = { enter: 'Enter' };

export const FLOW_CHANGED = 'app:flow-changed';
export const flowChanged = () => window.dispatchEvent(new Event(FLOW_CHANGED));

/** A department's name, for the four keys the app knows and the two the flow adds. */
export function useDeptName() {
  const { t } = useI18n();
  return (key: string) =>
    ['sales', 'success', 'product', 'finance'].includes(key) ? t(`dept.${key}` as MessageKey) : key === 'onboarding' || key === 'inside_sales' ? t(`flow.dept.${key}` as MessageKey) : key;
}

export function useAccountFlow(accountId: string) {
  const [flow, setFlow] = useState<AccountFlow | null>(null);
  const load = useCallback(() => get<AccountFlow>(`/accounts/${accountId}/flow`).then(setFlow, () => setFlow({ team: [], work: [], promises: [], handovers: [] })), [accountId]);
  useEffect(() => {
    void load();
    const again = () => void load();
    window.addEventListener(FLOW_CHANGED, again);
    window.addEventListener('app:timeline-changed', again);
    return () => {
      window.removeEventListener(FLOW_CHANGED, again);
      window.removeEventListener('app:timeline-changed', again);
    };
  }, [load]);
  return { flow, reload: load };
}

/** Asks for a draft; the caller shows it for the person to edit and confirm. */
async function askDraft(body: Record<string, unknown>): Promise<DraftResult> {
  return (await post<{ draft: DraftResult }>('/assist/draft', body)).draft;
}

function DraftNote({ draft }: { draft: DraftResult | null }) {
  const { t } = useI18n();
  if (!draft) return null;
  return (
    <p className="flow-draftnote muted" role="status">
      <Icon name="spark" size={13} /> {draft.ai ? t('flow.draft.byAssistant') : t(draft.why === 'cap' ? 'flow.draft.templateCap' : 'flow.draft.template')}
    </p>
  );
}

// ---------------------------------------------------------------- hand-over card

export function HandoverCard({ id, onDone }: { id: string; onDone: () => void }) {
  const { t, locale } = useI18n();
  const f = useFormat();
  const { people, canWrite, toast } = useStore();
  const save = useSaver();
  const offer = useUndo();
  const deptName = useDeptName();
  const [p, setP] = useState<HandoverPacket | null>(null);
  const [plans, setPlans] = useState<PlanTemplate[]>([]);
  const [owner, setOwner] = useState('');
  const [planId, setPlanId] = useState<string>('');
  const [summary, setSummary] = useState('');
  const [promise, setPromise] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [draft, setDraft] = useState<DraftResult | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await get<{ handover: HandoverPacket }>(`/handovers/${id}`);
    setP(r.handover);
    setSummary(r.handover.summary);
    setPlanId(r.handover.planId ?? '');
    setOwner((o) => o || r.handover.candidates[0] || '');
  }, [id]);
  useEffect(() => {
    void load().catch(() => setP(null));
    void get<{ plans: PlanTemplate[] }>('/plans').then((r) => setPlans(r.plans), () => setPlans([]));
  }, [load]);
  const pool = useMemo(() => {
    const active = people.filter((x) => x.status === 'active' && x.seat === 'full');
    const first = (p?.candidates ?? []).map((cid) => active.find((x) => x.id === cid)).filter(Boolean) as typeof active;
    return { first, rest: active.filter((x) => !first.includes(x)) };
  }, [people, p]);
  if (!p) return null;

  const confirm = async () => {
    if (!owner || busy) return;
    setBusy(true);
    const ok = await save(() => post(`/handovers/${id}/confirm`, { ownerId: owner, planId: planId || null, summary }), t('flow.handover.confirmed', { name: people.find((x) => x.id === owner)?.name ?? '' }));
    setBusy(false);
    if (ok) {
      flowChanged();
      window.dispatchEvent(new Event('app:timeline-changed'));
      onDone();
    }
  };
  const dismiss = async () => {
    if (await save(() => patch(`/handovers/${id}`, { status: 'dismissed' }), false)) {
      onDone();
      offer(t('flow.handover.dismissed'), () => patch(`/handovers/${id}`, { status: 'open' }), () => (flowChanged(), undefined));
    }
  };
  const writeNote = async () => {
    setDrafting(true);
    try {
      const d = await askDraft({ kind: 'handover_note', handoverId: id });
      const before = summary;
      setDraft(d);
      setSummary(d.text);
      offer(t('flow.draft.applied'), () => setSummary(before));
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
    } finally {
      setDrafting(false);
    }
  };
  const addPromise = async () => {
    const body = promise.trim();
    if (!body) return;
    if (await save(() => post(`/accounts/${p.accountId}/promises`, { body, recordId: p.sourceKind === 'record' ? p.sourceId : null }), false)) {
      setPromise('');
      void load();
    }
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void confirm();
    }
  };
  const stance = (k: string | null) => (k ? labelOf(STANCES.find((x) => x.key === k)?.label, locale) || k : '');

  return (
    <section className="sheet flow-handover" aria-labelledby={`ho-${id}`} onKeyDown={onKey}>
      <header className="flow-handover__head">
        <span className="flow-handover__icon" aria-hidden="true">
          <Icon name="handshake" size={18} />
        </span>
        <div className="flow-handover__title">
          <h3 id={`ho-${id}`}>{t('flow.handover.title', { deal: p.sourceName || p.accountName })}</h3>
          <p className="muted">{t('flow.handover.lead', { dept: deptName(p.toDepartment) })}</p>
        </div>
        <span className="badge badge--invited">{t('flow.handover.waiting')}</span>
      </header>

      <div className="flow-handover__grid">
        <div className="flow-handover__col">
          <h4 className="flow-sub">{t('flow.handover.people')}</h4>
          {p.stakeholders.length ? (
            <ul className="flow-people">
              {p.stakeholders.map((s) => (
                <li key={s.id}>
                  <button className="rowlink" onClick={() => setQuery('record', s.id)}>
                    {s.name}
                  </button>
                  {s.title && <span className="muted"> · {s.title}</span>}
                  {s.stance && (
                    <span className="flow-stance" data-stance={s.stance}>
                      {stance(s.stance)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted flow-none">{t('flow.handover.noPeople')}</p>
          )}

          <h4 className="flow-sub">{t('flow.handover.promises')}</h4>
          {p.promises.length > 0 && (
            <ul className="flow-list">
              {p.promises.map((x) => (
                <li key={x.id}>
                  <Icon name="flag" size={13} /> {x.body}
                  {x.dueDate && <span className="muted"> · {f.date(x.dueDate, { day: 'numeric', month: 'short' })}</span>}
                </li>
              ))}
            </ul>
          )}
          {canWrite && (
            <div className="flow-add">
              <input className="input" value={promise} placeholder={t('flow.promise.add')} aria-label={t('flow.promise.add')} maxLength={500} onChange={(e) => setPromise(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !e.ctrlKey && !e.metaKey && (e.preventDefault(), void addPromise())} />
              <button className="btn btn--small" disabled={!promise.trim()} onClick={() => void addPromise()}>
                {t('common.add')}
              </button>
            </div>
          )}

          <h4 className="flow-sub">{t('flow.handover.requests')}</h4>
          {p.requests.length ? (
            <ul className="flow-list">
              {p.requests.map((r) => (
                <li key={r.linkId}>
                  <Icon name="link" size={13} /> {r.title}
                  <span className="muted"> · {r.status ?? '—'}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted flow-none">{t('flow.handover.noRequests')}</p>
          )}
        </div>

        <div className="flow-handover__col">
          <dl className="flow-facts">
            <div>
              <dt>{t('flow.handover.signed')}</dt>
              <dd className="num">{p.closeDate ? f.date(p.closeDate, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</dd>
            </div>
            <div>
              <dt>{t('flow.handover.renews')}</dt>
              <dd className="num">{p.renewalDate ? f.date(p.renewalDate, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</dd>
            </div>
            {p.value != null && (
              <div>
                <dt>{t('flow.handover.value')}</dt>
                <dd className="num">{f.money(p.value, p.currency)}</dd>
              </div>
            )}
          </dl>

          <label className="field">
            <span className="field__label flow-labelrow">
              {t('flow.handover.summary')}
              {canWrite && (
                <button type="button" className="btn btn--quiet btn--small" disabled={drafting} onClick={() => void writeNote()}>
                  <Icon name="spark" size={13} />
                  {drafting ? t('flow.draft.writing') : t('flow.draft.handover')}
                </button>
              )}
            </span>
            <textarea className="textarea" rows={6} value={summary} disabled={!canWrite} onChange={(e) => setSummary(e.target.value)} placeholder={t('flow.handover.summaryEmpty')} />
          </label>
          <DraftNote draft={draft} />

          <label className="field">
            <span className="field__label">{t('flow.handover.playbook')}</span>
            <select className="select" value={planId} disabled={!canWrite} onChange={(e) => setPlanId(e.target.value)}>
              <option value="">{t('flow.handover.noPlaybook')}</option>
              {plans.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field" data-tour="flow-owner">
            <span className="field__label">{t('flow.handover.owner', { dept: deptName(p.toDepartment) })}</span>
            <select className="select" value={owner} disabled={!canWrite} onChange={(e) => setOwner(e.target.value)}>
              <option value="">{t('flow.handover.pickOwner')}</option>
              {pool.first.length > 0 && (
                <optgroup label={deptName(p.toDepartment)}>
                  {pool.first.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label={t('flow.handover.everyone')}>
                {pool.rest.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
        </div>
      </div>

      {canWrite && (
        <footer className="flow-handover__foot">
          <span className="muted hide-phone">
            <kbd>{modKey()}</kbd>+<kbd>{CAP.enter}</kbd> {t('flow.handover.confirm')}
          </span>
          <button className="btn btn--quiet" onClick={() => void dismiss()}>
            {t('flow.handover.notNow')}
          </button>
          <button className="btn btn--primary" disabled={!owner || busy} onClick={() => void confirm()}>
            <Icon name="check" size={16} />
            {t('flow.handover.confirm')}
          </button>
        </footer>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- what they are waiting for

function WorkRow({ w, accountName, onChanged }: { w: LinkedWork; accountName: string; onChanged: () => void }) {
  const { t } = useI18n();
  const f = useFormat();
  const { canWrite, toast } = useStore();
  const save = useSaver();
  const offer = useUndo();
  const deptName = useDeptName();
  const [text, setText] = useState(w.draft);
  const [draft, setDraft] = useState<DraftResult | null>(null);
  const [drafting, setDrafting] = useState(false);
  const shipped = !!w.shippedAt;
  const pending = shipped && !w.toldAt;
  useEffect(() => setText(w.draft), [w.draft]);

  const keep = () => text !== w.draft && void patch(`/request-links/${w.linkId}`, { draft: text }).catch(() => undefined);
  const copy = async () => {
    keep();
    try {
      await navigator.clipboard.writeText(text);
      toast(t('flow.loop.copied'));
    } catch {
      toast(t('flow.loop.copyFailed'), 'error');
    }
  };
  const told = async () => {
    keep();
    if (await save(() => post(`/request-links/${w.linkId}/told`), t('flow.loop.toldDone', { account: accountName }))) onChanged();
  };
  const closePortal = async () => {
    if (await save(() => post(`/request-links/${w.linkId}/close-portal`), t('flow.loop.portalClosed'))) onChanged();
  };
  const assist = async () => {
    setDrafting(true);
    try {
      const d = await askDraft({ kind: 'shipped_message', linkId: w.linkId });
      const before = text;
      setDraft(d);
      setText(d.text);
      offer(t('flow.draft.applied'), () => setText(before));
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
    } finally {
      setDrafting(false);
    }
  };
  const unlink = async () => {
    if (await save(() => del(`/request-links/${w.linkId}`), false)) {
      onChanged();
      toast(t('flow.link.removed'));
    }
  };

  return (
    <li className="flow-work" data-state={pending ? 'shipped' : w.done ? 'done' : 'open'}>
      <div className="flow-work__line">
        <span className="flow-work__dot" aria-hidden="true">
          <Icon name={w.done ? 'checkCircle' : 'clock'} size={15} />
        </span>
        <span className="flow-work__title">
          {w.boardId ? (
            <button className="rowlink" onClick={() => setQuery('task', w.storyId)}>
              {w.title}
            </button>
          ) : (
            <span>{w.title}</span>
          )}
          {w.note && <span className="flow-work__note muted">“{w.note}”</span>}
        </span>
        <span className="flow-work__meta">
          <span className="flow-chip">{deptName(w.departmentKey)}</span>
          <span className="flow-chip" data-tone={w.done ? 'done' : undefined}>
            {w.status ?? '—'}
          </span>
          {!w.done && w.sprintEnds && <span className="muted num">{t('flow.work.sprintEnds', { sprint: w.sprint ?? '', date: f.date(w.sprintEnds, { day: 'numeric', month: 'short' }) })}</span>}
          {w.toldAt && <span className="muted">{t('flow.work.told')}</span>}
        </span>
        {canWrite && !shipped && (
          <button className="btn btn--quiet btn--icon btn--small flow-work__remove" aria-label={t('flow.link.remove', { title: w.title })} title={t('flow.link.remove', { title: w.title })} onClick={() => void unlink()}>
            <Icon name="close" size={14} />
          </button>
        )}
      </div>
      {pending && (
        <div className="flow-loop">
          <p className="flow-loop__lead">
            <Icon name="send" size={14} /> {t('flow.loop.lead')}
          </p>
          <textarea className="textarea" rows={6} value={text} disabled={!canWrite} aria-label={t('flow.loop.message')} onChange={(e) => setText(e.target.value)} onBlur={keep} />
          <DraftNote draft={draft} />
          {canWrite && (
            <div className="flow-loop__actions">
              <button className="btn btn--quiet btn--small" disabled={drafting} onClick={() => void assist()}>
                <Icon name="spark" size={13} />
                {drafting ? t('flow.draft.writing') : t('flow.draft.assist')}
              </button>
              <span className="u-me-auto" />
              <button className="btn btn--small" onClick={() => void copy()}>
                <Icon name="copy" size={14} />
                {t('flow.loop.copy')}
              </button>
              {w.portalOpen && (
                <button className="btn btn--small" onClick={() => void closePortal()}>
                  <Icon name="globe" size={14} />
                  {t('flow.loop.closePortal')}
                </button>
              )}
              <button className="btn btn--primary btn--small" onClick={() => void told()}>
                <Icon name="check" size={14} />
                {t('flow.loop.told')}
              </button>
            </div>
          )}
          <p className="field__hint">{t('flow.loop.nothingSent')}</p>
        </div>
      )}
    </li>
  );
}

export function WaitingFor({ account, flow, reload }: { account: Account; flow: AccountFlow | null; reload: () => void }) {
  const { t } = useI18n();
  const f = useFormat();
  const { canWrite } = useStore();
  const save = useSaver();
  const offer = useUndo();
  const [linking, setLinking] = useState(false);
  const [promise, setPromise] = useState('');
  if (!flow) return null;
  const open = flow.work.filter((w) => !w.done || (w.shippedAt && !w.toldAt));
  const shipped = flow.work.filter((w) => w.done && !(w.shippedAt && !w.toldAt));
  const promises = flow.promises;
  const add = async () => {
    const body = promise.trim();
    if (!body) return;
    if (await save(() => post(`/accounts/${account.id}/promises`, { body }), false)) {
      setPromise('');
      reload();
    }
  };
  const keep = async (id: string, kept: boolean) => {
    if (await save(() => patch(`/promises/${id}`, { kept }), false)) {
      reload();
      if (kept) offer(t('flow.promise.keptDone'), () => patch(`/promises/${id}`, { kept: false }), reload);
    }
  };
  const remove = async (id: string) => {
    const r = await del<{ promise: { body: string; dueDate: string | null } }>(`/promises/${id}`).catch(() => null);
    if (!r) return;
    reload();
    offer(t('flow.promise.removed'), () => post(`/accounts/${account.id}/promises`, { body: r.promise.body, dueDate: r.promise.dueDate }), reload);
  };

  return (
    <section className="sheet flow-waiting" id="waiting">
      <h3 className="section__head">
        <span>
          <Icon name="hourglass" size={16} className="icon--lead" />
          {t('flow.waiting.title')}
        </span>
        {canWrite && (
          <button className="btn btn--small" onClick={() => setLinking(true)} aria-keyshortcuts="L">
            <Icon name="link" size={14} />
            {t('flow.link.button')}
          </button>
        )}
      </h3>

      <h4 className="flow-sub">{t('flow.waiting.promises')}</h4>
      {promises.length === 0 && <p className="muted flow-none">{t('flow.waiting.noPromises')}</p>}
      <ul className="flow-promises">
        {promises.map((x) => (
          <li key={x.id} data-kept={x.keptAt ? 'yes' : undefined}>
            <label className="checkbox">
              <input type="checkbox" checked={!!x.keptAt} disabled={!canWrite} onChange={(e) => void keep(x.id, e.target.checked)} />
              <span>{x.body}</span>
            </label>
            {x.dueDate && <span className="muted num">{f.date(x.dueDate, { day: 'numeric', month: 'short' })}</span>}
            {canWrite && (
              <button className="btn btn--quiet btn--icon btn--small" aria-label={t('common.remove')} title={t('common.remove')} onClick={() => void remove(x.id)}>
                <Icon name="close" size={13} />
              </button>
            )}
          </li>
        ))}
      </ul>
      {canWrite && (
        <div className="flow-add">
          <input className="input" value={promise} placeholder={t('flow.promise.add')} aria-label={t('flow.promise.add')} maxLength={500} onChange={(e) => setPromise(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), void add())} />
          <button className="btn btn--small" disabled={!promise.trim()} onClick={() => void add()}>
            {t('common.add')}
          </button>
        </div>
      )}

      <h4 className="flow-sub">{t('flow.waiting.product')}</h4>
      {open.length === 0 && shipped.length === 0 ? (
        <EmptyState compact icon="link" title={t('flow.waiting.empty')} body={t('flow.waiting.emptyBody')}>
          {canWrite && (
            <button className="btn" onClick={() => setLinking(true)}>
              {t('flow.link.button')}
            </button>
          )}
        </EmptyState>
      ) : (
        <ul className="flow-works">
          {open.map((w) => (
            <WorkRow key={w.linkId} w={w} accountName={account.name} onChanged={reload} />
          ))}
        </ul>
      )}
      {shipped.length > 0 && (
        <details className="u-mt-8">
          <summary className="muted">{t('flow.waiting.built', { n: shipped.length })}</summary>
          <ul className="flow-works">
            {shipped.map((w) => (
              <WorkRow key={w.linkId} w={w} accountName={account.name} onChanged={reload} />
            ))}
          </ul>
        </details>
      )}
      {linking && <LinkRequestDialog accountId={account.id} accountName={account.name} onClose={() => setLinking(false)} onLinked={reload} />}
    </section>
  );
}

// ---------------------------------------------------------------- link a request

export function LinkRequestDialog({
  accountId,
  accountName,
  source = 'account',
  sourceId = null,
  initialNote = '',
  onClose,
  onLinked,
}: {
  accountId: string;
  accountName: string;
  source?: RequestSource;
  sourceId?: string | null;
  initialNote?: string;
  onClose: () => void;
  onLinked: () => void;
}) {
  const { t } = useI18n();
  const { toast } = useStore();
  const deptName = useDeptName();
  const [query, setQueryText] = useState(initialNote.slice(0, 60));
  const [stories, setStories] = useState<LinkableStory[] | null>(null);
  const [desks, setDesks] = useState<{ id: string; name: string }[]>([]);
  const [active, setActive] = useState(0);
  const [note, setNote] = useState(initialNote);
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const id = setTimeout(() => {
      void get<{ stories: LinkableStory[]; desks: { id: string; name: string }[] }>(`/stories/linkable?q=${encodeURIComponent(query.trim())}`).then(
        (r) => {
          setStories(r.stories);
          setDesks(r.desks);
          setActive(0);
        },
        () => setStories([]),
      );
    }, 200);
    return () => clearTimeout(id);
  }, [query]);

  const link = async (storyId: string) => {
    setBusy(true);
    try {
      await post('/request-links', { storyId, accountId, source, sourceId, note: note.trim() });
      toast(t('flow.link.done', { account: accountName }));
      flowChanged();
      onLinked();
      onClose();
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
    } finally {
      setBusy(false);
    }
  };
  // Nothing fits: a new request to Product's intake board, linked at once.
  const ask = async (deskId: string) => {
    const title = query.trim();
    if (!title) return;
    setBusy(true);
    try {
      const r = await post<{ task: { id: string } }>(`/boards/${deskId}/requests`, { title, description: note.trim(), accountId });
      await post('/request-links', { storyId: r.task.id, accountId, source, sourceId, note: note.trim() });
      toast(t('flow.link.asked', { account: accountName }));
      flowChanged();
      onLinked();
      onClose();
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
    } finally {
      setBusy(false);
    }
  };
  const list = stories ?? [];
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, Math.min(list.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1))));
    } else if (e.key === 'Enter' && list[active]) {
      e.preventDefault();
      void link(list[active].id);
    }
  };
  useEffect(() => listRef.current?.querySelector('[data-active]')?.scrollIntoView({ block: 'nearest' }), [active]);

  return (
    <Dialog title={t('flow.link.title', { account: accountName })} onClose={onClose}>
      <div className="flow-linker">
        <p className="muted">{t('flow.link.intro')}</p>
        <input
          className="input search"
          type="search"
          autoFocus
          value={query}
          placeholder={t('flow.link.search')}
          aria-label={t('flow.link.search')}
          role="combobox"
          aria-expanded={list.length > 0}
          aria-controls="flow-stories"
          aria-activedescendant={list[active] ? `story-${list[active].id}` : undefined}
          onChange={(e) => setQueryText(e.target.value)}
          onKeyDown={onKey}
        />
        <ul className="flow-stories" id="flow-stories" role="listbox" ref={listRef} aria-label={t('flow.link.results')}>
          {stories === null && <li className="muted">{t('common.loading')}</li>}
          {list.map((s, i) => (
            <li key={s.id} id={`story-${s.id}`} role="option" aria-selected={i === active} data-active={i === active || undefined}>
              <button type="button" className="flow-story" disabled={busy} onClick={() => void link(s.id)} onMouseEnter={() => setActive(i)}>
                <span className="flow-story__title">{s.title}</span>
                <span className="flow-story__meta">
                  <span className="flow-chip">{deptName(s.departmentKey)}</span>
                  <span className="flow-chip" data-tone={s.done ? 'done' : undefined}>
                    {s.status ?? '—'}
                  </span>
                  {s.waiting > 0 && <span className="muted">{t('flow.link.waiting', { n: s.waiting })}</span>}
                </span>
              </button>
            </li>
          ))}
          {stories !== null && list.length === 0 && <li className="muted flow-none">{t('flow.link.noMatch')}</li>}
        </ul>
        {desks.length > 0 && query.trim().length > 2 && (
          <div className="flow-ask">
            <span className="muted">{t('flow.link.askHint')}</span>
            {desks.map((d) => (
              <button key={d.id} type="button" className="btn btn--small" disabled={busy} onClick={() => void ask(d.id)}>
                <Icon name="plus" size={14} />
                {t('flow.link.ask', { board: d.name, title: query.trim().slice(0, 40) })}
              </button>
            ))}
          </div>
        )}
        <label className="field">
          <span className="field__label">{t('flow.link.note')}</span>
          <input className="input" value={note} maxLength={2000} placeholder={t('flow.link.notePlaceholder')} onChange={(e) => setNote(e.target.value)} />
        </label>
        <p className="field__hint">
          <kbd>↑</kbd>
          <kbd>↓</kbd> {t('flow.link.keys')} · <kbd>{CAP.enter}</kbd> {t('flow.link.pick')}
        </p>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------- the customer's team

export function AccountTeam({ account, flow, reload }: { account: Account; flow: AccountFlow | null; reload: () => void }) {
  const { t } = useI18n();
  const { me, people, canWrite } = useStore();
  const save = useSaver();
  const deptName = useDeptName();
  const depts = (me.departments ?? []).filter((d) => d.enabled);
  if (!flow || !depts.length) return null;
  const owner = (deptId: string) => flow.team.find((m) => m.departmentId === deptId)?.userId ?? '';
  const set = async (departmentId: string, userId: string) => {
    if (await save(() => put(`/accounts/${account.id}/team`, { departmentId, userId: userId || null }), false)) reload();
  };
  return (
    <fieldset className="field plain-fieldset flow-team">
      <legend className="field__label">{t('flow.team.title')}</legend>
      {depts.map((d) => {
        const who = people.find((p) => p.id === owner(d.id));
        return (
          <label key={d.id} className="flow-team__row">
            <span className="flow-team__dept">{deptName(d.key)}</span>
            <span className="flow-team__who">{who && <Avatar person={who} />}</span>
            <select className="select" value={owner(d.id)} disabled={!canWrite} aria-label={t('flow.team.ownerIn', { dept: deptName(d.key) })} onChange={(e) => void set(d.id, e.target.value)}>
              <option value="">{t('flow.team.none')}</option>
              {people
                .filter((p) => (p.status === 'active' || p.status === 'invited' || p.id === owner(d.id)) && p.seat === 'full')
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </label>
        );
      })}
    </fieldset>
  );
}

/** "Prepare the hand-over" on a deal: makes the card (or finds it) and opens the customer. */
export function PrepareHandover({ recordId, accountId }: { recordId: string; accountId: string | null }) {
  const { t } = useI18n();
  const { canWrite, toast } = useStore();
  if (!canWrite || !accountId) return null;
  const go = async () => {
    try {
      await post('/handovers', { sourceKind: 'record', sourceId: recordId });
      navigate(`/accounts/${accountId}`);
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
    }
  };
  return (
    <button className="btn btn--small" onClick={() => void go()}>
      <Icon name="handshake" size={14} />
      {t('flow.handover.prepare')}
    </button>
  );
}

/** On a story: the customers waiting for it (names of the ones you may see), and whether they were told it shipped. */
export function StoryCustomers({ taskId }: { taskId: string }) {
  const { t } = useI18n();
  const [list, setList] = useState<StoryCustomer[] | null>(null);
  useEffect(() => {
    void get<{ customers: StoryCustomer[] }>(`/tasks/${taskId}/customers`).then((r) => setList(r.customers), () => setList([]));
  }, [taskId]);
  if (!list?.length) return null;
  const hidden = list.filter((c) => !c.visible).length;
  return (
    <section className="flow-story-customers">
      <h3 className="section__head">
        <span>
          <Icon name="people" size={16} className="icon--lead" />
          {t('flow.story.customers', { n: list.length })}
        </span>
      </h3>
      <ul className="flow-customers">
        {list
          .filter((c) => c.visible && c.accountId)
          .map((c) => (
            <li key={c.linkId}>
              <a
                className="chip"
                href={`/accounts/${c.accountId}`}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(`/accounts/${c.accountId}`);
                }}
              >
                {c.toldAt ? <Icon name="check" size={12} /> : c.shippedAt ? <Icon name="send" size={12} /> : null}
                {c.accountName}
              </a>
            </li>
          ))}
        {hidden > 0 && <li className="muted">{t('flow.story.hidden', { n: hidden })}</li>}
      </ul>
      <p className="field__hint">{t('flow.story.hint')}</p>
    </section>
  );
}

/**
 * On a meeting: the promises and next steps in its notes, found by the assistant
 * (or picked line by line without one). The person ticks what is right and saves;
 * Undo takes it all back.
 */
export function MeetingPromises({ meeting }: { meeting: { id: string; accountId: string; body: string } }) {
  const { t } = useI18n();
  const { boards, canWrite, toast } = useStore();
  const offer = useUndo();
  const [draft, setDraft] = useState<DraftResult | null>(null);
  const [pick, setPick] = useState<Set<string>>(new Set());
  const [boardId, setBoardId] = useState(boards[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  if (!canWrite || !meeting.body.trim()) return null;
  const find = async () => {
    setBusy(true);
    try {
      const d = await askDraft({ kind: 'meeting_promises', activityId: meeting.id });
      setDraft(d);
      setPick(new Set([...(d.promises ?? []).map((x) => `p:${x}`), ...(d.nextSteps ?? []).map((x) => `s:${x}`)]));
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
    } finally {
      setBusy(false);
    }
  };
  const apply = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      const promises = (draft.promises ?? []).filter((x) => pick.has(`p:${x}`));
      const steps = (draft.nextSteps ?? []).filter((x) => pick.has(`s:${x}`));
      const made: string[] = [];
      for (const body of promises) made.push((await post<{ promise: { id: string } }>(`/accounts/${meeting.accountId}/promises`, { body, activityId: meeting.id })).promise.id);
      const r = steps.length && boardId ? await post<{ nextSteps: { id: string }[] }>(`/activities/${meeting.id}/next-steps`, { steps: steps.map((title) => ({ title })), boardId }) : null;
      const tasks = (r?.nextSteps ?? []).map((x) => x.id);
      setDraft(null);
      flowChanged();
      window.dispatchEvent(new Event('app:timeline-changed'));
      offer(t('flow.meeting.saved', { promises: promises.length, steps: steps.length }), async () => {
        await Promise.all([...made.map((id) => del(`/promises/${id}`)), ...tasks.map((id) => del(`/tasks/${id}`))]);
        flowChanged();
        window.dispatchEvent(new Event('app:timeline-changed'));
      });
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
    } finally {
      setBusy(false);
    }
  };
  const toggle = (k: string) => setPick((cur) => (cur.has(k) ? new Set([...cur].filter((x) => x !== k)) : new Set([...cur, k])));
  const none = draft && !(draft.promises?.length || draft.nextSteps?.length);
  return (
    <>
      <button type="button" className="btn btn--quiet btn--small flow-meeting-find" disabled={busy} onClick={() => void find()}>
        <Icon name="spark" size={13} />
        {busy && !draft ? t('flow.draft.writing') : t('flow.meeting.find')}
      </button>
      {draft && (
        <Dialog
          title={t('flow.meeting.title')}
          onClose={() => setDraft(null)}
          footer={
            <>
              <button className="btn btn--quiet" onClick={() => setDraft(null)}>
                {t('common.cancel')}
              </button>
              <button className="btn btn--primary" disabled={busy || !pick.size} onClick={() => void apply()}>
                {t('flow.meeting.save', { n: pick.size })}
              </button>
            </>
          }
        >
          <DraftNote draft={draft} />
          {draft.text && <p>{draft.text}</p>}
          {none && <p className="muted">{t('flow.meeting.none')}</p>}
          {(draft.promises?.length ?? 0) > 0 && <h4 className="flow-sub">{t('flow.waiting.promises')}</h4>}
          {(draft.promises ?? []).map((x) => (
            <label key={`p:${x}`} className="checkbox">
              <input type="checkbox" checked={pick.has(`p:${x}`)} onChange={() => toggle(`p:${x}`)} />
              <span>{x}</span>
            </label>
          ))}
          {(draft.nextSteps?.length ?? 0) > 0 && (
            <>
              <h4 className="flow-sub">{t('meetings.nextSteps')}</h4>
              {draft.nextSteps!.map((x) => (
                <label key={`s:${x}`} className="checkbox">
                  <input type="checkbox" checked={pick.has(`s:${x}`)} onChange={() => toggle(`s:${x}`)} />
                  <span>{x}</span>
                </label>
              ))}
              <label className="field u-mt-8">
                <span className="field__label">{t('task.board')}</span>
                <select className="select" value={boardId} onChange={(e) => setBoardId(e.target.value)}>
                  {boards.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
        </Dialog>
      )}
    </>
  );
}

/** The built-in flow, beside the company's own rules: the hand-over card on won deals and where loop-back tasks go. */
export function FlowSettingsCard() {
  const { t } = useI18n();
  const { boards, can } = useStore();
  const save = useSaver();
  const [s, setS] = useState<{ handover: boolean; handoverPlanId: string | null; loopBoardId: string | null } | null>(null);
  const [plans, setPlans] = useState<PlanTemplate[]>([]);
  useEffect(() => {
    void get<{ settings: NonNullable<typeof s> }>('/flow/settings').then((r) => setS(r.settings), () => setS(null));
    void get<{ plans: PlanTemplate[] }>('/plans').then((r) => setPlans(r.plans), () => setPlans([]));
  }, []);
  if (!s) return null;
  const manage = can('automations.manage');
  const change = async (next: Partial<typeof s>) => {
    const before = s;
    setS({ ...s, ...next });
    if (!(await save(() => put('/flow/settings', next)))) setS(before);
  };
  return (
    <section className="sheet flow-settings" aria-labelledby="flow-settings-title">
      <h3 className="section__head" id="flow-settings-title">
        <span>
          <Icon name="handshake" size={16} className="icon--lead" />
          {t('flow.settings.title')}
        </span>
      </h3>
      <label className="checkbox flow-hinted">
        <input type="checkbox" checked={s.handover} disabled={!manage} onChange={(e) => void change({ handover: e.target.checked })} />
        <span>
          {t('flow.settings.handover')}
          <span className="field__hint">{t('flow.settings.handoverHint')}</span>
        </span>
      </label>
      <div className="flow-settings__row">
        <label className="field">
          <span className="field__label">{t('flow.settings.plan')}</span>
          <select className="select" value={s.handoverPlanId ?? ''} disabled={!manage || !s.handover} onChange={(e) => void change({ handoverPlanId: e.target.value || null })}>
            <option value="">{t('flow.settings.planAuto')}</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">{t('flow.settings.loopBoard')}</span>
          <select className="select" value={s.loopBoardId ?? ''} disabled={!manage} onChange={(e) => void change({ loopBoardId: e.target.value || null })}>
            <option value="">{t('flow.settings.loopAuto')}</option>
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="field__hint">{t('flow.settings.noCounters')}</p>
    </section>
  );
}
