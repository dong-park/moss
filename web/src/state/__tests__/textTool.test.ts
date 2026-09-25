import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SYSTEM_BOARD_ID,
  TEXT_DEFAULT_SIZE,
  TEXTBOX_MIN_AUTO_WIDTH,
  TEXT_SIZE_PX,
  useWorkspace,
} from "@/state/workspace";
import { useStorage } from "@/state/storage";
import { getDB, resetDB, type Note } from "@/state/db/schema";
import { buildJsonCanvas } from "@/state/export/jsonCanvasExport";
import { noteToMarkdown, buildMarkdownExportContext } from "@/state/export/markdownExport";
import { partitionImportNotes } from "@/state/export/partitionImportNotes";
import { exportMossBundle } from "@/state/export/mossBundleExport";
import { importMossBundle } from "@/state/export/mossBundleImport";
import { flushAll } from "@/state/cardPersist";

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
  // 진행 중인 saveNote가 fake-indexeddb에서 끝날 틈을 준다(닫힌 DB unhandled 방지).
  await new Promise((r) => setTimeout(r, 20));
  await flushAll().catch(() => undefined);
  await resetDB();
  useStorage.setState({ initialized: false, settings: null, quota: null });
  useWorkspace.setState({
    cards: [],
    selectedIds: [],
    editingId: null,
    textPlacementArmed: false,
    boards: [],
    currentBoardId: SYSTEM_BOARD_ID,
    viewportByBoard: {},
    viewport: { x: 0, y: 0, scale: 1 },
  });
  if (originalStorage) {
    Object.defineProperty(navigator, "storage", originalStorage);
  }
});

function textboxNote(over: Partial<Note> = {}): Note {
  return {
    id: "tb-1",
    boardId: null,
    kind: "textbox",
    x: 0,
    y: 0,
    width: 120,
    rotation: 0,
    content: "제목 텍스트",
    color: "#334155",
    textSize: "l",
    autoWidth: false,
    aiOptOut: true,
    createdAt: 1,
    updatedAt: 1,
    lastVisitedAt: 1,
    ...over,
  };
}

describe("FEAT-text-tool: textbox 생성·스토어", () => {
  it("addCardAt('textbox') — 기본값·편집 진입 (AC-1)", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();

    const id = useWorkspace.getState().addCardAt("textbox", 50, 60);
    const state = useWorkspace.getState();
    const card = state.cards.find((c) => c.id === id);

    expect(card?.kind).toBe("textbox");
    expect(card?.aiOptOut).toBe(true);
    expect(card?.autoWidth).toBe(true);
    expect(card?.textSize).toBe(TEXT_DEFAULT_SIZE);
    expect(card?.height).toBeUndefined();
    expect(state.editingId).toBe(id);
  });

  it("메모판 안에 만들면 frameId가 바로 잡힌다 (DOD)", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();

    const frameId = useWorkspace.getState().addFrameAt(0, 0);
    const id = useWorkspace.getState().addCardAt("textbox", 40, 40);
    const card = useWorkspace.getState().cards.find((c) => c.id === id);
    expect(card?.frameId).toBe(frameId);
  });

  it("T 배치 모드 — arm/disarm (AC-2)", () => {
    expect(useWorkspace.getState().textPlacementArmed).toBe(false);
    useWorkspace.getState().armTextPlacement();
    expect(useWorkspace.getState().textPlacementArmed).toBe(true);
    useWorkspace.getState().disarmTextPlacement();
    expect(useWorkspace.getState().textPlacementArmed).toBe(false);
  });

  it("setTextStyle — 크기·색 변경 후 새로고침 유지 (AC-5)", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();
    const id = useWorkspace.getState().addCardAt("textbox", 0, 0);
    await new Promise((r) => setTimeout(r, 10));

    useWorkspace.getState().setTextStyle(id, { textSize: "xl", color: "#b91c1c" });
    await new Promise((r) => setTimeout(r, 10));

    useStorage.setState({ initialized: false, settings: null, quota: null });
    useWorkspace.setState({ cards: [], selectedIds: [], editingId: null });
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();

    const restored = useWorkspace.getState().cards.find((c) => c.id === id);
    expect(restored?.textSize).toBe("xl");
    expect(restored?.color).toBe("#b91c1c");
    expect(TEXT_SIZE_PX.xl).toBe(44);
  });

  it("setTextWidth — 고정 폭 전환·클램프, 'auto' 복귀 (AC-4)", () => {
    const id = useWorkspace.getState().addCardAt("textbox", 0, 0);
    useWorkspace.getState().setTextWidth(id, 300);
    let card = useWorkspace.getState().cards.find((c) => c.id === id);
    expect(card?.autoWidth).toBe(false);
    expect(card?.width).toBe(300);

    useWorkspace.getState().setTextWidth(id, 10);
    card = useWorkspace.getState().cards.find((c) => c.id === id);
    expect(card?.width).toBe(120); // CARD_MIN_WIDTH

    useWorkspace.getState().setTextWidth(id, "auto");
    card = useWorkspace.getState().cards.find((c) => c.id === id);
    expect(card?.autoWidth).toBe(true);
  });

  it("setTextMeasuredWidth — 자동 폭 캐시만 갱신, 고정 폭은 무시 (AC-3)", () => {
    const id = useWorkspace.getState().addCardAt("textbox", 0, 0);
    useWorkspace.getState().setTextMeasuredWidth(id, 333);
    let card = useWorkspace.getState().cards.find((c) => c.id === id);
    expect(card?.width).toBe(333);
    expect(card?.autoWidth).toBe(true);

    useWorkspace.getState().setTextWidth(id, 200); // 고정 폭 전환
    useWorkspace.getState().setTextMeasuredWidth(id, 400);
    card = useWorkspace.getState().cards.find((c) => c.id === id);
    expect(card?.width).toBe(200);
    expect(card?.autoWidth).toBe(false);
  });

  it("자동 폭 하한은 작은 값 — 짧은 라벨을 120px로 부풀리지 않는다 (P1-4)", () => {
    const id = useWorkspace.getState().addCardAt("textbox", 0, 0);
    useWorkspace.getState().setTextMeasuredWidth(id, 10);
    const card = useWorkspace.getState().cards.find((c) => c.id === id);
    expect(card?.autoWidth).toBe(true);
    expect(card?.width).toBe(TEXTBOX_MIN_AUTO_WIDTH);
    expect(TEXTBOX_MIN_AUTO_WIDTH).toBeLessThan(120);
  });

  it("hardDeleteNote — 행 삭제, 휴지통 개수 그대로 (AC-6)", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();
    const id = useWorkspace.getState().addCardAt("textbox", 0, 0);
    await new Promise((r) => setTimeout(r, 10));
    expect(await getDB().notes.get(id)).toBeTruthy();

    useWorkspace.getState().hardDeleteNote(id);
    await new Promise((r) => setTimeout(r, 20));

    expect(await getDB().notes.get(id)).toBeUndefined();
    expect(await getDB().trash.count()).toBe(0);
    expect(useWorkspace.getState().cards.find((c) => c.id === id)).toBeUndefined();
  });

  it("hardDeleteNote — textbox가 아니면 지우지 않는다 (P2-1)", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();
    const id = useWorkspace.getState().addCardAt("text", 0, 0);
    await new Promise((r) => setTimeout(r, 10));

    useWorkspace.getState().hardDeleteNote(id);
    await new Promise((r) => setTimeout(r, 20));

    expect(await getDB().notes.get(id)).toBeTruthy();
    expect(useWorkspace.getState().cards.find((c) => c.id === id)).toBeTruthy();
  });

  it("hardDeleteNote — 연결선·임베딩도 함께 정리 (P2-1)", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();
    const id = useWorkspace.getState().addCardAt("textbox", 0, 0);
    await new Promise((r) => setTimeout(r, 10));

    await getDB().connections.put({
      id: "conn-1",
      sourceNoteId: id,
      targetNoteId: "other",
      source: "manual",
      status: "active",
      createdAt: 1,
    });
    await getDB().embeddings.put({
      noteId: id,
      contentHash: "h",
      vector: new Float32Array([0]),
      updatedAt: 1,
    });

    useWorkspace.getState().hardDeleteNote(id);
    await new Promise((r) => setTimeout(r, 30));

    expect(await getDB().notes.get(id)).toBeUndefined();
    expect(await getDB().connections.get("conn-1")).toBeUndefined();
    expect(await getDB().embeddings.get(id)).toBeUndefined();
  });
});

describe("FEAT-text-tool: export 매핑 (AC-7)", () => {
  it("JSON Canvas — type:'text' 노드", () => {
    const doc = buildJsonCanvas([textboxNote()], []);
    expect(doc.nodes).toHaveLength(1);
    expect(doc.nodes[0]).toMatchObject({
      id: "tb-1",
      type: "text",
      text: "제목 텍스트",
    });
  });

  it("Markdown — 보드 문서 안 평문 단락", () => {
    const ctx = buildMarkdownExportContext([textboxNote()], []);
    const { content } = noteToMarkdown(textboxNote(), ctx);
    expect(content).toContain("kind: textbox");
    expect(content).toContain("제목 텍스트");
  });

  it("가져오기 분할 — textbox 수용", () => {
    const { accepted, skipped } = partitionImportNotes([textboxNote()]);
    expect(accepted.map((n) => n.id)).toEqual(["tb-1"]);
    expect(skipped).toEqual([]);
  });

  it(".moss 왕복 후 textSize·color·autoWidth 보존", async () => {
    const db = getDB();
    await db.open();
    await db.notes.put(textboxNote({ id: "tb-rt" }));

    const exported = await exportMossBundle({ scope: "all" });
    expect(exported).not.toBeNull();
    await resetDB();
    await importMossBundle(exported!.blob, "overwrite");

    const restored = await getDB().notes.get("tb-rt");
    expect(restored?.textSize).toBe("l");
    expect(restored?.color).toBe("#334155");
    expect(restored?.autoWidth).toBe(false);
    expect(restored?.kind).toBe("textbox");
  });
});
