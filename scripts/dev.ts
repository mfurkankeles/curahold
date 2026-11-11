// Local development: API on :8787 (embedded Postgres + demo company) and the
// Vite dev server on :5173. Open http://demo.localhost:5173 and sign in as
// ada@demo.example — the sign-in link is printed in this terminal.
import { spawn } from 'node:child_process';

const procs = [
  spawn('npx', ['tsx', 'watch', 'api/src/node.ts'], { stdio: 'inherit', env: { ...process.env, PORT: '8787' } }),
  spawn('npx', ['vite'], { stdio: 'inherit' }),
];
const stop = () => procs.forEach((p) => p.kill('SIGTERM'));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
