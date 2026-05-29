import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __internal,
  SYSTEM_BOARD_ID,
  useWorkspace,
  type Card,
} from "@/state/workspace";
import { useStorage } from "@/state/storage";
import { getDB, resetDB, type Board } from "@/state/db/schema";

const { decodeNoteToCard, encodeCardContent, isDescendantBoard } = __internal;

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
  vi.useRealTimers();
  await resetDB();
  useStorage.setState({ initialized: false, settings: null, quota: null });
  useWorkspace.setState({
    cards: [],
    selectedIds: [],
    editingId: null,
    boards: [],
    currentBoardId: SYSTEM_BOARD_ID,
    lastNonSystemBoardId: null,
    viewportByBoard: {},
    boardTransitioning: false,
    subcanvasCounts: {},
    dropTargetFunnelId: null,
    pendingSubcanvasUndo: null,
    viewport: { x: 0, y: 0, scale: 1 },
  });
  if (originalStorage) {
    Object.defineProperty(navigator, "storage", originalStorage);
  }
});

/** createSubcanvas의 비동기 영속(보드 저장 + loadBoards)이 끝날 때까지 대기. */
async function waitFor(cond: () => boolean, timeout = 2000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeout) throw new Error("waitFor timeout");
    await new Promise((r) => setTimeout(r, 5));
  }
}

describe("함 카드 인코딩/디코딩 round-trip", () => {
  it("boardRef를 content JSON으로 저장하고 복원한다", () => {
    const card: Card = {
      id: "f1",
      kind: "board",
      x: 10,
      y: 20,
      width: 200,
      height: 200,
      content: "",
      boardRef: "b-child",
    };
    const encoded = encodeCardContent(card);
    expect(encoded).toContain(__internal.SUBCANVAS_MARKER);

    const decoded = decodeNoteToCard({
      id: "f1",
      boardId: "b-parent",
      kind: "board",
      x: 10,
      y: 20,
      width: 200,
      height: 200,
      rotation: 0,
      content: encoded,
      aiOptOut: false,
      createdAt: 0,
      updatedAt: 0,
      lastVisitedAt: 0,
    });
    expect(decoded.kind).toBe("board");
    expect(decoded.boardRef).toBe("b-child");
  });

  it("손상된 content는 boardRef 없이 안전하게 복원된다", () => {
    const decoded = decodeNoteToCard({
      id: "f2",
      boardId: null,
      kind: "board",
      x: 0,
      y: 0,
      width: 200,
      rotation: 0,
      content: "not-json",
      aiOptOut: false,
      createdAt: 0,
      updatedAt: 0,
      lastVisitedAt: 0,
    });
    expect(decoded.kind).toBe("board");
    expect(decoded.boardRef).toBeUndefined();
  });
});

describe("isDescendantBoard 사이클 검사", () => {
  const boards = [
    { id: "p", parentBoardId: null },
    { id: "c", parentBoardId: "p" },
    { id: "c2", parentBoardId: "c" },
    { id: "other", parentBoardId: "p" },
  ] as Board[];

  it("자기 자신은 자손으로 취급(equal)", () => {
    expect(isDescendantBoard(boards, "c", "c")).toBe(true);
  });
  it("후손이면 true", () => {
    expect(isDescendantBoard(boards, "c2", "c")).toBe(true);
  });
  it("형제/무관 보드는 false", () => {
    expect(isDescendantBoard(boards, "other", "c")).toBe(false);
  });
});

describe("createSubcanvas / enter / goToParent / breadcrumb", () => {
  it("함 + 빈 서브 보드를 생성하고 parentBoardId/boardRef로 연결한다", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().createBoard("부모");
    const parentId = useWorkspace.getState().currentBoardId;
    expect(parentId).not.toBe(SYSTEM_BOARD_ID);

    const funnelId = useWorkspace.getState().createSubcanvas(100, 100);
    expect(funnelId).not.toBe("");
    const funnel = useWorkspace.getState().cards.find((c) => c.id === funnelId);
    expect(funnel?.kind).toBe("board");
    const childRef = funnel?.boardRef as string;
    expect(childRef).toBeTruthy();

    await waitFor(() =>
      useWorkspace.getState().boards.some((b) => b.id === childRef),
    );
    const child = useWorkspace.getState().boards.find((b) => b.id === childRef);
    expect(child?.parentBoardId).toBe(parentId);
  });

  it("시스템 보드에서도 함을 만들 수 있고, 그 함의 서브 보드 parentBoardId는 system", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();
    expect(useWorkspace.getState().currentBoardId).toBe(SYSTEM_BOARD_ID);

    const funnelId = useWorkspace.getState().createSubcanvas(0, 0);
    expect(funnelId).not.toBe("");
    const childRef = useWorkspace.getState().cards.find((c) => c.id === funnelId)
      ?.boardRef as string;
    await waitFor(() =>
      useWorkspace.getState().boards.some((b) => b.id === childRef),
    );
    const child = useWorkspace.getState().boards.find((b) => b.id === childRef);
    expect(child?.parentBoardId).toBe(SYSTEM_BOARD_ID);

    // 함 카드는 boardId=null(시스템)로 저장됨 → 시스템 보드 카드 목록에 포함
    const note = await getDB().notes.get(funnelId);
    expect(note?.boardId).toBeNull();

    // 진입 후 breadcrumb은 시스템 보드를 루트 크럼으로 포함
    await useWorkspace.getState().enterSubcanvas(funnelId);
    const chain = useWorkspace.getState().getBreadcrumb();
    expect(chain[0]?.id).toBe(SYSTEM_BOARD_ID);
    expect(chain[chain.length - 1]?.id).toBe(childRef);
  });

  it("3단계 중첩 — enter/goToParent 왕복 + breadcrumb 조상 경로", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().createBoard("루트");
    const rootId = useWorkspace.getState().currentBoardId;

    const fA = useWorkspace.getState().createSubcanvas(0, 0);
    const refA = useWorkspace.getState().cards.find((c) => c.id === fA)
      ?.boardRef as string;
    await waitFor(() =>
      useWorkspace.getState().boards.some((b) => b.id === refA),
    );
    await useWorkspace.getState().enterSubcanvas(fA);
    expect(useWorkspace.getState().currentBoardId).toBe(refA);

    const fB = useWorkspace.getState().createSubcanvas(0, 0);
    const refB = useWorkspace.getState().cards.find((c) => c.id === fB)
      ?.boardRef as string;
    await waitFor(() =>
      useWorkspace.getState().boards.some((b) => b.id === refB),
    );
    await useWorkspace.getState().enterSubcanvas(fB);
    expect(useWorkspace.getState().currentBoardId).toBe(refB);

    // breadcrumb: 루트 → A → B (현재). 조상 = [루트, A].
    const chain = useWorkspace.getState().getBreadcrumb();
    expect(chain.map((c) => c.id)).toEqual([rootId, refA, refB]);

    // goToParent → A
    await useWorkspace.getState().goToParent();
    expect(useWorkspace.getState().currentBoardId).toBe(refA);
    // goToParent → 루트
    await useWorkspace.getState().goToParent();
    expect(useWorkspace.getState().currentBoardId).toBe(rootId);
    // 루트(부모 없음)에서 goToParent는 no-op
    await useWorkspace.getState().goToParent();
    expect(useWorkspace.getState().currentBoardId).toBe(rootId);
  });
});

describe("moveCardToSubcanvas", () => {
  it("카드를 함의 서브 보드로 옮기고 현재 뷰에서 제거한다", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().createBoard("부모");
    const parentId = useWorkspace.getState().currentBoardId;

    const funnelId = useWorkspace.getState().createSubcanvas(0, 0);
    const childRef = useWorkspace.getState().cards.find((c) => c.id === funnelId)
      ?.boardRef as string;
    await waitFor(() =>
      useWorkspace.getState().boards.some((b) => b.id === childRef),
    );

    const textId = useWorkspace.getState().addCardAt("text", 50, 50);
    await useWorkspace.getState().moveCardToSubcanvas(textId, funnelId);

    // 현재(부모) 뷰에서 사라짐
    expect(
      useWorkspace.getState().cards.some((c) => c.id === textId),
    ).toBe(false);
    // DB에서 boardId가 서브 보드로 바뀜
    const note = await getDB().notes.get(textId);
    expect(note?.boardId).toBe(childRef);

    // 진입하면 그 안에 존재
    await useWorkspace.getState().enterSubcanvas(funnelId);
    expect(useWorkspace.getState().currentBoardId).toBe(childRef);
    await waitFor(() =>
      useWorkspace.getState().cards.some((c) => c.id === textId),
    );
    expect(parentId).not.toBe(childRef);
  });

  it("함을 자기 자손 서브 보드로 넣으려 하면 사이클 가드로 no-op", async () => {
    // 직접 상태 구성: 부모 P, 함 H(→C), 함 Hx(→C2), C2는 C의 자손.
    useWorkspace.setState({
      currentBoardId: "P",
      boards: [
        { id: "P", parentBoardId: null },
        { id: "C", parentBoardId: "P" },
        { id: "C2", parentBoardId: "C" },
      ] as Board[],
      cards: [
        { id: "H", kind: "board", x: 0, y: 0, width: 200, content: "", boardRef: "C" },
        { id: "Hx", kind: "board", x: 300, y: 0, width: 200, content: "", boardRef: "C2" },
      ] as Card[],
    });
    await useStorage.getState().init();
    // H(→C)를 Hx(→C2)로: target C2는 C의 자손 → 차단.
    await useWorkspace.getState().moveCardToSubcanvas("H", "Hx");
    expect(useWorkspace.getState().cards.some((c) => c.id === "H")).toBe(true);
  });
});

describe("함 카드 cascade 삭제", () => {
  it("함을 지우면 서브 보드 + 그 안 카드까지 함께 삭제된다", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().createBoard("부모");

    const funnelId = useWorkspace.getState().createSubcanvas(0, 0);
    const childRef = useWorkspace.getState().cards.find((c) => c.id === funnelId)
      ?.boardRef as string;
    await waitFor(() =>
      useWorkspace.getState().boards.some((b) => b.id === childRef),
    );

    // 서브 보드에 카드 하나 넣기
    const textId = useWorkspace.getState().addCardAt("text", 0, 0);
    await useWorkspace.getState().moveCardToSubcanvas(textId, funnelId);

    // 함 삭제 → cascade (DB row는 즉시 삭제, undo 스냅샷 set)
    useWorkspace.getState().remove(funnelId);
    await waitFor(() => useWorkspace.getState().pendingSubcanvasUndo !== null);

    expect(await getDB().boards.get(childRef)).toBeUndefined();
    expect(await getDB().notes.get(textId)).toBeUndefined();
    expect(await getDB().notes.get(funnelId)).toBeUndefined();
  });
});

describe("함 삭제 5초 undo (#1)", () => {
  it("undo로 서브 보드 + 안의 카드 + 함 카드가 모두 복원된다", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().createBoard("부모");
    const parentId = useWorkspace.getState().currentBoardId;

    const funnelId = useWorkspace.getState().createSubcanvas(0, 0);
    const childRef = useWorkspace.getState().cards.find((c) => c.id === funnelId)
      ?.boardRef as string;
    await waitFor(() =>
      useWorkspace.getState().boards.some((b) => b.id === childRef),
    );
    const textId = useWorkspace.getState().addCardAt("text", 0, 0);
    await useWorkspace.getState().moveCardToSubcanvas(textId, funnelId);

    // 함 삭제
    useWorkspace.getState().selectOne(funnelId);
    useWorkspace.getState().removeSelected();
    await waitFor(() => useWorkspace.getState().pendingSubcanvasUndo !== null);
    expect(
      useWorkspace.getState().cards.some((c) => c.id === funnelId),
    ).toBe(false);
    expect(await getDB().boards.get(childRef)).toBeUndefined();

    // undo
    await useWorkspace.getState().undoSubcanvasRemove();
    expect(await getDB().boards.get(childRef)).toBeDefined();
    expect(await getDB().notes.get(textId)).toBeDefined();
    expect(await getDB().notes.get(funnelId)).toBeDefined();
    // 같은(부모) 보드를 보고 있으므로 함 카드가 화면에 되살아난다
    expect(useWorkspace.getState().currentBoardId).toBe(parentId);
    expect(
      useWorkspace.getState().cards.some((c) => c.id === funnelId),
    ).toBe(true);
    expect(useWorkspace.getState().pendingSubcanvasUndo).toBeNull();
  });

  it("blob 삭제는 undo 만료까지 연기 — 삭제 직후엔 purge 안 하고, clear(포기) 시 purge", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().createBoard("부모");
    const funnelId = useWorkspace.getState().createSubcanvas(0, 0);
    const childRef = useWorkspace.getState().cards.find((c) => c.id === funnelId)
      ?.boardRef as string;
    await waitFor(() =>
      useWorkspace.getState().boards.some((b) => b.id === childRef),
    );

    const purgeSpy = vi.spyOn(useStorage.getState(), "purgeAttachments");

    useWorkspace.getState().selectOne(funnelId);
    useWorkspace.getState().removeSelected();
    await waitFor(() => useWorkspace.getState().pendingSubcanvasUndo !== null);

    // 삭제 직후: blob purge는 아직 호출되지 않아야 한다(undo 창 동안 보존).
    expect(purgeSpy).not.toHaveBeenCalled();

    // 포기(×) → 보류 blob 정리 호출 + 스냅샷 비움
    useWorkspace.getState().clearSubcanvasUndo();
    expect(purgeSpy).toHaveBeenCalledTimes(1);
    expect(useWorkspace.getState().pendingSubcanvasUndo).toBeNull();

    purgeSpy.mockRestore();
  });
});
