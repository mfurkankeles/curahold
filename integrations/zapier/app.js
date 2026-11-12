// The Zapier app, built from operations.js. Nothing here knows Zapier's
// servers: it is plain objects and functions that take Zapier's `z` and
// `bundle`, which is also how tests/integrations.test.ts runs it against the
// real API.
const crypto = require('crypto');
const { SAMPLES, lists, triggers, actions, searches, fill, bodyOf, dig, hostOf } = require('./operations');

const api = (bundle, path) => `https://${hostOf(bundle.authData.domain)}/api${path}`;
const ask = async (z, bundle, method, path, body) => (await z.request({ method, url: api(bundle, path), ...(body === undefined ? {} : { body }) })).data;

const authentication = {
  type: 'custom',
  fields: [
    { key: 'domain', label: 'Curahold address', required: true, type: 'string', helpText: 'The address you open Curahold at, for example `yourcompany.curahold.com`.' },
    { key: 'apiKey', label: 'API key', required: true, type: 'password', helpText: 'In Curahold: Your settings → API keys and connected apps → New API key. Tick "Can make changes" if your Zaps will add or change anything.' },
  ],
  test: async (z, bundle) => {
    const me = await ask(z, bundle, 'GET', '/me');
    return { company: me.org.name, email: me.user.email };
  },
  connectionLabel: '{{company}} ({{email}})',
};

/** Every request carries the key; it is never put in an address. */
const addKey = (request, z, bundle) => {
  if (bundle.authData && bundle.authData.apiKey) request.headers = { ...request.headers, Authorization: `Bearer ${bundle.authData.apiKey}` };
  return request;
};
/** Curahold's own words for what went wrong, instead of a bare status. */
const explain = (response, z) => {
  if (response.status >= 400) {
    const said = (response.data && (response.data.message || response.data.error)) || `Curahold answered ${response.status}`;
    throw new z.errors.Error(said, (response.data && response.data.error) || 'error', response.status);
  }
  return response;
};

/** True unless the message carries a signature that does not match the secret this hook was given. */
function signedByCurahold(bundle) {
  const secret = bundle.subscribeData && bundle.subscribeData.secret;
  const raw = bundle.rawRequest;
  if (!secret || !raw || !raw.headers || typeof raw.content !== 'string') return true;
  const name = Object.keys(raw.headers).find((h) => /^(http[-_])?curahold[-_]signature$/i.test(h));
  if (!name) return false;
  const parts = Object.fromEntries(String(raw.headers[name]).split(',').map((p) => p.split('=')));
  if (!parts.t || !parts.v1 || Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${parts.t}.${raw.content}`).digest('hex');
  return expected.length === parts.v1.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
}

function hook(t) {
  return {
    key: t.key,
    noun: t.noun,
    display: { label: t.label, description: t.description },
    operation: {
      type: 'hook',
      performSubscribe: async (z, bundle) => {
        const made = await ask(z, bundle, 'POST', '/dev/webhooks', { url: bundle.targetUrl, events: [t.event] });
        return { id: made.webhook.id, secret: made.secret };
      },
      performUnsubscribe: async (z, bundle) => ask(z, bundle, 'DELETE', `/dev/webhooks/${encodeURIComponent(bundle.subscribeData.id)}`),
      perform: async (z, bundle) => {
        const message = bundle.cleanedRequest;
        if (!message || !message.data || message.event !== t.event || !signedByCurahold(bundle)) return [];
        if (t.onlyIf && !message.data[t.onlyIf]) return [];
        return [{ ...message.data, event: message.event, eventId: message.id, occurredAt: message.occurredAt }];
      },
      // A few real items to build the Zap with; where there is no list to read, the example.
      performList: async (z, bundle) => {
        if (!t.recent) return [SAMPLES[t.sample]];
        const rows = dig(await ask(z, bundle, 'GET', t.recent.path), t.recent.pick) || [];
        return rows.slice(0, 3);
      },
      sample: SAMPLES[t.sample],
    },
  };
}

/** Hidden triggers that only fill dropdowns. */
function dropdown(name) {
  const l = lists[name];
  return {
    key: `list_${name}`,
    noun: l.noun,
    display: { label: `List ${name}`, description: `Fills the ${l.noun.toLowerCase()} dropdown.`, hidden: true },
    operation: {
      perform: async (z, bundle) => (dig(await ask(z, bundle, 'GET', l.path), l.pick) || []).map((r) => ({ id: r.id, name: r[l.label] })),
      sample: { id: SAMPLES.account.id, name: 'Example' },
    },
  };
}

const inputField = (f) => ({
  key: f.key,
  label: f.label,
  required: !!f.required,
  type: f.long ? 'text' : f.datetime || f.date ? 'datetime' : 'string',
  ...(f.help ? { helpText: f.help } : {}),
  ...(f.choices ? { choices: f.choices } : {}),
  ...(f.list ? { dynamic: `list_${f.list}.id.name` } : {}),
  ...(f.many ? { list: true } : {}),
});

function create(a) {
  return {
    key: a.key,
    noun: a.noun,
    display: { label: a.label, description: a.description },
    operation: {
      inputFields: a.fields.map(inputField),
      perform: async (z, bundle) => {
        const body = bodyOf(a, bundle.inputData);
        if (a.before) body[a.before.set] = dig(await ask(z, bundle, 'GET', fill(a.before.path, bundle.inputData)), a.before.from);
        return dig(await ask(z, bundle, a.method, fill(a.path, bundle.inputData), body), a.pick);
      },
      sample: SAMPLES[a.sample],
    },
  };
}

function search(s) {
  return {
    key: s.key,
    noun: s.noun,
    display: { label: s.label, description: s.description },
    operation: {
      inputFields: s.fields.map(inputField),
      perform: async (z, bundle) => {
        const query = Object.entries(s.query).map(([k, v]) => `${k}=${encodeURIComponent(v in bundle.inputData ? String(bundle.inputData[v]) : v)}`);
        return dig(await ask(z, bundle, 'GET', `${s.path}?${query.join('&')}`), s.pick) || [];
      },
      sample: SAMPLES[s.sample],
    },
  };
}

const byKey = (list) => Object.fromEntries(list.map((x) => [x.key, x]));

module.exports = {
  authentication,
  beforeRequest: [addKey],
  afterResponse: [explain],
  triggers: byKey([...triggers.map(hook), ...Object.keys(lists).map(dropdown)]),
  creates: byKey(actions.map(create)),
  searches: byKey(searches.map(search)),
  // For the tests.
  signedByCurahold,
};
