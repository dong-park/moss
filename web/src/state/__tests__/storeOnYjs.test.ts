import { getDB } from "@/state/db/schema";
/**
 * FEAT-collab-auth n3 — 스토어를 Yjs 위로 옮기기.
 *
 * 급소 실험(task 0): 키 입력 1회에 스토어 set 1회(로컬 origin은 observer가 무시).
 * 드래그(task 4): 드래그 중 Y.Doc 쓰기 0건, 놓을 때 1건.
 * 원격 반영(task 2): observeDeep이 원격 변경을 스토어로 1회 반영.
 * AC-1: 로그인·외부 네트워크 없이 새로고침해도 메모가 남는다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspace, SYSTEM_BOARD_ID } from "@/state/workspace";
import { useStorage } from "@/state/storage";
import { resetDB } from "@/state/db/schema";
import { getActiveBoardDoc, destroyBoardDocs } from "@/state/ydoc/activeDoc";
import { notesMap, readNote } from "@/state/ydoc/model";

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
  vi.unstubAllGlobals();
  // 진행 중인 디바운스·즉시 영속이 resetDB의 DB close와 경쟁하지 않게 비운다.
  const { flushAll } = await import("@/state/cardPersist");
  await new Promise((r) => setTimeout(r, 10));
  await flushAll();
  await destroyBoardDocs();
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
    viewport: { x: 0, y: 0, scale: 1 },
  });
  if (originalStorage) {
    Object.defineProperty(navigator, "storage", originalStorage);
  }
});

async function boot() {
  await useStorage.getState().init();
  await useWorkspace.getState().loadFromStorage();
}

describe("n3 급소 실험 — setContent Y.Doc 쓰기 + observeDeep", () => {
  it("키 입력 1회에 스토어 set 1회, 로컬 origin 트랜잭션은 observer가 무시한다", async () => {
    await boot();
    const id = useWorkspace.getState().addCardAt("text", 0, 0);

    let cardSets = 0;
    const unsub = useWorkspace.subscribe((s, prev) => {
      if (s.cards !== prev.cards) cardSets++;
    });

    useWorkspace.getState().setContent(id, "안");

    // 로컬 쓰기는 스토어가 직접 한 번 갱신했고, observer는 로컬 origin을 건너뛴다.
    expect(cardSets).toBe(1);
    unsub();

    // Y.Doc에 본문이 실제로 들어갔다.
    const doc = getActiveBoardDoc()!.doc;
    expect(readNote(doc, id)?.content).toBe("안");
  });

  it("원격 origin 변경은 스토어로 한 번 반영된다", async () => {
    await boot();
    const id = useWorkspace.getState().addCardAt("text", 0, 0);
    const doc = getActiveBoardDoc()!.doc;

    let cardSets = 0;
    const unsub = useWorkspace.subscribe((s, prev) => {
      if (s.cards !== prev.cards) cardSets++;
    });

    // 다른 탭/서버가 쓴 것처럼 원격 origin으로 문서를 갱신한다.
    doc.transact(
      () => notesMap(doc).get(id)!.set("content", "원격"),
      { kind: "remote" },
    );

    expect(cardSets).toBe(1);
    unsub();
    expect(
      useWorkspace.getState().cards.find((c) => c.id === id)?.content,
    ).toBe("원격");
  });
});

describe("n3 리뷰 P0 — 원격 삭제는 휴지통을 지우지 않는다", () => {
  it("다른 탭이 휴지통에 넣은 메모를 원격 삭제 반영이 purge하지 않는다", async () => {
    await boot();
    const id = useWorkspace.getState().addCardAt("text", 0, 0);
    // 삭제한 탭의 공유 Dexie에 메모 행이 있고, 그 탭이 먼저 휴지통 행을 만든다.
    const card = useWorkspace.getState().cards.find((c) => c.id === id)!;
    await useStorage.getState().saveNote({ id, boardId: null, kind: "text", x: card.x, y: card.y, content: "" });
    await useStorage.getState().trashNote(id);
    expect(await getDB().trash.get(id)).toBeDefined();
    // 그 삭제가 채널로 도착한 것처럼 원격 origin으로 문서에서 지운다.
    const doc = getActiveBoardDoc()!.doc;
    doc.transact(() => notesMap(doc).delete(id), { kind: "remote" });
    await new Promise((r) => setTimeout(r, 20));
    expect(useWorkspace.getState().cards.some((c) => c.id === id)).toBe(false);
    expect(await getDB().trash.get(id)).toBeDefined();
  });
});

describe("n3 D4 — 드래그는 놓을 때 한 번만 문서에 쓴다", () => {
  it("드래그 중 Y.Doc 업데이트 0건, commitMove에서 1건", async () => {
    await boot();
    const id = useWorkspace.getState().addCardAt("text", 0, 0);
    const doc = getActiveBoardDoc()!.doc;

    let docUpdates = 0;
    const onUpdate = () => {
      docUpdates++;
    };
    doc.on("update", onUpdate);

    useWorkspace.getState().moveCard(id, 10, 10);
    useWorkspace.getState().moveCard(id, 20, 20);
    useWorkspace.getState().moveCard(id, 30, 30);
    expect(docUpdates).toBe(0);

    useWorkspace.getState().commitMove([id]);
    expect(docUpdates).toBe(1);

    doc.off("update", onUpdate);
    expect(readNote(doc, id)?.x).toBe(30);
    expect(readNote(doc, id)?.y).toBe(30);
  });

  it("P1-7: moveFrame은 드래그 중 문서에 쓰지 않고 commitMove가 한 번 쓴다", async () => {
    await boot();
    const frameId = useWorkspace.getState().addFrameAt(0, 0);
    const doc = getActiveBoardDoc()!.doc;
    const beforeX = readNote(doc, frameId)?.x;

    let docUpdates = 0;
    const onUpdate = () => {
      docUpdates++;
    };
    doc.on("update", onUpdate);

    useWorkspace.getState().moveFrame(frameId, 50, 60);
    expect(docUpdates).toBe(0);
    expect(readNote(doc, frameId)?.x).toBe(beforeX);

    useWorkspace.getState().commitMove([frameId]);
    expect(docUpdates).toBe(1);
    doc.off("update", onUpdate);
    expect(readNote(doc, frameId)?.x).toBe(beforeX! + 50);
  });
});

describe("n3 AC-1 — 로그인 없이 새로고침해도 남고 외부 네트워크 요청 0건", () => {
  it("보드를 만들고 메모를 쓴 뒤 다시 열면 메모가 남는다", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await boot();
    const boardId = await useWorkspace.getState().createBoard("내 보드");
    const id = useWorkspace.getState().addCardAt("text", 12, 34);
    useWorkspace.getState().setContent(id, "새로고침에도 남는다");
    // 300ms 디바운스 영속을 즉시 확정.
    const { flushAll } = await import("@/state/cardPersist");
    await flushAll();

    // 새 세션(새로고침) — 저장소/스토어를 다시 부팅.
    useStorage.setState({ initialized: false, settings: null, quota: null });
    useWorkspace.setState({
      cards: [],
      selectedIds: [],
      editingId: null,
      currentBoardId: SYSTEM_BOARD_ID,
    });
    await boot();
    await useWorkspace.getState().setCurrentBoard(boardId);

    const card = useWorkspace.getState().cards.find((c) => c.id === id);
    expect(card?.content).toBe("새로고침에도 남는다");

    // Y.Doc에도 남아 있다(공유 시 올라갈 원본).
    const doc = getActiveBoardDoc()!.doc;
    expect(readNote(doc, id)?.content).toBe("새로고침에도 남는다");

    // 외부 네트워크 요청 0건.
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
