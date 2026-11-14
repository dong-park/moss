# Mobile More menu — UNVERIFIED reported symptom

Inspected current HEAD b231761 with actual product Canvas + Dock, using the saved local QA fixture (no SharePopover import). GOAT direct preview open/resize/click/evaluate/snapshot; 390×844 CSS pixels, DPR 2, screenshot 780×1688.

![Before](before.png)

The reported zoom label bleed-through was **not reproduced**. At the zoom label center (157,734), elementFromPoint returned the folder icon in the menu. Menu opacity is 1, z-index 50; the computed gradient has opaque RGB stops (#fdfcfa / #f5f3ef). A transparent background-color does not make an opaque background-image translucent. The screenshot shows the zoom label covered, with the minus button outside the menu still visible.

No product change or artificial RED test was made. No after image is claimed. Requires the actual failing state to establish a behavioral regression before changing CSS. Existing uncommitted AGENTS/screens were excluded. No device, port 3000, PR, push, merge or deployment actions.

NOT RUN: regression RED/GREEN, related Dock/ZoomBar tests, keyboard/menu-action checks, desktop comparison (no product changes).

Temporary local route and owned port 3014 server removed/stopped after capture. Fixture only changes in-memory workspace state; no board/card persistence API was invoked.
