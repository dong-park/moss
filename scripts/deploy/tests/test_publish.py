"""First-release baseline wait in the GitHub-hosted rehearsal input step."""
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import publish
from release import Rejected
from test_contract import manifest

BOOTSTRAP = {'images': manifest()['baseline'], 'sha': None, 'bootstrap': True, 'config_sha256': 'b' * 64}


class Clock:
    def __init__(self): self.now = 0.0; self.sleeps = []
    def __call__(self): return self.now
    def sleep(self, seconds): self.sleeps.append(seconds); self.now += seconds


def github(registered_after=None, payload=BOOTSTRAP, state='success', clock=None):
    def api(path, body=None):
        assert body is None, 'baseline lookup must be read-only'
        if path.startswith('/deployments?'):
            if registered_after is None or clock() < registered_after: return []
            return [{'id': 9, 'task': 'bootstrap', 'payload': dict(payload)}]
        return [{'state': state}]
    return api


class BaselineWaitTest(unittest.TestCase):
    def test_waits_for_bootstrap_registered_during_the_window(self):
        clock = Clock()
        with patch.object(publish, 'api', github(registered_after=200, clock=clock)):
            self.assertEqual(publish.baseline(900, clock=clock, sleep=clock.sleep), BOOTSTRAP)
        self.assertGreaterEqual(clock.now, 200); self.assertLess(clock.now, 900)

    def test_fails_after_bounded_wait_without_inventing_a_baseline(self):
        clock = Clock()
        with patch.object(publish, 'api', github(clock=clock)):
            with self.assertRaises(RuntimeError): publish.baseline(900, clock=clock, sleep=clock.sleep)
        self.assertEqual(clock.now, 900)

    def test_default_does_not_wait(self):
        clock = Clock()
        with patch.object(publish, 'api', github(clock=clock)):
            with self.assertRaises(RuntimeError): publish.baseline(clock=clock, sleep=clock.sleep)
        self.assertEqual(clock.sleeps, [])

    def test_invalid_existing_baseline_fails_immediately(self):
        clock = Clock()
        bad = dict(BOOTSTRAP, images={'web': 'moss-web:latest'})
        with patch.object(publish, 'api', github(registered_after=0, payload=bad, clock=clock)):
            with self.assertRaises(Rejected): publish.baseline(900, clock=clock, sleep=clock.sleep)
        self.assertEqual(clock.sleeps, [])

    def test_wait_is_capped(self):
        for value in (-1, 901, '900', True):
            with self.assertRaises(Rejected): publish.baseline(value)

    def test_unsuccessful_registration_is_not_a_baseline(self):
        clock = Clock()
        with patch.object(publish, 'api', github(registered_after=0, state='failure', clock=clock)):
            with self.assertRaises(RuntimeError): publish.baseline(60, clock=clock, sleep=clock.sleep)


if __name__ == '__main__': unittest.main()
