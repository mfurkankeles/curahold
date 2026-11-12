// Builds the self-hosted server (api/src/selfhost.ts) into one file,
// dist/server/selfhost.mjs, with every library inside: the Docker image then
// needs Node and the built app, not node_modules.
//   npm run build:server
import { build } from 'esbuild';

await build({
  entryPoints: ['api/src/selfhost.ts'],
  outfile: 'dist/server/selfhost.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  legalComments: 'linked',
  // Libraries written for require() (the mail sender) still find Node's own modules.
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
  logLevel: 'warning',
});
console.log('dist/server/selfhost.mjs');
