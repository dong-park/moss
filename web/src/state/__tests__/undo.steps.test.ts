/**
 * cmd-z-undo n4 — 동작 하나가 기록 1단계이고, 남의 쓰기와 자동 쓰기는 기록에 안 들어간다.
 *
 * 캔버스 cmd+z 시험은 spec.md 「준비 확인」 공통 규칙을 따른다: 준비 → getter로 clear →
 * 실제 시간 0.6초 → 지금 보드와 undoStack 0 확인. then이 결과를 보는 내 탭 동작은 준비
 * 확인 뒤에 스토어 액션으로 한다. 가짜 타이머는 준비 확인 뒤에 setTimeout·clearTimeout·Date만
 * 바꿔 켠다(setImmediate는 Dexie가 쓴다).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// OPFS putBlob은 브라우저 전용 — 브리지 사진 명령용 스텁(mossBridge.test.ts와 같다).
vi.mock("@/state/db/opfs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/state/db/opfs")>();
  return { ...actual, putBlob: vi.fn(async (filename: string) => `opfs:${filename}`) };
});

import * as Y from "yjs";
import { useWorkspace, SYSTEM_BOARD_ID, __resetBoardDocsForTest, type Card } from "@/state/workspace";
import { useStorage } from "@/state/storage";
import { getDB, resetDB } from "@/state/db/schema";
import { flushAll } from "@/state/cardPersist";
import { getActiveBoardDoc, getOrOpenBoardDoc } from "@/state/ydoc/activeDoc";
import {
  deleteConnection,
  readBoard,
  readConnection,
  readDocFile,
  readNote,
  readNotes,
  updateNoteField,
} from "@/state/ydoc/model";
import { LOCAL_ORIGIN, UNTRACKED_ORIGIN } from "@/state/ydoc/origin";
import {
  beginUndoGroup,
  endUndoGroup,
  getBoardUndoGroupState,
  getBoardUndoManager,
} from "@/state/ydoc/undo";
import { __resetLiveSyncForTest } from "@/state/db/liveSync";
import { handleUndoKeyDown } from "@/components/workspace/undoKeys";
import { useToasts } from "@/state/notifications";
import { registerEditFlush } from "@/state/editFlush";
import { dispatchOp } from "@/state/bridge/mossBridge";
import { configureAttachments, resetAttachments, uploadAttachment } from "@/state/share/attachments";
import type { FilesApi } from "@/state/share/files";
import { useAuth } from "@/state/auth";
import type { AuthSession, BoardSummary } from "@/state/auth/types";
import { configureMembership, purgeLocalBoardCopy, resetMembershipDeps, syncMyBoards } from "@/state/membership";
import type { BoardMember, ShareApi } from "@/state/share";
import { resetShareStore } from "@/state/share/store";

const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

function makeToken(): string {
  const enc = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${enc({ alg: "HS256" })}.${enc({ exp: 9_999_999_999 })}.sig`;
}
const session: AuthSession = {
  accessToken: makeToken(),
  refreshToken: makeToken(),
  user: { id: "me", name: "동환", avatar: null },
};

let originalStorage: PropertyDescriptor | undefined;

beforeEach(() => {
  originalStorage = Object.getOwnPropertyDescriptor(navigator, "storage");
  Object.defineProperty(navigator, "storage", {
    value: {
      persist: vi.fn(async () => true),
      persisted: vi.fn(async () => false),
      estimate: vi.fn(async () => ({ usage: 0, quota: 1000 })),
      getDirectory: vi.fn(async () => ({ removeEntry: vi.fn(async () => {}) })),
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
  resetAttachments();
  resetMembershipDeps();
  resetShareStore();
  useAuth.setState({ session: null, user: null, status: "anonymous" });
  useStorage.setState({ initialized: false, settings: null, quota: null });
  useWorkspace.setState({
    cards: [],
    connections: [],
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
const note = (id: string) => readNote(doc(), id);
const fake = () => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });

async function boot() {
  await useStorage.getState().init();
  await ws().loadFromStorage();
}

/** 새 보드 P를 만들어 연다. */
async function bootBoard(name = "P"): Promise<string> {
  await boot();
  return ws().createBoard(name);
}

/** 준비 확인 — clear, 실제 시간 0.6초, 지금 보드와 undoStack 0. */
async function readyCheck(boardId: string) {
  um().clear();
  await sleep(600);
  expect(ws().currentBoardId).toBe(boardId);
  expect(getBoardUndoManager()).not.toBeNull();
  expect(um().undoStack.length).toBe(0);
}

/** T20 준비 확인 추가분 — 준비한 P 카드가 P 문서, 스토어 cards, 미러 notes에 모두 있다. */
async function cardsReady(ids: string[]) {
  for (const id of ids) {
    expect(note(id), `문서 ${id}`).toBeDefined();
    expect(ws().cards.some((c) => c.id === id), `스토어 ${id}`).toBe(true);
    expect(await getDB().notes.get(id), `미러 ${id}`).toBeDefined();
  }
}

/** 실제 시간 조건 대기 — 최대 2초 안에 서야 하고, 선 뒤 0.1초 더 기다린다. */
async function waitFor(cond: () => boolean | Promise<boolean>, label = "조건") {
  const start = Date.now();
  while (!(await cond())) {
    if (Date.now() - start > 2000) throw new Error(`${label}: 2초 안에 서지 않음`);
    await sleep(20);
  }
  await sleep(100);
}

function addMemo(x: number, y: number, kind: "text" | "textbox" = "text"): string {
  const id = ws().addCardAt(kind, x, y);
  useWorkspace.setState({ editingId: null, selectedIds: [] });
  return id;
}

/** 화면 드래그를 스토어 수준으로 — 묶음 안에서 moveCard·commitMove·resolveMembership. */
function drag(id: string, x: number, y: number) {
  const token = beginUndoGroup();
  ws().moveCard(id, x, y);
  ws().moveCard(id, x, y);
  ws().commitMove([id]);
  ws().resolveMembership([id]);
  endUndoGroup(token);
}

type KeyOpts = { key?: string; meta?: boolean; ctrl?: boolean; shift?: boolean };
function press(o: KeyOpts = {}) {
  return handleUndoKeyDown({
    key: o.key ?? "z",
    code: "KeyZ",
    metaKey: o.meta ?? !o.ctrl,
    ctrlKey: !!o.ctrl,
    shiftKey: !!o.shift,
  });
}

const card = (id: string): Card | undefined => ws().cards.find((c) => c.id === id);

async function connect(a: string, b: string): Promise<string> {
  const cid = ws().connectCards(a, "right", b, "left")!;
  await waitFor(
    async () => !!readConnection(doc(), cid) && !!(await getDB().connections.get(cid)),
    "준비 연결선",
  );
  return cid;
}

/* ── T4 ─────────────────────────────────────────────────────────── */

describe("T4 편집 중 cmd+z는 캔버스 기록을 바꾸지 않는다(캔버스 쪽)", () => {
  it("X를 옮긴 뒤 펼친 창에서 Y를 편집 중이면 cmd+z 3번에도 X는 옮긴 자리, 캔버스 기록 그대로다", async () => {
    await bootBoard();
    const x = addMemo(100, 100);
    const y = addMemo(600, 100);
    ws().setContent(y, "본문");
    await flushAll();
    await readyCheck(ws().currentBoardId);

    drag(x, 400, 300);
    ws().setExpandedCard(y);
    ws().setContent(y, "본문 끝");
    expect(um().undoStack.length).toBeGreaterThanOrEqual(1);
    const before = um().undoStack.length;
    for (let i = 0; i < 3; i++) expect(press({ ctrl: true })).toBe(false);
    expect(note(x)).toMatchObject({ x: 400, y: 300 });
    expect(note(y)?.content).toBe("본문 끝");
    expect(um().undoStack.length).toBe(before);
  });
});

/* ── T6 ─────────────────────────────────────────────────────────── */

describe("T6 단계 크기 — 동작 하나가 1단계, 기록 100단계", () => {
  it("첫째: 크기 조절 30번(묶음, 가짜 시계로 이동 사이 0.1초)이 1단계이고 cmd+z 1번에 원래 크기다", async () => {
    await bootBoard();
    const a = addMemo(100, 100);
    await flushAll();
    const w0 = card(a)!.width;
    await readyCheck(ws().currentBoardId);
    fake();
    const t = beginUndoGroup();
    for (let i = 1; i <= 30; i++) {
      ws().resizeCard(a, { width: w0 + i * 5, height: w0 + i * 5 });
      vi.advanceTimersByTime(100);
    }
    endUndoGroup(t);
    expect(note(a)?.width).toBe(w0 + 150);
    expect(um().undoStack.length).toBe(1);
    press();
    expect(note(a)?.width).toBe(w0);
  });

  it("둘째: 0.2초 안에 메모 2개를 addCardAt으로 만들면 cmd+z 1번에 두 번째만 사라진다", async () => {
    await bootBoard();
    await readyCheck(ws().currentBoardId);
    fake();
    const a = addMemo(100, 100);
    vi.advanceTimersByTime(100);
    const b = addMemo(400, 100);
    expect(um().undoStack.length).toBe(2);
    press();
    expect(note(a)).toBeDefined();
    expect(note(b)).toBeUndefined();
  });

  it("셋째: 판 배경을 높이가 줄어드는 사진으로 바꿔 멤버 소속이 풀려도 cmd+z 1번에 배경·높이·소속이 돌아간다", async () => {
    await bootBoard();
    const f = ws().addFrameAt(0, 0);
    ws().resizeFrame(f, { width: 320, height: 600 });
    const m = addMemo(100, 400);
    await flushAll();
    expect(note(m)?.frameId).toBe(f);
    const h0 = note(f)?.height;
    await readyCheck(ws().currentBoardId);
    fake();

    ws().setFrameBackground(f, { ref: "opfs:wide.png", mediaType: "image/png", w: 800, h: 400 });
    expect(note(f)?.height).toBeLessThan(h0!);
    expect(note(m)?.frameId).toBeUndefined();
    expect(note(f)?.attachmentRef).toBe("opfs:wide.png");
    expect(um().undoStack.length).toBe(1);
    press();
    expect(note(f)?.height).toBe(h0);
    expect(note(f)?.attachmentRef).toBeUndefined();
    expect(note(m)?.frameId).toBe(f);
  });

  it("넷째: 메모 101개를 만든 뒤 cmd+z 100번이면 1개가 남고 101번째 cmd+z는 아무것도 안 바꾼다", async () => {
    await bootBoard();
    await readyCheck(ws().currentBoardId);
    fake();
    const ids: string[] = [];
    for (let i = 0; i < 101; i++) {
      ids.push(addMemo(i * 10, 0));
      vi.advanceTimersByTime(10);
    }
    for (let i = 0; i < 100; i++) press();
    expect(readNotes(doc()).map((n) => n.id)).toEqual([ids[0]]);
    press();
    expect(readNotes(doc()).map((n) => n.id)).toEqual([ids[0]]);
  });
});

/* ── T8 ─────────────────────────────────────────────────────────── */

describe("T8 편집을 마치면 그 편집 전체가 1단계", () => {
  it("첫째: 펼친 창에서 1초씩 쉬며 두 번 치고 마치면 cmd+z 1번에 '할 일', cmd+shift+z 1번에 '할 일 하나 둘'", async () => {
    await bootBoard();
    const y = addMemo(100, 100);
    ws().setContent(y, "할 일");
    await flushAll();
    await readyCheck(ws().currentBoardId);
    fake();
    ws().setExpandedCard(y);
    ws().setContent(y, "할 일 하나");
    vi.advanceTimersByTime(1000);
    ws().setContent(y, "할 일 하나 둘");
    vi.advanceTimersByTime(1000);
    ws().setExpandedCard(null);
    expect(um().undoStack.length).toBe(1);
    press();
    expect(note(y)?.content).toBe("할 일");
    press({ shift: true });
    expect(note(y)?.content).toBe("할 일 하나 둘");
  });

  it("둘째: 창을 닫으면 편집기에 남은 본문을 묶음 안에서 내보낸 뒤 닫는다(flush 훅)", async () => {
    await bootBoard();
    const y = addMemo(100, 100);
    ws().setContent(y, "할 일");
    await flushAll();
    await readyCheck(ws().currentBoardId);
    fake();
    ws().setExpandedCard(y);
    ws().setContent(y, "할 일 하나");
    vi.advanceTimersByTime(1000);
    // 편집기 흉내: ' 둘'은 0.2초 디바운스에 남아 아직 문서에 안 썼다.
    let pending: string | null = "할 일 하나 둘";
    const off = registerEditFlush(() => {
      if (pending) ws().setContent(y, pending);
      pending = null;
    });
    // 창 닫기 — MemoExpandDialog close와 같은 순서.
    ws().commitTitle(y);
    ws().setExpandedCard(null);
    off();
    expect(note(y)?.content).toBe("할 일 하나 둘");
    expect(getBoardUndoGroupState()).toEqual({ depth: 0, captureTimeout: 500 });
    expect(um().undoStack.length).toBe(1);
    press();
    expect(note(y)?.content).toBe("할 일");
    press({ shift: true });
    expect(note(y)?.content).toBe("할 일 하나 둘");
  });

  it("셋째: 글상자 편집 중 자동 폭·높이 측정을 쓰기 사이마다 다른 값으로 불러도 1단계, cmd+z 1번에 '메모'", async () => {
    await bootBoard();
    const g = addMemo(100, 100, "textbox");
    ws().setContent(g, "메모");
    await flushAll();
    await readyCheck(ws().currentBoardId);
    fake();
    ws().setEditing(g);
    ws().setContent(g, "메모 하나");
    ws().setTextMeasuredWidth(g, 150);
    expect(note(g)?.width).toBe(150);
    ws().setFaceHeight(g, 44);
    expect(note(g)?.height).toBe(44);
    vi.advanceTimersByTime(1000);
    ws().setContent(g, "메모 하나 둘");
    ws().setTextMeasuredWidth(g, 170);
    expect(note(g)?.width).toBe(170);
    ws().setFaceHeight(g, 48);
    expect(note(g)?.height).toBe(48);
    vi.advanceTimersByTime(1000);
    ws().setEditing(null);
    expect(um().undoStack.length).toBe(1);
    press();
    expect(note(g)?.content).toBe("메모");
    press({ shift: true });
    expect(note(g)?.content).toBe("메모 하나 둘");
  });

  it("깊이 0 비동기 동작: 휴지통 살리기의 연결선 쓰기와 카드 쓰기 사이에 브리지 쓰기가 끼어도 1단계다", async () => {
    await bootBoard();
    const m = addMemo(100, 100);
    const n = addMemo(500, 100);
    const z = addMemo(900, 100);
    await flushAll();
    const cid = await connect(m, n);
    ws().remove(m);
    await waitFor(
      async () => !!(await getDB().trash.get(m)) && !!(await getDB().trashConnections.get(cid)),
      "휴지통 준비",
    );
    // 연결선은 아직 문서에 남는다(n5 전). 살리기가 다시 쓰도록 문서에서 뺀다.
    deleteConnection(doc(), cid, UNTRACKED_ORIGIN);
    await readyCheck(ws().currentBoardId);

    const seq: string[] = [];
    const onTx = (tr: Y.Transaction) => {
      const connMap: unknown = doc().getMap("connections");
      const conn = [...tr.changed.keys()].some((t) => (t as unknown) === connMap);
      const tag = tr.origin === LOCAL_ORIGIN ? "기록" : tr.origin === UNTRACKED_ORIGIN ? "기록 안 함" : "기타";
      seq.push(`${tag}:${conn ? "연결선" : "메모"}`);
      if (conn && tr.origin === LOCAL_ORIGIN) {
        queueMicrotask(() => void dispatchOp("notes.update", { id: z, content: "브리지" }));
      }
    };
    doc().on("afterTransaction", onTx);
    await ws().restoreFromTrash(m);
    doc().off("afterTransaction", onTx);

    expect(seq.slice(0, 3)).toEqual(["기록:연결선", "기록 안 함:메모", "기록:메모"]);
    expect(note(z)?.content).toBe("브리지");
    expect(note(m)).toBeDefined();
    expect(readConnection(doc(), cid)).toBeDefined();
    expect(um().undoStack.length).toBe(1);
  });

  it("원격 삭제: 편집 중 그 카드가 원격에서 지워지면 묶음 깊이 0이고 다음 동작 둘이 2단계다", async () => {
    await bootBoard();
    const a = addMemo(100, 100);
    const b = addMemo(500, 100);
    await flushAll();
    await readyCheck(ws().currentBoardId);
    ws().setExpandedCard(a);
    ws().setContent(a, "편집 중");
    expect(getBoardUndoGroupState()?.depth).toBe(1);

    const other = new Y.Doc();
    Y.applyUpdate(other, Y.encodeStateAsUpdate(doc()));
    const sv = Y.encodeStateVector(other);
    other.transact(() => other.getMap("notes").delete(a), "remote-peer");
    Y.applyUpdate(doc(), Y.encodeStateAsUpdate(other, sv), "remote-peer");

    expect(card(a)).toBeUndefined();
    expect(getBoardUndoGroupState()).toEqual({ depth: 0, captureTimeout: 500 });
    const n0 = um().undoStack.length;
    drag(b, 600, 600);
    drag(b, 700, 700);
    expect(um().undoStack.length).toBe(n0 + 2);
  });
});

/* ── T9 ─────────────────────────────────────────────────────────── */

describe("T9 편집을 마치자마자 cmd+z", () => {
  it("0.05초 안에 마쳐도 flush가 ' 수정'을 묶음 안에 쓰고, cmd+z 1번에 '초안', 0.5초 뒤에도 '초안'", async () => {
    await bootBoard();
    const y = addMemo(100, 100);
    ws().setContent(y, "초안");
    await flushAll();
    await readyCheck(ws().currentBoardId);
    fake();
    ws().setExpandedCard(y);
    // 편집기 흉내 — 마지막 키 0.2초 뒤 문서에 쓴다. 언마운트하면 남은 쓰기를 버린다.
    let timer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      timer = null;
      ws().setContent(y, "초안 수정");
    }, 200);
    const off = registerEditFlush(() => {
      if (!timer) return;
      clearTimeout(timer);
      timer = null;
      ws().setContent(y, "초안 수정");
    });
    vi.advanceTimersByTime(50);
    ws().setExpandedCard(null);
    off();
    if (timer) clearTimeout(timer);

    expect(um().undoStack.length).toBe(1);
    press();
    expect(note(y)?.content).toBe("초안");
    vi.advanceTimersByTime(500);
    expect(note(y)?.content).toBe("초안");
    press({ shift: true });
    expect(note(y)?.content).toBe("초안 수정");
  });
});

/* ── T10 ────────────────────────────────────────────────────────── */

describe("T10 펜 모드에서 그린 획 전부가 1단계", () => {
  it("획 3개를 긋고 나오면 cmd+z 1번에 모두 사라지고 cmd+shift+z 1번에 다시 보인다", async () => {
    await bootBoard();
    const y = addMemo(100, 100);
    await flushAll();
    await readyCheck(ws().currentBoardId);
    fake();
    ws().setPenMode(true);
    ws().setOverlay(y, "s1");
    vi.advanceTimersByTime(1000);
    ws().setOverlay(y, "s1|s2");
    vi.advanceTimersByTime(1000);
    ws().setOverlay(y, "s1|s2|s3");
    ws().setPenMode(false);
    expect(um().undoStack.length).toBe(1);
    press();
    expect(note(y)?.overlay ?? "").toBe("");
    press({ shift: true });
    expect(note(y)?.overlay).toBe("s1|s2|s3");
  });

  it("펜 모드를 켠 채 보드를 바꾸면 새 보드 깊이 1, 옛 토큰 끝이 와도 1, 펜 두 획이 1단계다", async () => {
    await boot();
    const p = await ws().createBoard("P");
    const q = await ws().createBoard("Q");
    const s = addMemo(100, 100);
    await flushAll();
    await ws().setCurrentBoard(p);
    ws().setPenMode(true);
    const old = beginUndoGroup();
    await ws().setCurrentBoard(q);
    expect(getBoardUndoGroupState()).toEqual({ depth: 1, captureTimeout: Infinity });
    await readyCheck(q);
    endUndoGroup(old);
    expect(getBoardUndoGroupState()?.depth).toBe(1);
    ws().setOverlay(s, "a");
    await sleep(600);
    ws().setOverlay(s, "a|b");
    expect(um().undoStack.length).toBe(1);
    ws().setPenMode(false);
  });
});

/* ── 진입점 ─────────────────────────────────────────────────────── */

type EntryCase = {
  name: string;
  prep: () => Promise<Record<string, string>>;
  run: (c: Record<string, string>) => unknown;
  /** await 뒤에 쓰는 진입점 — 그 동작이 낸 문서 변화. */
  late?: (c: Record<string, string>) => boolean | Promise<boolean>;
};

const memoPair = async () => {
  const a = addMemo(100, 100);
  const b = addMemo(600, 100);
  await flushAll();
  return { a, b };
};

const ENTRY_CASES: EntryCase[] = [
  { name: "addCardAt", prep: async () => ({}), run: () => ws().addCardAt("text", 10, 10) },
  {
    name: "addPhotoAt",
    prep: async () => ({}),
    run: () => ws().addPhotoAt(10, 10, { ref: "opfs:p.png", mediaType: "image/png", naturalW: 10, naturalH: 10 }),
  },
  { name: "addFrameAt", prep: async () => ({}), run: () => ws().addFrameAt(10, 10) },
  {
    name: "setFrameBackground",
    prep: async () => ({ f: ws().addFrameAt(0, 0) }),
    run: (c) => ws().setFrameBackground(c.f, { ref: "opfs:b.png", mediaType: "image/png", w: 400, h: 300 }),
  },
  {
    name: "clearFrameBackground",
    prep: async () => {
      const f = ws().addFrameAt(0, 0);
      ws().setFrameBackground(f, { ref: "opfs:b.png", mediaType: "image/png", w: 400, h: 300 });
      await flushAll();
      return { f };
    },
    run: (c) => ws().clearFrameBackground(c.f),
  },
  { name: "deleteFrame", prep: async () => ({ f: ws().addFrameAt(0, 0) }), run: (c) => ws().deleteFrame(c.f) },
  { name: "setContent", prep: memoPair, run: (c) => ws().setContent(c.a, "새 본문") },
  { name: "setTitle", prep: memoPair, run: (c) => ws().setTitle(c.a, "새 제목") },
  { name: "setMemoColor", prep: memoPair, run: (c) => ws().setMemoColor([c.a], "blue") },
  {
    name: "connectCards",
    prep: memoPair,
    run: (c) => ws().connectCards(c.a, "right", c.b, "left"),
    late: (c) => readConnectionsOf(c.a, c.b).length === 1,
  },
  {
    name: "setConnectionLabel",
    prep: async () => {
      const p = await memoPair();
      return { ...p, cid: await connect(p.a, p.b) };
    },
    run: (c) => ws().setConnectionLabel(c.cid, "이유"),
    late: (c) => readConnection(doc(), c.cid)?.label === "이유",
  },
  {
    name: "removeConnection",
    prep: async () => {
      const p = await memoPair();
      return { ...p, cid: await connect(p.a, p.b) };
    },
    run: (c) => ws().removeConnection(c.cid),
    late: (c) => !readConnection(doc(), c.cid),
  },
  { name: "remove", prep: memoPair, run: (c) => ws().remove(c.a) },
  { name: "removeSelected", prep: memoPair, run: (c) => ws().removeSelected([c.a, c.b]) },
  {
    name: "restoreFromTrash",
    prep: async () => {
      const p = await memoPair();
      const cid = await connect(p.a, p.b);
      ws().remove(p.a);
      await waitFor(async () => !!(await getDB().trash.get(p.a)), "휴지통");
      deleteConnection(doc(), cid, UNTRACKED_ORIGIN);
      return { ...p, cid };
    },
    run: (c) => ws().restoreFromTrash(c.a),
    late: (c) => !!note(c.a) && !!readConnection(doc(), c.cid),
  },
  {
    name: "commitMove(움직인 카드)",
    prep: memoPair,
    run: (c) => {
      ws().moveCard(c.a, 300, 300);
      ws().commitMove([c.a]);
    },
  },
  {
    name: "resolveMembership(소속이 바뀌는 카드)",
    prep: async () => {
      const f = ws().addFrameAt(0, 0);
      const a = addMemo(800, 800);
      await flushAll();
      ws().moveCard(a, 20, 20);
      return { f, a };
    },
    run: (c) => ws().resolveMembership([c.a]),
  },
  {
    name: "resizeCard(크기가 바뀌는 입력)",
    prep: memoPair,
    run: (c) => ws().resizeCard(c.a, { width: 300, height: 300 }),
  },
  {
    name: "moveSelectedBy",
    prep: async () => {
      const p = await memoPair();
      useWorkspace.setState({ selectedIds: [p.a, p.b] });
      return p;
    },
    run: () => ws().moveSelectedBy(30, 30),
  },
  {
    name: "setTextWidth",
    prep: async () => {
      const g = addMemo(100, 100, "textbox");
      await flushAll();
      return { g };
    },
    run: (c) => ws().setTextWidth(c.g, 300),
  },
];

function readConnectionsOf(a: string, b: string) {
  return [...doc().getMap("connections").keys()]
    .map((k) => readConnection(doc(), k))
    .filter((c) => c && c.sourceNoteId === a && c.targetNoteId === b);
}

describe("진입점 — 정상 입력 한 번에 undoStack이 정확히 1 는다", () => {
  for (const c of ENTRY_CASES) {
    it(`${c.name}: undoStack +1`, async () => {
      await bootBoard();
      const before = addMemo(2000, 2000);
      const ctx = await c.prep();
      await flushAll();
      await readyCheck(ws().currentBoardId);
      // 바로 앞(0.5초 안)의 기록 쓰기 1단계. 단계를 닫지 않는 쓰기라, 진입점이 단계를
      // 열지 않으면 진입점의 쓰기가 여기에 합쳐져 길이가 1에 머문다.
      updateNoteField(doc(), before, "x", 2100, LOCAL_ORIGIN);
      expect(um().undoStack.length).toBe(1);
      await c.run(ctx);
      if (c.late) await waitFor(() => c.late!(ctx), `${c.name} 문서 변화`);
      expect(um().undoStack.length).toBe(2);
    });
  }

  it("함 만들기(createSubcanvas)와 함 카드 삭제(remove·removeSelected)는 undoStack을 바꾸지 않는다", async () => {
    await bootBoard();
    const m = addMemo(500, 500);
    await flushAll();
    await readyCheck(ws().currentBoardId);
    const h1 = ws().createSubcanvas(10, 10);
    const h2 = ws().createSubcanvas(300, 10);
    await waitFor(() => !!note(h1) && !!note(h2), "함 카드");
    expect(um().undoStack.length).toBe(0);
    await flushAll();
    ws().remove(h1, { deleteConfirmed: true });
    expect(note(h1)).toBeUndefined();
    expect(um().undoStack.length).toBe(0);
    ws().removeSelected([h2, m], { deleteConfirmed: true });
    expect(note(h2)).toBeUndefined();
    expect(note(m)).toBeUndefined();
    // 일반 메모 지우기만 1단계다.
    expect(um().undoStack.length).toBe(1);
    press();
    expect(note(m)).toBeDefined();
    expect(note(h2)).toBeUndefined();
  });
});

/* ── T20 ────────────────────────────────────────────────────────── */

function fakeShareApi(myBoards: BoardSummary[]): ShareApi {
  return {
    share: vi.fn(async () => ({ id: "x", name: "x", role: "owner", ownerName: "동환" }) as BoardSummary),
    boardToken: vi.fn(async () => ({ boardToken: "bt", expiresInSeconds: 3600 })),
    unshare: vi.fn(async () => undefined),
    reissueInvite: vi.fn(async () => "tok"),
    removeMember: vi.fn(async () => undefined),
    members: vi.fn(async () => [] as BoardMember[]),
    myBoards: vi.fn(async () => myBoards),
    usage: vi.fn(async () => ({ boards: 0, maxBoards: 100, fileBytes: 0, maxFileBytes: 1024 ** 3 })),
  } as ShareApi;
}

function signIn() {
  useAuth.setState({
    session,
    user: session.user,
    status: "authenticated",
    hydrated: true,
    hydrating: false,
  });
}

describe("T20 자동 측정·수정 시각·파일 매핑·보드 이름·보드 사이 옮기기·브리지·멤버십은 기록에 안 들어간다", () => {
  it("첫째: 측정 6번·수정 시각만 쓰기·files 맵·보드 이름·Q로 옮기기 뒤 단계 0, cmd+z 뒤 그대로", async () => {
    await boot();
    const q = await ws().createBoard("Q");
    const p = await ws().createBoard("P");
    const f = ws().addFrameAt(0, 400);
    const x = addMemo(40, 100);
    const t = addMemo(800, 100, "textbox");
    const k = addMemo(800, 600);
    await flushAll();
    expect(note(x)?.frameId).toBeUndefined();
    await readyCheck(p);
    await cardsReady([f, x, t, k]);
    const upload = vi.fn(async () => ({ id: "f-1", name: "a.png", size: 1, contentType: "image/png" }));
    configureAttachments({ files: { upload, download: vi.fn() } as unknown as FilesApi });
    signIn();
    fake();

    for (const h of [300, 400, 700]) {
      ws().setFaceHeight(x, h);
      expect(note(x)?.height).toBe(h);
      vi.advanceTimersByTime(100);
    }
    expect(note(x)?.frameId).toBe(f); // 길어진 X의 중심이 F 안으로 들어왔다.
    for (const w of [150, 160, 170]) {
      ws().setTextMeasuredWidth(t, w);
      expect(note(t)?.width).toBe(w);
      vi.advanceTimersByTime(100);
    }
    const stamp0 = note(k)!.updatedAt;
    vi.advanceTimersByTime(1000);
    ws().setContent(k, card(k)!.content); // 바뀐 칸 없는 카드 쓰기
    expect(note(k)!.updatedAt).toBeGreaterThan(stamp0);
    await uploadAttachment(p, "opfs:a.png", new Blob([new Uint8Array([1])]), "a.png");
    expect(readDocFile(doc(), "opfs:a.png")).toBe("f-1");
    await ws().renameBoard(p, "새 이름");
    expect(readBoard(doc()).name).toBe("새 이름");
    await ws().moveCardToBoard(k, q);
    expect(note(k)).toBeUndefined();
    const qDoc = getOrOpenBoardDoc(q);
    await qDoc.whenLoaded;
    expect(readNote(qDoc.doc, k)).toBeDefined();

    expect(um().undoStack.length).toBe(0);
    press();
    expect(note(x)).toMatchObject({ height: 700, frameId: f });
    expect(note(t)?.width).toBe(170);
    expect(note(k)).toBeUndefined();
    expect(readNote(qDoc.doc, k)).toBeDefined();
    expect(um().undoStack.length).toBe(0);
  });

  it("둘째: 시스템 보드 P에 브리지가 메모 1개 쓰고 1개 지우고, 멤버십이 함 카드 1개 쓰고 1개 지워도 단계 0", async () => {
    await boot();
    const del = addMemo(900, 900);
    await flushAll();
    await readyCheck(SYSTEM_BOARD_ID);
    await cardsReady([del]);
    signIn();
    configureMembership({
      api: fakeShareApi([{ id: "s9", name: "공유", role: "editor", ownerName: "남" }]),
      deleteDoc: vi.fn(async () => {}),
      uploadDoc: vi.fn(async () => {}),
      notify: () => {},
    });
    fake();

    const made = (await dispatchOp("notes.create", { content: "브리지 메모", x: 10, y: 10 })) as { id: string };
    expect(note(made.id)?.content).toBe("브리지 메모");
    await dispatchOp("notes.delete", { id: del });
    expect(note(del)).toBeUndefined();
    await syncMyBoards();
    const box = () => readNotes(doc()).filter((n) => n.kind === "board");
    expect(box().length).toBe(1);
    await purgeLocalBoardCopy("s9");
    expect(box().length).toBe(0);

    expect(um().undoStack.length).toBe(0);
    const ids = ws().cards.map((c) => c.id).sort();
    press();
    expect(note(made.id)).toBeDefined();
    expect(note(del)).toBeUndefined();
    expect(box().length).toBe(0);
    expect(ws().cards.map((c) => c.id).sort()).toEqual(ids);
  });

  it("셋째: Y 편집 사이에 브리지가 Z를 고쳐도 편집이 1단계, cmd+z 1번에 Y만 편집 전 글이고 Z는 브리지 값이다", async () => {
    await bootBoard();
    const y = addMemo(100, 100);
    const z = addMemo(600, 100);
    ws().setContent(y, "Y 원문");
    ws().setContent(z, "Z 원문");
    await flushAll();
    await readyCheck(ws().currentBoardId);
    await cardsReady([y, z]);
    fake();
    ws().setExpandedCard(y);
    ws().setContent(y, "Y 하나");
    vi.advanceTimersByTime(1000);
    await dispatchOp("notes.update", { id: z, content: "Z 브리지" });
    expect(note(z)?.content).toBe("Z 브리지");
    vi.advanceTimersByTime(1000);
    ws().setContent(y, "Y 하나 둘");
    ws().setExpandedCard(null);
    expect(um().undoStack.length).toBe(1);
    press();
    expect(note(y)?.content).toBe("Y 원문");
    expect(note(z)?.content).toBe("Z 브리지");
  });

  it("넷째: 브리지가 메모를 만들고 글·크기·자리를 바꾸고 다른 메모를 지워도 단계 0", async () => {
    await bootBoard();
    const other = addMemo(900, 900);
    await flushAll();
    await readyCheck(ws().currentBoardId);
    await cardsReady([other]);
    fake();
    const { id } = (await dispatchOp("notes.create", { content: "처음", x: 10, y: 10 })) as { id: string };
    expect(note(id)?.content).toBe("처음");
    await dispatchOp("notes.update", { id, content: "고침" });
    expect(note(id)?.content).toBe("고침");
    await dispatchOp("notes.update", { id, width: 360, height: 360, x: 50, y: 60 });
    expect(note(id)).toMatchObject({ width: 360, height: 360, x: 50, y: 60 });
    await dispatchOp("notes.delete", { id: other });
    expect(note(other)).toBeUndefined();
    expect(um().undoStack.length).toBe(0);
    press();
    expect(note(id)).toMatchObject({ content: "고침", width: 360, x: 50 });
    expect(note(other)).toBeUndefined();
  });

  it("다섯째: 브리지가 사진·판을 만들고 두 메모를 잇고 기존 연결선을 지워도 단계 0, 지운 선은 cmd+z로 안 돌아온다", async () => {
    await bootBoard();
    const a = addMemo(100, 100);
    const b = addMemo(500, 100);
    const d = addMemo(100, 600);
    const e = addMemo(500, 600);
    await flushAll();
    const old = await connect(a, b);
    await readyCheck(ws().currentBoardId);
    await cardsReady([a, b, d, e]);
    // 브리지 호출 직전: 기존 연결선이 P 문서와 미러 connections에 있다.
    expect(readConnection(doc(), old)).toBeDefined();
    expect(await getDB().connections.get(old)).toBeDefined();

    const photo = (await dispatchOp("photos.create", { dataBase64: PNG_B64, mimeType: "image/png", x: 900, y: 100 })) as { id: string };
    const frame = (await dispatchOp("frames.create", { x: 900, y: 600 })) as { id: string };
    const made = (await dispatchOp("connections.create", { sourceNoteId: d, targetNoteId: e })) as { id: string };
    await dispatchOp("connections.delete", { id: old });
    await waitFor(
      () =>
        note(photo.id)?.kind === "photo" &&
        note(frame.id)?.kind === "frame" &&
        !!readConnection(doc(), made.id) &&
        !readConnection(doc(), old),
      "다섯째 기대 변화",
    );
    expect(um().undoStack.length).toBe(0);
    press();
    expect(readConnection(doc(), old)).toBeUndefined();
    expect(readConnection(doc(), made.id)).toBeDefined();
    expect(note(photo.id)).toBeDefined();
    expect(note(frame.id)).toBeDefined();
    expect(um().undoStack.length).toBe(0);
  });
});

/* ── T20 여섯째: 브리지 명령 경우 표 ─────────────────────────────── */

type BridgeCase = {
  no: string;
  prep: () => Promise<Record<string, string>>;
  /** 준비 확인에 더할 단언(닫힌 목록 첫째의 "동작 직전에 대상이 있다" 포함). */
  pre?: (c: Record<string, string>) => Promise<void> | void;
  call: (c: Record<string, string>) => Promise<unknown>;
  /** 기대한 P 문서 변화가 모두 보이는가. */
  changed: (c: Record<string, string>, r: unknown) => boolean;
  /** 준비 확인에서 P 카드로 볼 id(문서·스토어·미러). */
  cards?: (c: Record<string, string>) => string[];
};

const idOf = (r: unknown) => (r as { id: string }).id;

const BRIDGE_CASES: BridgeCase[] = [
  {
    no: "6-1 notes.create content·title·color·rotation",
    prep: async () => ({}),
    call: () => dispatchOp("notes.create", { content: "본문", title: "제목", color: "blue", rotation: 5 }),
    changed: (_c, r) => {
      const n = note(idOf(r));
      return n?.content === "본문" && n.title === "제목" && n.color === "blue" && n.rotation === 5;
    },
  },
  {
    no: "6-2 notes.update content",
    prep: async () => ({ m: addMemo(100, 100) }),
    cards: (c) => [c.m],
    call: (c) => dispatchOp("notes.update", { id: c.m, content: "새 글" }),
    changed: (c) => note(c.m)?.content === "새 글",
  },
  {
    no: "6-3 notes.update title",
    prep: async () => ({ m: addMemo(100, 100) }),
    cards: (c) => [c.m],
    call: (c) => dispatchOp("notes.update", { id: c.m, title: "새 제목" }),
    changed: (c) => note(c.m)?.title === "새 제목",
  },
  {
    no: "6-4 notes.update width·height",
    prep: async () => ({ m: addMemo(100, 100) }),
    cards: (c) => [c.m],
    call: (c) => dispatchOp("notes.update", { id: c.m, width: 360, height: 360 }),
    changed: (c) => note(c.m)?.width === 360 && note(c.m)?.height === 360,
  },
  {
    no: "6-5 notes.delete 연결선 붙은 일반 메모",
    prep: async () => {
      const m5 = addMemo(100, 100);
      const o = addMemo(600, 100);
      await flushAll();
      return { m5, o, cid: await connect(m5, o) };
    },
    cards: (c) => [c.m5, c.o],
    pre: (c) => {
      expect(readConnection(doc(), c.cid)).toBeDefined();
    },
    call: (c) => dispatchOp("notes.delete", { id: c.m5 }),
    // n5: ws.remove가 닿은 연결선을 같은 트랜잭션으로 P 문서에서 지운다(바깥 origin을 따른다).
    changed: (c) => !note(c.m5) && !readConnection(doc(), c.cid),
  },
  {
    no: "6-6 notes.delete 사진 카드",
    prep: async () => {
      const ph = ws().addPhotoAt(100, 100, { ref: "opfs:p.png", mediaType: "image/png", naturalW: 10, naturalH: 10 });
      return { ph };
    },
    cards: (c) => [c.ph],
    call: (c) => dispatchOp("notes.delete", { id: c.ph }),
    changed: (c) => !note(c.ph),
  },
  {
    no: "6-7 notes.delete 멤버 1개가 든 판",
    prep: async () => {
      const f = ws().addFrameAt(0, 0);
      const m = addMemo(20, 20);
      return { f, m };
    },
    cards: (c) => [c.f, c.m],
    pre: (c) => {
      expect(note(c.m)?.frameId).toBe(c.f);
    },
    call: (c) => dispatchOp("notes.delete", { id: c.f }),
    changed: (c) => !note(c.f) && !!note(c.m) && note(c.m)!.frameId === undefined,
  },
  {
    no: "6-8 photos.create",
    prep: async () => ({}),
    call: () => dispatchOp("photos.create", { dataBase64: PNG_B64, mimeType: "image/png", x: 10, y: 10 }),
    changed: (_c, r) => note(idOf(r))?.kind === "photo",
  },
  {
    no: "6-9 frames.create",
    prep: async () => ({}),
    call: () => dispatchOp("frames.create", { x: 10, y: 10 }),
    changed: (_c, r) => note(idOf(r))?.kind === "frame",
  },
  {
    no: "6-10 notes.createBoard",
    prep: async () => ({}),
    call: () => dispatchOp("notes.createBoard", { x: 10, y: 10 }),
    changed: (_c, r) => note(idOf(r))?.kind === "board",
  },
  {
    no: "6-11 connections.create label, 양 끝 P",
    prep: async () => ({ s: addMemo(100, 100), t: addMemo(600, 100) }),
    cards: (c) => [c.s, c.t],
    call: (c) => dispatchOp("connections.create", { sourceNoteId: c.s, targetNoteId: c.t, label: "까닭" }),
    changed: (_c, r) => readConnection(doc(), idOf(r))?.label === "까닭",
  },
  {
    no: "6-12 connections.create, target은 다른 보드 Q",
    prep: async () => {
      // 이 경우만 Q를 먼저 만들어 target 메모를 둔 뒤 P로 돌아온다.
      const p = ws().currentBoardId;
      const q = await ws().createBoard("Q");
      const t = addMemo(100, 100);
      await flushAll();
      await ws().setCurrentBoard(p);
      const s = addMemo(100, 100);
      return { s, t, q };
    },
    cards: (c) => [c.s],
    pre: async (c) => {
      expect(ws().cards.some((x) => x.id === c.t)).toBe(false);
      expect(await getDB().notes.get(c.t)).toBeDefined();
    },
    call: (c) => dispatchOp("connections.create", { sourceNoteId: c.s, targetNoteId: c.t }),
    changed: (_c, r) => !!readConnection(doc(), idOf(r)),
  },
  {
    no: "6-13 connections.delete",
    prep: async () => {
      const s = addMemo(100, 100);
      const t = addMemo(600, 100);
      await flushAll();
      return { s, t, cid: await connect(s, t) };
    },
    cards: (c) => [c.s, c.t],
    pre: async (c) => {
      expect(readConnection(doc(), c.cid)).toBeDefined();
      expect(await getDB().connections.get(c.cid)).toBeDefined();
    },
    call: (c) => dispatchOp("connections.delete", { id: c.cid }),
    changed: (c) => !readConnection(doc(), c.cid),
  },
];

describe("T20 여섯째 — 브리지 명령 13경우: 호출 성공·P 문서 바뀜·P undoStack 그대로", () => {
  for (const c of BRIDGE_CASES) {
    it(c.no, async () => {
      const p = await bootBoard();
      const ctx = await c.prep();
      await flushAll();
      await readyCheck(p);
      await cardsReady(c.cards?.(ctx) ?? []);
      await c.pre?.(ctx);

      let result: unknown;
      let threw: unknown = null;
      try {
        result = await c.call(ctx);
      } catch (err) {
        threw = err;
      }
      expect(threw, "호출 성공").toBeNull();
      await waitFor(() => c.changed(ctx, result), `${c.no} 기대 변화`);
      expect(c.changed(ctx, result), "P 문서 바뀜").toBe(true);
      expect(um().undoStack.length, "P undoStack 그대로").toBe(0);
    });
  }
});
