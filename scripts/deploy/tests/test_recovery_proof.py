"""P3-A: a candidate history proven exact after a ready candidate server must survive a failed rollback or a
crash, so that the operator can restore the recorded current app images and reconcile without a DB restore.
Real agent.apply/recover/reconcile and real Runtime prepare/migration_compatible/observe (test_round2 Host:
docker, GitHub and smoke stubbed; Flyway rows persist across app-image rollbacks)."""
import ast
import glob
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import agent
import release
from release import Rejected
import test_round2 as r2
from test_round2 import H_N, H_N1, N, N1, images


class Crash(BaseException):
    """Power loss: not an Exception, so no agent handler can absorb it."""


class RecoveryProofTest(unittest.TestCase):
    # Reuse the round-2 world without re-running its tests.
    host = r2.MigrationRecoveryTest.host
    apply = r2.MigrationRecoveryTest.apply
    attempt = r2.MigrationRecoveryTest.attempt

    def fail_rollback_once(self):
        # Transient public-route fault spanning the candidate smoke AND the restored set's smoke.
        self.world['smoke_failures'] = {N1['sha']: 1}
        def arm(m):  # prepare's pre-stop smoke of N must pass; only the restored set's smoke fails once
            if m['sha'] == N1['sha']: self.world['smoke_failures'][N['sha']] = 1
        self.world['after_server'] = arm
        self.apply(201, N1)
        attempt = self.attempt(201)
        self.assertEqual((attempt['outcome'], attempt['rollback'], attempt['running']['state']), ('error', 'failed', 'stopped'))
        self.assertTrue(self.store.read()['paused'])
        self.assertEqual(self.world['live'], H_N1)
        return attempt

    def restore_recorded_current(self):
        # Operator runbook step: restart the journal's CURRENT app set (no DB change).
        self.world['running'] = dict(images('a'))

    def resume(self):
        fake = types.ModuleType('runtime')
        fake.load_config = fake.load_local_config = lambda path: {'state_dir': self.tmp.name}
        fake.Runtime = fake.GitHub = None  # resume never constructs them
        with patch.dict(sys.modules, {'runtime': fake}), patch.object(sys, 'argv', ['agent.py', 'resume']):
            agent.main()

    def test_failed_rollback_keeps_bound_proof_and_reconcile_then_resume_succeeds(self):
        attempt = self.fail_rollback_once()
        proof = attempt['proven_history']
        self.assertEqual(proof, {'sha256': release.digest(H_N1), 'kind': 'candidate', 'requested': N1['sha'],
                                 'evidence_sha256': N1['evidence_sha256'], 'baseline_images': N['images']})
        self.restore_recorded_current()
        agent.reconcile(self.store, self.host(), 201)
        state = self.store.read()
        self.assertTrue(state['paused'])                       # never resumes automatically
        self.assertEqual(state['current'], N)                  # no release/image change by reconcile
        self.assertEqual(state['current_migrations_sha256'], release.digest(H_N1))
        self.assertEqual(state['attempts']['201']['reconciled']['migrations_sha256'], release.digest(H_N1))
        self.resume(); self.assertFalse(self.store.read()['paused'])
        self.apply(202, N1)                                     # same migration set retried
        self.assertEqual(self.attempt(202)['outcome'], 'success')

    def test_crash_after_proof_is_recovered_with_proof_then_reconciled(self):
        host = self.host()
        def crash(m):
            if m['sha'] == N1['sha']: raise Crash()
        host.start_clients = crash
        self.world['main'] = N1['sha']
        with self.assertRaises(Crash): agent.apply(self.store, host, 203, N1)
        active = self.store.read()['active']
        self.assertEqual((active['phase'], active['proven_history']['sha256']), ('clients', release.digest(H_N1)))
        agent.recover(self.store, self.host())
        attempt = self.attempt(203)
        self.assertEqual((attempt['outcome'], attempt['failure']['code']), ('error', 'interrupted'))
        self.assertEqual(attempt['proven_history']['sha256'], release.digest(H_N1))
        self.restore_recorded_current()
        agent.reconcile(self.store, self.host(), 203)
        self.assertEqual(self.store.read()['current_migrations_sha256'], release.digest(H_N1))

    def test_reconcile_still_requires_the_recorded_current_images_running(self):
        self.fail_rollback_once()
        self.world['running'] = dict(images('b'))               # candidate left running: not the current release
        with self.assertRaises(Rejected): agent.reconcile(self.store, self.host(), 201)
        self.assertNotIn('reconciled', self.attempt(201))

    def test_reconcile_rejects_drifted_or_unreadable_live_history(self):
        self.fail_rollback_once(); self.restore_recorded_current()
        drift = [dict(r) for r in H_N1]; drift[-1]['checksum'] = 999
        for name, live in {'checksum drift': drift, 'later migration': H_N1 + [{'version': '13', 'checksum': 1, 'success': True}],
                           'prefix': H_N1[:-2], 'reordered': list(reversed(H_N1))}.items():
            with self.subTest(name=name):
                self.world['live'] = [dict(r) for r in live]
                with self.assertRaises(Rejected): agent.reconcile(self.store, self.host(), 201)
        self.world['live'] = [dict(r) for r in H_N1]; self.world['unreadable'] = True
        with self.assertRaises(Rejected): agent.reconcile(self.store, self.host(), 201)
        self.assertNotIn('reconciled', self.attempt(201))

    def test_proof_is_bound_to_the_attempt_and_current_baseline(self):
        self.fail_rollback_once(); self.restore_recorded_current()
        state = self.store.read()
        # Another error attempt without proof cannot borrow attempt 201's proof.
        state['attempts']['300'] = dict(state['attempts']['201'], proven_history=None, failure={'phase': 'smoke', 'code': 'interrupted'})
        self.store.save(state)
        with self.assertRaises(Rejected): agent.reconcile(self.store, self.host(), 300)
        for field, value in (('baseline_images', images('9')), ('requested', '9' * 40), ('kind', 'prefix')):
            with self.subTest(field=field):
                state = self.store.read(); state['attempts']['201']['proven_history'][field] = value; self.store.save(state)
                with self.assertRaises(Rejected): agent.reconcile(self.store, self.host(), 201)
                state = self.store.read(); state['attempts']['201']['proven_history'] = self.proof; self.store.save(state)

    def setUp(self):
        r2.MigrationRecoveryTest.setUp(self)
        self.proof = {'sha256': release.digest(H_N1), 'kind': 'candidate', 'requested': N1['sha'],
                      'evidence_sha256': N1['evidence_sha256'], 'baseline_images': N['images']}

    def test_no_proof_for_failed_candidate_server_start(self):
        def boom(m):
            if m['sha'] == N1['sha']: raise RuntimeError('flyway timed out')
        self.world['after_server'] = boom
        self.apply(204, N1)
        attempt = self.attempt(204)
        self.assertEqual((attempt['outcome'], attempt.get('proven_history')), ('error', None))
        self.restore_recorded_current()
        with self.assertRaises(Rejected): agent.reconcile(self.store, self.host(), 204)

    def test_no_proof_carried_from_a_crash_before_the_candidate_proof(self):
        state = self.store.read()
        state['active'] = {'id': 205, 'phase': 'server', 'manifest': N1, 'requested': N1['sha'], 'phases': {}}
        self.store.save(state); self.world['live'] = [dict(r) for r in H_N1]
        agent.recover(self.store, self.host())
        self.assertIsNone(self.attempt(205).get('proven_history'))
        self.restore_recorded_current()
        with self.assertRaises(Rejected): agent.reconcile(self.store, self.host(), 205)

    def test_contradicted_proof_is_not_kept(self):
        # History changes between proof and rollback: the pre-rollback check fails, so no proof survives.
        self.world['smoke_failures'] = {N1['sha']: 1}
        host = self.host(); original = host.halt
        def halt_and_drift():
            original(); self.world['live'].append({'version': '99', 'checksum': 9, 'success': True})
        host.halt = halt_and_drift
        self.world['main'] = N1['sha']; agent.apply(self.store, host, 206, N1)
        attempt = self.attempt(206)
        self.assertEqual((attempt['outcome'], attempt.get('proven_history')), ('error', None))


class RejectionTextSourceGuardTest(unittest.TestCase):
    """Rejected reasons are journaled and printed: they must be code-authored literals, or a literal plus one of
    the fixed-set identifiers below. A character filter alone is not an allow-list."""
    FIXED_NAMES = {'service', 'gate'}

    def test_every_rejection_message_is_literal_or_literal_plus_fixed_name(self):
        offenders = []
        for path in sorted(glob.glob(str(Path(__file__).resolve().parents[1] / '*.py'))):
            tree = ast.parse(Path(path).read_text())
            for node in ast.walk(tree):
                if not isinstance(node, ast.Call): continue
                name = getattr(node.func, 'id', None) or getattr(node.func, 'attr', None)
                if name == 'require' and len(node.args) >= 2: message = node.args[1]
                elif name == 'Rejected' and node.args: message = node.args[0]
                else: continue
                literal = isinstance(message, ast.Constant) and isinstance(message.value, str)
                fixed = (isinstance(message, ast.BinOp) and isinstance(message.op, ast.Add)
                         and isinstance(message.left, ast.Constant) and isinstance(message.left.value, str)
                         and isinstance(message.right, ast.Name) and message.right.id in self.FIXED_NAMES)
                definition = Path(path).name == 'release.py' and isinstance(message, ast.Name) and message.id == 'message'
                if not (literal or fixed or definition): offenders.append(f'{Path(path).name}:{node.lineno}')
        self.assertEqual(offenders, [])

    def test_fixed_names_only_come_from_fixed_sets(self):
        source = (Path(__file__).resolve().parents[1] / 'release.py').read_text()
        self.assertIn('for gate in GATES:', source)
        runtime_source = (Path(__file__).resolve().parents[1] / 'runtime.py').read_text()
        self.assertIn("for service,url in self.config.get('readiness_urls') or READINESS:", runtime_source)
        # container(service) is only called with SERVICES members or the literal 'postgres'.
        for call in ast.walk(ast.parse(runtime_source)):
            if isinstance(call, ast.Call) and getattr(call.func, 'attr', None) == 'container':
                arg = call.args[0]
                self.assertTrue((isinstance(arg, ast.Constant) and arg.value in ('postgres', *release.SERVICES)) or
                                (isinstance(arg, ast.Name) and arg.id in ('service', 's')), ast.unparse(call))


if __name__ == '__main__': unittest.main()
