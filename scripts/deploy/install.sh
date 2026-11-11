#!/bin/sh
# Explicit administrative installation; never called by the deployment timer/workflow.
set -eu
umask 077
[ "$(id -u)" -eq 0 ] || { echo 'root required' >&2; exit 1; }
[ "$#" -eq 1 ] || { echo 'usage: install.sh <reviewed source directory>' >&2; exit 1; }
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
for script in agent.py release.py runtime.py control.py smoke.ts; do
  install -m 0600 "$source_dir/scripts/deploy/$script" /opt/moss-deploy/scripts/deploy/
done
# Smoke imports the existing pinned sync Yjs client dependencies; install without production credentials.
# The reviewed application source/dependencies are copied separately by packaging; fail if absent.
[ -f "$source_dir/deploy/rehearsal/smoke-runtime.tar.gz" ] || {
  echo 'Prepare reviewed smoke runtime package using deploy/rehearsal tooling first' >&2; exit 1;
}
tar -xzf "$source_dir/deploy/rehearsal/smoke-runtime.tar.gz" -C /opt/moss-deploy
chown -R root:root /opt/moss-deploy
chmod -R go-w /opt/moss-deploy
install -d -m 0700 /var/lib/moss-deploy /var/backups/moss-deploy
install -m 0644 "$source_dir/deploy/systemd/moss-deploy.service" /etc/systemd/system/
install -m 0644 "$source_dir/deploy/systemd/moss-deploy.timer" /etc/systemd/system/
systemctl daemon-reload
# No service or timer activation, application stop/start, DB access, or baseline inference.
echo 'Installed, inactive. Verify bootstrap, dry-run and review before enabling timer.'
