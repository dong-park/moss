import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import { useWorkspace } from "@/state/workspace";
import { MarkerTray } from "@/components/workspace/MarkerTray";

/**
 * 마카는 독 버튼 하나다. 색·굵기·천은 그 메뉴 안에만 있다.
 */

function mount() {
  return render(
    <I18nProvider locale="ko">
      <MarkerTray />
    </I18nProvider>,
  );
}

function openMenu() {
  fireEvent.click(screen.getByRole("button", { name: "마카" }));
}

beforeEach(() => {
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
  useWorkspace.setState({ heldTool: null });
});

describe("마카 버튼 하나", () => {
  it("독에는 마카 버튼만 있고 색과 천은 메뉴를 열기 전에는 없다", () => {
    mount();
    expect(screen.getByRole("button", { name: "마카" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByRole("radio", { name: "파랑" })).toBeNull();
    expect(screen.queryByRole("button", { name: "천 지우개" })).toBeNull();
    expect(useWorkspace.getState().heldTool).toBeNull();
  });

  it("버튼을 누르면 색 4개, 굵기 3개, 천이 한 메뉴에 있다", () => {
    mount();
    openMenu();
    expect(screen.getAllByRole("radio", { name: /검정|파랑|빨강|초록/ })).toHaveLength(4);
    expect(screen.getAllByRole("radio", { name: /가늘게|보통|굵게/ })).toHaveLength(3);
    expect(screen.getByRole("button", { name: "천 지우개" })).toBeTruthy();
  });

  it("색을 고르면 그 마카를 집고, 같은 색을 다시 고르면 내려놓는다", () => {
    mount();
    openMenu();
    fireEvent.click(screen.getByRole("radio", { name: "파랑" }));
    expect(useWorkspace.getState().heldTool).toEqual({ kind: "marker", color: "blue" });
    expect(screen.getByRole("button", { name: "마카" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("radio", { name: "파랑" }));
    expect(useWorkspace.getState().heldTool).toBeNull();
  });

  it("다른 색을 고르면 들고 있던 마카가 바뀐다", () => {
    mount();
    openMenu();
    fireEvent.click(screen.getByRole("radio", { name: "파랑" }));
    fireEvent.click(screen.getByRole("radio", { name: "빨강" }));
    expect(useWorkspace.getState().heldTool).toEqual({ kind: "marker", color: "red" });
  });

  it("천을 고르면 마카를 내려놓고 천만 집는다. 다시 고르면 내려놓는다", () => {
    mount();
    openMenu();
    fireEvent.click(screen.getByRole("radio", { name: "초록" }));
    fireEvent.click(screen.getByRole("button", { name: "천 지우개" }));
    expect(useWorkspace.getState().heldTool).toEqual({ kind: "cloth" });
    expect(screen.getByRole("button", { name: "천 지우개" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "천 지우개" }));
    expect(useWorkspace.getState().heldTool).toBeNull();
  });

  it("굵기를 고르면 markerWidth가 바뀌고 집은 마카는 유지된다", () => {
    mount();
    openMenu();
    fireEvent.click(screen.getByRole("radio", { name: "검정" }));
    fireEvent.click(screen.getByRole("radio", { name: "굵게" }));
    expect(useWorkspace.getState().markerWidth).toBe("thick");
    expect(useWorkspace.getState().heldTool).toEqual({ kind: "marker", color: "black" });
  });

  it("메뉴 밖을 누르면 메뉴만 닫히고 마카는 들려 있다", () => {
    mount();
    openMenu();
    fireEvent.click(screen.getByRole("radio", { name: "파랑" }));
    fireEvent.pointerDown(document.body);
    expect(document.querySelector("[data-marker-panel]")).toBeNull();
    expect(useWorkspace.getState().heldTool).toEqual({ kind: "marker", color: "blue" });
  });

  it("버튼을 다시 누르면 메뉴가 닫힌다", () => {
    mount();
    openMenu();
    expect(document.querySelector("[data-marker-panel]")).toBeTruthy();
    openMenu();
    expect(document.querySelector("[data-marker-panel]")).toBeNull();
  });
});
