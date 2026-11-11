"""Second independent review (ca81044): migration recovery after rollback, busy lock, safe diagnostics,
start budget dispatch. Real agent.apply/control.rollback and real Runtime.prepare/prepare_rollback/
migration_compatible; GitHub, smoke and docker are stubbed and Flyway history is simulated so that applied rows
persist across an app-image rollback (an app rollback is never a DB rollback)."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import types
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import agent
import release
import runtime
from release import Rejected

control_spec = importlib.util.spec_from_file_location('control_round2', Path(__file__).resolve().parents[1] / 'control.py')
control = importlib.util.module_from_spec(control_spec); control_spec.loader.exec_module(control)

H_N = [{'version': str(v), 'checksum': 100 + v, 'success': True} for v in range(1, 12)]
V12 = {'version': '12', 'checksum': 112, 'success': True}
H_N1 = H_N + [V12]
PUBLIC = {'api_url': 'https://moss.test', 'sync_url': 'wss://sync.test', 'google_client_id': 'id', 'terms_version': 'v1'}
CFG = release.fingerprint(PUBLIC)


def images(tag): return {s: f'ghcr.io/dong-park/moss-{s}@sha256:' + tag * 64 for s in release.SERVICES}


def manifest(sha, imgs, base):
    return {'version': 1, 'repository': release.REPOSITORY, 'environment': 'production', 'sha': sha,
            'platform': 'linux/amd64', 'runtime_contract': 1, 'config_sha256': CFG, 'run_id': 1, 'run_attempt': 1,
            'images': imgs, 'baseline': base, 'evidence_sha256': '0' * 64}


N = manifest('1' * 40, images('a'), images('9'))
N1 = manifest('2' * 40, images('b'), images('a'))   # adds V12; first smoke fails -> automatic rollback to N
N2 = manifest('3' * 40, images('c'), images('a'))   # fix-forward with the SAME migration set, rehearsed on fresh H_N


class Host(runtime.Runtime):
    """Real Runtime with Docker/GitHub/smoke edges simulated; Flyway rows persist across app rollbacks."""
    def __init__(self, world, config, evidence):
        super().__init__(config, None); self.world = world; self.evidence_map = evidence
        world_github = self
        class GH:
            def verify(self, m, directory): return {'migrations': world_github.evidence_map[m['sha']]}
            def attest(self, *args): pass
        self.github = GH()
    def metadata(self):
        if self.world.get('unreadable'): raise Rejected('Flyway metadata unreadable')
        return [dict(row) for row in self.world['live']]
    def smoke_credentials(self): return {}
    def verify_public_environment(self, rendered): pass
    def topology(self): return 'approved'
    def inspect(self, service): return {'image': 'id-' + self.world['running'][service], 'state': {'Running': True}}
    def compose(self, *args, release=None, timeout=None): return b'{}'
    def stop(self): pass
    def halt(self): pass
    def backup(self, ident): pass
    def main_sha(self): return self.world['main']
    def start_server(self, m):
        self.world['running']['server'] = m['images']['server']
        for row in self.evidence_map.get(m.get('sha'), {}).get('candidate', []):
            if row not in self.world['live']: self.world['live'].append(dict(row))
        self.world.get('after_server', lambda m: None)(m)
    def start_clients(self, m):
        for s in ('web', 'sync'): self.world['running'][s] = m['images'][s]
    def await_ready(self): pass
    def smoke(self, m):
        failures = self.world.setdefault('smoke_failures', {})
        if failures.get(m.get('sha'), 0) > 0:
            failures[m['sha']] -= 1; raise RuntimeError('candidate smoke failed')


def docker(world):
    def run(argv, **kwargs):
        if argv[:3] == ['docker', 'image', 'inspect'] and '{{.Id}}' in argv[-1]: return ('id-' + argv[3]).encode()
        if argv[:3] == ['docker', 'pull', '--platform']: return b''
        if argv[:3] == ['docker', 'image', 'inspect'] and 'Labels' in argv[-1]:
            return ('"amd64"\n"linux"\n' + json.dumps({'org.opencontainers.image.revision': world['main'],
                    'org.opencontainers.image.source': 'https://github.com/dong-park/moss'})).encode()
        if argv[:3] == ['docker', 'image', 'inspect']: return b'linux/amd64'
        raise AssertionError(argv)
    return run


class MigrationRecoveryTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.store = agent.Store(self.tmp.name)
        self.world = {'live': [dict(r) for r in H_N], 'running': dict(images('a')), 'main': N1['sha'],
                      'smoke_failures': {N1['sha']: 1}}
        self.evidence = {N1['sha']: {'baseline': H_N, 'candidate': H_N1}, N2['sha']: {'baseline': H_N, 'candidate': H_N1}}
        self.store.save({'current': N, 'previous': None, 'attempts': {}, 'reports': [], 'active': None, 'paused': False,
                         'current_migrations_sha256': release.digest(H_N)})
        self.config = {'docker_config': self.tmp.name, 'public_config': PUBLIC, 'topology': 'approved',
                       'state_dir': self.tmp.name, 'minimum_free_bytes': 0}
        for patcher in (patch.object(runtime, 'command', side_effect=docker(self.world)),
                        patch.object(runtime.shutil, 'disk_usage', return_value=types.SimpleNamespace(free=10 ** 12))):
            patcher.start(); self.addCleanup(patcher.stop)

    def host(self): return Host(self.world, self.config, self.evidence)
    def apply(self, ident, m): self.world['main'] = m['sha']; agent.apply(self.store, self.host(), ident, m)
    def attempt(self, ident): return self.store.read()['attempts'][str(ident)]

    def rollback_n1(self):
        self.apply(101, N1)
        self.assertEqual((self.attempt(101)['outcome'], self.attempt(101)['rollback']), ('failure', 'succeeded'))
        self.assertEqual(self.world['live'], H_N1)   # the candidate migration stays applied

    def test_post_rollback_history_digest_is_recorded_not_stale_baseline(self):
        self.rollback_n1()
        state = self.store.read()
        self.assertEqual(state['current'], N)
        self.assertEqual(state['current_migrations_sha256'], release.digest(H_N1))

    def test_retry_with_same_migrations_after_rollback(self):
        self.rollback_n1(); self.apply(102, N1)
        self.assertEqual(self.attempt(102)['outcome'], 'success')
        self.assertEqual(self.store.read()['current'], N1)

    def test_fix_forward_with_same_migration_set_after_rollback(self):
        self.rollback_n1(); self.apply(103, N2)
        self.assertEqual(self.attempt(103)['outcome'], 'success')
        self.assertEqual(self.store.read()['current_migrations_sha256'], release.digest(H_N1))

    def test_prepare_accepts_only_exact_rehearsed_baseline_or_candidate(self):
        host = self.host(); self.world['main'] = N2['sha']
        for live in (H_N, H_N1):
            with self.subTest(live=len(live)):
                self.world['live'] = [dict(r) for r in live]; host.prepare(N2, N)
        drift = [dict(r) for r in H_N1]; drift[-1]['checksum'] = 113
        failed = [dict(r) for r in H_N1]; failed[-1]['success'] = False
        later = H_N1 + [{'version': '13', 'checksum': 113, 'success': True}]
        old_drift = [dict(r) for r in H_N]; old_drift[0]['checksum'] = 0
        negatives = {'prefix': H_N[:-1], 'subset': H_N[:4] + H_N[5:], 'checksum drift': drift, 'failed row': failed,
                     'unrehearsed later migration': later, 'baseline checksum drift': old_drift, 'reordered': list(reversed(H_N1))}
        for name, live in negatives.items():
            with self.subTest(name=name):
                self.world['live'] = [dict(r) for r in live]
                with self.assertRaises(Rejected): self.host().prepare(N2, N)
        self.world['unreadable'] = True
        with self.assertRaises(Rejected): self.host().prepare(N2, N)

    def test_fix_forward_adding_another_migration_is_rejected_after_rollback(self):
        # Documented limit: the live intermediate history (H_N1) is neither N3's baseline nor candidate.
        self.rollback_n1()
        n3 = manifest('4' * 40, images('d'), images('a'))
        self.evidence[n3['sha']] = {'baseline': H_N, 'candidate': H_N1 + [{'version': '13', 'checksum': 113, 'success': True}]}
        self.apply(104, n3)
        attempt = self.attempt(104)
        self.assertEqual((attempt['outcome'], attempt['running']['state']), ('failure', 'serving'))
        self.assertEqual(attempt['failure']['phase'], 'prepare')
        self.assertEqual(self.world['live'], H_N1)

    def test_unverifiable_post_rollback_history_is_error_not_serving_success(self):
        def unknown(m):
            if m['sha'] == N['sha']: self.world['live'].append({'version': '99', 'checksum': 9, 'success': True})
        self.world['after_server'] = unknown
        self.apply(105, N1)
        attempt = self.attempt(105); state = self.store.read()
        self.assertEqual((attempt['outcome'], attempt['running']['state']), ('error', 'stopped'))
        self.assertTrue(state['paused'])
        self.assertEqual(state['current_migrations_sha256'], release.digest(H_N))

    def test_failed_candidate_server_start_remains_unknown_schema(self):
        def boom(m):
            if m['sha'] == N1['sha']: raise RuntimeError('flyway timed out')
        self.world['after_server'] = boom
        self.apply(106, N1)
        attempt = self.attempt(106)
        self.assertEqual((attempt['outcome'], attempt['rollback'], attempt['running']['state']), ('error', 'not_attempted', 'stopped'))
        self.assertEqual(self.world['running']['server'], N1['images']['server'])  # no previous restart

    def test_operator_rollback_records_post_rollback_history_then_resume_and_fix_forward(self):
        self.world['smoke_failures'] = {}; self.apply(107, N1)
        self.assertEqual(self.store.read()['current'], N1)
        class API:
            def repo(self, path, body=None): return {'id': 900}
        state = self.store.read(); state['current_evidence'] = None; self.store.save(state)  # fake proof is unsigned
        control.rollback(self.store, self.host(), API())
        state = self.store.read()
        self.assertEqual((state['current'], state['paused']), (N, True))
        self.assertEqual(state['current_migrations_sha256'], release.digest(H_N1))
        state['paused'] = False; self.store.save(state)   # the resume decision is the operator's
        self.apply(108, N2)
        self.assertEqual(self.attempt(108)['outcome'], 'success')


class SafeDiagnosticsTest(unittest.TestCase):
    SECRET = 'ghp_SECRETtoken123 /etc/moss-deploy/github-token person@example.com'

    def setUp(self):
        from test_agent import FakeRuntime
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.store = agent.Store(self.tmp.name); self.rt = FakeRuntime(); self.m = N1
        self.store.save({'current': N, 'attempts': {}, 'reports': [], 'active': None})
        self.rt.main = self.m['sha']

    def journal(self): return (Path(self.tmp.name) / 'state.json').read_text()

    def test_safe_rejection_reason_and_phase_are_durable(self):
        def broken(*args): raise Rejected('live migration history is neither the rehearsed baseline nor candidate')
        self.rt.prepare = broken; agent.apply(self.store, self.rt, 42, self.m)
        attempt = self.store.read()['attempts']['42']
        self.assertEqual(attempt['failure'], {'phase': 'prepare', 'code': 'rejected',
                                              'reason': 'live migration history is neither the rehearsed baseline nor candidate'})
        self.assertEqual(self.store.read()['reports'][-1]['failure'], attempt['failure'])

    def test_sensitive_child_exception_is_reduced_to_its_class(self):
        def broken(*args): raise RuntimeError(self.SECRET)
        self.rt.prepare = broken; agent.apply(self.store, self.rt, 42, self.m)
        self.assertEqual(self.store.read()['attempts']['42']['failure'], {'phase': 'prepare', 'code': 'error', 'class': 'RuntimeError'})
        for fragment in ('ghp_', 'github-token', '@example.com'): self.assertNotIn(fragment, self.journal())

    def test_unsafe_rejection_text_is_not_journaled(self):
        def broken(*args): raise Rejected('bad\n' + self.SECRET)
        self.rt.prepare = broken; agent.apply(self.store, self.rt, 42, self.m)
        self.assertEqual(self.store.read()['attempts']['42']['failure']['reason'], 'unprintable rejection')
        self.assertNotIn('ghp_', self.journal())

    def test_failed_phase_and_failed_recovery_are_both_recorded(self):
        self.rt.fail = 'clients'; agent.apply(self.store, self.rt, 42, self.m)
        failure = self.store.read()['attempts']['42']['failure']
        self.assertEqual((failure['phase'], failure['code'], failure['class']), ('clients', 'error', 'RuntimeError'))
        self.assertEqual(failure['rollback'], {'phase': 'rollback', 'code': 'error', 'class': 'RuntimeError'})

    def test_crash_recovery_reason_is_durable(self):
        state = self.store.read(); state['active'] = {'id': 7, 'phase': 'server', 'manifest': self.m, 'requested': self.m['sha']}
        self.store.save(state); agent.recover(self.store, self.rt)
        self.assertEqual(self.store.read()['attempts']['7']['failure'], {'phase': 'server', 'code': 'interrupted'})


def full_config(root, expires=None):
    (root / 'install').mkdir(exist_ok=True); (root / 'state').mkdir(exist_ok=True)
    for name in ('app.env', 'bootstrap.json', 'smoke.json', 'token'): (root / name).write_text('x')
    config = {'repository': 'dong-park/moss', 'project': 'moss', 'install_dir': str(root / 'install'),
              'state_dir': str(root / 'state'), 'backup_dir': str(root / 'backup'), 'app_env': str(root / 'app.env'),
              'bootstrap_file': str(root / 'bootstrap.json'), 'smoke_config': str(root / 'smoke.json'),
              'docker_config': str(root / 'docker'), 'minimum_free_bytes': 0, 'auth_mode': 'token',
              'token_file': str(root / 'token'), 'token_expires_at': expires or int(time.time()) + 3600, 'public_config': PUBLIC}
    path = root / 'config.json'; path.write_text(json.dumps(config)); return path


class BusyLockTest(unittest.TestCase):
    """A real second process holds the shared lock, as the timer does during a replacement."""
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name); self.config = full_config(self.root)
        agent.Store(self.root / 'state').save({'current': N, 'attempts': {}, 'reports': [], 'active': None, 'paused': False})
        self.journal = (self.root / 'state/state.json').read_bytes()
        patcher = patch.object(runtime, 'protected', side_effect=lambda path, directory=False: Path(path))
        patcher.start(); self.addCleanup(patcher.stop)
        lock = str(self.root / 'state/lock')
        self.holder = subprocess.Popen([sys.executable, '-c', 'import fcntl,sys,time; f=open(sys.argv[1],"a"); '
                                        'fcntl.flock(f,fcntl.LOCK_EX); print("held",flush=True); time.sleep(60)', lock],
                                       stdout=subprocess.PIPE, text=True)
        self.addCleanup(lambda: (self.holder.kill(), self.holder.wait(), self.holder.stdout.close()))
        self.assertEqual(self.holder.stdout.readline().strip(), 'held')

    def invoke(self, module, *argv):
        err = io.StringIO()
        with contextlib.redirect_stderr(err), contextlib.redirect_stdout(io.StringIO()):
            code = module.run(['--config', str(self.config), *argv])
        return code, err.getvalue()

    def test_operator_commands_report_busy_nonzero_without_journal_change(self):
        for argv in (['pause'], ['resume'], ['status'], ['reconcile', '7'], ['bootstrap'], ['dry-run']):
            with self.subTest(argv=argv):
                code, err = self.invoke(agent, *argv)
                self.assertEqual(code, 75); self.assertIn('busy', err)
                self.assertEqual((self.root / 'state/state.json').read_bytes(), self.journal)

    def test_control_commands_report_busy_nonzero(self):
        for argv in (['retry', '42'], ['rollback-previous']):
            with self.subTest(argv=argv):
                code, err = self.invoke(control, *argv)
                self.assertEqual(code, 75); self.assertIn('busy', err)
        self.assertEqual((self.root / 'state/state.json').read_bytes(), self.journal)

    def test_timer_poll_contention_stays_benign(self):
        self.assertEqual(self.invoke(agent, 'poll'), (0, ''))
        self.assertEqual((self.root / 'state/state.json').read_bytes(), self.journal)


class OperatorDiagnosticTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name); self.config = full_config(self.root)
        agent.Store(self.root / 'state').save({'current': N, 'attempts': {}, 'reports': [], 'active': None, 'paused': False})

    def invoke(self, module, *argv):
        err = io.StringIO()
        with contextlib.redirect_stderr(err), contextlib.redirect_stdout(io.StringIO()):
            code = module.run(['--config', str(self.config), *argv])
        return code, err.getvalue()

    def test_safe_rejection_is_printed_for_operator_commands(self):
        # Unprivileged files are not root owned: the real protection check rejects them.
        for module, argv in ((agent, ['status']), (agent, ['dry-run']), (control, ['rollback-previous'])):
            with self.subTest(argv=argv):
                code, err = self.invoke(module, *argv)
                self.assertEqual(code, 1)
                self.assertIn('operator files must be root owned', err)

    def test_unrelated_blocking_error_is_not_mistaken_for_lock_contention(self):
        with patch.object(runtime, 'protected', side_effect=lambda path, directory=False: Path(path)), \
             patch.object(runtime.GitHub, 'latest', side_effect=BlockingIOError('socket would block ' + SafeDiagnosticsTest.SECRET)):
            code, err = self.invoke(agent, 'poll')
        self.assertEqual(code, 1); self.assertIn('BlockingIOError', err); self.assertNotIn('ghp_', err)


class StartBudgetDispatchTest(unittest.TestCase):
    def test_server_start_subprocess_timeout_exceeds_compose_wait(self):
        with tempfile.TemporaryDirectory() as directory:
            install = Path(directory); (install / 'deploy').mkdir(); (install / 'deploy/compose.runtime.yml').write_text('services: {}\n')
            rt = runtime.Runtime({'docker_config': directory, 'install_dir': str(install), 'project': 'moss',
                                  'app_env': str(install / 'app.env')}, None)
            dispatched = []
            def fake_run(argv, **kwargs):
                dispatched.append((argv, kwargs['timeout'])); return types.SimpleNamespace(returncode=0, stdout=b'', stderr=b'')
            with patch.object(runtime.subprocess, 'run', side_effect=fake_run):
                rt.start_server(N1); rt.start_clients(N1); rt.compose('config', '--format', 'json', release=N1)
        server, sync, web, render = dispatched
        wait = int(server[0][server[0].index('--wait-timeout') + 1])
        self.assertEqual(wait, runtime.SERVER_START_SECONDS)
        self.assertGreater(server[1], wait)
        self.assertLessEqual(server[1], wait + 120)
        for argv, timeout in (sync, web):
            self.assertGreater(timeout, int(argv[argv.index('--wait-timeout') + 1]))
        self.assertLessEqual(render[1], 600)


if __name__ == '__main__': unittest.main()
