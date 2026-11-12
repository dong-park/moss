# UX guidance slice

Base: 36fe2060fc9ee2e40074826d203e4238cc9a3c6d. Class C2. Local implementation and verification only.

Plan: add transient link-preview status/retry in linkMemo and the text link face, preserving exact-content and request-order guards. Share one attachment guidance component and limits across photo, BlockMenu and MarkdownToolbar inputs. Explain existing share subtree/attachment/access/unshare semantics in SharePopover. Confirm named/count-scoped permanent deletion in TrashPanel, keep confirmed snapshots and show action/load errors with retry.

Verification: focused Vitest suites (one worker), TypeScript, changed-file ESLint, i18n check; parent runs integrated suite/build. New failure, cancellation and stale-response assertions must fail before implementation. Browser/device/two-account verification remains separate.

Source checks: server BoardRepository.roleOf traverses parents; BoardRoutes files require membership, invites/accept requires authentication and grants editor, deleteBoardTree removes subtree files/rows and closes sync connections. sync/membership.ts traverses the same parent chain. web state/share/attachments.ts stores locally before background upload and backfills existing attachments. web state/membership.ts:298 registers/uploads subboards. Revocation cannot recall already exported/downloaded copies; no stronger erasure promise is made. Storage restoreNote restores original board/position if it exists, otherwise uses current board fallback. purgeTrash accepts a fixed id list and retains referenced attachment blobs per existing history rules.

## Results (2026-11-13 KST)

- RED: named/count-scoped trash confirmation and error tests: 5 failed / 4 passed against pre-change TrashPanel. The old no-confirmation assertion was replaced because the requested product policy explicitly requires confirmation; cancellation and actual persistence are now asserted.
- RED: link status tests: 4 failures before the new transient status API. Standalone linkMemo.race.test.ts additionally failed against the exact base implementation because OBSOLETE metadata was written after A→B→A while the latest request was pending.
- RED: photo guidance/status and share scope tests: 4 failures against base surface implementations.
- GREEN: related suites: **21 files, 134 passed, zero failed, 1 existing skip**, one worker, 89.95s. No tests were newly skipped. Existing skip: canvasCapture.test.tsx:408, system-board promotion toast intentionally hidden by the 2026-09-22 product decision.
- `PATH=/home/dongpark/.bun/bin:$PATH bunx tsc --noEmit` in web: exit 0.
- `bunx eslint` for all 21 changed/new TS/TSX files: exit 0.
- `PATH=/home/dongpark/.bun/bin:$PATH bun run check:i18n` in web: exit 0, 82 unused-key warnings (dynamic keys are not statically resolved).
- `git diff --check`: exit 0.

The first i18n invocation failed because bun was absent from the shell PATH; the explicit PATH command above reran successfully. During implementation, two title-enrichment tests caught parseBlock's URL-as-default-title behavior; canonical block comparison fixed it. One new photo test initially used unavailable Chai matchers; importing jest-dom/vitest fixed test setup. These were not skipped or weakened.

Final related-suite command (from web):

```sh
PATH=/home/dongpark/.bun/bin:$PATH bun run test src/components/workspace/__tests__/TrashPanel.test.tsx src/components/workspace/__tests__/linkMemo.preview.test.ts src/components/workspace/__tests__/linkMemo.race.test.ts src/components/workspace/__tests__/MobileLinkEditor.test.tsx src/components/workspace/__tests__/canvasCapture.photo.test.ts src/components/workspace/__tests__/canvasCapture.test.tsx src/components/workspace/cards/text/__tests__/LinkInputFace.test.tsx src/components/workspace/cards/text/__tests__/LinkInputFace.mobile.test.tsx src/components/workspace/cards/text/__tests__/LinkFace.preview.test.tsx src/components/workspace/cards/__tests__/photoContent.test.tsx src/components/workspace/cards/__tests__/photoGuidance.test.tsx src/components/workspace/cards/_shared/__tests__/MarkdownToolbar.test.tsx src/components/workspace/cards/_shared/__tests__/MarkdownToolbar.upload.test.tsx src/components/workspace/cards/_shared/editor/__tests__/BlockMenu.guidance.test.tsx src/components/workspace/cards/_shared/editor/__tests__/imagePaste.test.ts src/components/share/__tests__ src/state/share/__tests__/attachments.test.ts src/state/__tests__/trash.test.ts src/state/__tests__/undo.trash.test.ts "--maxWorkers=1"
```

## Acceptance scope and remaining checks

- U11: preview loading/failure/retry and stale-response protection verified in unit/component tests; existing mobile Done/Cancel/back/conflict suite included. Preview feedback does not claim local durable persistence. Existing title enrichment remains and retry preserves custom titles. Status is session-only and is not persisted or reconstructed on reload.
- UX-12: validator-derived image types/size and general-file size, input placement/local/shared storage copy, cancellation, local saving and failures covered in component/validation suites. Parent must wire shared AttachmentInputGuidance into its owned Dock photo entry point. Full actual file chooser/drop/reload/browser acceptance is UNVERIFIED.
- UX-13: subtree/attachment scope, authenticated editor joining, owner management and revocation limits match inspected server/sync/client source; local/shared popover copy tests pass. Runtime server/sync and real two-account sharing/unsharing remain UNVERIFIED.
- UX-14: named/count-scoped individual/empty confirmation, confirmed-id snapshots, cancellation, failed purge/restore/list retry, target-specific accessible names and original-board restore guidance tested; existing trash/undo suites included. Folder cascade/undo countdown surfaces outside TrashPanel were not changed. Full actual UI acceptance remains UNVERIFIED.

NOT RUN: full web suite, full repository lint, build, CI, real browser layout/accessibility, 320/390/820px/zoom/IME, Android/Safari/pen, actual OPFS file chooser/drop/reload, two-account collaboration, server/sync runtime suites. GOAT host.status reports the browser blocked by host AppArmor; parent must run visible-client validation. No user operational data was accessed. No push/PR/merge/deployment.

Integration: owned changes are linkMemo and text link preview/input surfaces, MobileLinkEditor copy, AttachmentInputGuidance, attachmentLimits, photo Content, MarkdownToolbar, BlockMenu, SharePopover, TrashPanel, their tests, and this record. Only NEW i18n root reviewGuidance was added. Dock, Canvas, BoardCardContent, DraggableCard, textbox and sizing files are untouched. The transfer i18n.json contains only reviewGuidance so the parent can apply the patch excluding ko.json and merge that namespace.
