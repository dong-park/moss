import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { tarAssets } from './assets.mjs';
import { sha256 } from './core.mjs';
const exec = promisify(execFile);

// Use an independent tar writer with the same formats on GNU and BSD hosts.
// macOS tar calls GNU format "gnutar" and also emits platform-specific PAX data.
async function archive(directory, format = 'gnu') {
  const { stdout } = await exec('python3', ['-c', `
import os, sys, tarfile
formats = {'gnu': tarfile.GNU_FORMAT, 'pax': tarfile.PAX_FORMAT, 'ustar': tarfile.USTAR_FORMAT}
with tarfile.open(fileobj=sys.stdout.buffer, mode='w|', format=formats[sys.argv[2]]) as output:
    output.add(os.path.join(sys.argv[1], '.next/static'), arcname='.next/static')
`, directory, format], { encoding: 'buffer' });
  return stdout;
}

test('hashes come from real tar file bytes, including long paths, without host extraction', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'moss-assets-unit-'));
  t.after(() => rm(directory, { recursive: true }));
  const long = ['a', 'b', 'c'].map(letter => letter.repeat(50)).join('/');
  await mkdir(join(directory, '.next/static/chunks', long), { recursive: true });
  await writeFile(join(directory, '.next/static/chunks/main.js'), 'real compiled bytes');
  await writeFile(join(directory, '.next/static/chunks', long, 'lazy.js'), 'long path bytes');
  for (const format of ['gnu', 'pax', 'ustar']) {
    const stdout = await archive(directory, format);
    const assets = tarAssets(stdout);
    assert.equal(assets.length, 2);
    assert.equal(assets.find(a => a.path.endsWith('main.js')).sha256, sha256('real compiled bytes'));
    assert.equal(assets.find(a => a.path.endsWith('lazy.js')).sha256, sha256('long path bytes'));
  }
});
test('static asset parser rejects archive corruption, links and empty proof', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'moss-assets-negative-'));
  t.after(() => rm(directory, { recursive: true }));
  await mkdir(join(directory, '.next/static'), { recursive: true });
  await writeFile(join(directory, '.next/static/main.js'), 'bytes');
  const stdout = await archive(directory);
  const corrupt = Buffer.from(stdout); corrupt[0] ^= 1;
  assert.throws(() => tarAssets(corrupt), /invalid static asset tar/);
  assert.throws(() => tarAssets(Buffer.alloc(1024)), /no static assets/);
  await symlink('/etc/passwd', join(directory, '.next/static/link'));
  const linked = await archive(directory);
  assert.throws(() => tarAssets(linked), /non-regular static asset/);
});
