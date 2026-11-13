// Linking code to tasks. A GitHub or GitLab webhook names branches, pull / merge requests, commits and check results;
// this turns each into the same few shapes (a link to record, or a check result to apply) and finds the task ids in
// their names, titles and messages. Pure functions: the route does the verifying and the writing.
import type { DevChecks, DevHost, DevLinkKind, DevLinkState } from '../../../shared/src/sync';

/** CURA-1a2b3c4d: the first 8 to 32 hex digits of a task id after "CURA-" — or a whole id, with or without dashes. */
const KEY = /(?<![0-9a-z])CURA-([0-9a-f]{8,32})(?![0-9a-z])/gi;
const UUID = /(?<![0-9a-f])[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?![0-9a-f])/gi;

/** Task references found in these texts, lowercased, once each. */
export function taskRefs(...texts: (string | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const t of texts) {
    if (!t) continue;
    for (const m of t.matchAll(KEY)) out.add(m[1].toLowerCase());
    for (const m of t.matchAll(UUID)) out.add(m[0].toLowerCase());
  }
  return [...out];
}

export interface DevEvent {
  provider: DevHost;
  kind: DevLinkKind;
  repo: string;
  ref: string;
  title: string;
  url: string | null;
  author: string | null;
  state: DevLinkState | null;
  headSha: string | null;
  checks: DevChecks;
  /** Where to look for task ids. */
  texts: string[];
}

export interface ChecksEvent {
  provider: DevHost;
  repo: string;
  sha: string;
  checks: DevChecks;
}

export interface Parsed {
  links: DevEvent[];
  checks: ChecksEvent[];
}

const firstLine = (s: unknown) => String(s ?? '').split('\n')[0].trim().slice(0, 300);
const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
const ZEROS = /^0+$/;
const branchOf = (ref: unknown) => (typeof ref === 'string' && ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : null);

function branchLink(provider: DevHost, repo: string, branch: string, url: string | null, state: DevLinkState, author: string | null, sha: string | null): DevEvent {
  return { provider, kind: 'branch', repo, ref: branch, title: branch, url, author, state, headSha: sha, checks: 'none', texts: [branch] };
}

// ------------------------------------------------------------------- GitHub

/** GitHub's conclusions and statuses in three words. */
export function githubChecks(status: unknown, conclusion: unknown): DevChecks {
  const s = String(status ?? '').toLowerCase();
  const c = String(conclusion ?? '').toLowerCase();
  if (s && s !== 'completed') return 'pending';
  if (['success', 'neutral', 'skipped'].includes(c)) return 'passing';
  if (['failure', 'timed_out', 'cancelled', 'action_required', 'startup_failure', 'stale'].includes(c)) return 'failing';
  return 'none';
}

export function parseGithub(event: string, p: any): Parsed {
  const out: Parsed = { links: [], checks: [] };
  const repo = str(p?.repository?.full_name);
  if (!repo) return out;
  const web = str(p.repository.html_url);
  switch (event) {
    case 'push': {
      const branch = branchOf(p.ref);
      const who = str(p.pusher?.name) ?? str(p.sender?.login);
      if (branch) out.links.push(branchLink('github', repo, branch, web ? `${web}/tree/${encodeURI(branch)}` : null, p.deleted ? 'closed' : 'open', who, str(p.after)));
      // Commits on a deleted branch are not repeated; a push carries at most 20 of them.
      if (!p.deleted) {
        for (const c of Array.isArray(p.commits) ? p.commits.slice(0, 50) : []) {
          if (!c?.id) continue;
          out.links.push({ provider: 'github', kind: 'commit', repo, ref: String(c.id), title: firstLine(c.message), url: str(c.url), author: str(c.author?.name) ?? str(c.author?.username), state: null, headSha: String(c.id), checks: 'none', texts: [String(c.message ?? '')] });
        }
      }
      break;
    }
    case 'create':
    case 'delete': {
      if (p.ref_type === 'branch' && str(p.ref)) out.links.push(branchLink('github', repo, p.ref, web ? `${web}/tree/${encodeURI(p.ref)}` : null, event === 'delete' ? 'closed' : 'open', str(p.sender?.login), null));
      break;
    }
    case 'pull_request': {
      const pr = p.pull_request;
      if (!pr?.number) break;
      const state: DevLinkState = pr.merged ? 'merged' : pr.state === 'closed' ? 'closed' : 'open';
      out.links.push({
        provider: 'github',
        kind: 'pr',
        repo,
        ref: String(pr.number),
        title: String(pr.title ?? '').slice(0, 500),
        url: str(pr.html_url),
        author: str(pr.user?.login),
        state,
        headSha: str(pr.head?.sha),
        checks: 'none',
        texts: [String(pr.head?.ref ?? ''), String(pr.title ?? ''), String(pr.body ?? '')],
      });
      break;
    }
    case 'check_suite': {
      const cs = p.check_suite;
      if (cs?.head_sha) out.checks.push({ provider: 'github', repo, sha: String(cs.head_sha), checks: githubChecks(cs.status, cs.conclusion) });
      break;
    }
    case 'status': {
      if (p.sha) out.checks.push({ provider: 'github', repo, sha: String(p.sha), checks: p.state === 'success' ? 'passing' : p.state === 'pending' ? 'pending' : p.state === 'failure' || p.state === 'error' ? 'failing' : 'none' });
      break;
    }
  }
  return out;
}

// ------------------------------------------------------------------- GitLab

export function gitlabChecks(status: unknown): DevChecks {
  switch (String(status ?? '').toLowerCase()) {
    case 'success':
      return 'passing';
    case 'failed':
    case 'canceled':
    case 'cancelled':
      return 'failing';
    case 'created':
    case 'waiting_for_resource':
    case 'preparing':
    case 'pending':
    case 'running':
    case 'scheduled':
      return 'pending';
    default:
      return 'none';
  }
}

export function parseGitlab(p: any): Parsed {
  const out: Parsed = { links: [], checks: [] };
  const repo = str(p?.project?.path_with_namespace);
  if (!repo) return out;
  const web = str(p.project.web_url);
  switch (p.object_kind) {
    case 'push': {
      const branch = branchOf(p.ref);
      const deleted = typeof p.after === 'string' && ZEROS.test(p.after);
      const who = str(p.user_username) ?? str(p.user_name);
      if (branch) out.links.push(branchLink('gitlab', repo, branch, web ? `${web}/-/tree/${encodeURI(branch)}` : null, deleted ? 'closed' : 'open', who, deleted ? null : str(p.after)));
      if (!deleted) {
        for (const c of Array.isArray(p.commits) ? p.commits.slice(0, 50) : []) {
          if (!c?.id) continue;
          out.links.push({ provider: 'gitlab', kind: 'commit', repo, ref: String(c.id), title: firstLine(c.message), url: str(c.url), author: str(c.author?.name), state: null, headSha: String(c.id), checks: 'none', texts: [String(c.message ?? '')] });
        }
      }
      break;
    }
    case 'merge_request': {
      const a = p.object_attributes;
      if (!a?.iid) break;
      const state: DevLinkState = a.state === 'merged' ? 'merged' : a.state === 'closed' ? 'closed' : 'open';
      out.links.push({
        provider: 'gitlab',
        kind: 'pr',
        repo,
        ref: String(a.iid),
        title: String(a.title ?? '').slice(0, 500),
        url: str(a.url),
        author: str(p.user?.username),
        state,
        headSha: str(a.last_commit?.id),
        checks: 'none',
        texts: [String(a.source_branch ?? ''), String(a.title ?? ''), String(a.description ?? '')],
      });
      break;
    }
    case 'pipeline': {
      const a = p.object_attributes;
      if (a?.sha) out.checks.push({ provider: 'gitlab', repo, sha: String(a.sha), checks: gitlabChecks(a.status) });
      break;
    }
  }
  return out;
}

// ------------------------------------------------------------------ signatures

/** "pending" beats "passing", "failing" beats both: what a card shows for several pull requests. */
export function worstChecks(list: DevChecks[]): DevChecks {
  for (const c of ['failing', 'pending', 'passing'] as const) if (list.includes(c)) return c;
  return 'none';
}
