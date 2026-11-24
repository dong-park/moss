import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicConfig, canonical, sha256 } from './core.mjs';

test('release fingerprint is exactly the four public fields, never smoke runtime data', () => {
  const value = { api_url: 'https://api.example.com', sync_url: 'wss://sync.example.com', google_client_id: '', terms_version: '2026-11' };
  assert.equal(sha256(canonical(publicConfig(value))), sha256(canonical(value)));
  assert.throws(() => publicConfig({ ...value, web_url: 'https://web.example.com' }), /exact public config/);
});

test('canonical JSON matches ASCII Python encoding even for Unicode values', () => {
  assert.equal(canonical({ terms_version: '동😀' }), '{"terms_version":"\\ub3d9\\ud83d\\ude00"}');
});
test('local registry option accepts only the exact loopback moss service repositories', async () => {
  const { pinnedImages } = await import('./core.mjs');
  const images = Object.fromEntries(['web', 'server', 'sync'].map(s => [s, `127.0.0.1:52345/moss-${s}@sha256:${'f'.repeat(64)}`]));
  assert.deepEqual(pinnedImages(images, { local: true }), images);
  assert.throws(() => pinnedImages(images), /GHCR/);
  for (const invalid of ['localhost:52345/moss-web', '127.0.0.1:52345/other-web', '127.0.0.1:52345/moss-sync', '127.0.0.1:99999/moss-web', '10.0.0.1:52345/moss-web']) {
    assert.throws(() => pinnedImages({ ...images, web: invalid + '@sha256:' + 'f'.repeat(64) }, { local: true }), /local registry/);
  }
});
test('input validates supplied config hash and never invents a legacy baseline SHA', async () => {
  const { rehearsalInput } = await import('./core.mjs');
  const images = Object.fromEntries(['web', 'server', 'sync'].map(s => [s, `ghcr.io/dong-park/moss-deploy-${s}@sha256:${'f'.repeat(64)}`]));
  const config = { api_url: 'https://api.example.com', sync_url: 'wss://sync.example.com', google_client_id: '', terms_version: '2026-11' };
  const value = { sha: 'a'.repeat(40), images, baseline: images, baseline_sha: null, legacy_baseline: true, public_config: config, config_sha256: sha256(canonical(config)) };
  assert.equal(rehearsalInput(value).baseline_sha, null);
  assert.throws(() => rehearsalInput({ ...value, config_sha256: '0'.repeat(64) }), /fingerprint/);
  assert.throws(() => rehearsalInput({ ...value, baseline_sha: value.sha }), /baseline SHA/);
  assert.throws(() => rehearsalInput({ ...value, legacy_baseline: false }), /baseline SHA/);
});
test('runtime release SHA reaches all services and stays absent for unknown legacy baseline', async () => {
  const { composeSpec } = await import('./run.mjs');
  const options = { images: {}, secret: 's', password: 'p', terms: 'test', runId: 'owned' };
  for (const service of ['web', 'server', 'sync']) {
    assert.equal(composeSpec({ ...options, releaseSha: 'a'.repeat(40) }).services[service].environment.RELEASE_SHA, 'a'.repeat(40));
    assert.equal(composeSpec(options).services[service].environment.RELEASE_SHA, undefined);
  }
});

test('smoke preserves significant password bytes',async()=>{
  const {smokeConfig}=await import('./core.mjs');
  assert.equal(smokeConfig({dedicated_account:true,email:'fixture@example.com',password:' secret ',board_id:'fixture-board'}).password,' secret ');
});
