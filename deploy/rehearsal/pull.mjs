import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cli, rehearsalInput } from './core.mjs';
import { docker } from './docker.mjs';

// Deliberate separate step: the harness itself never silently pulls/builds.
export async function pull(argv) {
  const local = argv.includes('--local-registry');
  const args = cli(argv.filter(arg => arg !== '--local-registry'), ['--input']);
  const input = rehearsalInput(JSON.parse(await readFile(args['--input'], 'utf8')), { local });
  for (const reference of new Set([...Object.values(input.images), ...Object.values(input.baseline), process.env.REHEARSAL_POSTGRES_IMAGE ?? 'postgres:18-alpine'])) {
    await docker(['pull', reference], { timeout: 600000 });
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try { await pull(process.argv.slice(2)); console.log('pinned rehearsal images pulled'); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
