import { randomUUID } from 'node:crypto';
import { sha256 } from './core.mjs';
import { docker, imageIdentity } from './docker.mjs';

// Parse only regular static files from tar; never extract image-owned paths onto the host.
export function tarAssets(archive) {
  const result = new Map();
  let pendingPath;
  for (let offset = 0; offset + 512 <= archive.length;) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) break;
    const string = (start, size) => header.subarray(start, start + size).toString('utf8').split('\0')[0];
    const size = Number.parseInt(string(124, 12).trim(), 8);
    const expectedSum = Number.parseInt(string(148, 8).trim(), 8);
    const actualSum = header.reduce((sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte), 0);
    if (actualSum !== expectedSum || !Number.isSafeInteger(size) || size < 0 || offset + 512 + size > archive.length) throw new Error('invalid static asset tar');
    const body = archive.subarray(offset + 512, offset + 512 + size), type = string(156, 1);
    const prefix = string(345, 155);
    const path = pendingPath ?? (prefix ? `${prefix}/${string(0, 100)}` : string(0, 100));
    pendingPath = undefined;
    offset += 512 + Math.ceil(size / 512) * 512;
    if (type === 'L') { pendingPath = body.toString('utf8').split('\0')[0]; continue; }
    if (type === 'x') {
      // POSIX pax records may carry long paths. Other metadata cannot affect the byte hash.
      for (let at = 0; at < body.length;) {
        const space = body.indexOf(32, at), length = Number(body.subarray(at, space).toString('ascii'));
        if (space < at || !Number.isSafeInteger(length) || length < 4 || at + length > body.length) throw new Error('invalid pax asset header');
        const record = body.subarray(space + 1, at + length - 1).toString('utf8');
        if (record.startsWith('path=')) pendingPath = record.slice(5);
        at += length;
      }
      continue;
    }
    if (type === '5') continue;
    if (type !== '' && type !== '0') throw new Error('non-regular static asset rejected');
    const normalized = path.replace(/^\.\//, '');
    if (!normalized.startsWith('.next/static/') || normalized.split('/').some(part => !part || part === '..' || part === '.') || /[?#\\\x00-\x1f]/.test(normalized)) throw new Error('unsafe static asset path');
    const publicPath = `/_next/static/${normalized.slice('.next/static/'.length)}`;
    if (result.has(publicPath)) throw new Error('duplicate static asset path');
    result.set(publicPath, { path: publicPath, sha256: sha256(body) });
  }
  if (!result.size) throw new Error('image contains no static assets');
  return [...result.values()].sort((a, b) => a.path.localeCompare(b.path));
}
export async function imageAssets(reference, runId) {
  const identity = await imageIdentity(reference);
  const archive = await docker(['run', '--rm', '--pull=never', '--name', `${runId}-assets-${randomUUID().slice(0, 8)}`, '--label', `com.moss.rehearsal=${runId}`, '--network', 'none', '--read-only', '--entrypoint', 'tar', identity.id, '-C', '/app', '-cf', '-', '.next/static'], { encoding: 'buffer', maxBuffer: 256 * 1024 * 1024 });
  return { identity, archive_sha256: sha256(archive), assets: tarAssets(archive) };
}
