# Privacy actual browser evidence

Actual GOAT isolated preview, 390×844 CSS pixels, DPR 2; before.png and after.png verified as 780×1688 PNG. board.png places the original captures side by side.

After: git archive a8e5e55 in /tmp/privacy-isolated-qa, production Canvas/Dock and existing fixture-final.tsx.txt, auto-selecting its first card. Before: same isolated app and fixture, replacing only CardPrivacyControl.tsx and MobileCardControls.tsx with git show 7b79d65 versions. Current workspace product sources were never changed. Browser local persistence was initialized by the fixture and production bootstrap. Server: dedicated port 3197; stopped after capture. Own preview tab closed. No device/adb actions, push or PR changes.

| Check | Result |
|---|---|
| Before overlapping card top | PASS: floating privacy x11.25 y108 overlaps first card x34 y86 |
| After privacy in selection toolbar | PASS: x128.23 y768, 76.27×48px, card top unobstructed |
| Toolbar width | PASS: 374px, scrollWidth/clientWidth 372/372; all six buttons within viewport; overflow-x auto |
| Settings opening | PASS: expanded text and checkbox appear in DOM |
| Settings toggle | FAIL: actual click refused before dispatch, intercepted by div.relative.h-full.overflow-clip; checkbox stays false. Panel above toolbar is clipped by scroll container. See after-settings-clipped.png. Requires implementation follow-up; no product fix made by this test lane. |
| Desktop 1280×800 | PASS: privacy DOM position absolute, outside toolbar, x11.25 y108, 104.19×41.25px |

Initial isolated-server setup errors: Turbopack symlink root resolution; webpack CSS pure-selector rejection. Resolved by using Turbopack with isolated config root '/'. Production components remained byte-exact in the after run. Previous error console entries predate successful rendering.

NOT RUN: full build/test and device checks (evidence-only lane; existing 17-pass RED/GREEN not rerun). Next link work not started. Overall behavior FAIL because checkbox is inaccessible despite successful relocation.
