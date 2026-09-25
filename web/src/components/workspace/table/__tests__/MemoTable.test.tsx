import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import { MemoTable } from "@/components/workspace/table/MemoTable";
import { ViewToggle } from "@/components/workspace/table/ViewToggle";
import { __resetMemoTableForTest, useMemoTable } from "@/state/memoTable";
import { useWorkspace, SYSTEM_BOARD_ID } from "@/state/workspace";
import { useStorage } from "@/state/storage";
import { getDB, resetDB } from "@/state/db/schema";

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
  __resetMemoTableForTest();
});

afterEach(async () => {
  __resetMemoTableForTest();
  await resetDB();
  useStorage.setState({ initialized: false, settings: null, quota: null });
  useWorkspace.setState({
    cards: [],
    selectedIds: [],
    currentBoardId: SYSTEM_BOARD_ID,
    view: "canvas",
  });
  if (originalStorage) {
    Object.defineProperty(navigator, "storage", originalStorage);
  }
});

function renderTable() {
  return render(
    <I18nProvider locale="ko">
      <MemoTable />
    </I18nProvider>,
  );
}

describe("MemoTable — 표 렌더·검색·인라인 편집", () => {
  it("행을 그리고 검색은 매칭만 남긴다(AC-3)", async () => {
    await useStorage.getState().init();
    const s = useStorage.getState();
    await s.saveNote({ id: "n1", boardId: null, content: "회고 노트", title: "A" });
    await s.saveNote({ id: "n2", boardId: null, content: "다른 내용", title: "B" });

    renderTable();

    await waitFor(() => {
      expect(screen.getAllByTestId("memo-table-row")).toHaveLength(2);
    });

    fireEvent.change(
      screen.getByPlaceholderText("제목·본문 검색"),
      { target: { value: "회고" } },
    );

    await waitFor(() => {
      expect(screen.getAllByTestId("memo-table-row")).toHaveLength(1);
    });
    // AC-3: 일치 부분이 미리보기에서 강조된다(mark).
    expect(screen.getByText("회고", { selector: "mark" })).toBeTruthy();
  });

  it("제목 셀을 클릭해 고치면 정규화되어 영속된다(AC-5)", async () => {
    await useStorage.getState().init();
    await useStorage.getState().saveNote({
      id: "n1",
      boardId: null,
      content: "본문",
      title: "옛 제목",
    });

    renderTable();
    await waitFor(() => {
      expect(screen.getAllByTestId("memo-table-row")).toHaveLength(1);
    });

    fireEvent.click(screen.getByText("옛 제목"));
    const input = await screen.findByLabelText("메모 제목");
    fireEvent.change(input, { target: { value: "  새 제목  " } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(async () => {
      expect((await getDB().notes.get("n1"))?.title).toBe("새 제목");
    });
  });

  it("행이 없으면 검색어 유무에 따라 빈 상태가 다르다", async () => {
    await useStorage.getState().init();
    renderTable();
    await waitFor(() => {
      expect(screen.getByText("이 필터에 맞는 메모가 없어요")).toBeTruthy();
    });
    fireEvent.change(screen.getByPlaceholderText("제목·본문 검색"), {
      target: { value: "없는말" },
    });
    await waitFor(() => {
      expect(screen.getByText("검색 결과가 없어요")).toBeTruthy();
    });
  });

  it("P2-2: 필터·검색으로 숨겨진 행은 선택에서 빠진다", async () => {
    await useStorage.getState().init();
    const s = useStorage.getState();
    await s.saveNote({ id: "n1", boardId: null, content: "회고 노트", title: "A" });
    await s.saveNote({ id: "n2", boardId: null, content: "다른 내용", title: "B" });

    renderTable();
    await waitFor(() => {
      expect(screen.getAllByTestId("memo-table-row")).toHaveLength(2);
    });

    fireEvent.click(screen.getByLabelText("A"));
    fireEvent.click(screen.getByLabelText("B"));
    expect(useMemoTable.getState().selectedIds.size).toBe(2);

    fireEvent.change(screen.getByPlaceholderText("제목·본문 검색"), {
      target: { value: "회고" },
    });
    await waitFor(() => {
      expect(screen.getAllByTestId("memo-table-row")).toHaveLength(1);
    });
    await waitFor(() => {
      expect(useMemoTable.getState().selectedIds.size).toBe(1);
    });
    expect(useMemoTable.getState().selectedIds.has("n1")).toBe(true);
  });

  it("P2-3: 방향키로 포커스를 옮기면 스크롤을 맞춘다", async () => {
    await useStorage.getState().init();
    await useStorage.getState().saveNote({ id: "n1", boardId: null, content: "A" });
    renderTable();
    await waitFor(() => {
      expect(screen.getAllByTestId("memo-table-row")).toHaveLength(1);
    });

    const grid = screen.getByRole("grid");
    fireEvent.keyDown(grid, { key: "ArrowDown" });
    // jsdom은 clientHeight 0 — 다음 행이 보이도록 scrollTop이 전진한다.
    expect(grid.scrollTop).toBeGreaterThan(0);
  });

  it("P1-4: 메모창을 닫으면 같은 탭 변경이 표에 반영된다", async () => {
    await useStorage.getState().init();
    await useStorage
      .getState()
      .saveNote({ id: "n1", boardId: null, content: "본문", title: "원래" });

    renderTable();
    await waitFor(() => {
      expect(screen.getAllByTestId("memo-table-row")).toHaveLength(1);
    });

    // 메모창을 연다(행 클릭과 동일한 스토어 경로).
    act(() => useWorkspace.getState().setExpandedCard("n1"));
    // 같은 탭에서 캔버스·메모창 쪽 제목을 바꿔 DB에 반영.
    await useStorage.getState().updateNoteTitle("n1", "바뀜");
    expect(
      useMemoTable.getState().notes.find((n) => n.id === "n1")?.title,
    ).toBe("원래");

    // 메모창을 닫으면 재조회되어 새 값이 보인다.
    act(() => useWorkspace.getState().setExpandedCard(null));
    await waitFor(() => {
      expect(
        useMemoTable.getState().notes.find((n) => n.id === "n1")?.title,
      ).toBe("바뀜");
    });
  });
});

describe("ViewToggle — 캔버스 ↔ 표(AC-1)", () => {
  it("'표'를 누르면 view가 table로 바뀐다", () => {
    render(
      <I18nProvider locale="ko">
        <ViewToggle />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole("tab", { name: "표" }));
    expect(useWorkspace.getState().view).toBe("table");
    fireEvent.click(screen.getByRole("tab", { name: "캔버스" }));
    expect(useWorkspace.getState().view).toBe("canvas");
  });
});
