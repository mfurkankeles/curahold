// The commenting standard's check (CONTRIBUTING.md, "Comments"): lists source
// files that do not start with a header comment, and exported functions,
// React components and API routes that have no doc comment above them.
// It only reads the repository (git ls-files) and parses each file with
// @babel/parser, the parser the linter already uses; it changes nothing.
//
//   npx tsx scripts/quality/comments.mts              summary + the worst files
//   npx tsx scripts/quality/comments.mts --all        every finding, file by file
//   npx tsx scripts/quality/comments.mts --json       machine-readable (for CI or a baseline)
//   npx tsx scripts/quality/comments.mts --max=N      exit 1 when findings exceed N (a ratchet: lower N as debt is paid)
//   npx tsx scripts/quality/comments.mts api/src/team only files under these paths
//
// What counts:
// - header: the first thing in the file (after a shebang) is a comment of at least
//   HEADER_MIN_CHARS characters. Tool directives (eslint-disable, @ts-…) do not count.
// - doc comment: a comment directly above the exported declaration (or its `export`),
//   either /** … */ or // lines. /** … */ is preferred because editors show it on hover.
// - checked symbols: exported functions, exported arrow/function constants (this is
//   how components and hooks are written here), exported classes, default exports, and
//   top-level route registrations such as `taskRoutes.post('/tasks', …)`.
//   Exported types and plain constants are not checked.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from '@babel/parser';

const root = join(import.meta.dirname, '..', '..');
const HEADER_MIN_CHARS = 20;
const SOURCE_DIRS = ['api/src/', 'shared/src/', 'web/src/', 'web/portal/', 'web/demo/', 'scripts/', 'site/', 'tools/', 'integrations/'];
const EXTENSIONS = /\.(ts|tsx|mts|js|mjs)$/;
// Generated or data-only files: their header is checked, their exports are not.
const DATA_ONLY = [/^shared\/src\/i18n\/(?!core|index|vite-plugin|glossary)[^/]+\.ts$/, /\.d\.ts$/];
const ROUTE_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'all', 'on']);

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const maxArg = args.find((a) => a.startsWith('--max='));
const only = args.filter((a) => !a.startsWith('--'));

interface Finding {
  file: string;
  kind: 'header' | 'function' | 'component' | 'route' | 'class' | 'default';
  name: string;
  line: number;
}

type Node = { type: string; start?: number | null; loc?: { start: { line: number } } | null; leadingComments?: { type: string; value: string }[] | null; [k: string]: unknown };

const files = execSync('git ls-files', { cwd: root, encoding: 'utf8' })
  .split('\n')
  .filter((f) => EXTENSIONS.test(f) && SOURCE_DIRS.some((d) => f.startsWith(d)))
  .filter((f) => !f.includes('/vendor/') && !f.endsWith('.min.js'))
  .filter((f) => only.length === 0 || only.some((p) => f.startsWith(p)));

/** A comment that says something, not a tool directive. */
const meaningful = (text: string) => {
  const t = text.replace(/^\*+/, '').trim();
  return t.length > 0 && !/^(eslint-|@ts-|prettier-ignore|global |#region|jshint|istanbul)/.test(t);
};

/** Does the file open with a header comment? Looks at the raw text so a header followed by imports counts. */
function hasHeader(source: string): boolean {
  let s = source.replace(/^#![^\n]*\n/, '').replace(/^﻿/, '');
  let text = '';
  for (;;) {
    s = s.replace(/^\s+/, '');
    const line = /^\/\/([^\n]*)\n?/.exec(s);
    const block = /^\/\*([\s\S]*?)\*\//.exec(s);
    const m = line ?? block;
    if (!m) break;
    if (meaningful(m[1])) text += m[1].trim() + ' ';
    s = s.slice(m[0].length);
  }
  return text.trim().length >= HEADER_MIN_CHARS;
}

const hasDoc = (...nodes: (Node | undefined)[]) => nodes.some((n) => (n?.leadingComments ?? []).some((c) => meaningful(c.value)));
const lineOf = (n: Node) => n.loc?.start.line ?? 0;
const isFunctionLike = (n: Node | null | undefined) =>
  !!n && ['ArrowFunctionExpression', 'FunctionExpression'].includes(n.type);
/** memo(...), forwardRef(...), lazy(...) around a component. */
const wrapsFunction = (n: Node | null | undefined): boolean =>
  !!n && n.type === 'CallExpression' && ((n.arguments as Node[]) ?? []).some((a) => isFunctionLike(a) || wrapsFunction(a));
const componentName = (name: string) => /^[A-Z]/.test(name);
let checked = 0; // exported symbols and routes looked at, documented or not

function check(file: string): Finding[] {
  const source = readFileSync(join(root, file), 'utf8');
  const out: Finding[] = [];
  if (!hasHeader(source)) out.push({ file, kind: 'header', name: '(file header)', line: 1 });
  if (DATA_ONLY.some((r) => r.test(file))) return out;
  let ast: { program: { body: Node[] } };
  try {
    ast = parse(source, {
      sourceType: 'module',
      allowAwaitOutsideFunction: true,
      allowReturnOutsideFunction: true,
      errorRecovery: true,
      plugins: [/\.tsx$|\.jsx?$|\.mjs$/.test(file) ? 'jsx' : null, /\.m?tsx?$/.test(file) ? 'typescript' : null].filter(Boolean) as never,
    }) as never;
  } catch {
    return out; // a file the parser cannot read is the type checker's business, not this check's
  }
  for (const stmt of ast.program.body) {
    if (stmt.type === 'ExportNamedDeclaration' && stmt.declaration) {
      const decl = stmt.declaration as Node;
      if (decl.type === 'FunctionDeclaration' || decl.type === 'TSDeclareFunction') {
        const name = (decl.id as { name: string } | null)?.name ?? '?';
        checked++;
        if (!hasDoc(stmt, decl)) out.push({ file, kind: componentName(name) ? 'component' : 'function', name, line: lineOf(stmt) });
      } else if (decl.type === 'ClassDeclaration') {
        const name = (decl.id as { name: string } | null)?.name ?? '?';
        checked++;
        if (!hasDoc(stmt, decl)) out.push({ file, kind: 'class', name, line: lineOf(stmt) });
      } else if (decl.type === 'VariableDeclaration') {
        for (const d of decl.declarations as Node[]) {
          const init = d.init as Node | null;
          if (!isFunctionLike(init) && !wrapsFunction(init)) continue;
          const name = (d.id as { name?: string }).name ?? '?';
          checked++;
          if (!hasDoc(stmt, decl, d)) out.push({ file, kind: componentName(name) ? 'component' : 'function', name, line: lineOf(stmt) });
        }
      }
    } else if (stmt.type === 'ExportDefaultDeclaration') {
      const decl = stmt.declaration as Node;
      if (['FunctionDeclaration', 'ClassDeclaration', 'ArrowFunctionExpression'].includes(decl.type)) checked++;
      if (['FunctionDeclaration', 'ClassDeclaration', 'ArrowFunctionExpression'].includes(decl.type) && !hasDoc(stmt, decl)) {
        out.push({ file, kind: 'default', name: (decl.id as { name: string } | null)?.name ?? 'default', line: lineOf(stmt) });
      }
    } else if (stmt.type === 'ExpressionStatement') {
      // someRoutes.post('/path', …) at the top level of a routes file
      const call = stmt.expression as Node;
      if (call.type !== 'CallExpression') continue;
      const callee = call.callee as Node;
      if (callee.type !== 'MemberExpression') continue;
      const method = (callee.property as { name?: string }).name ?? '';
      const target = callee.object as Node;
      const first = (call.arguments as Node[])[0];
      if (!ROUTE_METHODS.has(method) || target.type !== 'Identifier' || first?.type !== 'StringLiteral') continue;
      const path = first.value as string;
      if (!path.startsWith('/')) continue;
      checked++;
      if (!hasDoc(stmt)) out.push({ file, kind: 'route', name: `${method.toUpperCase()} ${path}`, line: lineOf(stmt) });
    }
  }
  return out;
}

const findings = files.flatMap(check);
const byKind = new Map<string, number>();
for (const f of findings) byKind.set(f.kind, (byKind.get(f.kind) ?? 0) + 1);
const byFile = new Map<string, Finding[]>();
for (const f of findings) byFile.set(f.file, [...(byFile.get(f.file) ?? []), f]);

if (flag('json')) {
  console.log(JSON.stringify({ files: files.length, checked, total: findings.length, byKind: Object.fromEntries(byKind), findings }, null, 1));
} else {
  const withoutHeader = byKind.get('header') ?? 0;
  const symbols = findings.length - withoutHeader;
  console.log(`comments: ${files.length} files checked`);
  console.log(`  files without a header comment: ${withoutHeader}`);
  console.log(`  exported symbols / routes without a doc comment: ${symbols} of ${checked} (${checked ? Math.round((100 * (checked - symbols)) / checked) : 100}% documented)  (${[...byKind].filter(([k]) => k !== 'header').map(([k, n]) => `${k} ${n}`).join(', ')})`);
  const ranked = [...byFile].sort((a, b) => b[1].length - a[1].length);
  const shown = flag('all') ? ranked : ranked.slice(0, 25);
  console.log(flag('all') ? '\nAll findings:' : '\nWorst 25 files (findings):');
  for (const [file, list] of shown) {
    console.log(`  ${String(list.length).padStart(4)}  ${file}`);
    if (flag('all')) for (const f of list) console.log(`          ${f.line}: ${f.kind} ${f.name}`);
  }
}

if (maxArg) {
  const max = Number(maxArg.slice('--max='.length));
  if (findings.length > max) {
    console.error(`\ncomments: ${findings.length} findings, more than the allowed ${max}. Add the missing comments (CONTRIBUTING.md, "Comments").`);
    process.exit(1);
  }
}
