// Reads the API's own source to describe every address: what it needs (a
// writing seat, a permission, a plan), the fields its body takes and the
// query parameters it reads. The developer reference is built from this, so
// it cannot drift from the code: a new address or a new field shows up in the
// reference on the next build, and a test keeps the two in step.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
// The parser that ships with the build tool (no extra dependency); it reads TypeScript as it is.
import { parseSync } from 'rolldown/experimental';

export interface BodyField {
  name: string;
  /** A short, readable type: text, number, yes/no, date, id, one of a | b, list of …, object. */
  type: string;
  required: boolean;
  /** Limits written in the schema: max length, range, default. */
  notes: string[];
}

export interface RouteDoc {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** The address without the /api prefix, wherever its router is mounted (`/admin/users`, `/tasks/:id`). */
  path: string;
  file: string;
  /** False for addresses outside /api (the AI connector, OAuth discovery): they have pages of their own. */
  api: boolean;
  writer: boolean;
  /** Permissions every call needs. */
  perms: string[];
  /** Permissions only some calls need (asked for inside an `if`: archiving, changing someone else's…). */
  permsSometimes: string[];
  plan: string | null;
  body: BodyField[];
  /** True when the body is read but its shape could not be worked out from the source. */
  bodyUnknown: boolean;
  query: string[];
  /** The comment written above the route, when there is one. */
  comment: string | null;
}

const ROUTES_DIR = join(import.meta.dirname, '..', '..', 'api', 'src', 'routes');
const METHODS = new Set(['get', 'post', 'patch', 'put', 'delete']);

type Node = { type: string; start: number; end: number; [k: string]: any };

/** Every child node of a node, whatever it is called. */
function children(n: Node): Node[] {
  const out: Node[] = [];
  for (const k of Object.keys(n)) {
    const v = n[k];
    if (Array.isArray(v)) for (const x of v) if (x && typeof x.type === 'string') out.push(x);
    if (v && typeof v === 'object' && typeof v.type === 'string') out.push(v);
  }
  return out;
}

const isCall = (n: Node | undefined, member?: boolean): n is Node => !!n && n.type === 'CallExpression' && (!member || n.callee.type === 'MemberExpression');
const strOf = (n: Node | undefined): string | null =>
  !n ? null : n.type === 'Literal' && typeof n.value === 'string' ? n.value : n.type === 'TemplateLiteral' && n.expressions.length === 0 ? n.quasis[0].value.cooked : null;

function reader(src: string) {
  const text = (n: Node) => src.slice(n.start, n.end).replace(/\s+/g, ' ');
  const bare = (n: Node) => text(n).replace(/['"`]/g, '');

  /** `z.string().trim().max(120).optional()` → the chain of calls, innermost first, and what it starts from. */
  function chain(node: Node): { base: Node; calls: { name: string; args: Node[] }[] } {
    const calls: { name: string; args: Node[] }[] = [];
    let cur = node;
    while (isCall(cur, true)) {
      calls.unshift({ name: cur.callee.property.name, args: cur.arguments });
      cur = cur.callee.object;
    }
    return { base: cur, calls };
  }

  /** A schema kept under a name: `uuid`, `isoDate`, or one field of a bag such as `accountInput.name`. */
  function named(base: Node, consts: Map<string, Node>, depth: number): Omit<BodyField, 'name'> | null {
    const known: Record<string, string> = { uuid: 'id', isoDate: 'date (YYYY-MM-DD)', dateStr: 'date (YYYY-MM-DD)', day: 'date (YYYY-MM-DD)', dateOnly: 'date (YYYY-MM-DD)', email: 'email' };
    if (base.type === 'Identifier') {
      if (base.name === 'z') return null;
      if (known[base.name]) return { type: known[base.name], required: true, notes: [] };
      const target = consts.get(base.name);
      return target && depth < 4 ? describe(target, consts, depth + 1) : { type: base.name, required: true, notes: [] };
    }
    if (base.type === 'MemberExpression' && base.object.type === 'Identifier' && base.property.type === 'Identifier') {
      const bag = consts.get(base.object.name);
      const prop = bag?.type === 'ObjectExpression' ? bag.properties.find((p: Node) => p.type === 'Property' && p.key.type === 'Identifier' && p.key.name === base.property.name) : null;
      return prop && depth < 4 ? describe(prop.value, consts, depth + 1) : { type: 'value', required: true, notes: [] };
    }
    return null;
  }

  function describe(node: Node, consts: Map<string, Node>, depth = 0): Omit<BodyField, 'name'> {
    const { base, calls } = chain(node);
    const start = named(base, consts, depth);
    let type = start?.type ?? 'value';
    let required = start?.required ?? true;
    const notes: string[] = [...(start?.notes ?? [])];
    for (const c of calls) {
      const a = c.args[0];
      switch (c.name) {
        case 'string': type = 'text'; break;
        case 'number': type = 'number'; break;
        case 'boolean': type = 'yes/no'; break;
        case 'int': type = 'whole number'; break;
        case 'uuid': type = 'id'; break;
        case 'email': type = 'email'; break;
        case 'url': type = 'web address'; break;
        case 'date': type = 'date'; break;
        case 'datetime': type = 'date and time'; break;
        case 'unknown': case 'any': type = 'any value'; break;
        case 'enum': type = a?.type === 'ArrayExpression' ? `one of ${a.elements.map((e: Node) => bare(e)).join(' | ')}` : `one of ${a ? text(a) : '…'}`; break;
        case 'literal': if (a) type = `always ${bare(a)}`; break;
        case 'array': type = a ? `list of ${describe(a, consts, depth + 1).type}` : 'list'; break;
        case 'record': type = 'object (name → value)'; break;
        case 'object': type = 'object'; break;
        case 'union': type = a?.type === 'ArrayExpression' ? a.elements.map((e: Node) => describe(e, consts, depth + 1).type).join(' or ') : 'value'; break;
        case 'optional': required = false; break;
        case 'nullable': notes.push('may be null'); break;
        case 'nullish': required = false; notes.push('may be null'); break;
        case 'default': required = false; if (a) notes.push(`default ${bare(a)}`); break;
        case 'max': if (a) notes.push(type.startsWith('list') ? `at most ${text(a)} items` : type === 'text' ? `at most ${text(a)} characters` : `at most ${text(a)}`); break;
        case 'min': if (a) notes.push(type.startsWith('list') ? `at least ${text(a)} items` : type === 'text' ? `at least ${text(a)} characters` : `at least ${text(a)}`); break;
        case 'length': if (a) notes.push(`exactly ${text(a)} characters`); break;
        case 'regex': if (type === 'text' && a && /\\d\{4\}-\\d\{2\}-\\d\{2\}/.test(text(a))) type = 'date (YYYY-MM-DD)'; break;
      }
    }
    return { type, required, notes: [...new Set(notes)] };
  }

  /** The `{ … }` handed to z.object(), following a named constant if that is what was passed. */
  function objectLiteral(node: Node | undefined, consts: Map<string, Node>, depth = 0): Node | null {
    if (!node || depth > 4) return null;
    if (node.type === 'Identifier') return objectLiteral(consts.get(node.name), consts, depth + 1);
    if (!isCall(node, true)) return null;
    if (node.callee.property.name === 'object' && node.arguments[0]?.type === 'ObjectExpression') return node.arguments[0];
    // .strict(), .partial(), .extend({…}), .refine(…): the object is further in.
    return objectLiteral(node.callee.object, consts, depth + 1);
  }

  function fieldsOf(schema: Node | undefined, consts: Map<string, Node>): BodyField[] | null {
    const obj = objectLiteral(schema, consts);
    if (!obj) return null;
    const partial = !!schema && /\.partial\(\)/.test(text(schema));
    const out: BodyField[] = [];
    const add = (p: Node) => {
      if (p.type === 'Property' && !p.computed && (p.key.type === 'Identifier' || p.key.type === 'Literal')) {
        const name = p.key.type === 'Identifier' ? p.key.name : String(p.key.value);
        const d = p.shorthand ? (consts.get(name) ? describe(consts.get(name)!, consts) : { type: 'value', required: true, notes: [] }) : describe(p.value, consts);
        out.push({ name, ...d, required: partial ? false : d.required });
      } else if (p.type === 'SpreadElement' && p.argument.type === 'Identifier') {
        const target = consts.get(p.argument.name);
        if (target?.type === 'ObjectExpression') target.properties.forEach(add);
      }
    };
    obj.properties.forEach(add);
    // .extend({ … }) on top of the base object adds more fields.
    if (schema && isCall(schema, true) && schema.callee.property.name === 'extend' && schema.arguments[0]?.type === 'ObjectExpression') schema.arguments[0].properties.forEach(add);
    return out;
  }

  return { text, fieldsOf };
}

export function readRoutes(): RouteDoc[] {
  const out: RouteDoc[] = [];
  // Where each router is mounted: app.route('/api/admin', adminRoutes).
  const mounts = new Map<string, string>();
  for (const m of readFileSync(join(ROUTES_DIR, '..', 'app.ts'), 'utf8').matchAll(/app\.route\('([^']+)',\s*(\w+)\)/g)) mounts.set(m[2], m[1]);
  for (const file of readdirSync(ROUTES_DIR).filter((f) => f.endsWith('.ts')).sort()) {
    const src = readFileSync(join(ROUTES_DIR, file), 'utf8');
    const parsed = parseSync(file, src, {}) as unknown as { program: Node; comments: { type: string; value: string; start: number; end: number }[] };
    const { text, fieldsOf } = reader(src);
    // Named schemas and field bags declared at the top of the file.
    const consts = new Map<string, Node>();
    for (const st of parsed.program.body as Node[]) {
      const decl = st.type === 'ExportNamedDeclaration' ? st.declaration : st;
      if (decl?.type === 'VariableDeclaration') for (const d of decl.declarations) if (d.id.type === 'Identifier' && d.init) consts.set(d.id.name, d.init);
    }
    const docComments = parsed.comments.filter((c) => c.type === 'Block' && c.value.startsWith('*'));
    const visit = (n: Node) => {
      const call = n.type === 'ExpressionStatement' ? n.expression : null;
      const path = isCall(call, true) ? strOf(call.arguments[0]) : null;
      if (call && path !== null && METHODS.has(call.callee.property?.name) && /Routes?$|^(supportEntry|app)$/.test(text(call.callee.object))) {
        const mount = mounts.get(text(call.callee.object)) ?? '/api';
        const full = `${mount === '/' ? '' : mount}${path}`;
        const doc: RouteDoc = { method: call.callee.property.name.toUpperCase(), path: full.startsWith('/api/') ? full.slice(4) : full, file, api: full.startsWith('/api/'), writer: false, perms: [], permsSometimes: [], plan: null, body: [], bodyUnknown: false, query: [], comment: null };
        // The comment that ends right above this statement.
        const above = docComments.find((c) => c.end <= n.start && /^\s*$/.test(src.slice(c.end, n.start)));
        if (above) doc.comment = above.value.replace(/^\*/, '').replace(/^\s*\* ?/gm, '').replace(/\s+/g, ' ').trim();
        let bodySeen = false;
        const handler = call.arguments[call.arguments.length - 1];
        // What the handler asks for straight away applies to every call; what it asks for deeper in (inside an `if`) only to some.
        const direct = new Set<Node>((handler.body?.type === 'BlockStatement' ? handler.body.body : []).filter((st: Node) => st.type === 'ExpressionStatement').map((st: Node) => st.expression));
        const walk = (m: Node) => {
          if (m.type === 'CallExpression' && m.callee.type === 'Identifier') {
            const fn = m.callee.name;
            const always = direct.has(m);
            if (fn === 'requireWriter' && always) doc.writer = true;
            if (fn === 'requirePerm' || fn === 'requireAnyPerm') for (const a of m.arguments.slice(1)) if (strOf(a)) (always ? doc.perms : doc.permsSometimes).push(strOf(a)!);
            if (fn === 'requirePlan' && always && strOf(m.arguments[1])) doc.plan = strOf(m.arguments[1]);
            if (fn === 'body' && !bodySeen) {
              bodySeen = true;
              const fields = fieldsOf(m.arguments[1], consts);
              if (fields) doc.body = fields;
              else doc.bodyUnknown = true;
            }
          }
          if (m.type === 'CallExpression' && /\.req\.query$/.test(text(m.callee)) && strOf(m.arguments[0]) && !doc.query.includes(strOf(m.arguments[0])!)) doc.query.push(strOf(m.arguments[0])!);
          children(m).forEach(walk);
        };
        walk(handler);
        doc.permsSometimes = doc.permsSometimes.filter((x) => !doc.perms.includes(x));
        out.push(doc);
        return;
      }
      children(n).forEach(visit);
    };
    visit(parsed.program);
  }
  return out;
}

if (process.argv[1]?.endsWith('routes.ts')) {
  const only = process.argv[2];
  for (const r of readRoutes()) {
    if (!r.api || (only && !only.split(',').some((p) => r.path.split('/')[1] === p))) continue;
    const needs = [r.writer ? 'W' : '', ...r.perms, ...r.permsSometimes.map((x) => `(${x})`), r.plan ? `plan:${r.plan}` : ''].filter(Boolean).join(',');
    const body = r.bodyUnknown ? '{?}' : r.body.map((f) => `${f.name}${f.required ? '' : '?'}:${f.type}`).join(', ');
    console.log(`${r.method} ${r.path}${needs ? ` [${needs}]` : ''}${r.query.length ? ` ?${r.query.join('&')}` : ''}${body ? ` {${body}}` : ''}${r.comment ? ` // ${r.comment.slice(0, 110)}` : ''}`);
  }
}
