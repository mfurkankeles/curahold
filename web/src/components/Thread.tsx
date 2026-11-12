// A thread of comments, the same under a task and under a record (an
// opportunity, an agreement…): @mentions, links shown as small cards, and
// files — dropped, picked, or a screenshot pasted straight into the box.
//
// How a comment with files is sent: each file is uploaded first (onto the task
// or record), then the comment goes with the ids of those files, and the
// server ties them to it. A comment can be only a picture.
import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type FormEvent, type ReactNode } from 'react';
import { MAX_FILE_MB, MENTION_RE, type FileMeta, type Person } from '../../../shared/src/model';
import { ApiFailure, api, del, post } from '../lib/api';
import { getDeviceId } from '../lib/device';
import { useI18n } from '../lib/i18n';
import { useStore } from '../lib/store';
import { relativeTime } from '../lib/time';
import { Icon } from './icons';
import { Avatar, Dialog } from './ui';

// ------------------------------------------------------------- smart links

/**
 * Well-known tools, recognised by their address, so a pasted link reads as
 * "Google Sheets" or "Jira ABC-12" instead of a long URL. Only the address is
 * looked at: nothing is fetched from the other site.
 */
const KNOWN: { test: RegExp; name: string; detail?: (u: URL) => string | null }[] = [
  { test: /^docs\.google\.com\/document/, name: 'Google Docs' },
  { test: /^docs\.google\.com\/spreadsheets/, name: 'Google Sheets' },
  { test: /^docs\.google\.com\/presentation/, name: 'Google Slides' },
  { test: /^docs\.google\.com\/forms/, name: 'Google Forms' },
  { test: /^drive\.google\.com/, name: 'Google Drive' },
  { test: /^meet\.google\.com/, name: 'Google Meet' },
  { test: /^([a-z0-9-]+\.)?sharepoint\.com|^onedrive\.live\.com|^1drv\.ms/, name: 'OneDrive' },
  { test: /^teams\.microsoft\.com|^teams\.live\.com/, name: 'Microsoft Teams' },
  { test: /^([a-z0-9-]+\.)?zoom\.us/, name: 'Zoom' },
  { test: /^(www\.)?dropbox\.com/, name: 'Dropbox' },
  { test: /^(app\.)?box\.com/, name: 'Box' },
  { test: /^(www\.)?figma\.com/, name: 'Figma', detail: (u) => tail(u) },
  { test: /^miro\.com/, name: 'Miro' },
  { test: /^(www\.)?loom\.com/, name: 'Loom' },
  { test: /^(www\.)?youtube\.com|^youtu\.be/, name: 'YouTube' },
  { test: /^(www\.)?notion\.(so|site)|^[a-z0-9-]+\.notion\.site/, name: 'Notion', detail: (u) => tail(u)?.replace(/-[0-9a-f]{32}$/, '').replace(/-/g, ' ') ?? null },
  {
    test: /^github\.com/,
    name: 'GitHub',
    detail: (u) => {
      const m = /^\/([^/]+)\/([^/]+)(?:\/(?:issues|pull)\/(\d+))?/.exec(u.pathname);
      return m ? `${m[1]}/${m[2]}${m[3] ? `#${m[3]}` : ''}` : null;
    },
  },
  { test: /^gitlab\.com/, name: 'GitLab', detail: (u) => u.pathname.split('/').slice(1, 3).join('/') || null },
  { test: /^[a-z0-9-]+\.atlassian\.net\/wiki/, name: 'Confluence' },
  { test: /^[a-z0-9-]+\.atlassian\.net/, name: 'Jira', detail: (u) => /\/browse\/([A-Z][A-Z0-9]+-\d+)/.exec(u.pathname)?.[1] ?? null },
  { test: /^linear\.app/, name: 'Linear', detail: (u) => /\/issue\/([A-Z0-9]+-\d+)/i.exec(u.pathname)?.[1] ?? null },
  { test: /^trello\.com/, name: 'Trello' },
  { test: /^app\.asana\.com/, name: 'Asana' },
  { test: /^([a-z0-9-]+\.)?monday\.com/, name: 'monday.com' },
  { test: /^app\.clickup\.com/, name: 'ClickUp' },
  { test: /^([a-z0-9-]+\.)?(lightning\.)?force\.com|^([a-z0-9-]+\.)?salesforce\.com/, name: 'Salesforce' },
  { test: /^app\.hubspot\.com/, name: 'HubSpot' },
  { test: /^[a-z0-9-]+\.zendesk\.com/, name: 'Zendesk', detail: (u) => /\/tickets\/(\d+)/.exec(u.pathname)?.[1]?.replace(/^/, '#') ?? null },
  { test: /^app\.slack\.com|^[a-z0-9-]+\.slack\.com/, name: 'Slack' },
  { test: /^([a-z0-9-]+\.)?docusign\.(com|net)/, name: 'DocuSign' },
  { test: /^app\.pandadoc\.com/, name: 'PandaDoc' },
  { test: /^calendly\.com/, name: 'Calendly' },
];
const tail = (u: URL) => decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() ?? '') || null;

/** A link as people would name it: the tool and, when it can be read from the address, which item. */
export function linkName(href: string): { name: string; detail: string | null } {
  try {
    const u = new URL(href);
    const at = `${u.hostname.replace(/^www\./, '')}${u.pathname}`;
    const known = KNOWN.find((k) => k.test.test(at) || k.test.test(u.hostname + u.pathname));
    if (known) return { name: known.name, detail: known.detail?.(u) ?? null };
    return { name: u.hostname.replace(/^www\./, ''), detail: u.pathname.length > 1 ? tail(u) : null };
  } catch {
    return { name: href, detail: null };
  }
}

const URL_RE = /\bhttps?:\/\/[^\s<>"'`]+/g;

function SmartLink({ href }: { href: string }) {
  const { name, detail } = linkName(href);
  return (
    <a className="smartlink" href={href} target="_blank" rel="noreferrer noopener" title={href} onClick={(e) => e.stopPropagation()}>
      <Icon name="link" size={13} />
      <span className="smartlink__name">{name}</span>
      {detail && <span className="smartlink__detail">{detail.length > 48 ? `${detail.slice(0, 46)}…` : detail}</span>}
    </a>
  );
}

/** Text with links as cards (punctuation that ends a sentence stays outside the link). */
export function withLinks(text: string, keyBase = 0): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    let href = m[0];
    const trim = /[.,;:!?)\]]+$/.exec(href);
    if (trim) href = href.slice(0, -trim[0].length);
    out.push(text.slice(last, m.index));
    out.push(<SmartLink key={`${keyBase}-${m.index}`} href={href} />);
    last = (m.index ?? 0) + href.length;
  }
  out.push(text.slice(last));
  return out;
}

/** A comment's words: @mentions as names, links as cards. */
export function renderBody(body: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of body.matchAll(MENTION_RE)) {
    out.push(...withLinks(body.slice(last, m.index), last));
    out.push(
      <span className="mention" key={`m${m.index}`}>
        @{m[1]}
      </span>,
    );
    last = (m.index ?? 0) + m[0].length;
  }
  out.push(...withLinks(body.slice(last), last));
  return out;
}

// -------------------------------------------------------------------- files

const PICTURE = /^image\/(png|jpeg|gif|webp)$/;
export const isPicture = (f: { mime: string }) => PICTURE.test(f.mime);
export const sizeText = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/**
 * A stored file as something the page can show or save. Fetched through the
 * app (with the same sign-in as every other call) rather than linked to, so it
 * also works in the try-it demo, where the "server" lives in the tab.
 */
async function fileBlob(id: string, inline: boolean): Promise<Blob> {
  const res = await fetch(`/api/files/${id}${inline ? '?inline=1' : ''}`, { headers: { 'x-curahold-device': getDeviceId() }, credentials: 'same-origin' });
  if (!res.ok) throw new Error(String(res.status));
  return res.blob();
}

/** Saves a file to the person's device. */
export async function downloadFile(f: { id: string; name: string }) {
  const url = URL.createObjectURL(await fileBlob(f.id, false));
  const a = document.createElement('a');
  a.href = url;
  a.download = f.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** A picture shown from a stored file. */
function usePicture(id: string) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let off = false;
    let made: string | null = null;
    void fileBlob(id, true)
      .then((b) => {
        made = URL.createObjectURL(b);
        if (!off) setUrl(made);
      })
      .catch(() => undefined);
    return () => {
      off = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [id]);
  return url;
}

function Picture({ file }: { file: FileMeta }) {
  const { t } = useI18n();
  const url = usePicture(file.id);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="thumb" title={file.name} aria-label={t('thread.openPicture', { name: file.name })} onClick={() => setOpen(true)}>
        {url ? <img src={url} alt={file.name} /> : <span className="thumb__wait" />}
      </button>
      {open && url && (
        <Dialog title={file.name} onClose={() => setOpen(false)} wide>
          <img className="thumb__big" src={url} alt={file.name} />
          <button className="btn" onClick={() => void downloadFile(file)}>
            <Icon name="download" size={15} /> {t('thread.download')}
          </button>
        </Dialog>
      )}
    </>
  );
}

/** A file under a comment or in a Files list: pictures as thumbnails, the rest as a chip to save. */
export function FileItem({ file, onDelete }: { file: FileMeta; onDelete?: () => void }) {
  const { t } = useI18n();
  return (
    <span className="fileitem">
      {isPicture(file) ? (
        <Picture file={file} />
      ) : (
        <button type="button" className="filechip" title={t('thread.download')} onClick={() => void downloadFile(file)}>
          <Icon name="paperclip" size={14} />
          <span className="filechip__name">{file.name}</span>
          <span className="muted num">{sizeText(file.size)}</span>
        </button>
      )}
      {onDelete && (
        <button type="button" className="fileitem__x" aria-label={t('thread.removeFile', { name: file.name })} title={t('common.delete')} onClick={onDelete}>
          <Icon name="close" size={12} />
        </button>
      )}
    </span>
  );
}

// ------------------------------------------------------------------ comment

export interface ThreadComment {
  id: string;
  authorId: string | null;
  body: string;
  createdAt: string;
  files?: FileMeta[];
  /** Task comments: written for the customer, or by them, in the portal. */
  visibility?: 'internal' | 'customer';
  portalAuthorName?: string | null;
}

export function CommentView({ comment, author, canDelete, deleteUrl, onDeleted }: { comment: ThreadComment; author?: Person; canDelete: boolean; deleteUrl: string; onDeleted: () => void }) {
  const { t } = useI18n();
  return (
    <div className="comment" data-visibility={comment.visibility} data-customer={comment.portalAuthorName ? true : undefined}>
      <Avatar person={author ?? (comment.portalAuthorName ? ({ id: comment.id, name: comment.portalAuthorName } as Person) : undefined)} large />
      <div>
        <div className="comment__head">
          <span className="comment__author">{comment.portalAuthorName ?? author?.name ?? t('common.unknownUser')}</span>
          {comment.portalAuthorName ? (
            <span className="badge badge--customer">{t('portal.comment.fromCustomer')}</span>
          ) : comment.visibility === 'customer' ? (
            <span className="badge badge--customer">{t('portal.comment.toCustomer')}</span>
          ) : null}
          <span className="comment__time">{relativeTime(comment.createdAt, t)}</span>
          {canDelete && (
            <button
              className="btn btn--quiet btn--small"
              style={{ marginLeft: 'auto' }}
              onClick={async () => {
                await del(deleteUrl);
                onDeleted();
              }}
            >
              {t('common.delete')}
            </button>
          )}
        </div>
        {comment.body && <div className="comment__body">{renderBody(comment.body)}</div>}
        {!!comment.files?.length && (
          <div className="comment__files">
            {comment.files.map((f) => (
              <FileItem key={f.id} file={f} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- composer

interface Pending {
  key: string;
  file: File;
  /** A preview of a picture, before it is sent. */
  preview: string | null;
}

/**
 * The box to write in. Typing @ opens a list of people; picking one inserts
 * "@Name" and remembers who it was, so the saved comment carries a real
 * mention. Files: drop them on the box, pick them, or paste a screenshot.
 */
export function Composer({
  people,
  uploadUrl,
  onSend,
  placeholder,
  sendLabel,
  above,
  tone,
}: {
  people: Person[];
  /** Where files go first: /tasks/:id/files or /records/:id/files. */
  uploadUrl: string;
  /** Posts the comment; resolves when it is saved. */
  onSend: (body: string, fileIds: string[]) => Promise<void>;
  placeholder: string;
  sendLabel: string;
  /** Anything shown above the box (the portal's internal / customer choice). */
  above?: ReactNode;
  tone?: 'customer';
}) {
  const { t } = useI18n();
  const { toast } = useStore();
  const [text, setText] = useState('');
  const [files, setFiles] = useState<Pending[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [query, setQueryText] = useState<string | null>(null);
  const [sel, setSel] = useState(0);
  const [chosen, setChosen] = useState<Person[]>([]);
  const ref = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const matches = query === null ? [] : people.filter((p) => p.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())).slice(0, 6);

  // Previews are freed when they go away.
  useEffect(() => () => files.forEach((f) => f.preview && URL.revokeObjectURL(f.preview)), []); // eslint-disable-line react-hooks/exhaustive-deps

  function add(list: FileList | File[]) {
    const next: Pending[] = [];
    for (const raw of Array.from(list)) {
      if (raw.size > MAX_FILE_MB * 1024 * 1024) {
        toast(t('errors.file_too_large', { mb: MAX_FILE_MB }), 'error');
        continue;
      }
      // A pasted screenshot comes without a name: give it one people can recognise.
      const file = raw.name && raw.name !== 'image.png' ? raw : new File([raw], `${t('thread.screenshot')} ${new Date().toISOString().slice(0, 16).replace('T', ' ').replace(':', '.')}.png`, { type: raw.type || 'image/png' });
      next.push({ key: `${Date.now()}-${Math.random()}`, file, preview: PICTURE.test(file.type) ? URL.createObjectURL(file) : null });
    }
    if (next.length) setFiles((f) => [...f, ...next].slice(0, 10));
  }
  function drop(key: string) {
    setFiles((list) => {
      const gone = list.find((f) => f.key === key);
      if (gone?.preview) URL.revokeObjectURL(gone.preview);
      return list.filter((f) => f.key !== key);
    });
  }
  function onChange(v: string) {
    setText(v);
    const caret = ref.current?.selectionStart ?? v.length;
    const m = /(^|\s)@([^\s@]{0,30})$/.exec(v.slice(0, caret));
    setQueryText(m ? m[2] : null);
    setSel(0);
  }
  function pick(p: Person) {
    const el = ref.current!;
    const caret = el.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(/@([^\s@]{0,30})$/, `@${p.name} `);
    setText(before + text.slice(caret));
    setChosen((c) => (c.some((x) => x.id === p.id) ? c : [...c, p]));
    setQueryText(null);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(before.length, before.length);
    });
  }
  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const pasted = Array.from(e.clipboardData?.files ?? []);
    if (pasted.length) {
      e.preventDefault();
      add(pasted);
    }
  }
  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer?.files?.length) add(e.dataTransfer.files);
  }
  async function submit(e?: FormEvent) {
    e?.preventDefault();
    let body = text.trim();
    if ((!body && !files.length) || busy) return;
    for (const p of chosen) body = body.split(`@${p.name}`).join(`@[${p.name}](${p.id})`);
    setBusy(true);
    try {
      const ids: string[] = [];
      for (const f of files) {
        const form = new FormData();
        form.append('file', f.file, f.file.name);
        const r = await api<{ file: FileMeta }>('POST', uploadUrl, form);
        ids.push(r.file.id);
      }
      await onSend(body, ids);
      setText('');
      setChosen([]);
      files.forEach((f) => f.preview && URL.revokeObjectURL(f.preview));
      setFiles([]);
    } catch (err) {
      toast(err instanceof ApiFailure ? err.body.message : t('errors.server'), 'error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="composer"
      data-customer={tone === 'customer' || undefined}
      data-dragging={dragging || undefined}
      onSubmit={submit}
      onDragOver={(e) => {
        if (e.dataTransfer?.types?.includes('Files')) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      {above}
      {matches.length > 0 && (
        <div className="suggest" role="listbox">
          {matches.map((p, i) => (
            <button
              type="button"
              key={p.id}
              role="option"
              aria-selected={i === sel}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(p);
              }}
            >
              <Avatar person={p} /> {p.name}
            </button>
          ))}
        </div>
      )}
      <textarea
        ref={ref}
        className="textarea"
        style={{ minHeight: 72 }}
        placeholder={placeholder}
        aria-label={placeholder}
        value={text}
        onPaste={onPaste}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (matches.length) {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setSel((s) => (s + 1) % matches.length);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setSel((s) => (s - 1 + matches.length) % matches.length);
            } else if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault();
              pick(matches[sel]);
            } else if (e.key === 'Escape') {
              e.stopPropagation();
              setQueryText(null);
            }
          } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit();
        }}
      />
      {files.length > 0 && (
        <div className="composer__files">
          {files.map((f) => (
            <span className="fileitem" key={f.key}>
              {f.preview ? (
                <span className="thumb">
                  <img src={f.preview} alt={f.file.name} />
                </span>
              ) : (
                <span className="filechip">
                  <Icon name="paperclip" size={14} />
                  <span className="filechip__name">{f.file.name}</span>
                  <span className="muted num">{sizeText(f.file.size)}</span>
                </span>
              )}
              <button type="button" className="fileitem__x" aria-label={t('thread.removeFile', { name: f.file.name })} onClick={() => drop(f.key)}>
                <Icon name="close" size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="composer__bar">
        <input
          ref={picker}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) add(e.target.files);
            e.target.value = '';
          }}
        />
        <button type="button" className="btn btn--quiet btn--small" onClick={() => picker.current?.click()} title={t('thread.attachHint')}>
          <Icon name="paperclip" size={15} /> {t('thread.attach')}
        </button>
        <span className="composer__hint">{t('thread.pasteHint')}</span>
        <button className="btn btn--primary" disabled={(!text.trim() && !files.length) || busy}>
          {busy ? t('common.saving') : sendLabel}
        </button>
      </div>
    </form>
  );
}

/** Sends a comment to a record's thread. */
export const postRecordComment = (recordId: string) => (body: string, fileIds: string[]) => post(`/records/${recordId}/comments`, { body, fileIds }).then(() => undefined);
