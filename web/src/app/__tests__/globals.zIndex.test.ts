import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * FEAT-sticky-redesign n10 브라우저 결함5: BoardDeleteDialog·MemoExpandDialog·
 * BlockMenu의 Dialog.Overlay가 전부 `z-[var(--z-overlay)]`를 쓰는데, 이
 * `--z-overlay` CSS 변수가 globals.css 어디에도 정의돼 있지 않았다 —
 * `z-index: var(--z-overlay)`가 invalid value로 취급돼 초기값(auto)으로
 * 떨어지고, 독(`--z-panel: 40`, position:fixed라 항상 스택 컨텍스트를 만든다)이
 * 오버레이 위에 그려졌다(§4·§7 무관 — Radix Dialog 레이어링 버그).
 *
 * jsdom은 CSS 커스텀 프로퍼티의 실제 계산값(computed value)이나 invalid var()
 * fallback을 계산하지 않으므로, 이 결함은 실제 계단식 계산이 아니라 "변수가
 * 정의돼 있는가" 자체로 재현·검증한다.
 */
describe("n10 브라우저 결함5: --z-overlay 토큰이 정의돼 있고 panel과 modal 사이다", () => {
  const css = readFileSync(join(__dirname, "../globals.css"), "utf-8");

  it("--z-overlay가 :root 토큰 블록에 정의돼 있다", () => {
    expect(css).toMatch(/--z-overlay:\s*(\d+)/);
  });

  it("--z-overlay 값은 --z-panel보다 크고 --z-modal보다 작다(독 아래, 모달 위)", () => {
    const panel = Number(css.match(/--z-panel:\s*(\d+)/)?.[1]);
    const overlay = Number(css.match(/--z-overlay:\s*(\d+)/)?.[1]);
    const modal = Number(css.match(/--z-modal:\s*(\d+)/)?.[1]);
    expect(Number.isFinite(panel)).toBe(true);
    expect(Number.isFinite(overlay)).toBe(true);
    expect(Number.isFinite(modal)).toBe(true);
    expect(overlay).toBeGreaterThan(panel);
    expect(overlay).toBeLessThan(modal);
  });
});
