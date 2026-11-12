"""Observed-state reporting, atomic commit, poison requests, outbox policy and local controls."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import sys
import tempfile
import time
import types
import unittest
import urllib.error
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import release
from release import Rejected
from test_contract import manifest
from test_agent import FakeRuntime

spec = importlib.util.spec_from_file_location('agent_under_test', Path(__file__).resolve().parents[1] / 'agent.py')
agent = importlib.util.module_from_spec(spec); spec.loader.exec_module(agent)


class Crash(BaseException):
    """Simulated power loss: not an Exception, so no handler in the agent can absorb it."""


class StopFails(FakeRuntime):
    def stop(self): self.calls.append('stop'); raise RuntimeError('docker stop failed')


class OnceFailingSmoke(FakeRuntime):
    def smoke(self, m):
        self.calls.append('smoke')
        if self.calls.count('smoke') == 1: raise RuntimeError('candidate smoke failed')


def bootstrap_baseline():
    return {'images': manifest()['baseline'], 'sha': None, 'bootstrap': True, 'config_sha256': 'b' * 64}


class Base(unittest.TestCase):
    baseline_kind = 'known'

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.store = agent.Store(Path(self.tmp.name)); self.rt = FakeRuntime(); self.m = manifest()
        if self.baseline_kind == 'known':
            self.old = manifest(); self.old['images'] = self.m['baseline']; self.old['sha'] = 'd' * 40
        else:
            self.old = bootstrap_baseline()
        self.store.save({'current': self.old, 'attempts': {}, 'reports': [], 'active': None})

    def last_report(self): return self.store.read()['reports'][-1]
    def attempt(self, ident=42): return self.store.read()['attempts'][str(ident)]
    def run_release(self): agent.apply(self.store, self.rt, 42, self.m)


class ObservedStateTest(Base):
    def expected_baseline(self): return self.old.get('sha') or 'legacy-bootstrap'

    def test_failed_rollback_reports_stopped_writers_not_running_bootstrap(self):
        self.rt.fail = 'clients'; self.run_release()
        report = self.last_report(); text = release.describe(report)
        self.assertEqual(report['state'], 'error')
        self.assertEqual(report['running']['state'], 'stopped')
        self.assertEqual(report['rollback'], 'failed')
        self.assertIsNone(report['sha'])
        self.assertIn('writers stopped', text); self.assertIn(self.expected_baseline(), text)
        self.assertIn('rollback=failed', text); self.assertNotIn('running', text)
        self.assertNotIn('unknown bootstrap', text)

    def test_successful_rollback_reports_actual_running_baseline(self):
        self.rt = OnceFailingSmoke(); self.run_release()
        report = self.last_report()
        self.assertEqual((report['state'], report['rollback'], report['sha']), ('failure', 'succeeded', self.old.get('sha')))
        self.assertEqual(release.describe(report), f'running {self.expected_baseline()}; rollback=succeeded')
        self.assertEqual(self.attempt()['running']['images'], self.old['images'])

    def test_stop_failure_reports_unverified_writers(self):
        self.rt = StopFails(); self.run_release()
        report = self.last_report()
        self.assertEqual((report['state'], report['running']['state'], report['rollback']), ('error', 'unverified', 'not_attempted'))
        self.assertIn('writer stop unverified', release.describe(report))

    def test_prepare_failure_reports_untouched_serving_baseline(self):
        def broken(*args): raise RuntimeError('registry unavailable')
        self.rt.prepare = broken; self.run_release()
        self.assertEqual(release.describe(self.last_report()), f'running {self.expected_baseline()}; rollback=not_attempted')

    def test_crash_recovery_distinguishes_interrupted_rollback(self):
        for phase, rollback in (('server', 'not_attempted'), ('rollback', 'failed')):
            with self.subTest(phase=phase):
                state = self.store.read(); state['active'] = {'id': 7, 'phase': phase, 'manifest': self.m, 'requested': self.m['sha']}
                self.store.save(state); agent.recover(self.store, self.rt)
                report = self.last_report()
                self.assertEqual((report['state'], report['running']['state'], report['rollback'], report['requested']),
                                 ('error', 'stopped', rollback, self.m['sha']))
                state = self.store.read(); state['attempts'].pop('7'); self.store.save(state)

    def test_failed_candidate_server_start_is_unknown_schema_without_previous_restart(self):
        # Flyway rows still match a rehearsed history, but the candidate start itself failed or timed out.
        self.rt.fail = 'server'; self.rt.migration_safe = True; self.run_release()
        self.assertEqual(self.rt.calls.count('server'), 1)
        self.assertNotIn('clients', self.rt.calls)
        report = self.last_report()
        self.assertEqual((report['state'], report['running']['state'], report['rollback']), ('error', 'stopped', 'not_attempted'))
        self.assertTrue(self.store.read()['paused'])

    def test_descriptions_fit_github_limit(self):
        for running in ('serving', 'stopped', 'unverified'):
            for rollback in release.ROLLBACK_RESULTS:
                text = release.describe({'running': {'state': running, 'release': 'f' * 40}, 'rollback': rollback, 'baseline': 'f' * 40})
                self.assertLessEqual(len(text), 140)
        with self.assertRaises(Rejected): release.describe({'sha': None, 'rollback': False})


class LegacyBaselineObservedStateTest(ObservedStateTest):
    baseline_kind = 'legacy'


class AtomicCommitTest(Base):
    def test_success_never_journals_new_current_with_active_attempt(self):
        saved = []; original = self.store.save
        def record(state): saved.append(json.loads(json.dumps(state))); original(state)
        self.store.save = record; self.run_release()
        for state in saved:
            self.assertFalse(state['active'] and state['current'] == self.m, 'new current journaled before terminal commit')
        final = self.store.read()
        self.assertEqual((final['current'], final['previous'], final['active']), (self.m, self.old, None))
        self.assertEqual(final['attempts']['42']['outcome'], 'success')
        self.assertEqual(final['reports'][-1]['sha'], self.m['sha'])

    def test_crash_at_every_journal_write_never_halts_a_committed_release(self):
        count = 0
        while True:
            count += 1
            with self.subTest(crash_at=count):
                self.setUp(); original = self.store.save; writes = [0]
                def crashing(state):
                    writes[0] += 1
                    if writes[0] == count: raise Crash()
                    original(state)
                self.store.save = crashing
                try: self.run_release(); finished = True
                except Crash: finished = False
                self.store.save = original
                if finished: break
                recovery = FakeRuntime(); agent.recover(self.store, recovery)
                state = self.store.read()
                self.assertIsNone(state['active'])
                if state['current'] == self.m:
                    self.assertEqual(state['attempts']['42']['outcome'], 'success')
                    self.assertEqual(recovery.calls, [], 'healthy committed release was halted')


class ReconcileTest(Base):
    def test_error_requires_live_reconcile_before_resume(self):
        self.rt.fail = 'clients'; self.run_release()
        state = self.store.read(); state['current_migrations_sha256'] = 'f' * 64; self.store.save(state)
        class Live(FakeRuntime):
            digest = 'e' * 64
            def observe(self, release): self.calls.append('observe'); return {'migrations_sha256': self.digest}
        live = Live()
        with self.assertRaises(Rejected): agent.reconcile(self.store, live, 42)
        self.assertNotIn('reconciled', self.attempt())
        live.digest = 'f' * 64; agent.reconcile(self.store, live, 42)
        self.assertTrue(self.store.read()['paused'])
        self.assertEqual(self.attempt()['reconciled']['running']['sha'], self.old.get('sha'))
        with self.assertRaises(Rejected): agent.reconcile(self.store, live, 42)


class FakeGitHub:
    def __init__(self, deployment=None, failures=None):
        self.deployment = deployment; self.failures = failures or {}; self.delivered = []
    def latest(self): return self.deployment
    def report(self, value):
        error = self.failures.get(value['id'])
        if error is not None: raise error
        self.delivered.append(value['id'])


class MainHarness(Base):
    """Drives agent.main() exactly as systemd does, with the runtime module replaced by fakes."""
    def poll(self, github, command='poll'):
        config = {'state_dir': self.tmp.name}
        fake = types.ModuleType('runtime')
        fake.load_config = fake.load_local_config = lambda path: config
        fake.GitHub = lambda cfg: github
        fake.Runtime = lambda cfg, gh: self.rt
        state = self.store.read(); state.setdefault('paused', False); self.store.save(state)
        with patch.dict(sys.modules, {'runtime': fake}), patch.object(sys, 'argv', ['agent.py', command]):
            agent.main()


class PoisonRequestTest(MainHarness):
    def test_string_payload_is_terminal_failure_without_writer_stop(self):
        github = FakeGitHub({'id': 77, 'sha': 'a' * 40, 'payload': 'not-an-object', 'environment': 'production', 'task': 'deploy'})
        self.poll(github)
        attempt = self.attempt(77)
        self.assertEqual((attempt['outcome'], attempt['running']['state'], attempt['sha']), ('failure', 'serving', self.old.get('sha')))
        self.assertEqual(self.rt.calls, [])
        self.assertEqual(github.delivered, [77])
        self.poll(github); self.assertEqual(len(self.store.read()['attempts']), 1)

    def test_permanently_rejected_report_does_not_block_future_requests(self):
        state = self.store.read()
        state['reports'] = [{'id': 5, 'state': 'failure', 'sha': None, 'running': {'state': 'serving', 'release': 'x'},
                             'rollback': 'not_attempted', 'baseline': 'x'}]
        self.store.save(state)
        deployment = {'id': 42, 'sha': self.m['sha'], 'payload': self.m}
        github = FakeGitHub(deployment, {5: urllib.error.HTTPError('u', 422, 'Unprocessable', {}, io.BytesIO())})
        self.poll(github)
        self.assertEqual(self.attempt()['outcome'], 'success')
        state = self.store.read()
        self.assertEqual(state['reports'], [])
        self.assertEqual([r['id'] for r in state['undeliverable']], [5])
        self.assertEqual(state['undeliverable'][0]['delivery']['last_error'], 'http 422')

    def test_transient_outage_keeps_visible_outbox_and_processes_new_request(self):
        state = self.store.read()
        state['reports'] = [{'id': 5, 'state': 'failure', 'sha': None, 'running': {'state': 'serving', 'release': 'x'},
                             'rollback': 'not_attempted', 'baseline': 'x'}]
        self.store.save(state)
        github = FakeGitHub({'id': 42, 'sha': self.m['sha'], 'payload': self.m}, {5: OSError('offline')})
        with self.assertRaises(Rejected): self.poll(github)  # visible non-zero exit, after the request ran
        self.assertEqual(self.attempt()['outcome'], 'success')
        outbox = self.store.read()['reports']
        self.assertEqual([r['id'] for r in outbox], [5])
        self.assertEqual(outbox[0]['delivery']['failures'], 2)
        self.assertEqual(github.delivered, [42])
        out = io.StringIO()
        with contextlib.redirect_stdout(out): self.poll(github, 'status')
        self.assertEqual(json.loads(out.getvalue())['reports'][0]['delivery']['last_error'], 'OSError')


class LocalControlTest(unittest.TestCase):
    """pause/status must work with an expired token and low disk; resume keeps the full preflight."""
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name); (root / 'install').mkdir(); (root / 'state').mkdir()
        old = manifest(); old['sha'] = 'd' * 40
        agent.Store(root / 'state').save({'current': old, 'attempts': {}, 'reports': [], 'active': None, 'paused': False})
        config = {'repository': 'dong-park/moss', 'project': 'moss', 'install_dir': str(root / 'install'),
                  'state_dir': str(root / 'state'), 'backup_dir': str(root / 'backup'), 'app_env': str(root / 'app.env'),
                  'bootstrap_file': str(root / 'bootstrap.json'), 'smoke_config': str(root / 'smoke.json'),
                  'docker_config': str(root / 'docker'), 'minimum_free_bytes': 10 ** 18, 'auth_mode': 'token',
                  'token_file': str(root / 'token'), 'token_expires_at': int(time.time()) - 10,
                  'public_config': {'api_url': 'https://moss.test', 'sync_url': 'wss://sync.test',
                                    'google_client_id': 'id', 'terms_version': 'v1'}}
        for name in ('app.env', 'bootstrap.json', 'smoke.json', 'token'): (root / name).write_text('x')
        self.config = root / 'config.json'; self.config.write_text(json.dumps(config)); self.root = root
        import runtime
        self.runtime = runtime
        # Ownership is root-only on the host; tests run unprivileged and record what was checked instead.
        self.checked = []
        patcher = patch.object(runtime, 'protected', side_effect=lambda path, directory=False: self.checked.append(str(path)) or Path(path))
        patcher.start(); self.addCleanup(patcher.stop)

    def run_agent(self, command):
        out = io.StringIO()
        with patch.object(sys, 'argv', ['agent.py', '--config', str(self.config), command]), contextlib.redirect_stdout(out):
            agent.main()
        return out.getvalue()

    def test_pause_and_status_with_expired_token_and_low_disk(self):
        self.run_agent('pause')
        self.assertTrue(agent.Store(self.root / 'state').read()['paused'])
        self.assertTrue(json.loads(self.run_agent('status'))['paused'])
        # Configuration and journal location are still protection-checked.
        self.assertIn(str(self.config), self.checked); self.assertIn(str(self.root / 'state'), self.checked)

    def test_resume_still_requires_full_external_preflight(self):
        with self.assertRaises(Rejected): self.run_agent('resume')
        self.assertFalse(agent.Store(self.root / 'state').read()['paused'])


if __name__ == '__main__': unittest.main()
