# Moss UX — Round 3 Test-Fixture Repair & Exact-Tree Re-Verification

**Lane:** test sub-agent (Opus 4.8), GOAT-managed reviewer worktree
**Date:** 2026-11-13
**Base:** `36fe2060fc9ee2e40074826d203e4238cc9a3c6d` + round3 patch
`b1fb75606060347b94a2ef938818f99733635a35373731814be098f97abf1b0b`
**Scope:** test fixtures / regressions only. **No production source changed.** No push / PR / merge / deploy.
**Prior report:** `/tmp/moss-independent-review-round3/report.md` (CHANGES REQUESTED) — kept immutable; this is a separate repair record.

## Verdict: GREEN — all five gates pass on the exact final tree

The four findings the prior round-3 review raised (F1–F4) are repaired with **test-only** edits.
Exact-tree equivalence holds: 511/511 manifest files, 508 identical to round3, **exactly 3 changed**,
all three test files. All five gates pass.

| Gate | Command (exact) | Result |
|------|-----------------|--------|
| Full suite | `NODE_OPTIONS=--no-experimental-webstorage bun run test --maxWorkers=2` | **PASS** — 237 files, **2078 passed / 8 skipped / 0 failed**, exit 0 |
| Typecheck | `tsc --noEmit` | **PASS** (exit 0) |
| Lint | `bun run lint` | **PASS** (exit 0; 3 pre-existing warnings, 0 errors) |
| i18n | `bun run check:i18n` | **PASS** (exit 0; unused-key warnings only, no missing) |
| Build | `NEXT_TELEMETRY_DISABLED=1 bun run build` | **PASS** (exit 0; "Compiled successfully", 8/8 static pages) |

Previously (unchanged round3 source): 2063 passed / **15 failed** / 8 skipped. Now 2078 passed =
2063 + the 15 repaired tests. Existing skips unchanged at 8.

## Repairs (test-only)

### F1 — MobileCardControls.test.tsx — P1 blocker — FIXED
- **RED (fresh):** 12/12 fail — `Error: [vitest] No "useStackedZoomControls" export is defined on the "../useCompactControls" mock.` (thrown from `ZoomBar.tsx:15`).
- **Cause:** round3 added `useStackedZoomControls` to `useCompactControls.ts` and `ZoomBar.tsx:15` calls it; the whole-module mock at line 9 only exported `useCompactControls`.
- **Fix:** added `useStackedZoomControls: () => true` to the mock factory. `compact=true` is the mobile
  layout, so `stacked=true` (zoom row on its own row) is the internally consistent value. No behavior
  assertion changed.
- **GREEN:** 12/12 pass.

### F2 — ZoomBar.test.tsx — P2 test-only (component correct) — FIXED
- **RED (fresh):** 1 fail / 7 pass — expected `calc(84px + env(safe-area-inset-bottom, 0px))`,
  received jsdom's `calc(84px + env(0px * , * safe-area-inset-bottom))`.
- **Cause:** `ZoomBar.tsx:36` sets a valid CSS value; jsdom's CSSOM re-serializes `env()` with a comma
  fallback. The test asserted the raw intended string jsdom can never return.
- **Fix:** added `asCssBottom()` — a helper that round-trips the **expected** string through the same jsdom
  CSSOM (`el.style.bottom = v; return el.style.bottom`). The two assertions now compare the actual inline
  style to the identically-normalized expected. This **preserves** both the 84-vs-20 offset distinction
  **and** the full `env(safe-area-inset-bottom, 0px)` fallback expression — it does not hard-code jsdom's
  malformed form and does not drop assertions. **Component CSS unchanged.**
- **GREEN:** 8/8 pass.

### F3 — undo.review3.test.tsx — P2 pre-existing (byte-identical to base) — FIXED
- **RED (fresh):** 1 fail / 24 pass — ``Error: `Tooltip` must be used within `TooltipProvider` `` during
  render of the textbox-resize standalone test.
- **Cause:** that test renders `<I18nProvider><Live/></I18nProvider>` where `Live` renders `DraggableCard`,
  which renders `AIOptOutBadge` using Radix `Tooltip`. No `TooltipProvider` in the tree. (Present at base
  too; the parent applied the same remedy to `canvasCapture.test.tsx` but not here.)
- **Fix:** wrapped that one render in `<Providers>` (the app's `Tooltip.Provider`), mirroring
  `canvasCapture.test.tsx:174`. The `cmd+z` width+x undo-one-step assertions are preserved unchanged. No
  production change.
- **GREEN:** 25/25 pass.

### F4 — InviteRoute.test.tsx — P3 — resource transient, not a code/test-logic defect
- **Symptom (prior full default-parallel run only):** 1 fail — "로그인만으로는 수락하지 않는다 — 참여하기
  1탭이 동의 지점"; `expected "vi.fn()" to be called at least once` at line 112
  (`waitFor(() => expect(google.renderButton).toHaveBeenCalled())`), component still on the login-onboarding
  loading stage.
- **Investigation:**
  - `google-slot` is rendered in **every** `GoogleSlot` phase (including `loading`, with a cover), so
    `findByTestId("google-slot")` resolves while still loading; the follow-up `waitFor(renderButton)` then
    races the `loading → button → attachGoogleSignIn → renderButton` microtask chain against its default
    1000 ms **wall-clock** budget.
  - Deterministic in isolation: **12/12 pass ×4 consecutive runs** this session. Prior lane: pass in
    isolation and under `--maxWorkers=2`; failed only once under full default parallelism on a contended
    host. vitest default config is `pool: forks, isolate: true`, so there is no cross-file jsdom/`navigator`
    leak — the failure is CPU-starvation of the wall-clock `waitFor`, i.e. an **unrelated transient resource
    failure**, not a product or test-logic defect.
- **Action:** no weakening, no timeout inflation, no skip, no retry-until-lucky. The final full suite is run
  at `--maxWorkers=2`, a parallelism this 6-core host (with 2 other active heavy threads, load ≈2.3)
  actually sustains — the resource-appropriate, reproducible invocation. F4 **passes** in that green run.
  No source or fixture edit was warranted.

## Delta patch & exact-tree equivalence

- **Delta patch:** `round3-test-repair.delta.patch` (69 lines) — my repairs **relative to the applied round3
  source**, not the base36 whole patch. Touches only the 3 test files. `git apply -p1` to a round3 tree is
  validated: applying it to hash-verified round3 before-copies reproduces the exact final files (all three
  SHA256 MATCH). Parent can `git apply --check` it on the round3-applied tree.
- **Before-versions hash-verified:** each repaired file's round3 "before" SHA256 matches
  `review-round3-source.json` (MobileCardControls & undo.review3 are byte-identical to base36; ZoomBar's
  round3 version was reconstructed base36 + patch and hash-confirmed `cf52e6be…`).
- **Final manifest:** `final-source.json` (same scope: `web/src` + `web/package.json` + `web/bun.lock`).
  511 files, 0 missing, 0 extra, **508 identical to round3, exactly 3 changed = the 3 repaired test files.**
  No production source changed; `web/package.json` / `web/bun.lock` unchanged.

## Notes / limitations

- Accepted-finding closures (R1 source-reentry, title-mirror, retry-resurrection, privacy-keyboard) were
  independently confirmed closed by the prior report and are not re-litigated; their source is unchanged.
- Node/jsdom automated gates only. No real-browser / device / Android / two-account runtime QA in this lane
  (parent reports those separately). The F2 `env()` behavior is correct in real Chromium per the parent;
  this lane only re-verifies the jsdom-normalized assertion.
- Static gates (tsc/lint/build) were re-run because the changed test files are TS/lint/build inputs; all pass.
