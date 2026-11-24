import test from 'node:test';
import assert from 'node:assert/strict';
import { removeOwned } from './docker.mjs';

const RUN = 'moss-rehearsal-ab6bb3e1-132d-4eff-b0b2-92e8fcdcf6a7';

function fakeDocker(state, { stuck = null } = {}) {
  const calls = [];
  const run = async (args) => {
    calls.push(args.join(' '));
    const kind = args[0] === 'ps' ? 'container' : args[0];
    if (args.includes('ls') || args[0] === 'ps') {
      const filter = args[args.indexOf('--filter') + 1];
      return state[kind].filter(r => filter.endsWith(`=${RUN}`) && r.labels.includes(filter.slice(6))).map(r => r.id).join('\n');
    }
    const ids = args.slice(kind === 'container' ? 3 : 2);
    state[kind] = state[kind].filter(r => !ids.includes(r.id) || r.id === stuck);
    return '';
  };
  return { run, calls };
}

test('removes a volume compose down skipped because the final model no longer used it', async () => {
  const label = `com.moss.rehearsal=${RUN}`;
  const state = { container: [], network: [], volume: [{ id: `${RUN}_files`, labels: [label, `com.docker.compose.project=${RUN}`] }, { id: 'unrelated', labels: ['com.moss.rehearsal=moss-rehearsal-other'] }] };
  const { run } = fakeDocker(state);
  assert.deepEqual(await removeOwned(RUN, run), { container: 0, volume: 1, network: 0 });
  assert.deepEqual(state.volume.map(v => v.id), ['unrelated']);
});

test('fails cleanup instead of reporting success when an owned resource remains', async () => {
  const state = { container: [], network: [], volume: [{ id: 'stuck', labels: [`com.moss.rehearsal=${RUN}`] }] };
  const { run } = fakeDocker(state, { stuck: 'stuck' });
  await assert.rejects(removeOwned(RUN, run), /remains after cleanup/);
});

test('refuses anything but an exact rehearsal run id', async () => {
  for (const bad of ['', 'moss', 'moss-rehearsal-*', `${RUN} --all`]) await assert.rejects(removeOwned(bad, async () => ''), /invalid/);
});
