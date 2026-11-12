"""Real-executor integration test: Runtime.metadata() against a disposable Postgres 18.

The unit tests mock command(); this test deliberately does not. It starts an owned,
networkless, tmpfs-only Postgres container labelled like a Compose service of a unique
project, so Runtime.container() and Runtime.metadata() run their actual docker argv.
CI/release set MOSS_DEPLOY_DOCKER_TESTS=required, which turns a missing Docker into a failure.
"""
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import sys
import tempfile
import time
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import runtime
from release import Rejected

IMAGE = 'postgres:18-alpine'  # same major/tag as deploy/compose.runtime.yml
REQUIRED = os.environ.get('MOSS_DEPLOY_DOCKER_TESTS') == 'required'


def docker_available():
    # `docker info --format` can exit 0 without a daemon; only a reachable daemon reports a server version.
    if shutil.which('docker') is None: return False
    try:
        result = subprocess.run(['docker', 'version', '--format', '{{.Server.Version}}'], capture_output=True, timeout=30)
    except (OSError, subprocess.TimeoutExpired):
        return False
    return result.returncode == 0 and bool(result.stdout.strip())


# Real Flyway 10 table shape (subset of columns irrelevant to the query keeps defaults).
SCHEMA = '''
CREATE TABLE flyway_schema_history (
  installed_rank integer PRIMARY KEY, version varchar(50), description varchar(200) NOT NULL,
  type varchar(20) NOT NULL, script varchar(1000) NOT NULL, checksum integer,
  installed_by varchar(100) NOT NULL, installed_on timestamp NOT NULL DEFAULT now(),
  execution_time integer NOT NULL, success boolean NOT NULL);
'''
# Inserted out of rank order; descriptions contain shell/SQL quote characters on purpose.
ROWS = '''
INSERT INTO flyway_schema_history VALUES
 (3, '3', 'it''s "quoted" $HOME `x`', 'SQL', 'V3__q.sql', -1588452116, 'moss', now(), 4, true),
 (1, '1', 'init', 'SQL', 'V1__init.sql', 1033404372, 'moss', now(), 10, true),
 (2, '2', 'next', 'SQL', 'V2__next.sql', 0, 'moss', now(), 3, true);
'''
EXPECTED = [{'version': '1', 'checksum': 1033404372, 'success': True},
            {'version': '2', 'checksum': 0, 'success': True},
            {'version': '3', 'checksum': -1588452116, 'success': True}]


@unittest.skipIf(not REQUIRED and not docker_available(),
                 'Docker unavailable; CI sets MOSS_DEPLOY_DOCKER_TESTS=required so this cannot be skipped there')
class RealPostgresMetadataTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if REQUIRED and not docker_available(): raise AssertionError('Docker is required for deploy executor tests')
        cls.project = 'moss-deploytest-' + secrets.token_hex(6)
        cls.name = cls.project + '-postgres'
        cls.config_dir = tempfile.TemporaryDirectory(prefix='moss-deploytest-docker-')
        cls.addClassCleanup(cls.config_dir.cleanup)
        # Always remove the owned container and its anonymous volumes, even after a failed start.
        cls.addClassCleanup(subprocess.run, ['docker', 'rm', '-f', '-v', cls.name],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=60)
        subprocess.run(['docker', 'run', '-d', '--name', cls.name, '--network', 'none',
                        '--label', 'com.docker.compose.project=' + cls.project,
                        '--label', 'com.docker.compose.service=postgres',
                        '--label', 'com.moss.deploy-test=metadata',
                        '--tmpfs', '/var/lib/postgresql:rw,size=256m',
                        '-e', 'POSTGRES_USER=fixture_user', '-e', 'POSTGRES_DB=fixture_db',
                        '-e', 'POSTGRES_PASSWORD=' + secrets.token_hex(16), IMAGE],
                       check=True, stdout=subprocess.DEVNULL, timeout=600)
        deadline = time.monotonic() + 120
        while True:
            logs = subprocess.run(['docker', 'logs', cls.name], capture_output=True, timeout=30)
            ready = b'PostgreSQL init process complete' in logs.stdout + logs.stderr and subprocess.run(
                ['docker', 'exec', cls.name, 'pg_isready', '-U', 'fixture_user', '-d', 'fixture_db'],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=30).returncode == 0
            if ready: break
            if time.monotonic() > deadline: raise AssertionError('fixture Postgres did not become ready')
            time.sleep(0.5)

    @classmethod
    def sql(cls, statement):
        # Fixture setup only; the code under test builds its own docker argv.
        subprocess.run(['docker', 'exec', '-i', cls.name, 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1',
                        '-U', 'fixture_user', '-d', 'fixture_db'], input=statement.encode(), check=True,
                       stdout=subprocess.DEVNULL, timeout=60)

    def setUp(self):
        self.sql('DROP TABLE IF EXISTS flyway_schema_history;' + SCHEMA + ROWS)
        self.runtime = runtime.Runtime({'docker_config': self.config_dir.name, 'project': self.project}, None)

    def test_actual_metadata_command_reads_ordered_history(self):
        self.assertEqual(self.runtime.metadata(), EXPECTED)

    def test_failed_migration_row_fails_closed(self):
        self.sql("UPDATE flyway_schema_history SET success = false WHERE version = '3';")
        with self.assertRaises(Rejected): self.runtime.metadata()

    def test_empty_history_fails_closed(self):
        self.sql('DELETE FROM flyway_schema_history;')
        with self.assertRaises(Rejected): self.runtime.metadata()

    def test_missing_history_table_fails_closed(self):
        self.sql('DROP TABLE flyway_schema_history;')
        with self.assertRaises(Rejected): self.runtime.metadata()

    def test_repeatable_or_baseline_rows_without_version_fail_closed(self):
        # Unversioned rows cannot be compared to rehearsed version metadata.
        self.sql("INSERT INTO flyway_schema_history VALUES (4, NULL, 'r', 'SQL', 'R__x.sql', 5, 'moss', now(), 1, true);")
        with self.assertRaises(Rejected): self.runtime.metadata()


if __name__ == '__main__': unittest.main()
