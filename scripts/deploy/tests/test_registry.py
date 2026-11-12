"""Private GHCR package boundary: fixed new image repositories only, and the release build proves all three
pre-provisioned packages private and linked to dong-park/moss before (and after) any push."""
import contextlib
import copy
import http.server
import io
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import threading
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import publish
import release
from release import Rejected

ROOT = Path(__file__).resolve().parents[3]
NEW = {s: f'ghcr.io/dong-park/moss-deploy-{s}' for s in ('web', 'server', 'sync')}
RETIRED_PUBLIC = {s: f'ghcr.io/dong-park/moss-{s}' for s in ('web', 'server', 'sync')}
DIGEST = '@sha256:' + 'c' * 64
TOKEN = 'ghs_unit-test-secret-value'


def metadata(service):
    return {'id': 1, 'name': f'moss-deploy-{service}', 'package_type': 'container', 'visibility': 'private',
            'owner': {'login': 'dong-park', 'type': 'User'},
            'repository': {'id': 1383130341, 'full_name': 'dong-park/moss', 'private': False}}


class Registry:
    """Fake fixed GitHub/GHCR endpoints; records every request and whether it carried a credential."""
    def __init__(self, api=None, anon_token=(200, b'{"token":"anon"}'), anon_tags=(401, b'')):
        self.api = api or {}; self.anon_token = anon_token; self.anon_tags = anon_tags; self.calls = []

    def __call__(self, url, token=None):
        self.calls.append((url, token))
        match = re.fullmatch(r'https://api\.github\.com/users/dong-park/packages/container/moss-deploy-(web|server|sync)', url)
        if match:
            service = match.group(1)
            value = self.api.get(service, (200, metadata(service)))
            if callable(value): return value()
            status, body = value
            return status, body if isinstance(body, bytes) else json.dumps(body).encode()
        if re.fullmatch(r'https://ghcr\.io/token\?scope=repository:dong-park/moss-deploy-(web|server|sync):pull&service=ghcr\.io', url):
            return self.anon_token
        if re.fullmatch(r'https://ghcr\.io/v2/dong-park/moss-deploy-(web|server|sync)/tags/list', url):
            return self.anon_tags
        raise AssertionError('unexpected URL ' + url)


class WhitelistTest(unittest.TestCase):
    def test_single_fixed_whitelist(self):
        self.assertEqual(release.IMAGE_REPOSITORIES, NEW)
        self.assertEqual(release.PACKAGE_OWNER, 'dong-park')
        self.assertEqual(release.REPOSITORY_ID, 1383130341)
        self.assertEqual(release.RETIRED_IMAGE_REPOSITORIES, tuple(RETIRED_PUBLIC.values()))

    def test_new_refs_accepted_old_public_and_other_refs_rejected(self):
        release.image_set({s: NEW[s] + DIGEST for s in NEW})
        for service in NEW:
            for image in [RETIRED_PUBLIC[service] + DIGEST, NEW['web' if service != 'web' else 'sync'] + DIGEST,
                          NEW[service] + ':latest', NEW[service] + '@sha256:' + 'C' * 64,
                          'ghcr.io/evil/moss-deploy-' + service + DIGEST, NEW[service] + '-x' + DIGEST,
                          NEW[service] + '/x' + DIGEST, 'GHCR.io/dong-park/moss-deploy-' + service + DIGEST,
                          'docker.io/dong-park/moss-deploy-' + service + DIGEST]:
                with self.subTest(service=service, image=image):
                    images = {s: NEW[s] + DIGEST for s in NEW}; images[service] = image
                    with self.assertRaises(Rejected): release.image_set(images)

    def test_json_schema_patterns_match_the_whitelist(self):
        schema = json.loads((ROOT / 'deploy/release.schema.json').read_text())
        for field in ('images', 'baseline'):
            for service in NEW:
                pattern = schema['properties'][field]['properties'][service]['pattern']
                self.assertEqual(pattern, '^' + re.escape(NEW[service]).replace('\\-', '-') + '@sha256:[0-9a-f]{64}$')
                self.assertTrue(re.search(pattern, NEW[service] + DIGEST))
                for old in RETIRED_PUBLIC.values():
                    self.assertIsNone(re.search(pattern, old + DIGEST))

    def test_rehearsal_js_whitelist_mirrors_python(self):
        source = (ROOT / 'deploy/rehearsal/core.mjs').read_text()
        line = re.search(r'^export const IMAGE_REPOSITORIES = Object\.freeze\((\{.*\})\);$', source, re.M).group(1)
        self.assertEqual(dict(re.findall(r"(\w+): '([^']+)'", line)), NEW)
        self.assertNotRegex(source, r'ghcr\\?\.io\\?/\[')  # no generic GHCR namespace pattern remains

    def test_publish_image_identity_uses_new_repository(self):
        for service in NEW:
            result = subprocess.run([sys.executable, '-E', '-s', str(ROOT / 'scripts/deploy/publish.py'), 'image'],
                                    env={'SERVICE': service, 'DIGEST': 'sha256:' + 'a' * 64, 'PATH': os.environ['PATH']},
                                    capture_output=True, text=True, timeout=30)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(result.stdout), {'service': service, 'image': NEW[service] + '@sha256:' + 'a' * 64})


class PrivatePackageMetadataTest(unittest.TestCase):
    def test_private_repository_linked_metadata_passes(self):
        for service in NEW: release.private_package(service, metadata(service))

    def test_public_missing_mismatched_or_malformed_metadata_rejects(self):
        def changed(path, value):
            def make(service):
                data = metadata(service); target = data
                for key in path[:-1]: target = target[key]
                if value is KeyError: del target[path[-1]]
                else: target[path[-1]] = value
                return data
            return make
        cases = {
            'public': changed(('visibility',), 'public'), 'internal': changed(('visibility',), 'internal'),
            'no visibility': changed(('visibility',), KeyError), 'old public name': lambda s: dict(metadata(s), name=f'moss-{s}'),
            'other service name': lambda s: dict(metadata(s), name='moss-deploy-x'),
            'npm': changed(('package_type',), 'npm'), 'other owner': changed(('owner', 'login'), 'evil'),
            'owner missing': changed(('owner',), KeyError), 'owner string': changed(('owner',), 'dong-park'),
            'unlinked': changed(('repository',), None), 'no repository': changed(('repository',), KeyError),
            'other repo id': changed(('repository', 'id'), 1), 'string repo id': changed(('repository', 'id'), '1383130341'),
            'bool repo id': changed(('repository', 'id'), True), 'float repo id': changed(('repository', 'id'), 1383130341.0),
            'other repo name': changed(('repository', 'full_name'), 'evil/moss'),
            'list': lambda s: [metadata(s)], 'null': lambda s: None,
        }
        for label, make in cases.items():
            for service in NEW:
                with self.subTest(label=label, service=service), self.assertRaises(Rejected):
                    release.private_package(service, make(service))
        with self.assertRaises(Rejected): release.private_package('postgres', metadata('web'))


class PublishRegistryProofTest(unittest.TestCase):
    def test_all_three_private_and_anonymous_denied(self):
        fake = Registry()
        publish.registry(TOKEN, fetch=fake)
        api = [c for c in fake.calls if c[0].startswith('https://api.github.com/')]
        self.assertEqual([u for u, _ in api], [f'https://api.github.com/users/dong-park/packages/container/moss-deploy-{s}' for s in NEW])
        self.assertTrue(all(t == TOKEN for _, t in api))
        self.assertTrue(all(t != TOKEN for u, t in fake.calls if u.startswith('https://ghcr.io/')), 'anonymous probe must not carry GITHUB_TOKEN')
        for denied in [(401, b''), (403, b''), (404, b'')]:
            publish.registry(TOKEN, fetch=Registry(anon_token=denied))
            publish.registry(TOKEN, fetch=Registry(anon_tags=denied))

    def test_every_unprovable_state_rejects(self):
        public = lambda s: dict(metadata(s), visibility='public')
        def network(): raise Rejected('registry request failed')
        cases = {
            'missing 404': Registry(api={'server': (404, b'{"message":"Package not found."}')}),
            'forbidden 403': Registry(api={'sync': (403, b'{"message":"Resource not accessible by integration"}')}),
            'unauthorized 401': Registry(api={'web': (401, b'')}),
            'redirect 301': Registry(api={'web': (301, b'')}), 'redirect 302': Registry(api={'server': (302, b'')}),
            'server error': Registry(api={'web': (500, b'')}), 'created 201': Registry(api={'web': (201, metadata('web'))}),
            'public': Registry(api={'sync': (200, public('sync'))}),
            'mismatched repo id': Registry(api={'web': (200, dict(metadata('web'), repository={'id': 7, 'full_name': 'dong-park/moss'}))}),
            'bad owner': Registry(api={'server': (200, dict(metadata('server'), owner={'login': 'someone'}))}),
            'invalid json': Registry(api={'web': (200, b'{not json')}), 'array json': Registry(api={'web': (200, b'[]')}),
            'network error': Registry(api={'web': network}),
            'anonymously readable': Registry(anon_tags=(200, b'{"tags":["seed"]}')),
            'anonymous token without token': Registry(anon_token=(200, b'{}')),
            'anonymous token redirect': Registry(anon_token=(307, b'')),
            'anonymous tags redirect': Registry(anon_tags=(302, b'')), 'anonymous tags error': Registry(anon_tags=(500, b'')),
        }
        for label, fake in cases.items():
            with self.subTest(label=label), self.assertRaises(Rejected): publish.registry(TOKEN, fetch=fake)
        for token in ['', None, ' x', 'x\n', 'a b']:
            fake = Registry()
            with self.subTest(token=token), self.assertRaises(Rejected): publish.registry(token, fetch=fake)
            self.assertEqual(fake.calls, [], 'no request without a usable workflow token')

    def test_http_get_never_follows_redirects_or_forwards_credentials(self):
        seen = []
        class Handler(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                seen.append((self.path, self.headers.get('Authorization')))
                if self.path == '/start':
                    self.send_response(302); self.send_header('Location', f'http://127.0.0.1:{self.server.server_port}/elsewhere')
                    self.send_header('Content-Length', '0'); self.end_headers()
                else:
                    body = json.dumps(metadata('web')).encode()
                    self.send_response(200); self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)
            def log_message(self, *args): pass
        server = http.server.HTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
        self.addCleanup(server.server_close); self.addCleanup(server.shutdown)
        status, body = publish.http_get(f'http://127.0.0.1:{server.server_port}/start', TOKEN)
        self.assertEqual(status, 302); self.assertEqual(seen, [('/start', 'Bearer ' + TOKEN)])
        status, body = publish.http_get(f'http://127.0.0.1:{server.server_port}/ok', None)
        self.assertEqual((status, json.loads(body)['name']), (200, 'moss-deploy-web'))
        self.assertIsNone(seen[-1][1])
        with self.assertRaises(Rejected): publish.http_get('http://127.0.0.1:1/unreachable', TOKEN)


class CliBoundaryTest(unittest.TestCase):
    def run_main(self, fake, token=TOKEN):
        out, err = io.StringIO(), io.StringIO()
        with patch.object(publish, 'http_get', fake), patch.dict(os.environ, {'GH_TOKEN': token}), \
                contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = publish.main(['registry'])
        return code, out.getvalue() + err.getvalue()

    def test_failing_proof_exits_nonzero_without_secret_or_detail(self):
        def boom(url, token=None): raise RuntimeError('detail with ' + str(token))
        for fake in [Registry(api={'web': (200, dict(metadata('web'), visibility='public'))}),
                     Registry(api={'server': (403, b'secret-body')}), boom]:
            code, output = self.run_main(fake)
            self.assertEqual(code, 1)
            self.assertNotIn(TOKEN, output); self.assertNotIn('secret-body', output); self.assertNotIn('detail', output)
            self.assertNotIn('Traceback', output); self.assertIn('Rejected:', output)

    def test_passing_proof_exits_zero(self):
        code, output = self.run_main(Registry())
        self.assertEqual(code, 0); self.assertNotIn(TOKEN, output)

    def test_real_cli_without_token_fails_before_any_request(self):
        result = subprocess.run([sys.executable, '-E', '-s', str(ROOT / 'scripts/deploy/publish.py'), 'registry'],
                                env={'PATH': os.environ['PATH']}, capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 1)
        self.assertNotIn('Traceback', result.stderr); self.assertIn('Rejected:', result.stderr)


class WorkflowOrderingTest(unittest.TestCase):
    def setUp(self):
        self.text = (ROOT / '.github/workflows/release.yml').read_text()
        build = self.text.split('\n  build:\n', 1)[1].split('\n  rehearsal:\n', 1)[0]
        self.build = build
        self.steps = re.split(r'\n      - ', build.split('\n    steps:\n', 1)[1])

    def index(self, needle):
        found = [i for i, step in enumerate(self.steps) if needle in step]
        self.assertTrue(found, needle); return found

    def test_privacy_proof_precedes_login_build_and_push_and_reruns_before_identity(self):
        proofs = self.index('python3 scripts/deploy/publish.py registry')
        self.assertEqual(len(proofs), 2)
        pre, post = proofs
        for needle in ('docker/setup-buildx-action@', 'docker/login-action@', 'docker/build-push-action@', 'actions/attest@'):
            self.assertLess(pre, min(self.index(needle)), needle)
        self.assertLess(max(self.index('docker/build-push-action@') + self.index('actions/attest@')), post)
        self.assertLess(post, min(self.index('publish.py image')))
        self.assertLess(post, min(self.index('actions/upload-artifact@')))
        for i in proofs:
            self.assertIn('GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}', self.steps[i])
            self.assertNotIn('continue-on-error', self.steps[i]); self.assertNotIn('if:', self.steps[i])
        self.assertNotIn('continue-on-error', self.build)
        self.assertRegex(self.build, r'\n    permissions:\n      contents: read\n      packages: write\n')

    def test_images_and_attestations_use_only_new_private_names_and_no_new_secret(self):
        self.assertIn('tags: ghcr.io/dong-park/moss-deploy-${{ matrix.service }}:${{ github.sha }}-${{ github.run_attempt }}', self.build)
        self.assertIn('subject-name: ghcr.io/dong-park/moss-deploy-${{ matrix.service }}\n', self.build)
        self.assertIn('org.opencontainers.image.source=https://github.com/dong-park/moss\n', self.build)
        self.assertNotRegex(self.text, r'ghcr\.io/dong-park/moss-(?!deploy-)')
        self.assertEqual(set(re.findall(r'secrets\.([A-Z_]+)', self.text)), {'GITHUB_TOKEN', 'NVD_API_KEY'})
        for uses in re.findall(r'uses: (\S+)', self.text):
            if not uses.startswith('./'): self.assertRegex(uses, r'@[0-9a-f]{40}$')



class RegistryPreflightWorkflowTest(unittest.TestCase):
    """The operator diagnostic is metadata-only: exact checkout, read scopes, the same proof, nothing else."""
    def test_preflight_is_read_only_bounded_and_runs_only_the_proof(self):
        text = (ROOT / '.github/workflows/registry-preflight.yml').read_text()
        code = '\n'.join(l for l in text.splitlines() if not l.lstrip().startswith('#'))
        self.assertIn('on:\n  push:\n    branches: [fix/private-ghcr-releases]\n  workflow_dispatch:\npermissions:\n', code)
        self.assertNotRegex(code, r'pull_request|schedule|workflow_run|repository_dispatch')
        self.assertIn('permissions:\n  contents: read\n  packages: read\nconcurrency:', code)
        self.assertEqual(code.count('permissions:'), 1)
        self.assertNotRegex(code, r'write|id-token|attest|docker|deployments|continue-on-error|\bif:')
        self.assertIn('timeout-minutes: 3\n', code)
        self.assertEqual(re.findall(r'uses: (\S+)', code), ['actions/checkout@11d5960a326750d5838078e36cf38b85af677262'])
        self.assertIn('ref: ${{ github.sha }}\n          persist-credentials: false\n', code)
        self.assertEqual(re.findall(r'run: (.+)', code), ['python3 scripts/deploy/publish.py registry'])
        self.assertEqual(re.findall(r'secrets\.([A-Z_]+)', code), ['GITHUB_TOKEN'])
        self.assertEqual(re.findall(r'^\s+([A-Z_]+):', code, re.M), ['GH_TOKEN'])


if __name__ == '__main__': unittest.main()
