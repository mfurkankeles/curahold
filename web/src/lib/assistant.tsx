// The browser's side of CuraAI with a model behind it: where the model comes
// from, what it is allowed to read, and how its answer is drawn.
import type { ReactNode } from 'react';
import { addressOf, prepare, type AnswerIndex, type DocSection } from '../../../shared/src/answers';
import type { AssistantDeps, Sampler } from '../../../shared/src/assistant';
import type { Locale } from '../../../shared/src/i18n';
import type { Me } from '../../../shared/src/model';
import { get } from './api';
import { docsFile, docsHref } from './docs';
import { navigate } from './router';
import { todayIso } from './time';

const IN_DEMO = !!import.meta.env.APP_DEMO;

/**
 * In the demo, Claude answers: asked from the page, on the viewer's own Claude
 * account, after they allow it once. Anywhere else there is no model and the
 * chat answers from the docs alone. Resolves `null` when there is none.
 */
let found: Promise<Sampler | null> | null = null;
export function findSampler(): Promise<Sampler | null> {
  return (found ??= (async () => {
    const claude = (window as unknown as { claude?: { use?: (name: string) => Promise<unknown> } }).claude;
    if (!IN_DEMO || typeof claude?.use !== 'function') return null;
    try {
      const sample = await claude.use('sample');
      return typeof sample === 'function' ? (sample as Sampler) : null;
    } catch {
      return null;
    }
  })());
}

const loaded: Partial<Record<string, Promise<AnswerIndex>>> = {};
const docsBase = docsHref().replace(/index\.html$/, '');
const docsTail = docsHref().endsWith('index.html') ? 'index.html' : '';

export function depsFor(me: Me, locale: Locale, words: { one: string; other: string }, roleName: string): AssistantDeps {
  return {
    api: (path) => get(path),
    docs: () =>
      (loaded[locale] ??= fetch(docsFile(`${locale}/answers.json`))
        .then((r) => {
          if (!r.ok) throw new Error(String(r.status));
          return r.json() as Promise<DocSection[]>;
        })
        .then(prepare)),
    docsUrl: (s) => addressOf(s, docsBase, docsTail),
    locale,
    me: { name: me.user.name, role: roleName, company: me.org.name, customer: words.one, customers: words.other, currency: me.org.currency ?? 'USD' },
    fields: (me.org.accountFields ?? []).map((f) => ({ key: f.key, type: f.type, label: f.label[locale] ?? f.label.en ?? f.key, options: f.options?.map((o) => ({ key: o.key, label: o.label[locale] ?? o.label.en ?? o.key })) })),
    today: todayIso(),
    open: (path) => navigate(path),
  };
}

/**
 * The model's answer as the chat shows it: paragraphs, "- " lists and
 * **bold**. Everything else stays text — nothing the model writes is ever
 * treated as HTML or as a link.
 */
export function Lite({ text }: { text: string }): ReactNode {
  const bold = (line: string, key: string) =>
    line.split(/(\*\*[^*\n]+\*\*)/g).map((part, i) => (/^\*\*[^*\n]+\*\*$/.test(part) ? <strong key={`${key}-${i}`}>{part.slice(2, -2)}</strong> : part));
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (!list.length) return;
    const items = list;
    list = [];
    blocks.push(
      <ul key={`l${blocks.length}`}>
        {items.map((li, i) => (
          <li key={i}>{bold(li, `li${i}`)}</li>
        ))}
      </ul>,
    );
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const item = /^(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line);
    if (item) {
      list.push(item[1]);
      continue;
    }
    flush();
    if (line) blocks.push(<p key={`p${blocks.length}`}>{bold(line.replace(/^#{1,6}\s+/, ''), `p${blocks.length}`)}</p>);
  }
  flush();
  return <>{blocks}</>;
}
