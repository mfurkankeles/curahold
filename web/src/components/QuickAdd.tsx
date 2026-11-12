// New task: the one dialog behind every "add task" button — a column's, the
// board's, the "+ New" menu, My tasks, the calendar, a customer's page and an
// opportunity's panel.
//
// It asks for the details as plain fields (customer, related record, people,
// due date, priority, repeat, board and column, the board's own fields and a
// description). The title can still be written the way you would say it —
// "Renewal call friday @Ayşe #Acme !high" — and the fields fill themselves
// from it; a field changed by hand takes over from the title. Several lines in
// the title make several tasks at once, each with the fields below.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { labelOf } from '../../../shared/src/fields';
import { PRIORITIES, type Account, type Priority, type Repeat, type Task, type TaskFieldValue } from '../../../shared/src/model';
import type { AppRecord, RecordType } from '../../../shared/src/records';
import { ApiFailure, get, post } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { fold, parseQuick, pickAt, removeToken, type Parsed, type Pickable, type TokenKind } from '../lib/quickparse';
import { setQuery } from '../lib/router';
import { tasksChanged, type QuickDefaults } from '../lib/shell';
import { useStore } from '../lib/store';
import { dueState } from '../lib/time';
import { AccountPicker } from './AccountPicker';
import { Icon, type IconName } from './icons';
import { TaskFieldInput } from './TaskExtras';
import { RepeatPicker } from './TaskPanel';
import { Avatar, PeoplePicker } from './ui';

const KIND_ICON: Record<TokenKind, IconName> = { due: 'calendar', person: 'user', account: 'building', priority: 'flag', repeat: 'repeat' };

// Small per-device conveniences: the board used last, and "keep adding".
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
const uniq = (ids: string[]) => [...new Set(ids)];

/** A record a task can belong to: an opportunity, an agreement, a risk… (not a contact). */
interface RecordOption {
  id: string;
  name: string;
  kind: string;
}

export function QuickAdd({ defaults, onClose }: { defaults: QuickDefaults; onClose: () => void }) {
  const { t, locale, fmtDate, words } = useI18n();
  const { me, boards, people, toast } = useStore();

  // ------------------------------------------------------------- what is written
  const [text, setText] = useState(defaults.text ?? '');
  const [description, setDescription] = useState('');

  // ------------------------------------------------------------ where it goes
  const [boardId, setBoardId] = useState(() => {
    const want = defaults.boardId ?? read(LAST_BOARD);
    return boards.find((b) => b.id === want)?.id ?? boards[0]?.id ?? '';
  });
  const board = boards.find((b) => b.id === boardId);
  const [status, setStatus] = useState(defaults.status ?? '');

  // ------------------------------------------------------------- the fields
  // As set by hand, or handed in by the page that opened the dialog. While the
  // title names one of them ("friday", "@Ayşe", "#Acme", "!high"), the title wins.
  const [fixedAccount, setFixedAccount] = useState<Pickable | null>(defaults.accountId ? { id: defaults.accountId, name: defaults.accountName ?? '' } : null);
  const [fixedPeople, setFixedPeople] = useState<string[]>(defaults.assigneeIds ?? []);
  const [fixedDue, setFixedDue] = useState<string | null>(defaults.dueDate ?? null);
  // A rhythm in the title ("every monday") also gives a first date; a date set by hand beats it.
  const [dueByHand, setDueByHand] = useState(false);
  const [fixedPriority, setFixedPriority] = useState<Priority>('normal');
  const [fixedRepeat, setFixedRepeat] = useState<Repeat | null>(null);
  const [fixedRecord, setFixedRecord] = useState<Pickable | null>(defaults.recordId ? { id: defaults.recordId, name: defaults.recordName ?? '' } : null);
  // The board's own fields ("Type", "Product"…), by key.
  const [fieldValues, setFieldValues] = useState<Record<string, TaskFieldValue>>({});

  // ------------------------------------------------------------ the dialog
  const [found, setFound] = useState<Map<string, Pickable>>(new Map());
  const [caret, setCaret] = useState(0);
  const [suggest, setSuggest] = useState<{ items: Pickable[]; active: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [keep, setKeep] = useState(() => read(KEEP) === '1');
  const [howOpen, setHowOpen] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  // A column that is not on the chosen board falls back to the board's first one.
  useEffect(() => {
    if (!board) return;
    if (!board.columns.some((c) => c.key === status)) setStatus(board.columns[0]?.key ?? '');
  }, [board, status]);
  // Another board has other fields.
  useEffect(() => setFieldValues({}), [boardId]);

  // Focus in, focus back where it was on the way out.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = box.current;
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
    return () => prev?.focus?.();
  }, []);

  const assignable = useMemo(() => people.filter((p) => p.seat === 'full' && (p.status === 'active' || p.status === 'invited')), [people]);
  const pickable = useMemo(() => assignable.map((p) => ({ id: p.id, name: p.name })), [assignable]);
  const meP = useMemo(() => ({ id: me.user.id, name: me.user.name }), [me.user.id, me.user.name]);
  const accountsKnown = useMemo(() => [...found.values()], [found]);

  // ------------------------------------------------- reading the title as it is typed
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

  // --------------------------------------------------- what the fields show
  // One task: the title's words first, then the fields. Several: the fields are
  // what every line gets unless the line says otherwise (see submit).
  const single = !many ? parsed[0] : undefined;
  const has = (kind: TokenKind) => !!single?.tokens.some((x) => x.kind === kind);
  const dueFromTitle = has('due') || (!dueByHand && !!single?.dueDate);
  const due = dueFromTitle ? (single?.dueDate ?? null) : fixedDue;
  const account = single?.account ?? fixedAccount;
  const assignees = uniq([...fixedPeople, ...(single?.assignees.map((a) => a.id) ?? [])]);
  const priority = single?.priority ?? fixedPriority;
  const repeat = single?.repeat ?? fixedRepeat;
  const dueToken = single?.tokens.find((x) => x.kind === 'due' || (x.kind === 'repeat' && dueFromTitle));

  /**
   * A field set by hand: what the title said about it gives way. A date or a
   * rhythm cleared by hand stays in the title as words ("friday" was not a date
   * after all); one changed by hand leaves the title, as do names and priorities.
   */
  const takeOver = (kinds: TokenKind | TokenKind[], cleared = false) => {
    if (!single) return;
    const list = Array.isArray(kinds) ? kinds : [kinds];
    let next = text;
    for (const tok of single.tokens.filter((x) => list.includes(x.kind))) next = removeToken(next, tok, cleared && (tok.kind === 'due' || tok.kind === 'repeat'));
    if (next !== text) setText(next);
  };

  // --------------------------------------------- the records a task can belong to
  // Once a customer is chosen: its opportunities, agreements, risks… to pick from.
  const accountId = many ? (fixedAccount?.id ?? null) : (account?.id ?? null);
  const [recordOptions, setRecordOptions] = useState<RecordOption[]>([]);
  const kinds = useRef<RecordType[] | null>(null);
  useEffect(() => {
    if (!accountId) return setRecordOptions([]);
    let live = true;
    const id = setTimeout(async () => {
      try {
        if (!kinds.current) kinds.current = (await get<{ types: RecordType[] }>('/record-types')).types;
        const r = await get<{ records: AppRecord[] }>(`/records?account=${encodeURIComponent(accountId)}&limit=100`);
        if (!live) return;
        const label = new Map(kinds.current.filter((k) => k.kind !== 'contact' && !k.archivedAt).map((k) => [k.id, labelOf(k.name.one, locale)]));
        setRecordOptions(r.records.filter((x) => label.has(x.typeId) && !x.archivedAt).map((x) => ({ id: x.id, name: x.name, kind: label.get(x.typeId) ?? '' })));
      } catch {
        if (live) setRecordOptions([]);
      }
    }, 150);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [accountId, locale]);

  // ------------------------------------------- an open task that looks like this one
  // Said before adding, never in the way.
  const [similar, setSimilar] = useState<{ id: string; title: string; boardName: string }[]>([]);
  const firstTitle = !many ? (parsed[0]?.title ?? '') : '';
  const firstAccount = parsed[0]?.account?.id ?? fixedAccount?.id ?? '';
  useEffect(() => {
    if (firstTitle.trim().split(/\s+/).length < 2) return setSimilar([]);
    let live = true;
    const id = setTimeout(() => {
      const p = new URLSearchParams({ title: firstTitle });
      if (boardId) p.set('boardId', boardId);
      if (firstAccount) p.set('accountId', firstAccount);
      void get<{ tasks: { id: string; title: string; boardName: string }[] }>(`/tasks/similar?${p}`).then((r) => live && setSimilar(r.tasks), () => undefined);
    }, 450);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [firstTitle, boardId, firstAccount]);

  /** A name picked from the @ / # list goes into the title. */
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

  // ------------------------------------------------------------------ adding
  const submit = async () => {
    if (!ready || busy || !board) return;
    setBusy(true);
    setError('');
    const made: Task[] = [];
    const extra = Object.fromEntries(Object.entries(fieldValues).filter(([, v]) => v !== null && v !== ''));
    // A record belongs to one customer: it goes with the task only while that customer is the task's.
    const recordOk = !!fixedRecord && (recordOptions.some((r) => r.id === fixedRecord.id) || (fixedRecord.id === defaults.recordId && accountId === (defaults.accountId ?? null)));
    try {
      for (const p of parsed) {
        // One task: what the fields show. Several: the line's own words, then the fields.
        const body = {
          boardId: board.id,
          status: status || board.columns[0].key,
          title: p.title,
          description: description.trim() || undefined,
          dueDate: many ? (p.dueDate ?? fixedDue) : due,
          assigneeIds: many ? uniq([...fixedPeople, ...p.assignees.map((a) => a.id)]) : assignees,
          accountId: many ? (p.account?.id ?? fixedAccount?.id ?? null) : (account?.id ?? null),
          priority: many ? (p.priority ?? fixedPriority) : priority,
          ...((many ? (p.repeat ?? fixedRepeat) : repeat) ? { repeat: many ? (p.repeat ?? fixedRepeat) : repeat } : {}),
          ...(recordOk && fixedRecord ? { recordId: fixedRecord.id } : {}),
          ...(Object.keys(extra).length ? { fields: extra } : {}),
        };
        const r = await post<{ task: Task }>('/tasks', body);
        made.push(r.task);
      }
      write(LAST_BOARD, board.id);
      tasksChanged();
      if (made.length === 1) {
        const task = made[0];
        toast(defaults.doneText ?? t('quick.added', { title: task.title }), 'info', { label: t('quick.open'), run: () => setQuery('task', task.id) });
      } else toast(t('quick.addedMany', { n: made.length, board: board.name }));
      if (keep) {
        // The next task usually shares the customer, people and board: those stay.
        setText('');
        setDescription('');
        setFieldValues({});
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

  // --------------------------------------------------------------- keyboard
  /** In the title: the @ / # list, Enter to add one task, Escape to leave. */
  const onTitleKey = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
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
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      // One line: Enter adds. Several: Ctrl/⌘ Enter adds them all, Enter starts a new line.
      if (!many || e.metaKey || e.ctrlKey) {
        e.preventDefault();
        void submit();
      }
    }
  };
  /** Anywhere in the dialog: Ctrl/⌘ Enter adds, Escape leaves (unless a picker is open). */
  const onDialogKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.defaultPrevented) return;
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void submit();
    } else if (e.key === 'Escape' && !(e.target as HTMLElement).closest('.picker__pop')) {
      e.preventDefault();
      close.current();
    }
  };

  // The title box grows with what is written.
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
  const accountWord = words.one.toLocaleLowerCase(locale);
  /** The small "from the title" mark beside a field the title filled. */
  const fromTitle = (on: boolean) => (on ? <span className="qa__from">{t('quick.fromTitle')}</span> : null);

  const examples = locale === 'tr'
    ? ['Yenileme görüşmesi cuma @ben #', 'QBR sunumu hazırla 15 kasım !yüksek', 'Haftalık rapor her pazartesi', 'Fatura kontrolü ay sonu']
    : ['Renewal call friday @me #', 'Prepare QBR deck nov 15 !high', 'Weekly report every monday', 'Check invoices end of month'];

  if (!boards.length) {
    return (
      <div className="qa-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <div className="qa" role="dialog" aria-modal="true" aria-label={t('quick.title')} onKeyDown={onDialogKey}>
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

  return (
    <div className="qa-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="qa" role="dialog" aria-modal="true" aria-labelledby="qa-title" onKeyDown={onDialogKey}>
        <div className="qa__head">
          <h2 className="qa__title" id="qa-title">
            <Icon name="plus" size={16} /> {many ? t('quick.titleMany', { n: lines.length }) : t('quick.title')}
          </h2>
          <button className="btn btn--quiet btn--icon btn--small" onClick={onClose} aria-label={t('common.close')} title={`${t('common.close')} (Esc)`}>
            <Icon name="close" size={16} />
          </button>
        </div>

        {/* ------------------------------------------------------------ title */}
        <div className="qa__field">
          <textarea
            ref={box}
            className="qa__input"
            rows={1}
            value={text}
            placeholder={t('quick.placeholder')}
            aria-label={t('quick.label')}
            aria-describedby="qa-tip"
            aria-autocomplete="list"
            aria-expanded={!!(suggest && at && suggest.items.length)}
            aria-controls="qa-suggest"
            onChange={(e) => {
              setText(e.target.value);
              setCaret(e.target.selectionStart);
              setError('');
            }}
            onSelect={(e) => setCaret((e.target as HTMLTextAreaElement).selectionStart)}
            onKeyDown={onTitleKey}
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
        <p className="qa__tip" id="qa-tip">
          <span>{t('quick.tip', { account: accountWord })}</span>{' '}
          <button type="button" className="linkbtn" aria-expanded={howOpen} onClick={() => setHowOpen((o) => !o)}>
            {t('quick.how')}
          </button>
        </p>
        {single && single.unknown.length > 0 && (
          <p className="qa__unknown" role="status">
            {single.unknown.map((u) => (
              <span key={u} className="qchip qchip--unknown" title={t('quick.unknownTitle', { what: u })}>
                <Icon name="alert" size={14} />
                {t('quick.unknown', { what: u })}
              </span>
            ))}
          </p>
        )}

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

        {similar.length > 0 && (
          <div className="qa__similar" role="status">
            <Icon name="alert" size={15} />
            <span>
              {t('quick.similar')}{' '}
              {similar.map((x, i) => (
                <span key={x.id}>
                  {i > 0 && ', '}
                  <button
                    type="button"
                    className="linkbtn"
                    onClick={() => {
                      onClose();
                      setQuery('task', x.id);
                    }}
                  >
                    {x.title}
                  </button>
                </span>
              ))}
            </span>
          </div>
        )}

        {/* Several lines: each one a task, with what it said read out. */}
        {many && (
          <>
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
            <p className="qa__forall">{t('quick.forAll', { n: lines.length })}</p>
          </>
        )}

        {/* ------------------------------------------------------ description */}
        <div className="qa__desc">
          <textarea className="input" rows={2} value={description} maxLength={20000} placeholder={t('task.descriptionPlaceholder')} aria-label={t('task.description')} onChange={(e) => setDescription(e.target.value)} />
        </div>

        {/* ----------------------------------------------------------- fields */}
        <div className="qa__grid">
          <div className="qa__item">
            <span className="qa__label">
              {words.one} {fromTitle(!!single?.account)}
            </span>
            <AccountPicker
              value={many ? (fixedAccount?.id ?? null) : (account?.id ?? null)}
              name={many ? (fixedAccount?.name ?? null) : (account?.name ?? null)}
              onChange={(id, name) => {
                takeOver('account');
                setFixedAccount(id ? { id, name: name ?? '' } : null);
                // A record belongs to its own customer: another customer, no record.
                setFixedRecord(null);
              }}
            />
          </div>

          <div className="qa__item">
            <span className="qa__label">{t('task.record')}</span>
            {fixedRecord && !recordOptions.some((r) => r.id === fixedRecord.id) ? (
              // Handed in by an opportunity's panel (its customer's list may still be loading).
              <span className="qchip" data-kind="record">
                <Icon name="funnel" size={14} />
                {fixedRecord.name}
                <button type="button" aria-label={t('quick.removeChip', { what: fixedRecord.name })} onClick={() => setFixedRecord(null)}>
                  <Icon name="close" size={12} />
                </button>
              </span>
            ) : (
              <select
                className="select"
                value={fixedRecord?.id ?? ''}
                disabled={!accountId || !recordOptions.length}
                aria-label={t('task.record')}
                onChange={(e) => {
                  const pick = recordOptions.find((r) => r.id === e.target.value);
                  setFixedRecord(pick ? { id: pick.id, name: pick.name } : null);
                }}
              >
                <option value="">{accountId ? (recordOptions.length ? t('common.none') : t('quick.recordNone', { account: accountWord })) : t('quick.recordFirst', { account: accountWord })}</option>
                {recordOptions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.kind} · {r.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="qa__item">
            <span className="qa__label">
              {t('task.assignees')} {fromTitle(!!single?.assignees.length)}
            </span>
            <PeoplePicker
              label={t('task.assignees')}
              people={assignable}
              value={many ? fixedPeople : assignees}
              onChange={(ids) => {
                takeOver('person');
                setFixedPeople(ids);
              }}
            />
          </div>

          <label className="qa__item">
            <span className="qa__label">
              {t('task.due')} {fromTitle(!many && dueFromTitle && !!due)}
            </span>
            <span className="qa__due">
              <input
                className="input num"
                type="date"
                value={(many ? fixedDue : due) ?? ''}
                onChange={(e) => {
                  const v = e.target.value || null;
                  takeOver('due', !v);
                  setFixedDue(v);
                  setDueByHand(true);
                }}
              />
              {(many ? fixedDue : due) && (
                <button
                  type="button"
                  className="btn btn--quiet btn--icon btn--small"
                  aria-label={dueToken && !many ? t('quick.keepAsText', { what: dueToken.text }) : t('quick.clearDate')}
                  title={dueToken && !many ? t('quick.keepAsText', { what: dueToken.text }) : t('quick.clearDate')}
                  onClick={() => {
                    // A date read from "every monday" goes with its rhythm: both stay as words.
                    takeOver(dueToken?.kind === 'repeat' ? ['due', 'repeat'] : 'due', true);
                    setFixedDue(null);
                    setDueByHand(true);
                  }}
                >
                  <Icon name="close" size={13} />
                </button>
              )}
            </span>
          </label>

          <label className="qa__item">
            <span className="qa__label">
              {t('task.priority')} {fromTitle(!!single?.priority)}
            </span>
            <select
              className="select"
              value={many ? fixedPriority : priority}
              onChange={(e) => {
                takeOver('priority');
                setFixedPriority(e.target.value as Priority);
              }}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {t(`task.priority.${p}`)}
                </option>
              ))}
            </select>
          </label>

          <div className="qa__item">
            <span className="qa__label">
              {t('task.repeat')} {fromTitle(!!single?.repeat)}
            </span>
            <RepeatPicker
              value={many ? fixedRepeat : repeat}
              disabled={false}
              onChange={(r) => {
                takeOver('repeat', !r);
                setFixedRepeat(r);
              }}
            />
          </div>

          <label className="qa__item">
            <span className="qa__label">{t('task.board')}</span>
            <select className="select" value={boardId} onChange={(e) => setBoardId(e.target.value)}>
              {boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>

          <label className="qa__item">
            <span className="qa__label">{t('task.status')}</span>
            <select className="select" value={status} disabled={!board || board.columns.length < 2} onChange={(e) => setStatus(e.target.value)}>
              {board?.columns.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          {/* The board's own fields, as the board asks for them. */}
          {(board?.taskFields ?? []).map((f) => (
            <div className="qa__item" key={`${boardId}:${f.key}`}>
              <span className="qa__label">{labelOf(f.label, locale)}</span>
              <TaskFieldInput field={f} value={fieldValues[f.key]} disabled={false} people={assignable} onSave={(v) => setFieldValues((cur) => ({ ...cur, [f.key]: v }))} />
            </div>
          ))}
        </div>

        {error && <p className="error-text qa__error">{error}</p>}

        <div className="qa__foot">
          <p className="qa__hint">{many ? t('quick.hintMany') : t('quick.hint')}</p>
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
