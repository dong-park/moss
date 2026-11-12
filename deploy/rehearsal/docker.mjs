import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { createInterface } from 'node:readline';
const exec = promisify(execFile);

export async function docker(args, options = {}) {
  try { return (await exec('docker', args, { encoding: 'utf8', timeout: 180000, maxBuffer: 16 * 1024 * 1024, ...options })).stdout; }
  catch (error) {
    // Docker/compose output may include interpolated passwords or tokens. Never log it.
    const safe = new Error(`docker ${args[0]} failed (exit ${error.code ?? 'unknown'})`);
    safe.exitCode = error.code; throw safe;
  }
}
export async function imageIdentity(reference) {
  const image = JSON.parse(await docker(['image', 'inspect', '--format', '{"Id":{{json .Id}},"RepoDigests":{{json .RepoDigests}}}', reference]));
  if (!/^sha256:[a-f0-9]{64}$/.test(image.Id)) throw new Error('invalid inspected image ID');
  if (reference.includes('@sha256:') && !image.RepoDigests?.includes(reference)) throw new Error('local image does not match requested digest reference');
  return { reference, id: image.Id, repoDigests: image.RepoDigests ?? [] };
}
export async function containerIdentity(name) {
  // Inspect only necessary fields. Never retrieve Config.Env, including for production baseline reads.
  const projection = '{"Id":{{json .Id}},"Image":{{json .Image}},"State":{{json .State}},"Mounts":{{json .Mounts}},"Config":{"Labels":{{json .Config.Labels}}},"NetworkSettings":{"Ports":{{json .NetworkSettings.Ports}}}}';
  return JSON.parse(await docker(['inspect', '--format', projection, name]));
}
export function rpcWorker(command, args, options = {}) {
  const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'], ...options });
  let next = 0, ended = false;
  const pending = new Map();
  const fail = () => { ended = true; for (const { reject, timer } of pending.values()) { clearTimeout(timer); reject(new Error('client worker exited')); } pending.clear(); };
  child.on('error', fail); child.on('exit', fail);
  child.stderr.resume(); // Never forward third-party logs, which can contain auth or connection payloads.
  for (const stream of [child.stdin, child.stdout, child.stderr]) stream.on('error', fail);
  createInterface({ input: child.stdout }).on('line', line => {
    if (!line.startsWith('MOSS_RPC ')) return;
    try {
      const message = JSON.parse(line.slice(9)), waiter = pending.get(message.id);
      if (!waiter) return;
      clearTimeout(waiter.timer); pending.delete(message.id);
      if (message.ok) waiter.resolve(message.result); else waiter.reject(new Error(message.error));
    } catch { fail(); }
  });
  return {
    call(op, args = {}) {
      if (ended) return Promise.reject(new Error('client worker unavailable'));
      return new Promise((resolve, reject) => {
        const id = ++next;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`client operation timed out: ${op}`)); }, 60000);
        pending.set(id, { resolve, reject, timer });
        child.stdin.write(JSON.stringify({ id, op, args }) + '\n');
      });
    },
    async end() {
      if (ended) return;
      child.stdin.end();
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('client worker did not stop')); }, 10000);
        child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('client worker failed at shutdown')); });
      });
    },
  };
}

export async function migrationValidationFailed(name) {
  // Only return a classification, never fixture logs or exception payloads.
  try {
    const result=await exec('docker',['logs',name],{encoding:'utf8',timeout:15000,maxBuffer:4*1024*1024});
    return /checksum|validate.*fail|migration.*fail/i.test(result.stdout+'\n'+result.stderr);
  } catch { throw new Error('unable to classify isolated migration failure'); }
}

/**
 * Removes every container, volume and network still owned by one rehearsal run, then proves none
 * remain. `compose down --volumes` only removes volumes used by the final rendered model, so a
 * volume used earlier in the run (e.g. the original attachments after switching to the restored
 * set) would otherwise be left behind while cleanup reported success.
 */
export async function removeOwned(runId, run = docker) {
  if (!/^moss-rehearsal-[0-9a-f-]{36}$/.test(runId)) throw new Error('invalid rehearsal run id');
  const filters = [`label=com.moss.rehearsal=${runId}`, `label=com.docker.compose.project=${runId}`];
  const list = async (kind) => {
    const ids = new Set();
    for (const filter of filters) {
      const args = kind === 'container' ? ['ps', '-aq', '--filter', filter] : [kind, 'ls', '-q', '--filter', filter];
      for (const id of (await run(args)).split('\n').map(s => s.trim()).filter(Boolean)) ids.add(id);
    }
    return [...ids];
  };
  const removed = {};
  for (const [kind, remove] of [['container', ['rm', '-f', '-v']], ['volume', ['volume', 'rm']], ['network', ['network', 'rm']]]) {
    const ids = await list(kind);
    if (ids.length) await run([...remove, ...ids]);
    removed[kind] = ids.length;
  }
  for (const kind of ['container', 'volume', 'network']) {
    if ((await list(kind)).length) throw new Error(`owned rehearsal ${kind} remains after cleanup`);
  }
  return removed;
}
