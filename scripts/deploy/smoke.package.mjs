import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, writeFile, rm, copyFile, constants } from 'node:fs/promises';
import { dirname, resolve, join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { cli, sha256 } from '../../deploy/rehearsal/core.mjs';
const exec = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));

export async function pack(argv) {
  const args = cli(argv, ['--output', '--package']);
  const destination = resolve(args['--output']), root = resolve(here, '../..');
  if (!relative(root, destination).startsWith('..')) throw new Error('bundle output must be outside repository');
  const require = createRequire(resolve(args['--package']));
  const yjs = require.resolve('yjs'), provider = require.resolve('@hocuspocus/provider');
  const work = await mkdtemp(join(tmpdir(), 'moss-smoke-package-'));
  try {
    const entry = join(work, 'entry.mjs');
    await writeFile(entry, `import * as Y from ${JSON.stringify(yjs)};\nimport { HocuspocusProvider, HocuspocusProviderWebsocket } from ${JSON.stringify(provider)};\nimport { smoke } from ${JSON.stringify(join(here, 'smoke.mjs'))};\ntry { console.log(JSON.stringify(await smoke(process.argv.slice(2), process.env, { packages: { Y, HocuspocusProvider, HocuspocusProviderWebsocket } }))); } catch (error) { if (error?.evidence) console.log(JSON.stringify(error.evidence)); console.error('production smoke failed'); process.exitCode = 1; }\n`);
    await exec(process.env.BUN_BIN ?? 'bun', ['build', '--target=bun', '--format=esm', '--outfile', join(work, 'smoke.mjs'), entry], { maxBuffer: 1024 * 1024 });
    const bundle = await readFile(join(work, 'smoke.mjs'));
    await writeFile(join(work, 'smoke'), '#!/bin/sh\nset -eu\nexec "${BUN_BIN:-bun}" "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/smoke.mjs" "$@"\n', { mode: 0o755 });
    const packageHash = sha256(await readFile(resolve(args['--package'])));
    await writeFile(join(work, 'manifest.json'), JSON.stringify({ schemaVersion: 1, entrypoint: 'smoke', runtime: 'bun', self_contained: true, bundle_sha256: sha256(bundle), source_package_sha256: packageHash }, null, 2) + '\n');
    const archive = join(work, 'runtime.tar.gz');
    await exec('tar', ['-C', work, '-czf', archive, 'smoke', 'smoke.mjs', 'manifest.json']);
    await copyFile(archive, destination, constants.COPYFILE_EXCL);
    return { output: destination, sha256: sha256(await readFile(archive)), bundle_sha256: sha256(bundle) };
  } finally { await rm(work, { recursive: true }); }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try { console.log(JSON.stringify(await pack(process.argv.slice(2)))); }
  catch (error) { console.error(`smoke packaging failed: ${error.message}`); process.exitCode = 1; }
}
