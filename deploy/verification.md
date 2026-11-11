# Implementation-lane verification — 2026-11-12

Scope: local implementation and isolated Docker validation in the GOAT worktree on dongpark. Base fetched and verified: `4b617ad3389287c51e6dafc19ce1216e1bf7b3df`. Delivery branch: `feat/deployment-automation`. Parent owns independent C4 review, PR/main integration, credentials and production activation. The historical plan remains verbatim at `spec/deployment-automation-plan.md`; implementation authorization superseded its historical no-implementation notes.

## Fresh checks

| Check | Command/tool | Observed result |
|---|---|---|
| Deployer/schema/run policy/journal/lock/outbox/credentials/install guards | `python3 -m unittest discover -s scripts/deploy/tests -v` | 27 passed, zero failures/skips |
| Image harness/assets/config/local registry/protocol guards | `node --test deploy/rehearsal/*.test.mjs` | 17 passed, zero failures/skips |
| Web full suite, Node 24 | `bun run test` in web, Bun 1.3.14 + `/tmp/moss-test-node24/bin/node` on PATH | 220 files passed; 2,010 tests passed; 8 preexisting skips; exit 0; 135.25s |
| Web static checks | `./node_modules/.bin/tsc --noEmit`, `bun run lint`, `bun run check:i18n` | Each exit 0. Lint: 3 existing warnings, no errors. i18n: existing unused-key notices |
| Server full suite, JDK 17 | `JAVA_HOME=/tmp/moss-test-jdk ./gradlew test --no-daemon --max-workers=2` | 25 suites, 152 tests, zero failures/errors/skips; BUILD SUCCESSFUL; 1m41s |
| Sync, pinned Bun 1.3.14 | `bun run typecheck`, `bun run test` | Both exit 0; 122 passed, zero failures/skips; 1,314 assertions |
| MCP, pinned Bun 1.3.14 | `bun run typecheck`, `bun run test` | Both exit 0; 43 passed, one preexisting platform skip, zero failures |
| Existing high/critical web audit policy | `python3 ../scripts/deploy/audit.py` with Bun 1.3.14 | Exit 0; valid registry report, no high/critical advisories. Lower advisories remain visible in registry JSON |
| Workflow syntax | actionlint 1.7.12 | Exit 0; every external Action pinned to a resolved commit |
| Python/shell/systemd | `python3 -m py_compile scripts/deploy/*.py`; `sh -n scripts/deploy/install.sh`; `systemd-analyze verify deploy/systemd/moss-deploy.{service,timer}` | Each exit 0 |
| Runtime Compose | `docker compose ... -f deploy/compose.runtime.yml config --quiet`, generated test-only env | Exit 0; no containers created by this check |
| Tool bootstrap | `python3 scripts/deploy/install-tools.py --check` | Verified official archive SHA256s, gh 2.103.3 version/required provenance flags and Bun 1.3.14; disposable directory only |
| Packaged smoke | `smoke.package.mjs --package web/package.json --output PRIVATE_PATH`; validated/extracted by `install-smoke.py` | Real self-contained archive produced; runs without node_modules; absent dedicated credentials rejected with expected exit 1 |
| Changed files | `git diff --check`; `git diff --stat b11ae48904b83ff55669010800f4d7e45089e086 -- web server sync shared` | Whitespace check 0; app-source diff empty |

The eight web skips already exist in origin/main: two Dock tests, one canvasCapture test and the five-test DraggableCard frame-feel skipped group. MCP's existing macOS `sips` image-resize test is skipped on Linux; its Linux fallback test runs. No test was newly skipped or weakened. An earlier Node 26 web run in the readiness slice had two unchanged storage failures; the final full suite above used CI's Node 24 and passed.

## RED evidence

- The topology initially omitted the existing Postgres image ID (`KeyError: image` in the new negative guard). It now seals that ID as well as its volumes/network/ports, so a DB image change fails the approved-topology comparison.

- Missing/failed migration evidence was accepted: `test_evidence_cannot_omit_or_lie_about_migration_state` failed with `Rejected not raised`; the strengthened evidence validator passes it.
- Failed sync stop prevented server shutdown: `test_failed_sync_stop_still_stops_server` observed `['web','sync']` instead of `['web','sync','server']`; all writers are now attempted before failure is raised.
- Crash during preflight reported requested SHA as running SHA: the regression compared `a…` with the actual baseline `d…` and failed; recovery now reports the preserved baseline.
- Smoke trimmed significant password bytes: the test expected `' secret '` but observed `'secret'`; credentials are now validated without altering password bytes. Existing missing-email assertions remain intact.
- Actual Docker run 1 failed before business checks because Docker 27 internal networks do not publish host ports. A separate two-container reproducer showed internal `{}` vs bridge's loopback binding. The fixture now keeps DB/control internal and publishes web/API through its own edge network, always random loopback ports.
- Actual run 2 passed normal auth/two clients but failed restart pairing. Legacy readiness is now awaited and a fresh baseline worker discards local documents and DNS cache after shutdown, strengthening disk-persistence proof.
- Actual run 3 passed nine mandatory checks but failed migration-cause classification because Docker stderr was omitted. The classifier now inspects both streams and returns only a boolean, never logs.

## Actual produced-image rehearsal

Web, server and sync Docker builds all exited 0, sequentially, using `BUILD_SHA=b11ae48904b83ff55669010800f4d7e45089e086`. Subsequent source changes are confined to deployment tooling/docs; the four application directories remain identical. Public build inputs were **test-only**: `https://moss-rehearsal.invalid`, `wss://sync-rehearsal.invalid`, `rehearsal.apps.googleusercontent.com`, `isolated-rehearsal-v1`. Actual production build values belong to the GitHub Environment's four exact `NEXT_PUBLIC_*` variables.

| Service | Candidate actual Docker image ID |
|---|---|
| web | `sha256:428f80be36efa697b4588caac4f5f2758b0db13028a9e9d94ad628a582b60bc0` |
| server | `sha256:cd96420173a4f7ec8503631f5c210b7b647139d3aaeaa9a0527451314657cc22` |
| sync | `sha256:b3993e426ed3e6fe6acec8382de6da860970f89cf98d2fb13f1a592d968ed2d8` |

The baseline uses the exact preserved existing local image IDs, never a guessed source revision. Copies were pushed only to a lane-created loopback registry to obtain real content digests. These local RepoDigests are **copy identity, not source provenance**. Original production image contents/tags and application containers were not replaced. The harness refuses fake GHCR mappings; local evidence is expressly `local_only:true`, `attestation_eligible:false`, and cannot pass the host release contract.

Final command (Node 24):

```sh
node deploy/rehearsal/run.mjs --local-registry \
  --input /tmp/goat-threads-M4Kcp3/a268aacb1b47e9d5/moss-deploy-local-460s6w0o/input.json \
  --output /tmp/goat-threads-M4Kcp3/a268aacb1b47e9d5/moss-deploy-local-460s6w0o/evidence-4.json
```

Exit 0, `status: passed`. Every mandatory check is true: normal auth, two clients, graceful persistence, reconnect, offline edits, actual DB/attachment backup restore, previous→candidate→previous, old client protocol, failed-rollout restoration to the baseline, actual Flyway checksum-failure rejection. Additional SIGKILL-137 durable-shutdown rejection and fixture cleanup phases passed. Candidate Docker DB/revision healthchecks were required healthy. Baseline and candidate each had 11 migration metadata rows. No production DB, dump, credentials or records were used.

Started `2026-11-11T18:52:24.974Z`, completed `18:54:44.943Z` (about 140 seconds for this entire multi-rollout fixture). **This is not a production downtime estimate.** Each phase's timings are in the evidence. Production route/CDN, data, credential and first-bootstrap behavior remain separate gates.

Evidence file SHA256: `9ed0ca660328b296d096f9936fde49a8fc1791dfebeb3823caef3f0f7c72dfb8`. Earlier failed-run evidence and build/test logs remain outside Git at the private session paths for review. All generated fixture containers/networks/volumes were removed. The lane-created ephemeral registry was stopped and removed; application images and sanitized evidence are retained for parent verification.

Final smoke archive at that artifact directory: `smoke-runtime-final.tar.gz`, SHA256 `250f4dc389a79c931ab2595992a6645c84c2b91e277b15ccaae98c44473839da`; bundle SHA256 `791f784ba5ad38632933787c08e6969349dfe385f9267db98f249b563686198a`.

Read-only final Docker projection confirmed original four Moss image IDs, original start times and zero restarts. No host installation, global CLI change, main push, PR, production stop/restart, production migration/backup/restore or service activation occurred in this lane.

## Parent portability check

On the Mac worktree, `python3 -m unittest discover -s scripts/deploy/tests -v` ran all 27 tests with zero failures. `node --test deploy/rehearsal/*.test.mjs` initially failed two asset fixture tests: BSD tar does not accept GNU tar's `--format gnu` spelling, and its default archive metadata changed the expected rejection path. The fixtures now use Python's independent standard-library tar writer for GNU, PAX and USTAR on both platforms. Every existing hash, long-path, corruption and symlink assertion is unchanged. The same Node command now passes all 17 tests with zero failures/skips; `git diff --check` exits 0. This change does not modify the production asset parser or application images.

## Remaining gates and operator inputs

NOT RUN: exact-head GitHub Actions/OWASP NVD audit; real GHCR publication/attestation verification; installed root agent against GitHub production requests; independent C4 review; browser old-tab/version-skew/IndexedDB/OPFS checks; production dedicated-account smoke; first production deployment/rollback and downtime measurement. Existing web 8 and MCP 1 platform skips are listed above.

- Permanent host needs only the repository-scoped fine-grained token + verified expiry (or optional dedicated App), a separate private GHCR **read-only** credential, protected app env/public config/topology/bootstrap metadata, and a dedicated normal-login smoke account/password/owned board. No secret values are recorded here. GitHub desktop OAuth is never copied.
- Before the first regular release, an operator still must publish the exact preserved legacy images to private GHCR with a **one-time package-write capability**, verify digest→original image-ID mapping, then revoke it. The permanent read:packages credential cannot do this. No successful baseline means the workflow fails closed. A different same-host bootstrap-proof contract requires explicit design/review; it is not silently substituted.
- Root policy files/credentials remain administrator-owned. GH 2.45.0 is intentionally not used for attestation; the installer provides dedicated pinned tools. Normal auth is proved on the still-serving baseline before writer shutdown, so missing/invalid smoke credentials fail without stopping the application.
- The parent has separately verified live Flyway/network/public values and GitHub permissions. Those operational observations are not local test assertions and do not confer production activation authority on this lane.

## Changed files
- `.github/workflows/audit.yml`
- `.github/workflows/ci.yml`
- `.github/workflows/release.yml`
- `.gitignore`
- `deploy/README.md`
- `deploy/compose.runtime.yml`
- `deploy/config.example.json`
- `deploy/rehearsal/README.md`
- `deploy/rehearsal/assets.mjs`
- `deploy/rehearsal/assets.test.mjs`
- `deploy/rehearsal/client-worker.mjs`
- `deploy/rehearsal/client.mjs`
- `deploy/rehearsal/contract.test.mjs`
- `deploy/rehearsal/core.mjs`
- `deploy/rehearsal/core.test.mjs`
- `deploy/rehearsal/docker.mjs`
- `deploy/rehearsal/pull.mjs`
- `deploy/rehearsal/run.mjs`
- `deploy/rehearsal/run.ts`
- `deploy/release.schema.json`
- `deploy/systemd/moss-deploy.service`
- `deploy/systemd/moss-deploy.timer`
- `deploy/verification.md`
- `scripts/deploy/agent.py`
- `scripts/deploy/audit.py`
- `scripts/deploy/control.py`
- `scripts/deploy/install-smoke.py`
- `scripts/deploy/install-tools.py`
- `scripts/deploy/install.sh`
- `scripts/deploy/publish.py`
- `scripts/deploy/release.py`
- `scripts/deploy/runtime.py`
- `scripts/deploy/smoke`
- `scripts/deploy/smoke.mjs`
- `scripts/deploy/smoke.package.mjs`
- `scripts/deploy/smoke.ts`
- `scripts/deploy/tests/test_agent.py`
- `scripts/deploy/tests/test_audit.py`
- `scripts/deploy/tests/test_contract.py`
- `scripts/deploy/tests/test_install.py`
- `scripts/deploy/tests/test_operator.py`
- `scripts/deploy/tests/test_runtime.py`
- `server/.dockerignore`
- `server/Dockerfile`
- `server/src/main/kotlin/com/moss/server/Application.kt`
- `server/src/main/kotlin/com/moss/server/Deployment.kt`
- `server/src/main/kotlin/com/moss/server/DeploymentProbe.kt`
- `server/src/test/kotlin/com/moss/server/DeploymentTest.kt`
- `spec/deployment-automation-plan.md`
- `sync/Dockerfile`
- `sync/Dockerfile.dockerignore`
- `sync/src/buildSha.ts`
- `sync/src/index.ts`
- `sync/src/internalServer.ts`
- `sync/src/server.ts`
- `sync/src/shutdown.ts`
- `sync/test/fixtures/shutdown.ts`
- `sync/test/internalServer.test.ts`
- `sync/test/server.test.ts`
- `sync/test/shutdown.test.ts`
- `web/Dockerfile`
- `web/Dockerfile.dockerignore`
- `web/next.config.ts`
- `web/src/app/api/deployment/route.test.ts`
- `web/src/app/api/deployment/route.ts`
