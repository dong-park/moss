/**
 * cmd-z-undo 웨이브 3 코드 리뷰 회귀 시험 — 상태 쪽.
 *
 * - 한 번의 사용자 동작이 진입점 여러 개를 불러도 기록 1단계다(runAsUserAction).
 * - 기록 안 하는 origin(브리지)의 상태 변화가 편집 묶음을 여닫아도 사용자 단계를 끊지 않는다.
 * 준비 확인은 spec.md 「준비 확인」 규칙을 따른다(undoTestKit.readyCheck).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// OPFS putBlob은 브라우저 전용 — 브리지 명령용 스텁(mossBridge.test.ts와 같다).
vi.mock("@/state/db/opfs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/state/db/opfs")>();
  return { ...actual, putBlob: vi.fn(async (filename: string) => `opfs:${filename}`) };
});

import * as Y from "yjs";
import { runAsUserAction } from "@/state/workspace";
import { getDB } from "@/state/db/schema";
import { flushAll } from "@/state/cardPersist";
import { clearSharedSnapshots } from "@/state/ydoc/sharedSnapshot";
import { deleteConnection, readConnection } from "@/state/ydoc/model";
import { LOCAL_ORIGIN, UNTRACKED_ORIGIN } from "@/state/ydoc/origin";
import { getBoardUndoGroupState } from "@/state/ydoc/undo";
import { dispatchOp } from "@/state/bridge/mossBridge";
import { registerEditFlush } from "@/state/editFlush";
import { createLinkMemo } from "@/components/workspace/linkMemo";
import {
  addMemo,
  bootBoard,
  doc,
  expectGroupClosed,
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
afterEach(async () => teardown());

async function connect(a: string, b: string): Promise<string> {
  const cid = ws().connectCards(a, "right", b, "left")!;
  await waitFor(
    async () => !!readConnection(doc(), cid) && !!(await getDB().connections.get(cid)),
    "준비 연결선",
  );
  return cid;
}

/** 휴지통의 메모 m(연결선 포함)을 준비한다. 연결선은 문서에서 지워 되살리기가 쓰게 한다. */
async function trashedWithConnection(): Promise<{ m: string; cid: string }> {
  const m = addMemo(100, 100);
  const n = addMemo(500, 100);
  await flushAll();
  const cid = await connect(m, n);
  ws().remove(m);
  await waitFor(
    async () => !!(await getDB().trash.get(m)) && !!(await getDB().trashConnections.get(cid)),
    "휴지통 준비",
  );
  deleteConnection(doc(), cid, UNTRACKED_ORIGIN);
  return { m, cid };
}

/** 되살리기의 연결선 쓰기 직후 브리지 명령을 끼운다. */
async function restoreWithBridge(m: string, op: () => Promise<unknown>) {
  let bridge: Promise<unknown> | null = null;
  const onTx = (tr: Y.Transaction) => {
    const connMap: unknown = doc().getMap("connections");
    const conn = [...tr.changed.keys()].some((t) => (t as unknown) === connMap);
    if (conn && tr.origin === LOCAL_ORIGIN && !bridge) bridge = op();
  };
  doc().on("afterTransaction", onTx);
  await ws().restoreFromTrash(m);
  doc().off("afterTransaction", onTx);
  await bridge;
  await sleep(700);
}

describe("기록 안 하는 origin의 편집 묶음은 단계를 끊지 않는다", () => {
  it("되살리기의 두 쓰기 사이에 브리지 notes.create가 끼어도 1단계다", async () => {
    const P = await bootBoard();
    const { m, cid } = await trashedWithConnection();
    await readyCheck(P);
    await restoreWithBridge(m, () => dispatchOp("notes.create", { content: "from bridge", x: 900, y: 100 }));
    expect(note(m)).toBeDefined();
    expect(readConnection(doc(), cid)).toBeDefined();
    expect(um().undoStack.length).toBe(1);
    expectGroupClosed();
  });

  it("대조군: 되살리기 사이에 브리지 notes.update가 끼어도 1단계다", async () => {
    const P = await bootBoard();
    const { m } = await trashedWithConnection();
    const other = addMemo(800, 100);
    await readyCheck(P);
    await restoreWithBridge(m, () => dispatchOp("notes.update", { id: other, content: "from bridge" }));
    expect(note(m)).toBeDefined();
    expect(um().undoStack.length).toBe(1);
  });

  it("사용자가 편집 중일 때 브리지가 메모를 만들어도 묶음 깊이와 editingId가 맞는다", async () => {
    const P = await bootBoard();
    const u = addMemo(100, 100);
    await readyCheck(P);
    ws().setEditing(u);
    ws().setContent(u, "내 글");
    expect(getBoardUndoGroupState()?.depth).toBe(1);
    const { id } = (await dispatchOp("notes.create", { content: "from bridge", x: 600, y: 100 })) as {
      id: string;
    };
    await waitFor(() => note(id)?.content === "from bridge", "브리지 메모");
    const s = ws();
    const editing = s.expandedCardId ?? s.editingId;
    expect(getBoardUndoGroupState()?.depth).toBe(editing ? 1 : 0);
    if (!editing) expectGroupClosed();
    await sleep(600);
    // 내 편집은 1단계, 브리지 메모는 기록 밖이다.
    expect(um().undoStack.length).toBe(1);
    pressUndo();
    expect(note(u)?.content).toBe("");
    expect(note(id)?.content).toBe("from bridge");
  });

  it("브리지가 내 편집 묶음을 닫을 때 flush가 내보내는 내 글은 기록에 든다", async () => {
    // 수정 리포트의 열린 질문: 기록 안 하는 문맥이 묶음을 닫아도 flush는 사용자의 글을 쓴다.
    const P = await bootBoard();
    const u = addMemo(100, 100);
    await readyCheck(P);
    let pending: string | null = null;
    const off = registerEditFlush(() => {
      if (pending !== null) ws().setContent(u, pending);
      pending = null;
    });
    try {
      ws().setEditing(u);
      // 편집기 디바운스에 남은 글 — 아직 문서에 안 갔다.
      pending = "마지막 0.2초 글";
      await dispatchOp("notes.create", { content: "from bridge", x: 600, y: 100 });
      await sleep(600);
      expect(note(u)?.content).toBe("마지막 0.2초 글");
      // 브리지가 편집을 빼앗았어도 내 글은 cmd+z로 되돌릴 수 있다.
      expect(um().undoStack.length).toBeGreaterThanOrEqual(1);
      pressUndo();
      expect(note(u)?.content).toBe("");
    } finally {
      off();
    }
  });
});

describe("한 번의 사용자 동작은 기록 1단계다", () => {
  it("주소 붙여넣기(createLinkMemo, at)는 1단계이고 cmd+z 1번에 카드가 사라진다", async () => {
    const P = await bootBoard();
    await readyCheck(P);
    const id = createLinkMemo("https://example.com", { at: { x: 100, y: 100 } })!;
    expect(note(id)?.content).toContain("example.com");
    expect(um().undoStack.length).toBe(1);
    pressUndo();
    expect(note(id)).toBeUndefined();
  });

  it("주소 붙여넣기(createLinkMemo, 화면 가운데)도 0.7초 뒤 1단계다", async () => {
    const P = await bootBoard();
    await readyCheck(P);
    const id = createLinkMemo("https://example.com/a", { centerSize: { width: 800, height: 600 } })!;
    await sleep(700);
    expect(um().undoStack.length).toBe(1);
    pressUndo();
    expect(note(id)).toBeUndefined();
  });

  it("runAsUserAction 안의 사진 여러 장 만들기는 1단계다", async () => {
    const P = await bootBoard();
    await readyCheck(P);
    const photo = { ref: "opfs:a.png", mediaType: "image/png" };
    const ids = runAsUserAction(
      () => [ws().addPhotoAt(0, 0, photo), ws().addPhotoAt(24, 24, photo), ws().addPhotoAt(48, 48, photo)],
      { creates: true },
    );
    for (const id of ids) expect(note(id)).toBeDefined();
    expect(um().undoStack.length).toBe(1);
    pressUndo();
    for (const id of ids) expect(note(id)).toBeUndefined();
  });

  it("만드는 동작 뒤 편집 묶음은 생성 단계가 닫힌 뒤 열린다", async () => {
    const P = await bootBoard();
    await readyCheck(P);
    const id = runAsUserAction(
      () => {
        const created = ws().addCardAt("text", 0, 0);
        ws().setContent(created, "- [ ] ");
        ws().setEditing(created);
        return created;
      },
      { creates: true },
    );
    expect(getBoardUndoGroupState()?.depth).toBe(1);
    ws().setContent(id, "- [ ] 우유");
    ws().setEditing(null);
    expectGroupClosed();
    expect(um().undoStack.length).toBe(2);
    pressUndo();
    expect(note(id)?.content).toBe("- [ ] ");
    pressUndo();
    expect(note(id)).toBeUndefined();
  });
});

describe("대조군: 새로고침 뒤 바뀐 것 없는 동작은 단계를 만들지 않는다", () => {
  for (const action of ["commitTitle", "setContentSame", "setTitleSame"] as const) {
    it(action, async () => {
      const P = await bootBoard();
      const id = addMemo(0, 0);
      ws().setContent(id, "body");
      ws().setTitle(id, "T");
      ws().commitTitle(id);
      await flushAll();
      clearSharedSnapshots();
      await readyCheck(P);
      if (action === "commitTitle") ws().commitTitle(id);
      if (action === "setContentSame") ws().setContent(id, "body");
      if (action === "setTitleSame") ws().setTitle(id, "T");
      await sleep(700);
      expect(um().undoStack.length).toBe(0);
    });
  }
});
