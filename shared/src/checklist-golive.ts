// The go-live items of the checklist (shared/src/checklist.ts merges them in):
// what docs/go-live/README.tr.md walks through, step by step, each with who
// does it, its cost, what must come first, and its evidence — what to paste
// into the console's evidence field (a command's output, a screen, a file).
// Words: owner console dictionaries, `checklist.<id>.*`.
import type { ChecklistItem } from './checklist';

const GUIDE = 'docs/go-live/README.tr.md';

/** New items, placed after the technical ones. */
export const GO_LIVE_ITEMS: ChecklistItem[] = [
  { id: 'wildcard-dns', area: 'technical', priority: 'must', owner: 'owner', cost: null, after: ['cloudflare-account'], links: [`${GUIDE}#adim-6`], proof: 'dig +short anything.curahold.com → Cloudflare addresses' },
  { id: 'r2-storage', area: 'technical', priority: 'must', owner: 'owner', cost: null, after: ['cloudflare-account'], links: [`${GUIDE}#adim-12`], proof: 'npx wrangler r2 bucket list → curahold-files, curahold-backups' },
  { id: 'worker-secrets', area: 'technical', priority: 'must', owner: 'owner', cost: null, after: ['database-hosting', 'email-provider'], links: [`${GUIDE}#adim-14`, 'docs/ENVIRONMENT.md'], proof: 'npx wrangler secret list (names only)' },
  { id: 'turnstile', area: 'technical', priority: 'must', owner: 'owner', cost: null, after: ['cloudflare-account'], links: [`${GUIDE}#adim-16`], proof: 'the trial form shows the check' },
  { id: 'llm-key', area: 'technical', priority: 'nice', owner: 'owner', cost: { monthly: 40 }, links: [`${GUIDE}#adim-15`], proof: 'console → Ekip: a chat answers' },
  { id: 'team-scheduler', area: 'technical', priority: 'nice', owner: 'claude', cost: null, after: ['llm-key'], links: [`${GUIDE}#adim-15`, 'api/src/team/schedule.ts'], proof: 'console → Ekip: last wake time, wrangler tail "team tick"' },
  { id: 'staging-smoke', area: 'technical', priority: 'must', owner: 'claude', cost: null, after: ['migrations-runbook', 'worker-secrets'], links: [`${GUIDE}#adim-18`, 'scripts/synthetic.ts', 'scripts/load.ts'], proof: 'synthetic check: every line "up"; load.ts p95 and 0 refusals' },
  { id: 'launch-switches', area: 'technical', priority: 'must', owner: 'claude', cost: null, after: ['staging-smoke'], links: [`${GUIDE}#adim-21`], proof: 'wrangler.toml [vars]: SIGNUP_MODE, PADDLE_ENV=live' },
  { id: 'offsite-backup', area: 'technical', priority: 'must', owner: 'claude', cost: null, after: ['backups-restore', 'r2-storage'], links: [`${GUIDE}#adim-25`, 'scripts/backup/backup.ts'], proof: 'curahold-backups: this week’s .dump.enc + manifest' },
  { id: 'rollback-plan', area: 'technical', priority: 'must', owner: 'claude', cost: null, links: [`${GUIDE}#adim-27`, 'docs/RUNBOOK.md'], proof: 'npx wrangler deployments list → the previous version id noted' },
  { id: 'bot-fight-watch', area: 'technical', priority: 'must', owner: 'owner', cost: null, after: ['go-live'], links: [`${GUIDE}#adim-23`, 'docs/RUNBOOK.md'], proof: '48 h of Security → Events: no challenge on /api/, /mcp, webhooks' },
  { id: 'pitr', area: 'technical', priority: 'later', owner: 'owner', cost: { monthly: 105 }, trigger: { kind: 'payingAtLeast', n: 1, days: 31 }, links: ['docs/RUNBOOK.md'], proof: 'database settings: point-in-time recovery on' },
  { id: 'upload-virus-scan', area: 'technical', priority: 'later', owner: 'owner', cost: null, trigger: { kind: 'manual' }, links: ['api/src/lib/uploadScan.ts', 'docs/RUNBOOK.md'], proof: 'a test file (EICAR) is held, then deleted' },
];

/** What the existing items' evidence is, now that the go-live tooling exists. */
export const GO_LIVE_EVIDENCE: Record<string, { proof: string; links?: string[] }> = {
  domain: { proof: 'registrar: auto-renew on, WHOIS privacy on, 2FA on', links: [`${GUIDE}#adim-1`] },
  'cloudflare-account': { proof: 'Cloudflare: zone "Active", 2FA on', links: [`${GUIDE}#adim-4`] },
  'dns-records': { proof: 'dig +short app.curahold.com / MX curahold.com', links: [`${GUIDE}#adim-6`] },
  'database-hosting': { proof: 'database region: EU (Frankfurt)', links: [`${GUIDE}#adim-11`] },
  'migrations-runbook': { proof: 'npm run migrate → "up to date"', links: [`${GUIDE}#adim-17`, 'docs/RUNBOOK.md'] },
  'email-provider': { proof: 'Google Workspace: the domain verified', links: [`${GUIDE}#adim-8`] },
  'email-auth': { proof: 'a test mail: SPF=pass DKIM=pass DMARC=pass', links: [`${GUIDE}#adim-9`] },
  'backups-restore': { proof: 'scripts/backup/restore-drill.ts → "drill PASSED in … s"', links: [`${GUIDE}#adim-25`, 'scripts/backup/restore-drill.ts'] },
  monitoring: { proof: 'scripts/synthetic.ts all "up"; one test alert in the console', links: [`${GUIDE}#adim-24`, 'api/src/lib/ops.ts'] },
  'status-page': { proof: 'status.curahold.com shows every line', links: [`${GUIDE}#adim-24`, 'tools/status-page/index.html'] },
  'security-txt': { proof: 'curl https://app.curahold.com/.well-known/security.txt' },
  'go-live': { proof: 'the deploy verification checklist, every line', links: [`${GUIDE}#adim-21`] },
};

/** Items "go-live" now also waits for. */
export const GO_LIVE_AFTER = ['worker-secrets', 'staging-smoke', 'launch-switches', 'monitoring'];
