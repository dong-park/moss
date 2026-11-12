# Save slice handoff

Base: 36fe2060fc9ee2e40074826d203e4238cc9a3c6d
Local commit: bbfd7089139b40ae35efaeebb2b084ebfd4a661c

No push, PR, merge, deployment, production access, checkout creation, or unrelated deletion.

## Behavior

- Board-scoped save-feedback resources distinguish Y.Doc source durability from note/search mirror writes, including the 300ms debounce reservation. The board and memo dialog use the same status component, retain failed content, expose retry, and explain that general memos autosave and closing keeps edits.
- Native IndexedDB transaction complete/abort, not request success, provider connected, or first sync, determines source durability. A later delta cannot clear an earlier failed delta; retry encodes the current complete source snapshot. Old completions cannot mark a newer pending revision saved. Mirror writes serialize per note and preserve failed partial patch fields until a commit succeeds.
- The installed y-indexeddb 9.0.12 source was read. Its _storeUpdate discards addAutoKey promises; its exported storeState resolves before nested writes complete. doc.ts narrowly replaces that update listener, retaining its database names/stores/Yjs update format and loader. Native atomic log compaction merges all stored updates before clearing, preserving unseen updates from other tabs. Upgrade this adapter together with y-indexeddb.
- Failed source documents survive board navigation in memory, reopen the same live snapshot, and remain retryable. Explicit document deletion/revocation discards that recovery snapshot and retry state (one minimal activeDoc.ts integration call).
- Connectivity wording is separate and explicitly supplies no server-durable-save claim. Attachment upload status remains separate. No server acknowledgement protocol or collaboration provider/store change.
- Unchanged setContent and normalized setTitle callbacks do not schedule persistence. Automatic measured width/height still update local cards and shared derived dimension caches, preserving existing dimension, frame-membership, and undo semantics. Their separate own-field mirror update never stamps updatedAt or writes title/body. Manual sizing and real content edits retain their existing persistence semantics. No global timestamp suppression or mergeNote no-op bypass.

## Ownership and integration

Full 18-file ownership list is in manifest.json. workspace.ts changes are only persistence helpers, remote mirror debounce board scope, group persistence board scope, and content/title no-op guards; fitAllCards is untouched. No table/search/Dock/DraggableCard or textbox component changes.

The patch includes ko.json, with ONLY the new saveFeedback root namespace. To avoid concurrent i18n conflicts, apply with --exclude=web/src/i18n/messages/ko.json, then merge i18n.json's single namespace. Do not replace the destination message file.

Test fixture changes preserve assertions: Canvas.touch fakes only gesture/debounce timers and Date, keeping fake-IDB's setImmediate scheduler real; otherwise restoring fake clocks discards pending IDB tasks and the now-correct awaited destroy hangs. WorkspaceShell layout uses the real i18n provider. WorkspaceShell routes awaits launched board transitions before resetting Dexie. The undo test's obsolete expectation that an unchanged content callback advances updatedAt is now timestamp equality; all other undo assertions remain.

## Regression evidence

The no-op regression failed on base because updatedAt advanced after unchanged callbacks/measurement; after the fix it passed. Real y-indexeddb + fake-indexeddb tests exercise complete/reload, native transaction abort, failed delta followed by newer edit, full snapshot retry, cross-document compaction, failure/navigation/re-entry, and explicit recovery deletion. Additional tests exercise stale completions, canceled key reuse, mirror/source independence, failed Dexie snapshot merging, debounce replacement/cancel, accessible shared board/dialog status and retry, general memo close before debounce and reload.

Initial 114-test targeted run: 111 passed, 3 failed (2 missing i18n provider fixtures; 1 obsolete timestamp expectation), corrected. Later targeted run: 16 files / 172 passed. Final feedback tests: 3 files / 12 passed; final no-op/feedback extra run: 2 files / 7 passed; touch-canvas: 25 passed; route: 18 passed. No new skips.

Initial full suite: 223 files passed, Canvas.touch had 7 failures (6 hook timeouts from frozen IDB macrotasks followed by state contamination); 1 DatabaseClosedError from route fixture's early DB teardown. These fixtures were fixed, with all touch and route tests passing. A follow-up full run overlapped final source edits: 223 files passed, one newly added canceled-key regression failed against the earlier transformed module (2025 passed / 1 failed / 8 skipped); the same regression passes when run fresh. That mixed-code run is not exact-head evidence. A stop command found it had already completed. A clean full process was then started after commit with no further source edits. An isolated route fixture attempt briefly recursed because Zustand copied its spy into new state; corrected by retaining and restoring the original action; all18 passed after correction.

Final exact-head verification (all commands ran against committed bbfd7089139b40ae35efaeebb2b084ebfd4a661c, no subsequent source edits):

- `PATH=/home/dongpark/.bun/bin:$PATH NODE_OPTIONS=--no-experimental-webstorage bun run --cwd web test --maxWorkers=2`: PASS, 224 files / 2026 tests passed / 0 failed / 8 existing skipped, 273.30s. Log `/tmp/moss-save-exact-full-test.log`.
- `NODE_OPTIONS=--no-experimental-webstorage web/node_modules/.bin/tsc --noEmit -p web/tsconfig.json`: PASS. Log `/tmp/moss-save-exact-types.log`.
- `PATH=/home/dongpark/.bun/bin:$PATH NODE_OPTIONS=--no-experimental-webstorage bun run --cwd web lint`: PASS, 0 errors / 3 pre-existing warnings (Dock.linkTodoPhoto unused waitFor, photoContent unused eslint-disable, exportStore unused scope). Log `/tmp/moss-save-exact-lint.log`.
- `PATH=/home/dongpark/.bun/bin:$PATH bun run --cwd web check:i18n`: PASS, 0 missing keys, 75 pre-existing unused keys, none in saveFeedback. Log `/tmp/moss-save-exact-i18n.log`.
- `PATH=/home/dongpark/.bun/bin:$PATH NODE_OPTIONS=--no-experimental-webstorage bun run --cwd web build`: PASS. Log `/tmp/moss-save-exact-build.log`.
- Binary patch against base reconstructs exact HEAD tree in temporary index: PASS. `git diff --check`: PASS. Worktree clean.

Initial commands without Bun on PATH failed with command-not-found (including nested check:i18n); rerun with explicit PATH succeeded. Node26.6.0 uses --no-experimental-webstorage for Vitest/jsdom. Bun1.4.4 installed frozen lockfile; no lockfile changed.

## Limits / AC scope

UX04: automated source/mirror durability, failure/retry, stale completion, reload, and board scoping covered. Native IDB transaction completion is the browser's commit acknowledgement, not proof against hardware/power loss. The y-indexeddb initial loader is retained; a browser-level indefinitely blocked initial database open can still remain pending rather than produce a timeout. Source open rejection follows the existing _db failure race. Actual browser quota/device-storage failures beyond injected native aborts remain unverified.

UX05: general memo close-before-debounce preserves edits and source reload, and autosave-close explanation is rendered. Existing mobile link Done/cancel/back policy is untouched. Android IME/history and actual editor/browser close paths need parent verification.

UX15: title/body/updatedAt preservation covered for read/select/expand/close, equal callbacks, and measured dimensions; real edits still persist and advance timestamp. Two actual collaborative clients and remote browser measurement behavior remain unverified. Derived measured dimensions remain shared cached values, not independent manual sizing policy.

NOT RUN: browser/UI screenshots or narrow-width/IME verification (GOAT browser is blocked on this remote host), Android/Safari/physical pen, live two-account collaboration, production, CI. Server/sync tests not run because those services are unchanged. Full $goat-discipline content was not expanded or found on this host after filesystem and GOAT discovery; the core developer GOAT discipline, supplied task rules, web AGENTS/CLAUDE, and local Next 16.4.5 use-client guide were followed.

Existing eight skipped tests: five intentionally disabled frame-follow wobble cases, two intentionally hidden Dock pen/signals cases, one intentionally hidden system-board promotion toast case. No skip was added or broadened.

## Parent integration note

Parent is independently fixing memoTable.ensureLoaded to flush pending edits and wait for started note mirror writes before reading the table, and Canvas overflow-clip. Neither change is in this patch. flushAll keeps its Promise rejection contract; persistSettled keeps its settle-on-success-or-failure contract. New metadata timer keys are measured:<cardId>; flushAll includes them and they await the normal card's started mirror writes. All normal memo/todo/link mirror keys remain the card id.

## Artifact verification

The binary patch was applied to a temporary Git index seeded from the requested base (no checkout/worktree created). Its written tree equals HEAD's tree 0f62e2085a7f6f5f0da30511e71135ec4a0e50fa. Fetching changes.patch over the requested 100.117.197.86 URL returned HTTP200 and the expected SHA256. The initial immediate curl raced server startup; the subsequent request succeeded.

HTTP server: python3 -m http.server 48763 --bind 0.0.0.0 --directory /tmp/moss-ux-save-transfer ; PID1176890 ; stop on this host with kill 1176890. Only patch/i18n/manifest/report/checksums live in the served directory. No credentials or user data.
