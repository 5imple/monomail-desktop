// Runs the M365 pure-logic unit tests. The repo has no TS test runner, so we
// bundle each *.test.ts with esbuild (resolving the @/ alias and stubbing
// dompurify so the transform module is DOM-free) and run the output under
// `node --test`. Invoke via `npm run test:m365`.
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readdirSync, rmSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const outdir = join(here, '.build');

rmSync(outdir, { recursive: true, force: true });

const entryPoints = readdirSync(here)
  .filter((f) => f.endsWith('.test.ts'))
  .map((f) => join(here, f));

await build({
  entryPoints,
  bundle: true,
  platform: 'node',
  format: 'esm',
  outdir,
  outExtension: { '.js': '.mjs' },
  alias: {
    // Most specific first: the apiClient stub lets integration tests drive the
    // real provider against canned Graph responses. electron-log + dompurify are
    // stubbed so the provider (and its transform chain) bundle DOM/electron-free.
    '@/main/api/apiClient': join(here, 'stubs', 'apiClient.mjs'),
    '@': join(root, 'src'),
    dompurify: join(here, 'stubs', 'dompurify.mjs'),
    'electron-log': join(here, 'stubs', 'electron-log.mjs')
  },
  logLevel: 'warning'
});

const built = readdirSync(outdir)
  .filter((f) => f.endsWith('.test.mjs'))
  .map((f) => join(outdir, f));

const result = spawnSync(process.execPath, ['--test', ...built], { stdio: 'inherit' });
process.exit(result.status ?? 1);
