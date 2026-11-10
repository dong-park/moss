/**
 * cmd-z-undo 웨이브 4 코드 리뷰 회귀 시험 — 되돌리기·다시 실행·삭제 뒤 메모와 연결선이
 * 보드·휴지통·기록 보관 가운데 한 곳에만 있다(스펙 「상태 모델」). 이 기기의 Dexie 세 표
 * (미러, trash, trashConnections)와 보드 문서 기준이다. 실제 함수만 쓴다(스텁 없음).
 *
 * - W4-1: remove·removeSelected가 미러에 아직 없는 연결선을 잃지 않는다. 원격 삭제도 같다.
 * - W4-2: 살리기가 2단계로 갈려도 cmd+z 2번 뒤 연결선이 연결선 휴지통에 있다.
 * - W4-3: 되돌리기·다시 실행의 휴지통 행은 적용 직전 문서 값이다.
 * - W4-4: 같은 기기 다른 탭의 삭제를 받은 탭은 휴지통을 만지지 않는다.
 * - W4-5: 이미 시작된 0.3초 미러 쓰기가 지운 미러 행을 되살리지 않는다.
 * 준비 확인은 spec.md 「준비 확인」 규칙을 따른다(undoTestKit.readyCheck).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { runAsUserAction, useWorkspace, __trashIdleForTest } from "@/state/workspace";
import { beginUndoGroup, endUndoGroup } from "@/state/ydoc/undo";
import { getDB, type Connection } from "@/state/db/schema";
import {
  flushAll,
  isPersistInFlight,
  persistSettled,
  schedulePersist,
} from "@/state/cardPersist";
import {
  deleteConnection,
  deleteNote,
  putConnection,
  putNote,
  readConnection,
  readNote,
  updateNoteFields,
} from "@/state/ydoc/model";
import { LOCAL_ORIGIN } from "@/state/ydoc/origin";
import { applyIncoming } from "@/state/db/liveSync";
import { docKeyForBoard } from "@/state/ydoc/activeDoc";
import { archiveMirror, trashNotesFromDoc } from "@/state/undoTrash";
import { dispatchOp } from "@/state/bridge/mossBridge";
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

beforeEach(() => setupNavigatorStorage());
afterEach(async () => {
  vi.useRealTimers();
  await sleep(400);
  await __trashIdleForTest();
  await teardown();
});

const idle = () => __trashIdleForTest();
const has = (id: string) => ws().cards.some((c) => c.id === id);
const drawn = (cid: string) => ws().connections.some((c) => c.id === cid);
const trashIds = async () => (await getDB().trash.toArray()).map((e) => e.id).sort();
const trashConnIds = async () => (await getDB().trashConnections.toArray()).map((c) => c.id).sort();
const where = async (cid: string) => ({
  doc: !!readConnection(doc(), cid),
  mirror: !!(await getDB().connections.get(cid)),
  trashConn: !!(await getDB().trashConnections.get(cid)),
  drawn: drawn(cid),
});

async function connect(a: string, b: string): Promise<string> {
  const cid = ws().connectCards(a, "right", b, "left")!;
  await waitFor(
    async () => !!readConnection(doc(), cid) && !!(await getDB().connections.get(cid)),
    "준비 연결선",
  );
  return cid;
}
function conn(id: string, s: string, t: string): Connection {
  return {
    id, sourceNoteId: s, targetNoteId: t, source: "manual", status: "active",
    sourceSide: "right", targetSide: "left", createdAt: Date.now(),
  };
}
/** 다른 기기 E — 지금 보드 문서를 복제한 피어. */
function peer(): Y.Doc {
  const d = new Y.Doc();
  Y.applyUpdate(d, Y.encodeStateAsUpdate(doc()));
  return d;
}
function pushFrom(d: Y.Doc) {
  Y.applyUpdate(doc(), Y.encodeStateAsUpdate(d, Y.encodeStateVector(doc())), "remote-peer");
}
function drag(id: string, x: number, y: number) {
  const token = beginUndoGroup();
  ws().moveCard(id, x, y);
  ws().commitMove([id]);
  ws().resolveMembership([id]);
  endUndoGroup(token);
}
/** 가짜 시계 0.4초 + IndexedDB 콜백(setImmediate)이 다 돌 만큼 실제 틱. */
async function pass() {
  await vi.advanceTimersByTimeAsync(400);
  for (let i = 0; i < 50; i++) await new Promise((r) => setImmediate(r));
}

describe("W4-1 캔버스 삭제가 미러에 아직 없는 연결선을 잃지 않는다", () => {
  it("R1a 연결선 지우기를 되돌린 직후 0.3초 안에 메모를 지워도, 휴지통 살리기 뒤 연결선이 돌아온다", async () => {
    const p = await bootBoard();
    const a = addMemo(100, 100);
    const m = addMemo(600, 100);
    await flushAll();
    await readyCheck(p);
    const cid = await connect(a, m);
    ws().removeConnection(cid);
    await waitFor(async () => !readConnection(doc(), cid) && !(await getDB().connections.get(cid)), "선 지움");
    await sleep(600);
    expect(pressUndo()).toBe(true); // 연결선이 문서에 돌아온다. 미러는 0.3초 뒤.
    expect(readConnection(doc(), cid)).toBeDefined();
    await sleep(30);
    ws().remove(m);
    await waitFor(async () => (await getDB().trash.count()) === 1, "M 휴지통");
    await sleep(600);
    expect(await where(cid)).toMatchObject({ doc: false, mirror: false, trashConn: true });
    await ws().restoreFromTrash(m);
    await sleep(600);
    const after = await where(cid);
    expect(!!note(m)).toBe(true);
    expect(after.doc).toBe(true);
    expect(after.drawn).toBe(true);
  });

  it("R1b 다른 기기 E가 그은 선이 미러에 오르기 전 메모를 지워도, 휴지통 살리기 뒤 연결선이 돌아온다", async () => {
    const p = await bootBoard();
    const a = addMemo(100, 100);
    const m = addMemo(600, 100);
    await flushAll();
    await readyCheck(p);
    const e = peer();
    const cid = "conn-from-e";
    putConnection(e, conn(cid, a, m));
    pushFrom(e);
    expect(drawn(cid)).toBe(true);
    await sleep(30);
    ws().remove(m);
    await waitFor(async () => (await getDB().trash.count()) === 1, "M 휴지통");
    await sleep(600);
    expect(await where(cid)).toMatchObject({ doc: false, mirror: false, trashConn: true });
    await ws().restoreFromTrash(m);
    await sleep(600);
    const after = await where(cid);
    expect(!!note(m)).toBe(true);
    expect(after.doc).toBe(true);
    expect(after.drawn).toBe(true);
  });

  it("J 다른 기기가 그은 연결선이 닿은 뒤 0.3초 안에 B를 지우면, 연결선이 휴지통 표에 있고 B를 살리면 돌아온다", async () => {
    const p = await bootBoard();
    const a = addMemo(100, 100);
    const b = addMemo(600, 100);
    await flushAll();
    await waitFor(async () => !!(await getDB().notes.get(a)) && !!(await getDB().notes.get(b)), "미러");
    await readyCheck(p);
    const e = peer();
    const cid = "conn-from-E";
    e.transact(() => putConnection(e, conn(cid, a, b)), "E");
    pushFrom(e);
    expect(drawn(cid)).toBe(true);
    ws().remove(b);
    await waitFor(async () => (await trashIds()).includes(b), "B 휴지통");
    await sleep(500);
    await idle();
    expect(readConnection(doc(), cid)).toBeUndefined();
    expect(await trashConnIds()).toContain(cid);
    await ws().restoreFromTrash(b);
    await sleep(500);
    await idle();
    expect(readConnection(doc(), cid)).toBeDefined();
    expect(drawn(cid)).toBe(true);
  });

  it("J2 한 기기 — 연결선 지우기를 cmd+z로 되살리고 0.3초 안에 끝 메모를 지워도 연결선이 연결선 휴지통에 있다", async () => {
    const p = await bootBoard();
    const a = addMemo(100, 100);
    const b = addMemo(600, 100);
    await flushAll();
    const cid = await connect(a, b);
    await readyCheck(p);
    ws().removeConnection(cid);
    await waitFor(async () => !readConnection(doc(), cid) && !(await getDB().connections.get(cid)), "연결선 지움");
    await sleep(600);
    expect(pressUndo()).toBe(true);
    expect(readConnection(doc(), cid)).toBeDefined();
    ws().remove(b);
    await waitFor(async () => (await trashIds()).includes(b), "B 휴지통");
    await sleep(500);
    await idle();
    expect(readConnection(doc(), cid)).toBeUndefined();
    expect(await trashConnIds()).toContain(cid);
    expect(await getDB().connections.get(cid)).toBeUndefined();
  });

  it("removeSelected도 같다 — 다른 기기가 막 그은 선이 연결선 휴지통에 들어간다", async () => {
    const p = await bootBoard();
    const a = addMemo(100, 100);
    const b = addMemo(600, 100);
    const x = addMemo(100, 600);
    await flushAll();
    await readyCheck(p);
    const e = peer();
    const cid = "conn-from-E-sel";
    e.transact(() => putConnection(e, conn(cid, a, b)), "E");
    pushFrom(e);
    ws().removeSelected([b, x]);
    await waitFor(async () => (await trashIds()).length === 2, "B·X 휴지통");
    await sleep(500);
    await idle();
    expect(await where(cid)).toMatchObject({ doc: false, mirror: false, trashConn: true });
  });

  it("원격 삭제도 같다 — E가 선을 긋고 0.3초 안에 끝 메모를 지우면, 이 기기 연결선 휴지통에 그 선이 있다", async () => {
    const p = await bootBoard();
    const a = addMemo(100, 100);
    const m = addMemo(600, 100);
    await flushAll();
    await readyCheck(p);
    const e = peer();
    const cid = "conn-from-E-remote";
    e.transact(() => putConnection(e, conn(cid, a, m)), "E");
    pushFrom(e);
    expect(drawn(cid)).toBe(true);
    e.transact(() => {
      deleteConnection(e, cid);
      deleteNote(e, m);
    }, "E");
    pushFrom(e);
    expect(has(m)).toBe(false);
    await waitFor(async () => (await trashIds()).includes(m), "M 휴지통");
    await sleep(500);
    await idle();
    expect(await where(cid)).toMatchObject({ doc: false, mirror: false, trashConn: true });
    await ws().restoreFromTrash(m);
    await sleep(500);
    await idle();
    expect(readConnection(doc(), cid)).toBeDefined();
    expect(drawn(cid)).toBe(true);
  });

  it("R8 대조군 — 브리지 connections.create 직후 notes.delete, 선이 문서와 연결선 휴지통에 함께 있지 않다", async () => {
    const p = await bootBoard();
    const a = addMemo(100, 100);
    const m = addMemo(600, 100);
    await flushAll();
    await readyCheck(p);
    const made = (await dispatchOp("connections.create", { sourceNoteId: a, targetNoteId: m })) as { id: string };
    await dispatchOp("notes.delete", { id: m });
    await sleep(900);
    const s = await where(made.id);
    expect(s.doc && s.trashConn).toBe(false);
  });
});

describe("W4-2 살리기가 2단계로 갈려도 cmd+z 2번 뒤 연결선을 잃지 않는다", () => {
  it("R2 살리기 두 쓰기가 0.5초 넘게 벌어져 2단계가 되면, cmd+z 2번 뒤 연결선이 연결선 휴지통에 있다", async () => {
    const p = await bootBoard();
    const a = addMemo(100, 100);
    const m = addMemo(600, 100);
    await flushAll();
    const cid = await connect(a, m);
    ws().remove(m);
    await waitFor(
      async () => (await getDB().trash.count()) === 1 && !!(await getDB().trashConnections.get(cid)),
      "M·선 휴지통",
    );
    await readyCheck(p);
    // 느린 await 흉내: 살리기의 연결선 문서 쓰기 직후 실제 시간 0.6초를 흘린다(실패 모드 24 전제).
    let stalled = false;
    const stall = (tr: Y.Transaction) => {
      if (stalled || tr.origin !== LOCAL_ORIGIN || !readConnection(doc(), cid)) return;
      stalled = true;
      const t = Date.now();
      while (Date.now() - t < 600) { /* busy wait */ }
    };
    doc().on("afterTransaction", stall);
    await ws().restoreFromTrash(m);
    doc().off("afterTransaction", stall);
    expect(stalled).toBe(true);
    expect(um().undoStack.length).toBe(2); // 받아들인 전제: 2단계
    expect(drawn(cid)).toBe(true);
    await sleep(600);
    pressUndo();
    await sleep(600);
    pressUndo();
    await sleep(700);
    expect(await getDB().trash.count()).toBe(1);
    expect(await where(cid)).toMatchObject({ doc: false, mirror: false, trashConn: true });
    await ws().restoreFromTrash(m);
    await sleep(600);
    const after = await where(cid);
    expect(!!note(m)).toBe(true);
    expect(after.doc).toBe(true);
    expect(after.drawn).toBe(true);
  });

  it("B1 살리기의 연결선 쓰기와 카드 쓰기가 2단계가 되면, cmd+z 2번 뒤 연결선이 연결선 휴지통에 있다", async () => {
    const p = await bootBoard();
    const b = addMemo(100, 100);
    const c = addMemo(600, 100);
    await flushAll();
    const cid = await connect(c, b);
    ws().remove(c);
    await waitFor(async () => (await trashConnIds()).includes(cid), "C·연결선 휴지통");
    await readyCheck(p);
    // 0.5초 넘게 벌어짐을 그 자리에서 단계 끊기로 세운다(실패 모드 24의 전제).
    const connections: unknown = doc().getMap("connections");
    const split = (tr: Y.Transaction) => {
      if ([...tr.changedParentTypes.keys()].some((t) => t === connections)) um().stopCapturing();
    };
    doc().on("afterTransaction", split);
    await ws().restoreFromTrash(c);
    doc().off("afterTransaction", split);
    expect(drawn(cid)).toBe(true);
    expect(um().undoStack.length).toBe(2);
    expect(pressUndo()).toBe(true);
    await idle();
    expect(pressUndo()).toBe(true);
    await idle();
    await sleep(500);
    await idle();
    expect(has(c)).toBe(false);
    expect(await trashIds()).toEqual([c]);
    expect(await where(cid)).toMatchObject({ doc: false, mirror: false, trashConn: true });
    await ws().restoreFromTrash(c);
    await sleep(500);
    await idle();
    expect(readConnection(doc(), cid)).toBeDefined();
    expect(drawn(cid)).toBe(true);
  });

  it("B2 대조군 — 연결선 2개인 C를 살리는 도중 다른 카드를 끌어도, cmd+z로 다 되돌린 뒤 연결선 2개가 연결선 휴지통에 있다", async () => {
    const p = await bootBoard();
    const b = addMemo(100, 100);
    const c = addMemo(600, 100);
    const d = addMemo(600, 600);
    const x = addMemo(100, 900);
    await flushAll();
    const c1 = await connect(c, b);
    const c2 = await connect(c, d);
    ws().remove(c);
    await waitFor(async () => (await trashConnIds()).length === 2, "C·연결선 2개 휴지통");
    await readyCheck(p);
    const restoring = ws().restoreFromTrash(c);
    await waitFor(() => !!readConnection(doc(), c1) || !!readConnection(doc(), c2), "첫 연결선");
    drag(x, 300, 950); // 사용자가 그새 X를 끈다(드래그 1단계).
    await restoring;
    while (um().undoStack.length > 0) {
      pressUndo();
      await idle();
    }
    await sleep(500);
    await idle();
    expect(await trashConnIds()).toEqual([c1, c2].sort());
  });
});

describe("W4-3 되돌리기·다시 실행의 휴지통 행은 적용 직전 문서 값이다", () => {
  it("R3 지우기 → cmd+z → 브리지 글 고침 → cmd+shift+z 뒤 휴지통 행에 브리지 글이 있다", async () => {
    const p = await bootBoard();
    const m = addMemo(600, 100);
    ws().setContent(m, "원래 글");
    await flushAll();
    await readyCheck(p);
    ws().remove(m);
    await waitFor(async () => (await getDB().trash.count()) === 1, "M 휴지통");
    expect(pressUndo()).toBe(true);
    await sleep(600);
    expect(note(m)?.content).toBe("원래 글");
    await dispatchOp("notes.update", { id: m, content: "브리지가 덧붙인 글" });
    await sleep(600);
    expect(note(m)?.content).toBe("브리지가 덧붙인 글");
    expect(pressUndo(true)).toBe(true);
    await sleep(700);
    const row = await getDB().trash.get(m);
    expect(!!note(m)).toBe(false);
    expect(row?.note.content).toBe("브리지가 덧붙인 글");
  });

  it("C1 지우고 cmd+z로 되살린 A에 E가 글을 쓴 뒤 cmd+shift+z면, 내 휴지통 행에 E의 글이 있다", async () => {
    const p = await bootBoard();
    const a = addMemo(100, 100);
    ws().setContent(a, "v1");
    await flushAll();
    await waitFor(async () => (await getDB().notes.get(a))?.content?.includes("v1") ?? false, "A 미러");
    await readyCheck(p);
    ws().remove(a);
    await waitFor(async () => (await trashIds()).includes(a), "A 휴지통");
    expect(pressUndo()).toBe(true);
    await idle();
    expect(has(a)).toBe(true);
    const e = peer();
    e.transact(() => updateNoteFields(e, a, { content: "v2 E가 쓴 글", updatedAt: Date.now() + 1 }), "E");
    pushFrom(e);
    expect(readNote(doc(), a)?.content).toContain("v2");
    await sleep(500);
    await idle();
    expect(pressUndo(true)).toBe(true);
    await idle();
    expect(has(a)).toBe(false);
    const row = await getDB().trash.get(a);
    expect(row?.note.content).toContain("v2");
  });

  it("C2 휴지통에서 살린 A에 E가 글을 쓴 뒤 cmd+z면, 내 휴지통 행에 E의 글이 있다", async () => {
    const p = await bootBoard();
    const a = addMemo(100, 100);
    ws().setContent(a, "v1");
    await flushAll();
    await waitFor(async () => (await getDB().notes.get(a))?.content?.includes("v1") ?? false, "A 미러");
    ws().remove(a);
    await waitFor(async () => (await trashIds()).includes(a), "A 휴지통");
    await readyCheck(p);
    await ws().restoreFromTrash(a);
    expect(has(a)).toBe(true);
    const e = peer();
    e.transact(() => updateNoteFields(e, a, { content: "v2 E가 쓴 글", updatedAt: Date.now() + 1 }), "E");
    pushFrom(e);
    await sleep(500);
    await idle();
    expect(pressUndo()).toBe(true);
    await idle();
    expect(has(a)).toBe(false);
    const row = await getDB().trash.get(a);
    expect(row?.note.content).toContain("v2");
  });
});

describe("W4-4 같은 기기 다른 탭의 삭제를 받은 탭은 휴지통을 만지지 않는다", () => {
  /** 같은 기기 탭1 — 이 탭 문서를 복제한 문서와 그 탭의 기록. 보내기는 탭 사이 방송과 같은 길. */
  async function otherTab() {
    const p = await bootBoard();
    await readyCheck(p);
    const key = docKeyForBoard(p);
    const tab1 = peer();
    const t1um = new Y.UndoManager([tab1.getMap("notes"), tab1.getMap("connections")], {
      trackedOrigins: new Set<unknown>(["me"]),
    });
    const send = () => {
      const update = Y.encodeStateAsUpdate(tab1, Y.encodeStateVector(doc()));
      applyIncoming({ type: "ydoc-update", key, update, origin: "tab-1" });
    };
    const receive = () => Y.applyUpdate(tab1, Y.encodeStateAsUpdate(doc(), Y.encodeStateVector(tab1)));
    return { p, tab1, t1um, send, receive };
  }

  it("A 다른 탭이 만든 메모에 글을 쓰고 0.3초 안에 생성을 되돌리면, 이 기기 미러·휴지통에 그 메모가 없다", async () => {
    const { p, tab1, t1um, send } = await otherTab();
    const m = "memo-tab1";
    const now = Date.now();
    tab1.transact(() => putNote(tab1, {
      id: m, boardId: p, kind: "text", x: 100, y: 100, width: 240, height: 240, rotation: 0,
      content: "", aiOptOut: false, createdAt: now, updatedAt: now,
    }), "me");
    send();
    expect(has(m)).toBe(true);
    await idle();
    tab1.transact(() => updateNoteFields(tab1, m, { content: "글", updatedAt: Date.now() }), "me");
    send();
    // 탭1: 만들기+글 1단계를 되돌린다. 탭1의 기록 보관(미러 지움)은 공유 Dexie에 실제 함수로.
    expect(t1um.undoStack.length).toBe(1);
    t1um.undo();
    expect(readNote(tab1, m)).toBeUndefined();
    await archiveMirror(tab1, m);
    send();
    expect(has(m)).toBe(false);
    await idle();
    await sleep(500);
    await idle();
    expect(await getDB().trash.get(m)).toBeUndefined();
    expect(await getDB().notes.get(m)).toBeUndefined();
  });

  it("A2 받는 탭의 미러 쓰기가 이미 시작된 채 다른 탭이 생성을 되돌려도, 미러·휴지통에 그 메모가 없다", async () => {
    const { p, tab1, t1um, send } = await otherTab();
    const m = "memo-tab1-inflight";
    const now = Date.now();
    tab1.transact(() => putNote(tab1, {
      id: m, boardId: p, kind: "text", x: 100, y: 100, width: 240, height: 240, rotation: 0,
      content: "", aiOptOut: false, createdAt: now, updatedAt: now,
    }), "me");
    send();
    await idle();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    tab1.transact(() => updateNoteFields(tab1, m, { content: "글", updatedAt: Date.now() }), "me");
    send(); // 이 탭이 미러 쓰기를 0.3초 뒤로 예약
    vi.advanceTimersByTime(300); // 예약 쓰기가 시작된다(saveNote의 get이 진행 중)
    expect(isPersistInFlight(m)).toBe(true);
    t1um.undo();
    // 탭1의 기록 보관 — 다른 탭은 이 탭의 쓰기를 기다리지 못한다. Dexie를 바로 지운다.
    await getDB().notes.delete(m);
    send();
    vi.useRealTimers();
    await sleep(500);
    await idle();
    expect(has(m)).toBe(false);
    expect(await getDB().trash.get(m)).toBeUndefined();
    expect(await getDB().notes.get(m)).toBeUndefined();
  });

  it("받는 탭이 0.3초 안에 쓴 글을 보낸 탭이 지우면, 그 글이 휴지통 행에 남고 미러 행은 없다", async () => {
    const { tab1, send, receive } = await otherTab();
    const m = addMemo(100, 100);
    ws().setContent(m, "v1");
    await flushAll();
    await waitFor(async () => (await getDB().notes.get(m))?.content?.includes("v1") ?? false, "미러");
    ws().setContent(m, "이 탭이 0.3초 안에 쓴 글"); // 문서는 바로, 미러는 0.3초 뒤
    receive();
    // 탭1의 캔버스 삭제 — 지우기 직전 탭1 문서 값으로 휴지통에 넣는다(remove와 같은 실제 함수).
    const snap = readNote(tab1, m)!;
    tab1.transact(() => deleteNote(tab1, m), "me");
    await trashNotesFromDoc(tab1, [{ note: { ...snap, lastVisitedAt: Date.now() }, connections: [] }]);
    send();
    expect(has(m)).toBe(false);
    await sleep(500);
    await idle();
    const row = await getDB().trash.get(m);
    expect(row?.note.content).toContain("이 탭이 0.3초 안에 쓴 글");
    expect(await getDB().notes.get(m)).toBeUndefined();
    expect(await trashIds()).toEqual([m]);
  });
});

describe("W4-5 이미 시작된 0.3초 미러 쓰기가 지운 미러 행을 되살리지 않는다", () => {
  it("persistSettled는 이미 시작된 쓰기가 끝나야 풀린다 — 예약만 된 쓰기는 기다리지 않는다", async () => {
    vi.useFakeTimers();
    let release: () => void = () => undefined;
    const run = vi.fn(() => new Promise<void>((r) => { release = r; }));
    schedulePersist("x", run);
    expect(isPersistInFlight("x")).toBe(false);
    let done = false;
    void persistSettled(["x"]).then(() => { done = true; });
    await Promise.resolve();
    expect(done).toBe(true); // 예약만 됐다
    vi.advanceTimersByTime(300);
    expect(run).toHaveBeenCalledTimes(1);
    expect(isPersistInFlight("x")).toBe(true);
    let settled = false;
    void persistSettled(["x"]).then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    release();
    await vi.waitFor(() => expect(settled).toBe(true));
    expect(isPersistInFlight("x")).toBe(false);
  });

  it("R5a 생성 되돌리기가 이미 시작된 0.3초 예약 미러 쓰기와 엇갈려도 기록 보관한 메모의 미러 행이 없다", async () => {
    const p = await bootBoard();
    await readyCheck(p);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const id = runAsUserAction(() => {
      const made = ws().addCardAt("text", 100, 100);
      ws().setContent(made, "새 메모");
      return made;
    }, { creates: true });
    useWorkspace.setState({ editingId: null, selectedIds: [] });
    await pass();
    drag(id, 500, 500);
    await pass();
    expect(um().undoStack.length).toBe(2);
    pressUndo(); // 옮기기 되돌림 — 관찰자가 미러 쓰기를 0.3초 뒤로 예약
    await new Promise((r) => setImmediate(r));
    vi.advanceTimersByTime(300); // 예약 쓰기가 시작된다(saveNote의 get이 진행 중)
    pressUndo(); // 생성 되돌림 — 바로 이어 누름
    vi.useRealTimers();
    await sleep(800);
    expect(note(id)).toBeUndefined();
    expect(await getDB().notes.get(id)).toBeUndefined();
    expect(await getDB().trash.count()).toBe(0);
  });

  it("R5b 삭제 다시 실행이 이미 시작된 0.3초 예약 미러 쓰기와 엇갈려도 메모가 휴지통에만 있다", async () => {
    const p = await bootBoard();
    const id = addMemo(100, 100);
    ws().setContent(id, "글");
    await flushAll();
    await readyCheck(p);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    drag(id, 500, 500);
    await pass();
    ws().remove(id);
    await pass();
    pressUndo(); // 삭제 되돌림
    await pass();
    pressUndo(); // 옮기기 되돌림
    await pass();
    pressUndo(true); // 옮기기 다시 실행 — 미러 쓰기 예약
    await new Promise((r) => setImmediate(r));
    vi.advanceTimersByTime(300); // 예약 쓰기 시작
    pressUndo(true); // 삭제 다시 실행 — 바로 이어 누름
    vi.useRealTimers();
    await sleep(800);
    expect(note(id)).toBeUndefined();
    expect(await getDB().trash.count()).toBe(1);
    expect(await getDB().notes.get(id)).toBeUndefined();
  });

  it("R5c 캔버스 삭제가 이미 시작된 0.3초 미러 쓰기와 엇갈려도 메모가 휴지통에만 있고 마지막 글을 쥔다", async () => {
    const p = await bootBoard();
    const id = addMemo(100, 100);
    ws().setContent(id, "v1");
    await flushAll();
    await readyCheck(p);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    ws().setContent(id, "v2 마지막 글"); // 미러 쓰기 0.3초 뒤 예약
    vi.advanceTimersByTime(300); // 예약 쓰기 시작
    expect(isPersistInFlight(id)).toBe(true);
    ws().remove(id); // 바로 지움
    vi.useRealTimers();
    await sleep(800);
    await idle();
    expect(await getDB().notes.get(id)).toBeUndefined();
    expect(await trashIds()).toEqual([id]);
    expect((await getDB().trash.get(id))?.note.content).toContain("v2 마지막 글");
  });
});

describe("대조군 — 살리기와 cmd+z가 같은 틱에 겹친다", () => {
  async function setupTrashed() {
    const p = await bootBoard();
    const a = addMemo(100, 100);
    const m = addMemo(600, 100);
    await flushAll();
    const cid = await connect(a, m);
    await readyCheck(p);
    ws().remove(m);
    await waitFor(async () => !!(await getDB().trashConnections.get(cid)), "M 휴지통");
    return { a, m, cid };
  }
  const state = async (m: string, cid: string) => ({
    count: ws().cards.filter((c) => c.id === m).length,
    trash: await getDB().trash.count(),
    mirrorM: !!(await getDB().notes.get(m)),
    ...(await where(cid)),
  });

  it("R6 살리기를 누른 같은 틱에 내 cmd+z가 지우기를 되돌린다", async () => {
    const { m, cid } = await setupTrashed();
    const r = ws().restoreFromTrash(m);
    pressUndo();
    await r;
    await sleep(800);
    const s = await state(m, cid);
    expect(s.count).toBe(1);
    expect(s.trash).toBe(0);
    expect(s.trashConn).toBe(false);
    expect(s.drawn).toBe(true);
  });

  it("R7 살린 뒤 cmd+z·cmd+shift+z·cmd+z 같은 틱", async () => {
    const { m, cid } = await setupTrashed();
    await ws().restoreFromTrash(m);
    await sleep(600);
    pressUndo();
    pressUndo(true);
    pressUndo();
    await sleep(900);
    const s = await state(m, cid);
    expect(s.count).toBe(0);
    expect(s.trash).toBe(1);
    expect(s.mirrorM).toBe(false);
    expect(s.trashConn).toBe(true);
    expect(s.mirror).toBe(false);
  });
});
