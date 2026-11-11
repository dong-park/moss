# Verified single-host release automation

This C4 implementation is not an activation approval. The historical plan in [deployment-automation-plan.md](../spec/deployment-automation-plan.md) is preserved verbatim. The implementation lane was subsequently authorized; production installation, credentials, main integration and activation belong to the parent/operator.

`release.yml` calls all four existing CI jobs and both audit jobs, then builds three linux/amd64 images, attests their exact digests, rehearses them against the previous successful image set, attests the evidence, creates one explicit GitHub deployment and waits up to 30 minutes for its host result. A failed/skipped/cancelled/missing gate cannot publish a request. Concurrency does not cancel an active replacement. Production environment access uses `deployment: false` to avoid phantom deployment history. PR CI/audit remain separate; main enters through release.

The root-installed timer retrieves data-only deployment payloads. It checks schema v1, source main/SHA, repository/workflow/run attempt, all successful gate jobs, signed evidence and each image's GitHub attestation. Download, topology, configuration, migration baseline and rollback image checks precede writer shutdown. It rechecks main immediately before stopping writers. Images are fixed digest references; it never builds, pulls source, executes requested commands, recreates Postgres, runs `compose down`, removes volumes or performs global image cleanup.

## Operator inputs and prerequisites

Prepare values through the secret handoff/manager, never chat, logs or a committed file. The example JSON deliberately contains invalid nulls; it is documentation and cannot activate deployment.

- GitHub production environment: restrict to main, no mandatory per-release approval, public variables `NEXT_PUBLIC_MOSS_API_URL`, `NEXT_PUBLIC_MOSS_SYNC_URL`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_MOSS_TERMS_VERSION`. All four are required. API must be https and sync wss. Server runtime `PUBLIC_BASE_URL`, `GOOGLE_CLIENT_ID`, `MOSS_TERMS_VERSION` must match.
- Repository `NVD_API_KEY` for the reused audit workflow. No inherited secret set is passed.
- GitHub-hosted build/rehearsal/request jobs; no production runner. Private-repository GitHub attestations require Enterprise Cloud according to the official documentation. Do not disable provenance when unavailable.
- Choose `auth_mode: token` with a fine-grained PAT restricted to `dong-park/moss` (contents/actions read, deployments write, and attestation read when required by the private attestation endpoint), or `auth_mode: app` with a dedicated GitHub App installed on this repository only: contents/actions/attestations read, deployments write, metadata read. For App mode, configure App ID, installation ID and a root-readable private key. For scoped-token mode, put the token in a separate root-owned 0600 `token_file` and set the administrator-verified `token_expires_at` Unix timestamp. A token within 60 seconds of expiry fails closed; replacement file contents are reloaded on every API request. Renew before expiry, atomically replace the protected file, and update the protected expiry metadata. Never use the desktop gh OAuth token on production. No browser login on the host is required. The agent mints short-lived installation tokens and refreshes them; no token is printed or stored in state.
- Private GHCR read-only credential in root's isolated `DOCKER_CONFIG`. GitHub App installation tokens are not substituted for GHCR download authorization. Keep `packages:write`, `id-token:write`, `attestations:write` confined to producing jobs; host has no package write permission.
- Docker 27+/Compose 2.29+, Python 3.12+, OpenSSL, Bun 1.3.14 and a current GitHub CLI supporting `attestation verify`, `--source-digest`, `--signer-digest`, `--source-ref`, `--deny-self-hosted-runners`. The host's observed gh 2.45.0 is too old; the installer stages checksum-pinned gh 2.103.3 and Bun 1.3.14 under `/opt/moss-deploy/bin`, and checks every required provenance flag. `python3 scripts/deploy/install-tools.py --check` verifies downloads/flags in a disposable directory without installation. Archive extraction selects only the known binary member; it does not execute a remote installer or read the desktop gh configuration. Runtime attestation always invokes that dedicated CLI and isolates `GH_CONFIG_DIR`. The production Postgres container/image/major remains unchanged.
- Dedicated normal password-login account and owned board for smoke. Missing credentials block success; no JWT minting/bypass endpoint. Supply protected credentials/config; the installed smoke hashes assets extracted from the exact running web image and compares public HTML references and bytes. Operator-provided asset hashes are rejected. See [rehearsal](rehearsal/README.md).
- Existing deployment app environment copied through the secret manager into `/etc/moss-deploy/app.env`, mode 0600, root owned. Preserve all existing operational values. Do not dump environment variables or Docker Config.Env to inspect it.

All files in `/opt/moss-deploy`, `/etc/moss-deploy` and state must be owned by root and protected from other writers. Docker socket access is administrator authority. `systemd` hardening does not sandbox that authority. The fixed runtime Compose preserves project `moss`, network `moss_default`, volumes `moss_pgdata`/`moss_filedata`, and loopback ports 3001/8080/1234. Compare the exact approved topology before installation; a different topology requires reviewed policy, not payload parameters.

## First release without baseline provenance

The running legacy images have no registry digest and their source is not established by checkout/OCI labels. Never relabel them as main, rebuild them and call that preservation, or claim their source SHA.

1. Read only the actual three running image IDs, container bindings, mounts and network names. Read only ordered Flyway `version, checksum, success` metadata. Save a sanitized operator inventory; no user/board records. Confirm Postgres major and the existing named volumes/network. Preserve the current source checkout separately; do not pull into it.
2. Explicitly export each exact running image with `docker image save` into protected recovery storage and checksum it. An operator with package write permission publishes the preserved images under the fixed `ghcr.io/dong-park/moss-{web,server,sync}` repositories, obtains digests, then pulls and verifies **each digest resolves to the original image ID**. Keep protected exports and local IDs; unknown source remains unknown. These manual actions are outside the timer and this implementation lane.
3. Run isolated legacy→candidate→legacy actual-image compatibility and backup/restore checks with those exact digests. The initial legacy identity check compares image IDs and public assets, records `sha: null`, and cannot establish candidate revision. Failures block activation.
4. Prepare `/etc/moss-deploy/bootstrap.json` with exactly `{images:{web,server,sync},sha:null,bootstrap:true,config_sha256}`. The fingerprint is SHA256 of sorted compact JSON of exactly `{api_url,sync_url,google_client_id,terms_version}`. Record the approved topology and Flyway fingerprint in protected `config.json`. Bootstrap verifies local digest→running image ID, topology, public configuration fingerprint and migration metadata before initializing **paused** state.
5. The operator registers a GitHub `production` deployment with `task: bootstrap`, the same baseline payload, and success only after those observations/rehearsal are reviewed. That record is an admin baseline registration, not a provenance claim. The release workflow refuses to invent its own baseline when none exists.
6. Package/install the reviewed host policy and smoke runtime (`scripts/deploy/smoke.package.mjs` emits a real archive outside the checkout; pass it as the second argument to `install.sh`), run bootstrap and a real read-only `dry-run`, independently review the exact code/evidence, then explicitly enable the timer. The deployment request's SHA/target and parent production activation scope must be confirmed.

Do not upgrade or recreate Postgres. `compose.runtime.yml` declares it only so backup commands can address the existing service. Every app startup uses explicit app services with `--no-deps --no-build --pull never`. External volumes/network prevent implicit replacement.

## Administrative commands

Run from an administrator terminal; never type secret values into command history.

```sh
python3 /opt/moss-deploy/scripts/deploy/agent.py bootstrap
python3 /opt/moss-deploy/scripts/deploy/agent.py dry-run
python3 /opt/moss-deploy/scripts/deploy/agent.py status
python3 /opt/moss-deploy/scripts/deploy/agent.py resume
systemctl enable --now moss-deploy.timer
```

`dry-run` validates the latest request, trusted run, attested evidence, local baseline, public configuration, topology and migration state, but does not pull/start/stop containers or modify state. Images' attestations/pulls happen in the regular preflight before shutdown. Missing credentials and offline GitHub fail closed.

```sh
python3 /opt/moss-deploy/scripts/deploy/agent.py pause
python3 /opt/moss-deploy/scripts/deploy/control.py retry EXISTING_DEPLOYMENT_ID
python3 /opt/moss-deploy/scripts/deploy/control.py rollback-previous
```

Timer and operator commands share one nonblocking file lock. Pause takes effect between replacements. Retry creates a fresh deployment ID for an existing verified request only when its SHA is still main and its rehearsed baseline remains current; it cannot accept an arbitrary tag/SHA. Rollback accepts no target: it verifies signed current-release compatibility evidence, recorded previous images, live migration state and exact running identities, stops writers, backs up current data, restores the previous **app images**, performs smoke, and leaves automation paused. It never restores a database. Rollback history reports the requested target and actual running version (unknown for bootstrap), distinct from original release failure.

The atomically replaced, fsynced state journal preserves attempts and pending GitHub result reports. A repeated deployment ID never reapplies. Reporting outages retry only the durable outbox. A crash/reboot during replacement stops writers and records intervention rather than guessing migration safety. Requests that fail are terminal; the timer never retries them every minute. Do not delete state to force a retry.

## Backup, failure and recovery

Web, then sync, then server stop sequentially. Sync must exit 0 after persistence; web/server may exit 0 or graceful SIGTERM 143. OOM/forced kill or failed sync persistence requires intervention. Only once writers are stopped does the deployer take a custom-format DB dump from the still-running Postgres and archive the existing attachment volume through a read-only, networkless helper using the preserved server image. Backup files are private. The existing online cron script is unchanged and retains its retention policy; it is not used as a consistent deployment recovery point because its attachment tar requires a running server and its DB/files can represent different times. Deployment backup directories have separate retention; preserve at least the latest recovery point and prune only via reviewed operator policy.

A backup failure restarts the preserved app set without starting the candidate. After candidate startup, actual Flyway history must equal a rehearsed successful baseline/candidate history. Unknown history, checksum divergence, partial/failed migration or inability to stop writers leaves writers stopped, records `error`, pauses automation and requires manual intervention. A failed candidate with compatible known DB history may restore the previous image set and must pass normal smoke. The original release still reports failure and the actual running SHA/rollback result. An app rollback is never a DB rollback.

Database restoration is deliberately manual. Pause automation, stop writers, preserve current data first, identify the backup's timestamp and user-write loss window, rehearse restoration into an isolated **new** database/attachment volume and verify authenticated fixtures, then obtain explicit operations authorization for restoring production. Never restore automatically after migration failure. Reconcile the protected journal only after independent inspection of migration metadata, running image IDs, topology and authenticated smoke; `resume` refuses unresolved error attempts. There is no force-safe switch.

## Verification and evidence

```sh
python3 -m unittest discover -s scripts/deploy/tests -v
python3 -m py_compile scripts/deploy/*.py
node --test deploy/rehearsal/*.test.mjs
actionlint
sh -n scripts/deploy/install.sh
```

Run the repository's unchanged web typecheck/lint/test/i18n/build, server tests, sync typecheck/tests and MCP typecheck/tests using their CI-pinned tools. Full actual-image rehearsal, deployment/failed-rollout, restore, old client and migration-failure checks are mandatory beyond unit tests. Sign only evidence from completed real-image checks. Exact-head CI, independent C4 review and first production verification remain separate gates; local passing tests cannot establish them.

Primary sources checked 2026-11-12: [reusable workflows](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows), [environment without automatic deployment](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#example-using-an-environment-without-creating-a-deployment), [attestation permissions and private repository availability](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations), [CLI provenance policy flags](https://cli.github.com/manual/gh_attestation_verify), [GitHub Deployments API](https://docs.github.com/en/rest/deployments/deployments), [Compose up flags](https://docs.docker.com/reference/cli/docker/compose/up/).
