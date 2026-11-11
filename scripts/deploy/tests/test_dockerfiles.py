"""Executes each Dockerfile's actual BUILD_SHA guard under /bin/sh (no Docker needed)."""
from pathlib import Path
import re
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[3]
TARGETS = {'web/Dockerfile': '.build-sha', 'sync/Dockerfile': '.build-sha', 'server/Dockerfile': 'src/main/resources/build-sha'}


def guard(dockerfile):
    text = (ROOT / dockerfile).read_text()
    self_check = re.findall(r'^ARG BUILD_SHA(=.*)?$', text, re.M)
    runs = [line[4:] for line in text.splitlines() if line.startswith('RUN ') and 'BUILD_SHA' in line]
    assert len(self_check) == 1 and len(runs) == 1, dockerfile
    return self_check[0], runs[0]


class BuildIdentityGuardTest(unittest.TestCase):
    def run_guard(self, dockerfile, value):
        default, script = guard(dockerfile)
        with tempfile.TemporaryDirectory() as directory:
            (Path(directory) / 'src/main/resources').mkdir(parents=True)
            env = {'PATH': '/usr/bin:/bin'}
            if value is not None: env['BUILD_SHA'] = value
            elif default: env['BUILD_SHA'] = default[1:]
            result = subprocess.run(['sh', '-c', script], cwd=directory, env=env, capture_output=True)
            identity = Path(directory) / TARGETS[dockerfile]
            return result.returncode, identity.read_text() if identity.exists() else None

    def test_unversioned_manual_build_writes_no_identity(self):
        for dockerfile in TARGETS:
            with self.subTest(dockerfile=dockerfile):
                self.assertEqual(self.run_guard(dockerfile, None), (0, None))
                self.assertEqual(self.run_guard(dockerfile, ''), (0, None))

    def test_explicit_revision_is_strict(self):
        sha = 'a' * 40
        for dockerfile in TARGETS:
            with self.subTest(dockerfile=dockerfile):
                self.assertEqual(self.run_guard(dockerfile, sha), (0, sha))
                for bad in ('main', 'a' * 39, 'a' * 41, 'g' * 40, sha + ' ', 'unknown-bootstrap'):
                    code, identity = self.run_guard(dockerfile, bad)
                    self.assertNotEqual(code, 0, bad); self.assertIsNone(identity)

    def test_release_workflow_always_passes_the_event_sha(self):
        workflow = (ROOT / '.github/workflows/release.yml').read_text()
        self.assertIn('BUILD_SHA=${{ github.sha }}', workflow)


if __name__ == '__main__': unittest.main()
