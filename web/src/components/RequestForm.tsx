// A board's request form: a colleague says what they need; it lands on the
// board as a task, and they follow it from then on.
import { useState } from 'react';
import { labelOf } from '../../../shared/src/fields';
import type { Board, TaskFieldValue } from '../../../shared/src/model';
import { ApiFailure, post } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useStore } from '../lib/store';
import { AccountPicker } from './AccountPicker';
import { TaskFieldInput } from './TaskExtras';
import { Dialog } from './ui';
import { DateField } from './DateField';
import { Icon } from './icons';

/** `from`: the sender's own task (a hand-off to another department): the request starts from it and is linked to it. */
export function RequestForm({
  board,
  onClose,
  onSent,
  from,
  sentText,
}: {
  board: Pick<Board, 'id' | 'form' | 'taskFields'>;
  onClose: () => void;
  onSent: () => void;
  from?: { taskId: string; title: string; accountId: string | null; accountName: string | null };
  sentText?: string;
}) {
  const { t, locale, words } = useI18n();
  const { toast, people } = useStore();
  const form = board.form!;
  const asks = (k: string) => form.fields.includes(k);
  const [title, setTitle] = useState(from?.title ?? '');
  const [description, setDescription] = useState('');
  const [account, setAccount] = useState<{ id: string | null; name: string | null }>({ id: from?.accountId ?? null, name: from?.accountName ?? null });
  const [due, setDue] = useState('');
  const [values, setValues] = useState<Record<string, TaskFieldValue>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fields = board.taskFields.filter((f) => asks(`f:${f.key}`));
  const send = async () => {
    if (!title.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      await post(`/boards/${board.id}/requests`, { title: title.trim(), description, accountId: account.id, dueDate: due || null, fields: values, ...(from ? { fromTaskId: from.taskId } : {}) });
      toast(sentText ?? t('boardForm.sent'));
      onSent();
      onClose();
    } catch (e) {
      setError(e instanceof ApiFailure ? e.body.message : t('errors.server'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      title={form.title?.trim() || t('boardForm.open')}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--quiet" onClick={onClose}>
            <Icon name="close" size={16} />
            {t('common.cancel')}
          </button>
          <button className="btn btn--primary" disabled={!title.trim() || busy} onClick={send}>
            <Icon name="send" size={16} />
            {busy ? t('common.saving') : t('boardForm.send')}
          </button>
        </>
      }
    >
      {form.intro?.trim() && <p className="lede u-m-0">{form.intro}</p>}
      <label className="field">
        <span className="field__label">{t('boardForm.what')}</span>
        <input className="input" value={title} maxLength={300} onChange={(e) => setTitle(e.target.value)} />
      </label>
      {asks('description') && (
        <label className="field">
          <span className="field__label">{t('boardForm.field.description')}</span>
          <textarea className="textarea" value={description} maxLength={20000} onChange={(e) => setDescription(e.target.value)} />
        </label>
      )}
      {asks('account') && (
        <div className="field">
          <span className="field__label">{words.one}</span>
          <AccountPicker value={account.id} name={account.name} onChange={(id, name) => setAccount({ id, name: name ?? null })} />
        </div>
      )}
      {asks('due') && (
        <label className="field">
          <span className="field__label">{t('boardForm.field.due')}</span>
          <DateField value={due} onChange={setDue} />
        </label>
      )}
      {fields.map((f) => (
        <div className="field" key={f.key}>
          <span className="field__label">{labelOf(f.label, locale)}</span>
          <TaskFieldInput field={f} value={values[f.key]} disabled={false} people={people.filter((p) => p.status === 'active')} onSave={(v) => setValues((cur) => ({ ...cur, [f.key]: v }))} />
        </div>
      ))}
      {error && <p className="error-text" role="alert">{error}</p>}
    </Dialog>
  );
}
