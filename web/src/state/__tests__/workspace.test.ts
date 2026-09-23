import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __internal,
  BOARD_FADE_MS,
  CAPTURE_TOOLS,
  MAX_SCALE,
  MIN_SCALE,
  SYSTEM_BOARD_ID,
  useWorkspace,
  type Card,
  type CaptureToolId,
} from "@/state/workspace";
import { useStorage } from "@/state/storage";
import { getDB, resetDB } from "@/state/db/schema";
import type { Translator } from "@/i18n";

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

describe("workspace ↔ storage 매핑", () => {
  it("text 카드는 plain text로 인코딩", () => {
    const encoded = __internal.encodeCardContent({
      id: "n",
      kind: "text",
      x: 0,
      y: 0,
      width: 240,
      content: "hello",
    });
    expect(encoded).toBe("hello");
  });

  it("옛 comment 마커 JSON('{'로 시작)도 그대로 text로 유지 — comment kind는 삭제됨", () => {
    const decoded = __internal.decodeNoteToCard({
      id: "x",
      boardId: null,
      kind: "text",
      x: 0,
      y: 0,
      width: 240,
      rotation: 0,
      content: '{"__moss_comment_v1__":true,"author":"동박","time":"2 days ago","body":"오호"}',
      aiOptOut: false,
      createdAt: 0,
      updatedAt: 0,
      lastVisitedAt: 0,
    });
    expect(decoded.kind).toBe("text");
    expect(decoded.content).toBe(
      '{"__moss_comment_v1__":true,"author":"동박","time":"2 days ago","body":"오호"}',
    );
  });

  it("text 본문이 마침 '{'로 시작하지만 마커가 없으면 text로 유지", () => {
    const decoded = __internal.decodeNoteToCard({
      id: "x",
      boardId: null,
      kind: "text",
      x: 0,
      y: 0,
      width: 240,
      rotation: 0,
      content: '{"unrelated":1}',
      aiOptOut: false,
      createdAt: 0,
      updatedAt: 0,
      lastVisitedAt: 0,
    });
    expect(decoded.kind).toBe("text");
    expect(decoded.content).toBe('{"unrelated":1}');
  });

  it("attachmentRef + mediaType 라운드트립", () => {
    const decoded = __internal.decodeNoteToCard({
      id: "x",
      boardId: null,
      kind: "image",
      x: 0,
      y: 0,
      width: 200,
      rotation: 0,
      content: "cat.png",
      attachmentRef: "opfs:cat.png",
      mediaType: "image/png",
      aiOptOut: false,
      createdAt: 0,
      updatedAt: 0,
      lastVisitedAt: 0,
    });
    expect(decoded.kind).toBe("image");
    expect(decoded.attachmentRef).toBe("opfs:cat.png");
    expect(decoded.mediaType).toBe("image/png");
  });
});

/* AC-2: 10종 capture ToolId 각각 빈 카드 + editing 활성 */
describe("FEAT-capture AC-2: ToolId → CardKind 10종 매핑", () => {
  it.each(CAPTURE_TOOLS)("addCardAt(%s) → 같은 kind 카드 + editing", async (tool: CaptureToolId) => {
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();

    const before = useWorkspace.getState().cards.length;
    const id = useWorkspace.getState().addCardAt(tool, 50, 60);
    await new Promise((r) => setTimeout(r, 10));
    const state = useWorkspace.getState();
    expect(state.cards.length).toBe(before + 1);
    const created = state.cards.find((c) => c.id === id);
    expect(created?.kind).toBe(tool);
    expect(state.editingId).toBe(id);
  });

  // FEAT-subcanvas: board 도구는 이제 "함" 카드(kind:board)를 만든다(편집 비활성).
  // 실제 함 생성(서브 보드 연결)은 createSubcanvas 경로이고, addCardAt은 kind만 매핑한다.
  it("board toolId는 함(board) 카드 + editing 비활성", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();
    const id = useWorkspace.getState().addCardAt("board", 0, 0);
    await new Promise((r) => setTimeout(r, 10));
    const state = useWorkspace.getState();
    const card = state.cards.find((c) => c.id === id);
    expect(card?.kind).toBe("board");
    expect(state.editingId).toBe(null);
  });

});

describe("workspace.loadFromStorage seed 흐름", () => {
  it("첫 실행: 시드를 영속하고 installPromptShown=true 마킹", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();

    const cards = useWorkspace.getState().cards;
    expect(cards.map((c) => c.id).sort()).toEqual(
      __internal.SEED_CARDS.map((c) => c.id).sort(),
    );
    expect(useStorage.getState().settings?.installPromptShown).toBe(true);

    // DB에 실제로 영속됐는지 확인
    const fromDB = await useStorage.getState().loadCards(null);
    expect(fromDB).toHaveLength(__internal.SEED_CARDS.length);
  });

  it("두 번째 실행: 시드 재주입 안 함 — 사용자가 모두 지워도", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();

    // 사용자가 모든 카드 삭제 시뮬레이션
    const ids = useWorkspace.getState().cards.map((c) => c.id);
    for (const id of ids) useWorkspace.getState().remove(id);
    // remove*는 storage.trashNote를 비동기로 부른다 — 새 세션 전에 완료를 기다린다.
    await new Promise((r) => setTimeout(r, 20));

    // 새 세션 시뮬레이션
    useStorage.setState({ initialized: false, settings: null, quota: null });
    useWorkspace.setState({
      cards: [],
      selectedIds: [],
      editingId: null,
    });
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();

    expect(useWorkspace.getState().cards).toHaveLength(0);
  });
});

describe("workspace mutations → storage 영속 (AC-4)", () => {
  it("addCardAt → 새로고침 시 동일 상태 복원", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();

    const id = useWorkspace.getState().addCardAt("text", 100, 200);

    // 잠시 비동기 saveNote가 완료되도록 대기
    await new Promise((r) => setTimeout(r, 10));

    // 새 세션
    useStorage.setState({ initialized: false, settings: null, quota: null });
    useWorkspace.setState({
      cards: [],
      selectedIds: [],
      editingId: null,
    });
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();

    const restored = useWorkspace.getState().cards.find((c) => c.id === id);
    expect(restored).toBeDefined();
    expect(restored?.x).toBe(100);
    expect(restored?.y).toBe(200);
    expect(restored?.kind).toBe("text");
  });

  it("moveCard 디바운스 — 300ms 안에서 한 번만 영속", async () => {
    // init과 loadFromStorage는 실시간으로 (fake-indexeddb의 내부 타이머와 충돌 방지)
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();
    const id = useWorkspace.getState().addCardAt("text", 0, 0);
    await new Promise((r) => setTimeout(r, 5)); // initial save 완료 대기
    const saveSpy = vi.spyOn(useStorage.getState(), "saveNote");

    vi.useFakeTimers();
    useWorkspace.getState().moveCard(id, 10, 10);
    useWorkspace.getState().moveCard(id, 20, 20);
    useWorkspace.getState().moveCard(id, 30, 30);

    expect(saveSpy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(299);
    expect(saveSpy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(saveSpy.mock.calls[0][0].x).toBe(30);
    expect(saveSpy.mock.calls[0][0].y).toBe(30);
  });

  it("remove → storage.removeNote 호출, 디바운스 후에도 카드 부활하지 않음", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();
    const id = useWorkspace.getState().addCardAt("text", 0, 0);
    await new Promise((r) => setTimeout(r, 50));

    useWorkspace.getState().moveCard(id, 100, 100); // pending 300ms debounce
    useWorkspace.getState().remove(id);

    // 디바운스 만료 시간보다 충분히 기다림
    await new Promise((r) => setTimeout(r, 500));

    // remove가 debounced save를 취소했어야 하므로 DB에 카드가 부활하면 안 됨
    const inDb = await useStorage.getState().loadCards(null);
    expect(inDb.find((n) => n.id === id)).toBeUndefined();
  });

  it("setAttachment → attachmentRef + mediaType 영속", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();
    const id = useWorkspace.getState().addCardAt("image", 0, 0);
    await new Promise((r) => setTimeout(r, 10));

    useWorkspace.getState().setAttachment(id, "opfs:photo.png", {
      content: "photo.png",
      mediaType: "image/png",
    });
    await new Promise((r) => setTimeout(r, 10));

    const fromDB = await useStorage.getState().loadCards(null);
    const note = fromDB.find((n) => n.id === id);
    expect(note?.attachmentRef).toBe("opfs:photo.png");
    expect(note?.content).toBe("photo.png");
    expect(note?.mediaType).toBe("image/png");

    // 새 세션 시뮬레이션 — 새로고침 후에도 mediaType 복원
    useStorage.setState({ initialized: false, settings: null, quota: null });
    useWorkspace.setState({
      cards: [],
      selectedIds: [],
      editingId: null,
      lastToolId: "text",
    });
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();
    const restored = useWorkspace.getState().cards.find((c) => c.id === id);
    expect(restored?.attachmentRef).toBe("opfs:photo.png");
    expect(restored?.mediaType).toBe("image/png");
  });

  it("resizeCard — width/height 업데이트 및 코너에서 x/y 동시 이동", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();
    const id = useWorkspace.getState().addCardAt("text", 100, 200);
    await new Promise((r) => setTimeout(r, 10));

    // SE 핸들: width/height만 변경
    useWorkspace.getState().resizeCard(id, { width: 300, height: 400 });
    let card = useWorkspace.getState().cards.find((c) => c.id === id);
    expect(card?.width).toBe(300);
    expect(card?.height).toBe(400);
    expect(card?.x).toBe(100);
    expect(card?.y).toBe(200);

    // NW 핸들 시뮬: x/y도 같이 이동
    useWorkspace.getState().resizeCard(id, {
      width: 250,
      height: 300,
      x: 150,
      y: 250,
    });
    card = useWorkspace.getState().cards.find((c) => c.id === id);
    expect(card?.width).toBe(250);
    expect(card?.height).toBe(300);
    expect(card?.x).toBe(150);
    expect(card?.y).toBe(250);
  });

  it("resizeCard — min/max 클램프", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();
    const id = useWorkspace.getState().addCardAt("text", 0, 0);

    // min 미만으로 축소 시도
    useWorkspace.getState().resizeCard(id, { width: 10, height: 5 });
    let card = useWorkspace.getState().cards.find((c) => c.id === id);
    expect(card?.width).toBe(120); // CARD_MIN_WIDTH
    expect(card?.height).toBe(60); // CARD_MIN_HEIGHT

    // max 초과로 확대 시도
    useWorkspace.getState().resizeCard(id, { width: 9999, height: 9999 });
    card = useWorkspace.getState().cards.find((c) => c.id === id);
    expect(card?.width).toBe(1200); // CARD_MAX_WIDTH
    expect(card?.height).toBe(1200); // CARD_MAX_HEIGHT
  });

  it("resizeCard — height 영속 (새로고침 후 복원)", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();
    const id = useWorkspace.getState().addCardAt("text", 50, 60);
    await new Promise((r) => setTimeout(r, 10));

    useWorkspace.getState().resizeCard(id, { width: 400, height: 500 });
    await new Promise((r) => setTimeout(r, 350)); // 디바운스 만료

    useStorage.setState({ initialized: false, settings: null, quota: null });
    useWorkspace.setState({
      cards: [],
      selectedIds: [],
      editingId: null,
      lastToolId: "text",
    });
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();
    const restored = useWorkspace.getState().cards.find((c) => c.id === id);
    expect(restored?.width).toBe(400);
    expect(restored?.height).toBe(500);
  });
});

describe("workspace 다중선택 (FEAT-canvas AC-5)", () => {
  beforeEach(async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();
    // seed 카드 제거, 깨끗한 상태에서 시작
    useWorkspace.setState({ cards: [], selectedIds: [], editingId: null });
  });

  // remove*가 storage.removeNote를 비동기로 호출하므로 resetDB 전에 flush.
  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });

  it("addCardAt → selectedIds 가 새 카드 단일 선택으로 설정됨", () => {
    const id = useWorkspace.getState().addCardAt("text", 0, 0);
    expect(useWorkspace.getState().selectedIds).toEqual([id]);
  });

  it("selectOne — null 이면 선택 해제, id 이면 단일 선택", () => {
    const { selectOne } = useWorkspace.getState();
    selectOne("a");
    expect(useWorkspace.getState().selectedIds).toEqual(["a"]);
    selectOne(null);
    expect(useWorkspace.getState().selectedIds).toEqual([]);
  });

  it("toggleSelect — 미선택은 추가, 이미 선택된 건 제거", () => {
    const { toggleSelect } = useWorkspace.getState();
    toggleSelect("a");
    toggleSelect("b");
    expect(useWorkspace.getState().selectedIds).toEqual(["a", "b"]);
    toggleSelect("a");
    expect(useWorkspace.getState().selectedIds).toEqual(["b"]);
  });

  it("selectMany — 기본은 치환, additive=true 면 기존에 합집합", () => {
    const { selectMany } = useWorkspace.getState();
    selectMany(["a", "b"]);
    expect(useWorkspace.getState().selectedIds).toEqual(["a", "b"]);
    selectMany(["c", "d"]);
    expect(useWorkspace.getState().selectedIds).toEqual(["c", "d"]);
    selectMany(["a", "c"], true);
    expect(useWorkspace.getState().selectedIds).toEqual(["c", "d", "a"]);
  });

  it("moveSelectedBy — 선택된 카드 전부 동일 delta 로 이동", () => {
    const a = useWorkspace.getState().addCardAt("text", 0, 0);
    const b = useWorkspace.getState().addCardAt("text", 100, 50);
    const c = useWorkspace.getState().addCardAt("text", 200, 100);
    useWorkspace.getState().selectMany([a, b]);

    useWorkspace.getState().moveSelectedBy(10, 20);

    const cards = useWorkspace.getState().cards;
    const ca = cards.find((x) => x.id === a)!;
    const cb = cards.find((x) => x.id === b)!;
    const cc = cards.find((x) => x.id === c)!;
    expect([ca.x, ca.y]).toEqual([10, 20]);
    expect([cb.x, cb.y]).toEqual([110, 70]);
    expect([cc.x, cc.y]).toEqual([200, 100]); // 선택 안 됨 → 그대로
  });

  it("removeSelected — 선택된 카드만 삭제 + selectedIds 비움", () => {
    const a = useWorkspace.getState().addCardAt("text", 0, 0);
    const b = useWorkspace.getState().addCardAt("text", 0, 0);
    const c = useWorkspace.getState().addCardAt("text", 0, 0);
    useWorkspace.getState().selectMany([a, c]);

    useWorkspace.getState().removeSelected();

    const ids = useWorkspace.getState().cards.map((x) => x.id);
    expect(ids).toEqual([b]);
    expect(useWorkspace.getState().selectedIds).toEqual([]);
  });

  it("remove(id) — selectedIds 에서도 해당 id 만 제거", () => {
    const a = useWorkspace.getState().addCardAt("text", 0, 0);
    const b = useWorkspace.getState().addCardAt("text", 0, 0);
    useWorkspace.getState().selectMany([a, b]);
    useWorkspace.getState().remove(a);
    expect(useWorkspace.getState().selectedIds).toEqual([b]);
  });

  it("clearSelection — selectedIds 비움", () => {
    useWorkspace.getState().selectMany(["a", "b"]);
    useWorkspace.getState().clearSelection();
    expect(useWorkspace.getState().selectedIds).toEqual([]);
  });
});

describe("FEAT-boards · 보드 store", () => {
  beforeEach(async () => {
    await useStorage.getState().init();
  });

  const waitFade = () =>
    new Promise<void>((r) => setTimeout(r, BOARD_FADE_MS + 20));

  it("초기 상태: currentBoardId = SYSTEM_BOARD_ID, 보드 목록 비어 있음", () => {
    expect(useWorkspace.getState().currentBoardId).toBe(SYSTEM_BOARD_ID);
    expect(useWorkspace.getState().boards).toEqual([]);
    expect(useWorkspace.getState().lastNonSystemBoardId).toBeNull();
  });

  it("createBoard — DB 영속 + state 반영 + currentBoardId 전환", async () => {
    const id = await useWorkspace.getState().createBoard("brand");
    const state = useWorkspace.getState();
    expect(state.currentBoardId).toBe(id);
    expect(state.boards.map((b) => b.id)).toContain(id);
    expect(state.boards.find((b) => b.id === id)?.name).toBe("brand");
    expect(state.lastNonSystemBoardId).toBe(id);
    const row = await getDB().boards.get(id);
    expect(row?.name).toBe("brand");
    expect(row?.isSystem).toBe(false);
    await waitFade();
  });

  it("createBoard — 빈 이름 허용 (AC-1)", async () => {
    const id = await useWorkspace.getState().createBoard();
    const row = await getDB().boards.get(id);
    expect(row?.name).toBe("");
    await waitFade();
  });

  it("setCurrentBoard — viewport 보존·복원 + 카드 교체", async () => {
    const idA = await useWorkspace.getState().createBoard("A");
    await waitFade();
    useWorkspace.setState({ viewport: { x: 100, y: 200, scale: 1.05 } });

    const idB = await useWorkspace.getState().createBoard("B");
    await waitFade();
    expect(useWorkspace.getState().viewport).toEqual({ x: 0, y: 0, scale: 1 });
    useWorkspace.setState({ viewport: { x: -50, y: -80, scale: 0.8 } });

    await useWorkspace.getState().setCurrentBoard(idA);
    await waitFade();
    expect(useWorkspace.getState().viewport).toEqual({
      x: 100,
      y: 200,
      scale: 1.05,
    });

    await useWorkspace.getState().setCurrentBoard(idB);
    await waitFade();
    expect(useWorkspace.getState().viewport).toEqual({
      x: -50,
      y: -80,
      scale: 0.8,
    });
  });

  it("setCurrentBoard — 한계 밖 viewport는 범위로 clamp (AC-5)", async () => {
    const idA = await useWorkspace.getState().createBoard("A");
    await waitFade();
    useWorkspace.setState({ viewport: { x: 100, y: 200, scale: 3 } });

    const idB = await useWorkspace.getState().createBoard("B");
    await waitFade();

    await useWorkspace.getState().setCurrentBoard(idA);
    await waitFade();
    const restored = useWorkspace.getState().viewport;
    expect(restored.scale).toBe(MAX_SCALE);
    expect(restored.scale).toBeLessThanOrEqual(MAX_SCALE);
    expect(restored.scale).toBeGreaterThanOrEqual(MIN_SCALE);
    void idB;
  });

  it("setCurrentBoard — boardTransitioning 플래그 200ms 후 해제", async () => {
    await useWorkspace.getState().createBoard("X");
    // createBoard 끝나면 setCurrentBoard도 끝나 transitioning 시작
    expect(useWorkspace.getState().boardTransitioning).toBe(true);
    await waitFade();
    expect(useWorkspace.getState().boardTransitioning).toBe(false);
  });

  it("renameBoard — 시스템 보드는 throw", async () => {
    await expect(
      useWorkspace.getState().renameBoard(SYSTEM_BOARD_ID, "x"),
    ).rejects.toThrow();
  });

  it("renameBoard — DB·state 양쪽 반영", async () => {
    const id = await useWorkspace.getState().createBoard("old");
    await waitFade();
    await useWorkspace.getState().renameBoard(id, "new");
    expect(useWorkspace.getState().boards.find((b) => b.id === id)?.name).toBe(
      "new",
    );
    const row = await getDB().boards.get(id);
    expect(row?.name).toBe("new");
  });

  it("removeBoard — 시스템 보드는 throw", async () => {
    await expect(
      useWorkspace.getState().removeBoard(SYSTEM_BOARD_ID),
    ).rejects.toThrow();
  });

  it("removeBoard — 메모는 boardId=null로 보존됨 (시스템 보드로 이관)", async () => {
    const id = await useWorkspace.getState().createBoard("temp");
    await waitFade();
    const cardId = useWorkspace.getState().addCardAt("text", 10, 20);
    // persistCard는 storage.saveNote 호출 — IDB 작업 완료 대기
    await new Promise((r) => setTimeout(r, 10));

    await useWorkspace.getState().removeBoard(id);
    await waitFade();

    const note = await getDB().notes.get(cardId);
    expect(note).toBeDefined();
    expect(note?.boardId).toBeNull();
    expect(useWorkspace.getState().currentBoardId).toBe(SYSTEM_BOARD_ID);
  });

  it("toggleSystemBoard — 시스템 ↔ 마지막 사용자 보드", async () => {
    const id = await useWorkspace.getState().createBoard("alpha");
    await waitFade();
    expect(useWorkspace.getState().currentBoardId).toBe(id);

    await useWorkspace.getState().toggleSystemBoard();
    await waitFade();
    expect(useWorkspace.getState().currentBoardId).toBe(SYSTEM_BOARD_ID);

    await useWorkspace.getState().toggleSystemBoard();
    await waitFade();
    expect(useWorkspace.getState().currentBoardId).toBe(id);
  });

  it("toggleSystemBoard — 사용자 보드 없으면 no-op", async () => {
    await useWorkspace.getState().toggleSystemBoard();
    expect(useWorkspace.getState().currentBoardId).toBe(SYSTEM_BOARD_ID);
  });

  it("addCardAt — 사용자 보드에 머무는 동안 추가하면 boardId가 그 보드 id로 영속", async () => {
    const id = await useWorkspace.getState().createBoard("notes");
    await waitFade();
    const cardId = useWorkspace.getState().addCardAt("text", 0, 0);
    await new Promise((r) => setTimeout(r, 10));
    const note = await getDB().notes.get(cardId);
    expect(note?.boardId).toBe(id);
  });
});

describe("FEAT-templates · createBoardFromTemplate", () => {
  const waitFade = () =>
    new Promise<void>((r) => setTimeout(r, BOARD_FADE_MS + 20));

  beforeEach(async () => {
    await useStorage.getState().init();
  });

  const t: Translator = (key, vars) => {
    const v = vars ? JSON.stringify(vars) : "";
    return `${key}${v ? `(${v})` : ""}`;
  };

  it("free 템플릿 — 새 보드 생성 + 카드 0개 + templateId 메타 저장", async () => {
    const id = await useWorkspace
      .getState()
      .createBoardFromTemplate("free", "내 첫 보드", t);
    await waitFade();
    expect(useWorkspace.getState().currentBoardId).toBe(id);

    const board = await getDB().boards.get(id);
    expect(board?.name).toBe("내 첫 보드");
    expect(board?.templateId).toBe("free");

    const notes = await getDB().notes.where("boardId").equals(id).toArray();
    expect(notes).toHaveLength(0);
    expect(useWorkspace.getState().cards).toHaveLength(0);
  });

  it("mindmap 템플릿 — 초기 카드 1개(text kind) 자동 배치 (FEAT-sticky-redesign: 메모는 한 종류)", async () => {
    const id = await useWorkspace
      .getState()
      .createBoardFromTemplate("mindmap", "맵", t);
    await waitFade();

    const notes = await getDB().notes.where("boardId").equals(id).toArray();
    expect(notes).toHaveLength(1);
    expect(notes[0].kind).toBe("text");

    const cards = useWorkspace.getState().cards;
    expect(cards).toHaveLength(1);
    expect(cards[0].kind).toBe("text");
  });

  it("project 템플릿 — 초기 카드 4개(컬럼 헤더 2 + 가이드 2)", async () => {
    const id = await useWorkspace
      .getState()
      .createBoardFromTemplate("project", "P", t);
    await waitFade();
    const notes = await getDB().notes.where("boardId").equals(id).toArray();
    expect(notes).toHaveLength(4);
  });

  it("diary 템플릿 — 오늘 날짜 본문 + 감정 슬롯 (factory now 주입)", async () => {
    const fixed = new Date(2026, 4, 21);
    const id = await useWorkspace
      .getState()
      .createBoardFromTemplate("diary", "오늘", t, fixed);
    await waitFade();
    const notes = await getDB().notes.where("boardId").equals(id).toArray();
    const dateNote = notes.find((n) =>
      n.content.includes("templates.diary.cards.dateFormat"),
    );
    expect(dateNote).toBeDefined();
    // factory가 vars를 t에 전달하므로 본문 안에 2026/5/21이 포함되어야 함.
    expect(dateNote!.content).toContain("2026");
    expect(dateNote!.content).toContain("21");
  });

  it("빈 이름 → i18n 기본명으로 폴백 (AC-1 보조)", async () => {
    const id = await useWorkspace
      .getState()
      .createBoardFromTemplate("free", "  ", t);
    await waitFade();
    const board = await getDB().boards.get(id);
    expect(board?.name).toBe("templates.picker.defaultBoardName");
  });

  it("미지의 templateId → throw (안전 가드)", async () => {
    await expect(
      useWorkspace.getState().createBoardFromTemplate("nope", "x", t),
    ).rejects.toThrow();
  });
});

describe("FEAT-canvas-initial-view — 줌 한계 50~110%", () => {
  it("setScale·zoomAt이 0.5 아래와 1.1 위를 자른다 (AC-3)", () => {
    useWorkspace.setState({ viewport: { x: 0, y: 0, scale: 1 } });

    useWorkspace.getState().setScale(0.1);
    expect(useWorkspace.getState().viewport.scale).toBe(MIN_SCALE);
    useWorkspace.getState().setScale(5);
    expect(useWorkspace.getState().viewport.scale).toBe(MAX_SCALE);

    useWorkspace.getState().zoomAt(0.1, 100, 100);
    expect(useWorkspace.getState().viewport.scale).toBe(MIN_SCALE);
    useWorkspace.getState().zoomAt(10, 100, 100);
    expect(useWorkspace.getState().viewport.scale).toBe(MAX_SCALE);
  });

  it("fitToCards — 넓게 흩어진 메모도 0.8 밑으로 내려가지 않는다 (AC-1)", () => {
    useWorkspace.setState({
      cards: [
        { id: "a", kind: "text", x: 0, y: 0, width: 240, content: "" },
        { id: "b", kind: "text", x: 10000, y: 10000, width: 240, content: "" },
      ],
    });
    useWorkspace.getState().fitToCards({ width: 1000, height: 800 });
    expect(useWorkspace.getState().viewport.scale).toBe(MIN_SCALE);
  });
});

describe("FEAT-trash · 삭제 경로와 복구", () => {
  beforeEach(async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();
    useWorkspace.setState({ cards: [], selectedIds: [], editingId: null });
  });

  // remove*는 storage.trashNote를 비동기로 부른다 — resetDB 전에 flush.
  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 20));
    vi.restoreAllMocks();
  });

  it("remove — 메모는 trashNote로 간다", async () => {
    const trashSpy = vi.spyOn(useStorage.getState(), "trashNote");
    const id = useWorkspace.getState().addCardAt("text", 0, 0);
    await new Promise((r) => setTimeout(r, 10));

    useWorkspace.getState().remove(id);

    expect(trashSpy).toHaveBeenCalledWith(id);
  });

  it("removeSelected — 선택된 메모 전부 한 번의 trashNotes로 간다", async () => {
    const trashSpy = vi.spyOn(useStorage.getState(), "trashNotes");
    const a = useWorkspace.getState().addCardAt("text", 0, 0);
    const b = useWorkspace.getState().addCardAt("text", 10, 10);
    await new Promise((r) => setTimeout(r, 10));

    useWorkspace.getState().selectMany([a, b]);
    useWorkspace.getState().removeSelected();

    expect(trashSpy).toHaveBeenCalledTimes(1);
    expect(trashSpy).toHaveBeenCalledWith([a, b]);
  });

  it("remove — 함 카드는 cascade로 가고 trashNote를 타지 않는다 (AC-2)", async () => {
    const trashSpy = vi.spyOn(useStorage.getState(), "trashNote");
    const cascadeSpy = vi.spyOn(useStorage.getState(), "removeBoardCascade");
    const id = useWorkspace.getState().createSubcanvas(0, 0);
    await new Promise((r) => setTimeout(r, 20));

    useWorkspace.getState().remove(id);
    await vi.waitFor(() => expect(cascadeSpy).toHaveBeenCalled());

    expect(trashSpy).not.toHaveBeenCalled();
  });

  it("restoreFromTrash — 복구된 메모가 현재 보드면 cards에 추가된다", async () => {
    const id = useWorkspace.getState().addCardAt("text", 5, 5);
    await new Promise((r) => setTimeout(r, 10));
    useWorkspace.getState().remove(id);
    await vi.waitFor(async () =>
      expect(
        (await useStorage.getState().listTrash()).some((e) => e.id === id),
      ).toBe(true),
    );
    expect(useWorkspace.getState().cards.find((c) => c.id === id)).toBeUndefined();

    await useWorkspace.getState().restoreFromTrash(id);

    expect(useWorkspace.getState().cards.find((c) => c.id === id)).toBeDefined();
  });

  it("restoreFromTrash — 다른 보드 메모는 cards를 바꾸지 않는다 (AC-5)", async () => {
    await useStorage.getState().saveBoard({ id: "b1", name: "B" });
    await useStorage
      .getState()
      .saveNote({ id: "other", boardId: "b1", content: "x" });
    await useStorage.getState().trashNote("other");
    const before = useWorkspace.getState().cards.length;

    await useWorkspace.getState().restoreFromTrash("other");

    expect(useWorkspace.getState().cards.length).toBe(before);
    expect(
      (await useStorage.getState().loadCards("b1")).map((n) => n.id),
    ).toEqual(["other"]);
  });
});
