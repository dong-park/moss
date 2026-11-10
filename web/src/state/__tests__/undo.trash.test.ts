/**
 * cmd-z-undo n5 — 되돌리기와 휴지통·미러·공유 보드를 맞춘다(T12, T13, T14, T15 첫째·셋째·넷째·다섯째,
 * T21, T24, T25, 코드 리뷰 웨이브 2 F1).
 *
 * 캔버스 cmd+z 시험은 spec.md 「준비 확인」 공통 규칙을 따른다: 준비 → getter로 clear → 실제 시간
 * 0.6초 → 지금 보드와 undoStack 0. then이 결과를 보는 내 탭 동작(지웠다·살렸다·옮겼다·바꿨다)은
 * 준비 확인 뒤에 스토어 액션으로 한다. 다른 탭·다른 기기의 동작은 그쪽 Y.Doc에서 하고 update로
 * 이어 붙인다. 가짜 타이머는 준비 확인 뒤 setTimeout·clearTimeout·Date만 바꿔 켠다.
 * 다른 기기 E의 휴지통을 보는 경우는 이 앱을 E로 두고, 나를 Y.Doc과 그 기록 장치로 흉내 낸다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import {
  CARD_MAX_WIDTH,
  runAsUserAction,
  useWorkspace,
  __resetBoardDocsForTest,
  __trashIdleForTest,
} from "@/state/workspace";
import { useStorage } from "@/state/storage";
import { getDB } from "@/state/db/schema";
import { flushAll } from "@/state/cardPersist";
import {
  deleteConnection,
  putConnection,
  putNote,
  readConnection,
  readNote,
  updateNoteFields,
} from "@/state/ydoc/model";
import { UNTRACKED_ORIGIN } from "@/state/ydoc/origin";
import { beginUndoGroup, endUndoGroup } from "@/state/ydoc/undo";
import { __resetLiveSyncForTest, type YDocSyncMsg } from "@/state/db/liveSync";
import { docKeyForBoard } from "@/state/ydoc/activeDoc";
import { useToasts } from "@/state/notifications";
import { useMemoTable } from "@/state/memoTable";
import {
  addMemo,
  bootBoard,
  doc,
  note,
  pressUndo,
  readyCheck,
  setupNavigatorStorage,
  sleep,
  teardown,
  um,
  waitFor,
  ws,
} from "@/components/workspace/__tests__/undoTestKit";

beforeEach(() => {
  setupNavigatorStorage();
  useToasts.getState().clear();
});

afterEach(async () => {
  await __trashIdleForTest();
  vi.unstubAllGlobals();
  await teardown();
});

/* ── 도우미 ─────────────────────────────────────────────────────── */

const fake = () => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
const idle = () => __trashIdleForTest();
const has = (id: string) => ws().cards.some((c) => c.id === id);
const count = (id: string) => ws().cards.filter((c) => c.id === id).length;
const drawn = (cid: string) => ws().connections.some((c) => c.id === cid);
const trashIds = async () => (await getDB().trash.toArray()).map((e) => e.id).sort();
const trashConnIds = async () => (await getDB().trashConnections.toArray()).map((c) => c.id).sort();
const pos = (id: string) => ({ x: note(id)?.x, y: note(id)?.y });

/** 실제 시간 2초 안에 서야 하는 조건 대기. setImmediate로 돌아 가짜 타이머 아래서도 쓴다. */
async function settle(cond: () => boolean | Promise<boolean>, label: string) {
  const start = performance.now();
  while (!(await cond())) {
    if (performance.now() - start > 2000) throw new Error(`${label}: 2초 안에 서지 않음`);
    await new Promise((r) => setImmediate(r));
  }
}

async function connect(a: string, b: string): Promise<string> {
  const cid = ws().connectCards(a, "right", b, "left")!;
  await waitFor(
    async () => !!readConnection(doc(), cid) && !!(await getDB().connections.get(cid)),
    "준비 연결선",
  );
  return cid;
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

/** 새로고침 — 문서·기록을 닫고 저장소에서 다시 연다. */
async function reload(boardId: string) {
  await idle();
  await flushAll();
  await sleep(50);
  await __resetBoardDocsForTest();
  useStorage.setState({ initialized: false, settings: null, quota: null });
  useWorkspace.setState({ cards: [], connections: [], selectedIds: [], editingId: null, currentBoardId: boardId });
  await useStorage.getState().init();
  await ws().loadFromStorage();
  expect(ws().currentBoardId).toBe(boardId);
}

/** 다른 기기·다른 탭 — 지금 보드 문서를 받아 둔 Y.Doc. */
function peer(): Y.Doc {
  const d = new Y.Doc();
  Y.applyUpdate(d, Y.encodeStateAsUpdate(doc()));
  return d;
}

/** 그쪽의 새 쓰기를 내 문서에 이어 붙인다(원격 origin). */
function pushFrom(d: Y.Doc) {
  Y.applyUpdate(doc(), Y.encodeStateAsUpdate(d, Y.encodeStateVector(doc())), "remote-peer");
}

/** 내 새 쓰기를 그쪽 문서에 이어 붙인다. */
function pullInto(d: Y.Doc) {
  Y.applyUpdate(d, Y.encodeStateAsUpdate(doc(), Y.encodeStateVector(d)), "remote-peer");
}

/** 그쪽 Y.Doc의 기록 장치 — origin "me" 쓰기만 기록한다. */
function peerUndo(d: Y.Doc) {
  return new Y.UndoManager([d.getMap("notes"), d.getMap("connections")], {
    trackedOrigins: new Set<unknown>(["me"]),
  });
}

/* ── T12 ────────────────────────────────────────────────────────── */

describe("T12 지운 메모 2개를 되돌리면 메모와 연결선이 돌아오고 휴지통은 비어 있다", () => {
  it("첫째: 함께 지운 A·B를 cmd+z 1번에 되돌리면 자리·연결선이 돌아오고 휴지통 두 표가 0행, 새로고침 뒤에도 같다", async () => {
    const p = await bootBoard();
    const a = addMemo(100, 100);
    const b = addMemo(600, 100);
    await flushAll();
    const cid = await connect(a, b);
    await readyCheck(p);

    ws().removeSelected([a, b]);
    await settle(async () => (await trashIds()).length === 2, "휴지통 2개");
    expect(readConnection(doc(), cid)).toBeUndefined();

    expect(pressUndo()).toBe(true);
    // 미러 쓰기(0.3초)를 기다리지 않고 cmd+z 직후의 휴지통 쓰기만 기다려 잰다.
    await idle();
    expect(pos(a)).toEqual({ x: 100, y: 100 });
    expect(pos(b)).toEqual({ x: 600, y: 100 });
    expect(readConnection(doc(), cid)).toBeDefined();
    expect(drawn(cid)).toBe(true);
    expect(ws().connections).toHaveLength(1);
    expect(await trashIds()).toEqual([]);
    expect(await trashConnIds()).toEqual([]);

    await reload(p);
    expect(has(a) && has(b)).toBe(true);
    expect(drawn(cid)).toBe(true);
    expect(await getDB().trash.count()).toBe(0);
    expect(await getDB().trashConnections.count()).toBe(0);
  });

  it("둘째: 공유 보드의 다른 기기 E에도 A·B·연결선이 보이고 E의 휴지통 표와 연결선 휴지통 표는 0행", async () => {
    // 이 앱이 E다. 나는 같은 보드 문서를 가진 Y.Doc과 그 기록 장치다.
    const p = await bootBoard();
    const a = addMemo(100, 100);
    const b = addMemo(600, 100);
    await flushAll();
    const cid = await connect(a, b);
    await readyCheck(p);
    const me = peer();
    const meUm = peerUndo(me);
    // 연결선을 내 기기가 다시 쓴 항목으로 둔다. 되돌리기가 연결선을 메모보다 먼저 되살려, E의
    // 연결선 반영이 카드 반영보다 먼저 돈다(실패 모드 18).
    const conn = readConnection(doc(), cid)!;
    me.transact(() => {
      me.getMap("connections").delete(cid);
      putConnection(me, conn);
    }, "setup");
    pushFrom(me);
    expect(drawn(cid)).toBe(true);

    // 내가 A·B를 함께 지운다(닿은 연결선도 같은 트랜잭션).
    me.transact(() => {
      me.getMap("connections").delete(cid);
      me.getMap("notes").delete(a);
      me.getMap("notes").delete(b);
    }, "me");
    pushFrom(me);
    await settle(async () => (await trashIds()).length === 2, "E 휴지통 2개");
    expect(has(a) || has(b)).toBe(false);

    meUm.undo();
    pushFrom(me);
    await idle();
    expect(has(a) && has(b)).toBe(true);
    expect(drawn(cid)).toBe(true);
    expect(await getDB().trash.count()).toBe(0);
    expect(await getDB().trashConnections.count()).toBe(0);
  });

  it("셋째: E의 휴지통 행이 빠지기 전에 E에서 A 살리기를 눌러도 A는 1개, 연결선 휴지통 0행", async () => {
    const p = await bootBoard();
    const a = addMemo(100, 100);
    const b = addMemo(600, 100);
    await flushAll();
    const cid = await connect(a, b);
    await readyCheck(p);
    const me = peer();
    const meUm = peerUndo(me);
    me.transact(() => {
      me.getMap("connections").delete(cid);
      me.getMap("notes").delete(a);
      me.getMap("notes").delete(b);
    }, "me");
    pushFrom(me);
    await settle(async () => (await trashIds()).length === 2, "E 휴지통 2개");

    meUm.undo();
    pushFrom(me);
    // 같은 틱 — 관찰자가 넣은 휴지통 빼기는 아직 돌지 않았다.
    await ws().restoreFromTrash(a);
    await idle();
    expect(count(a)).toBe(1);
    expect(await getDB().trashConnections.count()).toBe(0);
    expect(await getDB().trash.count()).toBe(0);
  });

  it("셋째 보강: 살리기를 누른 직후 그 await 사이에 내 되돌리기가 닿아도 A는 1개, 연결선 휴지통 0행", async () => {
    const p = await bootBoard();
    const a = addMemo(100, 100);
    const b = addMemo(600, 100);
    await flushAll();
    const cid = await connect(a, b);
    await readyCheck(p);
    const me = peer();
    const meUm = peerUndo(me);
    me.transact(() => {
      me.getMap("connections").delete(cid);
      me.getMap("notes").delete(a);
      me.getMap("notes").delete(b);
    }, "me");
    pushFrom(me);
    await settle(async () => (await trashIds()).length === 2, "E 휴지통 2개");

    const restoring = ws().restoreFromTrash(a);
    meUm.undo();
    pushFrom(me);
    await restoring;
    await idle();
    expect(count(a)).toBe(1);
    expect(await getDB().trashConnections.count()).toBe(0);
    expect(await getDB().trash.count()).toBe(0);
  });

  it("셋째 보강: E의 휴지통 행이 이미 빠진 뒤 낡은 목록에서 A 살리기를 눌러도 오류 없이 A는 1개", async () => {
    const p = await bootBoard();
    const a = addMemo(100, 100);
    await flushAll();
    await readyCheck(p);
    const me = peer();
    const meUm = peerUndo(me);
    me.transact(() => me.getMap("notes").delete(a), "me");
    pushFrom(me);
    await settle(async () => !!(await getDB().trash.get(a)), "E 휴지통");

    meUm.undo();
    pushFrom(me);
    await idle();
    expect(await getDB().trash.get(a)).toBeUndefined();
    await ws().restoreFromTrash(a);
    expect(count(a)).toBe(1);
  });

  it("넷째: B를 먼저, A를 나중에 지운 뒤 cmd+z 1번이면 A만 보이고 연결선은 연결선 휴지통에 남는다. B를 살리면 연결선이 보이고 새로고침 뒤에도 보인다", async () => {
    const p = await bootBoard();
    const a = addMemo(100, 100);
    const b = addMemo(600, 100);
    await flushAll();
    const cid = await connect(a, b);
    await readyCheck(p);

    ws().remove(b);
    await settle(async () => (await trashConnIds()).includes(cid), "B 휴지통·연결선 휴지통");
    ws().remove(a);
    await settle(async () => (await trashIds()).length === 2, "휴지통 2개");

    expect(pressUndo()).toBe(true);
    await idle();
    expect(has(a)).toBe(true);
    expect(has(b)).toBe(false);
    expect(drawn(cid)).toBe(false);
    expect(readConnection(doc(), cid)).toBeUndefined();
    expect(await trashConnIds()).toEqual([cid]);

    await ws().restoreFromTrash(b);
    await idle();
    expect(drawn(cid)).toBe(true);
    expect(readConnection(doc(), cid)).toBeDefined();

    await reload(p);
    expect(has(a) && has(b)).toBe(true);
    expect(drawn(cid)).toBe(true);
  });

  it("다섯째: A를 Q로 옮긴 뒤 B를 지우고 cmd+z 1번이면 B가 보이고 연결선 휴지통은 0행, 연결선은 문서에만 있다", async () => {
    const p = await bootBoard();
    const q = await ws().createBoard("Q");
    await ws().setCurrentBoard(p);
    const a = addMemo(100, 100);
    const b = addMemo(600, 100);
    await flushAll();
    const cid = await connect(a, b);
    await ws().moveCardToBoard(a, q);
    await flushAll();
    await readyCheck(p);
    expect(has(a)).toBe(false);
    expect(readConnection(doc(), cid)).toBeDefined();

    ws().remove(b);
    await settle(async () => !!(await getDB().trash.get(b)), "B 휴지통");
    expect(readConnection(doc(), cid)).toBeUndefined();

    expect(pressUndo()).toBe(true);
    await idle();
    expect(has(b)).toBe(true);
    expect(readConnection(doc(), cid)).toBeDefined();
    expect(await getDB().trashConnections.count()).toBe(0);
  });
});

/* ── T13 ────────────────────────────────────────────────────────── */

/** 메모 '새 메모'를 만드는 동작 하나(1단계). */
function createMemo(): string {
  const id = runAsUserAction(
    () => {
      const made = ws().addCardAt("text", 100, 100);
      ws().setContent(made, "새 메모");
      return made;
    },
    { creates: true },
  );
  useWorkspace.setState({ editingId: null, selectedIds: [] });
  return id;
}

describe("T13 새로 만든 메모를 되돌리면 메모가 사라지고 휴지통과 검색에도 없다", () => {
  it("첫째: cmd+z 1번에 사라지고 휴지통 0·미러 0·검색 0, cmd+shift+z 1번에 같은 자리에 다시 보인다", async () => {
    const p = await bootBoard();
    await readyCheck(p);
    fake();
    const id = createMemo();
    await settle(async () => !!(await getDB().notes.get(id)), "만든 메모 미러");
    expect(um().undoStack.length).toBe(1);

    expect(pressUndo()).toBe(true);
    await idle();
    await vi.advanceTimersByTimeAsync(1000);
    await idle();
    expect(note(id)).toBeUndefined();
    expect(has(id)).toBe(false);
    expect(await getDB().trash.count()).toBe(0);
    expect(await getDB().notes.get(id)).toBeUndefined();
    expect(ws().searchMemos("새 메모")).toEqual([]);

    expect(pressUndo(true)).toBe(true);
    expect(pos(id)).toEqual({ x: 100, y: 100 });
    expect(ws().cards.find((c) => c.id === id)?.content).toBe("새 메모");
  });

  it("둘째: cmd+z·cmd+shift+z·cmd+z를 0.3초 안에 누르고 1초 뒤 보드·휴지통·검색 모두 0", async () => {
    const p = await bootBoard();
    await readyCheck(p);
    fake();
    const id = createMemo();
    await settle(async () => !!(await getDB().notes.get(id)), "만든 메모 미러");

    pressUndo();
    pressUndo(true);
    pressUndo();
    await vi.advanceTimersByTimeAsync(1000);
    await idle();
    expect(note(id)).toBeUndefined();
    expect(has(id)).toBe(false);
    expect(await getDB().trash.count()).toBe(0);
    expect(await getDB().notes.get(id)).toBeUndefined();
    expect(ws().searchMemos("새 메모")).toEqual([]);
  });
});

/* ── T14 ────────────────────────────────────────────────────────── */

describe("T14 다시 실행으로 다시 지운 메모는 휴지통에 들어가고 판은 들어가지 않는다", () => {
  it("첫째: A와 판 F를 지우고 cmd+z 2번 뒤 cmd+shift+z 2번이면 둘 다 사라지고 휴지통에는 A 1개만", async () => {
    const p = await bootBoard();
    const a = addMemo(100, 100);
    const f = ws().addFrameAt(2000, 2000);
    useWorkspace.setState({ editingId: null, selectedIds: [] });
    await readyCheck(p);
    fake();

    ws().remove(a);
    ws().remove(f);
    await settle(async () => (await trashIds()).length === 1, "A 휴지통");
    pressUndo();
    pressUndo();
    await idle();
    expect(has(a) && has(f)).toBe(true);
    expect(await getDB().trash.count()).toBe(0);

    pressUndo(true);
    pressUndo(true);
    await idle();
    expect(has(a) || has(f)).toBe(false);
    expect(await trashIds()).toEqual([a]);
  });

  it("둘째: A를 지운 직후 0.3초 안에 cmd+z·cmd+shift+z, 1초 뒤 A는 보드·검색에 없고 휴지통 1개가 지우기 전 글을 가진다", async () => {
    const p = await bootBoard();
    const a = addMemo(100, 100);
    ws().setContent(a, "지우기 전 글");
    await readyCheck(p);
    fake();

    ws().remove(a);
    pressUndo();
    pressUndo(true);
    await vi.advanceTimersByTimeAsync(1000);
    await idle();
    expect(has(a)).toBe(false);
    expect(note(a)).toBeUndefined();
    expect(await getDB().notes.get(a)).toBeUndefined();
    expect(ws().searchMemos("지우기 전 글")).toEqual([]);
    const rows = await getDB().trash.toArray();
    expect(rows.map((r) => r.id)).toEqual([a]);
    expect(rows[0].note.content).toContain("지우기 전 글");
  });

  it("셋째: 연결선 2개가 붙은 C를 지우고 cmd+z·cmd+shift+z 뒤 휴지통에서 살리면 C와 연결선 2개가 보인다", async () => {
    const p = await bootBoard();
    const c = addMemo(400, 100);
    const d = addMemo(900, 100);
    const e = addMemo(400, 600);
    await flushAll();
    const c1 = await connect(c, d);
    const c2 = await connect(e, c);
    await readyCheck(p);
    fake();

    ws().remove(c);
    await settle(async () => (await trashConnIds()).length === 2, "연결선 휴지통 2개");
    pressUndo();
    pressUndo(true);
    await idle();
    expect(has(c)).toBe(false);
    expect(await trashIds()).toEqual([c]);
    expect(await trashConnIds()).toEqual([c1, c2].sort());

    await ws().restoreFromTrash(c);
    await idle();
    expect(has(c)).toBe(true);
    expect(drawn(c1) && drawn(c2)).toBe(true);
    expect(ws().connections).toHaveLength(2);
  });
});

/* ── T15 첫째·셋째·넷째·다섯째 (행 전체 판정은 n6) ─────────────────── */

describe("T15 휴지통에서 살린 메모를 되돌리면 메모가 휴지통으로 돌아간다", () => {
  it("첫째: 살린 A를 cmd+z하면 보드에 없고 휴지통에 A 1개, cmd+shift+z하면 다시 보드에 있고 휴지통 0", async () => {
    const p = await bootBoard();
    const a = addMemo(100, 100);
    await flushAll();
    await settle(async () => !!(await getDB().notes.get(a)), "A 미러");
    ws().remove(a);
    await settle(async () => !!(await getDB().trash.get(a)), "A 휴지통");
    await readyCheck(p);

    await ws().restoreFromTrash(a);
    expect(has(a)).toBe(true);
    expect(await getDB().trash.count()).toBe(0);

    expect(pressUndo()).toBe(true);
    await idle();
    expect(has(a)).toBe(false);
    expect(note(a)).toBeUndefined();
    expect(await trashIds()).toEqual([a]);
    expect(ws().trashCount).toBe(1);

    expect(pressUndo(true)).toBe(true);
    await idle();
    expect(has(a)).toBe(true);
    expect(await getDB().trash.count()).toBe(0);
  });

  it("셋째: B와 이어진 C를 살린 뒤 cmd+z 1번이면 C와 연결선이 사라지고 휴지통에 C 1행·연결선 1행, B는 남는다", async () => {
    const p = await bootBoard();
    const b = addMemo(100, 100);
    const c = addMemo(600, 100);
    await flushAll();
    const cid = await connect(b, c);
    ws().remove(c);
    await settle(async () => (await trashConnIds()).includes(cid), "C·연결선 휴지통");
    await readyCheck(p);

    await ws().restoreFromTrash(c);
    expect(drawn(cid)).toBe(true);

    expect(pressUndo()).toBe(true);
    await idle();
    expect(has(c)).toBe(false);
    expect(drawn(cid)).toBe(false);
    expect(readConnection(doc(), cid)).toBeUndefined();
    expect(await trashIds()).toEqual([c]);
    expect(await trashConnIds()).toEqual([cid]);
    expect(has(b)).toBe(true);
  });

  it("넷째: 원래 보드 Q로 살리면 연결선은 V 문서에 쓰이지만 V undoStack은 그대로, cmd+z는 X만 되돌린다", async () => {
    const v = await bootBoard("V");
    const q = await ws().createBoard("Q");
    await ws().setCurrentBoard(v);
    const s = addMemo(100, 100);
    const e = addMemo(600, 100);
    const x = addMemo(100, 600);
    await flushAll();
    const cid = await connect(s, e);
    await ws().moveCardToBoard(e, q);
    await flushAll();
    await useStorage.getState().trashNote(e);
    deleteConnection(doc(), cid, UNTRACKED_ORIGIN);
    await readyCheck(v);
    // 살리기 직전: 연결선은 V 문서에 없고 trashConnections에만 있다.
    expect(readConnection(doc(), cid)).toBeUndefined();
    expect(await trashConnIds()).toEqual([cid]);

    drag(x, 300, 700);
    const n0 = um().undoStack.length;
    expect(n0).toBe(1);
    await ws().restoreFromTrash(e);
    expect(readConnection(doc(), cid)).toBeDefined();
    expect(um().undoStack.length).toBe(n0);

    expect(pressUndo()).toBe(true);
    expect(pos(x)).toEqual({ x: 100, y: 600 });
    expect(readConnection(doc(), cid)).toBeDefined();
  });

  it("다섯째: 표 보기 살리기로 G를 살리면 G–S 연결선이 V 문서에 쓰이지만 V undoStack은 그대로다", async () => {
    const v = await bootBoard("V");
    const g = addMemo(100, 100);
    const s = addMemo(600, 100);
    await flushAll();
    const cid = await connect(s, g);
    await useMemoTable.getState().ensureLoaded();
    useToasts.getState().clear();
    useMemoTable.getState().setSelectedIds(new Set([g]));
    await useMemoTable.getState().trashSelected();
    deleteConnection(doc(), cid, UNTRACKED_ORIGIN);
    await readyCheck(v);
    expect(readConnection(doc(), cid)).toBeUndefined();
    expect(await trashConnIds()).toEqual([cid]);

    const toast = useToasts.getState().toasts.at(-1);
    await toast!.action!.onClick();
    await waitFor(() => !!readConnection(doc(), cid), "연결선 V 문서");
    expect(um().undoStack.length).toBe(0);
  });
});

/* ── T21 ────────────────────────────────────────────────────────── */

describe("T21 공유 보드·다른 탭에서 cmd+z는 칸 단위로 남의 변경을 덮지 않는다(생성 되돌리기는 예외)", () => {
  it("첫째: A를 옮긴 뒤 다른 탭이 B 색을 바꿨으면 cmd+z 2번에 A만 돌아오고 B 색은 그대로, 두 번째는 아무것도 안 바꾼다", async () => {
    const p = await bootBoard();
    const a = addMemo(100, 100);
    const b = addMemo(600, 100);
    ws().setMemoColor([b], "blue");
    await readyCheck(p);
    const tab = peer();

    drag(a, 300, 300);
    pullInto(tab);
    tab.transact(() => updateNoteFields(tab, b, { color: "lime", updatedAt: Date.now() }), "tab");
    pushFrom(tab);

    pressUndo();
    expect(pos(a)).toEqual({ x: 100, y: 100 });
    expect(note(b)?.color).toBe("lime");
    pressUndo();
    expect(pos(a)).toEqual({ x: 100, y: 100 });
    expect(note(b)?.color).toBe("lime");
    expect(um().undoStack.length).toBe(0);
  });

  it("둘째: 같은 기기 두 탭 — 탭1의 cmd+z가 탭2에도 가고, 그 뒤 탭1의 새 이동도 탭2에 보인다", async () => {
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
    const p = await bootBoard();
    const a = addMemo(100, 100);
    await flushAll();
    const tab2 = peer();
    const key = docKeyForBoard(p);
    let delivered = posted.length;
    const deliver = () => {
      for (; delivered < posted.length; delivered++) {
        if (posted[delivered].key === key) Y.applyUpdate(tab2, posted[delivered].update, "channel");
      }
    };
    await readyCheck(p);

    drag(a, 300, 300);
    deliver();
    expect(readNote(tab2, a)).toMatchObject({ x: 300, y: 300 });
    pressUndo();
    deliver();
    expect(readNote(tab2, a)).toMatchObject({ x: 100, y: 100 });
    drag(a, 520, 520);
    deliver();
    expect(readNote(tab2, a)).toMatchObject({ x: 520, y: 520 });
    expect(tab2.store.pendingStructs).toBeNull();
  });

  it("셋째: A를 옮기고 B를 pink로 바꾼 뒤 다른 탭이 B를 lime으로 바꾸면 cmd+z 1번에 B는 lime, A는 돌아오고 기록 0", async () => {
    const p = await bootBoard();
    const a = addMemo(100, 100);
    const b = addMemo(600, 100);
    ws().setMemoColor([b], "blue");
    await readyCheck(p);
    const tab = peer();

    drag(a, 300, 300);
    ws().setMemoColor([b], "pink");
    expect(um().undoStack.length).toBe(2);
    pullInto(tab);
    tab.transact(() => updateNoteFields(tab, b, { color: "lime", updatedAt: Date.now() + 1 }), "tab");
    pushFrom(tab);

    pressUndo();
    expect(note(b)?.color).toBe("lime");
    expect(pos(a)).toEqual({ x: 100, y: 100 });
    expect(um().undoStack.length).toBe(0);
  });

  it("넷째(내 쪽): 내가 만든 C에 E가 '메모'를 쓴 지 0.3초 안에 cmd+z하면 C가 내 보드와 E의 문서에서 사라진다", async () => {
    const p = await bootBoard();
    await readyCheck(p);
    fake();
    const c = addMemo(100, 100);
    const e = peer();
    e.transact(() => updateNoteFields(e, c, { content: "메모" }), "E");
    pushFrom(e);
    expect(note(c)?.content).toBe("메모");

    expect(pressUndo()).toBe(true);
    expect(note(c)).toBeUndefined();
    expect(has(c)).toBe(false);
    pullInto(e);
    expect(readNote(e, c)).toBeUndefined();
    await idle();
    expect(await getDB().trash.count()).toBe(0);
  });

  it("넷째(E 쪽): 이 앱이 E다. E가 '메모'를 쓴 지 0.3초 안에 C가 원격에서 지워지면 E의 휴지통에 C가 '메모'와 함께 있다", async () => {
    const p = await bootBoard();
    await readyCheck(p);
    fake();
    const me = peer();
    const meUm = peerUndo(me);
    const c = "memo-c";
    me.transact(() => {
      putNote(me, {
        id: c,
        boardId: p,
        kind: "text",
        x: 100,
        y: 100,
        width: 240,
        height: 240,
        rotation: 0,
        content: "",
        aiOptOut: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }, "me");
    pushFrom(me);
    expect(has(c)).toBe(true);
    await idle();
    expect((await getDB().notes.get(c))?.content).toBe("");

    // E가 '메모'를 쓴다 — 문서는 바로, 미러는 0.3초 뒤.
    ws().setContent(c, "메모");
    pullInto(me);
    // 0.3초 안에 내 생성 되돌리기가 닿는다.
    meUm.undo();
    pushFrom(me);
    expect(has(c)).toBe(false);
    await idle();
    const row = await getDB().trash.get(c);
    expect(row?.note.content).toContain("메모");
    // 내보낸 예약 쓰기가 0.3초 뒤 미러 행을 되살리지 않는다.
    await vi.advanceTimersByTimeAsync(1000);
    await idle();
    expect(await getDB().notes.get(c)).toBeUndefined();
  });

  it("다섯째: A를 옮기고 cmd+z한 뒤 다른 탭이 A를 옮겼으면 cmd+shift+z에 A는 다른 탭 자리 그대로, 다시 실행 기록 0", async () => {
    const p = await bootBoard();
    const a = addMemo(100, 100);
    await readyCheck(p);
    const tab = peer();

    drag(a, 300, 300);
    pressUndo();
    expect(pos(a)).toEqual({ x: 100, y: 100 });
    pullInto(tab);
    tab.transact(() => updateNoteFields(tab, a, { x: 800, y: 800, updatedAt: Date.now() + 1 }), "tab");
    pushFrom(tab);

    expect(um().redoStack.length).toBeGreaterThanOrEqual(1);
    pressUndo(true);
    expect(pos(a)).toEqual({ x: 800, y: 800 });
    expect(um().redoStack.length).toBe(0);
  });

  it("여섯째: 내가 M을 지운 뒤 E가 자기 휴지통에서 M을 살렸으면 cmd+z 뒤 내 보드에 M 1개, 내 휴지통 M 0행", async () => {
    const p = await bootBoard();
    const m = addMemo(100, 100);
    await flushAll();
    await readyCheck(p);
    const before = note(m)!;
    const e = peer();

    ws().remove(m);
    await settle(async () => !!(await getDB().trash.get(m)), "M 휴지통");
    pullInto(e);
    // E의 휴지통 살리기 — 메모를 문서에 다시 쓴다.
    e.transact(() => putNote(e, { ...before, updatedAt: Date.now() + 1 }), "E");
    pushFrom(e);

    pressUndo();
    await idle();
    expect(count(m)).toBe(1);
    expect(await getDB().trash.get(m)).toBeUndefined();
  });
});

/* ── T24·T25·F1 ─────────────────────────────────────────────────── */

describe("T24 되돌린 뒤 카드를 원래 값으로 다시 바꿔도 저장된다", () => {
  it("A를 pink에서 blue로 바꾸고 cmd+z로 pink, 다시 blue로 바꾸면 새로고침 뒤 blue", async () => {
    const p = await bootBoard();
    const a = addMemo(100, 100);
    ws().setMemoColor([a], "pink");
    await readyCheck(p);

    ws().setMemoColor([a], "blue");
    pressUndo();
    expect(note(a)?.color).toBe("pink");
    ws().setMemoColor([a], "blue");
    await flushAll();
    expect(note(a)?.color).toBe("blue");

    await reload(p);
    expect(note(a)?.color).toBe("blue");
  });
});

describe("코드 리뷰 웨이브 2 F1 — 되돌린 뒤 같은 값을 다시 고르면 문서에 쓰인다", () => {
  it("색을 pink로 바꾸고 cmd+z 뒤 다시 pink를 고르면 P 문서 color가 pink다", async () => {
    const p = await bootBoard();
    const a = addMemo(100, 100);
    ws().setMemoColor([a], "blue");
    await readyCheck(p);

    ws().setMemoColor([a], "pink");
    pressUndo();
    expect(note(a)?.color).toBe("blue");
    ws().setMemoColor([a], "pink");
    expect(note(a)?.color).toBe("pink");
  });

  it("크기를 최대로 늘리고 cmd+z 뒤 다시 최대로 늘리면 P 문서 width가 최대값이다", async () => {
    const p = await bootBoard();
    const a = addMemo(100, 100);
    await readyCheck(p);
    const w0 = note(a)!.width;

    ws().resizeCard(a, { width: CARD_MAX_WIDTH, height: CARD_MAX_WIDTH });
    expect(note(a)?.width).toBe(CARD_MAX_WIDTH);
    pressUndo();
    expect(note(a)?.width).toBe(w0);
    ws().resizeCard(a, { width: CARD_MAX_WIDTH, height: CARD_MAX_WIDTH });
    expect(note(a)?.width).toBe(CARD_MAX_WIDTH);
  });
});

describe("T25 되돌린 메모의 수정 시각은 되돌린 시각이다", () => {
  it("t1에 되돌리면 updatedAt ≥ t1, t2에 다시 실행하면 ≥ t2, 그 쓰기는 기록 단계 수를 늘리지 않는다", async () => {
    const p = await bootBoard();
    const a = addMemo(100, 100);
    ws().setMemoColor([a], "blue");
    await readyCheck(p);
    fake();

    ws().setMemoColor([a], "pink");
    expect(um().undoStack.length).toBe(1);
    const t1 = Date.now() + 60_000;
    vi.setSystemTime(t1);
    pressUndo();
    expect(note(a)?.color).toBe("blue");
    expect(note(a)!.updatedAt).toBeGreaterThanOrEqual(t1);
    expect(um().undoStack.length).toBe(0);
    expect(um().redoStack.length).toBe(1);

    const t2 = t1 + 60_000;
    vi.setSystemTime(t2);
    pressUndo(true);
    expect(note(a)?.color).toBe("pink");
    expect(note(a)!.updatedAt).toBeGreaterThanOrEqual(t2);
    expect(um().undoStack.length).toBe(1);
    expect(um().redoStack.length).toBe(0);
  });
});
