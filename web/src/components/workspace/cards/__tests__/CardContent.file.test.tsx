import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { renderCard } from "./setupCard";

/* ─────────────────────────────────────────────────────────────
 * P2-B · file 카드 키보드 UX (SIDEBAR-CARDS-UX.md §6).
 *
 * attachmentRef를 미리 부여해 editing 진입 시 자동 파일 피커 effect를 우회한다.
 * (effect는 dialogOpenedFor Set에 카드 id를 누적해 테스트 순서에 영향을 줄 수 있음.)
 * ───────────────────────────────────────────────────────────── */

function fileNameInput() {
  return screen.getByPlaceholderText("파일 이름") as HTMLInputElement;
}

describe("FileCardContent · 키보드 UX", () => {
  let clickSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // input.click()을 spy로 캡처 (jsdom에서는 기본 no-op).
    clickSpy = vi
      .spyOn(HTMLInputElement.prototype, "click")
      .mockImplementation(() => {});
  });

  afterEach(() => {
    clickSpy.mockRestore();
  });

  it("render — cards/v2/file.png 표면 + 파일명 표시", () => {
    renderCard("file", {
      content: "report.pdf",
      editing: false,
      card: { attachmentRef: "stub" },
    });

    // 파일명이 표시된다 (editing=false → div).
    expect(screen.getByText("report.pdf")).toBeTruthy();

    // 카드 표면 background가 file.png를 가리킨다.
    const surface = document.querySelector(
      '[style*="cards/v2/file.png"]',
    ) as HTMLElement | null;
    expect(surface).not.toBeNull();
  });

  it("파일명 편집 → onChange 호출 (content 페이로드)", () => {
    const { onChange } = renderCard("file", {
      content: "",
      editing: true,
      card: { attachmentRef: "stub" },
    });

    fireEvent.change(fileNameInput(), { target: { value: "notes.md" } });

    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls.at(-1)?.[0]).toBe("notes.md");
  });

  it("Enter → 파일명 commit (onCommitEdit 호출)", () => {
    const { onCommit } = renderCard("file", {
      content: "draft.txt",
      editing: true,
      card: { attachmentRef: "stub" },
    });

    fireEvent.keyDown(fileNameInput(), { key: "Enter" });

    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("Space — 파일 아이콘 포커스에서 파일 피커 열기", () => {
    renderCard("file", {
      content: "draft.txt",
      editing: true,
      card: { attachmentRef: "stub" },
    });

    const pickerBtn = screen.getByRole("button", { name: "파일 이름" });
    act(() => pickerBtn.focus());

    // beforeEach가 spy를 깔아두었으므로, 이후 호출만 보려고 카운트 리셋.
    clickSpy.mockClear();
    fireEvent.keyDown(pickerBtn, { key: " ", code: "Space" });

    // input.click()이 정확히 1회 호출됨 (Space의 기본 스크롤은 막힘).
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("Esc → commit (onCommitEdit 호출)", () => {
    const { onCommit } = renderCard("file", {
      content: "draft.txt",
      editing: true,
      card: { attachmentRef: "stub" },
    });

    fireEvent.keyDown(fileNameInput(), { key: "Escape" });

    expect(onCommit).toHaveBeenCalledTimes(1);
  });
});
