import copy
import importlib.util
from pathlib import Path
import unittest

MODULE = Path(__file__).resolve().parents[1] / 'release.py'
spec = importlib.util.spec_from_file_location('release', MODULE)
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


def manifest():
    return {
        'version': 1, 'repository': 'dong-park/moss', 'environment': 'production',
        'sha': 'a' * 40, 'platform': 'linux/amd64', 'runtime_contract': 1,
        'config_sha256': 'b' * 64, 'run_id': 123, 'run_attempt': 1,
        'images': {s: f'ghcr.io/dong-park/moss-{s}@sha256:' + 'c' * 64 for s in release.SERVICES},
        'baseline': {s: f'ghcr.io/dong-park/moss-{s}@sha256:' + 'd' * 64 for s in release.SERVICES},
        'evidence_sha256': 'e' * 64,
    }


class ContractTest(unittest.TestCase):
    def test_valid(self):
        release.validate(manifest())

    def test_reject_before_execution(self):
        bad = [('version', 2), ('repository', 'evil/moss'), ('environment', 'staging'),
               ('sha', 'main'), ('platform', 'linux/arm64'), ('runtime_contract', 99),
               ('run_id', True), ('config_sha256', ''), ('command', 'touch /tmp/pwn')]
        for key, value in bad:
            with self.subTest(key=key):
                candidate = manifest(); candidate[key] = value
                with self.assertRaises(release.Rejected): release.validate(candidate)
        for service in release.SERVICES:
            for image in ['moss:latest', 'ghcr.io/evil/moss@sha256:'+'c'*64,
                          f'ghcr.io/dong-park/moss-{service}@sha256:'+'c'*64+';id']:
                candidate = manifest(); candidate['images'][service] = image
                with self.assertRaises(release.Rejected): release.validate(candidate)

    def test_no_missing_or_extra_images(self):
        for field in ('images', 'baseline'):
            candidate = manifest(); candidate[field]['postgres'] = 'postgres:18'
            with self.assertRaises(release.Rejected): release.validate(candidate)
            candidate = manifest(); del candidate[field]['sync']
            with self.assertRaises(release.Rejected): release.validate(candidate)

    def test_public_config_canonical_and_complete(self):
        values = dict(api_url='https://moss.test', sync_url='wss://sync.test',
                      google_client_id='test.apps.googleusercontent.com', terms_version='2026-11')
        self.assertEqual(release.fingerprint(values), release.fingerprint(dict(reversed(list(values.items())))))
        values['JWT_SECRET'] = 'do-not-publish'
        with self.assertRaises(release.Rejected): release.fingerprint(values)

    def test_trusted_run_and_all_gates(self):
        m = manifest()
        run = dict(id=123, run_attempt=1, event='push', head_sha=m['sha'], head_branch='main',
                   path='.github/workflows/release.yml', repository={'full_name':m['repository']})
        jobs = [dict(name=n, conclusion='success', status='completed') for n in release.GATES]
        release.verify_run(m, run, jobs)
        for result in ['failure','cancelled','skipped',None]:
            broken = copy.deepcopy(jobs); broken[0]['conclusion'] = result
            with self.assertRaises(release.Rejected): release.verify_run(m, run, broken)
        with self.assertRaises(release.Rejected): release.verify_run(m, run, jobs[:-1])
        for key,value in [('head_sha','f'*40),('event','pull_request'),('head_branch','evil'),('path','evil.yml')]:
            broken = dict(run); broken[key] = value
            with self.assertRaises(release.Rejected): release.verify_run(m, broken, jobs)

class EvidenceTest(unittest.TestCase):
    def evidence(self):
        m=manifest()
        return dict(status='passed',sha=m['sha'],images=m['images'],baseline=m['baseline'],config_sha256=m['config_sha256'],
             checks={k:True for k in ('normal_auth','two_clients','graceful_persistence','reconnect','offline_edits',
                     'backup_restore','previous_new_previous','old_client','failed_rollout','migration_failure')},
             migrations={'baseline':[{'version':'1','checksum':123,'success':True}],
                         'candidate':[{'version':'1','checksum':123,'success':True}]})
    def test_evidence_cannot_omit_or_lie_about_migration_state(self):
        evidence=self.evidence(); m=manifest(); m['evidence_sha256']=release.digest(evidence)
        release.verify_evidence(m,evidence)
        for value in ({}, {'baseline':[], 'candidate':[]},
                      {'baseline':[{'success':True}],'candidate':[{'success':False}]}):
            evidence=self.evidence(); evidence['migrations']=value; m['evidence_sha256']=release.digest(evidence)
            with self.assertRaises(release.Rejected): release.verify_evidence(m,evidence)

if __name__ == '__main__': unittest.main()
