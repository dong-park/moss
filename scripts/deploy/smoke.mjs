import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { canonical, checkedFetch, Evidence, fingerprint, pinnedImages, publicConfig, sha256, smokeArgs, smokeConfig } from '../../deploy/rehearsal/core.mjs';
import { docker, imageIdentity } from '../../deploy/rehearsal/docker.mjs';
import { createClient } from '../../deploy/rehearsal/client.mjs';

export async function smoke(argv, env = process.env) {
  const args = smokeArgs(argv);
  const raw = JSON.parse(await readFile(args['--config'], 'utf8'));
  const config = publicConfig({ ...raw, sha: args['--sha'] });
  const credentials = smokeConfig({ ...env, MOSS_SMOKE_API_URL: config.api, MOSS_SMOKE_SYNC_URL: config.sync, MOSS_SMOKE_WEB_URL: config.web, MOSS_SMOKE_REVISION: args['--sha'] ?? 'legacy-baseline', MOSS_SMOKE_FINGERPRINT: args['--config'] });
  const runId = `smoke-${randomUUID()}`, e = new Evidence('production-smoke', args['--sha'], runId);
  e.data.sha = args['--sha'] ?? null; e.data.legacy_baseline = args.legacy; e.data.config_sha256 = sha256(canonical(raw));
  let client;
  const keyA = `${runId}-a`, keyB = `${runId}-b`, offline = `${runId}-offline`;
  try {
    if (args.legacy) {
      await e.phase('legacy_image_identity', async () => {
        const images = pinnedImages(raw.legacy_images), identities = {};
        for (const service of ['web', 'server', 'sync']) {
          const name = raw.legacy_containers?.[service];
          if (typeof name !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]+$/.test(name)) throw new Error('legacy container identity required');
          const expected = await imageIdentity(images[service]);
          const [actual] = JSON.parse(await docker(['inspect', name]));
          if (!actual.State.Running || actual.Image !== expected.id) throw new Error('legacy running image mismatch');
          identities[service] = { ...expected, containerId: actual.Id };
        }
        e.data.identities = identities; e.data.images = images;
        return { exactRunningImages: true };
      });
    }
    e.data.public = await e.phase('public_identity', () => fingerprint(config.web, config.expected, { legacy: args.legacy }));
    await e.phase('api_health', async () => {
      const health = await (await checkedFetch(`${config.api}/health`)).json();
      if (health.status !== 'ok') throw new Error('API not healthy');
      return health;
    });
    client = await createClient(env.MOSS_CLIENT_PACKAGE ?? fileURLToPath(new URL('../../web/package.json', import.meta.url)));
    await e.phase('normal_auth', () => client.run('init', { ...config, ...credentials, signup: false }));
    await e.phase('two_clients', async () => {
      await client.run('pair');
      await client.run('write', { index: 0, key: keyA, value: runId });
      await client.run('write', { index: 1, key: keyB, value: runId });
      return client.run('assert', { values: { [keyA]: runId, [keyB]: runId } });
    });
    await e.phase('sync_persistence', async () => {
      await client.run('close'); await client.run('pair');
      return client.run('assert', { values: { [keyA]: runId, [keyB]: runId } });
    });
    await e.phase('reconnect_offline', async () => {
      await client.run('offline');
      await client.run('write', { index: 1, key: offline, value: runId });
      await client.run('online');
      await client.run('assert', { values: { [keyA]: runId, [keyB]: runId, [offline]: runId } });
      await client.run('close'); await client.run('pair');
      return client.run('assert', { values: { [offline]: runId } });
    });
    await e.phase('cleanup', async () => { const proof = await client.run('clean'); await client.close(); return proof; });
    e.finish(['public_identity', 'api_health', 'normal_auth', 'two_clients', 'sync_persistence', 'reconnect_offline', 'cleanup']);
  } finally {
    try { await client?.close(); }
    finally { await writeFile(credentials.output, JSON.stringify(e.data, null, 2) + '\n', { mode: 0o600, flag: 'wx' }); }
  }
  return e.data;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try { await smoke(process.argv.slice(2)); console.log('production smoke passed'); }
  catch (error) { console.error(`production smoke failed: ${error.message}`); process.exitCode = 1; }
}
