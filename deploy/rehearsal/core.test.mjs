import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fingerprint, sha256, smokeConfig, Evidence, endpoint } from './core.mjs';

test('production smoke fails closed before contacting services without dedicated credentials', () => {
  assert.throws(() => smokeConfig({}), /dedicated smoke account/);
  assert.throws(() => smokeConfig({ dedicated_account: true }), /email/);
});
test('endpoint refuses credentials and non-network protocols', () => {
  for (const value of ['https://a:b@example.com', 'file:///tmp/a', 'https://a?token=x']) assert.throws(() => endpoint(value));
});
test('a missing mandatory phase cannot become success', async () => {
  const e = new Evidence('rehearsal', 'a'.repeat(40), 'unit');
  await e.phase('auth', async () => ({ normal: true }));
  assert.throws(() => e.finish(['auth', 'restore']), /missing/);
  await assert.rejects(e.phase('restore', async () => { throw new Error('bad restore'); }), /bad restore/);
  assert.equal(e.data.status, 'failed');
});
test('public fingerprint rejects empty asset proof, wrong revision and changed asset bytes', async t => {
  const revision = 'a'.repeat(40);
  const server = createServer((req, res) => { res.end(req.url === '/api/deployment' ? JSON.stringify({ sha: revision, status: 'ready' }) : req.url === '/' ? '<script src="/_next/static/a.js"></script>' : 'actual'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  await assert.rejects(fingerprint(url, { revision, assets: [] }), /asset proof/);
  await assert.rejects(fingerprint(url, { revision: 'b'.repeat(40), assets: [{ path: '/_next/static/a.js', sha256: sha256('actual') }] }), /identity mismatch/);
  await assert.rejects(fingerprint(url, { revision, assets: [{ path: '/_next/static/a.js', sha256: sha256('wrong') }] }), /hash mismatch/);
  const proof = await fingerprint(url, { revision, assets: [{ path: '/_next/static/a.js', sha256: sha256('actual') }] });
  assert.equal(proof.assets.length, 1);
});

test('GHCR references require immutable digests for all three services', async () => {
  const { pinnedImages } = await import('./core.mjs');
  const images = Object.fromEntries(['web', 'server', 'sync'].map(s => [s, `ghcr.io/dong-park/moss-deploy-${s}@sha256:${'a'.repeat(64)}`]));
  assert.deepEqual(pinnedImages(images), images);
  for (const value of ['ghcr.io/dong-park/moss-deploy-server:latest', 'postgres:18', 'sha256:' + 'a'.repeat(64)]) assert.throws(() => pinnedImages({ ...images, server: value }), /pinned GHCR server/);
});
test('GHCR mode accepts only the three fixed private repositories; retired public and other names are rejected', async () => {
  const { pinnedImages } = await import('./core.mjs');
  const digest = `@sha256:${'a'.repeat(64)}`;
  const images = Object.fromEntries(['web', 'server', 'sync'].map(s => [s, `ghcr.io/dong-park/moss-deploy-${s}${digest}`]));
  for (const service of ['web', 'server', 'sync']) {
    const other = service === 'web' ? 'sync' : 'web';
    for (const repository of [`ghcr.io/dong-park/moss-${service}`, `ghcr.io/example/moss-${service}`, 'ghcr.io/example/moss',
      `ghcr.io/dong-park/moss-deploy-${other}`, `ghcr.io/evil/moss-deploy-${service}`, `ghcr.io/dong-park/moss-deploy-${service}-x`,
      `ghcr.io/dong-park/moss-deploy-${service}/x`, `ghcr.io/dong-park/x/moss-deploy-${service}`, `docker.io/dong-park/moss-deploy-${service}`]) {
      assert.throws(() => pinnedImages({ ...images, [service]: repository + digest }), new RegExp(`pinned GHCR ${service}`), repository);
    }
  }
});
test('canonical public config hash ignores object key order, preserves array order', async () => {
  const { canonical } = await import('./core.mjs');
  assert.equal(canonical({ b: { y: 2, x: 1 }, a: [3, 4] }), canonical({ a: [3, 4], b: { x: 1, y: 2 } }));
  assert.notEqual(canonical({ a: [3, 4] }), canonical({ a: [4, 3] }));
});
test('compose fixture has no build, production binds, external resources or copied credentials', async () => {
  const { composeSpec } = await import('./run.mjs');
  const spec = composeSpec({ images: { postgres: 'sha256:pg', web: 'sha256:web', server: 'sha256:server', sync: 'sha256:sync' }, secret: 'unique-secret', password: 'unique-password', terms: 'test', runId: 'moss-rehearsal-unit' });
  for (const service of Object.values(spec.services)) {
    assert.equal(service.build, undefined);
    assert.equal(service.container_name, undefined);
    assert.equal(service.labels['com.moss.rehearsal'], 'moss-rehearsal-unit');
    for (const port of service.ports ?? []) { assert.equal(port.host_ip, '127.0.0.1'); assert.equal(port.published, '0'); }
  }
  assert.equal(spec.services.postgres.ports, undefined);
  assert.equal(spec.networks.default.internal, true);
  assert.deepEqual(spec.services.server.networks,['default','edge']);
  assert.deepEqual(spec.services.web.networks,['default','edge']);
  assert.equal(spec.services.postgres.networks,undefined);
  assert.equal(spec.services.sync.networks,undefined);
  assert.equal(spec.services.server.environment.DATABASE_PASSWORD, 'unique-password');
  for (const volume of Object.values(spec.volumes)) assert.equal(volume.external, undefined);
  const restored = composeSpec({ images: {}, secret: 's', password: 'p', terms: 't', restored: true, runId: 'owned' });
  assert.match(restored.services.server.environment.DATABASE_URL, /restored:5432/);
  assert.deepEqual(restored.services.server.volumes, ['restored_files:/data/files']);
});

test('legacy CLI is explicit and cannot be mixed with an inferred SHA', async () => {
  const { smokeArgs } = await import('./core.mjs');
  assert.equal(smokeArgs(['--legacy-baseline', '--config', 'public.json']).legacy, true);
  assert.equal(smokeArgs(['--sha', 'a'.repeat(40), '--config', 'public.json']).legacy, false);
  assert.throws(() => smokeArgs(['--legacy-baseline', '--sha', 'a'.repeat(40), '--config', 'public.json']));
  assert.throws(() => smokeArgs(['--config', 'public.json']));
});
test('legacy fingerprint verifies assets without inventing a revision', async t => {
  const server = createServer((req, res) => {
    if (req.url === '/api/deployment') { res.statusCode = 404; res.end(); }
    else res.end(req.url === '/' ? '<script src="/_next/static/old.js"></script>' : 'old-client');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const proof = await fingerprint(base, { assets: [{ path: '/_next/static/old.js', sha256: sha256('old-client') }] }, { legacy: true });
  assert.equal(proof.buildIdentity, null);
  await assert.rejects(fingerprint(base, { assets: [{ path: '/_next/static/unreferenced.js', sha256: sha256('old-client') }] }, { legacy: true }), /HTML asset proof incomplete/);
});
