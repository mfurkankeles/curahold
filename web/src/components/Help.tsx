// Asking Curahold for help: a form that collects what support needs the first
// time (what happened, where, how to repeat it, screenshots, and the
// technical details the app saw), and consent for support to look inside —
// off unless ticked, time-limited, revocable.
import { Icon } from './icons';
import { docsFile, docsHref, docsLink } from '../lib/docs';
import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from 'react';
import {
  GRANT_HOURS,
  HELP_CATEGORIES,
  HELP_IMPACTS,
  HELP_MAX_FILE_MB,
  HELP_MAX_FILES,
  type HelpCategory,
  type HelpImpact,
  type HelpRequestInfo,
  type SupportGrant,
} from '../../../shared/src/help';
import type { MessageKey } from '../../../shared/src/i18n';
import { ApiFailure, api, del, get, post } from '../lib/api';
import { collectContext } from '../lib/diagnostics';
import { useI18n } from '../lib/i18n';
import { useStore } from '../lib/store';
import { Dialog } from './ui';

const TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/json',
  'video/mp4',
  'video/webm',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

interface Access {
  policy: 'anyone' | 'admins' | 'off';
  canGrant: boolean;
  canGrantEdit: boolean;
  grants: (SupportGrant & { userName: string | null })[];
}
interface Shot {
  id: number;
  file: File;
  url: string;
}
let shotSeq = 0;

/** The page address without its fragment or anything that looks like a secret. */
function pageAddress(): string {
  try {
    const u = new URL(location.href);
    u.hash = '';
    for (const k of [...u.searchParams.keys()]) if (/token|code|key|secret|sig|session|password|auth/i.test(k)) u.searchParams.set(k, '…');
    return u.toString();
  } catch {
    return '';
  }
}

/** What is open right now: the customer, the board and the task, from the address. */
function openRefs() {
  const refs: { accountId?: string; boardId?: string; taskId?: string } = {};
  const path = location.pathname;
  const id = UUID.exec(path)?.[0];
  if (id && path.startsWith('/accounts')) refs.accountId = id;
  if (id && path.startsWith('/boards')) refs.boardId = id;
  const task = new URLSearchParams(location.search).get('task');
  if (task && UUID.test(task)) refs.taskId = task;
  return refs;
}

// The docs' own search index, loaded once, to suggest an answer while the title is typed.
type DocHit = {
  u: string;
  t: string;
  s: string;
  h: [string, string][];
  x: string;
};
const docIndex: Partial<Record<string, Promise<DocHit[]>>> = {};
function loadDocs(locale: string) {
  docIndex[locale] ??= fetch(docsFile(`${locale}/search.json`))
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => []);
  return docIndex[locale]!;
}
function suggest(index: DocHit[], text: string) {
  const words = text
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 4);
  if (!words.length) return [];
  return index
    .map((d) => {
      const title = d.t.toLocaleLowerCase();
      const heads = d.h.map(([, h]) => h.toLocaleLowerCase());
      const body = d.x.toLocaleLowerCase();
      let score = 0;
      let anchor = '';
      for (const w of words) {
        if (title.includes(w)) score += 4;
        const hi = heads.findIndex((h) => h.includes(w));
        if (hi >= 0) {
          score += 2;
          anchor ||= d.h[hi][0];
        }
        if (body.includes(w)) score += 1;
      }
      return { d, score, anchor };
    })
    .filter((x) => x.score >= 4)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

/** One frame of this tab, with the help window out of the way. */
async function captureTab(hide: (on: boolean) => void): Promise<Blob | null> {
  const md = navigator.mediaDevices as MediaDevices & {
    getDisplayMedia?: (o: unknown) => Promise<MediaStream>;
  };
  if (!md?.getDisplayMedia) return null;
  const stream = await md.getDisplayMedia({
    video: { displaySurface: 'browser' },
    audio: false,
    preferCurrentTab: true,
    selfBrowserSurface: 'include',
  });
  try {
    hide(true);
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    await video.play();
    await new Promise((r) => setTimeout(r, 400));
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    return await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
  } finally {
    stream.getTracks().forEach((tr) => tr.stop());
    hide(false);
  }
}

type Box = {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: 'mark' | 'hide';
};

/** Marks what matters and covers what support should not see, on a copy of the picture. */
function Annotate({ shot, onDone, onClose }: { shot: Shot; onDone: (f: File) => void; onClose: () => void }) {
  const { t } = useI18n();
  const canvas = useRef<HTMLCanvasElement>(null);
  const img = useRef<HTMLImageElement | null>(null);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [draft, setDraft] = useState<Box | null>(null);
  const [kind, setKind] = useState<Box['kind']>('mark');

  const draw = (list: Box[], c = canvas.current, scale = 1) => {
    const i = img.current;
    if (!c || !i) return;
    const g = c.getContext('2d')!;
    g.drawImage(i, 0, 0, c.width, c.height);
    for (const b of list) {
      const [x, y, w, h] = [b.x * c.width, b.y * c.height, b.w * c.width, b.h * c.height];
      if (b.kind === 'hide') {
        g.fillStyle = '#1b2427';
        g.fillRect(x, y, w, h);
      } else {
        g.strokeStyle = '#d9412b';
        g.lineWidth = 3 * scale;
        g.strokeRect(x, y, w, h);
      }
    }
  };

  useEffect(() => {
    const i = new Image();
    i.onload = () => {
      img.current = i;
      const c = canvas.current!;
      const max = Math.min(900, window.innerWidth - 80);
      const ratio = Math.min(1, max / i.naturalWidth);
      c.width = Math.round(i.naturalWidth * ratio);
      c.height = Math.round(i.naturalHeight * ratio);
      draw([]);
    };
    i.src = shot.url;
  }, [shot.url]);
  useEffect(() => draw(draft ? [...boxes, draft] : boxes), [boxes, draft]);

  const at = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  };
  const start = useRef<{ x: number; y: number } | null>(null);

  const finish = async () => {
    const i = img.current!;
    const full = document.createElement('canvas');
    full.width = i.naturalWidth;
    full.height = i.naturalHeight;
    draw(boxes, full, i.naturalWidth / (canvas.current?.width || i.naturalWidth));
    const blob = await new Promise<Blob | null>((r) => full.toBlob(r, 'image/png'));
    if (blob)
      onDone(
        new File([blob], shot.file.name.replace(/\.\w+$/, '') + '.png', {
          type: 'image/png',
        }),
      );
  };

  // Escape closes this picture only, not the help window under it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div className="dialog help__annotate">
      <div className="dialog__box dialog__box--wide" role="dialog" aria-modal="true" aria-labelledby="annotate-title">
        <h2 className="dialog__head" id="annotate-title">
          {t('help.annotate.title')}
        </h2>
        <div className="dialog__body">
          <div className="toolbar">
            <div className="seg" role="group" aria-label={t('help.annotate.tool')}>
              <button type="button" aria-pressed={kind === 'mark'} onClick={() => setKind('mark')}>
                {t('help.annotate.mark')}
              </button>
              <button type="button" aria-pressed={kind === 'hide'} onClick={() => setKind('hide')}>
                {t('help.annotate.hide')}
              </button>
            </div>
            <button type="button" className="btn btn--small btn--quiet" disabled={!boxes.length} onClick={() => setBoxes(boxes.slice(0, -1))}>
              {t('help.annotate.undo')}
            </button>
            <span className="field__hint">{t('help.annotate.hint')}</span>
          </div>
          <div className="help__canvas">
            <canvas
              ref={canvas}
              onPointerDown={(e) => {
                (e.target as HTMLElement).setPointerCapture(e.pointerId);
                start.current = at(e);
              }}
              onPointerMove={(e) => {
                if (!start.current) return;
                const p = at(e);
                const s = start.current;
                setDraft({
                  x: Math.min(s.x, p.x),
                  y: Math.min(s.y, p.y),
                  w: Math.abs(p.x - s.x),
                  h: Math.abs(p.y - s.y),
                  kind,
                });
              }}
              onPointerUp={() => {
                if (draft && draft.w > 0.005 && draft.h > 0.005) setBoxes([...boxes, draft]);
                setDraft(null);
                start.current = null;
              }}
            />
          </div>
        </div>
        <div className="dialog__foot">
          <button type="button" className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn btn--primary" onClick={finish}>
            {t('help.annotate.done')}
          </button>
        </div>
      </div>
    </div>
  );
}

function NewRequest({ access, onSent, hide, about = '' }: { access: Access | null; onSent: (ref: string) => void; hide: (on: boolean) => void; about?: string }) {
  const { t, locale } = useI18n();
  const { me } = useStore();
  const [category, setCategory] = useState<HelpCategory | null>(null);
  const [impact, setImpact] = useState<HelpImpact | null>(null);
  // Coming from Ask, the question is the subject already.
  const [subject, setSubject] = useState(about.slice(0, 160));
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState('');
  const [page, setPage] = useState(pageAddress);
  const [withPage, setWithPage] = useState(true);
  const [shots, setShots] = useState<Shot[]>([]);
  const [editing, setEditing] = useState<Shot | null>(null);
  const [grant, setGrant] = useState(false);
  const [hours, setHours] = useState<(typeof GRANT_HOURS)[number]>(24);
  const [level, setLevel] = useState<'view' | 'edit'>('view');
  const [keep, setKeep] = useState({
    device: true,
    pages: true,
    errors: true,
    failed: true,
    open: true,
  });
  const [showDetails, setShowDetails] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hits, setHits] = useState<ReturnType<typeof suggest>>([]);
  const [over, setOver] = useState(false);
  const context = useMemo(() => collectContext(openRefs()), []);
  const fileInput = useRef<HTMLInputElement>(null);

  const live = useRef(shots);
  live.current = shots;
  useEffect(() => () => live.current.forEach((s) => URL.revokeObjectURL(s.url)), []);
  useEffect(() => {
    if (subject.trim().length < 4 || category === 'billing') return setHits([]);
    const timer = setTimeout(() => void loadDocs(locale).then((index) => setHits(suggest(index, subject))), 250);
    return () => clearTimeout(timer);
  }, [subject, locale, category]);

  const add = (files: File[]) => {
    setProblem(null);
    const next = [...shots];
    for (const f of files) {
      if (next.length >= HELP_MAX_FILES) {
        setProblem(t('help.files.tooMany', { n: HELP_MAX_FILES }));
        break;
      }
      if (!TYPES.includes(f.type)) {
        setProblem(t('help.files.type', { name: f.name }));
        continue;
      }
      if (f.size > HELP_MAX_FILE_MB * 1024 * 1024) {
        setProblem(t('errors.file_too_large', { mb: HELP_MAX_FILE_MB }));
        continue;
      }
      const named = f.name && f.name !== 'image.png' ? f : new File([f], `${t('help.files.shotName')}-${next.length + 1}.png`, { type: f.type });
      next.push({
        id: ++shotSeq,
        file: named,
        url: URL.createObjectURL(named),
      });
    }
    setShots(next);
  };
  const remove = (id: number) => {
    const s = shots.find((x) => x.id === id);
    if (s) URL.revokeObjectURL(s.url);
    setShots(shots.filter((x) => x.id !== id));
  };

  const capture = async () => {
    try {
      const blob = await captureTab(hide);
      if (blob) add([new File([blob], `${t('help.files.shotName')}-${shots.length + 1}.png`, { type: 'image/png' })]);
    } catch {
      // The person closed the browser's picker: nothing to add.
    }
  };

  const sent = (): Record<string, unknown> => ({
    ...(keep.device
      ? {
          browser: context.browser,
          screen: context.screen,
          viewport: context.viewport,
          version: context.version,
          locale: context.locale,
          timezone: context.timezone,
        }
      : {}),
    at: context.at,
    ...(keep.pages && context.pages.length ? { pages: context.pages } : {}),
    ...(keep.errors && context.errors.length ? { errors: context.errors } : {}),
    ...(keep.failed && context.failed.length ? { failed: context.failed } : {}),
    ...(keep.open && context.refs ? { refs: context.refs } : {}),
  });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!category) return setProblem(t('help.need.category'));
    if (subject.trim().length < 3) return setProblem(t('help.need.subject'));
    if (description.trim().length < 10) return setProblem(t('help.need.description'));
    setBusy(true);
    setProblem(null);
    const form = new FormData();
    form.set(
      'data',
      JSON.stringify({
        category,
        impact: category === 'bug' || category === 'data' ? impact : null,
        subject: subject.trim(),
        description: description.trim(),
        steps: category === 'bug' && steps.trim() ? steps.trim() : null,
        pageUrl: withPage && /^https?:\/\//.test(page) ? page : null,
        context: sent(),
        grant: grant ? { hours, level } : null,
      }),
    );
    for (const s of shots) form.append('files', s.file);
    try {
      const res = await api<{ request: { ref: string } }>('POST', '/help', form);
      onSent(res.request.ref);
    } catch (err) {
      setProblem(err instanceof ApiFailure ? err.body.message : t('errors.server'));
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    add([...e.dataTransfer.files]);
  };
  const needsImpact = category === 'bug' || category === 'data';
  const canCapture = typeof navigator !== 'undefined' && !!(navigator.mediaDevices as any)?.getDisplayMedia;
  const groups = [
    ['device', t('help.context.device'), `${context.browser} · ${context.viewport} · ${context.version}`],
    ['pages', t('help.context.pages', { n: context.pages.length }), context.pages.join('  ·  ')],
    ['errors', t('help.context.errors', { n: context.errors.length }), context.errors.map((x) => x.message).join('\n')],
    ['failed', t('help.context.failed', { n: context.failed.length }), context.failed.map((x) => `${x.method} ${x.path} → ${x.status || '—'}`).join('\n')],
    [
      'open',
      t('help.context.open'),
      Object.keys(context.refs ?? {})
        .map((k) => t(`help.context.ref.${k}` as MessageKey))
        .join(', '),
    ],
  ].filter(([k]) =>
    k === 'errors' ? context.errors.length : k === 'failed' ? context.failed.length : k === 'pages' ? context.pages.length : k === 'open' ? !!context.refs : true,
  ) as [keyof typeof keep, string, string][];

  return (
    <>
      <form className="help" onSubmit={submit} onPaste={(e) => add([...e.clipboardData.files])} noValidate>
        <fieldset className="field">
          <legend className="field__label">{t('help.categoryLabel')}</legend>
          <div className="help__cats">
            {HELP_CATEGORIES.map((c) => (
              <label key={c} className="help__cat" data-on={category === c || undefined}>
                <input type="radio" name="help-category" checked={category === c} onChange={() => setCategory(c)} />
                <strong>{t(`help.category.${c}` as MessageKey)}</strong>
                <span>{t(`help.categoryHint.${c}` as MessageKey)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {needsImpact && (
          <fieldset className="field">
            <legend className="field__label">{t('help.impactLabel')}</legend>
            <div className="seg" role="radiogroup">
              {HELP_IMPACTS.map((i) => (
                <button key={i} type="button" role="radio" aria-checked={impact === i} aria-pressed={impact === i} onClick={() => setImpact(i)}>
                  {t(`help.impact.${i}` as MessageKey)}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <label className="field">
          <span className="field__label">{t('help.subject')}</span>
          <input className="input" value={subject} maxLength={200} placeholder={t('help.subjectPlaceholder')} onChange={(e) => setSubject(e.target.value)} />
        </label>
        {hits.length > 0 && (
          <div className="help__docs" role="note">
            <span className="field__hint">{t('help.docsMaybe')}</span>
            <ul>
              {hits.map((h) => (
                <li key={h.d.u}>
                  <a href={`${docsHref(h.d.u)}${h.anchor ? `#${h.anchor}` : ''}`} {...docsLink}>
                    {h.d.t}
                  </a>
                  <span className="muted">{h.d.s}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <label className="field">
          <span className="field__label">{t('help.description')}</span>
          <textarea
            className="input"
            rows={5}
            value={description}
            maxLength={20000}
            placeholder={t(`help.placeholder.${category ?? 'question'}` as MessageKey)}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        {category === 'bug' && (
          <label className="field">
            <span className="field__label">{t('help.steps')}</span>
            <textarea className="input" rows={3} value={steps} maxLength={10000} placeholder={t('help.stepsPlaceholder')} onChange={(e) => setSteps(e.target.value)} />
          </label>
        )}

        <div className="field">
          <span className="field__label">{t('help.files.label')}</span>
          <div
            className="help__drop"
            data-over={over || undefined}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={onDrop}
          >
            {shots.length > 0 && (
              <ul className="help__shots">
                {shots.map((s) => (
                  <li key={s.id}>
                    {s.file.type.startsWith('image/') ? <img src={s.url} alt={s.file.name} /> : <span className="help__file">{s.file.name}</span>}
                    <div className="help__shotbar">
                      {s.file.type.startsWith('image/') && (
                        <button type="button" className="btn btn--small btn--quiet" onClick={() => setEditing(s)}>
                          {t('help.files.annotate')}
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn--small btn--quiet"
                        aria-label={t('help.files.remove', {
                          name: s.file.name,
                        })}
                        onClick={() => remove(s.id)}
                      >
                        {t('common.remove')}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="toolbar">
              {canCapture && (
                <button type="button" className="btn btn--small" onClick={capture}>
                  {t('help.files.capture')}
                </button>
              )}
              <button type="button" className="btn btn--small" onClick={() => fileInput.current?.click()}>
                {t('help.files.add')}
              </button>
              <span className="field__hint">
                {t('help.files.hint', {
                  n: HELP_MAX_FILES,
                  mb: HELP_MAX_FILE_MB,
                })}
              </span>
            </div>
            <input ref={fileInput} type="file" hidden multiple accept={TYPES.join(',')} onChange={(e) => (add([...(e.target.files ?? [])]), (e.target.value = ''))} />
          </div>
        </div>

        <div className="field">
          <label className="checkbox">
            <input type="checkbox" checked={withPage} onChange={(e) => setWithPage(e.target.checked)} />
            <span>{t('help.page')}</span>
          </label>
          {withPage && <input className="input" value={page} maxLength={2000} aria-label={t('help.page')} onChange={(e) => setPage(e.target.value)} />}
        </div>

        <details className="help__details" open={showDetails} onToggle={(e) => setShowDetails((e.target as HTMLDetailsElement).open)}>
          <summary>{t('help.context.title')}</summary>
          <p className="field__hint">{t('help.context.why')}</p>
          <ul className="help__ctx">
            {groups.map(([k, label, detail]) => (
              <li key={k}>
                <label className="checkbox">
                  <input type="checkbox" checked={keep[k]} onChange={(e) => setKeep({ ...keep, [k]: e.target.checked })} />
                  <span>{label}</span>
                </label>
                {detail && <pre>{detail}</pre>}
              </li>
            ))}
          </ul>
        </details>

        <div className="help__consent" data-on={grant || undefined}>
          <label className="checkbox">
            <input type="checkbox" checked={grant} disabled={!access?.canGrant || !!me.supportBy} onChange={(e) => setGrant(e.target.checked)} />
            <strong>{t('help.grant.label')}</strong>
          </label>
          <p className="field__hint">{access && !access.canGrant ? t(access.policy === 'off' ? 'help.grant.off' : 'help.grant.adminsOnly') : t('help.grant.explain')}</p>
          {grant && (
            <div className="help__grant">
              <label className="field">
                <span className="field__label">{t('help.grant.for')}</span>
                <select className="select" value={hours} onChange={(e) => setHours(Number(e.target.value) as (typeof GRANT_HOURS)[number])}>
                  {GRANT_HOURS.map((h) => (
                    <option key={h} value={h}>
                      {t(`help.grant.hours.${h}` as MessageKey)}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset className="field">
                <legend className="field__label">{t('help.grant.level')}</legend>
                <label className="checkbox">
                  <input type="radio" name="help-level" checked={level === 'view'} onChange={() => setLevel('view')} />
                  <span>{t('help.grant.view')}</span>
                </label>
                <label className="checkbox" title={access?.canGrantEdit ? undefined : t('help.grant.editAdmins')}>
                  <input type="radio" name="help-level" checked={level === 'edit'} disabled={!access?.canGrantEdit} onChange={() => setLevel('edit')} />
                  <span>{t('help.grant.edit')}</span>
                </label>
              </fieldset>
            </div>
          )}
        </div>

        {problem && (
          <div className="notice notice--error" role="alert">
            {problem}
          </div>
        )}
        <div className="toolbar">
          <button className="btn btn--primary" disabled={busy}>
            <Icon name="send" size={16} />
            {busy ? t('help.sending') : t('help.send')}
          </button>
          <span className="field__hint">{t('help.reply', { email: me.user.email })}</span>
        </div>
      </form>
      {editing && (
        <Annotate
          shot={editing}
          onClose={() => setEditing(null)}
          onDone={(f) => {
            URL.revokeObjectURL(editing.url);
            setShots(shots.map((s) => (s.id === editing.id ? { ...s, file: f, url: URL.createObjectURL(f) } : s)));
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

function MyRequests({ access, reload }: { access: Access | null; reload: () => void }) {
  const { t, fmtDate } = useI18n();
  const { toast, reloadMe, me } = useStore();
  const [list, setList] = useState<HelpRequestInfo[] | null>(null);
  const [hours, setHours] = useState<(typeof GRANT_HOURS)[number]>(24);
  useEffect(() => {
    void get<{ requests: HelpRequestInfo[] }>('/help').then(
      (r) => setList(r.requests),
      () => setList([]),
    );
  }, [access]);
  const revoke = async (id: string) => {
    await del(`/support/grants/${id}`);
    toast(t('help.grant.closed'));
    reload();
    void reloadMe();
  };
  const open = async () => {
    await post('/support/grants', { hours, level: 'view' });
    toast(t('help.grant.opened'));
    reload();
    void reloadMe();
  };
  const active = (access?.grants ?? []).filter((g) => g.active && g.userId === me.user.id);
  const when = (iso: string) =>
    fmtDate(iso, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  return (
    <div className="help">
      <section className="grantbox" data-on={active.length > 0 || undefined}>
        <div className="grantbox__head">
          <span className="grantbox__icon">
            <Icon name="shield" size={20} />
          </span>
          <div>
            <h3 className="grantbox__title">{t('help.grant.title')}</h3>
            <p className="grantbox__what">{t('help.grant.what')}</p>
          </div>
        </div>
        <ul className="grantbox__points">
          {(['see', 'ends', 'log'] as const).map((k) => (
            <li key={k}>
              <Icon name="check" size={15} />
              {t(`help.grant.point.${k}` as MessageKey)}
            </li>
          ))}
        </ul>
        {active.length === 0 && (
          <p className="grantbox__state">
            <span className="grantbox__dot" />
            {t('help.grant.none')}
          </p>
        )}
        <ul className="help__grants">
          {active.map((g) => (
            <li key={g.id}>
              <span>
                <span className="grantbox__dot" data-on />
                <strong>{t('help.grant.on')}</strong>
                <span className="muted">
                  {' '}
                  · {t(g.level === 'edit' ? 'help.grant.edit' : 'help.grant.view')} · {t('help.grant.until', { when: when(g.expiresAt) })}
                </span>
                {g.lastUsedAt && <span className="muted"> · {t('help.grant.used', { when: when(g.lastUsedAt) })}</span>}
                {g.requestRef && <span className="muted"> · {g.requestRef}</span>}
              </span>
              <button className="btn btn--small" onClick={() => revoke(g.id)}>
                {t('help.grant.close')}
              </button>
            </li>
          ))}
        </ul>
        {access?.canGrant && !me.supportBy && active.length === 0 && (
          <div className="grantbox__give">
            <label className="grantbox__for">
              <span>{t('help.grant.for')}</span>
              <select className="select" value={hours} onChange={(e) => setHours(Number(e.target.value) as (typeof GRANT_HOURS)[number])}>
                {GRANT_HOURS.map((h) => (
                  <option key={h} value={h}>
                    {t(`help.grant.hours.${h}` as MessageKey)}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn btn--primary" onClick={open}>
              <Icon name="key" size={16} />
              {t('help.grant.openView')}
            </button>
          </div>
        )}
        {access && !access.canGrant && <p className="field__hint">{t(access.policy === 'off' ? 'help.grant.off' : 'help.grant.adminsOnly')}</p>}
      </section>
      <section>
        <h3 className="section__head">{t('help.mine.title')}</h3>
        {!list && <p className="muted">{t('common.loading')}</p>}
        {list && list.length === 0 && <p className="muted">{t('help.mine.empty')}</p>}
        <ul className="help__list">
          {list?.map((r) => (
            <li key={r.id}>
              <div>
                <strong>{r.subject}</strong>
                <div className="muted">
                  {r.ref} · {t(`help.category.${r.category}` as MessageKey)} · {when(r.createdAt)}
                  {r.files.length > 0 && <> · {t('help.mine.files', { n: r.files.length })}</>}
                </div>
              </div>
              <span className={`badge${r.status === 'solved' ? ' badge--active' : ''}`}>{t(`help.status.${r.status}` as MessageKey)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function HelpDialog({ onClose, start = 'new', about = '' }: { onClose: () => void; start?: 'new' | 'mine'; about?: string }) {
  const { t } = useI18n();
  const { reloadMe } = useStore();
  const [tab, setTab] = useState<'new' | 'mine'>(start);
  const [access, setAccess] = useState<Access | null>(null);
  const [sentRef, setSentRef] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const load = () =>
    void get<Access>('/support/grants').then(setAccess, () =>
      setAccess({
        policy: 'off',
        canGrant: false,
        canGrantEdit: false,
        grants: [],
      }),
    );
  useEffect(load, []);
  return (
    <div className="help__host" data-hidden={hidden || undefined}>
      <Dialog title={t('help.title')} wide onClose={onClose}>
        <div className="tabs" role="tablist">
          <button className="tab" role="tab" aria-selected={tab === 'new'} onClick={() => (setTab('new'), setSentRef(null))}>
            <Icon name="send" size={16} className="icon--lead" />
            {t('help.tab.new')}
          </button>
          <button className="tab" role="tab" aria-selected={tab === 'mine'} onClick={() => setTab('mine')}>
            <Icon name="inbox" size={16} className="icon--lead" />
            {t('help.tab.mine')}
          </button>
        </div>
        {tab === 'new' && sentRef && (
          <div className="help__sent" role="status">
            <strong>{t('help.sent.title')}</strong>
            <p>{t('help.sent.body', { ref: sentRef })}</p>
            <div className="toolbar">
              <button className="btn" onClick={() => setTab('mine')}>
                {t('help.tab.mine')}
              </button>
              <button className="btn btn--primary" onClick={onClose}>
                {t('common.close')}
              </button>
            </div>
          </div>
        )}
        {tab === 'new' && !sentRef && (
          <NewRequest
            key={about}
            about={about}
            access={access}
            hide={setHidden}
            onSent={(ref) => {
              setSentRef(ref);
              load();
              void reloadMe();
            }}
          />
        )}
        {tab === 'mine' && <MyRequests access={access} reload={load} />}
      </Dialog>
    </div>
  );
}

/** Settings → Security: who may let support in, and the access that is open now. */
export function SupportAccessSettings() {
  const { t, fmtDate } = useI18n();
  const { toast } = useStore();
  const [access, setAccess] = useState<Access | null>(null);
  const load = () => void get<Access>('/support/grants?all=1').then(setAccess);
  useEffect(load, []);
  if (!access) return <p className="muted">{t('common.loading')}</p>;
  const setPolicy = async (policy: Access['policy']) => {
    const r = await api<{ ended: number }>('PUT', '/support/policy', {
      policy,
    });
    toast(r.ended ? t('support.policy.ended', { n: r.ended }) : t('common.saved'));
    load();
  };
  const when = (iso: string) =>
    fmtDate(iso, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  const active = access.grants.filter((g) => g.active);
  return (
    <div>
      <section className="sheet">
        <h3 className="section__head">{t('support.policy.title')}</h3>
        <p className="field__hint">{t('support.policy.explain')}</p>
        <div className="help__policy" role="radiogroup">
          {(['anyone', 'admins', 'off'] as const).map((p) => (
            <label key={p} className="checkbox">
              <input type="radio" name="support-policy" checked={access.policy === p} onChange={() => setPolicy(p)} />
              <span>
                <strong>{t(`support.policy.${p}` as MessageKey)}</strong> <span className="muted">{t(`support.policy.${p}Hint` as MessageKey)}</span>
              </span>
            </label>
          ))}
        </div>
      </section>
      <section className="sheet">
        <h3 className="section__head">{t('support.open.title')}</h3>
        {active.length === 0 && <p className="muted">{t('support.open.none')}</p>}
        <ul className="help__grants">
          {active.map((g) => (
            <li key={g.id}>
              <span>
                <strong>{g.userName}</strong> · {t(g.level === 'edit' ? 'help.grant.edit' : 'help.grant.view')}
                <span className="muted">
                  {' '}
                  {t('help.grant.until', { when: when(g.expiresAt) })}
                  {g.lastUsedAt ? ` · ${t('help.grant.used', { when: when(g.lastUsedAt) })}` : ''}
                </span>
              </span>
              <button
                className="btn btn--small"
                onClick={async () => {
                  await del(`/support/grants/${g.id}`);
                  toast(t('help.grant.closed'));
                  load();
                }}
              >
                {t('help.grant.close')}
              </button>
            </li>
          ))}
        </ul>
        <p className="field__hint">{t('support.open.log')}</p>
      </section>
    </div>
  );
}
