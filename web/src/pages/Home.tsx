// Home: the page an administrator chose for this person's role, made of
// cards. Each card is filled with what this person may see, so one page
// works for a whole role. Administrators edit pages in place.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { labelOf } from '../../../shared/src/fields';
import type { AccountField, Role } from '../../../shared/src/model';
import {
  BREAKDOWNS,
  CARD_INFO,
  CARD_SCOPES,
  CARD_SETTINGS,
  CARD_TYPES,
  METRICS,
  type Card,
  type CardData,
  type CardRow,
  type CardSize,
  type CardType,
  type Page,
} from '../../../shared/src/pages';
import { PROVIDER_NAMES } from '../components/Connections';
import { Confirm, Dialog } from '../components/ui';
import { ApiFailure, del, get, patch, post } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { navigate, setQuery } from '../lib/router';
import { useStore } from '../lib/store';
import { relativeTime } from '../lib/time';

type Data = Record<string, CardData>;
interface Draft {
  id: string | null;
  name: string;
  cards: Card[];
  homeFor: string[];
  sharedWith: string[];
}

const SIZES: CardSize[] = ['third', 'half', 'full'];

export function HomePage({ pageId }: { pageId: string | null }) {
  const { t } = useI18n();
  const { can, me } = useStore();
  const [pages, setPages] = useState<Page[] | null>(null);
  const [homeId, setHomeId] = useState<string | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const admin = can('org.manage') && !me.previewBy;

  const loadPages = useCallback(async () => {
    const r = await get<{ pages: Page[]; homeId: string | null }>('/pages');
    setPages(r.pages);
    setHomeId(r.homeId);
    return r;
  }, []);
  useEffect(() => {
    void loadPages();
  }, [loadPages]);

  const current = pages?.find((p) => p.id === (pageId ?? homeId)) ?? null;
  const loadData = useCallback(async () => {
    if (!current) return;
    setData((await get<{ data: Data }>(`/pages/${current.id}/data`)).data);
  }, [current?.id, current?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setData(null);
    void loadData();
  }, [loadData]);

  if (!pages) return <div className="empty">{t('common.loading')}</div>;

  if (draft) {
    return (
      <PageEditor
        draft={draft}
        onCancel={() => setDraft(null)}
        onSaved={async (id) => {
          setDraft(null);
          await loadPages();
          navigate(`/pages/${id}`);
        }}
        onDeleted={async () => {
          setDraft(null);
          await loadPages();
          navigate('/home');
        }}
      />
    );
  }

  const blank = (): Draft => ({ id: null, name: t('home.newName'), cards: [], homeFor: [], sharedWith: [] });

  if (!current) {
    return (
      <>
        <header className="topbar">
          <h1 className="topbar__title">{t('nav.home')}</h1>
        </header>
        <div className="page">
          <div className="empty">
            <p>{pages.length ? t('home.notFound') : t('home.none')}</p>
            {admin ? (
              <button className="btn btn--primary" onClick={() => setDraft(blank())}>
                {t('home.newPage')}
              </button>
            ) : (
              <button className="btn" onClick={() => navigate('/my')}>
                {t('nav.myTasks')}
              </button>
            )}
          </div>
        </div>
      </>
    );
  }

  const shown = current.cards.filter((c) => data?.[c.id]?.kind !== 'hidden');
  return (
    <>
      <header className="topbar home-top">
        <div className="home-top__title">
          <h1 className="topbar__title">{current.name}</h1>
          {current.id === homeId && <span className="topbar__sub">{t('home.yourHome')}</span>}
        </div>
        <span className="topbar__spacer" />
        {admin && (
          <div className="toolbar">
            <button className="btn" onClick={() => setDraft({ id: current.id, name: current.name, cards: current.cards, homeFor: current.homeFor, sharedWith: current.sharedWith })}>
              {t('home.edit')}
            </button>
            <button className="btn btn--quiet" onClick={() => setDraft(blank())}>
              {t('home.newPage')}
            </button>
          </div>
        )}
      </header>
      {pages.length > 1 && (
        <nav className="tabs home-tabs" aria-label={t('home.pages')}>
          {pages.map((p) => (
            <a
              key={p.id}
              href={`/pages/${p.id}`}
              className="tab"
              aria-selected={p.id === current.id}
              onClick={(e) => {
                e.preventDefault();
                navigate(p.id === homeId ? '/home' : `/pages/${p.id}`);
              }}
            >
              {p.name}
            </a>
          ))}
        </nav>
      )}
      <div className="page">
        {current.cards.length === 0 ? (
          <div className="empty">
            <p>{t('home.emptyPage')}</p>
          </div>
        ) : (
          <div className="panes">
            {shown.map((card) => (
              <Tile key={card.id} card={card} data={data?.[card.id]} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ------------------------------------------------------------------ panes

function useMoney() {
  const { locale } = useI18n();
  const { me } = useStore();
  const tag = locale === 'tr' ? 'tr-TR' : 'en-GB';
  return useCallback(
    (v: number, compact = false) => {
      try {
        return new Intl.NumberFormat(tag, { style: 'currency', currency: me.org.currency, maximumFractionDigits: compact && Math.abs(v) >= 10000 ? 1 : 0, notation: compact && Math.abs(v) >= 10000 ? 'compact' : 'standard' }).format(v);
      } catch {
        return String(v);
      }
    },
    [tag, me.org.currency],
  );
}

export function useCardTitle() {
  const { t, locale } = useI18n();
  const { me } = useStore();
  return useCallback(
    (card: Card) => {
      if (card.title) return card.title;
      const field = (key?: string) => me.org.accountFields.find((f) => f.key === key);
      if (card.type === 'metric') {
        const m = card.metric ?? 'accounts';
        if (m === 'money') {
          const f = field(card.field) ?? me.org.accountFields.find((x) => x.type === 'money');
          return f ? labelOf(f.label, locale) : t('home.metric.money');
        }
        return t(`home.metric.${m}` as any, { days: card.days ?? 90 });
      }
      if (card.type === 'breakdown') {
        const by = card.by ?? 'field';
        if (by === 'field') {
          const f = field(card.field) ?? me.org.accountFields.find((x) => x.key === 'health') ?? me.org.accountFields.find((x) => x.type === 'select');
          return t('home.by.field', { field: f ? labelOf(f.label, locale) : '' });
        }
        return t(`home.by.${by}` as any);
      }
      return labelOf(CARD_INFO[card.type].name, locale);
    },
    [t, locale, me.org.accountFields],
  );
}

function Tile({ card, data, tools, dim }: { card: Card; data: CardData | undefined; tools?: ReactNode; dim?: boolean }) {
  const { t } = useI18n();
  const money = useMoney();
  const title = useCardTitle()(card);
  const caption = [
    card.scope === 'mine' ? t('home.scope.mine') : card.scope === 'team' ? t('home.scope.team') : null,
    card.type === 'renewals' || (card.type === 'metric' && card.metric === 'renewals') ? t('home.within', { n: card.days ?? 90 }) : null,
    card.type === 'quiet' ? t('home.quietFor', { n: card.days ?? 30 }) : null,
  ]
    .filter(Boolean)
    .join(', ');
  let count: ReactNode = null;
  if (data?.kind === 'list' && card.type !== 'note') count = data.total;
  let extra: string | null = null;
  if (data?.kind === 'list' && data.extra) {
    if (card.type === 'my_tasks') extra = t('home.extra.overdue', { n: data.extra });
    else if (card.type === 'stakeholders') extra = t('home.extra.noChampion', { n: data.extra });
    else extra = t('home.extra.total', { amount: money(data.extra) });
  }
  return (
    <section className="pane" data-size={card.size} data-type={card.type} data-dim={dim || undefined} aria-label={title}>
      {tools}
      <header className="pane__head">
        <div className="pane__titles">
          <h2 className="pane__title">{title}</h2>
          {caption && <div className="pane__caption">{caption}</div>}
        </div>
        {count !== null && <span className="pane__count num">{count}</span>}
      </header>
      {extra && <div className="pane__extra">{extra}</div>}
      <div className="pane__body">{data ? <TileBody card={card} data={data} /> : <div className="pane__wait" />}</div>
    </section>
  );
}

const railOf = (card: Card, r: CardRow): string => {
  if (card.type === 'my_tasks') return r.flag === 'overdue' ? 'late' : r.days === 0 ? 'today' : r.flag === 'soon' ? 'soon' : r.date ? 'later' : 'none';
  if (card.type === 'renewals') return r.days == null ? 'none' : r.days < 0 ? 'late' : r.days <= 14 ? 'today' : r.days <= 30 ? 'soon' : 'later';
  if (card.type === 'quiet') return (r.days ?? 0) >= (card.days ?? 30) * 2 ? 'late' : 'soon';
  return 'none';
};

function TileBody({ card, data }: { card: Card; data: CardData }) {
  const { t, locale, fmtDate } = useI18n();
  const { person, can } = useStore();
  const money = useMoney();
  const tag = locale === 'tr' ? 'tr-TR' : 'en-GB';

  if (data.kind === 'hidden') return <p className="pane__note">{t('home.hiddenForRole')}</p>;
  if (data.kind === 'missing') {
    return (
      <p className="pane__note">
        {t(`home.missing.${data.need}` as any)}{' '}
        {can('accounts.manage') && data.need !== 'contacts' && (
          <a href="/settings/fields" onClick={(e) => { e.preventDefault(); navigate('/settings/fields'); }}>
            {t('home.missing.add')}
          </a>
        )}
      </p>
    );
  }
  if (data.kind === 'note') return <div className="pane__text">{data.text ? linkify(data.text) : <span className="muted">{t('home.note.empty')}</span>}</div>;

  if (data.kind === 'number') {
    const value = data.unit === 'money' ? money(data.value, true) : new Intl.NumberFormat(tag).format(data.value);
    const sub = data.sub ? (data.sub.unit === 'money' ? money(data.sub.value) : t('home.accountsN', { n: data.sub.value })) : null;
    return (
      <div className="pane__number">
        <span className="pane__big num">{value}</span>
        {sub && <span className="pane__sub">{sub}</span>}
      </div>
    );
  }

  if (data.kind === 'bars') {
    const max = Math.max(1, ...data.bars.map((b) => b.value));
    if (!data.bars.length) return <p className="pane__note">{t('home.nothing')}</p>;
    return (
      <ul className="bars">
        {data.bars.map((b) => (
          <li key={b.key} className="bars__row" data-color={b.color ?? undefined}>
            <span className="bars__label">{b.label || t('home.none.value')}</span>
            <span className="bars__track" aria-hidden="true">
              <span className="bars__fill" style={{ width: `${(b.value / max) * 100}%` }} />
            </span>
            <span className="bars__value num">{b.value}</span>
          </li>
        ))}
      </ul>
    );
  }

  if (data.kind === 'people') {
    if (!data.rows.length) return <p className="pane__note">{t('home.nothing')}</p>;
    return (
      <div className="table-wrap">
        <table className="table load">
          <thead>
            <tr>
              <th>{t('home.load.person')}</th>
              <th className="num">{t('home.load.accounts')}</th>
              {data.unit === 'money' && <th className="num hide-phone">{t('home.load.money')}</th>}
              <th className="num">{t('home.load.open')}</th>
              <th className="num">{t('home.load.overdue')}</th>
              <th className="num hide-phone">{t('home.load.attention')}</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.userId}>
                <td>{r.name}</td>
                <td className="num">{r.accounts}</td>
                {data.unit === 'money' && <td className="num hide-phone">{money(r.money ?? 0, true)}</td>}
                <td className="num">{r.open}</td>
                <td className="num" data-hot={r.overdue > 0 || undefined}>{r.overdue}</td>
                <td className="num hide-phone" data-hot={r.attention > 0 || undefined}>{r.attention}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (data.kind === 'sync') {
    if (!data.rows.length) {
      return (
        <p className="pane__note">
          {t('home.sync.none')}{' '}
          <a href="/settings/sources" onClick={(e) => { e.preventDefault(); navigate('/settings/sources'); }}>
            {t('home.sync.connect')}
          </a>
        </p>
      );
    }
    return (
      <ul className="pane-rows">
        {data.rows.map((r) => (
          <li key={r.id}>
            <button className="pane-row" data-due={r.ok ? 'done' : 'late'} onClick={() => navigate(`/settings/sources/${r.id}`)}>
              <span className="pane-row__main">
                <span className="pane-row__title">{r.name || PROVIDER_NAMES[r.provider] || r.provider}</span>
                <span className="pane-row__sub">{r.lastRunAt ? t('home.sync.last', { when: relativeTime(r.lastRunAt, t) }) : t('home.sync.never')}</span>
              </span>
              <span className="pane-row__end">{r.ok ? t('home.sync.ok') : r.problems ? t('home.sync.problems', { n: r.problems }) : t(`home.sync.status.${r.status}` as any)}</span>
            </button>
          </li>
        ))}
      </ul>
    );
  }

  // Lists of customers, tasks or people.
  if (!data.rows.length) return <p className="pane__note">{t(`home.empty.${card.type}` as any)}</p>;
  return (
    <ul className="pane-rows">
      {data.rows.map((r) => {
        // On "your own" cards the owner is always the viewer, so it is left out.
        const owner = card.scope === 'mine' ? null : person(r.ownerId ?? null)?.name;
        const sub = r.sub ?? owner ?? null;
        let end: ReactNode = null;
        if (card.type === 'my_tasks' && r.date) end = r.flag === 'overdue' ? t('home.daysLate', { n: -(r.days ?? 0) }) : r.days === 0 ? t('home.today') : fmtDate(r.date);
        else if (card.type === 'renewals' && r.date) end = r.days === 0 ? t('home.today') : t('home.inDays', { n: r.days ?? 0 });
        else if (card.type === 'quiet') end = r.date ? t('home.quietDays', { n: r.days ?? 0 }) : t('home.neverActive');
        else if (r.amount != null) end = money(r.amount, true);
        const open = () => (card.type === 'my_tasks' ? setQuery('task', r.id) : r.accountId && navigate(`/accounts/${r.accountId}`));
        return (
          <li key={r.id}>
            <button className="pane-row" data-due={railOf(card, r)} onClick={open}>
              <span className="pane-row__main">
                <span className="pane-row__title">{r.title}</span>
                {(sub || (card.type === 'renewals' && r.amount != null)) && (
                  <span className="pane-row__sub">
                    {sub}
                    {card.type === 'renewals' && r.amount != null && <span className="pane-row__amount num">{money(r.amount, true)}</span>}
                  </span>
                )}
              </span>
              {r.chip && (
                <span className="optchip" data-color={r.chip.color ?? undefined}>
                  {r.chip.label}
                </span>
              )}
              {end && <span className="pane-row__end num">{end}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Plain text with web addresses made clickable; nothing else is interpreted. */
function linkify(text: string) {
  return text.split('\n').map((line, i) => (
    <p key={i}>
      {line.split(/(https?:\/\/[^\s]+)/g).map((part, j) =>
        /^https?:\/\//.test(part) ? (
          <a key={j} href={part} target="_blank" rel="noreferrer noopener">
            {part.replace(/^https?:\/\//, '')}
          </a>
        ) : (
          part
        ),
      )}
    </p>
  ));
}

// ----------------------------------------------------------------- editor

function useRoles() {
  const [roles, setRoles] = useState<Role[]>([]);
  useEffect(() => {
    void get<{ roles: Role[] }>('/admin/roles').then((r) => setRoles(r.roles));
  }, []);
  return roles;
}

function newCard(type: CardType, taken: Card[]): Card {
  let n = taken.length + 1;
  while (taken.some((c) => c.id === `c${n}`)) n++;
  const base: Card = { id: `c${n}`, type, size: type === 'metric' ? 'third' : type === 'team_load' || type === 'sync_health' || type === 'note' ? 'full' : 'half' };
  if (CARD_SETTINGS[type].scope) base.scope = 'mine';
  if (type === 'renewals') base.days = 90;
  if (type === 'quiet') base.days = 30;
  if (type === 'metric') base.metric = 'accounts';
  if (type === 'breakdown') base.by = 'field';
  return base;
}

function PageEditor({ draft: start, onCancel, onSaved, onDeleted }: { draft: Draft; onCancel: () => void; onSaved: (id: string) => void; onDeleted: () => void }) {
  const { t, locale } = useI18n();
  const { toast } = useStore();
  const roles = useRoles();
  const title = useCardTitle();
  const [d, setD] = useState<Draft>(start);
  const [data, setData] = useState<Data>({});
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Card | null>(null);
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  // What each card will show, as the page is being put together.
  useEffect(() => {
    const n = ++seq.current;
    const id = setTimeout(async () => {
      try {
        const r = await post<{ data: Data }>('/pages/preview', { cards: d.cards });
        if (n === seq.current) setData(r.data);
      } catch {
        /* shown again on the next change */
      }
    }, 300);
    return () => clearTimeout(id);
  }, [d.cards]);

  const setCards = (fn: (cs: Card[]) => Card[]) => setD((x) => ({ ...x, cards: fn(x.cards) }));
  const move = (i: number, by: number) =>
    setCards((cs) => {
      const j = i + by;
      if (j < 0 || j >= cs.length) return cs;
      const next = [...cs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const toggle = (list: string[], key: string) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);

  async function save() {
    if (!d.name.trim()) return;
    setBusy(true);
    try {
      const body = { name: d.name.trim(), cards: d.cards, homeFor: d.homeFor, sharedWith: d.sharedWith };
      const r = d.id ? await patch<{ page: Page }>(`/pages/${d.id}`, body) : await post<{ page: Page }>('/pages', body);
      toast(t('common.saved'));
      onSaved(r.page.id);
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
    } finally {
      setBusy(false);
    }
  }

  const sorted = useMemo(() => {
    const order = ['admin', 'manager', 'member', 'viewer'];
    return [...roles].sort((a, b) => (order.indexOf(a.key) + 1 || 99) - (order.indexOf(b.key) + 1 || 99) || a.name.localeCompare(b.name, locale));
  }, [roles, locale]);

  return (
    <>
      <header className="topbar home-top">
        <label className="home-name">
          <span className="sr-only">{t('home.pageName')}</span>
          <input className="input home-name__input" value={d.name} maxLength={80} onChange={(e) => setD({ ...d, name: e.target.value })} />
        </label>
        <span className="topbar__spacer" />
        <div className="toolbar">
          {d.id && (
            <button className="btn btn--danger" onClick={() => setRemoving(true)}>
              {t('home.deletePage')}
            </button>
          )}
          <button className="btn" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button className="btn btn--primary" disabled={busy || !d.name.trim()} onClick={save}>
            {t('common.save')}
          </button>
        </div>
      </header>
      <div className="page">
        <section className="page-who">
          <div className="page-who__group">
            <div className="field__label">{t('home.homeFor')}</div>
            <div className="field__hint">{t('home.homeFor.hint')}</div>
            <div className="chips-row">
              {sorted.map((r) => (
                <button key={r.id} className="rolechip" aria-pressed={d.homeFor.includes(r.key)} onClick={() => setD({ ...d, homeFor: toggle(d.homeFor, r.key) })}>
                  {r.name}
                </button>
              ))}
            </div>
          </div>
          <div className="page-who__group">
            <div className="field__label">{t('home.sharedWith')}</div>
            <div className="seg" role="group" aria-label={t('home.sharedWith')}>
              <button aria-pressed={d.sharedWith.length === 0} onClick={() => setD({ ...d, sharedWith: [] })}>
                {t('home.shared.everyone')}
              </button>
              <button aria-pressed={d.sharedWith.length > 0} onClick={() => setD({ ...d, sharedWith: d.sharedWith.length ? d.sharedWith : [...new Set([...d.homeFor, 'admin'])] })}>
                {t('home.shared.some')}
              </button>
            </div>
            {d.sharedWith.length > 0 && (
              <div className="chips-row">
                {sorted.map((r) => (
                  <button key={r.id} className="rolechip" aria-pressed={d.sharedWith.includes(r.key) || d.homeFor.includes(r.key)} disabled={d.homeFor.includes(r.key)} onClick={() => setD({ ...d, sharedWith: toggle(d.sharedWith, r.key) })}>
                    {r.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        <p className="field__hint home-tip">{t('home.editTip')}</p>
        <div className="panes panes--edit">
          {d.cards.map((card, i) => (
            <Tile
              key={card.id}
              card={card}
              data={data[card.id]}
              tools={
                <div className="pane__tools">
                  <button className="btn btn--quiet btn--small" aria-label={t('home.moveEarlier', { card: title(card) })} disabled={i === 0} onClick={() => move(i, -1)}>
                    ←
                  </button>
                  <button className="btn btn--quiet btn--small" aria-label={t('home.moveLater', { card: title(card) })} disabled={i === d.cards.length - 1} onClick={() => move(i, 1)}>
                    →
                  </button>
                  <select
                    className="select pane__size"
                    value={card.size}
                    aria-label={t('home.size')}
                    onChange={(e) => setCards((cs) => cs.map((c) => (c.id === card.id ? { ...c, size: e.target.value as CardSize } : c)))}
                  >
                    {SIZES.map((s) => (
                      <option key={s} value={s}>
                        {t(`home.size.${s}` as any)}
                      </option>
                    ))}
                  </select>
                  <button className="btn btn--small" onClick={() => setEditing(card)}>
                    {t('home.cardSettings')}
                  </button>
                  <button className="btn btn--quiet btn--small" aria-label={t('home.removeCard', { card: title(card) })} onClick={() => setCards((cs) => cs.filter((c) => c.id !== card.id))}>
                    ✕
                  </button>
                </div>
              }
            />
          ))}
          <button className="pane pane--add" data-size={d.cards.length % 2 ? 'half' : 'full'} onClick={() => setAdding(true)}>
            <span>{t('home.addCard')}</span>
          </button>
        </div>
      </div>
      {adding && (
        <CardLibrary
          onClose={() => setAdding(false)}
          onPick={(type) => {
            const c = newCard(type, d.cards);
            setCards((cs) => [...cs, c]);
            setAdding(false);
            if (type === 'note') setEditing(c);
          }}
        />
      )}
      {editing && (
        <CardSettings
          card={editing}
          onClose={() => setEditing(null)}
          onSave={(c) => {
            setCards((cs) => cs.map((x) => (x.id === c.id ? c : x)));
            setEditing(null);
          }}
        />
      )}
      {removing && d.id && (
        <Confirm
          title={t('home.deleteTitle', { name: start.name })}
          body={t('home.deleteBody')}
          confirmLabel={t('home.deletePage')}
          danger
          onClose={() => setRemoving(false)}
          onConfirm={async () => {
            await del(`/pages/${d.id}`);
            onDeleted();
          }}
        />
      )}
    </>
  );
}

function CardLibrary({ onPick, onClose }: { onPick: (t: CardType) => void; onClose: () => void }) {
  const { t, locale } = useI18n();
  return (
    <Dialog title={t('home.addCard')} onClose={onClose} wide>
      <ul className="library">
        {CARD_TYPES.map((type) => (
          <li key={type}>
            <button className="library__item" onClick={() => onPick(type)}>
              <span className="library__name">{labelOf(CARD_INFO[type].name, locale)}</span>
              <span className="library__help">{labelOf(CARD_INFO[type].help, locale)}</span>
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

function CardSettings({ card, onSave, onClose }: { card: Card; onSave: (c: Card) => void; onClose: () => void }) {
  const { t, locale } = useI18n();
  const { me } = useStore();
  const [c, setC] = useState<Card>(card);
  const opts = CARD_SETTINGS[c.type];
  const fieldType = c.type === 'metric' ? (c.metric === 'money' ? 'money' : c.metric === 'renewals' ? 'date' : c.metric === 'attention' ? 'select' : null) : c.type === 'breakdown' && (c.by ?? 'field') !== 'field' ? null : (opts.field ?? null);
  const fields = fieldType ? me.org.accountFields.filter((f) => f.type === fieldType && !f.rollup) : [];
  const chosen: AccountField | undefined = fields.find((f) => f.key === c.field) ?? (fieldType === 'select' ? (fields.find((f) => f.key === 'health') ?? fields[0]) : undefined);
  const wantsOptions = fieldType === 'select' && (c.type === 'attention' || c.metric === 'attention');
  const wantsDays = opts.days && (c.type !== 'metric' || c.metric === 'renewals');
  const set = (patch: Partial<Card>) => setC((x) => ({ ...x, ...patch }));
  return (
    <Dialog
      title={t('home.cardSettingsOf', { card: labelOf(CARD_INFO[c.type].name, locale) })}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn btn--primary" onClick={() => onSave(c)}>
            {t('common.save')}
          </button>
        </>
      }
    >
      <label className="field">
        <span className="field__label">{t('home.cardTitle')}</span>
        <input className="input" value={c.title ?? ''} maxLength={80} placeholder={t('home.cardTitle.auto')} onChange={(e) => set({ title: e.target.value || undefined })} />
      </label>
      {opts.metric && (
        <label className="field">
          <span className="field__label">{t('home.metric')}</span>
          <select className="select" value={c.metric ?? 'accounts'} onChange={(e) => set({ metric: e.target.value as Card['metric'], field: undefined, options: undefined, days: e.target.value === 'renewals' ? (c.days ?? 90) : undefined })}>
            {METRICS.map((m) => (
              <option key={m} value={m}>
                {t(`home.metric.${m}` as any, { days: c.days ?? 90 })}
              </option>
            ))}
          </select>
        </label>
      )}
      {opts.by && (
        <label className="field">
          <span className="field__label">{t('home.by')}</span>
          <select className="select" value={c.by ?? 'field'} onChange={(e) => set({ by: e.target.value as Card['by'], field: undefined })}>
            {BREAKDOWNS.map((b) => (
              <option key={b} value={b}>
                {b === 'field' ? t('home.by.aField') : t(`home.by.${b}` as any)}
              </option>
            ))}
          </select>
        </label>
      )}
      {opts.scope && (
        <fieldset className="field plain-fieldset">
          <legend className="field__label">{t('home.scope')}</legend>
          <div className="seg" role="group">
            {CARD_SCOPES.map((s) => (
              <button key={s} aria-pressed={(c.scope ?? 'all') === s} onClick={() => set({ scope: s })}>
                {t(`home.scope.pick.${s}` as any)}
              </button>
            ))}
          </div>
          <span className="field__hint">{t('home.scope.hint')}</span>
        </fieldset>
      )}
      {wantsDays && (
        <label className="field">
          <span className="field__label">{c.type === 'quiet' ? t('home.days.quiet') : t('home.days.renewals')}</span>
          <input className="input" type="number" min={1} max={730} value={c.days ?? (c.type === 'quiet' ? 30 : 90)} onChange={(e) => set({ days: Math.max(1, Math.min(730, Number(e.target.value) || 1)) })} />
        </label>
      )}
      {fieldType && (
        <label className="field">
          <span className="field__label">{t('home.field')}</span>
          <select className="select" value={c.field ?? ''} onChange={(e) => set({ field: e.target.value || undefined, options: undefined })}>
            <option value="">{t('home.field.auto')}</option>
            {fields.map((f) => (
              <option key={f.key} value={f.key}>
                {labelOf(f.label, locale)}
              </option>
            ))}
          </select>
          {!fields.length && <span className="field__hint">{t(`home.missing.${fieldType}` as any)}</span>}
        </label>
      )}
      {wantsOptions && chosen && (
        <fieldset className="field plain-fieldset">
          <legend className="field__label">{t('home.options')}</legend>
          <div className="chips-row">
            {(chosen.options ?? []).map((o) => {
              const on = c.options?.length ? c.options.includes(o.key) : /risk|danger|churn|red|bad|critical/i.test(o.key);
              return (
                <button
                  key={o.key}
                  className="rolechip"
                  data-color={o.color}
                  aria-pressed={on}
                  onClick={() => {
                    const current = c.options?.length ? c.options : (chosen.options ?? []).filter((x) => /risk|danger|churn|red|bad|critical/i.test(x.key)).map((x) => x.key);
                    set({ options: on ? current.filter((k) => k !== o.key) : [...current, o.key], field: chosen.key });
                  }}
                >
                  {labelOf(o.label, locale)}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}
      {opts.text && (
        <label className="field">
          <span className="field__label">{t('home.note.text')}</span>
          <textarea className="textarea" value={c.text ?? ''} maxLength={2000} onChange={(e) => set({ text: e.target.value })} />
          <span className="field__hint">{t('home.note.hint')}</span>
        </label>
      )}
    </Dialog>
  );
}
