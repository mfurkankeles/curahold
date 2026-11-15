// The Ctrl/⌘ K box itself, read when it is first wanted (or when the browser is idle), so the
// first screen does not carry it. See Search.tsx.
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { get } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { navigate, setQuery } from '../lib/router';
import { useStore } from '../lib/store';
import { useTheme } from '../lib/theme';

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
  go: () => void;
}

const fold = (s: string) => s.toLocaleLowerCase('tr-TR').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');

export default function SearchPalette({ onClose, onNewBoard }: { onClose: () => void; onNewBoard: () => void }) {
  const { t, words, locale } = useI18n();
  const { me, boards, people, can, canWrite } = useStore();
  const [q, setQ] = useState('');
  // The box answers each key at once; the list follows a moment later, so typing never waits for it.
  const shownQ = useDeferredValue(q);
  // The last answer and the words it was for: typing on narrows it at once while the server is asked again.
  const [answer, setAnswer] = useState<{ q: string; r: Found } | null>(null);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
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
      ...boards.map((b) => ({ key: `b:${b.id}`, group: 'places', title: b.name, sub: t('search.board'), go: go(`/b/${b.id}`) })),
      { key: 'p:inbox', group: 'places', title: t('nav.inbox'), go: go('/inbox') },
      { key: 'p:team', group: 'places', title: t('nav.team'), go: go('/team') },
      { key: 'p:timeline', group: 'places', title: t('nav.timeline'), go: go('/timeline') },
      { key: 'p:reports', group: 'places', title: t('nav.reports'), go: go('/reports') },
      { key: 'p:dash', group: 'places', title: t('nav.dashboards'), go: go('/dashboards') },
      { key: 'p:trash', group: 'places', title: t('trash.title'), go: go('/trash') },
      { key: 'p:me', group: 'places', title: t('nav.profile'), go: go('/profile') },
      ...(isAdmin ? [{ key: 'p:set', group: 'places', title: t('nav.settings'), go: go('/settings') }] : []),
    ];
    // Every settings page this person may open, by its own name.
    const manage = can('org.manage');
    const settings: Item[] = (
      [
        ['company', t('settings.tab.company'), manage],
        ['billing', t('settings.tab.billing'), manage && !!me.org.billingOn],
        ['currencies', t('settings.tab.currencies'), manage],
        ['fields', t('settings.tab.fields', { account: words.one }), can('accounts.manage')],
        ['records', t('settings.tab.records'), can('accounts.manage')],
        ['health', t('settings.tab.health'), can('accounts.manage')],
        ['rhythm', t('settings.tab.rhythm'), can('accounts.manage') || manage],
        ['people', t('settings.tab.people'), can('users.manage')],
        ['joining', t('settings.tab.joining'), can('users.manage')],
        ['teams', t('settings.tab.teams'), can('teams.manage')],
        ['roles', t('search.roles'), manage || can('users.manage')],
        ['sso', t('settings.tab.sso'), manage],
        ['connections', t('settings.tab.connections'), can('connections.manage')],
        ['sources', t('settings.tab.sources'), can('connections.manage')],
        ['automations', t('settings.tab.automations'), can('automations.manage')],
        ['playbooks', t('settings.tab.playbooks'), manage || can('accounts.manage')],
        ['developer', t('settings.tab.developer'), can('connections.manage') || can('users.manage')],
        ['portal', t('settings.tab.portal'), manage],
        ['support', t('settings.tab.support'), manage],
        ['audit', t('settings.tab.audit'), can('audit.view')],
        ['errors', t('settings.tab.errors'), manage],
      ] as [string, string, boolean][]
    )
      .filter((x) => x[2])
      .map(([key, title]) => ({ key: `s:${key}`, group: 'settings', title, sub: t('nav.settings'), go: go(`/settings/${key}`) }));
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
          { key: 'a:board', group: 'actions', title: t('nav.newBoard'), go: () => (onClose(), onNewBoard()) },
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
    const local = [...actions, ...places, ...settings].filter((i) => !needle || fold(i.title).includes(needle));
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
  }, [answer, shownQ, t, words, boards, people, isAdmin, can, canWrite, me, locale, onClose, onNewBoard, theme, setTheme]);

  // Back to the first result when the list changes (and on every key, in onChange: no second drawing per key).
  useEffect(() => setActive(0), [items.length]);
  useEffect(() => {
    list.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') {
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
    <div className="palette-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette-box" role="dialog" aria-modal="true" aria-label={t('search.open')}>
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
