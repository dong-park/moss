import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import { useWorkspace } from "@/state/workspace";
import { MarkerTray } from "@/components/workspace/MarkerTray";

/**
 * wall-marker n2 (T1·T2·T6·T9·T14): 트레이 — 마카 4개와 천, 집기·내려놓기, 패널, 휴대폰.
 * 실제 스토어 액션을 타므로 트레이 클릭이 `heldTool`을 바꾸는 경로까지 본다.
 */

const realSize = { w: window.innerWidth, h: window.innerHeight };

function setWindowSize(w: number, h: number) {
  Object.defineProperty(window, "innerWidth", { value: w, configurable: true, writable: true });
  Object.defineProperty(window, "innerHeight", { value: h, configurable: true, writable: true });
}

function mount() {
  return render(
    <I18nProvider locale="ko">
      <MarkerTray />
    </I18nProvider>,
  );
}

beforeEach(() => {
  setWindowSize(1280, 800);
  useWorkspace.setState({
    heldTool: null,
    editingId: null,
    markerWidth: "thin",
    lastMarkerColor: "black",
    markerUndoStack: [],
    markerRedoStack: [],
  });
});

afterEach(() => {
  vi.useRealTimers();
  setWindowSize(realSize.w, realSize.h);
  useWorkspace.setState({ heldTool: null });
});

const marker = (name: string) => screen.getByLabelText(`${name} 마카`);

describe("T1 트레이", () => {
  it("마카 4개와 천이 놓여 있고 아무것도 들려 있지 않다", () => {
    mount();
    for (const name of ["검정", "파랑", "빨강", "초록"]) {
      const el = marker(name);
      expect(el.getAttribute("aria-pressed")).toBe("false");
      expect(el.getAttribute("data-lifted")).toBe("false");
    }
    const cloth = screen.getByLabelText("천 지우개");
    expect(cloth.getAttribute("aria-pressed")).toBe("false");
    expect(useWorkspace.getState().heldTool).toBeNull();
    expect(screen.queryByRole("group", { name: "마카" })).toBeNull(); // 패널은 닫혀 있다
  });
});

describe("T2·T6 집기와 내려놓기", () => {
  it("파랑 마카를 누르면 파랑만 들리고 스토어의 heldTool이 바뀐다", () => {
    mount();
    fireEvent.click(marker("파랑"));
    expect(useWorkspace.getState().heldTool).toEqual({ kind: "marker", color: "blue" });
    expect(marker("파랑").getAttribute("data-lifted")).toBe("true");
    expect(marker("파랑").getAttribute("aria-pressed")).toBe("true");
    for (const name of ["검정", "빨강", "초록"]) {
      expect(marker(name).getAttribute("data-lifted")).toBe("false");
    }
  });

  it("들린 마카를 한 번 더 누르면 내려앉고 들린 도구가 없다", () => {
    mount();
    fireEvent.click(marker("파랑"));
    fireEvent.click(marker("파랑"));
    expect(useWorkspace.getState().heldTool).toBeNull();
    expect(marker("파랑").getAttribute("data-lifted")).toBe("false");
  });

  it("다른 마카를 누르면 들고 있던 마카는 내려앉고 새 마카가 들린다", () => {
    mount();
    fireEvent.click(marker("파랑"));
    fireEvent.click(marker("빨강"));
    expect(useWorkspace.getState().heldTool).toEqual({ kind: "marker", color: "red" });
    expect(marker("파랑").getAttribute("data-lifted")).toBe("false");
    expect(marker("빨강").getAttribute("data-lifted")).toBe("true");
  });

  it("천을 누르면 마카는 내려앉고 천만 들린다. 다시 누르면 내려놓는다", () => {
    mount();
    fireEvent.click(marker("초록"));
    fireEvent.click(screen.getByLabelText("천 지우개"));
    expect(useWorkspace.getState().heldTool).toEqual({ kind: "cloth" });
    expect(marker("초록").getAttribute("data-lifted")).toBe("false");
    expect(screen.getByLabelText("천 지우개").getAttribute("data-lifted")).toBe("true");

    fireEvent.click(screen.getByLabelText("천 지우개"));
    expect(useWorkspace.getState().heldTool).toBeNull();
  });

  it("스토어에서 내려놓으면(Esc 등) 트레이에서도 내려앉는다", () => {
    mount();
    fireEvent.click(marker("검정"));
    act(() => useWorkspace.getState().releaseTool());
    expect(marker("검정").getAttribute("data-lifted")).toBe("false");
  });
});

describe("T9 마카 패널", () => {
  it("오른쪽 클릭하면 그 마카를 집고 패널이 열린다 — 제목·색 4·굵기 3·지우기 안내", () => {
    mount();
    fireEvent.contextMenu(marker("파랑"));
    expect(useWorkspace.getState().heldTool).toEqual({ kind: "marker", color: "blue" });

    const panel = document.querySelector("[data-marker-panel]") as HTMLElement;
    expect(panel).toBeTruthy();
    expect(panel.textContent).toContain("마카");
    expect(panel.textContent).toContain("굵기");
    expect(panel.textContent).toContain("지우개 = 천으로 닦기 · 손바닥으로 문지르기");

    const colors = ["검정", "파랑", "빨강", "초록"].map((n) => screen.getByRole("radio", { name: n }));
    expect(colors.map((c) => c.getAttribute("aria-checked"))).toEqual(["false", "true", "false", "false"]);

    const widths = ["가늘게", "보통", "굵게"].map((n) => screen.getByRole("radio", { name: n }));
    expect(widths.map((c) => c.getAttribute("aria-checked"))).toEqual(["true", "false", "false"]);
  });

  it("패널에서 빨강을 고르면 트레이에서 빨강이 들리고 파랑은 내려앉는다", () => {
    mount();
    fireEvent.contextMenu(marker("파랑"));
    fireEvent.click(screen.getByRole("radio", { name: "빨강" }));

    expect(useWorkspace.getState().heldTool).toEqual({ kind: "marker", color: "red" });
    expect(marker("빨강").getAttribute("data-lifted")).toBe("true");
    expect(marker("파랑").getAttribute("data-lifted")).toBe("false");
    expect(screen.getByRole("radio", { name: "빨강" }).getAttribute("aria-checked")).toBe("true");
  });

  it("굵기를 고르면 다음 획부터 그 굵기다 — markerWidth가 바뀐다", () => {
    mount();
    fireEvent.contextMenu(marker("검정"));
    fireEvent.click(screen.getByRole("radio", { name: "굵게" }));
    expect(useWorkspace.getState().markerWidth).toBe("thick");
    expect(screen.getByRole("radio", { name: "굵게" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "가늘게" }).getAttribute("aria-checked")).toBe("false");
  });

  it("길게 누르면 패널이 열리고, 손을 뗄 때의 click은 내려놓기로 치지 않는다", () => {
    vi.useFakeTimers();
    mount();
    const el = marker("초록");
    fireEvent.pointerDown(el, { button: 0, pointerId: 1 });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(useWorkspace.getState().heldTool).toEqual({ kind: "marker", color: "green" });
    expect(document.querySelector("[data-marker-panel]")).toBeTruthy();

    fireEvent.pointerUp(el, { pointerId: 1 });
    fireEvent.click(el);
    expect(useWorkspace.getState().heldTool).toEqual({ kind: "marker", color: "green" });
  });

  it("짧게 누르면 패널은 열리지 않고 집기만 한다", () => {
    vi.useFakeTimers();
    mount();
    const el = marker("초록");
    fireEvent.pointerDown(el, { button: 0, pointerId: 1 });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    fireEvent.pointerUp(el, { pointerId: 1 });
    fireEvent.click(el);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(document.querySelector("[data-marker-panel]")).toBeNull();
    expect(useWorkspace.getState().heldTool).toEqual({ kind: "marker", color: "green" });
  });

  it("마카를 내려놓으면 패널도 닫힌다", () => {
    mount();
    fireEvent.contextMenu(marker("파랑"));
    expect(document.querySelector("[data-marker-panel]")).toBeTruthy();
    act(() => useWorkspace.getState().releaseTool());
    expect(document.querySelector("[data-marker-panel]")).toBeNull();
  });

  it("패널 밖을 누르면 닫히지만 마카는 계속 들려 있다", () => {
    mount();
    fireEvent.contextMenu(marker("파랑"));
    fireEvent.pointerDown(document.body);
    expect(document.querySelector("[data-marker-panel]")).toBeNull();
    expect(useWorkspace.getState().heldTool).toEqual({ kind: "marker", color: "blue" });
  });
});

describe("T14 휴대폰", () => {
  it("화면 짧은 변이 600px 미만이면 트레이가 없다", () => {
    setWindowSize(390, 844);
    mount();
    expect(screen.queryByLabelText("파랑 마카")).toBeNull();
    expect(screen.queryByLabelText("천 지우개")).toBeNull();
  });

  it("iPad mini 세로(744px)는 태블릿이라 트레이가 있다", () => {
    setWindowSize(744, 1133);
    mount();
    expect(screen.getByLabelText("파랑 마카")).toBeTruthy();
  });

  it("들고 있다가 휴대폰 크기로 줄면 내려놓고 트레이도 사라진다", () => {
    mount();
    fireEvent.click(marker("파랑"));
    expect(useWorkspace.getState().heldTool).not.toBeNull();

    act(() => {
      setWindowSize(390, 844);
      window.dispatchEvent(new Event("resize"));
    });
    expect(useWorkspace.getState().heldTool).toBeNull();
    expect(screen.queryByLabelText("파랑 마카")).toBeNull();
  });
});
