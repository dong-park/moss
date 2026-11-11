import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { canonical, checkedFetch, Evidence, fingerprint, pinnedImages, publicConfig, sha256, smokeArgs, smokeConfig } from '../../deploy/rehearsal/core.mjs';
import { containerIdentity, imageIdentity } from '../../deploy/rehearsal/docker.mjs';
import { imageAssets } from '../../deploy/rehearsal/assets.mjs';
import { createClient } from '../../deploy/rehearsal/client.mjs';

export async function smoke(argv, env = process.env, runtime = {}) {
  const args = smokeArgs(argv);
  const raw = JSON.parse(await readFile(args['--config'], 'utf8'));
  // Credentials come only from the protected config, never tokens minted by this script.
  const credentials = smokeConfig(raw), config = publicConfig(raw.public_config);
  if (raw.assets !== undefined) throw new Error('operator asset hashes are not accepted');
  const runId = `smoke-${randomUUID()}`, e = new Evidence('production-smoke', args['--sha'] ?? null, runId);
  Object.assign(e.data, { sha: args['--sha'] ?? null, legacy_baseline: args.legacy, config_sha256: sha256(canonical(config)) });
  let client;
  const keyA = `${runId}-a`, keyB = `${runId}-b`, offline = `${runId}-offline`;
  try {
    const identities = await e.phase('running_image_identity', async () => {
      const images = raw.images ? pinnedImages(raw.images) : null, identities = {};
      for (const service of ['web', 'server', 'sync']) {
        const name = raw.containers?.[service];
        if (typeof name !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]+$/.test(name)) throw new Error('running container identity required');
        const actual = await containerIdentity(name);
        if (!actual.State.Running) throw new Error('service container is not running');
        const expected = await imageIdentity(images?.[service] ?? actual.Image);
        if (actual.Image !== expected.id) throw new Error('running image mismatch');
        identities[service] = { ...expected, containerId: actual.Id };
      }
      e.data.identities = identities;
      return identities;
    });
    const extracted = await e.phase('image_static_assets', () => imageAssets(identities.web.id, runId));
    e.data.public = await e.phase('public_identity', () => fingerprint(raw.web_url, { revision: args['--sha'], assets: extracted.assets, htmlPaths: raw.html_paths }, { legacy: args.legacy }));
    await e.phase('api_health', async () => {
      const health = await (await checkedFetch(`${config.api_url}/health`)).json();
      if (health.status !== 'ok') throw new Error('API not healthy');
      return health;
    });
    client = await createClient(env.MOSS_CLIENT_PACKAGE ?? fileURLToPath(new URL('../../web/package.json', import.meta.url)), runtime.packages);
    await e.phase('normal_auth', () => client.run('init', { api: config.api_url, sync: config.sync_url, ...credentials, signup: false }));
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
    e.finish(['running_image_identity', 'image_static_assets', 'public_identity', 'api_health', 'normal_auth', 'two_clients', 'sync_persistence', 'reconnect_offline', 'cleanup']);
  } catch (error) {
    error.evidence = e.data;
    throw error;
  } finally {
    try { await client?.close(); }
    catch (error) { e.data.status = 'failed'; throw error; }
    finally {
      // The caller can capture stdout; an optional fresh private evidence path is also supported.
      if (env.MOSS_SMOKE_EVIDENCE) await writeFile(env.MOSS_SMOKE_EVIDENCE, JSON.stringify(e.data, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    }
  }
  return e.data;
}
