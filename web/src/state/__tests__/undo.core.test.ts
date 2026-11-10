/**
 * cmd-z-undo n3 — 보드별 기록 장치, 키 경로, 탭 사이 방송.
 *
 * 캔버스 cmd+z 시험은 spec.md 「준비 확인」 공통 규칙을 따른다: 준비 → getter로 clear →
 * 실제 시간 0.6초 → 지금 보드와 undoStack 0 확인. then이 결과를 보는 내 탭 동작은
 * 준비 확인 뒤 스토어 액션으로 한다. 드래그는 n3 묶음 API로 moveCard·commitMove·
 * resolveMembership을 감싼다. T23은 열기 자체가 시험 동작이라 clear 없이 잰다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { useWorkspace, SYSTEM_BOARD_ID, __internal, __resetBoardDocsForTest } from "@/state/workspace";
import { useStorage } from "@/state/storage";
import { getDB, resetDB } from "@/state/db/schema";
import { flushAll } from "@/state/cardPersist";
import { getActiveBoardDoc, getOrOpenBoardDoc } from "@/state/ydoc/activeDoc";
import { readNote, readNotes, updateNoteField, putNote } from "@/state/ydoc/model";
import { UNTRACKED_ORIGIN, LOCAL_ORIGIN, isRemoteTransaction, transactLocal } from "@/state/ydoc/origin";
import {
  UNDO_MAX_STEPS,
  beginUndoGroup,
  endUndoGroup,
  getBoardUndoGroupState,
  getBoardUndoManager,
  openUndoStep,
  registerUndoStepHooks,
  undoBoard,
} from "@/state/ydoc/undo";
import { __resetLiveSyncForTest, type YDocSyncMsg } from "@/state/db/liveSync";
import { writeNoteRecord } from "@/state/ydoc/writeThrough";
import { handleUndoKeyDown } from "@/components/workspace/undoKeys";
import { useToasts } from "@/state/notifications";

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
  useToasts.getState().clear();
});

afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  await new Promise((r) => setTimeout(r, 20));
  await flushAll();
  await __resetBoardDocsForTest();
  __resetLiveSyncForTest();
  await resetDB();
  useStorage.setState({ initialized: false, settings: null, quota: null });
  useWorkspace.setState({
    cards: [],
    selectedIds: [],
    editingId: null,
    expandedCardId: null,
    penMode: false,
    penUndoStack: [],
    penRedoStack: [],
    boards: [],
    currentBoardId: SYSTEM_BOARD_ID,
    lastNonSystemBoardId: null,
    viewportByBoard: {},
    boardTransitioning: false,
    migrationPending: false,
    viewport: { x: 0, y: 0, scale: 1 },
  });
  document.body.innerHTML = "";
  if (originalStorage) Object.defineProperty(navigator, "storage", originalStorage);
});

/* ── 도우미 ─────────────────────────────────────────────────────── */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ws = () => useWorkspace.getState();
const doc = () => getActiveBoardDoc()!.doc;
const um = () => getBoardUndoManager()!;

async function boot() {
  await useStorage.getState().init();
  await ws().loadFromStorage();
}

/** 준비 확인 — clear, 실제 시간 0.6초, 지금 보드와 undoStack 0. */
async function readyCheck(boardId: string) {
  um().clear();
  await sleep(600);
  expect(ws().currentBoardId).toBe(boardId);
  expect(getBoardUndoManager()).not.toBeNull();
  expect(um().undoStack.length).toBe(0);
}

/** 화면 드래그를 스토어 수준으로 흉내 — 묶음 안에서 moveCard·commitMove·resolveMembership. */
function drag(id: string, x: number, y: number) {
  const token = beginUndoGroup();
  ws().moveCard(id, x, y);
  ws().moveCard(id, x, y);
  ws().commitMove([id]);
  ws().resolveMembership([id]);
  endUndoGroup(token);
}

/** 단계 열기 API를 부르는 진입점 흉내 — 한 번에 한 단계를 연다. */
function entryMove(id: string, x: number, y: number) {
  openUndoStep();
  ws().moveCard(id, x, y);
  ws().commitMove([id]);
}

function addMemo(x: number, y: number): string {
  const id = ws().addCardAt("text", x, y);
  useWorkspace.setState({ editingId: null, selectedIds: [] });
  return id;
}

type KeyOpts = { key?: string; code?: string; meta?: boolean; ctrl?: boolean; shift?: boolean };
function press(o: KeyOpts = {}) {
  return handleUndoKeyDown({
    key: o.key ?? "z",
    code: o.code ?? "KeyZ",
    metaKey: o.meta ?? !o.ctrl,
    ctrlKey: !!o.ctrl,
    shiftKey: !!o.shift,
  });
}

function pos(id: string) {
  const n = readNote(doc(), id);
  return { x: n?.x, y: n?.y, frameId: n?.frameId };
}

function warnToasts() {
  return useToasts.getState().toasts.filter((t) => t.tone === "warn");
}

/* ── T5 ─────────────────────────────────────────────────────────── */

describe("T5 드래그 이동 되돌리기·다시 실행", () => {
  const variants: { name: string; undo: KeyOpts; redo: KeyOpts }[] = [
    { name: "cmd", undo: {}, redo: { shift: true } },
    { name: "ctrl", undo: { ctrl: true }, redo: { ctrl: true, shift: true } },
    { name: "한글 입력기(e.key ㅋ, e.code KeyZ)", undo: { key: "ㅋ" }, redo: { key: "ㅋ", shift: true } },
  ];

  it("판 F에 끌어 놓은 A가 cmd+z에 원래 자리·소속으로, cmd+shift+z에 다시 F 안으로 간다", async () => {
    await boot();
    const f = ws().addFrameAt(0, 0);
    const a = addMemo(800, 800);
    await sleep(20);
    const frame = ws().cards.find((c) => c.id === f)!;
    const card = ws().cards.find((c) => c.id === a)!;
    const inX = frame.x + frame.width / 2 - card.width / 2;
    const inY = frame.y + (frame.height ?? 220) / 2 - (card.height ?? 100) / 2;
    expect(pos(a)).toEqual({ x: 800, y: 800, frameId: undefined });
    await readyCheck(SYSTEM_BOARD_ID);

    drag(a, inX, inY);
    expect(um().undoStack.length).toBe(1);
    expect(pos(a)).toEqual({ x: inX, y: inY, frameId: f });

    for (const v of variants) {
      expect(press(v.undo), v.name).toBe(true);
      expect(pos(a), v.name).toEqual({ x: 800, y: 800, frameId: undefined });
      expect(ws().cards.find((c) => c.id === a)?.frameId, v.name).toBeUndefined();
      expect(press(v.redo), v.name).toBe(true);
      expect(pos(a), v.name).toEqual({ x: inX, y: inY, frameId: f });
      expect(ws().cards.find((c) => c.id === a)?.frameId, v.name).toBe(f);
    }
  });
});

/* ── T7 ─────────────────────────────────────────────────────────── */

describe("T7 입력칸 포커스·펼친 메모 창이면 cmd+z가 캔버스를 바꾸지 않는다", () => {
  it("입력칸에 포커스가 있으면 X가 옮긴 자리에 그대로다", async () => {
    await boot();
    const x = addMemo(100, 100);
    await readyCheck(SYSTEM_BOARD_ID);
    drag(x, 400, 300);
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    expect(document.activeElement).toBe(input);

    expect(um().undoStack.length).toBeGreaterThanOrEqual(1);
    expect(press()).toBe(false); // 기본 동작(입력칸의 글자 되돌리기)에 맡긴다
    expect(pos(x)).toMatchObject({ x: 400, y: 300 });
    expect(um().undoStack.length).toBe(1);
  });

  it("펼친 메모 창을 열고 본문 밖을 눌렀으면 X가 옮긴 자리에 그대로다", async () => {
    await boot();
    const x = addMemo(100, 100);
    const y = addMemo(600, 100);
    await readyCheck(SYSTEM_BOARD_ID);
    drag(x, 400, 300);
    ws().setExpandedCard(y);
    (document.activeElement as HTMLElement | null)?.blur?.();
    expect(document.activeElement === document.body || document.activeElement === null).toBe(true);
    expect(ws().expandedCardId).toBe(y);

    expect(um().undoStack.length).toBeGreaterThanOrEqual(1);
    expect(press()).toBe(false);
    expect(pos(x)).toMatchObject({ x: 400, y: 300 });
    expect(um().undoStack.length).toBe(1);
  });
});

/* ── T11 ────────────────────────────────────────────────────────── */

describe("T11 펜 모드 안의 cmd+z는 마지막 획 하나만 지운다", () => {
  for (const v of [
    { name: "cmd+z", key: {} as KeyOpts },
    { name: "한글 입력기 cmd+z", key: { key: "ㅋ" } as KeyOpts },
  ]) {
    it(`${v.name}: 마지막 획만 사라지고 X는 그대로다`, async () => {
      await boot();
      const x = addMemo(100, 100);
      const s = addMemo(600, 100);
      await readyCheck(SYSTEM_BOARD_ID);
      drag(x, 400, 300);
      ws().setPenMode(true);
      ws().setOverlay(s, "stroke-1");
      ws().setOverlay(s, "stroke-1|stroke-2");
      expect(readNote(doc(), s)?.overlay).toBe("stroke-1|stroke-2");

      expect(um().undoStack.length).toBeGreaterThanOrEqual(1);
      expect(press(v.key)).toBe(true);
      expect(ws().cards.find((c) => c.id === s)?.overlay).toBe("stroke-1");
      expect(readNote(doc(), s)?.overlay).toBe("stroke-1");
      expect(pos(x)).toMatchObject({ x: 400, y: 300 });
      expect(ws().cards.find((c) => c.id === x)).toMatchObject({ x: 400, y: 300 });
    });
  }
});

/* ── T22 ────────────────────────────────────────────────────────── */

describe("T22 보드를 떠나면 그 보드 기록은 사라지고 섞이지 않는다", () => {
  it("Q의 cmd+z는 B만 되돌리고, P로 돌아온 cmd+z는 아무것도 바꾸지 않는다", async () => {
    await boot();
    const p = await ws().createBoard("P");
    const a = addMemo(100, 100);
    const q = await ws().createBoard("Q");
    const b = addMemo(100, 100);
    await flushAll();
    await ws().setCurrentBoard(p);
    await readyCheck(p);
    drag(a, 500, 500);
    await flushAll();

    await ws().setCurrentBoard(q);
    await readyCheck(q);
    drag(b, 700, 700);
    expect(pos(b)).toMatchObject({ x: 700, y: 700 });

    expect(press()).toBe(true);
    expect(pos(b)).toMatchObject({ x: 100, y: 100 });
    const pHandle = getOrOpenBoardDoc(p);
    await pHandle.whenLoaded;
    expect(readNote(pHandle.doc, a)).toMatchObject({ x: 500, y: 500 });

    await flushAll();
    await ws().setCurrentBoard(p);
    expect(ws().currentBoardId).toBe(p);
    expect(um().undoStack.length).toBe(0);
    press();
    expect(pos(a)).toMatchObject({ x: 500, y: 500 });
    expect(ws().cards.find((c) => c.id === a)).toMatchObject({ x: 500, y: 500 });
    expect(um().undoStack.length).toBe(0);
    expect(warnToasts()).toEqual([]);
  });

  it("보드 떠남: 펜 모드가 꺼진 채 묶음을 연 채 떠났다 오면 깊이 0·500이고 다음 동작 둘이 2단계다", async () => {
    await boot();
    const p = await ws().createBoard("P");
    const a = addMemo(100, 100);
    const q = await ws().createBoard("Q");
    await ws().setCurrentBoard(p);
    await readyCheck(p);
    expect(ws().penMode).toBe(false);

    const stale = beginUndoGroup();
    expect(getBoardUndoGroupState()).toEqual({ depth: 1, captureTimeout: Infinity });
    await ws().setCurrentBoard(q);
    await ws().setCurrentBoard(p);
    expect(getBoardUndoGroupState()).toEqual({ depth: 0, captureTimeout: 500 });

    endUndoGroup(stale); // 옛 토큰
    endUndoGroup(stale);
    expect(getBoardUndoGroupState()).toEqual({ depth: 0, captureTimeout: 500 });

    await readyCheck(p);
    drag(a, 300, 300);
    drag(a, 400, 400);
    expect(um().undoStack.length).toBe(2);
  });

  it("펜 모드: 켠 채 보드를 바꾸면 새 보드에서 펜 묶음 깊이 1, 옛 토큰 끝에도 1, 펜 두 획이 1단계다", async () => {
    await boot();
    const p = await ws().createBoard("P");
    const q = await ws().createBoard("Q");
    const s = addMemo(100, 100);
    await flushAll();
    await ws().setCurrentBoard(p);
    ws().setPenMode(true);
    expect(getBoardUndoGroupState()?.depth).toBe(1);
    const oldBoardToken = beginUndoGroup();

    await ws().setCurrentBoard(q);
    expect(ws().penMode).toBe(true);
    expect(getBoardUndoGroupState()).toEqual({ depth: 1, captureTimeout: Infinity });
    await readyCheck(q);

    endUndoGroup(oldBoardToken);
    expect(getBoardUndoGroupState()).toEqual({ depth: 1, captureTimeout: Infinity });

    ws().setOverlay(s, "stroke-1");
    await sleep(600);
    ws().setOverlay(s, "stroke-1|stroke-2");
    expect(um().undoStack.length).toBe(1);

    ws().setPenMode(false);
    expect(getBoardUndoGroupState()).toEqual({ depth: 0, captureTimeout: 500 });
  });
});

/* ── T23 ────────────────────────────────────────────────────────── */

describe("T23 새로고침하거나 보드를 막 열었을 때 cmd+z는 아무것도 바꾸지 않는다", () => {
  it("첫째: A를 옮긴 뒤 새로고침하면 A는 옮긴 자리에 그대로다", async () => {
    await boot();
    const p = await ws().createBoard("P");
    const a = addMemo(100, 100);
    drag(a, 450, 350);
    await flushAll();
    await sleep(50);

    // 새로고침 — 문서·기록을 닫고 저장소에서 다시 연다.
    await __resetBoardDocsForTest();
    useStorage.setState({ initialized: false, settings: null, quota: null });
    useWorkspace.setState({ cards: [], selectedIds: [], editingId: null, currentBoardId: p });
    await boot();

    expect(ws().currentBoardId).toBe(p);
    expect(press()).toBe(true);
    expect(pos(a)).toMatchObject({ x: 450, y: 350 });
    expect(um().undoStack.length).toBe(0);
    expect(warnToasts()).toEqual([]);
  });

  it("둘째: 빈 글상자가 남은 보드를 열면 정리되고, cmd+z가 되살리지 않는다", async () => {
    await boot();
    const q = await ws().createBoard("Q");
    await ws().setCurrentBoard(SYSTEM_BOARD_ID);
    const boxId = "empty-box-1";
    const now = Date.now();
    const note = {
      id: boxId,
      boardId: q,
      kind: "textbox" as const,
      x: 10,
      y: 10,
      width: 120,
      height: 40,
      rotation: 0,
      content: "",
      aiOptOut: false,
      createdAt: now,
      updatedAt: now,
      lastVisitedAt: now,
    };
    await useStorage.getState().saveNote(note);
    await writeNoteRecord(note);
    const qDoc = getOrOpenBoardDoc(q);
    await qDoc.whenLoaded;
    // 열기 직전: 미러와 문서에 있다.
    expect(await getDB().notes.get(boxId)).toBeDefined();
    expect(readNote(qDoc.doc, boxId)).toBeDefined();

    await ws().setCurrentBoard(q);
    // 연 뒤: 문서와 미러에서 사라졌다.
    expect(readNote(doc(), boxId)).toBeUndefined();
    expect(await getDB().notes.get(boxId)).toBeUndefined();

    press();
    expect(readNote(doc(), boxId)).toBeUndefined();
    expect(ws().cards.some((c) => c.id === boxId)).toBe(false);
    expect(um().undoStack.length).toBe(0);
    expect(warnToasts()).toEqual([]);
  });

  it("셋째: loadFromStorage로 연 시스템 보드의 시드가 cmd+z 뒤에도 모두 그대로다", async () => {
    await useStorage.getState().init();
    // 시드 조건 넷
    const sys = getOrOpenBoardDoc(SYSTEM_BOARD_ID);
    await sys.whenLoaded;
    expect(ws().currentBoardId).toBe(SYSTEM_BOARD_ID);
    expect(readNotes(sys.doc).length).toBe(0);
    expect(useStorage.getState().settings?.installPromptShown).toBeFalsy();
    expect(ws().migrationPending).toBe(false);

    await ws().loadFromStorage();
    const seedIds = __internal.SEED_CARDS.map((c) => c.id);
    expect(seedIds.length).toBeGreaterThan(0);
    for (const id of seedIds) expect(readNote(doc(), id)).toBeDefined();

    press();
    for (const id of seedIds) expect(readNote(doc(), id)).toBeDefined();
    expect(ws().cards.map((c) => c.id).sort()).toEqual([...seedIds].sort());
    expect(um().undoStack.length).toBe(0);
    expect(warnToasts()).toEqual([]);
  });

  it("빈 채로 마친 글상자 지우기(hardDeleteNote)는 기록에 들어가지 않는다", async () => {
    await boot();
    const id = ws().addCardAt("textbox", 0, 0);
    await sleep(20);
    await readyCheck(SYSTEM_BOARD_ID);
    expect(readNote(doc(), id)).toBeDefined();
    ws().hardDeleteNote(id);
    await sleep(50);
    expect(readNote(doc(), id)).toBeUndefined();
    expect(um().undoStack.length).toBe(0);
  });
});

/* ── 묶음 ───────────────────────────────────────────────────────── */

describe("묶음 API — 깊이·토큰·세대", () => {
  it("묶음 안에서 진입점 흉내를 두 번 부르고 써도 undoStack 1이다(묶음 없으면 2)", async () => {
    await boot();
    const a = addMemo(100, 100);
    await readyCheck(SYSTEM_BOARD_ID);

    const t = beginUndoGroup();
    entryMove(a, 200, 200);
    entryMove(a, 300, 300);
    endUndoGroup(t);
    expect(um().undoStack.length).toBe(1);

    entryMove(a, 400, 400);
    entryMove(a, 500, 500);
    expect(um().undoStack.length).toBe(3);
  });

  it("편집 묶음 안에서 드래그 묶음을 열고 닫아도 1단계다", async () => {
    await boot();
    const a = addMemo(100, 100);
    const b = addMemo(600, 100);
    await readyCheck(SYSTEM_BOARD_ID);

    const edit = beginUndoGroup();
    entryMove(a, 150, 150);
    drag(b, 650, 650);
    expect(getBoardUndoGroupState()).toEqual({ depth: 1, captureTimeout: Infinity });
    entryMove(a, 160, 160);
    endUndoGroup(edit);
    expect(getBoardUndoGroupState()).toEqual({ depth: 0, captureTimeout: 500 });
    expect(um().undoStack.length).toBe(1);

    undoBoard();
    expect(pos(a)).toMatchObject({ x: 100, y: 100 });
    expect(pos(b)).toMatchObject({ x: 600, y: 100 });
  });

  it("같은 토큰을 두 번 끝내도, 보드를 바꾼 뒤 옛 토큰으로 끝내도 깊이가 0 밑으로 안 간다", async () => {
    await boot();
    const q = await ws().createBoard("Q");
    await ws().setCurrentBoard(SYSTEM_BOARD_ID);

    const t = beginUndoGroup();
    endUndoGroup(t);
    endUndoGroup(t);
    expect(getBoardUndoGroupState()).toEqual({ depth: 0, captureTimeout: 500 });

    const old = beginUndoGroup();
    await ws().setCurrentBoard(q);
    endUndoGroup(old);
    expect(getBoardUndoGroupState()).toEqual({ depth: 0, captureTimeout: 500 });
  });

  it("새 보드에서 묶음을 연 채(깊이 1) 옛 보드 토큰으로 끝내도 깊이 1이다", async () => {
    await boot();
    const q = await ws().createBoard("Q");
    await ws().setCurrentBoard(SYSTEM_BOARD_ID);
    const old = beginUndoGroup();
    await ws().setCurrentBoard(q);
    const fresh = beginUndoGroup();
    expect(getBoardUndoGroupState()?.depth).toBe(1);
    endUndoGroup(old);
    expect(getBoardUndoGroupState()).toEqual({ depth: 1, captureTimeout: Infinity });
    endUndoGroup(fresh);
    expect(getBoardUndoGroupState()).toEqual({ depth: 0, captureTimeout: 500 });
  });

  it("묶음을 끝내지 않은 채 보드를 떠났다 돌아오면 깊이 0, captureTimeout 500이다", async () => {
    await boot();
    const q = await ws().createBoard("Q");
    await ws().setCurrentBoard(SYSTEM_BOARD_ID);
    beginUndoGroup();
    beginUndoGroup();
    expect(getBoardUndoGroupState()?.depth).toBe(2);
    await ws().setCurrentBoard(q);
    await ws().setCurrentBoard(SYSTEM_BOARD_ID);
    expect(getBoardUndoGroupState()).toEqual({ depth: 0, captureTimeout: 500 });
  });

  it("기록 안 하는 origin의 단계 열기는 단계를 가르지 않고, 그 쓰기는 기록에 안 들어간다", async () => {
    await boot();
    const a = addMemo(100, 100);
    await readyCheck(SYSTEM_BOARD_ID);
    entryMove(a, 200, 200);
    openUndoStep(UNTRACKED_ORIGIN);
    updateNoteField(doc(), a, "updatedAt", Date.now() + 1, UNTRACKED_ORIGIN);
    ws().moveCard(a, 210, 210);
    ws().commitMove([a]);
    expect(um().undoStack.length).toBe(1);
    expect(getBoardUndoGroupState()?.depth).toBe(0);
  });

  it(`기록은 ${UNDO_MAX_STEPS}단계까지만 쌓인다`, async () => {
    await boot();
    const a = addMemo(100, 100);
    await readyCheck(SYSTEM_BOARD_ID);
    for (let i = 1; i <= UNDO_MAX_STEPS + 1; i++) entryMove(a, 100 + i, 100);
    expect(um().undoStack.length).toBe(UNDO_MAX_STEPS);
  });

  it("남이 나중에 바꾼 단계는 건너뛰고 그 앞 단계가 되돌아가며, hook이 건너뛴 단계를 받는다", async () => {
    await boot();
    const a = addMemo(100, 100);
    const b = addMemo(600, 100);
    await readyCheck(SYSTEM_BOARD_ID);
    entryMove(a, 200, 200);
    entryMove(b, 700, 700);
    expect(um().undoStack.length).toBe(2);

    // 다른 기기가 B의 같은 칸을 나중에 바꾼다.
    const other = new Y.Doc();
    Y.applyUpdate(other, Y.encodeStateAsUpdate(doc()));
    const before = Y.encodeStateVector(other);
    other.transact(() => {
      updateNoteField(other, b, "x", 900);
      updateNoteField(other, b, "y", 900);
    }, "remote-peer");
    Y.applyUpdate(doc(), Y.encodeStateAsUpdate(other, before), "remote-peer");

    const skipped: number[] = [];
    const off = registerUndoStepHooks({ onSkipped: (items) => skipped.push(items.length) });
    const res = undoBoard();
    off();
    expect(res.applied).toBe(true);
    expect(res.skipped.length).toBe(1);
    expect(skipped).toEqual([1]);
    expect(pos(a)).toMatchObject({ x: 100, y: 100 });
    expect(pos(b)).toMatchObject({ x: 900, y: 900 });
    expect(um().undoStack.length).toBe(0);
  });

  it("isRemoteTransaction은 두 로컬 origin을 모두 로컬로 본다", () => {
    const d = new Y.Doc();
    const seen: boolean[] = [];
    d.on("afterTransaction", (tr: Y.Transaction) => seen.push(isRemoteTransaction(tr)));
    transactLocal(d, () => d.getMap("m").set("a", 1));
    transactLocal(d, () => d.getMap("m").set("a", 2), UNTRACKED_ORIGIN);
    d.transact(() => d.getMap("m").set("a", 3), "remote");
    expect(seen).toEqual([false, false, true]);
    expect(LOCAL_ORIGIN).not.toBe(UNTRACKED_ORIGIN);
  });
});

/* ── 탭 사이 방송 ─────────────────────────────────────────────────── */

describe("탭 사이 방송", () => {
  it("탭1 되돌리기가 탭2 문서에 반영되고, 그 뒤 탭1 쓰기도 탭2에 반영된다", async () => {
    const posted: YDocSyncMsg[] = [];
    class FakeChannel {
      constructor(public name: string) {}
      postMessage(msg: YDocSyncMsg) {
        posted.push(msg);
      }
      addEventListener() {}
      removeEventListener() {}
      close() {}
    }
    __resetLiveSyncForTest();
    vi.stubGlobal("BroadcastChannel", FakeChannel);

    await boot();
    const a = addMemo(100, 100);
    await sleep(20);

    // 탭2 — 같은 보드 문서를 가진 다른 Y.Doc. 방송받은 update만 이어 붙인다.
    const tab2 = new Y.Doc();
    Y.applyUpdate(tab2, Y.encodeStateAsUpdate(doc()));
    let delivered = 0;
    const deliver = () => {
      for (; delivered < posted.length; delivered++) {
        Y.applyUpdate(tab2, posted[delivered].update, "channel");
      }
    };
    await readyCheck(SYSTEM_BOARD_ID);

    drag(a, 300, 300);
    deliver();
    expect(readNote(tab2, a)).toMatchObject({ x: 300, y: 300 });

    expect(press()).toBe(true);
    expect(pos(a)).toMatchObject({ x: 100, y: 100 });
    deliver();
    expect(readNote(tab2, a)).toMatchObject({ x: 100, y: 100 });

    drag(a, 520, 520);
    deliver();
    expect(readNote(tab2, a)).toMatchObject({ x: 520, y: 520 });
    expect(tab2.store.pendingStructs).toBeNull();
  });

  it("기록 안 하는 origin 쓰기도 방송한다", async () => {
    const posted: YDocSyncMsg[] = [];
    class FakeChannel {
      postMessage(msg: YDocSyncMsg) {
        posted.push(msg);
      }
      addEventListener() {}
      removeEventListener() {}
      close() {}
    }
    __resetLiveSyncForTest();
    vi.stubGlobal("BroadcastChannel", FakeChannel);
    await boot();
    const a = addMemo(100, 100);
    await sleep(20);
    const n0 = posted.length;
    putNote(doc(), { ...readNote(doc(), a)!, x: 1 }, UNTRACKED_ORIGIN);
    expect(posted.length).toBe(n0 + 1);
  });
});
