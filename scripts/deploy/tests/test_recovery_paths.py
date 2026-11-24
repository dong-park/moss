"""Legacy readiness before smoke, retained rollback proof and operator rollback outcomes."""
import http.server
import importlib.util
from pathlib import Path
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import release
import runtime
from agent import Store
from release import Rejected
from test_contract import manifest
from test_agent import FakeRuntime

spec = importlib.util.spec_from_file_location('control_under_test', Path(__file__).resolve().parents[1] / 'control.py')
control = importlib.util.module_from_spec(spec); spec.loader.exec_module(control)


def listener(ready_after):
    """Loopback HTTP server that refuses readiness (503) until `ready_after` seconds elapsed."""
    started = time.monotonic(); hits = []
    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            hits.append(time.monotonic() - started)
            self.send_response(200 if time.monotonic() - started >= ready_after else 503); self.end_headers()
        def log_message(self, *args): pass
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, f'http://127.0.0.1:{server.server_address[1]}/health', hits


class ReadinessTest(unittest.TestCase):
    def runtime_for(self, urls, timeout):
        return runtime.Runtime({'docker_config': '/tmp/test-only', 'readiness_urls': urls,
                                'readiness_timeout_seconds': timeout}, None)

    def test_waits_for_legacy_listener_before_smoke(self):
        server, url, hits = listener(2.3); self.addCleanup(server.server_close); self.addCleanup(server.shutdown)
        rt = self.runtime_for([('server', url)], 20); rt.await_ready()
        self.assertGreaterEqual(hits[-1], 2.3); self.assertGreater(len(hits), 1)

    def test_unready_service_fails_before_any_smoke_mutation(self):
        server, url, _ = listener(3600); self.addCleanup(server.server_close); self.addCleanup(server.shutdown)
        rt = self.runtime_for([('server', url)], 2)
        rt.smoke_credentials = lambda: (_ for _ in ()).throw(AssertionError('smoke started'))
        with patch.object(runtime, 'command') as external:
            with self.assertRaises(Rejected): rt.smoke(manifest())
            external.assert_not_called()

    def test_refused_connection_is_bounded(self):
        rt = self.runtime_for([('web', 'http://127.0.0.1:9/')], 1)
        started = time.monotonic()
        with self.assertRaises(Rejected): rt.await_ready()
        self.assertLess(time.monotonic() - started, 10)


def evidence_for(m):
    return dict(status='passed', sha=m['sha'], images=m['images'], baseline=m['baseline'], config_sha256=m['config_sha256'],
                checks={k: True for k in ('normal_auth', 'two_clients', 'graceful_persistence', 'reconnect', 'offline_edits',
                                          'backup_restore', 'previous_new_previous', 'old_client', 'failed_rollout', 'migration_failure')},
                migrations={'baseline': [{'version': '1', 'checksum': 1, 'success': True}],
                            'candidate': [{'version': '1', 'checksum': 1, 'success': True}]})


class RetainedProofTest(unittest.TestCase):
    def setUp(self):
        public = {'api_url': 'https://moss.test', 'sync_url': 'wss://sync.test', 'google_client_id': 'id', 'terms_version': 'v1'}
        self.current = manifest(); self.current['config_sha256'] = release.fingerprint(public)
        self.evidence = evidence_for(self.current); self.current['evidence_sha256'] = release.digest(self.evidence)
        self.previous = {'images': self.current['baseline'], 'sha': None, 'bootstrap': True, 'config_sha256': self.current['config_sha256']}
        class Offline:
            def verify(self, *args): raise AssertionError('GitHub evidence download attempted')
        self.rt = runtime.Runtime({'docker_config': '/tmp/test-only', 'public_config': public, 'topology': {'t': 1}}, Offline())
        self.rt.smoke_credentials = lambda: None
        self.rt.topology = lambda: {'t': 1}
        self.rt.metadata = lambda: self.evidence['migrations']['baseline']
        self.rt.inspect = lambda service: {'image': 'sha256:' + service}
        images = {image: 'sha256:' + service for service, image in self.current['images'].items()}
        images.update({image: 'sha256:prev-' + service for service, image in self.previous['images'].items()})
        self.docker = patch.object(runtime, 'command', side_effect=lambda argv, **kw: images[argv[3]].encode())
        self.docker.start(); self.addCleanup(self.docker.stop)

    def test_rollback_uses_retained_verified_evidence_without_github_artifact(self):
        self.rt.prepare_rollback(self.current, self.previous, evidence=self.evidence)
        self.assertEqual(self.rt.evidence, self.evidence)

    def test_tampered_retained_evidence_is_not_a_bypass(self):
        forged = evidence_for(self.current); forged['checks']['backup_restore'] = False
        with self.assertRaises(Rejected): self.rt.prepare_rollback(self.current, self.previous, evidence=forged)
        relabeled = dict(self.evidence, sha='f' * 40)
        with self.assertRaises(Rejected): self.rt.prepare_rollback(self.current, self.previous, evidence=relabeled)


class OperatorRollbackTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.store = Store(self.tmp.name)
        self.current = manifest(); self.previous = manifest(); self.previous['images'] = self.current['baseline']; self.previous['sha'] = 'd' * 40
        self.store.save({'current': self.current, 'previous': self.previous, 'current_evidence': {'retained': True},
                         'attempts': {}, 'reports': [], 'active': None, 'paused': True})
        class API:
            def repo(self, path, body=None): return {'id': 900}
        self.github = API()

    def runtime(self, fail=None):
        rt = FakeRuntime(); rt.fail = fail; rt.proofs = []
        rt.prepare_rollback = lambda current, previous, evidence=None: rt.proofs.append(evidence)
        rt.observed_migrations = [{'version': '1', 'checksum': 1, 'success': True}]
        return rt

    def test_success_commits_previous_atomically_with_actual_sha(self):
        rt = self.runtime(); saved = []; original = self.store.save
        self.store.save = lambda state: (saved.append(state.get('active') is not None and state['current'] == self.previous), original(state))
        self.assertEqual(control.rollback(self.store, rt, self.github), 900)
        self.assertNotIn(True, saved)
        state = self.store.read(); report = state['reports'][-1]
        self.assertEqual(rt.proofs, [{'retained': True}])
        self.assertEqual((state['current'], state['previous'], state['paused']), (self.previous, None, True))
        self.assertEqual((report['state'], report['sha'], report['rollback']), ('success', 'd' * 40, 'succeeded'))
        self.assertEqual(release.describe(report), 'running ' + 'd' * 40 + '; rollback=succeeded')

    def test_failed_previous_start_reports_failed_rollback_and_stopped_writers(self):
        rt = self.runtime('clients')
        with self.assertRaises(RuntimeError): control.rollback(self.store, rt, self.github)
        report = self.store.read()['reports'][-1]
        self.assertEqual((report['state'], report['running']['state'], report['rollback']), ('error', 'stopped', 'failed'))
        self.assertEqual(self.store.read()['current'], self.current)

    def test_backup_failure_before_restore_is_not_called_a_failed_rollback(self):
        rt = self.runtime('backup')
        with self.assertRaises(RuntimeError): control.rollback(self.store, rt, self.github)
        report = self.store.read()['reports'][-1]
        self.assertEqual((report['state'], report['rollback']), ('error', 'not_attempted'))


if __name__ == '__main__': unittest.main()
