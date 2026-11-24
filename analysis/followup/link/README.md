# Link editor verification

Implementation commit: 9459277. Actual production Breadcrumb rendered in a temporary local route, with production WorkspaceShell breadcrumb wrapper classes and a long board name. WorkspaceShell controls were not rendered in this fixture; their markers are included in the product implementation.

390×844 CSS pixels, native browser DPR 2; original PNGs are 780×1688. before.viewport.json: actual old editor top64/header bottom75 => gap -11 (FAIL). after.viewport.json: fixed top83/header bottom75 => gap8 (PASS). Measured with getBoundingClientRect; no screenshot resizing. Fixed source was restored after capturing old source.

red.log: regression test on old source: 1 failed,4 passed. green.log: fixed source,7 files,64 passed,2 existing skipped. Regression covers measured header bottom and window resize/maxHeight.

Actual browser input/click: saved URL https://example.com/saved edited to https://example.com/edited, Done clicked, reopened and input showed edited URL. Changed to /discard, Cancel clicked, reopened and input still showed /edited. Both buttons measured48×48. Reduced viewport390×300: header bottom75,dialog top83,bottom292; gap8 and bottom inset8 preserved.

NOT RUN: native software keyboard (device use forbidden), visualViewport nonzero offset emulation, full authenticated WorkspaceShell controls fixture, desktop screenshot comparison. Desktop editor invocation code unchanged. This evidence verifies the production Breadcrumb overlap scenario; full requested QA remains UNVERIFIED for these unrun items.

Temporary route/server are removed/stopped after QA. Existing AGENTS.md and unrelated analysis changes excluded.
