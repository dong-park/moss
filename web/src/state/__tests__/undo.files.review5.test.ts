/**
 * cmd-z-undo 웨이브 5 코드 리뷰 회귀 — 사진 파일은 무엇이든 그 파일을 가리키는 동안 지우지 않는다.
 *
 * W5-1: 함을 지운 뒤 5초 되돌리기를 기다리는 스냅샷이 가리키는 파일을 청소가 지웠다(파일 규칙 5번).
 * W5-2: 사진 카드를 만든 같은 틱에 다른 보드로 옮기면 미러 행이 kind "text", ref 없음이 됐다.
 * 대조군 R1~R13: 판 삭제 한 사이클과 청소 시점마다 기대한 파일만 지운다.
 *
 * purgeAttachments·deleteBlob·putBlob·getBlob은 실제 함수다. 브라우저 OPFS API만 메모리로 바꾼다.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useWorkspace, __trashIdleForTest } from "@/state/workspace";
import { useStorage } from "@/state/storage";
import { getDB } from "@/state/db/schema";
import { getBlob, putBlob } from "@/state/db/opfs";
import { flushAll } from "@/state/cardPersist";
import { readFrameContent } from "@/state/frameContent";
import { getOrOpenBoardDoc } from "@/state/ydoc/activeDoc";
import { readNote as readNoteIn } from "@/state/ydoc/model";
import {
  addMemo,
  bootBoard,
  card,
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
import { installFakeOPFS } from "./fakeOpfs";

let removed: string[] = [];
beforeEach(() => {
  setupNavigatorStorage();
  removed = installFakeOPFS().removed;
});
afterEach(async () => {
  await __trashIdleForTest();
  await teardown();
});

const A = "opfs:a.png";
const B = "opfs:b.png";
const P = "opfs:p.png";
const idle = () => __trashIdleForTest();
const mirror = (id: string) => getDB().notes.get(id);
const settle = async () => {
  await idle();
  await sleep(50);
  await idle();
};

function photoIn(x: number, y: number, ref: string): string {
  const id = ws().addPhotoAt(x, y, { ref, mediaType: "image/png", naturalW: 100, naturalH: 100 });
  useWorkspace.setState({ editingId: null, selectedIds: [] });
  return id;
}

async function funnel(x = 600, y = 100): Promise<{ h: string; sub: string }> {
  const h = ws().createSubcanvas(x, y);
  await waitFor(() => !!note(h), "H doc");
  const sub = card(h).boardRef!;
  await waitFor(async () => !!(await getDB().boards.get(sub)), "H board row");
  useWorkspace.setState({ editingId: null, selectedIds: [] });
  return { h, sub };
}

/** V에 함 H를 두고 사진 P를 H에 넣는다. P를 만든 단계는 기록에 남아 R을 쥔다. */
async function photoInFunnel(name: string) {
  const v = await bootBoard("V");
  const w = await ws().createBoard("W");
  await ws().setCurrentBoard(v);
  const { h, sub } = await funnel();
  const R = await putBlob(name, new Blob(["photo-bytes"]));
  await readyCheck(v);
  const p = photoIn(100, 100, R);
  await waitFor(async () => (await mirror(p))?.attachmentRef === R, "P mirror");
  await ws().moveCardToSubcanvas(p, h);
  expect((await mirror(p))?.boardId).toBe(sub);
  return { v, w, h, sub, R, p };
}

const deleteFunnel = async (h: string) => {
  ws().remove(h, { deleteConfirmed: true });
  await waitFor(() => !!ws().pendingSubcanvasUndo, "funnel undo pending");
};

const photo = (ref: string, w = 800, h = 800) => ({ ref, mediaType: "image/png", w, h });
function frameWith(ref: string, x = 0, y = 0) {
  const f = ws().addFrameAt(x, y);
  ws().setFrameBackground(f, photo(ref));
  useWorkspace.setState({ editingId: null, selectedIds: [] });
  return f;
}

describe("W5-1 함 삭제 5초 되돌리기 동안 그 안 사진 파일을 지우지 않는다", () => {
  it("1: H를 지운 뒤 cmd+z, 토스트 되돌리기 — H 안 P의 사진 파일이 남는다", async () => {
    const { h, sub, R, p } = await photoInFunnel("p1.png");
    await deleteFunnel(h);
    pressUndo(); // 사용자는 함 삭제를 되돌리려 cmd+z부터 누른다
    await settle();
    await ws().undoSubcanvasRemove(); // 토스트의 되돌리기
    expect((await mirror(p))?.attachmentRef).toBe(R);
    await ws().setCurrentBoard(sub);
    await idle();
    expect(card(p).attachmentRef).toBe(R);
    expect(await getBlob(R)).not.toBeNull();
    expect(removed).not.toContain(R);
  });

  it("2: H를 지운 뒤 다른 보드로 갔다가 토스트 되돌리기 — 사진 파일이 남는다", async () => {
    const { w, h, sub, R, p } = await photoInFunnel("p2.png");
    await deleteFunnel(h);
    await ws().setCurrentBoard(w);
    await settle();
    await ws().undoSubcanvasRemove();
    expect((await mirror(p))?.attachmentRef).toBe(R);
    await ws().setCurrentBoard(sub);
    await idle();
    expect(card(p).attachmentRef).toBe(R);
    expect(await getBlob(R)).not.toBeNull();
  });

  it("3: 함 지우기가 도는 동안 누른 cmd+z도 그 파일을 지우지 않는다", async () => {
    const { h, R, p } = await photoInFunnel("p3.png");
    ws().remove(h, { deleteConfirmed: true });
    pressUndo(); // 스냅샷이 서기 전 — 미러 행이 사라지는 틈
    await waitFor(() => !!ws().pendingSubcanvasUndo, "funnel undo pending");
    await settle();
    await ws().undoSubcanvasRemove();
    expect((await mirror(p))?.attachmentRef).toBe(R);
    expect(await getBlob(R)).not.toBeNull();
  });

  it("4: 토스트를 닫아도 남은 기록 단계가 쥐면 남고, 보드를 떠나 단계가 빠지면 지운다", async () => {
    const { w, h, R } = await photoInFunnel("p4.png");
    await deleteFunnel(h);
    ws().clearSubcanvasUndo();
    await settle();
    expect(await getBlob(R)).not.toBeNull(); // P를 만든 단계가 아직 쥔다
    await ws().setCurrentBoard(w);
    await settle();
    expect(await getBlob(R)).toBeNull();
    expect(removed).toEqual([R]);
  });

  it("5: 단계가 이미 놓은 파일은 토스트를 닫으면 지운다(누수 없음)", async () => {
    const { h, R } = await photoInFunnel("p5.png");
    await deleteFunnel(h);
    pressUndo(); // P 만들기 단계는 건너뛰어져 R을 놓는다 — 스냅샷만 쥔다
    await settle();
    expect(await getBlob(R)).not.toBeNull();
    ws().clearSubcanvasUndo();
    await settle();
    expect(await getBlob(R)).toBeNull();
  });

  it("6: 둘째 함을 지워 첫 스냅샷이 확정되면 첫 함 안 파일을 파일 규칙으로 청소한다", async () => {
    const { h, R } = await photoInFunnel("p6.png");
    const { h: h2 } = await funnel(1200, 100);
    await deleteFunnel(h);
    pressUndo();
    await settle();
    const first = ws().pendingSubcanvasUndo;
    ws().remove(h2, { deleteConfirmed: true });
    await waitFor(() => ws().pendingSubcanvasUndo !== first, "second snapshot");
    await settle();
    expect(await getBlob(R)).toBeNull();
  });
});

describe("W5-1 대조: 함을 지우지 않으면", () => {
  it("0: P를 함 H에 넣고 cmd+z하면 사진 파일이 남는다(미러 행이 가리킨다)", async () => {
    const { sub, R, p } = await photoInFunnel("p0.png");
    pressUndo();
    await idle();
    await ws().setCurrentBoard(sub);
    await idle();
    expect(card(p).attachmentRef).toBe(R);
    expect(await getBlob(R)).not.toBeNull();
  });
});

describe("W5-2 만든 직후 다른 보드로 옮긴 사진", () => {
  it.each([
    ["W를 거쳐", true, 0],
    ["Q로 바로", false, 0],
    ["W 1틱", true, 1],
    ["W 5ms", true, 5],
    ["W 30ms", true, 30],
  ])("P를 만들고 바로 Q로 옮긴 뒤 V를 떠나(%s) Q를 열면 사진 파일이 남는다", async (_l, viaW, gap) => {
    const v = await bootBoard("V");
    const q = await ws().createBoard("Q");
    const w = await ws().createBoard("W");
    await ws().setCurrentBoard(v);
    const R = await putBlob("m.png", new Blob(["photo-bytes"]));
    await readyCheck(v);
    const p = photoIn(100, 100, R);
    if (gap === 1) await new Promise((r) => setImmediate(r));
    else if (gap) await sleep(gap as number);
    await ws().moveCardToBoard(p, q);
    const row = await mirror(p);
    expect(row?.kind).toBe("photo");
    expect(row?.boardId).toBe(q);
    expect(row?.attachmentRef).toBe(R);
    if (viaW) {
      await ws().setCurrentBoard(w);
      await idle();
    }
    await ws().setCurrentBoard(q);
    await idle();
    expect(card(p).attachmentRef).toBe(R);
    expect(await getBlob(R)).not.toBeNull();
  });

  it("R8 같은 틱에 만들고 옮긴 뒤 떠나도 파일이 남는다", async () => {
    const r = await raceCase(0);
    expect(r.mirror?.kind).toBe("photo");
    expect(r.mirror?.attachmentRef).toBe(P);
    expect(r.inQ).toBe(P);
    expect(r.removed).not.toContain(P);
  });

  it("R9 50ms 뒤 옮겨도 파일이 남는다", async () => {
    const r = await raceCase(50);
    expect(r.removed).not.toContain(P);
  });

  it("같은 틱에 함 안으로 옮겨도 미러 행이 사진이고 파일이 남는다", async () => {
    const v = await bootBoard("V");
    const w = await ws().createBoard("W");
    await ws().setCurrentBoard(v);
    const { h, sub } = await funnel();
    await readyCheck(v);
    const p = photoIn(100, 100, P);
    await ws().moveCardToSubcanvas(p, h);
    const row = await mirror(p);
    expect(row?.kind).toBe("photo");
    expect(row?.boardId).toBe(sub);
    expect(row?.attachmentRef).toBe(P);
    await ws().setCurrentBoard(w);
    await settle();
    expect(removed).not.toContain(P);
  });

  it("같은 틱에 새 보드로 올려도 미러 행이 사진이고 새 보드를 가리킨다", async () => {
    const v = await bootBoard("V");
    await readyCheck(v);
    const p = photoIn(100, 100, P);
    const nb = await ws().promoteCardToNewBoard(p, "N");
    const row = await mirror(p);
    expect(row?.kind).toBe("photo");
    expect(row?.boardId).toBe(nb);
    expect(row?.attachmentRef).toBe(P);
  });
});

async function raceCase(gapMs: number) {
  const v = await bootBoard("V");
  const q = await ws().createBoard("Q");
  const w = await ws().createBoard("W");
  await ws().setCurrentBoard(v);
  await readyCheck(v);
  const p = ws().addPhotoAt(100, 100, { ref: P, mediaType: "image/png", naturalW: 10, naturalH: 10 });
  if (gapMs > 0) await sleep(gapMs);
  await ws().moveCardToBoard(p, q);
  await ws().setCurrentBoard(w);
  await settle();
  const qd = getOrOpenBoardDoc(q);
  await qd.whenLoaded;
  return {
    removed: [...removed],
    mirror: await mirror(p),
    inQ: readNoteIn(qd.doc, p)?.attachmentRef,
  };
}

describe("W5-1 R10 검토자 ① 재현", () => {
  it("R10 P를 H에 넣고 H를 지운 뒤 cmd+z, 토스트 되돌리기: P 파일이 남는다", async () => {
    const v = await bootBoard("V");
    const h = ws().createSubcanvas(600, 100);
    for (let i = 0; i < 100 && !note(h); i++) await sleep(20);
    useWorkspace.setState({ editingId: null, selectedIds: [] });
    await readyCheck(v);
    const p = ws().addPhotoAt(100, 100, { ref: P, mediaType: "image/png", naturalW: 10, naturalH: 10 });
    useWorkspace.setState({ editingId: null, selectedIds: [] });
    await sleep(100);
    await ws().moveCardToSubcanvas(p, h);
    expect((await mirror(p))?.attachmentRef).toBe(P);
    await deleteFunnel(h);
    pressUndo();
    await settle();
    await ws().undoSubcanvasRemove();
    expect((await mirror(p))?.attachmentRef).toBe(P);
    expect(removed).not.toContain(P);
  });

  it("R10b cmd+z 대신 보드를 떠나도 P 파일이 남는다", async () => {
    const v = await bootBoard("V");
    const w = await ws().createBoard("W");
    await ws().setCurrentBoard(v);
    const h = ws().createSubcanvas(600, 100);
    for (let i = 0; i < 100 && !note(h); i++) await sleep(20);
    useWorkspace.setState({ editingId: null, selectedIds: [] });
    await readyCheck(v);
    const p = ws().addPhotoAt(100, 100, { ref: P, mediaType: "image/png", naturalW: 10, naturalH: 10 });
    useWorkspace.setState({ editingId: null, selectedIds: [] });
    await sleep(100);
    await ws().moveCardToSubcanvas(p, h);
    await deleteFunnel(h);
    await ws().setCurrentBoard(w);
    await settle();
    await ws().undoSubcanvasRemove();
    expect((await mirror(p))?.attachmentRef).toBe(P);
    expect(removed).not.toContain(P);
  });
});

describe("대조 R1~R2 판 삭제", () => {
  it("R1 지우기·되돌리기·다시 실행·되돌리기가 판·배경·소속을 지키고 한 단계씩이다", async () => {
    const v = await bootBoard("V");
    const f = frameWith(A);
    ws().resizeFrame(f, { width: 1000, height: 1000, baseWidth: 1000 });
    const m1 = addMemo(100, 100);
    ws().resolveMembership([m1]);
    expect(card(m1).frameId).toBe(f);
    await readyCheck(v);
    ws().deleteFrame(f);
    expect(um().undoStack.length).toBe(1);
    pressUndo();
    await idle();
    expect(note(f)?.attachmentRef).toBe(A);
    expect(note(m1)?.frameId).toBe(f);
    pressUndo(true);
    await idle();
    expect(note(f)).toBeUndefined();
    expect(note(m1)?.frameId).toBeUndefined();
    expect(card(m1).frameId).toBeUndefined();
    pressUndo();
    await idle();
    expect(note(f)?.attachmentRef).toBe(A);
    expect(card(f).attachmentRef).toBe(A);
    expect(card(m1).frameId).toBe(f);
    expect(um().undoStack.length).toBe(0);
    expect(um().redoStack.length).toBe(1);
    await sleep(400);
    await flushAll();
    await idle();
    expect((await mirror(f))?.attachmentRef).toBe(A);
    expect((await mirror(m1))?.frameId).toBe(f);
    expect(removed).toEqual([]);
  });

  it("R2 판 둘을 한 번에 지우면 한 단계, 되돌리면 배경 둘, 보드를 떠나도 안 지운다", async () => {
    const v = await bootBoard("V");
    const q = await ws().createBoard("Q");
    await ws().setCurrentBoard(v);
    const f1 = frameWith(A, 0, 0);
    const f2 = frameWith(B, 2000, 0);
    await readyCheck(v);
    ws().removeSelected([f1, f2]);
    expect(um().undoStack.length).toBe(1);
    pressUndo();
    await idle();
    expect(note(f1)?.attachmentRef).toBe(A);
    expect(note(f2)?.attachmentRef).toBe(B);
    await ws().setCurrentBoard(q);
    await settle();
    expect(removed).toEqual([]);
  });
});

describe("대조 R3 배경 교체 크기", () => {
  it("R3 A(800x800)를 B(800x200)로 바꾸면 판이 줄고, 되돌리기 한 번이 배경·높이·소속을 되살린다", async () => {
    const v = await bootBoard("V");
    const f = frameWith(A);
    ws().resizeFrame(f, { width: 1000, height: 1000, baseWidth: 1000 });
    const h0 = card(f).height;
    const m = addMemo(card(f).x + 100, card(f).y + 600);
    ws().resolveMembership([m]);
    expect(card(m).frameId).toBe(f);
    await readyCheck(v);
    ws().setFrameBackground(f, photo(B, 800, 200));
    const h1 = card(f).height;
    expect(h1!).toBeLessThan(h0!);
    const after = card(m).frameId;
    await sleep(50);
    expect(um().undoStack.length).toBe(1);
    pressUndo();
    await idle();
    expect(note(f)?.attachmentRef).toBe(A);
    expect(card(f).height).toBe(h0);
    expect(readFrameContent(card(f).content).bg).toEqual({ w: 800, h: 800 });
    expect(card(m).frameId).toBe(f);
    pressUndo(true);
    await idle();
    expect(note(f)?.attachmentRef).toBe(B);
    expect(card(f).height).toBe(h1);
    expect(card(m).frameId).toBe(after);
  });
});

describe("대조 R4~R7 보드를 떠날 때", () => {
  it("R4 A를 B로 바꾸고 되돌린 뒤 바로 떠나면 B만 지운다", async () => {
    const v = await bootBoard("V");
    const q = await ws().createBoard("Q");
    await ws().setCurrentBoard(v);
    const f = frameWith(A);
    await readyCheck(v);
    ws().setFrameBackground(f, photo(B));
    pressUndo();
    await ws().setCurrentBoard(q);
    await idle();
    expect(removed).toEqual([B]);
    expect((await mirror(f))?.attachmentRef).toBe(A);
  });

  it("R5 판을 지우고 떠나면 A를 지운다(누수 없음)", async () => {
    const v = await bootBoard("V");
    const q = await ws().createBoard("Q");
    await ws().setCurrentBoard(v);
    const f = frameWith(A);
    await readyCheck(v);
    ws().deleteFrame(f);
    await ws().setCurrentBoard(q);
    await idle();
    expect(removed).toEqual([A]);
  });

  it("R6 사진 만들기를 되돌리고 떠나면 P를 지운다(누수 없음)", async () => {
    const v = await bootBoard("V");
    const q = await ws().createBoard("Q");
    await ws().setCurrentBoard(v);
    await readyCheck(v);
    const p = ws().addPhotoAt(100, 100, { ref: P, mediaType: "image/png", naturalW: 10, naturalH: 10 });
    useWorkspace.setState({ editingId: null, selectedIds: [] });
    await sleep(50);
    pressUndo();
    await idle();
    expect(note(p)).toBeUndefined();
    await ws().setCurrentBoard(q);
    await idle();
    expect(removed).toEqual([P]);
  });

  it("R7 판을 닫힌 보드 Q로 옮기고 V를 떠나면 B는 남고(Q 미러) A는 지운다", async () => {
    const v = await bootBoard("V");
    const q = await ws().createBoard("Q");
    const w = await ws().createBoard("W");
    await ws().setCurrentBoard(v);
    const f = frameWith(A);
    await readyCheck(v);
    ws().setFrameBackground(f, photo(B));
    await sleep(400);
    await flushAll();
    await ws().moveCardToBoard(f, q);
    await ws().setCurrentBoard(w);
    await idle();
    expect(removed).toEqual([A]);
    expect(useStorage.getState().initialized).toBe(true);
  });
});

describe("대조 R12~R13 T18 첫째·둘째", () => {
  it("R12 깊이 상한이 A→B 단계를 밀어내면 A만 지운다", async () => {
    const v = await bootBoard("V");
    const f = frameWith(A);
    const m = addMemo(3000, 3000);
    await readyCheck(v);
    ws().setFrameBackground(f, photo(B));
    for (let i = 0; i < 100; i++) {
      ws().moveCard(m, 4000 + i, 3000);
      ws().commitMove([m]);
    }
    expect(um().undoStack.length).toBe(100);
    await idle();
    expect(removed).toEqual([A]);
  });

  it("R13 A→B를 되돌린 뒤 새 동작으로 다시 실행을 버리면 B만 지운다", async () => {
    const v = await bootBoard("V");
    const f = frameWith(A);
    const m = addMemo(3000, 3000);
    await readyCheck(v);
    ws().setFrameBackground(f, photo(B));
    pressUndo();
    ws().moveCard(m, 4000, 3000);
    ws().commitMove([m]);
    await idle();
    expect(removed).toEqual([B]);
    expect(note(f)?.attachmentRef).toBe(A);
  });
});
