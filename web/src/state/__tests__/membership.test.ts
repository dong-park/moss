/**
 * FEAT-collab-auth n9 — 공유 해제·내보내기·다른 기기 (AC-13·AC-14·AC-17).
 *
 * 실경로: y-indexeddb는 실제 IndexeddbPersistence로 쓰고(shim 없이) 삭제 뒤
 * 다시 열어 0건을 확인한다. Dexie도 실제 인스턴스를 쓴다. Ktor만 주입 대체.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/state/auth";
import { configureAuth, resetAuthDeps } from "@/state/auth/store";
import type { AuthSession, BoardSummary } from "@/state/auth/types";
import { getDB, resetDB, type Board, type Note } from "@/state/db/schema";
import {
  configureMembership,
  handleBoardRevoked,
  purgeLocalBoardCopy,
  resetMembershipDeps,
  syncMyBoards,
} from "@/state/membership";
import { useShare } from "@/state/share";
import type { BoardMember, ShareApi } from "@/state/share";
import { resetShareStore } from "@/state/share/store";
import { useStorage } from "@/state/storage";
import { SYSTEM_BOARD_ID, encodeSubcanvas, useWorkspace } from "@/state/workspace";
import { destroyBoardDocs, getOrOpenBoardDoc } from "@/state/ydoc/activeDoc";
import { putNote, readNotes } from "@/state/ydoc/model";

const NOW = 1_700_000_000_000;

function makeToken(exp: number): string {
  const enc = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${enc({ alg: "HS256" })}.${enc({ exp })}.sig`;
}

const session: AuthSession = {
  accessToken: makeToken(NOW / 1000 + 600),
  refreshToken: makeToken(NOW / 1000 + 600),
  user: { id: "me", name: "동환", avatar: null },
};

function summary(id: string, role: "owner" | "editor"): BoardSummary {
  return { id, name: `보드 ${id}`, role, ownerName: "동환" };
}

function fakeShareApi(overrides: Partial<ShareApi> = {}): ShareApi {
  return {
    share: vi.fn(async () => summary("s1", "owner")),
    boardToken: vi.fn(async () => ({ boardToken: "bt", expiresInSeconds: 3600 })),
    unshare: vi.fn(async () => undefined),
    reissueInvite: vi.fn(async () => "tok"),
    removeMember: vi.fn(async () => undefined),
    members: vi.fn(async () => [] as BoardMember[]),
    myBoards: vi.fn(async () => [] as BoardSummary[]),
    ...overrides,
  };
}

function makeBoard(id: string, over: Partial<Board> = {}): Board {
  return {
    id,
    name: `보드 ${id}`,
    isSystem: false,
    createdAt: NOW,
    updatedAt: NOW,
    lastOpenedAt: NOW,
    ...over,
  };
}

function makeNote(id: string, boardId: string): Note {
  return {
    id,
    boardId,
    kind: "text",
    x: 0,
    y: 0,
    width: 240,
    rotation: 0,
    content: "",
    aiOptOut: false,
    createdAt: NOW,
    updatedAt: NOW,
    lastVisitedAt: NOW,
  };
}

let originalStorage: PropertyDescriptor | undefined;
let notified: string[];

beforeEach(async () => {
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

  await resetDB();
  useStorage.setState({ initialized: false, settings: null, quota: null });
  resetShareStore();
  resetMembershipDeps();
  configureAuth({ now: () => NOW });
  notified = [];
  configureMembership({
    api: fakeShareApi(),
    deleteDoc: async (boardId) => {
      // 실제 y-indexeddb 삭제 경로를 탄다 — 인덱스드DB 행이 0건인지 본다.
      const { deleteBoardDoc } = await import("@/state/ydoc/activeDoc");
      await deleteBoardDoc(boardId);
    },
    notify: (message) => notified.push(message),
  });
  useAuth.setState({
    session,
    user: session.user,
    status: "authenticated",
    hydrated: true,
    hydrating: false,
  });
});

afterEach(async () => {
  useAuth.setState({ session: null, user: null, status: "anonymous" });
  await destroyBoardDocs();
  await resetDB();
  useStorage.setState({ initialized: false, settings: null, quota: null });
  resetShareStore();
  resetMembershipDeps();
  resetAuthDeps();
  if (originalStorage) Object.defineProperty(navigator, "storage", originalStorage);
});

async function seedYdocNote(boardId: string, note: Note): Promise<void> {
  const handle = getOrOpenBoardDoc(boardId);
  await handle.whenLoaded;
  putNote(handle.doc, note);
  // y-indexeddb가 업데이트를 저장하도록 한 틱 기다린다.
  await new Promise((r) => setTimeout(r, 0));
}

describe("AC-13 · 해제 신호 뒤 편집자 기기 사본 0건", () => {
  it("y-indexeddb 문서와 Dexie 파생 행을 지우고 한 번 알린다", async () => {
    const boardId = "r1";
    const note = makeNote("n1", boardId);
    await seedYdocNote(boardId, note);

    const db = getDB();
    await useStorage.getState().init();
    await db.boards.put(makeBoard(boardId, { remote: true }));
    await db.notes.put(note);
    await db.embeddings.put({ noteId: "n1", contentHash: "h", vector: new Float32Array(2), updatedAt: NOW });
    await db.connections.put({
      id: "c1",
      sourceNoteId: "n1",
      targetNoteId: "n2",
      source: "manual",
      status: "active",
      createdAt: NOW,
    });
    useShare.getState().restoreShared(boardId, "editor");

    await handleBoardRevoked(boardId);

    // y-indexeddb가 비었다 — 다시 열어도 메모가 없다.
    const reopened = getOrOpenBoardDoc(boardId);
    await reopened.whenLoaded;
    expect(readNotes(reopened.doc)).toHaveLength(0);

    // Dexie 파생 행 0건.
    expect(await db.notes.where("boardId").equals(boardId).count()).toBe(0);
    expect(await db.connections.count()).toBe(0);
    expect(await db.embeddings.count()).toBe(0);
    expect(await db.boards.get(boardId)).toBeUndefined();
    expect(useWorkspace.getState().boards.some((b) => b.id === boardId)).toBe(false);

    expect(notified).toEqual(["공유가 끝난 보드예요"]);
    expect(useShare.getState().byBoard[boardId]).toBeUndefined();

    // 두 번째 신호는 다시 알리지 않는다 (AC-13 "한 번").
    await handleBoardRevoked(boardId);
    expect(notified).toHaveLength(1);
  });

  it("보고 있던 보드가 해제되면 시스템 보드로 돌아간다", async () => {
    const boardId = "r2";
    await useStorage.getState().init();
    const db = getDB();
    await db.boards.put(makeBoard(boardId, { remote: true }));
    useShare.getState().restoreShared(boardId, "editor");
    await useWorkspace.getState().setCurrentBoard(boardId);
    expect(useWorkspace.getState().currentBoardId).toBe(boardId);

    await handleBoardRevoked(boardId);

    expect(useWorkspace.getState().currentBoardId).toBe(SYSTEM_BOARD_ID);
  });
});

describe("AC-13 · 소유자 기기에는 보드가 남는다 (prove 3회차 실패)", () => {
  it("소유자가 해제 신호를 받으면 사본을 지우지 않고 혼자 쓰는 보드로 돌아간다", async () => {
    const boardId = "o1";
    const note = makeNote("n1", boardId);
    await seedYdocNote(boardId, note);
    await useStorage.getState().init();
    const db = getDB();
    await db.boards.put(makeBoard(boardId));
    useShare.getState().restoreShared(boardId, "owner");
    await useWorkspace.getState().setCurrentBoard(boardId);

    await handleBoardRevoked(boardId);

    const reopened = getOrOpenBoardDoc(boardId);
    await reopened.whenLoaded;
    expect(readNotes(reopened.doc)).toHaveLength(1);
    expect(await db.boards.get(boardId)).toBeDefined();
    expect(useWorkspace.getState().currentBoardId).toBe(boardId);
    expect(useShare.getState().byBoard[boardId]).toBeUndefined();
    expect(notified).toHaveLength(0);
  });
});

describe("AC-14 · 오프라인 편집자를 내보낸 뒤", () => {
  it("서버 목록에서 사라진 원격 보드는 사본이 지워진다", async () => {
    const boardId = "r3";
    await useStorage.getState().init();
    const db = getDB();
    await db.boards.put(makeBoard(boardId, { remote: true }));
    await db.notes.put(makeNote("n3", boardId));
    useShare.getState().restoreShared(boardId, "editor");
    configureMembership({ api: fakeShareApi({ myBoards: vi.fn(async () => []) }) });

    await syncMyBoards();

    expect(await db.notes.where("boardId").equals(boardId).count()).toBe(0);
    expect(await db.boards.get(boardId)).toBeUndefined();
    expect(useShare.getState().byBoard[boardId]).toBeUndefined();
  });
});

describe("AC-17 · 다른 기기에서 내 공유 보드 열기", () => {
  it("공유 2개는 목록에 추가되고 혼자 쓰는 3개는 그대로다", async () => {
    await useStorage.getState().init();
    const db = getDB();
    await db.boards.bulkPut([makeBoard("l1"), makeBoard("l2"), makeBoard("l3")]);
    useShare.getState().setLocal("l1");
    configureMembership({
      api: fakeShareApi({
        myBoards: vi.fn(async () => [summary("s1", "owner"), summary("s2", "editor")]),
      }),
    });

    await syncMyBoards();

    const boards = useWorkspace.getState().boards;
    expect(boards.map((b) => b.id).sort()).toEqual(["l1", "l2", "l3", "s1", "s2"]);
    expect(boards.filter((b) => b.remote).map((b) => b.id).sort()).toEqual(["s1", "s2"]);
    // 혼자 쓰는 보드는 remote 표시가 붙지 않는다.
    expect(boards.find((b) => b.id === "l1")?.remote).toBeUndefined();

    expect(useShare.getState().byBoard.s1).toMatchObject({ status: "shared", role: "owner" });
    expect(useShare.getState().byBoard.s2).toMatchObject({ status: "shared", role: "editor" });
    expect(useShare.getState().byBoard.l1.status).toBe("local");
  });

  it("이미 이 기기에 있는 공유 보드는 다시 만들지 않는다", async () => {
    await useStorage.getState().init();
    const db = getDB();
    const existing = makeBoard("s1", { remote: true, lastOpenedAt: NOW - 5000 });
    await db.boards.put(existing);
    configureMembership({
      api: fakeShareApi({ myBoards: vi.fn(async () => [summary("s1", "owner")]) }),
    });

    await syncMyBoards();

    const row = await db.boards.get("s1");
    expect(row?.lastOpenedAt).toBe(NOW - 5000); // 덮어쓰지 않았다.
    expect(useShare.getState().byBoard.s1).toMatchObject({ status: "shared", role: "owner" });
  });

  it("로그인 안 한 기기는 네트워크를 부르지 않는다 (AC-1)", async () => {
    useAuth.setState({ session: null, user: null, status: "anonymous" });
    const api = fakeShareApi();
    configureMembership({ api });

    await syncMyBoards();

    expect(api.myBoards).not.toHaveBeenCalled();
  });
});

describe("AC-17 · 받은 공유 보드는 시스템 보드 함 카드로 들어간다", () => {
  async function boxCount(boardId: string): Promise<number> {
    const content = encodeSubcanvas(boardId);
    const dexie = await getDB()
      .notes.filter((n) => n.boardId === null && n.kind === "board" && n.content === content)
      .count();
    const handle = getOrOpenBoardDoc(null);
    await handle.whenLoaded;
    const doc = readNotes(handle.doc).filter((n) => n.kind === "board" && n.content === content).length;
    expect(doc).toBe(dexie);
    return dexie;
  }

  it("한 번 만들고, 두 번 불러도 1개, 사본을 지우면 0개", async () => {
    await useStorage.getState().init();
    configureMembership({
      api: fakeShareApi({ myBoards: vi.fn(async () => [summary("s9", "editor")]) }),
    });

    await syncMyBoards();
    expect(await boxCount("s9")).toBe(1);

    await syncMyBoards();
    expect(await boxCount("s9")).toBe(1);

    await purgeLocalBoardCopy("s9");
    expect(await boxCount("s9")).toBe(0);
  });
});

describe("공유 보드 함 카드 배치 (/prove 관찰)", () => {
  it("공유 보드 3개면 함 카드 좌표가 서로 다르다", async () => {
    await useStorage.getState().init();
    configureMembership({
      api: fakeShareApi({
        myBoards: vi.fn(async () => [
          summary("p1", "editor"),
          summary("p2", "editor"),
          summary("p3", "editor"),
        ]),
      }),
    });

    await syncMyBoards();

    const cards = await getDB()
      .notes.filter((n) => n.boardId === null && n.kind === "board")
      .toArray();
    expect(cards).toHaveLength(3);
    expect(new Set(cards.map((c) => `${c.x},${c.y}`)).size).toBe(3);
  });
});
