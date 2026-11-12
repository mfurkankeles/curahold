// Builds the Make app (app.json) from the same description the Zapier app
// uses. Run after changing ../zapier/operations.js:
//
//   node integrations/make/build.mjs
//
// tests/integrations.test.ts fails if app.json is out of step.
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { SAMPLES, lists, triggers, actions, searches } = require('../zapier/operations.js');

const ERROR = { message: '[{{statusCode}}] {{body.message}}' };
const SANITIZE = ['request.headers.authorization'];
/** "/tasks/{taskId}" in Make's words. */
const path = (p) => p.replace(/\{(\w+)\}/g, '{{parameters.$1}}');
const kindOf = (v) => (Array.isArray(v) ? 'array' : typeof v === 'boolean' ? 'boolean' : typeof v === 'number' ? 'number' : 'text');
/** What a module gives to the next one, from the example. */
const outputOf = (sample) => Object.entries(SAMPLES[sample]).map(([name, v]) => ({ name, type: kindOf(v), label: name }));

function parameter(f) {
  const p = { name: f.key, label: f.label, required: !!f.required, type: 'text' };
  if (f.help) p.help = f.help;
  if (f.long) p.multiline = true;
  if (f.datetime) p.type = 'date';
  if (f.choices) Object.assign(p, { type: 'select', options: f.choices.map((c) => ({ label: c, value: c })) });
  if (f.list) Object.assign(p, { type: 'select', options: `rpc://list_${f.list}` });
  if (f.many) p.multiple = true;
  return p;
}

export function build() {
  const app = {
    name: 'curahold',
    label: 'Curahold',
    description: 'Customers, tasks and timelines in Curahold: start scenarios from what happens there, and add or change things.',
    language: 'en',
    base: {
      baseUrl: 'https://{{connection.domain}}/api',
      headers: { authorization: 'Bearer {{connection.apiKey}}' },
      response: { error: ERROR },
      log: { sanitize: SANITIZE },
    },
    connections: {
      apikey: {
        label: 'Curahold API key',
        type: 'basic',
        parameters: [
          { name: 'domain', label: 'Curahold address', type: 'text', required: true, help: 'The address you open Curahold at, for example yourcompany.curahold.com (no https://).' },
          { name: 'apiKey', label: 'API key', type: 'password', required: true, help: 'In Curahold: Your settings → API keys and connected apps → New API key.' },
        ],
        api: {
          url: 'https://{{parameters.domain}}/api/me',
          headers: { authorization: 'Bearer {{parameters.apiKey}}' },
          response: { metadata: { type: 'text', value: '{{body.org.name}}' }, error: ERROR },
          log: { sanitize: SANITIZE },
        },
      },
    },
    webhooks: {},
    modules: {},
    rpcs: {},
  };

  for (const [name, l] of Object.entries(lists)) {
    app.rpcs[`list_${name}`] = { label: `List ${name}`, connection: 'apikey', api: { url: l.path, method: 'GET', response: { iterate: `{{body.${l.pick}}}`, output: { label: `{{item.${l.label}}}`, value: '{{item.id}}' } } } };
  }

  for (const t of triggers) {
    app.webhooks[t.key] = {
      label: t.label,
      type: 'web',
      connection: 'apikey',
      // One message, one bundle; "task completed" passes only tasks that are done.
      api: { output: '{{body.data}}', ...(t.onlyIf ? { condition: `{{body.data.${t.onlyIf}}}` } : {}) },
      attach: { url: '/dev/webhooks', method: 'POST', body: { url: '{{webhook.url}}', events: [t.event] }, response: { data: { externalHookId: '{{body.webhook.id}}' } } },
      detach: { url: '/dev/webhooks/{{webhook.externalHookId}}', method: 'DELETE' },
    };
    app.modules[`watch_${t.key}`] = { label: t.label, description: t.description, type: 'instant_trigger', webhook: t.key, interface: outputOf(t.sample), samples: SAMPLES[t.sample] };
  }

  for (const a of actions) {
    const inPath = a.fields.filter((f) => f.inPath).map((f) => `'${f.key}'`);
    // Everything that was filled in, except what went into the address. Empty fields are not sent at all.
    const body = inPath.length ? `{{omit(parameters; ${inPath.join('; ')})}}` : '{{parameters}}';
    const call = { url: path(a.path), method: a.method, body, response: { output: `{{body.${a.pick}}}` } };
    app.modules[a.key] = {
      label: a.label,
      description: a.description,
      type: 'action',
      connection: 'apikey',
      // A task is changed against the version just read, so two edits at once cannot overwrite each other unnoticed.
      api: a.before
        ? [
            { url: path(a.before.path), method: 'GET', response: { temp: { [a.before.set]: `{{body.${a.before.from}}}` } } },
            { ...call, body: { [a.before.set]: `{{temp.${a.before.set}}}`, ...Object.fromEntries(a.fields.filter((f) => !f.inPath).map((f) => [f.key, `{{parameters.${f.key}}}`])) } },
          ]
        : call,
      parameters: a.fields.map(parameter),
      interface: outputOf(a.sample),
      samples: SAMPLES[a.sample],
    };
  }

  for (const s of searches) {
    const qs = Object.fromEntries(Object.entries(s.query).map(([k, v]) => [k, s.fields.some((f) => f.key === v) ? `{{parameters.${v}}}` : v]));
    app.modules[s.key] = { label: s.label, description: s.description, type: 'search', connection: 'apikey', api: { url: s.path, method: 'GET', qs, response: { iterate: `{{body.${s.pick}}}`, output: '{{item}}' } }, parameters: s.fields.map(parameter), interface: outputOf(s.sample), samples: SAMPLES[s.sample] };
  }
  return app;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(join(dirname(fileURLToPath(import.meta.url)), 'app.json'), `${JSON.stringify(build(), null, 2)}\n`);
  console.log('integrations/make/app.json written');
}
