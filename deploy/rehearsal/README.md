# Actual-image release rehearsal

This C4 harness consumes produced images. The parent owns capacity, image builds/publication, independent review, evidence signing and production activation. The harness never builds or implicitly pulls.

```sh
node deploy/rehearsal/pull.mjs --input /private/rehearsal-input.json
bun deploy/rehearsal/run.ts --input /private/rehearsal-input.json --output /private/evidence.json
```

`run.mjs` is also a Node entrypoint. Input is the artifact emitted by the root publisher:

```json
{
  "sha": "EXACT_40_HEX_CANDIDATE_SHA",
  "images": { "web": "GHCR_DIGEST_REF", "server": "GHCR_DIGEST_REF", "sync": "GHCR_DIGEST_REF" },
  "baseline": { "web": "PREVIOUS_DIGEST_REF", "server": "PREVIOUS_DIGEST_REF", "sync": "PREVIOUS_DIGEST_REF" },
  "baseline_sha": null,
  "legacy_baseline": true,
  "public_config": {
    "api_url": "https://moss-rehearsal.invalid",
    "sync_url": "wss://sync-rehearsal.invalid",
    "google_client_id": "rehearsal.apps.googleusercontent.com",
    "terms_version": "isolated-rehearsal-v1"
  },
  "config_sha256": "CANONICAL_PUBLIC_CONFIG_HASH"
}
```

Normal mode accepts only the three fixed private repositories `ghcr.io/dong-park/moss-deploy-{web,server,sync}@sha256:64hex` (one per service) in each image set; the retired public `ghcr.io/dong-park/moss-{web,server,sync}` and any other namespace are rejected. All must be explicitly pulled before running. Image IDs and repository digests are projected with Docker `--format`, then immutable IDs are used throughout. Container inspection projects only IDs, image ID, state, mounts, labels and port bindings; `Config.Env` is never retrieved.

The public-config fingerprint covers **only** the exact four fields `api_url`, `sync_url`, `google_client_id`, `terms_version`. It is SHA256 of recursively key-sorted compact ASCII JSON (Python `ensure_ascii=True`, UTF-8 bytes). Input hashes must match. Smoke URLs, credentials, asset lists, HTML paths and container names never enter this fingerprint. A known baseline requires an exact SHA and `legacy_baseline:false`; a legacy baseline requires `baseline_sha:null`, never an inferred source revision. `RELEASE_SHA` is passed to candidate services and known-baseline services only.

## Isolated execution

The harness creates a UUID project, private temporary Compose file, random credentials, internal database/control network plus an isolated edge network for Docker loopback publication, random loopback ports, two Postgres volumes and two attachment volumes. Postgres must report major 18 (`REHEARSAL_POSTGRES_IMAGE` overrides its local image). No production env file, database, resource name or credential is used. Every Docker resource created by the harness belongs to that uniquely labelled fixture; cleanup targets only its generated project and transient helpers.

Normal email signup/login creates an isolated account and board (a nonempty configured terms version is required). An unauthenticated board-token request must be denied. Two actual Hocuspocus/Yjs clients write real note maps, converge, discard local state and reconnect. Provider/Yjs packages come from the corresponding baseline/candidate web image, exercising the actual older client protocol. Graceful stop order is **web → sync → server**, each command completing before the next. Live sync edits must survive SIGTERM and offline edits must converge after restart.

Previous → candidate → previous retains the fixture database and verifies candidate-created data with the old client. Every start asserts actual running IDs against the selected set, including unknown-source legacy baselines. Public candidate `GET /api/deployment` must return `{status:"ready",sha:EXACT_SHA}`. A no-network, read-only transient web-image container runs `tar -C /app -cf - .next/static`; the host hashes regular-file bytes directly from that archive, without extracting image-controlled paths. Live HTML static references must be present in this image-derived manifest and public bytes must match. No operator asset hashes are accepted.

All writers stop before `pg_dump` and attachment archiving. Separate Postgres and attachment volumes receive the backup; normal authenticated clients verify document contents and attachment bytes there. Originals remain intact. An unhealthy command in the candidate server image must fail readiness; the complete **baseline image set** is then restored and must read the candidate-created fixture. Finally an isolated restored Flyway checksum is corrupted: candidate startup must fail migration validation and remain unhealthy. The failed isolated fixture is destroyed, not repaired or automatically rolled back.

The rehearsal uses protocol clients rather than a browser. Compiled browser endpoint URLs, browser-local IndexedDB/OPFS, public proxy routing and production process restarts require their own parent-owned gates.

## Local registry validation

The parent may create a unique loopback registry and push actual produced images/baseline copies there. Both pull and run accept `--local-registry`, which permits **only** `127.0.0.1:<valid-port>/moss-{matching web|server|sync}@sha256:64hex`. It rejects localhost aliases, other hosts/repositories, tags and cross-service mappings. This mode still checks real repository digests and exact running IDs, including legacy images; it never invents GHCR mappings. Evidence sets `local_only:true`, `attestation_eligible:false`, `registry_kind:"local"`. Host schema/verification must reject it for promotion. Normal workflow remains GHCR-only.

## Evidence

Evidence is create-exclusive mode 0600 at a fresh output path. Required fields are `sha`, `images`, `baseline`, `baseline_sha`, `legacy_baseline`, `config_sha256`, plus `checks` booleans: `normal_auth`, `two_clients`, `graceful_persistence`, `reconnect`, `offline_edits`, `backup_restore`, `previous_new_previous`, `old_client`, `failed_rollout`, `migration_failure`. A check becomes true only after its operation passes. Overall status stays failed until all phases and fixture cleanup pass.

`migrations.baseline`/`candidate` contain only `{version,checksum,success}` in installed-rank order from actual Flyway history. Image identities, public build identity/assets, archive hashes, Postgres version, phase results and timestamps provide provenance; no account credentials, user rows or auth tokens enter evidence. Private dump/archive/credentials are removed with the fixture directory. The parent validates/signs evidence and compares current/post-server migrations exactly before production activation.

## Production smoke and packaging

```sh
bun scripts/deploy/smoke.ts --sha "$SHA" --config /etc/moss-deploy/smoke.json
# Unknown-source legacy baseline only:
bun scripts/deploy/smoke.ts --legacy-baseline --config /etc/moss-deploy/smoke.json
# Fixed executable wrapper accepts the same arguments:
scripts/deploy/smoke --sha "$SHA" --config /etc/moss-deploy/smoke.json
```

The protected JSON config contains `public_config` (the same exact four fields), `web_url`, `dedicated_account:true`, `email`, `password`, `board_id`, and `containers:{web,server,sync}` actual running names/IDs. Optional `images:{web,server,sync}` pins expected GHCR refs; the parent always owns exact release image mapping. Optional `html_paths:["/"]` checks additional configured HTML entrypoints. No `assets` field is accepted. Credentials are read from this config, never exported by the runtime or printed. Missing dedicated credentials fail before Docker/network calls. Account and board must already exist and the account must own the board.

Smoke projects actual running image identities, extracts static asset hashes from that exact web image, checks public identity/HTML/bytes and API health, then exercises normal authenticated two-client sync, persistence after all clients close, and offline/reconnect edits. Only its uniquely keyed note/meta entries are removed. It does not restart production services, access a production DB or mount production data. The asset helper is a newly created uniquely labelled read-only/no-network container, removed automatically. Legacy mode omits the revision endpoint and records `sha:null`; it can never prove a candidate SHA.

Successful evidence is emitted as JSON on stdout. Optional `MOSS_SMOKE_EVIDENCE` writes a fresh private evidence file too. `BUN_BIN` selects Bun; source execution can use `MOSS_CLIENT_PACKAGE` for an existing dependency installation. To install without a checkout or node_modules, generate the real self-contained runtime archive:

```sh
BUN_BIN=/path/to/bun node scripts/deploy/smoke.package.mjs \
  --package web/package.json --output /private/moss-smoke-runtime.tar.gz
```

This bundles the existing locked provider/Yjs packages using Bun, then creates an archive containing `smoke`, self-contained `smoke.mjs`, and `manifest.json` (bundle and source-package hashes). Output must be outside the repository and must not already exist. The installer extracts this actual artifact into its reviewed runtime directory and runs `smoke --sha SHA --config FILE`. Host runtime dependencies are Bun and Docker, not npm packages. No generated bundle/binary is committed.

## Verification

`node --test deploy/rehearsal/*.test.mjs` covers contract/fingerprint/legacy/local-mode guards, fixture isolation, release SHA propagation, and GNU/PAX/USTAR archive hashing (including links/corruption rejection). Syntax: `node --check` on new `.mjs` and `sh -n scripts/deploy/smoke`.

RED: the original fingerprint accepted empty assets, and the initial config parser rejected the root's exact four-field public config. Each regression test failed before its fix and passes afterward. The archive was produced, extracted outside the checkout and executed without node_modules; it failed closed on absent dedicated credentials. These checks do not substitute for actual-image rehearsal, exact-head CI or production smoke with dedicated credentials.
