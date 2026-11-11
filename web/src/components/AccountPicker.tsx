// Choose the account a task is about: type to search, or create it on the spot.
import { useEffect, useRef, useState } from 'react';
import type { Account } from '../../../shared/src/model';
import { get, post } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useStore } from '../lib/store';

export function AccountPicker({ value, name, onChange, disabled }: { value: string | null; name: string | null; onChange: (id: string | null) => void; disabled?: boolean }) {
  const { t, words } = useI18n();
  const { canWrite, toast } = useStore();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [list, setList] = useState<Account[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => {
      void get<{ accounts: Account[] }>(`/accounts?limit=20${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ''}`).then((r) => setList(r.accounts));
    }, 150);
    return () => clearTimeout(id);
  }, [q, open]);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (id: string | null) => {
    setOpen(false);
    setQ('');
    if (id !== value) onChange(id);
  };
  const create = async () => {
    try {
      const r = await post<{ account: Account }>('/accounts', { name: q.trim() });
      choose(r.account.id);
    } catch {
      toast(t('errors.server'), 'error');
    }
  };
  const exact = list.some((a) => a.name.toLocaleLowerCase() === q.trim().toLocaleLowerCase());

  return (
    <div className="picker" ref={ref}>
      <button type="button" className="picker__button" aria-haspopup="listbox" aria-expanded={open} aria-label={words.one} disabled={disabled} onClick={() => setOpen((o) => !o)}>
        {name ? <span>{name}</span> : <span className="muted">{t('task.accountPlaceholder')}</span>}
      </button>
      {open && (
        <div className="picker__pop" role="listbox">
          <input className="input" autoFocus placeholder={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 4 }} />
          {value && (
            <button className="picker__opt picker__opt--btn" onClick={() => choose(null)}>
              <span className="muted">{t('task.noAccount')}</span>
            </button>
          )}
          {list.map((a) => (
            <button key={a.id} className="picker__opt picker__opt--btn" aria-selected={a.id === value} onClick={() => choose(a.id)}>
              <span>{a.name}</span>
            </button>
          ))}
          {canWrite && q.trim() && !exact && (
            <button className="picker__opt picker__opt--btn" onClick={create}>
              <span>{t('task.createAccount', { name: q.trim() })}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
