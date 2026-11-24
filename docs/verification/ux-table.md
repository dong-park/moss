# Moss table slice verification

Base: `36fe2060fc9ee2e40074826d203e4238cc9a3c6d`

Local head: `174ccfcfc69f7c67a61c759341b87de2fa1bbc67` (clean worktree, no push/PR/merge/deploy).

Implemented shared read-only semantic presentation/search, exact empty-link marker handling, retained empty rows, dynamic display titles, todo progress, filter chips/results/reset debounce cancellation, mobile board context, truthful selection/trash scope including captioned photos. Title editing/sorting still use stored title; existing 36px/96px virtualization and hidden-selection pruning remain.

## Verification

- Exit 0: `PATH=/home/dongpark/.bun/bin:$PATH NODE_OPTIONS=--no-experimental-webstorage bun run test --maxWorkers=2` (repository root (forwards to web)). 2030 passed, 0 failed, 8 skipped.
- Exit 0: `PATH=/home/dongpark/.bun/bin:$PATH bun run test src/state/__tests__/memoSearch.test.ts src/state/__tests__/memoTable.test.ts src/components/workspace/table/__tests__/MemoTable.test.tsx` (repository root). 84 passed, 0 failed, 0 skipped.
- Exit 0: `PATH=/home/dongpark/.bun/bin:$PATH bunx tsc --noEmit` (web).
- Exit 0: `PATH=/home/dongpark/.bun/bin:$PATH bun run lint` (web). 3 warnings outside owned files
- Exit 0: `PATH=/home/dongpark/.bun/bin:$PATH bun run check:i18n` (web). 85 unused keys, zero missing keys; dynamic semantic keys included
- Exit 0: `PATH=/home/dongpark/.bun/bin:$PATH NEXT_TELEMETRY_DISABLED=1 bun run build` (web).
- Exit 0: `git diff --check 36fe2060fc9ee2e40074826d203e4238cc9a3c6d HEAD; git apply --reverse --check /tmp/moss-ux-table-transfer/changes.patch` (repository root).

Full lint warnings: Dock.linkTodoPhoto.test.tsx unused waitFor, photoContent.test.tsx unused directive, exportStore.ts unused scope. i18n JSON comparison confirms existing messages unchanged.

## RED / earlier failures

RED state: 7 failed/51 passed. RED UI: 4 failed/15 passed. Intermediate unchanged 500-card/16ms performance assertion failed, fixed with bounded semantic cache. First broad run during final edits: 3 failed/2023 passed/8 skipped (then-fixed address-prompt parity plus 2 Node26 native localStorage issues). Those storage tests pass unchanged with NODE_OPTIONS=--no-experimental-webstorage (18/18 isolated); final exact-head full run uses same jsdom runtime option and passes. No weakened assertions or new skips.

## Acceptance

- UX-01: PASS in tests: whole-body marker hidden; code preserved/searchable. Real browser UNVERIFIED.
- UX-02: PASS in tests: empty memo/todo/link rows retained and semantically searchable; 390/1280px component remount preserves source data. Real browser refresh UNVERIFIED.
- UX-08: PASS in tests: types, fallback titles, todo progress, board context; stored title edit/sort and read-only immutability preserved.
- UX-09: PASS in tests: removable chips, result count, reset/dispose cancellation, all defaults, hidden-selection pruning and shared destructive eligibility/count; captioned photo trash/undo keeps attachmentRef. Real browser UNVERIFIED.

8 existing skips: 1 disabled board-promotion toast; 5 disabled frame-wobble tests; 2 hidden Dock pen/signals entry points. All containing files unchanged from base.

NOT RUN: Real browser layouts/captures: host AppArmor blocks GOAT browser; 320/820px, zoom/landscape checks; Android IME/hardware, Safari, physical pen, actual two-client collaboration; CI and independent review; Other slices and push/PR/merge/deployment (not authorized).

## Ownership

- `web/src/components/workspace/table/MemoTable.tsx`
- `web/src/components/workspace/table/MemoTableToolbar.tsx`
- `web/src/components/workspace/table/__tests__/MemoTable.test.tsx`
- `web/src/components/workspace/table/memoTable.module.css`
- `web/src/i18n/messages/ko.json`
- `web/src/state/__tests__/memoSearch.test.ts`
- `web/src/state/__tests__/memoTable.test.ts`
- `web/src/state/memoPresentation.ts`
- `web/src/state/memoSearch.ts`
- `web/src/state/memoTable.ts`

## Transfer

Patch includes ko.json adding only reviewTable. For concurrent namespaces, apply with git apply --exclude=web/src/i18n/messages/ko.json changes.patch then merge i18n.json containing only {reviewTable:...}. No shared i18n index changes.

http://100.117.197.86:48025/changes.patch

Server PID 1109156; stop: `kill 1109156`. Only `/tmp/moss-ux-table-transfer` served. No credentials or production user data included. Raw evidence logs stay outside server directory in `/tmp/moss-ux-table-evidence`.
