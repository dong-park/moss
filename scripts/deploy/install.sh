#!/bin/sh
# Explicit administrative installation; never called by the deployment timer/workflow.
set -eu
umask 077
[ "$(id -u)" -eq 0 ] || { echo 'root required' >&2; exit 1; }
[ "$#" -eq 2 ] || { echo 'usage: install.sh <reviewed source directory> <reviewed smoke runtime archive>' >&2; exit 1; }
source_dir=$(realpath "$1")
[ -f "$source_dir/deploy/compose.runtime.yml" ]
[ -f /etc/moss-deploy/config.json ] || { echo 'Prepare protected operator config first' >&2; exit 1; }
# Installation must not silently overwrite the running policy. Version the old directory explicitly.
[ ! -e /opt/moss-deploy ] || { echo '/opt/moss-deploy exists; pause and review a versioned upgrade' >&2; exit 1; }
for binary in python3 docker gh bun openssl; do command -v "$binary" >/dev/null; done
gh attestation verify --help >/dev/null
install -d -m 0700 /opt/moss-deploy /opt/moss-deploy/deploy /opt/moss-deploy/scripts /opt/moss-deploy/scripts/deploy
install -m 0600 "$source_dir/deploy/compose.runtime.yml" /opt/moss-deploy/deploy/
install -m 0600 "$source_dir/deploy/release.schema.json" /opt/moss-deploy/deploy/
for script in agent.py release.py runtime.py control.py; do
  install -m 0600 "$source_dir/scripts/deploy/$script" /opt/moss-deploy/scripts/deploy/
done
# The archive is produced by smoke.package.mjs; validate fixed members and bytes before extraction.
python3 - "$2" /opt/moss-deploy <<'PYTHON'
import hashlib,json,pathlib,sys,tarfile
with tarfile.open(sys.argv[1],'r:gz') as archive:
    members=archive.getmembers()
    assert {m.name for m in members}=={'smoke','smoke.mjs','manifest.json'} and len(members)==3
    assert all(m.isfile() and m.size<16*1024*1024 for m in members)
    content={m.name:archive.extractfile(m).read() for m in members}
manifest=json.loads(content['manifest.json'])
assert manifest['schemaVersion']==1 and manifest['self_contained'] is True and manifest['runtime']=='bun'
assert hashlib.sha256(content['smoke.mjs']).hexdigest()==manifest['bundle_sha256']
for name,data in content.items():
    path=pathlib.Path(sys.argv[2])/name
    with path.open('xb') as output: output.write(data)
    path.chmod(0o700 if name=='smoke' else 0o600)
PYTHON
chown -R root:root /opt/moss-deploy
chmod -R go-w /opt/moss-deploy
install -d -m 0700 /var/lib/moss-deploy /var/backups/moss-deploy
install -m 0644 "$source_dir/deploy/systemd/moss-deploy.service" /etc/systemd/system/
install -m 0644 "$source_dir/deploy/systemd/moss-deploy.timer" /etc/systemd/system/
systemctl daemon-reload
# No service or timer activation, application stop/start, DB access, or baseline inference.
echo 'Installed, inactive. Verify bootstrap, dry-run and review before enabling timer.'
