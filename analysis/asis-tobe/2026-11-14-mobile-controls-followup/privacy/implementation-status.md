Portal implementation follow-up

Rendered regression test RED on previous implementation; GREEN after body portal (18 tests across CardPrivacyControl and MobileCardControls). Scoped eslint and git diff --check passed. Toolbar panel uses trigger viewport bounds, updates on scroll/resize, and excludes both root and portal panel from outside dismissal. Escape restores trigger focus. Canvas placement unchanged.

UNVERIFIED: fresh GOAT browser hit-test, checkbox state round-trip, 390x844 DPR2 PNG. surface.screen_run discovery failed with runtime_unavailable before effects. Earlier screenshots remain historical evidence, not verification of this change.
NOT RUN: full build, fresh browser interaction and screenshots.
