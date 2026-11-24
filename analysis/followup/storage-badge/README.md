# Storage badge header verification
Actual product Breadcrumb, SaveFeedback, ViewToggle, AccountMenu, OfflineBadge and ShareControlMount rendered in a QA fixture without WorkspaceGate/auth. WorkspaceShell header classes copied verbatim. Normal saved state uses beginSave(...).success(); a QA interval maintains the seed against root bootstrap. This is a component/header fixture, not full WorkspaceShell or authenticated QA.

Before: HEAD SaveFeedback source copied as BaselineSaveFeedback; original Breadcrumb and header positions. After: dirty product components and updated WorkspaceShell classes. Same long Korean board name. Source retained in fixture-*.txt and baseline-Breadcrumb.tsx.txt; initial dirty files preserved in initial-dirty.patch and dirty-sha256.json.

390×844: beforeRect.json overlap=true (RED), afterRect.json overlap=false (GREEN). Saved label remains in role=status, visually hidden on mobile. before.png and after.png are 780×1688 exports of direct GOAT viewport captures.
1280×800: desktopRect.json overlap=false; saved label position=static, width 72.07px, height 13px.
20 tests passed, i18n exit 0 (unused-key warnings retained). tests.log and i18n.log contain fresh runs.
NOT RUN: full authenticated WorkspaceShell, full suite, native mobile device.
Temporary QA routes/server removed after capture. Existing unrelated changes and screenshots excluded from commit.
