/**
 * cmd-z-undo n6 — 판과 사진 파일을 되돌린다(T15 행 전체, T16, T17, T18, T19).
 *
 * 캔버스 cmd+z 시험은 spec.md 「준비 확인」 공통 규칙을 따른다: 준비 → getter로 clear → 실제 시간
 * 0.6초 → 지금 보드와 undoStack 0. then이 결과를 보는 내 탭 동작(지웠다·살렸다·옮겼다·바꿨다)은
 * 준비 확인 뒤에 스토어 액션으로 한다. 다른 탭의 동작은 그쪽 Y.Doc에서 하고 update로 이어 붙인다.
 * 가짜 타이머는 준비 확인 뒤 setTimeout·clearTimeout·Date만 바꿔 켠다.
 *
 * 파일 삭제는 frameBackground.test.ts 방식으로 센다 — purgeAttachments가 실제 파일 삭제 경로다.
 * 「저장소에 남아 있음」은 지운 ref 목록에 없다는 뜻이다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { useWorkspace, __trashIdleForTest } from "@/state/workspace";
import { useStorage } from "@/state/storage";
import { useAuth } from "@/state/auth";
import { getDB } from "@/state/db/schema";
import { flushAll } from "@/state/cardPersist";
import { readFrameContent } from "@/state/frameContent";
import {
  deleteConnection,
  readConnection,
  readNotes,
  updateNoteFields,
} from "@/state/ydoc/model";
import { UNTRACKED_ORIGIN } from "@/state/ydoc/origin";
import { getActiveBoardDoc } from "@/state/ydoc/activeDoc";
import {
  beginUndoGroup,
  endUndoGroup,
  getBoardUndoManager,
  readFileStep,
  registerUndoStepHooks,
} from "@/state/ydoc/undo";
import { useToasts } from "@/state/notifications";
import { useMemoTable } from "@/state/memoTable";
import {
  addMemo,
  bootBoard,
  card,
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

const realPurge = useStorage.getState().purgeAttachments;
let purged: string[] = [];

beforeEach(() => {
  setupNavigatorStorage();
  useToasts.getState().clear();
  purged = [];
});

afterEach(async () => {
  vi.useRealTimers();
  await __trashIdleForTest();
  vi.restoreAllMocks();
  useStorage.setState({ purgeAttachments: realPurge });
  useAuth.setState({ session: null, user: null, status: "anonymous" });
  await teardown();
});

/* ── 도우미 ─────────────────────────────────────────────────────── */

const A = "opfs:a.png";
const B = "opfs:b.png";
const C = "opfs:c.png";
const P_REF = "opfs:p.png";

const fake = () => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
const idle = () => __trashIdleForTest();
const has = (id: string) => ws().cards.some((c) => c.id === id);
const drawn = (cid: string) => ws().connections.some((c) => c.id === cid);
const trashIds = async () => (await getDB().trash.toArray()).map((e) => e.id).sort();
const trashConnIds = async () => (await getDB().trashConnections.toArray()).map((c) => c.id).sort();
const pos = (id: string) => ({ x: note(id)?.x, y: note(id)?.y });
const mirrorRef = async (id: string) => (await getDB().notes.get(id))?.attachmentRef;
/** A, B, C는 크기와 형식이 같은 사진이다(T18 여덟째). */
const photo = (ref: string) => ({ ref, mediaType: "image/png", w: 800, h: 800 });

/** 파일 삭제 호출을 센다. 실제 삭제는 하지 않는다. */
function spyPurge() {
  vi.spyOn(useStorage.getState(), "purgeAttachments").mockImplementation(async (notes) => {
    for (const n of notes) if (n.attachmentRef) purged.push(n.attachmentRef);
  });
}

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

/** 다른 동작 하나 — 메모 옮기기(commitMove가 단계를 연다). */
let nudge = 0;
function otherAction(id: string) {
  nudge += 1;
  ws().moveCard(id, 3000 + nudge, 3000);
  ws().commitMove([id]);
}

/** 배경 사진 A가 있는 판 F. */
function frameWith(ref: string, x = 0, y = 0): string {
  const f = ws().addFrameAt(x, y);
  ws().setFrameBackground(f, photo(ref));
  useWorkspace.setState({ editingId: null, selectedIds: [] });
  return f;
}

function addPhoto(x: number, y: number, ref = P_REF): string {
  const id = ws().addPhotoAt(x, y, { ref, mediaType: "image/png", naturalW: 100, naturalH: 100 });
  useWorkspace.setState({ editingId: null, selectedIds: [] });
  return id;
}

/** 다른 탭 — 지금 보드 문서를 받아 둔 Y.Doc. */
function peer(): Y.Doc {
  const d = new Y.Doc();
  Y.applyUpdate(d, Y.encodeStateAsUpdate(doc()));
  return d;
}

/** 그쪽의 새 쓰기를 내 문서에 이어 붙인다(원격 origin). */
function pushFrom(d: Y.Doc) {
  Y.applyUpdate(doc(), Y.encodeStateAsUpdate(d, Y.encodeStateVector(doc())), "remote-peer");
}

/**
 * 파일 규칙 넷 가운데 하나라도 가리키는 파일은 지워지지 않았다 — 모든 보드의 미러 행, 열린 보드
 * 문서, 휴지통 행, 이 탭의 남은 기록 단계. 시험이 따로 모은다.
 */
async function expectLiveFilesKept() {
  await flushAll();
  await idle();
  const live = new Set<string>();
  for (const n of await getDB().notes.toArray()) if (n.attachmentRef) live.add(n.attachmentRef);
  for (const e of await getDB().trash.toArray()) if (e.note.attachmentRef) live.add(e.note.attachmentRef);
  const d = getActiveBoardDoc()?.doc;
  if (d) for (const n of readNotes(d)) if (n.attachmentRef) live.add(n.attachmentRef);
  const m = getBoardUndoManager();
  if (m) for (const it of [...m.undoStack, ...m.redoStack]) for (const r of readFileStep(it)) live.add(r);
  expect(purged.filter((r) => live.has(r))).toEqual([]);
}

/* ── T15 ────────────────────────────────────────────────────────── */

describe("T15 휴지통에서 살린 메모를 되돌리면 메모가 휴지통으로 돌아간다", () => {
  it("첫째: 살린 A를 cmd+z하면 보드에서 사라지고 휴지통 1개, cmd+shift+z하면 다시 보드에 있고 휴지통 0", async () => {
    const v = await bootBoard("V");
    const a = addMemo(100, 100);
    await flushAll();
    await settle(async () => !!(await getDB().notes.get(a)), "A 미러");
    ws().remove(a);
    await settle(async () => !!(await getDB().trash.get(a)), "A 휴지통");
    await readyCheck(v);

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
    expect(ws().trashCount).toBe(0);
  });

  it("둘째: 살린 사진 카드 P를 cmd+z하고 휴지통을 비운 뒤 cmd+shift+z하면 P와 사진이 보이고 휴지통 0", async () => {
    const v = await bootBoard("V");
    spyPurge();
    const p = addPhoto(100, 100);
    await flushAll();
    await settle(async () => !!(await getDB().notes.get(p)), "P 미러");
    ws().remove(p);
    await settle(async () => !!(await getDB().trash.get(p)), "P 휴지통");
    await readyCheck(v);

    await ws().restoreFromTrash(p);
    expect(has(p)).toBe(true);
    expect(pressUndo()).toBe(true);
    await idle();
    expect(has(p)).toBe(false);
    expect(await trashIds()).toEqual([p]);

    await useStorage.getState().purgeTrash();
    expect(await getDB().trash.count()).toBe(0);

    expect(pressUndo(true)).toBe(true);
    await idle();
    expect(has(p)).toBe(true);
    expect(note(p)?.attachmentRef).toBe(P_REF);
    expect(card(p).attachmentRef).toBe(P_REF);
    expect(await getDB().trash.count()).toBe(0);
    expect(purged).not.toContain(P_REF);
    await expectLiveFilesKept();
  });

  it("셋째: B와 이어진 C를 살린 뒤 cmd+z 1번이면 C와 연결선이 사라지고 휴지통에 C 1행·연결선 1행, B는 남는다", async () => {
    const v = await bootBoard("V");
    const b = addMemo(100, 100);
    const c = addMemo(600, 100);
    await flushAll();
    const cid = await connect(b, c);
    ws().remove(c);
    await settle(async () => (await trashConnIds()).includes(cid), "C·연결선 휴지통");
    await readyCheck(v);

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

  it("넷째: 원래 보드 Q로 E를 살리면 E–S 연결선이 V 문서에 쓰이지만 V undoStack은 그대로, cmd+z는 X만 되돌린다", async () => {
    const v = await bootBoard("V");
    const q = await ws().createBoard("Q");
    await ws().setCurrentBoard(v);
    const s = addMemo(100, 100);
    const e = addMemo(600, 100);
    const x = addMemo(100, 600);
    await flushAll();
    const cid = await connect(s, e); // source는 V의 S
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
    const cid = await connect(s, g); // source는 S
    await useMemoTable.getState().ensureLoaded();
    useToasts.getState().clear();
    useMemoTable.getState().setSelectedIds(new Set([g]));
    await useMemoTable.getState().trashSelected();
    deleteConnection(doc(), cid, UNTRACKED_ORIGIN);
    await readyCheck(v);
    expect(readConnection(doc(), cid)).toBeUndefined();
    expect(await trashConnIds()).toEqual([cid]);

    const n0 = um().undoStack.length;
    const toast = useToasts.getState().toasts.at(-1);
    await toast!.action!.onClick();
    await waitFor(() => !!readConnection(doc(), cid), "연결선 V 문서");
    expect(um().undoStack.length).toBe(n0);
  });
});

/* ── T16 ────────────────────────────────────────────────────────── */

describe("T16 지운 판을 되돌리면 판, 멤버 소속, 배경 사진이 돌아온다", () => {
  it("배경 사진과 멤버 2개가 든 판 F를 지우고 cmd+z 1번이면 F가 같은 자리, 멤버가 F 소속, 파일이 남는다", async () => {
    const v = await bootBoard("V");
    spyPurge();
    const f = frameWith(A);
    ws().resizeFrame(f, { width: 1000, height: 1000, baseWidth: 1000 });
    const m1 = addMemo(100, 100);
    const m2 = addMemo(500, 100);
    ws().resolveMembership([m1, m2]);
    expect(card(m1).frameId).toBe(f);
    expect(card(m2).frameId).toBe(f);
    await readyCheck(v);
    const at = pos(f);
    const trash0 = await getDB().trash.count();

    ws().deleteFrame(f);
    expect(um().undoStack.length).toBe(1);
    expect(note(f)).toBeUndefined();
    expect(note(m1)?.frameId).toBeUndefined();
    expect(card(m2).frameId).toBeUndefined();
    await sleep(400);
    await idle();
    expect(purged).toEqual([]); // 판을 지워도 배경 파일을 바로 지우지 않는다

    expect(pressUndo()).toBe(true);
    await idle();
    expect(pos(f)).toEqual(at);
    expect(note(f)?.attachmentRef).toBe(A);
    expect(card(f).attachmentRef).toBe(A);
    expect(readFrameContent(card(f).content).bg).toEqual({ w: 800, h: 800 });
    expect(note(m1)?.frameId).toBe(f);
    expect(note(m2)?.frameId).toBe(f);
    expect(card(m1).frameId).toBe(f);
    expect(card(m2).frameId).toBe(f);
    expect(await getDB().trash.count()).toBe(trash0);
    await sleep(400);
    await flushAll();
    await idle();
    expect(await mirrorRef(f)).toBe(A);
    expect(purged).toEqual([]);
    await expectLiveFilesKept();
  });
});

/* ── T17 ────────────────────────────────────────────────────────── */

describe("T17 판 배경을 바꾼 뒤 되돌리면 옛 사진이, 다시 실행하면 새 사진이 보인다", () => {
  it("A에서 B로 바꾸고 cmd+z면 A, cmd+shift+z면 B, 두 파일 모두 남는다", async () => {
    const v = await bootBoard("V");
    spyPurge();
    const f = frameWith(A);
    await readyCheck(v);

    ws().setFrameBackground(f, photo(B));
    expect(note(f)?.attachmentRef).toBe(B);
    expect(pressUndo()).toBe(true);
    expect(note(f)?.attachmentRef).toBe(A);
    expect(card(f).attachmentRef).toBe(A);
    expect(pressUndo(true)).toBe(true);
    expect(note(f)?.attachmentRef).toBe(B);
    expect(card(f).attachmentRef).toBe(B);
    await sleep(400);
    await flushAll();
    await idle();
    expect(purged).toEqual([]);
    await expectLiveFilesKept();
  });

  it("배경 지우기를 cmd+z하면 A가 돌아오고 cmd+shift+z하면 다시 빈다. A 파일은 남는다", async () => {
    const v = await bootBoard("V");
    spyPurge();
    const f = frameWith(A);
    await readyCheck(v);

    ws().clearFrameBackground(f);
    expect(note(f)?.attachmentRef).toBeUndefined();
    expect(pressUndo()).toBe(true);
    expect(note(f)?.attachmentRef).toBe(A);
    expect(card(f).attachmentRef).toBe(A);
    expect(readFrameContent(card(f).content).bg).toEqual({ w: 800, h: 800 });
    expect(pressUndo(true)).toBe(true);
    expect(note(f)?.attachmentRef).toBeUndefined();
    await sleep(400);
    await flushAll();
    await idle();
    expect(purged).toEqual([]);
    await expectLiveFilesKept();
  });
});

/* ── T18 ────────────────────────────────────────────────────────── */

describe("T18 사진 파일은 기록에서 빠지고 어디에서도 안 쓸 때만 지운다", () => {
  it("첫째: A→B 뒤 다른 동작 100개로 그 단계를 밀어내면 A 파일만 지운다(0.3초 안 청소)", async () => {
    const v = await bootBoard("V");
    spyPurge();
    const f = frameWith(A);
    addPhoto(2000, 100);
    const m = addMemo(3000, 3000);
    await readyCheck(v);
    fake();

    ws().setFrameBackground(f, photo(B));
    expect(await mirrorRef(f)).toBe(A); // 미러 쓰기는 아직 예약 중 — 청소가 먼저 내보내야 한다
    for (let i = 0; i < 99; i++) otherAction(m);
    expect(um().undoStack.length).toBe(100);
    await idle();
    expect(purged).toEqual([]);
    otherAction(m); // 101번째 — A→B 단계가 기록 밖으로 빠진다
    expect(um().undoStack.length).toBe(100);
    await idle();
    expect(purged).toEqual([A]);
    expect(note(f)?.attachmentRef).toBe(B);
    await expectLiveFilesKept();
  });

  it("둘째: A→B를 되돌린 뒤 새 동작으로 다시 실행 기록을 버리면 B 파일만 지운다(0.3초 안 청소)", async () => {
    const v = await bootBoard("V");
    spyPurge();
    const f = frameWith(A);
    addPhoto(2000, 100);
    const m = addMemo(3000, 3000);
    await readyCheck(v);
    fake();

    ws().setFrameBackground(f, photo(B));
    expect(pressUndo()).toBe(true);
    expect(note(f)?.attachmentRef).toBe(A);
    expect(um().redoStack.length).toBe(1);
    otherAction(m);
    expect(um().redoStack.length).toBe(0);
    await idle();
    expect(purged).toEqual([B]);
    expect(note(f)?.attachmentRef).toBe(A);
    await expectLiveFilesKept();
  });

  it("셋째: P를 지우고 휴지통을 비운 뒤 cmd+z하면 되살아난 P에 사진이 보인다", async () => {
    const v = await bootBoard("V");
    spyPurge();
    frameWith(A);
    const p = addPhoto(2000, 100);
    await flushAll();
    await readyCheck(v);
    fake();

    ws().remove(p);
    await settle(async () => !!(await getDB().trash.get(p)), "P 휴지통");
    await useStorage.getState().purgeTrash();
    expect(await getDB().trash.count()).toBe(0);
    expect(pressUndo()).toBe(true);
    await idle();
    expect(has(p)).toBe(true);
    expect(note(p)?.attachmentRef).toBe(P_REF);
    expect(purged).not.toContain(P_REF);
    await expectLiveFilesKept();
  });

  it("넷째: A→B 기록이 남은 채 다른 보드로 떠나면 기록을 비운 뒤 청소가 돌아 A만 지우고 B는 남는다(0.3초 안)", async () => {
    const v = await bootBoard("V");
    const q = await ws().createBoard("Q");
    await ws().setCurrentBoard(v);
    spyPurge();
    const f = frameWith(A);
    addPhoto(2000, 100);
    await readyCheck(v);
    const old = um();
    const left: number[] = [];
    const off = registerUndoStepHooks({
      onDropped: () => left.push(old.undoStack.length + old.redoStack.length),
    });
    fake();

    ws().setFrameBackground(f, photo(B));
    expect(await mirrorRef(f)).toBe(A); // 미러 쓰기는 아직 예약 중
    await ws().setCurrentBoard(q);
    off();
    expect(ws().currentBoardId).toBe(q);
    expect(left).toEqual([0]); // 청소를 걸 때 기록은 이미 비었다
    await idle();
    expect(purged).toEqual([A]);
    expect(await mirrorRef(f)).toBe(B);
    await expectLiveFilesKept();
  });

  it("다섯째: P를 지우고 다른 보드로 떠났다 돌아와 휴지통에서 살리면 P에 사진이 보인다", async () => {
    const v = await bootBoard("V");
    const q = await ws().createBoard("Q");
    await ws().setCurrentBoard(v);
    spyPurge();
    frameWith(A);
    const p = addPhoto(2000, 100);
    await flushAll();
    await readyCheck(v);
    fake();

    ws().remove(p);
    await settle(async () => !!(await getDB().trash.get(p)), "P 휴지통");
    await ws().setCurrentBoard(q);
    await idle();
    await ws().setCurrentBoard(v);
    await idle();
    await ws().restoreFromTrash(p);
    await idle();
    expect(has(p)).toBe(true);
    expect(card(p).attachmentRef).toBe(P_REF);
    expect(note(p)?.attachmentRef).toBe(P_REF);
    expect(purged).not.toContain(P_REF);
    await expectLiveFilesKept();
  });

  it("여섯째: 이 보드에서 만든 P를 Q로 옮긴 뒤 이 보드를 떠나면 P 파일이 남고 Q에서 P에 사진이 보인다", async () => {
    const v = await bootBoard("V");
    const q = await ws().createBoard("Q");
    await ws().setCurrentBoard(v);
    spyPurge();
    frameWith(A);
    await readyCheck(v);
    fake();

    const p = addPhoto(2000, 100);
    expect(readFileStep(um().undoStack.at(-1)!)).toEqual([P_REF]); // 생성 단계가 P 파일을 쥔다
    // 만든 직후 바로 옮기면 생성 미러 쓰기와 옮기기 saveNote가 엇갈려 미러 행이 비는 기존 경쟁이
    // 있다(구현 메모). 사용자가 옮기는 때처럼 생성 미러 쓰기가 끝난 뒤 옮긴다.
    await settle(async () => (await mirrorRef(p)) === P_REF, "P 미러");
    await ws().moveCardToBoard(p, q);
    expect((await getDB().notes.get(p))?.boardId).toBe(q);
    expect(await mirrorRef(p)).toBe(P_REF);
    expect(has(p)).toBe(false);
    await ws().setCurrentBoard(q);
    await idle();
    expect(ws().currentBoardId).toBe(q);
    expect(card(p).attachmentRef).toBe(P_REF);
    expect(purged).not.toContain(P_REF);
    await expectLiveFilesKept();
  });

  it("일곱째: 휴지통의 P를 살리고 cmd+z, 휴지통을 비우고 cmd+shift+z하면 되살아난 P에 사진이 보인다", async () => {
    const v = await bootBoard("V");
    spyPurge();
    frameWith(A);
    const p = addPhoto(2000, 100);
    await flushAll();
    ws().remove(p);
    await settle(async () => !!(await getDB().trash.get(p)), "P 휴지통");
    await readyCheck(v);
    fake();

    await ws().restoreFromTrash(p);
    expect(has(p)).toBe(true);
    expect(pressUndo()).toBe(true);
    await idle();
    expect(await trashIds()).toEqual([p]);
    await useStorage.getState().purgeTrash();
    expect(await getDB().trash.count()).toBe(0);
    expect(pressUndo(true)).toBe(true);
    await idle();
    expect(has(p)).toBe(true);
    expect(note(p)?.attachmentRef).toBe(P_REF);
    expect(purged).not.toContain(P_REF);
    await expectLiveFilesKept();
  });

  it("여덟째: 내가 A→B, 다른 탭이 C로 바꾼 뒤 cmd+z하면 그 단계를 건너뛰고 판에 C, A 파일을 지운다", async () => {
    const v = await bootBoard("V");
    spyPurge();
    const f = frameWith(A);
    addPhoto(2000, 100);
    await readyCheck(v);
    fake();

    ws().setFrameBackground(f, photo(B));
    expect(um().undoStack.length).toBe(1);
    const other = peer();
    // 다른 탭도 같은 칸(attachmentRef와 수정 시각)을 나중에 바꾼다. 크기·형식이 같아 다른 칸은 그대로다.
    other.transact(
      () => updateNoteFields(other, f, { attachmentRef: C, updatedAt: Date.now() + 1000 }),
      "other-tab",
    );
    pushFrom(other);
    expect(note(f)?.attachmentRef).toBe(C);

    pressUndo();
    await idle();
    expect(um().undoStack.length).toBe(0); // 건너뛴 단계는 기록에서 사라진다
    expect(um().redoStack.length).toBe(0);
    expect(note(f)?.attachmentRef).toBe(C);
    expect(card(f).attachmentRef).toBe(C);
    expect(purged).toContain(A);
    expect(purged).not.toContain(C);
    // B도 이 탭에서는 아무도 안 가리켜 지운다. 다른 탭 기록이 쥔 파일은 나누지 않는다(실패 모드 9).
    expect([...purged].sort()).toEqual([A, B]);
    await expectLiveFilesKept();
  });
});

/* ── T19 ────────────────────────────────────────────────────────── */

describe("T19 함 카드 삭제와 만들기는 cmd+z 대상이 아니다", () => {
  it("첫째: X를 옮긴 뒤 함 H를 지우고 cmd+z하면 H는 지워진 채이고 X가 돌아간다", async () => {
    const v = await bootBoard("V");
    const x = addMemo(100, 100);
    const h = ws().createSubcanvas(600, 100);
    await waitFor(() => !!note(h), "H 문서");
    useWorkspace.setState({ editingId: null, selectedIds: [] });
    await readyCheck(v);

    drag(x, 300, 700);
    const n0 = um().undoStack.length;
    expect(n0).toBe(1);
    expect(note(h)).toBeDefined(); // 지우기 직전 H는 지금 보드 문서에 있다
    ws().remove(h);
    expect(note(h)).toBeUndefined();
    expect(um().undoStack.length).toBe(n0); // 함 삭제는 단계 수를 늘리지 않는다

    expect(pressUndo()).toBe(true);
    expect(pos(x)).toEqual({ x: 100, y: 100 });
    expect(note(h)).toBeUndefined();
    expect(has(h)).toBe(false);
  });

  it.each([
    ["Dock 끌어 놓기 createSubcanvas(Dock.tsx:395)", () => ws().createSubcanvas(600, 100)],
    ["Dock 버튼 createSubcanvasAtViewportCenter(Dock.tsx:448)", () => ws().createSubcanvasAtViewportCenter()],
  ])("둘째: X를 옮긴 뒤 %s로 H2를 만들고 cmd+z하면 H2는 남고 X가 돌아간다", async (_label, make) => {
    const v = await bootBoard("V");
    const x = addMemo(100, 100);
    await readyCheck(v);

    drag(x, 300, 700);
    const n0 = um().undoStack.length;
    expect(n0).toBe(1);
    const h2 = make();
    await waitFor(() => !!note(h2), "H2 문서"); // 쓰기는 saveBoard 뒤에 나간다
    await sleep(100);
    expect(um().undoStack.length).toBe(n0); // 함 만들기는 단계 수를 늘리지 않는다

    expect(pressUndo()).toBe(true);
    expect(note(h2)).toBeDefined();
    expect(has(h2)).toBe(true);
    expect(pos(x)).toEqual({ x: 100, y: 100 });
  });
});

/* ── 작업 3: 기록이 통째로 사라지는 다른 두 시점 ─────────────────── */

describe("n6 작업 3 청소 시점 — 보드 삭제와 로그아웃", () => {
  it("보던 보드를 지우면 기록을 비우고 청소해 A만 지운다. 판이 쓰는 B는 남는다", async () => {
    const v = await bootBoard("V");
    spyPurge();
    const f = frameWith(A);
    await readyCheck(v);

    ws().setFrameBackground(f, photo(B));
    await ws().removeBoard(v);
    expect(ws().currentBoardId).not.toBe(v);
    await idle();
    expect(purged).toEqual([A]);
    await expectLiveFilesKept();
  });

  it("로그아웃하면 지금 보드 기록을 비우고 청소해 A만 지운다. 새 빈 기록으로 계속 쓴다", async () => {
    const v = await bootBoard("V");
    spyPurge();
    const f = frameWith(A);
    await readyCheck(v);
    useAuth.setState({ session: { refreshToken: "r", accessToken: "a" } as never, status: "authenticated" });

    ws().setFrameBackground(f, photo(B));
    expect(um().undoStack.length).toBe(1);
    useAuth.setState({ session: null, user: null, status: "anonymous" });
    await idle();
    expect(purged).toEqual([A]);
    expect(getBoardUndoManager()).not.toBeNull();
    expect(um().undoStack.length).toBe(0);
    pressUndo(); // 비운 기록 — 아무것도 안 바꾼다
    expect(note(f)?.attachmentRef).toBe(B);
    await expectLiveFilesKept();
  });
});
