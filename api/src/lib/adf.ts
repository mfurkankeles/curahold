// Atlassian Document Format (what Jira Cloud's REST API v3 uses for rich text) to and from the plain text with
// light markdown that Curahold keeps in a task's description. Only what a task description needs: paragraphs,
// headings, bold / italic / strike / code / links, bullet and numbered lists, quotes, code blocks and rules.
// Anything else (panels, tables, mentions, media, status lozenges…) is flattened to readable text, never dropped.

type Mark = { type: string; attrs?: Record<string, any> };
export interface AdfNode {
  type: string;
  attrs?: Record<string, any>;
  content?: AdfNode[];
  text?: string;
  marks?: Mark[];
}
export interface AdfDoc extends AdfNode {
  type: 'doc';
  version: 1;
  content: AdfNode[];
}

// ------------------------------------------------------------------ ADF → text

function inline(n: AdfNode): string {
  switch (n.type) {
    case 'text': {
      let t = n.text ?? '';
      for (const m of n.marks ?? []) {
        if (m.type === 'code') t = `\`${t}\``;
        else if (m.type === 'strong') t = `**${t}**`;
        else if (m.type === 'em') t = `*${t}*`;
        else if (m.type === 'strike') t = `~~${t}~~`;
        else if (m.type === 'link' && m.attrs?.href) t = `[${t}](${m.attrs.href})`;
      }
      return t;
    }
    case 'hardBreak':
      return '\n';
    case 'mention':
      return n.attrs?.text ?? '@someone';
    case 'emoji':
      return n.attrs?.text ?? n.attrs?.shortName ?? '';
    case 'inlineCard':
    case 'blockCard':
    case 'embedCard':
      return n.attrs?.url ?? '';
    case 'status':
      return n.attrs?.text ? `[${n.attrs.text}]` : '';
    case 'date': {
      const ts = Number(n.attrs?.timestamp);
      return Number.isFinite(ts) ? new Date(ts).toISOString().slice(0, 10) : '';
    }
    case 'media':
    case 'mediaInline':
      return n.attrs?.alt ? `[${n.attrs.alt}]` : '[attachment]';
    default:
      return (n.content ?? []).map(inline).join('');
  }
}

function block(n: AdfNode, indent = ''): string {
  const kids = n.content ?? [];
  const joinBlocks = (sep: string) => kids.map((k) => block(k, indent)).filter((s) => s !== '').join(sep);
  switch (n.type) {
    case 'doc':
      return joinBlocks('\n\n');
    case 'paragraph':
      return kids.map(inline).join('');
    case 'heading':
      return `${'#'.repeat(Math.min(6, Math.max(1, Number(n.attrs?.level) || 1)))} ${kids.map(inline).join('')}`;
    case 'blockquote':
    case 'panel':
    case 'expand':
    case 'nestedExpand':
      return joinBlocks('\n\n')
        .split('\n')
        .map((l) => (l ? `> ${l}` : '>'))
        .join('\n');
    case 'rule':
      return '---';
    case 'codeBlock':
      return `\`\`\`${n.attrs?.language ?? ''}\n${kids.map((k) => k.text ?? '').join('')}\n\`\`\``;
    case 'bulletList':
    case 'orderedList': {
      const start = Number(n.attrs?.order) || 1;
      return kids
        .map((li, i) => {
          const mark = n.type === 'bulletList' ? '- ' : `${start + i}. `;
          const parts = li.content ?? [];
          const first = parts[0] ? block(parts[0]) : '';
          const rest = parts.slice(1).map((c) => (c.type === 'bulletList' || c.type === 'orderedList' ? block(c, `${indent}  `) : block(c).split('\n').map((l) => `${indent}  ${l}`).join('\n')));
          return [`${indent}${mark}${first}`, ...rest].join('\n');
        })
        .join('\n');
    }
    case 'table':
      return kids.map((row) => (row.content ?? []).map((cell) => (cell.content ?? []).map((c) => block(c)).join(' ').replace(/\n+/g, ' ')).join(' | ')).join('\n');
    case 'mediaSingle':
    case 'mediaGroup':
      return kids.map(inline).join(' ');
    default:
      // A block we do not know: its text, if it has any.
      return kids.length ? kids.map((k) => (k.type === 'text' || k.type === 'hardBreak' ? inline(k) : block(k, indent))).join('') : inline(n);
  }
}

/** Jira's rich text → the plain text with light markdown Curahold stores. A string passes through (API v2, older data). */
export function adfToText(doc: unknown): string {
  if (doc === null || doc === undefined) return '';
  if (typeof doc === 'string') return doc;
  if (typeof doc !== 'object') return '';
  return block(doc as AdfNode).trim();
}

// ------------------------------------------------------------------ text → ADF

const INLINE = /(\*\*([^*]+)\*\*|~~([^~]+)~~|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(?<![\w*])\*([^*\s][^*]*)\*(?![\w*])|(?<![\w_])_([^_\s][^_]*)_(?![\w_]))/g;

function inlineNodes(text: string): AdfNode[] {
  const out: AdfNode[] = [];
  const push = (t: string, marks?: Mark[]) => {
    if (t) out.push({ type: 'text', text: t, ...(marks?.length ? { marks } : {}) });
  };
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    push(text.slice(last, m.index));
    if (m[2] !== undefined) push(m[2], [{ type: 'strong' }]);
    else if (m[3] !== undefined) push(m[3], [{ type: 'strike' }]);
    else if (m[4] !== undefined) push(m[4], [{ type: 'code' }]);
    else if (m[5] !== undefined) push(m[5], [{ type: 'link', attrs: { href: m[6] } }]);
    else push(m[7] ?? m[8], [{ type: 'em' }]);
    last = (m.index ?? 0) + m[0].length;
  }
  push(text.slice(last));
  return out;
}

/** A paragraph's lines: a single newline is a hard break. */
function paragraph(lines: string[]): AdfNode {
  const content: AdfNode[] = [];
  lines.forEach((l, i) => {
    if (i) content.push({ type: 'hardBreak' });
    content.push(...inlineNodes(l));
  });
  return { type: 'paragraph', content };
}

const BULLET = /^(\s*)[-*+]\s+(.*)$/;
const ORDERED = /^(\s*)(\d+)[.)]\s+(.*)$/;

function list(lines: string[], from: number, ordered: boolean): [AdfNode, number] {
  const items: AdfNode[] = [];
  let i = from;
  const re = ordered ? ORDERED : BULLET;
  const base = (re.exec(lines[from]) ?? [])[1]?.length ?? 0;
  while (i < lines.length) {
    const m = re.exec(lines[i]);
    if (!m || m[1].length !== base) break;
    const item: AdfNode = { type: 'listItem', content: [paragraph([ordered ? m[3] : m[2]])] };
    i++;
    // A deeper list under the item.
    const next = lines[i];
    if (next !== undefined) {
      const nb = BULLET.exec(next);
      const no = ORDERED.exec(next);
      const deeper = (nb && nb[1].length > base) || (no && no[1].length > base);
      if (deeper) {
        const [sub, end] = list(lines, i, !!no && !nb);
        item.content!.push(sub);
        i = end;
      }
    }
    items.push(item);
  }
  const start = ordered ? Number((ORDERED.exec(lines[from]) ?? [])[2]) : 0;
  return [{ type: ordered ? 'orderedList' : 'bulletList', ...(ordered && start > 1 ? { attrs: { order: start } } : {}), content: items }, i];
}

/** The plain text with light markdown → Jira's rich text. */
export function textToAdf(text: string): AdfDoc {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  const content: AdfNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const fence = /^```\s*([\w+-]*)\s*$/.exec(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) body.push(lines[i++]);
      i++;
      content.push({ type: 'codeBlock', ...(fence[1] ? { attrs: { language: fence[1] } } : {}), content: body.length ? [{ type: 'text', text: body.join('\n') }] : [] });
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      content.push({ type: 'heading', attrs: { level: h[1].length }, content: inlineNodes(h[2]) });
      i++;
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      content.push({ type: 'rule' });
      i++;
      continue;
    }
    if (/^>/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^>/.test(lines[i])) body.push(lines[i++].replace(/^>\s?/, ''));
      content.push({ type: 'blockquote', content: [paragraph(body)] });
      continue;
    }
    if (BULLET.test(line) || ORDERED.test(line)) {
      const [node, end] = list(lines, i, !BULLET.test(line) && ORDERED.test(line));
      content.push(node);
      i = end;
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(```|#{1,6}\s|>|---)/.test(lines[i]) && !BULLET.test(lines[i]) && !ORDERED.test(lines[i])) para.push(lines[i++]);
    content.push(paragraph(para));
  }
  return { type: 'doc', version: 1, content };
}
