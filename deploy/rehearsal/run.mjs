import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';
import { checkedFetch, cli, Evidence, fingerprint, rehearsalInput, sha256 } from './core.mjs';
import { imageAssets } from './assets.mjs';
import { docker, containerIdentity, imageIdentity, rpcWorker, migrationValidationFailed, removeOwned } from './docker.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const checks = ['normal_auth', 'two_clients', 'graceful_persistence', 'reconnect', 'offline_edits', 'backup_restore', 'previous_new_previous', 'old_client', 'failed_rollout', 'migration_failure'];
export function composeSpec({ images, secret, password, terms, restored = false, unhealthy = false, runId, releaseSha, googleClientId = '' }) {
  const database = restored ? 'restored' : 'postgres', files = restored ? 'restored_files' : 'files';
  const labels = { 'com.moss.rehearsal': runId };
  const db = { image: images.postgres, labels, environment: { POSTGRES_USER: 'rehearsal', POSTGRES_PASSWORD: password, POSTGRES_DB: 'moss' }, healthcheck: { test: ['CMD-SHELL', 'pg_isready -U rehearsal -d moss'], interval: '1s', timeout: '3s', retries: 60 } };
  const release = releaseSha ? { RELEASE_SHA: releaseSha } : {};
  const serverEnv = { ...release, PORT: '8080', DATABASE_URL: `jdbc:postgresql://${database}:5432/moss`, DATABASE_USER: 'rehearsal', DATABASE_PASSWORD: password, JWT_SECRET: secret, SYNC_INTERNAL_URL: 'http://sync:1235', SYNC_INTERNAL_SECRET: secret, FILES_DIR: '/data/files', GOOGLE_CLIENT_ID: googleClientId, ALLOWED_ORIGINS: 'http://127.0.0.1', PUBLIC_BASE_URL: 'http://server:8080', MOSS_TERMS_VERSION: terms, MOSS_ACCOUNT_CAP: '100', TRUSTED_PROXY_HOPS: '0' };
  return {
    services: {
      postgres: { ...db, volumes: ['postgres:/var/lib/postgresql'] },
      restored: { ...db, volumes: ['restored_postgres:/var/lib/postgresql'] },
      server: { image: images.server, labels, networks: ['default','edge'], environment: serverEnv, ports: [{ target: 8080, host_ip: '127.0.0.1', published: '0' }], volumes: [`${files}:/data/files`], stop_grace_period: '45s',
        ...(unhealthy ? { entrypoint: ['bash', '-c', 'sleep 300'] } : {}),
      },
      sync: { image: images.sync, labels, environment: { ...release, PORT: '1234', INTERNAL_PORT: '1235', SYNC_INTERNAL_HOST: '0.0.0.0', SYNC_INTERNAL_SECRET: secret, JWT_SECRET: secret, DATABASE_URL: `postgres://${database}:5432/moss`, DATABASE_USER: 'rehearsal', DATABASE_PASSWORD: password, KTOR_INTERNAL_URL: 'http://server:8080', PUBLIC_BASE_URL: 'http://server:8080' }, ports: [{ target: 1234, host_ip: '127.0.0.1', published: '0' }], stop_grace_period: '45s' },
      web: { image: images.web, labels, networks: ['default','edge'], environment: { ...release, MOSS_INTERNAL_API_URL: 'http://server:8080', OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '' }, ports: [{ target: 3000, host_ip: '127.0.0.1', published: '0' }] },
    },
    networks: { default: { labels, internal: true }, edge: { labels } },
    volumes: Object.fromEntries(['postgres', 'restored_postgres', 'files', 'restored_files'].map(name => [name, { labels }])),
  };
}
export async function run(argv) {
  const local = argv.includes('--local-registry');
  const args = cli(argv.filter(arg => arg !== '--local-registry'), ['--input', '--output']);
  const input = rehearsalInput(JSON.parse(await readFile(args['--input'], 'utf8')), { local });
  const candidate = input.images, baseline = input.baseline;
  const e = new Evidence('rehearsal', input.sha, `moss-rehearsal-${randomUUID()}`), runId = e.data.runId;
  Object.assign(e.data, { sha: input.sha, images: candidate, baseline, baseline_sha: input.baseline_sha, legacy_baseline: input.legacy_baseline, config_sha256: input.config_sha256, local_only: local, attestation_eligible: !local, registry_kind: local ? 'local' : 'ghcr', checks: Object.fromEntries(checks.map(k => [k, false])), migrations: {} });
  const identities = { candidate: {}, baseline: {} };
  // Resolve all local images first; never build or pull implicitly, and use their immutable local IDs thereafter.
  for (const [kind, refs] of Object.entries({ candidate, baseline })) {
    for (const service of ['web', 'server', 'sync']) identities[kind][service] = await imageIdentity(refs[service]);
  }
  const pg = await imageIdentity(process.env.REHEARSAL_POSTGRES_IMAGE ?? 'postgres:18-alpine');
  e.data.identities = { ...identities, postgres: pg };
  const work = await mkdtemp(join(tmpdir(), 'moss-rehearsal-'));
  const compose = join(work, 'compose.json');
  const secret = randomBytes(32).toString('hex'), password = randomBytes(24).toString('hex');
  const terms = input.public_config.terms_version;
  if (!terms) throw new Error('isolated normal-signup rehearsal requires configured terms version');
  let active = 'baseline', restored = false, unhealthy = false, worker, created = false, operationsComplete = false, workerClosed = false;
  const ids = kind => ({ ...Object.fromEntries(Object.entries(identities[kind]).map(([s, info]) => [s, info.id])), postgres: pg.id });
  const saveCompose = () => writeFile(compose, JSON.stringify(composeSpec({ images: ids(active), secret, password, terms, restored, unhealthy, runId, googleClientId: input.public_config.google_client_id, releaseSha: active === 'candidate' ? input.sha : input.baseline_sha })), { mode: 0o600 });
  const dc = (...command) => docker(['compose', '--project-name', runId, '--env-file', '/dev/null', '--file', compose, ...command]);
  async function cid(service) {
    const id = (await dc('ps', '--all', '--quiet', service)).trim();
    if (!/^[a-f0-9]{12,64}$/.test(id)) throw new Error(`missing own container: ${service}`);
    const inspect = await containerIdentity(id);
    if (inspect.Config.Labels['com.moss.rehearsal'] !== runId) throw new Error('container ownership mismatch');
    return { id, inspect };
  }
  async function hostURL(service, port) {
    const { inspect } = await cid(service);
    const binding = inspect.NetworkSettings.Ports[`${port}/tcp`]?.[0];
    if (binding?.HostIp !== '127.0.0.1' || !binding.HostPort) throw new Error('non-loopback or missing rehearsal port');
    return `http://127.0.0.1:${binding.HostPort}`;
  }
  async function health(service = 'server', seconds = 90) {
    const url = `${await hostURL(service, service === 'web' ? 3000 : 8080)}${service === 'web' ? '/' : '/health'}`;
    const end = Date.now() + seconds * 1000;
    while (Date.now() < end) {
      const { inspect } = await cid(service);
      if (!inspect.State.Running) throw new Error(`${service} exited before healthy`);
      try {
        const response = await checkedFetch(url);
        if (service !== 'server' || (await response.json()).status === 'ok') return;
      } catch { /* retry bounded readiness, never success on timeout */ }
      await new Promise(r => setTimeout(r, 500));
    }
    throw new Error(`${service} did not become healthy`);
  }
  async function dbReady(service) {
    for (let attempt = 0; attempt < 60; attempt++) {
      const { inspect } = await cid(service);
      if (inspect.State.Health?.Status === 'healthy') return;
      await new Promise(r => setTimeout(r, 500));
    }
    throw new Error('isolated postgres unhealthy');
  }
  const sql = async (statement, database = restored ? 'restored' : 'postgres') => dc('exec', '-T', database, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'rehearsal', '-d', 'moss', '-Atc', statement);
  async function migrations() {
    return JSON.parse((await sql(`SELECT COALESCE(json_agg(row_to_json(m)), '[]'::json) FROM (SELECT version, checksum, success FROM flyway_schema_history ORDER BY installed_rank) m`)).trim());
  }
  async function stopWriters() {
    // Web can write through routes; sync must finish its DB writes before server shuts down.
    const errors=[];
    for (const service of ['web', 'sync', 'server']) {
      await dc('stop', '--timeout', '45', service);
      const { inspect } = await cid(service);
      if (inspect.State.Running || !(service === 'sync' ? [0] : [0, 143]).includes(inspect.State.ExitCode) || inspect.State.OOMKilled) errors.push(service);
    }
    if (errors.length) throw new Error('one or more fixture writers did not stop gracefully');
  }
  async function start() {
    await saveCompose();
    await dc('up', '-d', '--no-build', '--pull', 'never', 'server'); await health();
    await dc('up', '-d', '--no-build', '--pull', 'never', 'sync', 'web'); await health('web');
    // Legacy images have no healthcheck: their control listener starts only after sync DB initialization.
    const syncDeadline=Date.now()+60000;
    let controlReady=false;
    while (Date.now()<syncDeadline) {
      try {
        await dc('exec','-T','sync','bun','-e','const r=await fetch("http://127.0.0.1:1235/deployment",{signal:AbortSignal.timeout(2000)});if(![200,401,404].includes(r.status))process.exit(1)');
        controlReady=true; break;
      } catch { await new Promise(resolve=>setTimeout(resolve,500)); }
    }
    if (!controlReady) throw new Error('sync control listener not ready');
    for (const service of ['web', 'server', 'sync']) {
      const { inspect } = await cid(service);
      if (inspect.Image !== identities[active][service].id) throw new Error(`${service} running unexpected image`);
      if (active === 'candidate') {
        const deadline=Date.now()+120000;
        let state=inspect.State;
        while (state.Health?.Status !== 'healthy' && Date.now()<deadline) {
          if (!state.Running) throw new Error(`${service} stopped before readiness`);
          await new Promise(resolve=>setTimeout(resolve,500));
          state=(await cid(service)).inspect.State;
        }
        if (state.Health?.Status !== 'healthy') throw new Error(`${service} revision/DB readiness failed`);
      }
    }
  }
  const board = `b-${randomBytes(5).toString('hex')}`;
  const account = { api: 'http://server:8080', sync: 'ws://sync:1234', board, email: `rehearsal-${randomUUID()}@example.com`, password: randomBytes(24).toString('hex'), terms };
  async function client(kind, signup = false) {
    if (worker) { await worker.call('close'); await worker.end(); worker = undefined; }
    worker = rpcWorker('docker', ['run', '--rm', '-i', '--pull=never', '--label', `com.moss.rehearsal=${runId}`, '--name', `${runId}-client-${randomBytes(3).toString('hex')}`, '--network', `${runId}_default`, '--read-only', '--tmpfs', '/tmp:rw,nosuid,size=32m',
      // Recreated services can get new addresses; a cached DNS answer would pin the old client to a dead IP.
      '--env', 'BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS=0',
      '--mount', `type=bind,src=${here},dst=/harness,readonly`, '--entrypoint', 'bun', identities[kind].web.id, '/harness/client-worker.mjs']);
    return worker.call('init', { ...account, signup });
  }
  const values = {};
  async function editPair(key) {
    await worker.call('pair');
    for (let i = 0; i < 2; i++) { values[`${key}-${i}`] = `${runId}:${key}:${i}`; await worker.call('write', { index: i, key: `${key}-${i}`, value: values[`${key}-${i}`] }); }
    await worker.call('assert', { values });
  }
  async function fresh() {
    await worker.call('close'); await worker.call('pair'); return worker.call('assert', { values });
  }
  async function phase(name, fn) { return e.phase(name, async () => { const result = await fn(); if (name in e.data.checks) e.data.checks[name] = true; return result; }); }
  try {
    await saveCompose();
    // No arbitrary project input; refuse even the astronomically unlikely UUID collision.
    if ((await docker(['ps', '-aq', '--filter', `label=com.docker.compose.project=${runId}`])).trim()) throw new Error('project collision');
    created = true;
    await dc('up', '-d', '--no-build', '--pull', 'never', 'postgres'); await dbReady('postgres');
    const version = (await sql('SHOW server_version_num')).trim();
    if (!/^18\d{4}$/.test(version)) throw new Error('rehearsal requires current Postgres major 18');
    e.data.postgresVersion = version;
    await start(); e.data.migrations.baseline = await migrations();
    await phase('normal_auth', () => client('baseline', true));
    await phase('two_clients', () => editPair('previous'));
    await phase('graceful_persistence', async () => {
      // Keep documents alive while SIGTERM drains the real sync image, then discard client memory.
      await stopWriters(); await worker.call('close'); await start();
      // Discard the old process's DNS cache and every local Y.Doc: only durable server state can pass.
      await client('baseline'); await worker.call('pair');
      return worker.call('assert',{values});
    });
    await phase('reconnect', () => fresh());
    await phase('offline_edits', async () => {
      await worker.call('offline');
      await dc('stop', '--timeout', '45', 'sync');
      const { inspect } = await cid('sync');
      if (inspect.State.ExitCode !== 0) throw new Error('sync restart was not graceful');
      values.offline = `${runId}:offline`;
      await worker.call('write', { index: 1, key: 'offline', value: values.offline });
      await dc('up', '-d', '--no-build', '--pull', 'never', 'sync');
      await worker.call('online'); await worker.call('assert', { values }); return fresh();
    });
    // Switch services to candidate while retaining old-client implementation and persisted state.
    await phase('old_client', async () => {
      await stopWriters(); await worker.call('close'); active = 'candidate'; await start();
      e.data.migrations.candidate = await migrations();
      const extracted = await imageAssets(identities.candidate.web.id, runId);
      e.data.asset_artifact = { image: extracted.identity, archive_sha256: extracted.archive_sha256, files: extracted.assets.length };
      e.data.public = await fingerprint(await hostURL('web', 3000), { revision: input.sha, assets: extracted.assets });
      await editPair('candidate-old-client'); return fresh();
    });
    await phase('previous_new_previous', async () => {
      await client('candidate'); await editPair('candidate-new-client'); await fresh();
      await stopWriters(); await worker.call('close'); active = 'baseline'; await start();
      await client('baseline'); await worker.call('pair'); await worker.call('assert', { values });
      await worker.call('close');
      // Return to candidate so backup includes candidate-created data and migrations.
      await stopWriters(); active = 'candidate'; await start(); await client('candidate'); await worker.call('pair');
      return worker.call('assert', { values });
    });
    await phase('backup_restore', async () => {
      const content = `isolated attachment ${runId}`;
      const attachment = await worker.call('upload', { content });
      await worker.call('download', { id: attachment.id, content });
      await worker.call('close'); await stopWriters();
      const dump = await docker(['compose', '--project-name', runId, '--env-file', '/dev/null', '--file', compose, 'exec', '-T', 'postgres', 'pg_dump', '-U', 'rehearsal', '-d', 'moss', '--format=custom'], { encoding: 'buffer' });
      if (!dump.length) throw new Error('empty database backup');
      const source = await cid('server');
      const volume = source.inspect.Mounts.find(m => m.Destination === '/data/files')?.Name;
      if (volume !== `${runId}_files`) throw new Error('attachment source ownership mismatch');
      const archive = await docker(['run', '--rm', '--pull=never', '--label', `com.moss.rehearsal=${runId}`, '--network', 'none', '--read-only', '--mount', `type=volume,src=${volume},dst=/files,readonly`, '--entrypoint', 'tar', identities.candidate.server.id, '-C', '/files', '-czf', '-', '.'], { encoding: 'buffer' });
      if (!archive.length) throw new Error('empty attachment backup');
      const dumpPath = join(work, 'backup.dump'), archivePath = join(work, 'attachments.tar.gz');
      await writeFile(dumpPath, dump, { mode: 0o600 }); await writeFile(archivePath, archive, { mode: 0o600 });
      await dc('up', '-d', '--no-build', '--pull', 'never', 'restored'); await dbReady('restored');
      const destination = await cid('restored');
      await docker(['cp', dumpPath, `${destination.id}:/tmp/restore.dump`]);
      await dc('exec', '-T', 'restored', 'pg_restore', '--exit-on-error', '--no-owner', '-U', 'rehearsal', '-d', 'moss', '/tmp/restore.dump');
      restored = true; await saveCompose();
      // Create a separate attachment volume via the stopped server, never overwrite the source.
      await dc('create', '--no-build', '--pull', 'never', 'server');
      const target = await cid('server');
      const restoredVolume = target.inspect.Mounts.find(m => m.Destination === '/data/files')?.Name;
      if (restoredVolume !== `${runId}_restored_files`) throw new Error('attachment target ownership mismatch');
      await docker(['run', '--rm', '--pull=never', '--label', `com.moss.rehearsal=${runId}`, '--network', 'none', '--mount', `type=volume,src=${restoredVolume},dst=/files`, '--mount', `type=bind,src=${archivePath},dst=/backup.tar.gz,readonly`, '--entrypoint', 'tar', identities.candidate.server.id, '-C', '/files', '-xzf', '/backup.tar.gz']);
      await start(); await client('candidate'); await worker.call('pair'); await worker.call('assert', { values });
      await worker.call('download', { id: attachment.id, content });
      return { dump_sha256: sha256(dump), attachment_archive_sha256: sha256(archive), attachmentVerified: true, isolatedDatabase: true, writersStopped: true };
    });
    await phase('failed_rollout', async () => {
      await worker.call('close'); await stopWriters();
      unhealthy = true; await saveCompose(); await dc('up', '-d', '--no-build', '--pull', 'never', 'server');
      let rejected = false;
      try { await health('server', 4); } catch { rejected = true; }
      if (!rejected) throw new Error('unhealthy candidate accepted');
      // Recover the actual previous service set after the candidate fails readiness.
      await dc('stop', '--timeout', '5', 'server'); unhealthy = false; active = 'baseline'; await start();
      await client('baseline'); await worker.call('pair'); await worker.call('assert', { values });
      return { recovered: 'baseline', images: baseline, fixtureVerified: true };
    });
    await phase('forced_shutdown_rejected',async()=>{
      await worker.call('close');
      await dc('kill','--signal','SIGKILL','sync');
      let rejected=false;
      try { await stopWriters(); } catch { rejected=true; }
      const stopped=await cid('sync');
      if (!rejected || stopped.inspect.State.ExitCode!==137) throw new Error('forced shutdown was accepted as durable');
      // Only this isolated known fixture is restarted; the production agent pauses on this outcome.
      await start(); await client('baseline'); await worker.call('pair'); await worker.call('assert',{values});
      return {exitCode:137,rejectedAsDurable:true};
    });
    await phase('migration_failure', async () => {
      await worker.call('close'); await stopWriters();
      active = 'candidate';
      const changed = (await sql("UPDATE flyway_schema_history SET checksum = checksum + 1 WHERE version = '1' RETURNING version")).trim();
      if (!changed.startsWith('1')) throw new Error('migration failure injection did not modify isolated history');
      await saveCompose(); await dc('up', '-d', '--no-build', '--pull', 'never', 'server');
      let rejected = false;
      try { await health('server', 15); } catch { rejected = true; }
      const state = await cid('server');
      if (!rejected || state.inspect.State.Running || state.inspect.State.ExitCode === 0) throw new Error('migration failure was not fatal');
      if (!await migrationValidationFailed(state.id)) throw new Error('startup failure was not a migration validation failure');
      // No rollback or repair of the rejected migration. The isolated fixture is destroyed in cleanup.
      return { rejected: true, exitCode: state.inspect.State.ExitCode, reason: 'isolated Flyway checksum validation' };
    });
    operationsComplete = true;
  } finally {
    try {
      if (worker) { await worker.call('close'); await worker.end(); }
      workerClosed = true;
    } finally {
      try { if (created) await e.phase('cleanup', async () => { await dc('down', '--volumes', '--remove-orphans', '--timeout', '15'); return { ownProjectRemoved: true, leftoversRemoved: await removeOwned(runId) }; }); }
      catch (error) { e.data.status = 'failed'; throw error; }
      finally {
        if (operationsComplete && workerClosed && e.data.phases.find(p => p.name === 'cleanup')?.status === 'passed') e.finish([...checks, 'forced_shutdown_rejected', 'cleanup']);
        e.data.completedAt ??= new Date().toISOString();
        await writeFile(resolve(args['--output']), JSON.stringify(e.data, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
        await rm(work, { recursive: true });
      }
    }
  }
  return e.data;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try { await run(process.argv.slice(2)); console.log('image rehearsal passed'); }
  catch (error) { console.error(`image rehearsal failed: ${error.message}`); process.exitCode = 1; }
}
