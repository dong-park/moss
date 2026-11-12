# UX save-failure P1 fixes — implementation child report

Base `bbfd708` (parent's integrated HEAD) → new HEAD `5bf765bc5368eb4cb2fdc4b9eaff66394a58cc56`.
Delta: `git diff bbfd708..HEAD`. Patch SHA256 `2958547538be56360d32bdaaf7fea9f13aed00c6f7f00128f2453b3d7c6142c0`.

Authorization honored: implementation + verification only. No push / PR / merge / deploy.
Owned files only: `storage.ts`, `ydoc/doc.ts` changed; `saveFeedback.ts`, `cardPersist.ts`,
`activeDoc.ts` needed no change. Did NOT touch privacy P2 / table flush / sentinel (parent owns).

## Files changed
- `web/src/state/ydoc/doc.ts` (P1-1)
- `web/src/state/storage.ts` (P1-2, P1-3)
- `web/src/state/__tests__/saveReview/{recovery,recovery-active,save,deletion}.probe.test.tsx` (regression tests, adapted from review probes into the repo with `@/` aliases)

## The three accepted P1s

**P1-1 — async close/reopen bypassed the only unsaved snapshot (doc.ts).**
`destroy` published recovery only *after* awaiting outstanding writes; `activeDoc` removes the
handle and voids `destroy` without awaiting, so a re-entrant `activateBoardDoc` A→B→A during an
aborted native IDB write built a fresh loader from stale disk and its checkpoint covered the old
failure on the shared `document` key. Fix: `destroy` now registers the live handle into the
`recoverable` map **synchronously**, before the await, so a reopen reuses the same document and its
exact unsaved/failed state (one handle per board id — generations never race). When the close
interrupted an in-flight write (`writes.size > 0` at close), the reopen checkpoints the current full
state once writes settle, so it ends durably **saved**; a close after an already-settled failure only
retains and waits for an explicit retry (does not auto-save behind the caller — this preserved the
existing `saveFeedback.integration` "explicit retry" contract).

**P1-2 — title-only success cleared an unrecovered body mirror failure (storage.ts updateNoteTitle).**
`updateNoteTitle` bypassed the `failedMirrorPatch` queue and reported success on `mirror:<id>` with
`coversPrevious`, clearing a failed body retry without writing the body. Fix: it now shares the
serialized mirror channel with `saveNote` and commits the title together with any retained
`failedMirrorPatch` fields in one `notes`+`trash` transaction (trash-wins + update-not-upsert guards
kept). Success now reflects what was actually committed; the retry closure re-reads the latest failed
fields so the body recovery path is never replaced by a stale title-only retry. Failed body is
recovered to the mirror only (it already lives in the source Y.Doc), so the source is not clobbered.

**P1-3 — storage-level permanent deletion left a retry that resurrected the row (storage.ts).**
`trashNotes`/`hardDeleteNotes` cleared `failedMirrorPatch` but left the `mirror:<id>` retry closure,
so a non-current-board bridge `removeNote` (which never goes through `cancelPersist`) let
`retryBoardSave` re-create the purged row. Fix: both authoritative deletion boundaries now
`cancelPersist(id)` per id (revoking `mirror:<id>` + `mirror:measured:<id>` retries and any queued
debounce writes), after `persistSettled`, in addition to the existing `failedMirrorPatch.delete`.
Source write / delta retention behavior unchanged.

## Verification (run now on new HEAD)
- Review probes `src/state/__tests__/saveReview/`: **RED before** (4 failed), **GREEN after** (4 passed).
  `NODE_OPTIONS=--no-experimental-webstorage bun run test`.
- Focused suites, all pass:
  - ydoc `doc`, `doc.fail`, `activeDoc`; `saveFeedback`, `saveFeedback.integration`: 20 passed.
    (Caught + fixed one regression mid-work: integration "leaving a board after failure… explicit
    retry" — resolved by gating reopen auto-checkpoint on an interrupted in-flight write.)
  - `storage`, `saveNoop`, `trash`, `cardPersist`, `n23-single-source`, `memoTable`,
    `undo.trash.review4`, `undo.trash.review4-tabs`, `undo.core`, `undo.files`, `workspace`,
    `membership`, `connectors`: 265 passed.
  - `Dock`, `TrashPanel`, `MemoTable`, `ac-capture`, `storeOnYjs`, `subcanvas`, `textTool`,
    `serverStore`: 146 passed, 2 skipped.
- `tsc --noEmit`: exit 0. `eslint` on changed files: exit 0.
- NOT RUN (parent's final review owns): full suite, `bun run build`, `check:i18n`, runtime/browser.

## On the reviewer's 4 full-suite failures (requested read of final-test.log)
The reviewer's `final-test.log` (4 failed) were: `canvasCapture` placement ×2 and `undo.review3`
textbox-resize ×1 throwing **`Tooltip must be used within TooltipProvider`**, plus `MemoBlocks`
image-limit ×1 (`accept=image/*` now null / `Object.defineProperty on non-object`).
**These do not reproduce on the current base `bbfd708`.** Running
`canvasCapture.test.tsx`, `undo.review3.test.tsx`, `MemoBlocks.test.tsx` on bbfd708 + these fixes:
**62 passed, 1 skipped, 0 failed.** They are not in my owned files and my changes do not touch them.
So there is no harness change to make here — as flagged, the harness was not changed blindly; the
failures appear tied to the reviewer's patch-reapply/stale-env state, not the committed tree. Parent
should confirm against its own full-suite run (parent owns Tooltip/table-flush/sentinel).

PR none, head 5bf765bc5368eb4cb2fdc4b9eaff66394a58cc56, checks: focused tests + types + lint pass; full suite/build NOT RUN (parent final review).
