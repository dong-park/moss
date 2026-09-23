import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import { TrashPanel } from "@/components/workspace/TrashPanel";
import { useWorkspace, SYSTEM_BOARD_ID } from "@/state/workspace";
import { useStorage } from "@/state/storage";
import { resetDB } from "@/state/db/schema";

let originalStorage: PropertyDescriptor | undefined;

beforeEach(async () => {
  originalStorage = Object.getOwnPropertyDescriptor(navigator, "storage");
  Object.defineProperty(navigator, "storage", {
    value: {
      persist: vi.fn(async () => true),
      persisted: vi.fn(async () => false),
      estimate: vi.fn(async () => ({ usage: 0, quota: 1000 })),
      getDirectory: vi.fn(async () => ({
        getDirectoryHandle: vi.fn(async () => ({ removeEntry: vi.fn(async () => {}) })),
        removeEntry: vi.fn(async () => {}),
      })),
    },
    configurable: true,
    writable: true,
  });
  await useStorage.getState().init();
  useWorkspace.setState({
    cards: [],
    currentBoardId: SYSTEM_BOARD_ID,
    trashOpen: true,
    trashCount: 0,
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await resetDB();
  useStorage.setState({ initialized: false, settings: null, quota: null });
  useWorkspace.setState({ trashOpen: false, trashCount: 0 });
  if (originalStorage) {
    Object.defineProperty(navigator, "storage", originalStorage);
  }
});

function renderPanel() {
  return render(
    <I18nProvider locale="ko">
      <TrashPanel />
    </I18nProvider>,
  );
}

describe("FEAT-trash · TrashPanel", () => {
  it("비어 있으면 안내 문구를 보여준다 (AC-4)", async () => {
    renderPanel();
    expect(await screen.findByText("휴지통이 비어 있어요")).toBeTruthy();
  });

  it("지운 메모를 최신순으로 보여주고 제목·보드 이름을 표시한다 (AC-4)", async () => {
    await useStorage.getState().saveBoard({ id: "b1", name: "보드 B" });
    await useStorage.getState().saveNote({
      id: "n1",
      boardId: "b1",
      content: "본문",
      title: "제목입니다",
    });
    await useStorage.getState().trashNote("n1");

    renderPanel();

    expect(await screen.findByText("제목입니다")).toBeTruthy();
    expect(screen.getByText(/보드 B/)).toBeTruthy();
  });

  it("복구를 누르면 목록에서 사라지고 메모가 돌아온다 (AC-5)", async () => {
    await useStorage.getState().saveNote({ id: "n1", content: "복구할 메모" });
    await useStorage.getState().trashNote("n1");

    renderPanel();
    const restoreBtn = await screen.findByLabelText("복구");
    fireEvent.click(restoreBtn);

    await waitFor(() =>
      expect(screen.getByText("휴지통이 비어 있어요")).toBeTruthy(),
    );
    expect(
      (await useStorage.getState().loadCards(null)).map((n) => n.id),
    ).toEqual(["n1"]);
  });

  it("개별 영구 삭제는 확인 없이 행을 지운다 (AC-9)", async () => {
    await useStorage.getState().saveNote({ id: "n1", content: "버릴 메모" });
    await useStorage.getState().trashNote("n1");
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    renderPanel();
    fireEvent.click(await screen.findByLabelText("영구 삭제"));

    await waitFor(() =>
      expect(screen.getByText("휴지통이 비어 있어요")).toBeTruthy(),
    );
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(await useStorage.getState().listTrash()).toHaveLength(0);
  });

  it("비우기는 confirm 후 전체를 지우고, 취소하면 아무 일도 없다 (AC-10)", async () => {
    await useStorage.getState().saveNote({ id: "n1", content: "a" });
    await useStorage.getState().saveNote({ id: "n2", content: "b" });
    await useStorage.getState().trashNote("n1");
    await useStorage.getState().trashNote("n2");
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    renderPanel();
    await screen.findByText("a"); // 목록 로드 완료 대기
    fireEvent.click(screen.getByText("비우기"));
    expect(confirmSpy).toHaveBeenCalledWith("메모 2개를 영구 삭제할까요?");
    expect(await useStorage.getState().listTrash()).toHaveLength(2);

    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByText("비우기"));
    await waitFor(() =>
      expect(screen.getByText("휴지통이 비어 있어요")).toBeTruthy(),
    );
    expect(await useStorage.getState().listTrash()).toHaveLength(0);
  });

  it("Esc를 누르면 닫힌다 (AC-4)", async () => {
    renderPanel();
    await screen.findByText("휴지통이 비어 있어요");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(useWorkspace.getState().trashOpen).toBe(false);
  });

  it("열린 채 trashCount가 바뀌면 목록을 다시 조회한다 (FEAT-trash-drag)", async () => {
    const listSpy = vi.spyOn(useStorage.getState(), "listTrash");
    renderPanel();
    await screen.findByText("휴지통이 비어 있어요");
    const before = listSpy.mock.calls.length;

    // 드롭으로 새 메모가 휴지통에 들어온 상황 — 삭제 뒤 refreshTrashCount가 돈다.
    await useStorage.getState().saveNote({ id: "n9", content: "드롭한 메모" });
    await useStorage.getState().trashNote("n9");
    await act(async () => {
      await useWorkspace.getState().refreshTrashCount();
    });

    await waitFor(() =>
      expect(listSpy.mock.calls.length).toBeGreaterThan(before),
    );
    expect(await screen.findByText("드롭한 메모")).toBeTruthy();
  });
});
