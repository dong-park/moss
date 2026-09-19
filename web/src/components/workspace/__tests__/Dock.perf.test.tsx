import { Profiler } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import { Dock } from "@/components/workspace/Dock";

/**
 * 독 hover 성능 회귀 방지: 독 위에서 마우스를 100번 움직여도 React 렌더(커밋)가
 * 몇 번 안 일어나야 한다. 확대 크기는 MotionValue로 DOM에 직접 쓰고, React 상태는
 * "이름표를 보여줄 아이콘"이 바뀔 때만 갱신한다.
 */

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
  // 버튼 3개(펜·시그널스 임시 숨김, 2026-09-19)를 40px 폭·48px 간격으로 배치.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    const order = ["메모판", "메모", "파일함"];
    const i = order.indexOf(this.getAttribute("aria-label") ?? "");
    const left = i < 0 ? 0 : i * 48;
    const width = i < 0 ? 260 : 40;
    return {
      left,
      right: left + width,
      top: 0,
      bottom: 56,
      width,
      height: 56,
      x: left,
      y: 0,
      toJSON() {
        return {};
      },
    } as DOMRect;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("독 hover 성능", () => {
  it("mousemove 100회에 Dock 렌더 커밋은 이름표 대상이 바뀐 횟수(아이콘 3개)뿐", () => {
    let commits = 0;
    render(
      <I18nProvider locale="ko">
        <Profiler id="dock" onRender={() => commits++}>
          <Dock />
        </Profiler>
      </I18nProvider>,
    );
    const dock = screen.getByRole("toolbar");
    fireEvent.mouseEnter(dock);
    const start = commits;
    // 독 왼쪽 끝에서 오른쪽 끝까지 2px씩 훑는다.
    for (let k = 0; k < 100; k++) {
      fireEvent.mouseMove(dock, { clientX: k * 2 });
    }
    const perHundred = commits - start;
    expect(perHundred).toBeLessThanOrEqual(5);
  });
});
