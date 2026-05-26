import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { I18nProvider } from "@/i18n/Provider";
import { TemplatePicker } from "@/components/workspace/TemplatePicker";
import { SYSTEM_BOARD_ID, useWorkspace } from "@/state/workspace";
import { useStorage } from "@/state/storage";
import { resetDB } from "@/state/db/schema";

let originalStorage: PropertyDescriptor | undefined;

beforeEach(() => {
  originalStorage = Object.getOwnPropertyDescriptor(navigator, "storage");
  Object.defineProperty(navigator, "storage", {
    value: {
      persist: vi.fn(async () => true),
      persisted: vi.fn(async () => false),
      estimate: vi.fn(async () => ({ usage: 0, quota: 1000 })),
      getDirectory: vi.fn(),
    },
    configurable: true,
    writable: true,
  });
});

afterEach(async () => {
  await resetDB();
  useStorage.setState({ initialized: false, settings: null, quota: null });
  useWorkspace.setState({
    cards: [],
    selectedIds: [],
    editingId: null,
    pendingAIGate: null,
    boards: [],
    currentBoardId: SYSTEM_BOARD_ID,
    lastNonSystemBoardId: null,
    viewportByBoard: {},
    boardTransitioning: false,
    viewport: { x: 0, y: 0, scale: 1 },
  });
  if (originalStorage) {
    Object.defineProperty(navigator, "storage", originalStorage);
  }
});

function Harness({ initialOpen = true }: { initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <I18nProvider locale="ko">
      <TemplatePicker open={open} onOpenChange={setOpen} />
    </I18nProvider>
  );
}

describe("FEAT-templates · TemplatePicker", () => {
  it("열리면 5개 템플릿 모두 노출 (AC-3 카피 톤도 포함)", async () => {
    await useStorage.getState().init();
    render(<Harness />);

    expect(screen.getByText("자유 캔버스")).toBeTruthy();
    expect(screen.getByText("마인드 확장")).toBeTruthy();
    expect(screen.getByText("프로젝트 보드")).toBeTruthy();
    expect(screen.getByText("리서치 보드")).toBeTruthy();
    expect(screen.getByText("일기 보드")).toBeTruthy();

    // AC-3 카피 톤
    expect(
      screen.getByText("정답을 제공하지 않습니다. 당신만의 흐름을 만듭니다."),
    ).toBeTruthy();
  });

  it("mindmap 카드 클릭 → createBoardFromTemplate 호출 + 새 보드 + 카드 자동 배치 (AC-1)", async () => {
    await useStorage.getState().init();
    render(<Harness />);

    const card = screen.getByText("마인드 확장").closest("button")!;
    fireEvent.click(card);

    await new Promise((r) => setTimeout(r, 250));

    const state = useWorkspace.getState();
    expect(state.boards).toHaveLength(1);
    expect(state.boards[0].templateId).toBe("mindmap");
    expect(state.currentBoardId).toBe(state.boards[0].id);
    expect(state.cards.length).toBeGreaterThan(0);
    expect(state.cards[0].kind).toBe("mindmap");
  });

  it("닫기 버튼 → 보드 생성 안 함 (AC-2)", async () => {
    await useStorage.getState().init();
    render(<Harness />);

    const before = useWorkspace.getState().boards.length;
    fireEvent.click(screen.getByText("닫기"));
    await new Promise((r) => setTimeout(r, 50));
    expect(useWorkspace.getState().boards.length).toBe(before);
  });

  it("ESC 누르면 닫힘 + 보드 생성 안 함 (AC-2)", async () => {
    await useStorage.getState().init();
    render(<Harness />);
    const before = useWorkspace.getState().boards.length;

    // Radix Dialog는 document keydown으로 ESC 처리
    fireEvent.keyDown(document.body, { key: "Escape" });
    await new Promise((r) => setTimeout(r, 50));

    expect(useWorkspace.getState().boards.length).toBe(before);
  });

  it("open=false면 다이얼로그 콘텐츠 렌더 안 됨", async () => {
    render(<Harness initialOpen={false} />);
    expect(screen.queryByText("자유 캔버스")).toBeNull();
  });
});
