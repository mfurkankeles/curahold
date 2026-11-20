// The Ctrl/⌘ K box itself, read when it is first wanted (or when the browser is idle), so the
// first screen does not carry it. See Search.tsx.
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { get } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { navigate, setQuery } from '../lib/router';
import { useStore } from '../lib/store';
import { useDepartments } from '../lib/departments';
import { SETTINGS_TOPICS, topicLabel, topicWords } from '../lib/settingsIndex';
import { useTheme } from '../lib/theme';
import { trapTab, CloseButton } from './ui';
import { useLeave } from '../lib/leave';

interface Found {
  accounts: { id: string; name: string }[];
  tasks: { id: string; title: string; boardName: string; accountName: string | null; dueDate: string | null }[];
  records: { id: string; name: string; accountId: string | null; accountName: string | null; typeKey: string; typeName: { one: Record<string, string> } }[];
  boards: { id: string; name: string }[];
  people: { id: string; name: string; email: string }[];
}

interface Item {
  key: string;
  group: string;
  title: string;
  sub?: string | null;
  /** More words it is found by than its title (settings topics). */
  find?: string;
  go: () => void;
}

const fold = (s: string) => s.toLocaleLowerCase('tr-TR').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');

/** Search across customers, tasks, records, boards and people, with keyboard navigation and quick actions. */
export default function SearchPalette({ onClose, onNewBoard }: { onClose: () => void; onNewBoard: () => void }) {
  const leaveWrap = useLeave<HTMLDivElement>();
  const { t, words, locale } = useI18n();
  const { me, boards, people, can, canWrite } = useStore();
  const depts = useDepartments();
  const { canOpenBoards } = depts;
  const [q, setQ] = useState('');
  // The box answers each key at once; the list follows a moment later, so typing never waits for it.
  const shownQ = useDeferredValue(q);
  // The last answer and the words it was for: typing on narrows it at once while the server is asked again.
  const [answer, setAnswer] = useState<{ q: string; r: Found } | null>(null);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const isAdmin = can('org.manage') || can('users.manage') || can('accounts.manage');
  const [theme, setTheme] = useTheme();

  useEffect(() => input.current?.focus(), []);
  useEffect(() => {
    const words = q.trim();
    if (words.length < 2) {
      setAnswer(null);
      return;
    }
    let live = true;
    // Asked at once on every key: what is on screen narrows meanwhile, and only the latest answer is kept.
    get<Found>(`/search?q=${encodeURIComponent(words)}`)
      .then((r) => live && setAnswer({ q: words, r }))
      .catch(() => live && setAnswer(null));
    return () => {
      live = false;
    };
  }, [q]);

  const items = useMemo<Item[]>(() => {
    const go = (to: string) => () => {
      onClose();
      navigate(to);
    };
    const places: Item[] = [
      { key: 'p:home', group: 'places', title: t('nav.home'), go: go('/home') },
      { key: 'p:my', group: 'places', title: t('nav.myTasks'), go: go('/my') },
      { key: 'p:cal', group: 'places', title: t('nav.calendar'), go: go('/calendar') },
      { key: 'p:acc', group: 'places', title: words.other, go: go('/accounts') },
      // A board says which department it lives in.
      ...boards.map((b) => {
        const d = depts.byId(b.departmentId);
        return { key: `b:${b.id}`, group: 'places', title: b.name, sub: d ? `${t('search.board')} · ${depts.name(d.key)}` : t('search.board'), go: go(`/b/${b.id}`) };
      }),
      { key: 'p:inbox', group: 'places', title: t('nav.inbox'), go: go('/inbox') },
      { key: 'p:team', group: 'places', title: t('nav.team'), go: go('/team') },
      { key: 'p:timeline', group: 'places', title: t('nav.timeline'), go: go('/timeline') },
      { key: 'p:reports', group: 'places', title: t('nav.reports'), go: go('/reports') },
      { key: 'p:dash', group: 'places', title: t('nav.dashboards'), go: go('/dashboards') },
      { key: 'p:trash', group: 'places', title: t('trash.title'), go: go('/trash') },
      { key: 'p:me', group: 'places', title: t('nav.profile'), go: go('/profile') },
      ...(isAdmin ? [{ key: 'p:set', group: 'places', title: t('nav.settings'), go: go('/settings') }] : []),
    ];
    // Every settings page this person may open, by its own name and the words its topic is known by
    // (the same index as Settings' own search, lib/settingsIndex.ts).
    const settings: Item[] = SETTINGS_TOPICS.filter((x) => x.allowed(can, !!me.org.billingOn)).map((x) => ({
      key: `s:${x.key}`,
      group: 'settings',
      title: topicLabel(t, words, x.key),
      sub: t('nav.settings'),
      find: `${topicWords(t, words, x.key)} ${t('settings.title')}`,
      go: go(`/settings/${x.key}`),
    }));
    const always: Item[] = [
      {
        key: 'a:keys',
        group: 'actions',
        title: t('keys.title'),
        go: () => {
          onClose();
          // The sheet opens from its own key once this box has closed.
          setTimeout(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '?' })), 0);
        },
      },
      { key: 'a:theme', group: 'actions', title: theme === 'dark' ? t('search.themeLight') : t('search.themeDark'), go: () => (onClose(), setTheme(theme === 'dark' ? 'light' : 'dark')) },
    ];
    const actions: Item[] = canWrite
      ? [
          {
            key: 'a:task',
            group: 'actions',
            title: t('search.newTask'),
            go: () => {
              onClose();
              const target = me.user.prefs.defaultBoardId ?? boards[0]?.id;
              if (target) navigate(`/b/${target}?new=1`);
            },
          },
          ...(canOpenBoards ? [{ key: 'a:board', group: 'actions', title: t('nav.newBoard'), go: () => (onClose(), onNewBoard()) }] : []),
          { key: 'a:import', group: 'actions', title: t('imp.page.title'), go: () => (onClose(), navigate('/import')) },
          ...always,
        ]
      : always;
    const needle = fold(shownQ.trim());
    // What the last answer already holds that still matches, shown before the new answer comes.
    const was = answer ? fold(answer.q) : null;
    const has = (...texts: (string | null | undefined)[]) => texts.some((x) => x && fold(x).includes(needle));
    const found: Found | null = !answer || was === null || !needle.startsWith(was)
      ? null
      : was === needle
        ? answer.r
        : {
            accounts: answer.r.accounts.filter((a) => has(a.name)),
            tasks: answer.r.tasks.filter((x) => has(x.title, x.accountName)),
            records: answer.r.records.filter((r) => has(r.name, r.accountName)),
            boards: answer.r.boards.filter((b) => has(b.name)),
            people: answer.r.people.filter((p) => has(p.name, p.email)),
          };
    // People are already here: they show from the first key.
    const near = needle.length >= 2 ? people.filter((p) => (p.status === 'active' || p.status === 'invited') && has(p.name, p.email)).slice(0, 6) : [];
    const local = [...actions, ...places, ...settings].filter((i) => !needle || fold(i.find ?? i.title).includes(needle));
    const folks = [...(found?.people ?? []), ...near.filter((p) => !found?.people.some((x) => x.id === p.id))].slice(0, 6);
    const mates: Item[] = folks.map((p) => ({ key: `p:${p.id}`, group: 'people', title: p.name, sub: p.email ?? undefined, go: go(`/accounts?owner=${p.id}`) }));
    if (!found) return needle ? [...mates, ...local] : [...actions, ...places.slice(0, 5)];
    const remote: Item[] = [
      ...found.accounts.map((a) => ({ key: `acc:${a.id}`, group: 'accounts', title: a.name, go: go(`/accounts/${a.id}`) })),
      ...found.tasks.map((x) => ({
        key: `task:${x.id}`,
        group: 'tasks',
        title: x.title,
        sub: [x.accountName, x.boardName].filter(Boolean).join(', '),
        go: () => {
          onClose();
          setQuery('task', x.id);
        },
      })),
      ...found.records.map((r) => ({
        key: `rec:${r.id}`,
        group: 'records',
        title: r.name,
        sub: [r.typeName?.one?.[locale] ?? r.typeName?.one?.en, r.accountName].filter(Boolean).join(', '),
        go: go(r.accountId ? `/accounts/${r.accountId}` : `/records/${r.typeKey}`),
      })),
      ...mates,
    ];
    return [...remote, ...local];
  }, [answer, shownQ, t, words, boards, people, isAdmin, can, canWrite, me, locale, onClose, onNewBoard, theme, setTheme, depts, canOpenBoards]);

  // Back to the first result when the list changes (and on every key, in onChange: no second drawing per key).
  useEffect(() => setActive(0), [items.length]);
  useEffect(() => {
    list.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(items.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter' && items[active]) {
      e.preventDefault();
      items[active].go();
    }
  };

  let lastGroup = '';
  return (
    <div ref={leaveWrap} className="palette-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      {/* Escape closes from wherever the focus is in it, and Tab goes round inside it (WCAG 2.1.2). */}
      <div
        className="palette-box"
        role="dialog"
        aria-modal="true"
        aria-label={t('search.open')}
        ref={box}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
          else trapTab(e.nativeEvent, box.current);
        }}
      >
        <div className="palette-top">
          <input
            ref={input}
            className="palette-input"
            value={q}
            placeholder={t('search.placeholder')}
            aria-label={t('search.placeholder')}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={items[active] ? `pi-${active}` : undefined}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKey}
          />
          <CloseButton onClick={onClose} />
        </div>
        <div className="palette-list" id="palette-list" role="listbox" ref={list}>
          {items.length === 0 && <p className="palette-none">{t('search.none')}</p>}
          {items.map((it, i) => {
            const head = it.group !== lastGroup ? it.group : null;
            lastGroup = it.group;
            return (
              <div key={it.key}>
                {head && <div className="palette-group">{t(`search.group.${head}` as any, { accounts: words.other })}</div>}
                <button id={`pi-${i}`} role="option" aria-selected={i === active} data-active={i === active || undefined} className="palette-item" onMouseEnter={() => setActive(i)} onClick={it.go}>
                  <span className="palette-item__title">{it.title}</span>
                  {it.sub && <span className="palette-item__sub">{it.sub}</span>}
                </button>
              </div>
            );
          })}
        </div>
        <div className="palette-foot">{t('search.keys')}</div>
      </div>
    </div>
  );
}
