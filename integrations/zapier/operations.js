// One description of what other tools can do with Curahold, in plain data.
// The Zapier app (app.js) and the Make app (../make/build.mjs) are both built
// from it, and tests/integrations.test.ts runs every entry against the real
// API, so the two apps cannot drift from the product or from each other.
//
// Everything here goes through the public API with a personal API key
// (docs: API keys, Webhooks). Paths are relative to https://<company address>/api.

/** Example values shown while someone builds an automation. Made up. */
const SAMPLES = {
  task: { id: '6f1c2f0e-1b7a-4c53-9b61-0f2d6a3c9e11', title: 'Send the renewal proposal', status: 'todo', done: false, priority: 'high', dueDate: '2027-01-15', accountId: '0b6f3f4e-58a1-4a8e-8d0f-5a1b2c3d4e5f', accountName: 'Pinecrest Foods', assigneeIds: ['c1a2b3c4-d5e6-4f70-8a9b-0c1d2e3f4a5b'] },
  account: { id: '0b6f3f4e-58a1-4a8e-8d0f-5a1b2c3d4e5f', name: 'Pinecrest Foods', ownerId: 'c1a2b3c4-d5e6-4f70-8a9b-0c1d2e3f4a5b', archived: false, updatedAt: '2026-11-12T09:30:00.000Z' },
  record: { id: 'a7d9e1f2-3b4c-4d5e-8f60-1a2b3c4d5e6f', type: 'opportunity', name: 'Pinecrest renewal', accountId: '0b6f3f4e-58a1-4a8e-8d0f-5a1b2c3d4e5f', archived: false },
  comment: { id: 'e2f3a4b5-c6d7-4e8f-9a0b-1c2d3e4f5a6b', taskId: '6f1c2f0e-1b7a-4c53-9b61-0f2d6a3c9e11', body: 'Proposal sent, waiting for their answer.' },
  activity: { id: 'b3c4d5e6-f7a8-4b9c-8d0e-1f2a3b4c5d6e', accountId: '0b6f3f4e-58a1-4a8e-8d0f-5a1b2c3d4e5f', kind: 'call', body: 'Talked through the renewal terms.', happenedAt: '2026-11-12T09:00:00.000Z' },
};

/** Lists that fill a dropdown: where they come from and what is shown. */
const lists = {
  boards: { path: '/boards', pick: 'boards', label: 'name', noun: 'Board' },
  people: { path: '/people', pick: 'people', label: 'name', noun: 'Person' },
  accounts: { path: '/accounts?limit=100', pick: 'accounts', label: 'name', noun: 'Customer' },
};

/**
 * Things that start an automation. Curahold calls the tool's address within
 * seconds (a webhook the tool adds for itself and removes again); `recent`
 * gives a few real items to build with.
 */
const triggers = [
  { key: 'task_created', event: 'task.created', noun: 'Task', sample: 'task', label: 'New task', description: 'Starts when a task is opened.', recent: { path: '/tasks?assignee=me', pick: 'tasks' } },
  { key: 'task_updated', event: 'task.updated', noun: 'Task', sample: 'task', label: 'Task changed', description: 'Starts when a task changes: its column, people, date or anything else.', recent: { path: '/tasks?assignee=me', pick: 'tasks' } },
  { key: 'task_done', event: 'task.updated', onlyIf: 'done', noun: 'Task', sample: 'task', label: 'Task completed', description: 'Starts when a task reaches a done column.', recent: null },
  { key: 'account_created', event: 'account.created', noun: 'Customer', sample: 'account', label: 'New customer', description: 'Starts when a customer is added.', recent: { path: '/accounts?limit=3', pick: 'accounts' } },
  { key: 'account_updated', event: 'account.updated', noun: 'Customer', sample: 'account', label: 'Customer changed', description: 'Starts when a customer changes.', recent: { path: '/accounts?limit=3', pick: 'accounts' } },
  { key: 'record_created', event: 'record.created', noun: 'Record', sample: 'record', label: 'New record', description: 'Starts when a contact, opportunity or other record is added.', recent: null },
  { key: 'record_updated', event: 'record.updated', noun: 'Record', sample: 'record', label: 'Record changed', description: 'Starts when a contact, opportunity or other record changes.', recent: null },
  { key: 'comment_created', event: 'comment.created', noun: 'Comment', sample: 'comment', label: 'New comment', description: 'Starts when someone comments on a task.', recent: null },
  { key: 'activity_created', event: 'activity.created', noun: 'Activity', sample: 'activity', label: 'New note, call or meeting', description: "Starts when a note, call, meeting or email is logged on a customer's timeline.", recent: null },
];

const TASK_ID = { key: 'taskId', label: 'Task ID', required: true, inPath: true, help: 'The id of the task, for example from a "New task" step.' };
const ACCOUNT_ID = { key: 'accountId', label: 'Customer', required: true, inPath: true, list: 'accounts' };
const PRIORITY = { key: 'priority', label: 'Priority', choices: ['low', 'normal', 'high', 'urgent'] };
const DUE = { key: 'dueDate', label: 'Due date', date: true, help: 'YYYY-MM-DD' };

/**
 * Things an automation can do. `before` reads a value the change needs first
 * (a task is changed against the version that was read, so two edits at once
 * cannot overwrite each other without anyone noticing).
 */
const actions = [
  {
    key: 'create_task', noun: 'Task', sample: 'task', label: 'Create task', description: 'Opens a task on a board.', method: 'POST', path: '/tasks', pick: 'task',
    fields: [
      { key: 'boardId', label: 'Board', required: true, list: 'boards' },
      { key: 'title', label: 'Title', required: true },
      { key: 'description', label: 'Description', long: true },
      { key: 'assigneeIds', label: 'Assignees', list: 'people', many: true },
      { key: 'accountId', label: 'Customer', list: 'accounts' },
      DUE,
      PRIORITY,
    ],
  },
  {
    key: 'update_task', noun: 'Task', sample: 'task', label: 'Update task', description: 'Changes a task: its title, column, date or priority.', method: 'PATCH', path: '/tasks/{taskId}', pick: 'task',
    before: { path: '/tasks/{taskId}', set: 'baseVersion', from: 'task.version' },
    fields: [TASK_ID, { key: 'title', label: 'Title' }, { key: 'description', label: 'Description', long: true }, { key: 'status', label: 'Column', help: 'The key of a column on the task\'s board, for example "done".' }, DUE, PRIORITY],
  },
  {
    key: 'add_comment', noun: 'Comment', sample: 'comment', label: 'Comment on task', description: 'Writes a comment on a task.', method: 'POST', path: '/tasks/{taskId}/comments', pick: 'comment',
    fields: [TASK_ID, { key: 'body', label: 'Comment', required: true, long: true }],
  },
  {
    key: 'create_account', noun: 'Customer', sample: 'account', label: 'Create customer', description: 'Adds a customer.', method: 'POST', path: '/accounts', pick: 'account',
    fields: [{ key: 'name', label: 'Name', required: true }, { key: 'ownerId', label: 'Owner', list: 'people' }],
  },
  {
    key: 'update_account', noun: 'Customer', sample: 'account', label: 'Update customer', description: "Changes a customer's name or owner.", method: 'PATCH', path: '/accounts/{accountId}', pick: 'account',
    fields: [ACCOUNT_ID, { key: 'name', label: 'Name' }, { key: 'ownerId', label: 'Owner', list: 'people' }],
  },
  {
    key: 'log_activity', noun: 'Activity', sample: 'activity', label: 'Log note, call or meeting', description: "Writes a note, call, meeting or email on a customer's timeline.", method: 'POST', path: '/accounts/{accountId}/activities', pick: 'activity',
    fields: [ACCOUNT_ID, { key: 'kind', label: 'Kind', choices: ['note', 'call', 'meeting', 'email'] }, { key: 'body', label: 'What happened', required: true, long: true }, { key: 'happenedAt', label: 'When', datetime: true, help: 'Leave empty for now.' }],
  },
];

/** Things an automation can look up. */
const searches = [
  { key: 'find_account', noun: 'Customer', sample: 'account', label: 'Find customer', description: 'Finds a customer by name.', path: '/accounts', query: { q: 'name', limit: '5' }, pick: 'accounts', fields: [{ key: 'name', label: 'Name', required: true }] },
];

/** "/tasks/{taskId}" with the values filled in; the rest of the input is the body. */
function fill(path, input) {
  return path.replace(/\{(\w+)\}/g, (_, k) => encodeURIComponent(String(input[k] ?? '')));
}
/** The request body for an action: every field given, except those that went into the path. Dates lose their time of day. */
function bodyOf(action, input) {
  const out = {};
  for (const f of action.fields) {
    if (f.inPath) continue;
    let v = input[f.key];
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) continue;
    if (f.date) v = String(v).slice(0, 10);
    if (f.many && !Array.isArray(v)) v = [v];
    out[f.key] = v;
  }
  return out;
}
/** A value out of an answer by a dotted path: "task.version". */
const dig = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
/** What the person typed as the company's address, as a bare host name; anything else is refused so a key is never sent elsewhere. */
function hostOf(raw) {
  const host = String(raw ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host)) throw new Error('Enter your Curahold address, for example yourcompany.curahold.com');
  return host;
}

module.exports = { SAMPLES, lists, triggers, actions, searches, fill, bodyOf, dig, hostOf };
