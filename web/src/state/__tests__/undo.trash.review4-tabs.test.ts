/**
 * cmd-z-undo 웨이브 4 코드 리뷰 3바퀴 회귀 시험 — 같은 기기 다른 탭의 삭제를 받는 탭은 미러 행을
 * 지우지 않는다. 다른 보드로 옮겼거나 바로 살린 메모의 미러 행이 남아야 한다(R3-1·R3-3).
 * R3-2는 같은 틱에 만들고 지운 연결선의 대조군이다.
 * 탭1의 Dexie 쪽은 vi.resetModules로 따로 불러온 실제 storage 모듈(다른 Dexie 연결)이다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { __trashIdleForTest } from "@/state/workspace";
import { getDB } from "@/state/db/schema";
import { flushAll } from "@/state/cardPersist";
import { readConnection, readNote } from "@/state/ydoc/model";
import { applyIncoming } from "@/state/db/liveSync";
import { docKeyForBoard } from "@/state/ydoc/activeDoc";
import { useToasts } from "@/state/notifications";
import {
  addMemo, bootBoard, doc, readyCheck, setupNavigatorStorage, sleep, teardown, waitFor, ws,
} from "@/components/workspace/__tests__/undoTestKit";

let tab1Db: { close: () => void } | null = null;
beforeEach(() => {
  setupNavigatorStorage();
  useToasts.getState().clear();
});
afterEach(async () => {
  tab1Db?.close();
  tab1Db = null;
  await __trashIdleForTest();
  await teardown();
});
const idle = () => __trashIdleForTest();

describe("adv-B r3", () => {
  it("R3-1: 다른 탭이 메모 X를 보드 Q로 옮기면, 받는 탭이 X의 미러 행(boardId Q)을 지운다", async () => {
    const p = await bootBoard("P");
    const q = await ws().createBoard("Q");
    await ws().setCurrentBoard(p);
    const x = addMemo(100, 100);
    ws().setContent(x, "옮길 메모");
    await flushAll();
    await waitFor(async () => (await getDB().notes.get(x))?.content?.includes("옮길") ?? false, "X 미러");
    await readyCheck(p);
    const key = docKeyForBoard(p);
    const tab1 = new Y.Doc();
    Y.applyUpdate(tab1, Y.encodeStateAsUpdate(doc()));
    // 탭1 = 다른 Dexie 연결의 실제 storage. moveCardToBoard의 순서: 미러 saveNote(boardId Q) → 문서 사이 옮기기.
    vi.resetModules();
    const fresh = await import("@/state/storage");
    tab1Db = (await import("@/state/db/schema")).getDB();
    await fresh.useStorage.getState().saveNote({ id: x, boardId: q, frameId: undefined });
    expect((await getDB().notes.get(x))?.boardId).toBe(q);
    tab1.transact(() => tab1.getMap("notes").delete(x), "tab1-move");
    applyIncoming({ type: "ydoc-update", key, update: Y.encodeStateAsUpdate(tab1, Y.encodeStateVector(doc())), origin: "tab-1" });
    expect(ws().cards.some((c) => c.id === x)).toBe(false);
    await idle();
    await sleep(500);
    await idle();
    const row = await getDB().notes.get(x);
    console.log("R3-1", JSON.stringify({ mirror: row ? { boardId: row.boardId, content: row.content } : null, trash: !!(await getDB().trash.get(x)) }));
    expect(row?.boardId).toBe(q);
  });

  it("R3-3: 다른 탭이 M을 지우고 바로 살릴 때, 받는 탭이 두 방송 사이에 보드를 떠나면 보드에 있는 M의 미러 행이 없다", async () => {
    const p = await bootBoard("P");
    const q = await ws().createBoard("Q");
    await ws().setCurrentBoard(p);
    const m = addMemo(100, 100);
    ws().setContent(m, "살릴 메모");
    await flushAll();
    await waitFor(async () => (await getDB().notes.get(m))?.content?.includes("살릴") ?? false, "M 미러");
    await readyCheck(p);
    const key = docKeyForBoard(p);
    const tab1 = new Y.Doc();
    Y.applyUpdate(tab1, Y.encodeStateAsUpdate(doc()));
    const send = () => applyIncoming({ type: "ydoc-update", key, update: Y.encodeStateAsUpdate(tab1, Y.encodeStateVector(doc())), origin: "tab-1" });
    vi.resetModules();
    const freshTrash = await import("@/state/undoTrash");
    const freshStorage = await import("@/state/storage");
    tab1Db = (await import("@/state/db/schema")).getDB();
    const snap = readNote(tab1, m)!;
    // 탭1: 캔버스 remove(실제 trashNotesFromDoc) → 방송 1
    tab1.transact(() => tab1.getMap("notes").delete(m), "me");
    await freshTrash.trashNotesFromDoc(tab1, [{ note: { ...snap, lastVisitedAt: Date.now() } as never, connections: [] }]);
    send();
    // 탭1: 휴지통 살리기(실제 restoreNote: 휴지통 행 빼고 미러 쓰기) + 문서에 다시 쓰기 → 방송 2(아직 안 닿음)
    const restored = await freshStorage.useStorage.getState().restoreNote(m, { boardId: p, x: 0, y: 0 });
    const { putNote } = await import("@/state/ydoc/model");
    tab1.transact(() => putNote(tab1, restored), "me");
    await idle(); // 받는 탭의 미러 치우기가 돈다
    const mid = !!(await getDB().notes.get(m));
    await ws().setCurrentBoard(q); // 두 방송 사이에 보드를 떠난다
    send(); // 방송 2 — 다른 보드라 안 받는다
    await sleep(500);
    await idle();
    const end = { inTab1Doc: !!readNote(tab1, m), mirror: !!(await getDB().notes.get(m)), trash: !!(await getDB().trash.get(m)) };
    console.log("R3-3", JSON.stringify({ mirrorAfterArchive: mid, end }));
    expect(end.mirror).toBe(true);
  });

  it("R3-2: connectCards 직후 같은 틱 removeConnection — 30번 모두 문서·미러에 선이 남지 않는다", async () => {
    const p = await bootBoard("P");
    const a = addMemo(100, 100);
    const b = addMemo(600, 100);
    await flushAll();
    await waitFor(async () => !!(await getDB().notes.get(a)) && !!(await getDB().notes.get(b)), "미러");
    await readyCheck(p);
    const ids: string[] = [];
    for (let i = 0; i < 30; i++) {
      const cid = ws().connectCards(a, "right", b, "left")!;
      ws().removeConnection(cid);
      ids.push(cid);
      await sleep(i % 3 === 0 ? 0 : 5);
    }
    await sleep(1500);
    const leftDoc = ids.filter((id) => !!readConnection(doc(), id));
    const leftMirror: string[] = [];
    for (const id of ids) if (await getDB().connections.get(id)) leftMirror.push(id);
    console.log("R3-2", JSON.stringify({ leftDoc: leftDoc.length, leftMirror: leftMirror.length, store: ws().connections.length }));
    expect(leftDoc.length + leftMirror.length).toBe(0);
  });
});

void readNote;
