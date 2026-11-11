import { createHash } from 'node:crypto';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const required = (env, name) => {
  if (typeof env[name] !== 'string' || !env[name].trim()) throw new Error(`${name} is required`);
  return env[name].trim();
};
export function endpoint(value, protocols = ['http:', 'https:']) {
  const url = new URL(value);
  if (!protocols.includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('invalid endpoint');
  return url.href.replace(/\/$/, '');
}
export function smokeConfig(env) {
  if (required(env, 'MOSS_SMOKE_DEDICATED_ACCOUNT') !== 'yes') throw new Error('dedicated smoke account acknowledgment required');
  return {
    email: required(env, 'MOSS_SMOKE_EMAIL'), password: required(env, 'MOSS_SMOKE_PASSWORD'),
    board: required(env, 'MOSS_SMOKE_BOARD_ID'),
    api: endpoint(required(env, 'MOSS_SMOKE_API_URL')),
    sync: endpoint(required(env, 'MOSS_SMOKE_SYNC_URL'), ['ws:', 'wss:']),
    web: endpoint(required(env, 'MOSS_SMOKE_WEB_URL')),
    revision: required(env, 'MOSS_SMOKE_REVISION'),
    expected: required(env, 'MOSS_SMOKE_FINGERPRINT'),
    output: required(env, 'MOSS_SMOKE_EVIDENCE'),
  };
}
export async function checkedFetch(url, options = {}) {
  const response = await fetch(url, { redirect: 'error', ...options, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${new URL(url).pathname}`);
  return response;
}
export async function fingerprint(base, expected, { legacy = false } = {}) {
  if (!expected || (!legacy && !/^[a-f0-9]{40}$/.test(expected.revision))) throw new Error('fingerprint revision required');
  if (!Array.isArray(expected.assets) || expected.assets.length === 0) throw new Error('non-empty asset proof required');
  const identityPath = expected.identityPath ?? '/build-info.json';
  if (!/^\/(?!\/)[^?#]*$/.test(identityPath)) throw new Error('invalid identity path');
  const identity = legacy ? null : await (await checkedFetch(new URL(identityPath, base))).json();
  if (!legacy && identity.revision !== expected.revision) throw new Error('public build identity mismatch');
  const html = await (await checkedFetch(new URL('/', base))).text();
  const referenced = [...html.matchAll(/(?:src|href)=["'](\/_next\/static\/[^"'?#]+)(?:\?[^"']*)?["']/g)].map(match => match[1]);
  if (referenced.length === 0 || referenced.some(path => !expected.assets.some(asset => asset.path === path))) throw new Error('public HTML asset proof incomplete');
  const assets = [];
  for (const asset of expected.assets) {
    if (!/^\/_next\/static\/[^?#]+$/.test(asset.path) || !/^[a-f0-9]{64}$/.test(asset.sha256)) throw new Error('invalid expected asset');
    const url = new URL(asset.path, base).href;
    const hash = sha256(new Uint8Array(await (await checkedFetch(url)).arrayBuffer()));
    if (hash !== asset.sha256) throw new Error(`public asset hash mismatch: ${asset.path}`);
    assets.push({ path: asset.path, sha256: hash });
  }
  return { buildIdentity: identity, assets, html_sha256: sha256(html), referencedAssets: [...new Set(referenced)] };
}
export class Evidence {
  constructor(kind, revision, runId) {
    this.data = { schemaVersion: 1, kind, sourceRevision: revision, runId, startedAt: new Date().toISOString(), status: 'failed', phases: [] };
  }
  async phase(name, operation) {
    const phase = { name, status: 'failed', startedAt: new Date().toISOString() };
    this.data.phases.push(phase);
    try { phase.details = await operation(); phase.status = 'passed'; return phase.details; }
    finally { phase.completedAt = new Date().toISOString(); }
  }
  finish(names) {
    if (!names.every(name => this.data.phases.some(p => p.name === name && p.status === 'passed'))) throw new Error('missing successful mandatory phase');
    if (this.data.phases.some(p => p.status !== 'passed')) throw new Error('failed phase');
    this.data.status = 'passed'; this.data.completedAt = new Date().toISOString();
    return this.data;
  }
}

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function pinnedImages(value) {
  for (const service of ['web', 'server', 'sync']) {
    if (!/^ghcr\.io\/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$/.test(value?.[service])) throw new Error(`pinned GHCR ${service} image required`);
  }
  return Object.fromEntries(['web', 'server', 'sync'].map(k => [k, value[k]]));
}
export function publicConfig(value) {
  return {
    api: endpoint(value.api_url), sync: endpoint(value.sync_url, ['ws:', 'wss:']), web: endpoint(value.web_url),
    expected: { revision: value.sha, identityPath: value.identity_path ?? '/build-info.json', assets: value.assets },
  };
}
export function cli(argv, names) {
  const result = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!names.includes(argv[i]) || !argv[i + 1] || result[argv[i]]) throw new Error('invalid command arguments');
    result[argv[i]] = argv[i + 1];
  }
  for (const name of names) if (!result[name]) throw new Error(`${name} is required`);
  return result;
}

export function smokeArgs(argv) {
  let legacy = false;
  const rest = [];
  for (const arg of argv) {
    if (arg === '--legacy-baseline') { if (legacy) throw new Error('duplicate legacy mode'); legacy = true; }
    else rest.push(arg);
  }
  const args = cli(rest, legacy ? ['--config'] : ['--sha', '--config']);
  if (!legacy && !/^[a-f0-9]{40}$/.test(args['--sha'])) throw new Error('exact SHA required');
  return { ...args, legacy };
}
