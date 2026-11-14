# Memo scale follow-up 3

Current percentage replaces the toggle target: fit percentage in reading, 100% in full-size editing. Localized aria-label/title describe current scale and the next action. Toggle behavior and CSS are unchanged.

PASS: real rendered Milkdown regression produced 3 failures before implementation; related MemoMobile, MemoExpand, MemoMobileFlow, MemoPendingEdit suites pass with 49 tests, serial maxWorkers=1. Existing reflow, edit flush, undo and toggle checks retained.

UNVERIFIED: direct GOAT preview at 390×844, DPR 2, four before/after screenshots and viewport JSON, visual board PNG. No fixture/server was created or changed.

NOT RUN: full build/full suite (outside requested scope); browser capture.
