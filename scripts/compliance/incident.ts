// The personal-data breach log, for the operator (docs/compliance/breach-runbook.md,
// migration 0244). Append-only: a correction is a new entry with --corrects.
//
//   DATABASE_URL=postgres://… npx tsx scripts/compliance/incident.ts add --by ops@demo.example --severity sev2 \
//     --detected 2026-11-20T09:00Z --aware 2026-11-20T09:30Z --summary "What happened" --kinds email,name \
//     --companies 1 --people 12 --laws kvkk,gdpr --notified '[{"to":"controller","at":"2026-11-20T15:00Z"}]' --actions "What was done"
//   DATABASE_URL=postgres://… npx tsx scripts/compliance/incident.ts list
//
// The clock that matters is --aware (when we knew it was a personal-data breach): every notification deadline in the runbook runs from it.
import { postgresDb } from '../../api/src/db/postgres';

const [cmd, ...rest] = process.argv.slice(2);
const arg = (name: string) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
};
const list = (v?: string) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);

const url = process.env.DATABASE_URL;
if (!url || !cmd || !['add', 'list'].includes(cmd)) {
  console.error('Usage: DATABASE_URL=… npx tsx scripts/compliance/incident.ts add|list [options] (see the header of this file)');
  process.exit(1);
}
const db = postgresDb(url, { max: 1 });
try {
  if (cmd === 'list') {
    const rows = await db.system((q) => q.query(`select ref, aware_at, severity, summary, people, laws, notified, corrects from incident_log order by recorded_at`));
    for (const r of rows) console.log(`${r.ref}  ${new Date(r.aware_at).toISOString()}  ${r.severity}  people=${r.people ?? '?'}  laws=${(r.laws ?? []).join('/')}  ${r.summary}`);
  } else {
    const need = ['by', 'severity', 'detected', 'aware', 'summary'].filter((k) => !arg(k));
    if (need.length) throw new Error(`missing --${need.join(', --')}`);
    const [row] = await db.system((q) =>
      q.query(
        `insert into incident_log (recorded_by, severity, detected_at, aware_at, summary, data_kinds, companies, people, laws, notified, not_notified_reason, actions, corrects)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, (select id from incident_log where ref = $13)) returning ref`,
        [arg('by'), arg('severity'), arg('detected'), arg('aware'), arg('summary'), list(arg('kinds')), arg('companies') ?? null, arg('people') ?? null, list(arg('laws')), arg('notified') ?? '[]', arg('not-notified-reason') ?? null, arg('actions') ?? null, arg('corrects') ?? null],
      ),
    );
    console.log(`recorded ${row.ref}`);
  }
} finally {
  await db.close();
}
