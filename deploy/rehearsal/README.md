# Actual-image release rehearsal

This C4 harness consumes already-produced images. It **never builds or pulls**. A parent must approve capacity, preload the candidate/baseline digest references and `postgres:18-alpine`, and verify an unknown first-release baseline's image mapping before running it. No source revision is inferred for a legacy baseline.

```sh
node deploy/rehearsal/run.mjs \
  --sha "$CANDIDATE_SHA" \
  --images /private/candidate-images.json \
  --baseline /private/baseline-images.json \
  --config /private/public-config.json \
  --output /private/evidence.json
```

Both image files are `{ "web": "ghcr.io/ORG/WEB@sha256:...", "server": "ghcr.io/ORG/SERVER@sha256:...", "sync": "ghcr.io/ORG/SYNC@sha256:..." }`. All three digest references must exist locally. The harness inspects and records image IDs/repository digests, then runs those IDs to avoid mutable tag races. `REHEARSAL_POSTGRES_IMAGE` can override the local Postgres image reference; the running database must report major 18.

Public config format:

```json
{
  "api_url": "https://api.example.com",
  "sync_url": "wss://sync.example.com",
  "web_url": "https://moss.example.com",
  "identity_path": "/build-info.json",
  "assets": [
    { "path": "/_next/static/chunks/ACTUAL.js", "sha256": "ACTUAL_64_HEX_HASH" }
  ]
}
```

Use actual exported build assets and a nonempty asset list. The identity response must contain `revision` equal to the candidate's exact 40-character SHA. In rehearsal, public hostnames are replaced by unique loopback ports while the same expected identity/asset hashes are checked. This is an API/protocol integration rehearsal; it does not exercise the browser's compiled endpoint URLs or browser-local IndexedDB/OPFS.

The harness generates its own UUID project name, private temporary Compose file, credentials, isolated network, ephemeral loopback ports, two Postgres volumes and two attachment volumes. It never reads a production env file, targets a supplied Compose project, or mounts production resources. Its cleanup uses only that generated project. Full database dumps/attachment archives and temporary credentials remain outside the repository and are removed with that private temporary directory. Evidence contains no credentials or user rows.

The normal signup/login routes create a test-only account and board. An unauthenticated token request must fail. Two Yjs clients write real note maps, converge, discard local state and reconnect. The actual sync image must flush live clients on SIGTERM; another restart tests offline edits. Old provider/Yjs packages come from the baseline web image, and new packages come from the candidate web image. Previous → candidate → previous retains the same test database and verifies candidate-created data with the old client.

All writers (web/server/sync) stop before `pg_dump` and attachment archiving. A separate Postgres instance and attachment volume receive the backup, and authenticated clients verify the document fixture and attachment bytes. The original database and attachments stay intact. An unhealthy command in the real candidate server image must fail readiness, followed by a healthy candidate recovering the fixture. Finally, an isolated restored Flyway checksum is corrupted; server startup must fail validation and must not become healthy. That failed fixture is destroyed rather than repaired or rolled back.

The evidence envelope is:

- `sha`: exact candidate SHA.
- `images` and `baseline`: pinned GHCR `{web,server,sync}` references.
- `config_sha256`: SHA256 of recursively key-sorted compact UTF-8 public config JSON; array ordering is preserved.
- `checks`: `normal_auth`, `two_clients`, `graceful_persistence`, `reconnect`, `offline_edits`, `backup_restore`, `previous_new_previous`, `old_client`, `failed_rollout`, `migration_failure`. Each is true only after its actual operation passes.
- `migrations.baseline` and `migrations.candidate`: `{version,checksum,success}` rows in installed-rank order from the actual databases.
- `identities`, `public`, `postgresVersion`, `phases`, timestamps and `status` provide review evidence. A failed mandatory phase keeps `status=failed`.

Evidence uses create-exclusive mode 0600; supply a fresh output path. The parent owns schema validation, signing, production routing/activation, independent C4 review, exact-head CI and any rollback decision.

## Production smoke

```sh
MOSS_SMOKE_DEDICATED_ACCOUNT=yes \
MOSS_SMOKE_EMAIL=... MOSS_SMOKE_PASSWORD=... MOSS_SMOKE_BOARD_ID=... \
MOSS_SMOKE_EVIDENCE=/private/smoke-evidence.json \
scripts/deploy/smoke --sha "$CANDIDATE_SHA" --config /etc/moss-deploy/smoke.json
```

The wrapper runs Bun (`BUN_BIN` overrides its executable). Use a secret manager/credential file to supply dedicated credentials, not a shell history containing real passwords. The dedicated account must already own the dedicated board. Missing credentials/acknowledgment fail before network calls; no JWT signing or test-only auth bypass exists. The host must have the existing web dependencies installed; `MOSS_CLIENT_PACKAGE` overrides the path to that existing web `package.json` without installing anything.

Smoke verifies public build identity and asset bytes, API `/health`, normal authenticated two-client sync, persistence after all clients close, and reconnect with offline edits. It removes only its uniquely keyed note/meta entries and leaves the board and account intact. It does not restart production services, access the database, upload files or mutate Docker resources. Persistence here is proven by fresh clients after Hocuspocus unload; process-restart/disk proof belongs to the isolated rehearsal.

## Local verification

```sh
node --test deploy/rehearsal/*.test.mjs
node --check deploy/rehearsal/run.mjs
node --check deploy/rehearsal/client.mjs
node --check scripts/deploy/smoke.mjs
```

A negative fingerprint test first failed because an empty asset proof was accepted (3 passed, 1 failed); the guard was corrected and that test now passes. These lightweight tests verify guardrails/configuration/evidence handling, not real-image integration. Do not sign unit-test output as rehearsal success. Full image execution remains a separate mandatory gate.

Legacy production verification uses `bun scripts/deploy/smoke.ts --legacy-baseline --config FILE` (the fixed executable wrapper also accepts it). Its config additionally supplies `legacy_images` (three verified/pinned GHCR digest references) and `legacy_containers` (three running Docker container names/IDs). The script uses read-only Docker inspection to compare each actual running image ID with the pinned reference, checks public HTML and every referenced static asset against the expected hashes, and exercises the same authenticated sync checks. It deliberately omits the revision endpoint and records `sha: null`, `legacy_baseline: true`. A legacy verification can never establish a candidate revision. The parent must verify the exported baseline mapping and keep this mode out of normal candidate activation.
