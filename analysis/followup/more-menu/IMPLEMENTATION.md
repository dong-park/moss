# Compact More menu visibility

Dock exposes its existing Radix open state as data-mobile-more-open only when compact. globals.css hides compact ZoomBar and dock labels while that attribute is true. visibility:hidden removes zoom descendants from tab navigation and hit testing; closing Radix removes the selector condition. Desktop does not acquire the true attribute.

## Verification

- RED: moreMenuVisibility.test.ts failed before implementation (missing open-state attribute).
- GREEN: Dock, Dock.linkTodoPhoto, ZoomBar and selector contract tests: 45 passed, 2 existing skipped.
- Targeted ESLint: passed.
- tsc --noEmit: passed.

UNVERIFIED: browser computed visibility, hit testing, keyboard traversal, Escape focus restoration, item selection, 390×844 DPR2 before/after/closed screenshots. Existing before.png is retained; no new screenshot is claimed. The selector contract test is source-level evidence, not browser behavior evidence.

NOT RUN: real browser UI verification and webpack fixture compilation.
