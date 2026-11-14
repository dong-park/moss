Mobile ink edit entry: initialFullSize is enabled only for compact editable canonical notes. Prop transitions update state; ordinary rerenders preserve user toggles.

RED: new regression failed; GREEN: MemoExpand 31 tests passed. Actual DOM: 390×844 DPR2, canonical full size, zoom 1, body 720px, scrollWidth 720 > clientWidth 350.

UNVERIFIED: correct before editor PNG/JSON, desktop and plain DOM, toggle interaction, PNG dimensions. Initial before capture showed the board and is not a valid comparison. Temporary QA route predates this implementation; parent must clean it up.

NOT RUN: full build/test (explicitly excluded).
