import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import { BoardPicker } from "@/components/workspace/BoardPicker";
import { SYSTEM_BOARD_ID, useWorkspace } from "@/state/workspace";
import { useStorage } from "@/state/storage";
import { getDB, resetDB } from "@/state/db/schema";
import { runBootstrap } from "@/components/notifications/StorageBootstrap";

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
    templatePickerOpen: false,
    pendingBoardUndo: null,
    deleteDialogBoardId: null,
    pendingRenameBoardId: null,
    viewport: { x: 0, y: 0, scale: 1 },
  });
  if (originalStorage) {
    Object.defineProperty(navigator, "storage", originalStorage);
  }
});

function mount() {
  return render(
    <I18nProvider locale="ko">
      <BoardPicker />
    </I18nProvider>,
  );
}

describe("FEAT-boards · BoardPicker", () => {
  it("기본: 첫 실행 부팅 뒤 트리거에 '내 벽'이 노출되고 시스템 표시는 없다", async () => {
    await useStorage.getState().init();
    await runBootstrap();
    mount();

    expect(screen.getByLabelText("프로젝트 선택").textContent).toContain("내 벽");
    expect(screen.queryByText("(시스템 프로젝트)")).toBeNull();
  });

  it("시스템 벽 이름을 '이직 고민'으로 바꾸면 트리거·메뉴에 나오고 재로드 뒤에도 같다", async () => {
    await useStorage.getState().init();
    await runBootstrap();
    mount();

    fireEvent.doubleClick(screen.getByLabelText("프로젝트 선택"));
    const input = screen.getByLabelText("프로젝트 이름 변경") as HTMLInputElement;
    // 저장된 이름이 비어 있으므로 입력칸도 비어 시작한다 — 지울 글자가 없다.
    expect(input.value).toBe("");
    fireEvent.change(input, { target: { value: "이직 고민" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await new Promise((r) => setTimeout(r, 50));

    expect(screen.getByLabelText("프로젝트 선택").textContent).toContain("이직 고민");
    expect(screen.queryByText("내 벽")).toBeNull();
    expect((await getDB().boards.get(SYSTEM_BOARD_ID))?.name).toBe("이직 고민");

    // 메뉴를 열어도 같은 이름이고, 시스템 행이 한 번 더 목록에 끼지 않는다.
    const trigger = screen.getByLabelText("프로젝트 선택");
    fireEvent.pointerDown(trigger, { button: 0, pointerType: "mouse" });
    fireEvent.click(trigger);
    expect(screen.getAllByText("이직 고민")).toHaveLength(2); // 트리거 + 메뉴 첫 항목

    // 새로고침 흉내
    useWorkspace.setState({ boards: [] });
    await useWorkspace.getState().loadFromStorage();
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.getAllByText("이직 고민").length).toBeGreaterThan(0);
  });

  it("이름을 비우고 저장하면 다시 '내 벽'으로 돌아온다", async () => {
    await useStorage.getState().init();
    await runBootstrap();
    await useWorkspace.getState().renameBoard(SYSTEM_BOARD_ID, "임시");
    mount();
    expect(screen.getByLabelText("프로젝트 선택").textContent).toContain("임시");

    fireEvent.doubleClick(screen.getByLabelText("프로젝트 선택"));
    const input = screen.getByLabelText("프로젝트 이름 변경") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    await new Promise((r) => setTimeout(r, 50));

    expect(screen.getByLabelText("프로젝트 선택").textContent).toContain("내 벽");
  });

  it("시스템 벽은 이름을 바꿔도 삭제할 수 없다", async () => {
    await useStorage.getState().init();
    await runBootstrap();
    await useWorkspace.getState().renameBoard(SYSTEM_BOARD_ID, "이직 고민");
    await expect(
      useWorkspace.getState().removeBoard(SYSTEM_BOARD_ID),
    ).rejects.toThrow();
    expect(await getDB().boards.get(SYSTEM_BOARD_ID)).toBeDefined();
  });

  it("사용자 보드 있을 때: 트리거에 보드 이름 표시, 빈 이름이면 placeholder", async () => {
    await useStorage.getState().init();
    const id = await useWorkspace.getState().createBoard("");
    await new Promise((r) => setTimeout(r, 250));
    mount();

    // 빈 이름 → placeholder
    expect(screen.getByText("(이름 없는 프로젝트)")).toBeTruthy();

    // 이름 추가 후 다시 mount → 그 이름 표시
    await useWorkspace.getState().renameBoard(id, "Brand");
    mount();
    expect(screen.getAllByText("Brand").length).toBeGreaterThan(0);
  });

  it("트리거 클릭 → 드롭다운 열림 + 시스템 보드 첫 항목 + 새 보드 옵션", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().createBoard("alpha");
    await new Promise((r) => setTimeout(r, 250));
    mount();

    // 사용자 보드 alpha가 현재 보드이므로 트리거에 "alpha" 표시
    const trigger = screen.getByLabelText("프로젝트 선택");
    fireEvent.pointerDown(trigger, { button: 0, pointerType: "mouse" });
    fireEvent.click(trigger);

    // Radix Portal로 메뉴가 렌더된 뒤 항목들이 노출돼야 함
    // "내 벽"이 메뉴 첫 항목으로 등장 — 시스템 배지는 더 이상 없다
    const stays = screen.getAllByText("내 벽");
    expect(stays.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("새 프로젝트 만들기")).toBeTruthy();
    expect(screen.queryByText("시스템")).toBeNull();
  });

  it("새 보드 만들기 클릭 → TemplatePicker 열림, 템플릿 선택 시 보드 생성 (FEAT-templates 통합)", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();
    mount();

    const trigger = screen.getByLabelText("프로젝트 선택");
    fireEvent.pointerDown(trigger, { button: 0, pointerType: "mouse" });
    fireEvent.click(trigger);

    const before = useWorkspace.getState().boards.length;
    const item = screen.getByText("새 프로젝트 만들기");
    fireEvent.click(item);

    // picker 다이얼로그 등장
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.getByText("자유 캔버스")).toBeTruthy();

    // free 카드 클릭 → 보드 생성
    const freeCard = screen.getByText("자유 캔버스").closest("button")!;
    fireEvent.click(freeCard);

    await new Promise((r) => setTimeout(r, 250));
    expect(useWorkspace.getState().boards.length).toBe(before + 1);
    const created = useWorkspace.getState().boards[0];
    expect(created.templateId).toBe("free");
  });

  it("트리거 더블클릭 → 시스템 벽에서도 인플레이스 편집 진입", async () => {
    await useStorage.getState().init();
    await runBootstrap();
    mount();
    fireEvent.doubleClick(screen.getByLabelText("프로젝트 선택"));
    expect(screen.getByLabelText("프로젝트 이름 변경")).toBeTruthy();
  });

  it("사용자 보드에서 더블클릭 → input 노출, Enter로 저장", async () => {
    await useStorage.getState().init();
    const id = await useWorkspace.getState().createBoard("draft");
    await new Promise((r) => setTimeout(r, 250));
    mount();

    fireEvent.doubleClick(screen.getByLabelText("프로젝트 선택"));
    const input = screen.getByLabelText("프로젝트 이름 변경") as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.value).toBe("draft");

    fireEvent.change(input, { target: { value: "final" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await new Promise((r) => setTimeout(r, 50));
    expect(useWorkspace.getState().boards.find((b) => b.id === id)?.name).toBe(
      "final",
    );
  });

  it("input Escape → 편집 취소 (이름 변경 안 됨)", async () => {
    await useStorage.getState().init();
    const id = await useWorkspace.getState().createBoard("draft");
    await new Promise((r) => setTimeout(r, 250));
    mount();

    fireEvent.doubleClick(screen.getByLabelText("프로젝트 선택"));
    const input = screen.getByLabelText("프로젝트 이름 변경") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "should-not-save" } });
    fireEvent.keyDown(input, { key: "Escape" });

    await new Promise((r) => setTimeout(r, 50));
    expect(useWorkspace.getState().boards.find((b) => b.id === id)?.name).toBe(
      "draft",
    );
  });

  it("requestRenameBoard 신호 → 트리거 인플레이스 편집 자동 진입", async () => {
    await useStorage.getState().init();
    const id = await useWorkspace.getState().createBoard("foo");
    await new Promise((r) => setTimeout(r, 250));
    mount();

    // 컨텍스트 메뉴 "이름 변경" 클릭 시뮬레이션 (store 액션 직접 호출)
    await useWorkspace.getState().requestRenameBoard(id);
    await new Promise((r) => setTimeout(r, 250));

    expect(screen.getByLabelText("프로젝트 이름 변경")).toBeTruthy();
    expect(useWorkspace.getState().pendingRenameBoardId).toBeNull();
  });

  it("삭제 다이얼로그 confirm → removeBoardWithUndo + pendingBoardUndo set + undo로 복원", async () => {
    await useStorage.getState().init();
    const id = await useWorkspace.getState().createBoard("target");
    await new Promise((r) => setTimeout(r, 250));

    // 보드에 메모 1개 추가 (복원 검증용)
    const cardId = useWorkspace.getState().addCardAt("text", 0, 0);
    await new Promise((r) => setTimeout(r, 30));

    mount();

    // 1) 다이얼로그 오픈
    useWorkspace.getState().openDeleteDialog(id);
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.getByText("이 프로젝트를 삭제할까요?")).toBeTruthy();

    // 2) "삭제" 클릭
    const confirm = document.querySelector<HTMLButtonElement>(
      "[data-board-delete-confirm]",
    )!;
    fireEvent.click(confirm);
    await new Promise((r) => setTimeout(r, 250));

    // 보드는 삭제됨, undo 가능
    expect(useWorkspace.getState().boards.find((b) => b.id === id)).toBeUndefined();
    expect(useWorkspace.getState().pendingBoardUndo?.board.id).toBe(id);
    expect(useWorkspace.getState().pendingBoardUndo?.affectedNoteIds).toContain(
      cardId,
    );
    // 메모는 boardId=null로 이관됨
    expect(useWorkspace.getState().currentBoardId).toBe(SYSTEM_BOARD_ID);

    // 3) Undo 클릭
    const undoBtn = document.querySelector<HTMLButtonElement>(
      "[data-board-undo-button]",
    )!;
    fireEvent.click(undoBtn);
    await new Promise((r) => setTimeout(r, 100));

    const restored = useWorkspace.getState().boards.find((b) => b.id === id);
    expect(restored).toBeDefined();
    expect(restored?.name).toBe("target");
  });
});
