/**
 * glass-surface n1 — 벽 재질·메모판 재질 데이터와 레지스트리.
 *
 * T7 예전·깨진 값은 유리(벽)·코르크(메모판)로 읽는다.
 * T4 재질을 바꿔도 카드·획 좌표는 그대로다.
 * T6 보드 문서로 왕복하고, 다시 열어도 남는다(저장 쪽).
 * T14 벽 재질·메모판 재질·메모판 스킨은 서로 바꾸지 않는다.
 *
 * setter는 실제 workspace 스토어와 실제 Y.Doc를 탄다.
 */
import * as Y from "yjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspace, SYSTEM_BOARD_ID, type Card } from "@/state/workspace";
import { useStorage } from "@/state/storage";
import { getDB, resetDB, type Board } from "@/state/db/schema";
import { flushAll } from "@/state/cardPersist";
import { getActiveBoardDoc, destroyBoardDocs } from "@/state/ydoc/activeDoc";
import { metaMap, putBoard, putNote, readBoard, readNotes } from "@/state/ydoc/model";
import { decodeFrameConfig, encodeFrameContent } from "@/state/frameContent";
import {
  DEFAULT_FRAME_MATERIAL,
  DEFAULT_WALL_MATERIAL,
  WALL_MATERIALS,
  WALL_MATERIAL_IDS,
  frameMaterialFor,
  wallMaterialFor,
} from "@/state/wallMaterials";
import ko from "@/i18n/messages/ko.json";

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
  await new Promise((r) => setTimeout(r, 20));
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
    boardTransitioning: false,
    viewport: { x: 0, y: 0, scale: 1 },
  });
  if (originalStorage) Object.defineProperty(navigator, "storage", originalStorage);
});

async function boot() {
  await useStorage.getState().init();
  await useWorkspace.getState().loadFromStorage();
}

const ws = () => useWorkspace.getState();
const card = (id: string) => ws().cards.find((c) => c.id === id) as Card;
const boardRow = (id: string) => ws().boards.find((b) => b.id === id) as Board | undefined;

/** 보드 문서의 note 좌표·크기·기울기만 뽑는다 — 재질이 바뀌어도 이 값은 그대로여야 한다. */
function geometry() {
  return readNotes(getActiveBoardDoc()!.doc)
    .map((n) => ({ id: n.id, x: n.x, y: n.y, width: n.width, height: n.height, rotation: n.rotation }))
    .sort((p, q) => p.id.localeCompare(q.id));
}

describe("레지스트리 — T7 예전·깨진 값", () => {
  it("합법 값은 셋뿐이고 재질마다 문구 키와 대표 바탕색이 있다", () => {
    expect([...WALL_MATERIAL_IDS]).toEqual(["glass", "whiteboard", "cork"]);
    for (const id of WALL_MATERIAL_IDS) {
      const def = WALL_MATERIALS[id];
      expect(def.id).toBe(id);
      expect(def.backdrops.length).toBeGreaterThan(0);
      for (const hex of def.backdrops) expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("문구 키가 ko.json에 실제로 있다", () => {
    const lookup = (path: string): unknown =>
      path.split(".").reduce<unknown>((node, key) => (node as Record<string, unknown>)?.[key], ko);
    for (const id of WALL_MATERIAL_IDS) {
      expect(typeof lookup(WALL_MATERIALS[id].labelKey)).toBe("string");
      expect(typeof lookup(WALL_MATERIALS[id].hintKey)).toBe("string");
    }
  });

  it("코르크만 마카 대비 기준에서 빠진다(D7)", () => {
    expect(WALL_MATERIALS.glass.contrastChecked).toBe(true);
    expect(WALL_MATERIALS.whiteboard.contrastChecked).toBe(true);
    expect(WALL_MATERIALS.cork.contrastChecked).toBe(false);
  });

  it.each([
    ["값 없음", undefined],
    ["null", null],
    ["모르는 이름", "marble"],
    ["대소문자 다른 이름", "Glass"],
    ["빈 문자열", ""],
    ["숫자", 3],
    ["객체", { id: "cork" }],
  ])("벽 재질: %s → 유리, 메모판 재질: %s → 코르크", (_label, raw) => {
    expect(wallMaterialFor(raw).id).toBe("glass");
    expect(frameMaterialFor(raw).id).toBe("cork");
    expect(DEFAULT_WALL_MATERIAL).toBe("glass");
    expect(DEFAULT_FRAME_MATERIAL).toBe("cork");
  });

  it("합법 값은 그대로 읽는다", () => {
    for (const id of WALL_MATERIAL_IDS) {
      expect(wallMaterialFor(id).id).toBe(id);
      expect(frameMaterialFor(id).id).toBe(id);
    }
  });
});

describe("메모판 내용 JSON은 벽 재질과 칸 스킨을 담지 않는다", () => {
  it("재질·깨진 값이 있어도 이름만 읽는다", () => {
    expect(decodeFrameConfig('{"name":"옛 판"}')).toEqual({ name: "옛 판" });
    expect(decodeFrameConfig('{"material":"marble"}').name).toBe("새 메모판");
    expect(decodeFrameConfig('{"material":7}').name).toBe("새 메모판");
    expect(decodeFrameConfig("not json").name).toBe("새 메모판");
    expect("material" in decodeFrameConfig('{"name":"옛 판","material":"whiteboard"}')).toBe(false);
  });

  it("다시 쓸 때 재질 키를 만들지 않는다", () => {
    expect(JSON.parse(encodeFrameContent({ name: "판" }))).toEqual({ name: "판" });
    const withMaterial = { name: "판", material: "whiteboard" } as Parameters<typeof encodeFrameContent>[0];
    expect(JSON.parse(encodeFrameContent(withMaterial))).toEqual({ name: "판" });
  });
});

describe("setWallMaterial — T4·T6 저장 쪽", () => {
  it("바꾸면 보드 행과 보드 문서에 남고, 카드 좌표는 1px도 안 바뀐다", async () => {
    await boot();
    const boardId = await ws().createBoard("재질 시험");
    const a = ws().addCardAt("text", 40, 60);
    const b = ws().addCardAt("text", 300.5, -20);
    const frame = ws().addFrameAt(-400, 100);
    // 기울어진 메모도 있어야 rotation 비교가 의미 있다 — 문서의 note에 직접 쓴다.
    const doc = getActiveBoardDoc()!.doc;
    putNote(doc, { ...readNotes(doc).find((n) => n.id === a)!, rotation: 4 } as never);
    await flushAll();

    const before = geometry();
    expect(before.map((g) => g.id)).toEqual([a, b, frame].sort());
    expect(before.find((g) => g.id === a)?.rotation).toBe(4);

    await ws().setWallMaterial(boardId, "whiteboard");

    expect(geometry()).toEqual(before);
    expect(boardRow(boardId)?.wallMaterial).toBe("whiteboard");
    expect(readBoard(getActiveBoardDoc()!.doc).wallMaterial).toBe("whiteboard");
    // Dexie 미러에도 남는다.
    expect((await getDB().boards.get(boardId))?.wallMaterial).toBe("whiteboard");

    await ws().setWallMaterial(boardId, "cork");
    expect(geometry()).toEqual(before);
    expect(boardRow(boardId)?.wallMaterial).toBe("cork");
  });

  it("예전 보드(값 없음)는 유리로 읽히고, 한 번 고르면 그 뒤로는 고른 값이다 (T7)", async () => {
    await boot();
    const boardId = await ws().createBoard("예전 보드");
    expect(boardRow(boardId)?.wallMaterial).toBeUndefined();
    expect(wallMaterialFor(boardRow(boardId)?.wallMaterial).id).toBe("glass");

    await ws().setWallMaterial(boardId, "cork");
    expect(wallMaterialFor(boardRow(boardId)?.wallMaterial).id).toBe("cork");
  });

  it("같은 재질로 바꾸면 아무것도 쓰지 않는다", async () => {
    await boot();
    const boardId = await ws().createBoard("같은 값");
    await ws().setWallMaterial(boardId, "cork");
    const row = await getDB().boards.get(boardId);
    const docBefore = Y.encodeStateAsUpdate(getActiveBoardDoc()!.doc);

    await ws().setWallMaterial(boardId, "cork");

    expect((await getDB().boards.get(boardId))?.updatedAt).toBe(row?.updatedAt);
    expect(Y.encodeStateAsUpdate(getActiveBoardDoc()!.doc)).toEqual(docBefore);

    // 기본값(유리)을 값 없는 보드에 고르는 것도 쓰기가 아니다.
    const other = await ws().createBoard("기본값");
    const otherRow = await getDB().boards.get(other);
    await ws().setWallMaterial(other, "glass");
    expect(await getDB().boards.get(other)).toEqual(otherRow);
  });

  it("모르는 값과 없는 보드는 무시한다", async () => {
    await boot();
    const boardId = await ws().createBoard("무시");
    await ws().setWallMaterial(boardId, "marble" as never);
    expect(boardRow(boardId)?.wallMaterial).toBeUndefined();

    await ws().setWallMaterial("no-such-board", "cork");
    expect(await getDB().boards.get("no-such-board")).toBeUndefined();
  });

  it("다시 열어도 남는다 — A는 코르크, B는 유리 (T6)", async () => {
    await boot();
    const a = await ws().createBoard("A");
    await ws().setWallMaterial(a, "cork");
    const b = await ws().createBoard("B");
    await flushAll();

    // 앱을 닫았다 여는 것과 같게: 문서를 모두 닫고 스토어 상태를 비운 뒤 저장소에서 읽는다.
    await destroyBoardDocs();
    useWorkspace.setState({ boards: [], cards: [], currentBoardId: SYSTEM_BOARD_ID });
    await ws().loadFromStorage();

    await ws().navigateToBoard(a);
    expect(wallMaterialFor(boardRow(a)?.wallMaterial).id).toBe("cork");
    expect(readBoard(getActiveBoardDoc()!.doc).wallMaterial).toBe("cork");

    await ws().navigateToBoard(b);
    expect(wallMaterialFor(boardRow(b)?.wallMaterial).id).toBe("glass");
  });

  it("다른 기기가 바꾼 값(원격 문서)이 보드 목록에 반영된다 — D2=A", async () => {
    await boot();
    const boardId = await ws().createBoard("공유");
    const doc = getActiveBoardDoc()!.doc;

    doc.transact(() => metaMap(doc).set("wallMaterial", "whiteboard"), { kind: "remote" });

    await vi.waitFor(() => expect(boardRow(boardId)?.wallMaterial).toBe("whiteboard"));
    expect((await getDB().boards.get(boardId))?.wallMaterial).toBe("whiteboard");
  });
});

describe("문서 왕복", () => {
  it("wallMaterial이 Y.Doc를 거쳐도 남고, 값 없는 보드는 키를 만들지 않는다", () => {
    const board: Board = {
      id: "b-1",
      name: "벽",
      isSystem: false,
      createdAt: 1,
      updatedAt: 2,
      lastOpenedAt: 3,
      wallMaterial: "whiteboard",
    };
    const doc = new Y.Doc();
    putBoard(doc, board);
    expect(readBoard(doc).wallMaterial).toBe("whiteboard");

    const plain = new Y.Doc();
    putBoard(plain, { ...board, wallMaterial: undefined });
    expect(metaMap(plain).has("wallMaterial")).toBe(false);
    expect(readBoard(plain).wallMaterial).toBeUndefined();
  });
});

describe("T14 — 벽 재질은 메모판 내용을 바꾸지 않는다", () => {
  it("메모판 이름을 바꿔도 벽 재질은 그대로다", async () => {
    await boot();
    const boardId = await ws().createBoard("독립");
    await ws().setWallMaterial(boardId, "cork");
    const frame = ws().addFrameAt(0, 0);
    ws().renameFrame(frame, "새 이름");

    expect(boardRow(boardId)?.wallMaterial).toBe("cork");
    expect(readBoard(getActiveBoardDoc()!.doc).wallMaterial).toBe("cork");
    expect(decodeFrameConfig(card(frame).content).name).toBe("새 이름");
  });

  it("벽 재질을 바꿔도 메모판 이름·좌표는 그대로다", async () => {
    await boot();
    const boardId = await ws().createBoard("독립2");
    const frame = ws().addFrameAt(12, 34);
    ws().renameFrame(frame, "그대로");
    const before = card(frame);

    await ws().setWallMaterial(boardId, "whiteboard");
    await ws().setWallMaterial(boardId, "cork");

    const after = card(frame);
    expect(decodeFrameConfig(after.content)).toEqual(decodeFrameConfig(before.content));
    expect({ x: after.x, y: after.y, w: after.width, h: after.height }).toEqual({
      x: before.x,
      y: before.y,
      w: before.width,
      h: before.height,
    });
  });
});
