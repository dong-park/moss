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
    const restoreBtn = await screen.findByLabelText("복구: 복구할 메모");
    fireEvent.click(restoreBtn);

    await waitFor(() =>
      expect(screen.getByText("휴지통이 비어 있어요")).toBeTruthy(),
    );
    expect(
      (await useStorage.getState().loadCards(null)).map((n) => n.id),
    ).toEqual(["n1"]);
  });

  it("개별 영구 삭제는 이름과 개수를 확인하고 취소하면 보존한다", async () => {
    await useStorage.getState().saveNote({ id: "n1", content: "버릴 메모" });
    await useStorage.getState().trashNote("n1");
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderPanel();
    const button = await screen.findByLabelText("영구 삭제: 버릴 메모");
    fireEvent.click(button);
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringMatching(/버릴 메모.*1개/));
    expect(await useStorage.getState().listTrash()).toHaveLength(1);
    confirmSpy.mockReturnValue(true);
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByText("휴지통이 비어 있어요")).toBeTruthy());
    expect(await useStorage.getState().listTrash()).toHaveLength(0);
  });

  it("영구 삭제 실패를 표시하고 행을 유지하며 재시도할 수 있다", async () => {
    await useStorage.getState().saveNote({ id: "n1", content: "보존할 메모" });
    await useStorage.getState().trashNote("n1");
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const purge = vi.spyOn(useStorage.getState(), "purgeTrash").mockRejectedValueOnce(new Error("disk failure"));
    renderPanel();
    fireEvent.click(await screen.findByLabelText("영구 삭제: 보존할 메모"));
    expect((await screen.findByRole("alert")).textContent).toContain("다시 시도");
    expect(await useStorage.getState().listTrash()).toHaveLength(1);
    fireEvent.click(screen.getByLabelText("영구 삭제: 보존할 메모"));
    await waitFor(() => expect(screen.getByText("휴지통이 비어 있어요")).toBeTruthy());
    expect(purge).toHaveBeenCalledTimes(2);
  });

  it("복구 실패는 성공으로 표시하지 않고 대상과 재시도 안내를 남긴다", async () => {
    await useStorage.getState().saveNote({ id: "n1", content: "복구 대상" });
    await useStorage.getState().trashNote("n1");
    const restore = vi.spyOn(useWorkspace.getState(), "restoreFromTrash").mockRejectedValueOnce(new Error("disk failure"));
    renderPanel();
    fireEvent.click(await screen.findByLabelText("복구: 복구 대상"));
    expect((await screen.findByRole("alert")).textContent).toContain("복구");
    expect(await useStorage.getState().listTrash()).toHaveLength(1);
    fireEvent.click(screen.getByLabelText("복구: 복구 대상"));
    await waitFor(() => expect(screen.getByText("휴지통이 비어 있어요")).toBeTruthy());
    expect(restore).toHaveBeenCalledTimes(2);
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
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringMatching(/2개[\s\S]*a[\s\S]*b|2개[\s\S]*b[\s\S]*a/));
    expect(await useStorage.getState().listTrash()).toHaveLength(2);

    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByText("비우기"));
    await waitFor(() =>
      expect(screen.getByText("휴지통이 비어 있어요")).toBeTruthy(),
    );
    expect(await useStorage.getState().listTrash()).toHaveLength(0);
  });

  it("비우기 확인 뒤 새로 들어온 메모는 삭제하지 않는다", async () => {
    await useStorage.getState().saveNote({ id: "old", content: "확인 대상" });
    await useStorage.getState().trashNote("old");
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const original = useStorage.getState().purgeTrash;
    vi.spyOn(useStorage.getState(), "purgeTrash").mockImplementationOnce(async (ids) => {
      await useStorage.getState().saveNote({ id: "new", content: "새 대상" });
      await useStorage.getState().trashNote("new");
      await original(ids);
    });
    renderPanel();
    await screen.findByText("확인 대상");
    fireEvent.click(screen.getByText("비우기"));
    expect(await screen.findByText("새 대상")).toBeTruthy();
    expect((await useStorage.getState().listTrash()).map(e => e.id)).toEqual(["new"]);
  });

  it("목록 오류는 빈 휴지통으로 위장하지 않고 다시 불러오기로 복구한다", async () => {
    vi.spyOn(useStorage.getState(), "listTrash").mockRejectedValueOnce(new Error("offline"));
    renderPanel();
    expect((await screen.findByRole("alert")).textContent).toContain("불러오지 못했어요");
    expect(screen.queryByText("휴지통이 비어 있어요")).toBeNull();
    fireEvent.click(screen.getByText("목록 다시 불러오기"));
    expect(await screen.findByText("휴지통이 비어 있어요")).toBeTruthy();
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
