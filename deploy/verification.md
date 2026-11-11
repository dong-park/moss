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

## Review-fix round — independent C4 review of `08f6f6b` (REQUEST CHANGES 1 P1, 2 P2, P3s)

Lane: native Claude implementation lane on the dongpark worktree, fast-forwarded `08f6f6b` → `497a028`, then commits `5f59701`, `aada59b`, `13dbfdf`, parent `2d97856` (Dock test teardown only), `d574342` and the harness/report commit that carries this section. All pushes were fast-forward; nothing was force-pushed. Tools: Python 3.12, Node `/tmp/moss-test-node24` 24.22.3, pinned Bun 1.3.14, JDK 17 `/tmp/moss-test-jdk`, actionlint 1.7.12, Docker 27.3.1 / Compose 2.29.7. Production (`/home/dongpark/moss`, `e351374`, four live containers) was only read for its three app image IDs; nothing in production was started, stopped, written, backed up or migrated.

### Findings and resolutions

| ID | Resolution | RED observed before the fix | GREEN |
|---|---|---|---|
| F1 P1 | `Runtime.metadata()` sends the SQL on **stdin** to `docker exec -i … sh -c 'exec psql … -U "$POSTGRES_USER" -d "$POSTGRES_DB"'`; no nested quoting. Each row is validated (exact keys, nonempty string version, int/null checksum, `success` true); empty, unreadable, failed or unversioned history is Rejected. New `scripts/deploy/tests/test_runtime_postgres.py` runs the **actual** `Runtime.container()`/`metadata()` argv against an owned, networkless, tmpfs Postgres `18-alpine` labelled as a Compose service of a unique project, with known out-of-order rows containing quote/`$`/backtick characters. `MOSS_DEPLOY_DOCKER_TESTS=required` turns a missing Docker into a failure. New `ci / deploy-checks` job (PR CI and reused by release) runs the deploy Python tests with that flag plus the rehearsal Node tests; `release.GATES` requires it and a contract test fails if any `ci.yml`/`audit.yml` job is not a host-verified gate. | Old argv in Postgres 18: `rc 1 ERROR: syntax error at or near "["` (`coalesce(json_agg(t), []::json)`); integration test errored with `Rejected: external command failed`. Gate test failed when `ci / deploy-checks` was missing from `GATES`. | 5/5 against real Postgres; container removed in class cleanup |
| F2 P2 | Terminal records store the **observed** state: `running.state` `serving` (with the running SHA, or `legacy-bootstrap`), `stopped` (every writer stopped) or `unverified` (stopping failed); `baseline` (last verified release); `rollback` `not_attempted`/`succeeded`/`failed`; `requested`. `sha` remains the actual running SHA (null when nothing verified serves). `release.describe()` builds the ≤140-char GitHub status from those fields only. A successful rollback still reports its actual running SHA. | Pre-fix `GitHub.report` posted `'running unknown bootstrap; rollback=False'` for a failed rollback after a failed candidate with **both** a known (`d…`) and a legacy baseline; new tests failed with `KeyError: 'running'`, `('failure', True, …) != ('failure', 'succeeded', …)`. | `test_agent_state.py` (known + legacy subclasses), `test_recovery_paths.py` |
| F3 P2 | Dockerfiles: `ARG BUILD_SHA=` and the strict 40-hex guard runs **only** when a value is given; empty ⇒ no identity file (explicitly unversioned). Web route, sync internal probe and Ktor `/internal/deployment` answer `{"status":"unversioned"}` only when neither a build SHA nor `RELEASE_SHA` exists (DB/listener still checked); a set `RELEASE_SHA` or a versioned image keeps the exact-match rule. Image healthchecks accept `unversioned` only when `RELEASE_SHA` is unset. Sync shutdown of an unversioned build exits 0 with marker `sha:null` (the host still demands its exact release SHA). Release always passes `BUILD_SHA=${{ github.sha }}`. | `test_dockerfiles.py` executed each Dockerfile's real guard under `sh`: empty value exit 1 for all three. Web route test 1 failed, sync 2 failed (probe + shutdown), server `DeploymentTest` 1 failed against the old code. | Guard tests; web 9/9, sync, server `DeploymentTest` 4/4; real Compose builds below |
| N1 | `Runtime.smoke()` first runs `await_ready()`: bounded (120 s) read-only HTTP probes of the fixed loopback server `/health`, sync and web (any answer < 500, no redirects, no proxies). Only the probe is retried, never the mutating smoke. | No readiness method existed (tests errored). | Real listener ready after 2.3 s waited for; never-ready fails before any smoke command; refused port bounded |
| N2 | `onChange` only bumps a per-board revision and keeps the live `Y.Doc` reference. State is encoded on store, once in `beforeUnloadDocument` if the board is still dirty (bytes retained), and at shutdown. A store clears the mark only if no newer revision/retained bytes appeared meanwhile; retained failed bytes are merged (`Y.mergeUpdates`) with later edits of a reloaded board. Shutdown still fails closed while persistence fails. | Old code: 50 `onChange` hooks on a 9,437,204-byte board took **526.9 ms** (one full encode 12.5 ms); a failed store's edit was **lost** once the board unloaded and a fresh client edited the reloaded snapshot. | 50 hooks **0.37–1.41 ms**; durable unload/shutdown, in-flight concurrent change and merge tests; existing shutdown/drain tests unchanged |
| N3 | `deployment_manifest()` shape-checks API data; any invalid request (e.g. string payload) is a terminal `failure` with the untouched baseline as `serving`, before any Docker action, and is not re-recorded. Outbox: each delivery failure is recorded on its entry (`delivery.failures/last_error/last_attempt`, visible in `status`); 404/410/422 or an unsupported record move to `undeliverable`; other failures stay queued, make the run exit non-zero, but later valid requests still run. | `AttributeError: 'str' object has no attribute 'get'`; HTTP 422 and `OSError` from the outbox aborted the poll before `latest()`. | `PoisonRequestTest` through the real `agent.main()` |
| N4 | `finish(..., commit=…)` writes the terminal attempt, new current/previous, retained evidence, outbox entry and cleared `active` in **one** atomic journal replacement (also for operator rollback). | Crash injected at journal write 8: recovery halted the committed healthy release (`'error' != 'success'`); a journaled state had new `current` with `active` still set. | Crash at every write: never halts a committed release |
| N5 | A failed or timed-out **candidate server start** (Flyway) is UNKNOWN SCHEMA: writers stop, `error`, pause, no previous restart even with baseline-equal rows. Previous images are restored only after the candidate server became ready **and** its history was proven compatible. Start budget `SERVER_START_SECONDS=660`; the server image healthcheck start period is now **600 s** (was 40 s ⇒ unhealthy ≈70 s, aborting `--wait` long before the budget). | `server` started twice (rollback) on a failed start with unchanged rows; budget test `40 not greater than or equal to 600`. | No previous restart; budget test; real `--wait` healthy |
| N6 | Verified evidence is retained in the root journal at success; `rollback-previous` reuses it (must still hash to the recorded signed digest and pass `verify_evidence`). GitHub stays required for the rollback deployment record and previous-image attestation; documented, no unsigned bypass. | `prepare_rollback()` had no retained-proof path (TypeError). | Offline evidence download not attempted; forged/relabelled retained evidence Rejected |
| N7 | `load_local_config()` (config/install/state ownership, fixed paths, project, repository) serves `pause`/`status`; everything else runs the full preflight. | `pause` with expired token/low disk raised `Rejected`. | Pause/status work; `resume` still Rejected; protection checks recorded |
| N8 | Runbook: first-release ordering and GHCR *Manage Actions access*; whole-run reruns only; observed-state/outbox semantics; strict cutover limits; `reconcile` (read-only live verification: topology, exact image IDs, recorded Flyway history hash, smoke) before `resume`; config changes need reviewed reconciliation; retained-proof online limits; manual backup pruning; unversioned manual builds. | — | `deploy/README.md` |
| N9 | Sync pool no longer sets global `connectionTimeoutMillis`/`query_timeout`; `sync/src/readiness.ts` bounds only the readiness query (per-query timeout + overall deadline). The evidence-signing rehearsal job no longer runs `bun install --cwd sync` (host-side harness imports only Node built-ins/own files; client packages come from the web image). | Source check found pool-wide timeouts. | `readiness.test.ts` 3/3 |
| Bootstrap | `publish.baseline()` waits (only when **no** successful baseline exists) at most `BASELINE_WAIT_SECONDS` (release sets 900, capped at 900, default 0); invalid/mismatched baselines fail at once; never invented. | Old `baseline()` failed immediately. | `test_publish.py` 6/6 |

Additional fixes found while verifying: the rehearsal cleanup reported success while leaving `<run>_files` (Compose `down --volumes` skips volumes unused by the final restored model; observed for this lane's first run and two earlier-lane runs). `removeOwned()` now removes every container/volume/network labelled for the run and **fails** cleanup if any remains. The client worker reuses one Bun process across service recreation; one rerun failed `old_client` with `timeout: two clients authenticated` (same stale-DNS class the earlier lane recorded), so the worker now runs with `BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS=0`. The cause is inferred from that documented class, not directly observed.

### Real Docker fixtures (owned names, no production ports/volumes, all removed)

- `docker-compose.yml`, project `mossf3devd21d1a`, every `ports` reset, scratch env file: build exit 0 (156 s); `up --wait` exit 0; postgres/server/sync/web **healthy**; web `/api/deployment` `200 {"status":"unversioned"}`; server `DeploymentProbe` exit 0, `/health` `200 {"status":"ok"}`; sync internal `200 {"status":"unversioned"}`; web `/` 200; no identity files; stop exits web 143, sync 0, server 143; sync marker `{"event":"moss_sync_shutdown_complete","sha":null}`.
- `docker-compose.prod.yml`, project `mossf3prod8099c8`: identical results (build 38 s with cache). Fixture images removed afterwards.
- Negative: `docker build --build-arg BUILD_SHA=main -f sync/Dockerfile .` exit 1.
- Candidate images rebuilt at `d57434248507a4b272d10589a4ef353dae311cd6` with that `BUILD_SHA`, OCI source/revision labels and the rehearsal-only public config: server `sha256:71239218c4fd…` (jar resource `build-sha` = exact SHA, healthcheck start 10m0s), sync `sha256:ccec537cc1e0…`, web `sha256:b88242ebd694…` (`.build-sha` exact).
- Baseline: preserved legacy copies whose IDs equal the live production containers' image IDs (web `bd2fd993a680`, server `79e91c1f6ede`, sync `02ac39a06752`, read-only inspection). Pushed with candidates only to the lane-owned loopback registry `moss-c4-registry-68f7f59d` (`127.0.0.1:32808`); baseline digests equal the earlier lane's (`d3230c…`, `f79f39…`, `6b6dea…`).
- `node deploy/rehearsal/pull.mjs --local-registry` exit 0; `node deploy/rehearsal/run.mjs --local-registry …` run 1 exit 0 in 156 s, all 10 mandatory checks true plus `forced_shutdown_rejected`/`cleanup`, 11/11 migration rows, evidence SHA256 `3463be95f4cf4f3d6ac2fdb466a6ddf16d7052a9442a05569012456bc95fa8c7`, but left its `_files` volume (bug above; removed). Run 2 failed `old_client` as described (evidence `08b6b612…`, status failed, cleanup left nothing). With both harness fixes, runs 3 and 4 exit 0 in 138 s each, 10/10, zero leftovers: evidence `807804a5d96a3c40ef883440713ca438819856723ba52a74345210549258bf26` and `c8b395981505de06f07bfa2e1f692360b647448cc3b17a44df49a9b7e1b8b708`. All are `local_only:true`, `attestation_eligible:false`.
- `runtime.py` executor boundary with the rebuilt candidate and legacy images (unique project `mossrt47373c05`, renamed external volumes/network, random loopback ports, temp install dir): `metadata()` Rejected before Flyway history existed; candidate `start_server` `--wait` healthy (6.4 s); `metadata()` 11 rows; `start_clients` healthy; `await_ready` passed; strict `stop` with the exact-SHA drain marker (143/0/143); `backup` wrote 0600 `database.dump`, `files.tar.gz`, `metadata.json`; legacy `start_server`/`start_clients`/`await_ready` (2.9 s total) on the same DB with unchanged history; `halt`; zero leftovers. Script and output: session scratchpad `rt/fixture.py`, `rt/run.log` (not in Git, not in CI).

### CI regression reported by the parent (`aada59b`)

GitHub run 43093597941, job 130776655335 (`web-checks`): all 220 files / 2,010 tests passed with the 8 existing skips, but Vitest reported one unhandled `DatabaseClosedError` attributed to `Dock.test.tsx` ("outside pointer and resize dismiss the extra tools"). Parent root cause: the Dock test closed/reset its IndexedDB while a controlled save was still pending. Parent commit `2d97856` changes only `web/src/components/workspace/__tests__/Dock.test.tsx` (flush and `persistSettled` for the card IDs, `__resetBoardDocsForTest`, `connectionMirrorSettled` before the DB reset). The parent's new controlled save-gate regression failed on the old order; under Vitest 4.1.12, Dock passes 32 tests with its 2 existing skips; typecheck and ESLint report 0 errors. No assertions were removed and no suppressions were added. This lane did not edit that file.

### Fresh checks this round (on `d574342` + this round's harness fixes)

| Check | Command/tool | Observed result |
|---|---|---|
| Deployer Python incl. real Postgres 18 executor | `MOSS_DEPLOY_DOCKER_TESTS=required python3 -W error::ResourceWarning -m unittest discover -s scripts/deploy/tests` | 73 passed, 0 failures/skips |
| Rehearsal harness unit tests | `node --test deploy/rehearsal/*.test.mjs` (Node 24.22.3) | 20 passed, 0 failures/skips |
| Sync | `bun run typecheck`; `bun test` (Bun 1.3.14) | exit 0; 132 passed, 0 failed |
| Web full suite | `bun run test` (Node 24, Bun 1.3.14), includes parent `2d97856` | 220 files; 2,012 passed, 8 existing skips; no unhandled errors; exit 0; 137 s |
| Web static | `tsc --noEmit`; `bun run lint` | exit 0; 0 errors, 3 existing warnings |
| Server full suite | `JAVA_HOME=/tmp/moss-test-jdk ./gradlew test --no-daemon --max-workers=2` | 25 suites, 153 tests, 0 failures/errors/skips; 78 s |
| MCP | `bun run typecheck`; `bun run test` | exit 0; 43 passed, 1 existing platform skip |
| Workflows / Python / shell / systemd | actionlint 1.7.12; `py_compile`; `sh -n`; `systemd-analyze verify` | each exit 0 |

## Remaining gates and operator inputs

NOT RUN: exact-head GitHub Actions/OWASP NVD audit for this round (runs for `d574342` were still queued when this lane finished; parent owns CI); real GHCR publication/attestation verification; installed root agent against GitHub production requests; independent C4 review; browser old-tab/version-skew/IndexedDB/OPFS checks; production dedicated-account smoke; first production deployment/rollback and downtime measurement. Existing web 8 and MCP 1 platform skips are listed above.

- Permanent host needs only the repository-scoped fine-grained token + verified expiry (or optional dedicated App), a separate private GHCR **read-only** credential, protected app env/public config/topology/bootstrap metadata, and a dedicated normal-login smoke account/password/owned board. No secret values are recorded here. GitHub desktop OAuth is never copied.
- Before the first regular release, an operator still must publish the exact preserved legacy images to private GHCR with a **one-time package-write capability**, verify digest→original image-ID mapping, then revoke it. The permanent read:packages credential cannot do this. No successful baseline means the workflow fails closed. A different same-host bootstrap-proof contract requires explicit design/review; it is not silently substituted.
- Root policy files/credentials remain administrator-owned. GH 2.45.0 is intentionally not used for attestation; the installer provides dedicated pinned tools. Normal auth is proved on the still-serving baseline before writer shutdown, so missing/invalid smoke credentials fail without stopping the application.
- The parent has separately verified live Flyway/network/public values and GitHub permissions. Those operational observations are not local test assertions and do not confer production activation authority on this lane.

## Changed files

All files changed relative to `origin/main` (`4b617ad`) on this branch, including this round and parent `2d97856`:

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
- `deploy/rehearsal/cleanup.test.mjs`
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
- `scripts/deploy/tests/test_agent_state.py`
- `scripts/deploy/tests/test_audit.py`
- `scripts/deploy/tests/test_contract.py`
- `scripts/deploy/tests/test_dockerfiles.py`
- `scripts/deploy/tests/test_install.py`
- `scripts/deploy/tests/test_operator.py`
- `scripts/deploy/tests/test_publish.py`
- `scripts/deploy/tests/test_recovery_paths.py`
- `scripts/deploy/tests/test_runtime.py`
- `scripts/deploy/tests/test_runtime_postgres.py`
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
- `sync/src/readiness.ts`
- `sync/src/server.ts`
- `sync/src/shutdown.ts`
- `sync/test/dirtyTracking.test.ts`
- `sync/test/fixtures/shutdown.ts`
- `sync/test/internalServer.test.ts`
- `sync/test/readiness.test.ts`
- `sync/test/server.test.ts`
- `sync/test/shutdown.test.ts`
- `web/Dockerfile`
- `web/Dockerfile.dockerignore`
- `web/next.config.ts`
- `web/src/app/api/deployment/route.test.ts`
- `web/src/app/api/deployment/route.ts`
- `web/src/components/workspace/__tests__/Dock.test.tsx`
