# Private GHCR release image paths — pre-activation correction (C4)

Branch `fix/private-ghcr-releases` from `main` `a0205a4`. Status: implementation lane; independent review and
first real `main` run pending.

## Actual first-activation blocker

`main` `a0205a4` release run `43129572380` passed CI/security/build, but the three images it pushed with the
workflow `GITHUB_TOKEN` (`ghcr.io/dong-park/moss-{web,server,sync}`) became **public** packages, because
`dong-park/moss` is a public repository. The private legacy-baseline gate blocked as designed; nothing legacy was
published and production was unchanged. The root `a020` agent is installed **inactive** (timer disabled, no
bootstrap.json, no agent state, no deployment record).

Primary sources (re-checked 2026-11-12):

- [Publishing and installing a package with GitHub Actions](https://docs.github.com/en/packages/managing-github-packages-using-github-actions-workflows/publishing-and-installing-a-package-with-github-actions):
  a package a workflow creates with `GITHUB_TOKEN` "inherits the visibility and permissions model of the repository
  where the workflow is run". The earlier README/verification claim that the first workflow push creates *private*
  packages was wrong for this public repository.
- [Configuring a package's access control and visibility](https://docs.github.com/en/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility):
  a package first published to a personal account with a personal access token is private by default; a public
  package cannot be made private again. The existing public packages therefore cannot be repaired in place.
- [REST API for packages](https://docs.github.com/en/rest/packages/packages?apiVersion=2022-11-28): "Get a package
  for a user" returns `name`, `package_type`, `visibility` (`private`|`public`), `owner.login`,
  `repository.{id,full_name}`. **Residual:** this page documents classic-PAT `read:packages` only and never mentions
  `GITHUB_TOKEN`; the Actions page documents `GITHUB_TOKEN` REST use only for delete/restore (preview, admin
  permission, which a connected repository receives). Whether a repository `GITHUB_TOKEN` (`packages: write`) may
  read this metadata is therefore not proven by documentation; the check fails closed (HTTP 403 → job fails before
  any push). Only the first real `main` run proves it.

## Decision (parent-selected)

New, non-destructive fixed names — the only accepted image repositories from now on:

- `ghcr.io/dong-park/moss-deploy-web`
- `ghcr.io/dong-park/moss-deploy-server`
- `ghcr.io/dong-park/moss-deploy-sync`

The three public `ghcr.io/dong-park/moss-{web,server,sync}` packages are left untouched and unused, and are
explicitly rejected everywhere. No configurable registry, namespace fallback, or loosened pattern.

Compatibility: initial activation never completed and no agent state, bootstrap, or GitHub deployment request exists,
so this is a pre-activation image-path correction. Wire fields and `version: 1` stay; there are no activated
consumers. The installed (inactive) `a020` host policy rejects the new paths and must be version-upgraded to the
approved source before bootstrap. No state is deleted/reset; no older running client is claimed migrated.

## Acceptance criteria

1. One fixed whitelist in `scripts/deploy/release.py` (`IMAGE_REPOSITORIES`, `PACKAGE_OWNER`, `REPOSITORY_ID`
   `1383130341`); Python `image_set`, JSON schema, `publish.py image`, rehearsal `pinnedImages` (GHCR mode) and the
   workflow tags/attest subject accept only the three new repositories; the three retired public repositories and
   any other namespace are rejected.
2. Release `build` job: before Docker login/build/push, `publish.py registry` proves for all three packages via fixed
   `https://api.github.com/users/dong-park/packages/container/moss-deploy-{service}` with the job's `GITHUB_TOKEN`
   (`packages: write`): HTTP 200 without redirect, `name`, `package_type: container`, `visibility: private`,
   `owner.login: dong-park`, `repository.id: 1383130341` (int), `repository.full_name: dong-park/moss`; and that
   anonymous GHCR access is denied (401/403/404). Missing/inaccessible/403/404/redirect/public/mismatch/shape/
   network error → fixed `Rejected` message, exit 1, no token/exception detail output, no implicit creation. The
   same proof re-runs after push/attest and before the image identity artifact. No new secret, no PAT in Actions;
   pinned actions and all CI/audit/contract/evidence/run-attempt gates unchanged.
3. Regression tests RED on `a0205a4`, GREEN after: metadata accept/reject matrix; redirect not followed and no
   Authorization forwarded (real local HTTP server); CLI boundary (missing token / failing proof → exit 1, no
   secret in output); workflow ordering (proof precedes login/build/push; post-push proof precedes identity upload;
   tags/attest use new names; no old names); new refs accepted and all old public refs rejected in Python, JSON
   schema and rehearsal JS. Existing fixtures move to the new namespace keeping their attack intent; explicit old-
   namespace negatives added. No test skipped or weakened.
4. Docs: README runbook first-publish ordering corrected (one-time PAT + minimal non-runtime seed creates PRIVATE
   packages linked by OCI source label first; verify private via API and anonymous denial; then the workflow proves
   write/read; no legacy baseline push until private proven; public packages left alone). Incorrect "Actions creates
   private first" claims removed from README/plan/verification (historical reports annotated, not rewritten).
5. App/server/sync/runtime/migration/recovery logic and app source bytes unchanged.

## Acceptance commands

```sh
MOSS_DEPLOY_DOCKER_TESTS=required python3 -m unittest discover -s scripts/deploy/tests -v   # 104 + new, real PG
/tmp/moss-test-node24/bin/node --test deploy/rehearsal/*.test.mjs                             # 20 + new
python3 -m py_compile scripts/deploy/*.py
actionlint    # 1.7.12
sh -n scripts/deploy/install.sh
python3 -c 'import json;json.load(open("deploy/release.schema.json"))'
git diff --check a0205a4...HEAD
git diff --stat a0205a4...HEAD -- web server sync mcp shared   # must be empty
```

## Pre-provisioning status (parent-reported, not verified by this lane)

The parent reports the separate ops task created the three packages with a one-time personal token and a minimal
non-runtime seed (`bootstrap-seed-20261112-46ef102d`, digest `sha256:4f2b1717…92dd79`): package ids web `16808698`,
server `16808713`, sync `16808720`; metadata `visibility: private`, linked to repository `1383130341` /
`dong-park/moss`; authenticated tag/digest read 200; anonymous 401; old public packages, production and timer
unchanged. That proves private operation and owner read access only. It does **not** prove that the workflow's
ephemeral `GITHUB_TOKEN` can read package metadata or write; the first `main` run's `publish.py registry` step proves
that or fails closed before any push.

## Verification (this lane)

RED on an exported `a0205a4` tree with only the new/updated tests copied in:
`python3 -m unittest discover -s scripts/deploy/tests -p test_registry.py` → exit 1, all 15 tests fail (5 failures,
86 errors: missing `IMAGE_REPOSITORIES`/`private_package`/`registry`/`http_get`, schema/workflow/image identity still
on the old names, unsupported `registry` CLI traceback); `node --test deploy/rehearsal/*.test.mjs` → exit 1, 21
tests, 1 fail (old `pinnedImages` accepted `ghcr.io/dong-park/moss-*` and every other GHCR namespace).

GREEN on this branch (see the commit report for exact head): Python full suite with
`MOSS_DEPLOY_DOCKER_TESTS=required` 119 tests OK (104 existing + 15 new; real Postgres 18 metadata tests ran; 0 skipped);
Node 24.22.3 rehearsal tests 21 pass (20 existing + 1 new); `py_compile`, actionlint 1.7.12, `sh -n`, schema JSON
parse and `git diff --check` exit 0; no change under `web/ server/ sync/ mcp/ shared/`.

NOT RUN: real GitHub Actions run of the new workflow (GITHUB_TOKEN metadata read and write to the new packages),
image builds and the full actual-image rehearsal (app sources unchanged; CI on the PR), host policy upgrade/bootstrap.

## Registry preflight diagnostic

`.github/workflows/registry-preflight.yml` runs only `publish.py registry` with the repository's ephemeral
`GITHUB_TOKEN` (`contents: read`, `packages: read`; exact `github.sha` checkout, credentials not persisted, 3-minute
job timeout) on pushes to `fix/private-ghcr-releases` and on manual dispatch. It answers the open question above
(whether the repository installation token can read the private package metadata) before any `main` release, without
registry login, image pull/build/push, attestation or production access. A failure reports one fixed `Rejected:`
reason; if read scope proves insufficient, the protocol is decided from that evidence, never by broadening blindly.
The release build's pre-push and post-push proofs are unchanged.

## Operator follow-ups (outside this lane)

- The installed inactive `a020` root policy rejects `moss-deploy-*`; it must be upgraded to the approved source before
  bootstrap. No agent state, bootstrap, or GitHub deployment record is to be created before that.
- Private-stage ops scripts outside this repository that still use the `moss-{web,server,sync}` prefix must be updated
  by the ops lane once this source is approved.
