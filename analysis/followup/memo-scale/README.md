# Memo scale follow-up 3

Current percentage replaces the toggle target: fit percentage in reading, 100% in full-size editing. Localized aria-label/title describe current scale and the next action. Toggle behavior and CSS are unchanged.

PASS: real rendered Milkdown regression produced 3 failures before implementation; related MemoMobile, MemoExpand, MemoMobileFlow, MemoPendingEdit suites pass with 49 tests, serial maxWorkers=1. Existing reflow, edit flush, undo and toggle checks retained.

PASS: Four direct GOAT preview captures at CSS viewport 390×844, devicePixelRatio 2; each PNG asserted 780×1688. captures.json records button text, aria and computed zoom. After read 49% / 0.486111; after full-size 100% / 1. Before target labels 100% / 49%, no aria-label. Real UI button clicks exercised both versions. Board: first row after read/full-size, second row before read/full-size.

Source: HEAD 1091e13 and isolated HEAD^ MarkdownEditor copy (same imports/CSS). MilkdownProvider + actual ExpandedMarkdownEditor, canonical=true, initialFullSize=false; 350px container / 720px canonical column, local QA ink SVG overlay. Full-size captures reached via actual toggle click. These exercise scale modes, not MemoExpandDialog edit entry: editable=false throughout; initialFullSize=true and editable=true entry remain UNVERIFIED. Before fixture initially caused hydration mismatch; final before captures use client-mounted fixture, asserting aria-label is absent.

Temporary route, component copy and own port 3014 server removed/stopped. Product source unchanged. Existing AGENTS and unrelated screenshots excluded from evidence commit.

NOT RUN: fresh unit suite, full build/full suite, actual dialog read-to-edit transition. Existing green.log is prior evidence only.
