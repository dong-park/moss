# Moss UX — Independent Integration Review (Round 3)

**Reviewer:** fresh local Claude (Opus 4.8) review lane, GOAT-managed worktree
**Date:** 2026-11-13
**Base:** `36fe2060fc9ee2e40074826d203e4238cc9a3c6d` (clean)
**Patch:** `review-round3.patch`, SHA256 `b1fb75606060347b94a2ef938818f99733635a35373731814be098f97abf1b0b` (verified)
**Patch applied:** ONCE to clean base via `git apply` (clean, no rejects)
**PR:** none (review/verification only — no push/PR/merge/deploy)

## Verdict: CHANGES REQUESTED

Exact source tree matches the manifest and all static gates pass, **but the full test
suite is not green** (15 failed / 2063 passed / 8 skipped). Two of the failing files are
**introduced by this patch**; one is pre-existing; one is flaky. The required gate
("full suite: zero failures/errors, existing skips 8 only") is **not met**, so this is
not an approval.

The four accepted Round-1/Round-2 findings (R1-source-reentry, R1-title-mirror,
R1-retry-resurrection, R1-privacy-keyboard) are **independently verified closed** — their
committed probe/regression tests pass and source inspection confirms the logic.

---

## 1. Tree equivalence (manifest)

Script compared SHA256 of every file under `web/src` plus `web/package.json` /
`web/bun.lock` against `review-round3-source.json`:

```
MANIFEST FILES: 511
ACTUAL web/src+pkg FILES: 511
MISSING: 0   HASH MISMATCH: 0   EXTRA: 0
RESULT: EXACT TREE EQUIVALENCE under web/src + package/lock
```

- **Exact tree equivalence** — no missing, no hash mismatch, no extra files under `web/src`.
- Only generated/non-`web/src` files sit outside the manifest (acceptable per brief).
- **Temporary parent UX QA route: ABSENT.** `web/src/app` route dirs are
  `about, api/*, b/[boardId], j/[token], legal/*` only. No `ux-qa`/review route exists
  in the tested build. (Parent separately confirmed its cleanup removed it.)
- No files imported from the prior reviewer tree.

## 2. Static gates (web/)

| Gate | Command | Result |
|------|---------|--------|
| Typecheck | `bunx tsc --noEmit` | **PASS** (exit 0) |
| Lint | `bun run lint` | **PASS** (exit 0; 3 warnings, 0 errors) |
| i18n | `bun run check:i18n` | **PASS** (exit 0; reports 110 pre-existing *unused* keys as warnings, no missing keys) |
| Build | `NEXT_TELEMETRY_DISABLED=1 bun run build` (Next 16.4.5 Turbopack) | **PASS** (exit 0; "Compiled successfully in 8.0s", 8/8 static pages) |

Dependencies installed with `bun install --frozen-lockfile` (lockfile unchanged, no edits).

Lint warnings (non-blocking, pre-existing style): unused `waitFor` import in
`Dock.linkTodoPhoto.test.tsx`; unused eslint-disable in `photoContent.test.tsx`;
unused `scope` in `exportStore.ts`.

## 3. Full test suite — FAILS

Command (exact required): `NODE_OPTIONS=--no-experimental-webstorage bun run test`

```
Test Files  4 failed | 233 passed (237)
     Tests  15 failed | 2063 passed | 8 skipped (2086)
```

Every failure was **re-run in isolation** to separate deterministic defects from
flakiness. See findings below.

### F1 — MobileCardControls.test.tsx: 12/12 FAIL — **P1, patch-introduced (BLOCKER)**

- **Isolated result:** 12 failed / 12 (deterministic).
- **Error:** `Error: [vitest] No "useStackedZoomControls" export is defined on the
  "../useCompactControls" mock.` thrown from `ZoomBar.tsx:15` (`const stacked = useStackedZoomControls();`).
- **Root cause:** The patch **added** `useStackedZoomControls` to
  `web/src/components/workspace/useCompactControls.ts` and made `ZoomBar.tsx:15` call it.
  `MobileCardControls.test.tsx:9` mocks the whole module:
  `vi.mock("../useCompactControls", () => ({ useCompactControls: () => true }));`
  — it was **not updated** to export `useStackedZoomControls`. This test file is
  byte-identical to base; at base the mock was complete (ZoomBar used only
  `useCompactControls`). Rendering the tree (which includes `ZoomBar`) now throws, failing
  all 12 tests.
- **Repro:** `bun run test src/components/workspace/__tests__/MobileCardControls.test.tsx`
- **Requested change:** add the missing export to the mock factory, e.g.
  `vi.mock("../useCompactControls", () => ({ useCompactControls: () => true, useStackedZoomControls: () => false }));`
  (or use `importOriginal`). Verify 12 pass.

### F2 — ZoomBar.test.tsx: 1 FAIL — **P2, patch-introduced (test defect; component correct)**

- **Isolated result:** 1 failed / 7 passed (deterministic).
- **Test:** "keeps the tablet zoom row above the full dock and restores desktop placement on resize".
- **Assertion:** expects `zoom.style.bottom` to be `calc(84px + env(safe-area-inset-bottom, 0px))`;
  **received** `calc(84px + env(0px * , * safe-area-inset-bottom))`.
- **Root cause:** `ZoomBar.tsx:36` sets a **valid** CSS value
  `calc(${stacked ? zoomBottom : 20}px + env(safe-area-inset-bottom, 0px))`. jsdom's CSSOM
  mis-serializes `env()` with a comma fallback on round-trip. The patch-added test asserts
  the raw intended string, which jsdom can never return. **The component is correct**
  (parent verified real-Chromium rect gap separately); only the test assertion is
  jsdom-incompatible.
- **Repro:** `bun run test src/components/workspace/__tests__/ZoomBar.test.tsx`
- **Requested change:** assert against the jsdom-normalized value, or assert the chosen
  offset (84 vs 20 px) via a tolerant matcher / regex on the px term, rather than the exact
  `env()` fallback string. Do **not** change the (correct) component CSS.

### F3 — undo.review3.test.tsx: 1 FAIL — **P2, PRE-EXISTING (not introduced by this patch)**

- **Isolated result:** 1 failed / 24 passed (deterministic).
- **Test:** "글상자 왼쪽 핸들로 폭을 줄이면 cmd+z 1번에 폭과 x가 함께 돌아간다".
- **Error:** `Error: \`Tooltip\` must be used within \`TooltipProvider\`` (radix) during render.
- **Root cause:** the test renders `<I18nProvider><DraggableCard/></I18nProvider>`
  (line 299-303) with **no** `TooltipProvider`. `DraggableCard` renders
  `AIOptOutBadge` (line 173), which uses `@radix-ui/react-tooltip` `Tooltip.Root/Trigger/Content`.
  Verified against base `36fe206`: `AIOptOutBadge.tsx` already used radix Tooltip,
  `DraggableCard` already rendered it, and `undo.review3.test.tsx` is **byte-identical to
  base** — so this test fails at base too. **Pre-existing**, matching the parent's own
  "historical fullsuite failure" note. The parent fixed `canvasCapture.test.tsx`
  (wrap real Providers) but **did not** apply the same fix to `undo.review3.test.tsx`.
- **Repro:** `bun run test src/components/workspace/__tests__/undo.review3.test.tsx`
- **Requested change:** wrap the render in a `TooltipProvider` (the same remedy already
  applied to `canvasCapture.test.tsx`). No production change needed.

### F4 — InviteRoute.test.tsx: 1 FAIL in full suite, PASSES isolated — **P3, flaky/pollution**

- **Full-suite:** 1 failed ("로그인만으로는 수락하지 않는다 — 참여하기 1탭이 동의 지점";
  `expected "vi.fn()" to be called at least once`, component stuck on loading/stage screen).
- **Isolated result:** **12 passed / 12** — passes cleanly alone.
- **`--maxWorkers=2` full run:** also **passes** (only F1–F3 fail there).
- **Assessment:** order-dependent / timing flakiness under full-suite default-parallel load
  (not a deterministic product or test defect). Recommend investigating test isolation
  (shared global/async state) but it does not block on its own.

### maxWorkers=2 cross-check (parent's exact invocation)

A second full run with the parent's exact `--maxWorkers=2` invocation:

```
Test Files  3 failed | 234 passed (237)
     Tests  14 failed | 2064 passed | 8 skipped (2086)
```

- Same **3 deterministic failing files** (F1 MobileCardControls 12, F2 ZoomBar 1,
  F3 undo.review3 1) — invariant to worker count, confirming they are real.
- **InviteRoute (F4) PASSES under `--maxWorkers=2`** (and in isolation) — confirming it is
  flaky/order-dependent, not a deterministic defect.

> Note: this `--maxWorkers=2` result (14 failed) **does not reproduce** the parent's
> reported "2030 passed, 0 failed" for this exact tree. The tablet-zoom integration
> (`useStackedZoomControls` + `ZoomBar.tsx`) that broke F1/F2 appears to have landed after
> the parent's last green full-suite run; F3 is a long-standing historical failure. The
> exact proposed tree is not suite-green under either invocation.

## 4. Accepted-finding closure — all VERIFIED

Each accepted finding's committed probe/regression test **passed** in the full suite, and
source inspection confirms the fix:

- **R1-source-reentry** (`state/ydoc/doc.ts`): `destroy()` calls `retain(writes.size>0)`
  **synchronously before** `await Promise.allSettled([...writes])` (doc.ts:173-174). A
  re-entrant `openBoardDoc` during the settling window finds the retained entry and returns
  the **same live handle** (doc.ts:46-51), never a fresh loader over stale disk. Durable
  signal fires on `tx.oncomplete` (doc.ts:84), not provider-connect. Probe
  `saveReview/recovery-active.probe.test.tsx` aborts a real IDB transaction, does an
  A→B→A navigation, and asserts the returned doc retains the latest content and reaches
  `saved` — PASS.
- **R1-title-mirror** (`state/storage.ts`): `updateNoteTitle` shares the serialized
  `mirrorQueue` + `mirror:${id}` resource with `saveNote`, merges retained `failedMirrorPatch`
  fields into the title transaction (storage.ts:414), and its no-op guard still flushes
  when a failed body patch exists (storage.ts:397). A title-only success can no longer mark
  the shared mirror saved over an unwritten body. `saveReview/save.probe.test.tsx` — PASS.
- **R1-retry-resurrection** (`state/storage.ts` + `cardPersist.ts`): `hardDeleteNotes`
  (storage.ts:446-450) and `trashNotes` (storage.ts:495) `await persistSettled(ids)` then
  `failedMirrorPatch.delete(id)` + `cancelPersist(id)` at the authoritative delete boundary;
  `cancelPersist` also `forgetSaveResource` + clears timers (cardPersist.ts:115-125). A
  purged row can no longer be resurrected by a retained retry. `saveReview/deletion.probe.test.tsx` — PASS.
- **R1-privacy-keyboard** (`components/workspace/CardPrivacyControl.tsx`): control root has
  `onKeyDown={e => e.stopPropagation()}` (CardPrivacyControl.tsx:39) — stops the event
  reaching the window-level Canvas keydown handler (Canvas.tsx:462) while preserving native
  default (no `preventDefault`). Escape handled locally. `CardPrivacyControl.test.tsx`
  asserts `fireEvent.keyDown(...).toBe(true)` (default preserved) and a real window shortcut
  spy is never called (line 39-50) — meaningful, not implementation-mirroring. PASS.

## 5. Other spot-checks

- **saveFeedback policy** (`state/saveFeedback.ts`): `boardSavePhase` returns `"unknown"`
  unless `document.saved` is true (line 24-26) — a search mirror alone never implies the
  source was persisted; delta saves pass `coversPrevious=false` so they cannot clear prior
  failures. Correct per approved policy ("never provider connected ⇒ server saved").
- **Sharing scope text**: new `reviewGuidance.share.scope` /`.access`/`.unshare` strings
  accurately match server/sync behavior — `sync/src/mcpBoards.ts:11` ("boards nested inside
  inherit the root's role"), `web/src/state/membership.ts:298 shareSubBoards()` (uploads
  folders inside a shared board), `server/.../BoardRoutes.kt:323` (closes board + descendants
  on unshare), and the unshare caveat that already-downloaded copies are not recalled. No finding.
- **Probe/regression coverage**: committed tests for the accepted findings and the new
  marker (`MemoExpand.test`), privacy (`CardPrivacyControl.test`), table
  (`MemoTable.test`/`memoTable.test`), recovery (`saveReview/recovery*`), link preview/race
  (`linkMemo.*`, `LinkFace.preview`), share guidance (`SharePopover.guidance`), and
  save-feedback/noop (`saveFeedback*`, `saveNoop`) suites all pass in the full run.

## 6. Observations (not findings)

- Dev-runtime warning "Add Yjs type to a document before reading data" originates in
  **unchanged** `shared/doc-model` (`src/index.ts`) — outside the web/src review tree;
  logged by the parent as uninvestigated. Appears as stderr noise during tests; does not
  fail any assertion. Recorded, not a clean-console claim.

## 7. Limitations

- Node/jsdom automated gates only. No real-browser, physical-device, Android, or
  two-account runtime QA performed by this lane. Parent reports real-Chromium
  (320/390/820/1280) and Safari iOS27 simulator (XCTest) checks separately; those are not
  re-run here and are not claimed.
- `env()` safe-area behavior (F2) is a jsdom serialization limitation; the component CSS is
  correct and was not executed in a real browser by this lane.

## 8. Required to approve

1. Fix **F1** (MobileCardControls mock missing `useStackedZoomControls`) — blocker.
2. Fix **F2** (ZoomBar env() assertion incompatible with jsdom) — test-only.
3. Fix **F3** (undo.review3 missing `TooltipProvider`) — pre-existing; wrap providers.
4. Investigate **F4** (InviteRoute flakiness / isolation).

Re-run `NODE_OPTIONS=--no-experimental-webstorage bun run test` to green (0 failed, 8
skipped) before approval. Tree, static gates, build, and all accepted-finding closures are
otherwise clean.
