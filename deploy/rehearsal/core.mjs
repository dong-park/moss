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
export function smokeConfig(value) {
  if (value.dedicated_account !== true) throw new Error('dedicated smoke account acknowledgment required');
  return { email: required(value, 'email'), password: required(value, 'password'), board: required(value, 'board_id') };
}
export async function checkedFetch(url, options = {}) {
  const response = await fetch(url, { redirect: 'error', ...options, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${new URL(url).pathname}`);
  return response;
}
export async function fingerprint(base, expected, { legacy = false } = {}) {
  if (!expected || (!legacy && !/^[a-f0-9]{40}$/.test(expected.revision))) throw new Error('fingerprint revision required');
  if (!Array.isArray(expected.assets) || expected.assets.length === 0) throw new Error('non-empty asset proof required');
  const identityPath = '/api/deployment';
  if (!/^\/(?!\/)[^?#]*$/.test(identityPath)) throw new Error('invalid identity path');
  const identity = legacy ? null : await (await checkedFetch(new URL(identityPath, base))).json();
  if (!legacy && (identity.sha !== expected.revision || identity.status !== 'ready')) throw new Error('public build identity mismatch');
  const pages = [], paths = new Set();
  for (const page of expected.htmlPaths ?? ['/']) {
    if (!/^\/(?!\/)[^?#]*$/.test(page)) throw new Error('invalid configured HTML path');
    const html = await (await checkedFetch(new URL(page, base))).text();
    const referenced = [...html.matchAll(/(?:src|href)=["'](\/_next\/static\/[^"'?#]+)(?:\?[^"']*)?["']/g)].map(match => match[1]);
    if (referenced.length === 0 || referenced.some(path => !expected.assets.some(asset => asset.path === path))) throw new Error('public HTML asset proof incomplete');
    for (const path of referenced) paths.add(path);
    pages.push({ path: page, sha256: sha256(html), referencedAssets: [...new Set(referenced)] });
  }
  if (pages.length === 0) throw new Error('HTML proof required');
  const assets = [];
  for (const path of paths) {
    const asset = expected.assets.find(item => item.path === path);
    if (!/^\/_next\/static\/[^?#]+$/.test(asset.path) || !/^[a-f0-9]{64}$/.test(asset.sha256)) throw new Error('invalid expected asset');
    const hash = sha256(new Uint8Array(await (await checkedFetch(new URL(path, base))).arrayBuffer()));
    if (hash !== asset.sha256) throw new Error(`public asset hash mismatch: ${path}`);
    assets.push({ path, sha256: hash });
  }
  return { buildIdentity: identity, assets, pages };
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
  return JSON.stringify(value).replace(/[\u007f-\uffff]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}
export function pinnedImages(value, { local = false } = {}) {
  for (const service of ['web', 'server', 'sync']) {
    const pattern = local ? /^127\.0\.0\.1:[0-9]+\/moss-(?:web|server|sync)@sha256:[a-f0-9]{64}$/ : /^ghcr\.io\/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$/;
    const port = local ? Number(value?.[service]?.split(':')[1]?.split('/')[0]) : null;
    if (!pattern.test(value?.[service]) || (local && (!value[service].includes(`/moss-${service}@`) || port < 1 || port > 65535))) throw new Error(`pinned ${local ? 'local registry' : 'GHCR'} ${service} image required`);
  }
  return Object.fromEntries(['web', 'server', 'sync'].map(k => [k, value[k]]));
}
export function publicConfig(value) {
  const fields = ['api_url', 'sync_url', 'google_client_id', 'terms_version'];
  if (!value || Object.keys(value).sort().join(',') !== [...fields].sort().join(',') || fields.some(k => typeof value[k] !== 'string')) throw new Error('exact public config fields required');
  endpoint(value.api_url); endpoint(value.sync_url, ['ws:', 'wss:']);
  return Object.fromEntries(fields.map(key => [key, value[key]]));
}
export function rehearsalInput(value, options) {
  if (!/^[a-f0-9]{40}$/.test(value.sha)) throw new Error('exact candidate SHA required');
  if (typeof value.legacy_baseline !== 'boolean') throw new Error('explicit legacy_baseline required');
  if (value.legacy_baseline ? value.baseline_sha !== null : !/^[a-f0-9]{40}$/.test(value.baseline_sha)) throw new Error('explicit baseline SHA or legacy null required');
  const config = publicConfig(value.public_config);
  if (sha256(canonical(config)) !== value.config_sha256) throw new Error('public config fingerprint mismatch');
  return { ...value, images: pinnedImages(value.images, options), baseline: pinnedImages(value.baseline, options), public_config: config };
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
