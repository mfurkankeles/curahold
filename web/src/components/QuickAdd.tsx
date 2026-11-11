// Quick add: write the task the way you would say it. "Acme ile yenileme
// görüşmesi cuma @Ayşe #Acme !yüksek" becomes a task due Friday, for Ayşe,
// on Acme, high priority. Paste several lines and each one becomes a task.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Account, Priority, Task } from '../../../shared/src/model';
import { ApiFailure, get, post } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { fold, parseQuick, pickAt, removeToken, type Parsed, type Pickable, type TokenKind } from '../lib/quickparse';
import { setQuery } from '../lib/router';
import { tasksChanged, type QuickDefaults } from '../lib/shell';
import { useStore } from '../lib/store';
import { dueState } from '../lib/time';
import { Icon, type IconName } from './icons';
import { Avatar } from './ui';

const KIND_ICON: Record<TokenKind, IconName> = { due: 'calendar', person: 'user', account: 'building', priority: 'flag', repeat: 'repeat' };
const LAST_BOARD = 'tw_quick_board';
const KEEP = 'tw_quick_keep';
const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* per-device convenience */
  }
};

export function QuickAdd({ defaults, onClose }: { defaults: QuickDefaults; onClose: () => void }) {
  const { t, locale, fmtDate, words } = useI18n();
  const { me, boards, people, toast } = useStore();
  const [text, setText] = useState(defaults.text ?? '');
  const [boardId, setBoardId] = useState(() => {
    const want = defaults.boardId ?? read(LAST_BOARD);
    return boards.find((b) => b.id === want)?.id ?? boards[0]?.id ?? '';
  });
  const board = boards.find((b) => b.id === boardId);
  const [status, setStatus] = useState(defaults.status ?? '');
  const [fixedAccount, setFixedAccount] = useState<Pickable | null>(defaults.accountId ? { id: defaults.accountId, name: defaults.accountName ?? '' } : null);
  const [fixedPeople, setFixedPeople] = useState<string[]>(defaults.assigneeIds ?? []);
  const [fixedDue, setFixedDue] = useState<string | null>(defaults.dueDate ?? null);
  const [found, setFound] = useState<Map<string, Pickable>>(new Map());
  const [caret, setCaret] = useState(0);
  const [suggest, setSuggest] = useState<{ items: Pickable[]; active: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [keep, setKeep] = useState(() => read(KEEP) === '1');
  const [howOpen, setHowOpen] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!board) return;
    if (!board.columns.some((c) => c.key === status)) setStatus(board.columns[0]?.key ?? '');
  }, [board, status]);

  // Focus in, Escape out, focus back where it was.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = box.current;
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
    return () => prev?.focus?.();
  }, []);

  const pickable = useMemo(() => people.filter((p) => p.seat === 'full' && (p.status === 'active' || p.status === 'invited')).map((p) => ({ id: p.id, name: p.name })), [people]);
  const meP = useMemo(() => ({ id: me.user.id, name: me.user.name }), [me.user.id, me.user.name]);
  const accountsKnown = useMemo(() => [...found.values()], [found]);

  // Customers are looked up as they are typed after "#".
  const at = pickAt(text, caret);
  const query = at?.kind === '#' ? at.query : null;
  useEffect(() => {
    if (query === null) return;
    let live = true;
    const id = setTimeout(() => {
      void get<{ accounts: Account[] }>(`/accounts?limit=8${query ? `&q=${encodeURIComponent(query)}` : ''}`)
        .then((r) => {
          if (!live) return;
          setFound((m) => {
            const next = new Map(m);
            for (const a of r.accounts) next.set(a.id, { id: a.id, name: a.name });
            return next;
          });
          const q = fold(query);
          setSuggest({ items: r.accounts.filter((a) => !q || fold(a.name).includes(q)).map((a) => ({ id: a.id, name: a.name })), active: 0 });
        })
        .catch(() => undefined);
    }, 120);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [query]);
  // Also look up the customers already written on the line (pasted text, a reopened draft).
  useEffect(() => {
    const names = [...text.matchAll(/(?:^|\s)#([^\s#@!]+)/g)].map((m) => m[1]).filter((n) => n.length >= 2);
    const missing = names.filter((n) => !accountsKnown.some((a) => fold(a.name).startsWith(fold(n))));
    if (!missing.length) return;
    let live = true;
    const id = setTimeout(() => {
      void Promise.all(missing.slice(0, 5).map((n) => get<{ accounts: Account[] }>(`/accounts?limit=5&q=${encodeURIComponent(n)}`).catch(() => ({ accounts: [] as Account[] })))).then((rs) => {
        if (!live) return;
        setFound((m) => {
          const next = new Map(m);
          for (const r of rs) for (const a of r.accounts) next.set(a.id, { id: a.id, name: a.name });
          return next;
        });
      });
    }, 250);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [text, accountsKnown]);
  useEffect(() => {
    if (!at) return setSuggest(null);
    if (at.kind === '@') {
      const q = fold(at.query);
      const list = [meP, ...pickable.filter((p) => p.id !== meP.id)].filter((p) => !q || fold(p.name).split(/\s+/).some((w) => w.startsWith(q)) || fold(p.name).startsWith(q));
      setSuggest({ items: list.slice(0, 6), active: 0 });
    }
    // "#" suggestions arrive with the lookup above.
  }, [at?.kind, at?.query, pickable, meP]); // eslint-disable-line react-hooks/exhaustive-deps

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const parsed: Parsed[] = useMemo(() => lines.map((l) => parseQuick(l, pickable, accountsKnown, meP)), [text, pickable, accountsKnown, meP]); // eslint-disable-line react-hooks/exhaustive-deps
  const many = lines.length > 1;
  const ready = parsed.length > 0 && parsed.every((p) => p.title) && !!board;

  const accept = (item: Pickable) => {
    if (!at) return;
    const insert = `${at.kind}${item.id === meP.id && at.kind === '@' ? (locale === 'tr' ? 'ben' : 'me') : item.name} `;
    const next = text.slice(0, at.start) + insert + text.slice(at.end).replace(/^\s+/, '');
    setText(next);
    setSuggest(null);
    if (at.kind === '#') setFound((m) => new Map(m).set(item.id, item));
    const pos = at.start + insert.length;
    requestAnimationFrame(() => {
      box.current?.focus();
      box.current?.setSelectionRange(pos, pos);
      setCaret(pos);
    });
  };

  const submit = async () => {
    if (!ready || busy || !board) return;
    setBusy(true);
    setError('');
    const made: Task[] = [];
    try {
      for (const p of parsed) {
        const assignees = [...new Set([...fixedPeople, ...p.assignees.map((a) => a.id)])];
        const r = await post<{ task: Task }>('/tasks', {
          boardId: board.id,
          status: status || board.columns[0].key,
          title: p.title,
          dueDate: p.dueDate ?? fixedDue,
          assigneeIds: assignees,
          accountId: p.account?.id ?? fixedAccount?.id ?? null,
          ...(p.priority ? { priority: p.priority } : {}),
          ...(p.repeat ? { repeat: p.repeat } : {}),
        });
        made.push(r.task);
      }
      write(LAST_BOARD, board.id);
      tasksChanged();
      if (made.length === 1) {
        const task = made[0];
        toast(t('quick.added', { title: task.title }), 'info', { label: t('quick.open'), run: () => setQuery('task', task.id) });
      } else toast(t('quick.addedMany', { n: made.length, board: board.name }));
      if (keep) {
        setText('');
        box.current?.focus();
      } else onClose();
    } catch (e) {
      setError(e instanceof ApiFailure ? e.body.message : t('errors.server'));
      // The ones that went in are not sent twice.
      if (made.length) setText(lines.slice(made.length).join('\n'));
    } finally {
      setBusy(false);
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggest && suggest.items.length && at) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const d = e.key === 'ArrowDown' ? 1 : -1;
        setSuggest({ ...suggest, active: (suggest.active + d + suggest.items.length) % suggest.items.length });
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        accept(suggest.items[suggest.active]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setSuggest(null);
        return;
      }
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      close.current();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      // One line: Enter adds. Several: Ctrl/⌘ Enter adds them all, Enter starts a new line.
      if (!many || e.metaKey || e.ctrlKey) {
        e.preventDefault();
        void submit();
      }
    }
  };

  // The box grows with what is written.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [text]);

  const chipLabel = (p: Parsed, tok: Parsed['tokens'][number]) => {
    if (tok.kind === 'due') return fmtDate(tok.value, { weekday: 'long', day: 'numeric', month: 'long' });
    if (tok.kind === 'person') return tok.value === meP.id ? t('quick.me') : (people.find((x) => x.id === tok.value)?.name ?? tok.text);
    if (tok.kind === 'account') return p.account?.name ?? tok.text;
    if (tok.kind === 'priority') return t(`task.priority.${tok.value as Priority}` as any);
    const [every, unit] = tok.value.split(':');
    return Number(every) === 1 ? t(`quick.every1.${unit}` as any) : t(`quick.everyN.${unit}` as any, { n: Number(every) });
  };
  const dueOf = (iso: string) => dueState(iso, false);

  const examples = locale === 'tr'
    ? ['Yenileme görüşmesi cuma @ben #', 'QBR sunumu hazırla 15 kasım !yüksek', 'Haftalık rapor her pazartesi', 'Fatura kontrolü ay sonu']
    : ['Renewal call friday @me #', 'Prepare QBR deck nov 15 !high', 'Weekly report every monday', 'Check invoices end of month'];

  if (!boards.length) {
    return (
      <div className="qa-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <div className="qa" role="dialog" aria-modal="true" aria-label={t('quick.title')} ref={dialog}>
          <div className="qa__empty">
            <Icon name="board" size={22} />
            <p>{t('quick.noBoards')}</p>
            <button className="btn" onClick={onClose}>
              {t('common.close')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const single = parsed[0];
  return (
    <div className="qa-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="qa" role="dialog" aria-modal="true" aria-labelledby="qa-title" ref={dialog}>
        <div className="qa__head">
          <h2 className="qa__title" id="qa-title">
            <Icon name="plus" size={16} /> {many ? t('quick.titleMany', { n: lines.length }) : t('quick.title')}
          </h2>
          <button className="btn btn--quiet btn--icon btn--small" onClick={onClose} aria-label={t('common.close')} title={`${t('common.close')} (Esc)`}>
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="qa__field">
          <textarea
            ref={box}
            className="qa__input"
            rows={1}
            value={text}
            placeholder={t('quick.placeholder')}
            aria-label={t('quick.label')}
            aria-describedby="qa-hint"
            aria-autocomplete="list"
            aria-expanded={!!(suggest && at && suggest.items.length)}
            aria-controls="qa-suggest"
            onChange={(e) => {
              setText(e.target.value);
              setCaret(e.target.selectionStart);
              setError('');
            }}
            onSelect={(e) => setCaret((e.target as HTMLTextAreaElement).selectionStart)}
            onKeyDown={onKey}
            maxLength={20000}
          />
          {suggest && at && suggest.items.length > 0 && (
            <ul className="qa__suggest" id="qa-suggest" role="listbox" aria-label={at.kind === '@' ? t('quick.pickPerson') : t('quick.pickAccount', { account: words.one })}>
              {suggest.items.map((it, i) => (
                <li key={it.id} role="option" aria-selected={i === suggest.active}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      accept(it);
                    }}
                    onMouseEnter={() => setSuggest({ ...suggest, active: i })}
                  >
                    {at.kind === '@' ? <Avatar person={people.find((p) => p.id === it.id) ?? { ...me.user }} /> : <Icon name="building" size={16} />}
                    <span>{it.id === meP.id && at.kind === '@' ? `${it.name} (${t('quick.me')})` : it.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {!many && single && (
          <div className="qa__chips" aria-live="polite">
            {fixedDue && !single.dueDate && (
              <span className="qchip" data-kind="due" data-due={dueOf(fixedDue)}>
                <Icon name="calendar" size={14} />
                {fmtDate(fixedDue, { weekday: 'long', day: 'numeric', month: 'long' })}
                <button type="button" aria-label={t('quick.removeChip', { what: fmtDate(fixedDue, { day: 'numeric', month: 'long' }) })} onClick={() => setFixedDue(null)}>
                  <Icon name="close" size={12} />
                </button>
              </span>
            )}
            {fixedAccount && !single.account && (
              <span className="qchip" data-kind="account">
                <Icon name="building" size={14} />
                {fixedAccount.name}
                <button type="button" aria-label={t('quick.removeChip', { what: fixedAccount.name })} onClick={() => setFixedAccount(null)}>
                  <Icon name="close" size={12} />
                </button>
              </span>
            )}
            {fixedPeople
              .filter((id) => !single.assignees.some((a) => a.id === id))
              .map((id) => (
                <span key={id} className="qchip" data-kind="person">
                  <Icon name="user" size={14} />
                  {id === meP.id ? t('quick.me') : (people.find((x) => x.id === id)?.name ?? '')}
                  <button type="button" aria-label={t('quick.removeChip', { what: id === meP.id ? t('quick.me') : (people.find((x) => x.id === id)?.name ?? '') })} onClick={() => setFixedPeople(fixedPeople.filter((x) => x !== id))}>
                    <Icon name="close" size={12} />
                  </button>
                </span>
              ))}
            {single.tokens.map((tok, i) => (
              <span key={`${tok.kind}:${i}`} className="qchip" data-kind={tok.kind} data-due={tok.kind === 'due' ? dueOf(tok.value) : undefined} title={tok.text}>
                <Icon name={KIND_ICON[tok.kind]} size={14} />
                {chipLabel(single, tok)}
                <button
                  type="button"
                  aria-label={tok.kind === 'due' || tok.kind === 'repeat' ? t('quick.keepAsText', { what: tok.text }) : t('quick.removeChip', { what: chipLabel(single, tok) })}
                  title={tok.kind === 'due' || tok.kind === 'repeat' ? t('quick.keepAsText', { what: tok.text }) : undefined}
                  onClick={() => {
                    setText(removeToken(text, tok));
                    box.current?.focus();
                  }}
                >
                  <Icon name="close" size={12} />
                </button>
              </span>
            ))}
            {single.unknown.map((u) => (
              <span key={u} className="qchip qchip--unknown" title={t('quick.unknownTitle', { what: u })}>
                <Icon name="alert" size={14} />
                {t('quick.unknown', { what: u })}
              </span>
            ))}
            {single.tokens.length === 0 && !single.unknown.length && !fixedAccount && !fixedDue && !fixedPeople.length && <span className="qa__nochips">{t('quick.nothingRead', { account: words.one.toLocaleLowerCase(locale) })}</span>}
          </div>
        )}

        {many && (
          <ol className="qa__many" aria-live="polite">
            {parsed.map((p, i) => (
              <li key={i} data-empty={!p.title || undefined}>
                <span className="qa__manytitle">{p.title || t('quick.noTitle')}</span>
                <span className="qa__manychips">
                  {p.tokens.map((tok, j) => (
                    <span key={j} className="qchip qchip--small" data-kind={tok.kind} data-due={tok.kind === 'due' ? dueOf(tok.value) : undefined}>
                      <Icon name={KIND_ICON[tok.kind]} size={12} />
                      {chipLabel(p, tok)}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ol>
        )}

        <div className="qa__where">
          <label className="qa__select">
            <Icon name="board" size={15} />
            <span className="sr-only">{t('task.board')}</span>
            <select className="select" value={boardId} onChange={(e) => setBoardId(e.target.value)}>
              {boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          {board && board.columns.length > 1 && (
            <label className="qa__select">
              <Icon name="columns" size={15} />
              <span className="sr-only">{t('task.status')}</span>
              <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
                {board.columns.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button type="button" className="linkbtn qa__how" aria-expanded={howOpen} onClick={() => setHowOpen((o) => !o)}>
            {t('quick.how')}
          </button>
        </div>

        {howOpen && (
          <div className="qa__help">
            <ul>
              <li>
                <Icon name="calendar" size={14} /> {t('quick.help.date')}
              </li>
              <li>
                <Icon name="user" size={14} /> {t('quick.help.person')}
              </li>
              <li>
                <Icon name="building" size={14} /> {t('quick.help.account', { account: words.one })}
              </li>
              <li>
                <Icon name="flag" size={14} /> {t('quick.help.priority')}
              </li>
              <li>
                <Icon name="repeat" size={14} /> {t('quick.help.repeat')}
              </li>
              <li>
                <Icon name="list" size={14} /> {t('quick.help.lines')}
              </li>
            </ul>
            <p className="qa__examples">
              {examples.map((x) => (
                <button
                  key={x}
                  type="button"
                  className="qa__example"
                  onClick={() => {
                    setText(x);
                    requestAnimationFrame(() => {
                      box.current?.focus();
                      box.current?.setSelectionRange(x.length, x.length);
                      setCaret(x.length);
                    });
                  }}
                >
                  {x}
                </button>
              ))}
            </p>
          </div>
        )}

        {error && <p className="error-text qa__error">{error}</p>}

        <div className="qa__foot">
          <p className="qa__hint" id="qa-hint">
            {many ? t('quick.hintMany') : t('quick.hint')}
          </p>
          <label className="checkbox qa__keep">
            <input
              type="checkbox"
              checked={keep}
              onChange={(e) => {
                setKeep(e.target.checked);
                write(KEEP, e.target.checked ? '1' : null);
              }}
            />
            <span>{t('quick.keep')}</span>
          </label>
          <button className="btn btn--primary" disabled={!ready || busy} onClick={submit}>
            {busy ? t('common.saving') : many ? t('quick.addMany', { n: lines.length }) : t('quick.add')}
          </button>
        </div>
      </div>
    </div>
  );
}
