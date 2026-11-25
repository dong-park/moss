/**
 * local-promise n5 (T15) — 첫 벽(시스템 보드)은 새 벽으로 옮겨 공유한다.
 *
 * 실제 Dexie·Y.Doc·공유 스토어를 거친다. 가짜인 것은 네트워크 끝(서버 API·Google 토큰·sync provider)뿐이다.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { configureAuth, resetAuthDeps, useAuth } from "@/state/auth/store";
import { clearSession } from "@/state/auth/tokenStore";
import type { AuthApi } from "@/state/auth/api";
import type { AuthSession, BoardSummary } from "@/state/auth/types";
import { SYSTEM_BOARD_ID } from "@/state/boardIds";
import {
  configureCollab,
  resetCollabStore,
  type CollabProviderConfig,
  type CollabProviderFactory,
} from "@/state/collab";
import { getDB, resetDB, type Connection, type Note, type WallStroke } from "@/state/db/schema";
import { useStorage } from "@/state/storage";
import { activateBoardDoc, destroyBoardDocs, getOrOpenBoardDoc } from "@/state/ydoc/activeDoc";
import {
  putConnection,
  putNote,
  putStroke,
  readConnections,
  readNotes,
  readStrokes,
} from "@/state/ydoc/model";
import { encodeSubcanvas, useWorkspace } from "@/state/workspace";
import type { ShareApi } from "../api";
import { shareFirstWall } from "../firstWall";
import { isWallInputBlocked } from "@/state/marker/inputGate";
import { configureShare, resetShareStore, useShare } from "../store";

const NOW = 1_700_000_000_000;

function makeToken(exp: number): string {
  const enc = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${enc({ alg: "HS256" })}.${enc({ exp })}.sig`;
}

const session: AuthSession = {
  accessToken: makeToken(NOW / 1000 + 600),
  refreshToken: makeToken(NOW / 1000 + 600),
  user: { id: "u1", name: "동환", avatar: null },
};

function fakeShareApi(): ShareApi {
  return {
    share: vi.fn(
      async (...args: [string, string, string, string?]): Promise<BoardSummary> => ({
        id: args[0],
        name: "벽",
        role: "owner",
        ownerName: "동환",
      }),
    ),
    boardToken: vi.fn(async () => ({ boardToken: "bt", expiresInSeconds: 3600 })),
    unshare: vi.fn(async () => undefined),
    reissueInvite: vi.fn(async () => "tok-1"),
    removeMember: vi.fn(async () => undefined),
    members: vi.fn(async () => []),
    myBoards: vi.fn(async () => []),
    usage: vi.fn(async (_accessToken: string) => ({ boards: 0, maxBoards: 10, fileBytes: 0, maxFileBytes: 1 })),
  };
}

function fakeAuthApi(): AuthApi {
  return {
    googleLogin: vi.fn(async () => session),
    signup: vi.fn(async () => session),
    login: vi.fn(async () => session),
    refresh: vi.fn(async () => session),
    previewInvite: vi.fn(async () => ({ boardName: "", ownerName: "" })),
    acceptInvite: vi.fn(async (): Promise<BoardSummary> => ({ id: "x", name: "", role: "owner", ownerName: "" })),
    requestPasswordReset: vi.fn(async () => {}),
    confirmPasswordReset: vi.fn(async () => {}),
    logout: vi.fn(async () => {}),
  };
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

function note(id: string, over: Partial<Note> = {}): Note {
  return {
    id,
    boardId: SYSTEM_BOARD_ID,
    kind: "text",
    x: 10,
    y: 20,
    width: 240,
    rotation: 0,
    content: `본문 ${id}`,
    aiOptOut: false,
    createdAt: 1,
    updatedAt: 1,
    lastVisitedAt: 1,
    ...over,
  };
}

/** 첫 벽: 메모 둘 + 이어 준 선 하나 + 파일함 하나 + 남이 공유한 벽의 입구 카드 하나. */
async function seedFirstWall(name = "아침 생각") {
  const storage = useStorage.getState();
  await storage.init();
  const db = getDB();
  const base = { isSystem: false, createdAt: 0, updatedAt: 0, lastOpenedAt: 0 };
  await db.boards.bulkPut([
    { ...base, id: SYSTEM_BOARD_ID, name, isSystem: true, parentBoardId: null },
    { ...base, id: "folder1", name: "함", parentBoardId: SYSTEM_BOARD_ID },
    { ...base, id: "remote1", name: "남의 벽", parentBoardId: SYSTEM_BOARD_ID, remote: true },
  ]);
  const handle = await activateBoardDoc(SYSTEM_BOARD_ID);
  const notes = [
    note("n1"),
    note("n2", { x: 300 }),
    note("folder-card", { kind: "board", content: encodeSubcanvas("folder1") }),
    note("remote-card", { kind: "board", content: encodeSubcanvas("remote1") }),
  ];
  await db.notes.bulkPut(notes);
  for (const n of notes) putNote(handle.doc, n);
  const connection: Connection = {
    id: "k1",
    sourceNoteId: "n1",
    targetNoteId: "n2",
    source: "manual",
    status: "active",
    createdAt: 1,
  };
  await db.connections.put(connection);
  putConnection(handle.doc, connection);
  useWorkspace.setState({ boards: await storage.loadBoards(), currentBoardId: SYSTEM_BOARD_ID });
}

async function mirrorIds(boardId: string): Promise<string[]> {
  const rows = await getDB().notes.where("boardId").equals(boardId).toArray();
  return rows.map((n) => n.id).sort();
}

async function docState(boardId: string) {
  const handle = getOrOpenBoardDoc(boardId);
  await handle.whenLoaded;
  return {
    notes: readNotes(handle.doc)
      .map((n) => n.id)
      .sort(),
    connections: readConnections(handle.doc).map((c) => c.id),
  };
}

async function otherBoardIds(): Promise<string[]> {
  const boards = await getDB().boards.toArray();
  return boards
    .map((b) => b.id)
    .filter((id) => ![SYSTEM_BOARD_ID, "folder1", "remote1"].includes(id));
}

let originalStorage: PropertyDescriptor | undefined;

beforeEach(async () => {
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
  await clearSession();
  resetShareStore();
  resetAuthDeps();
  resetCollabStore();
  configureAuth({ now: () => NOW, api: fakeAuthApi() });
  signIn();
});

afterEach(async () => {
  await clearSession();
  resetShareStore();
  resetAuthDeps();
  resetCollabStore();
  useAuth.setState({ session: null, user: null, status: "anonymous", hydrated: false, hydrating: false });
  await destroyBoardDocs();
  await resetDB();
  useStorage.setState({ initialized: false, settings: null, quota: null });
  useWorkspace.setState({ cards: [], boards: [], currentBoardId: SYSTEM_BOARD_ID, viewportByBoard: {} });
  if (originalStorage) Object.defineProperty(navigator, "storage", originalStorage);
});

describe("T15 · 첫 벽을 공유하면 같은 내용의 새 벽이 공유되고 첫 벽은 비어 남는다", () => {
  test("성공: 새 벽 id로 서버에 올라가고, 새 벽 내용이 옮기기 전 첫 벽과 같고, 첫 벽은 비었다", async () => {
    await seedFirstWall();
    const api = fakeShareApi();
    const uploadDoc = vi.fn(async () => {});
    configureShare({ api, uploadDoc, onBoardShared: vi.fn() });

    const before = await mirrorIds(SYSTEM_BOARD_ID);
    expect(before).toEqual(["folder-card", "n1", "n2", "remote-card"]);

    const newId = await shareFirstWall();

    // 서버로 나간 보드 id는 시스템 보드 id가 아니다.
    expect(newId).not.toBe(SYSTEM_BOARD_ID);
    expect(api.share).toHaveBeenCalledTimes(1);
    const shareArgs = (api.share as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(shareArgs[0]).toBe(newId);
    expect(shareArgs[1]).toBe("아침 생각");
    expect(uploadDoc).toHaveBeenCalledWith(newId, session.accessToken);
    for (const call of [
      ...(api.share as ReturnType<typeof vi.fn>).mock.calls,
      ...(api.reissueInvite as ReturnType<typeof vi.fn>).mock.calls,
      ...uploadDoc.mock.calls,
    ]) {
      expect(call[0]).not.toBe(SYSTEM_BOARD_ID);
    }

    // 새 벽: 옮기기 전 첫 벽의 메모(남이 공유한 벽의 입구 카드는 제외)와 같다. 문서와 미러 둘 다.
    const moved = ["folder-card", "n1", "n2"];
    expect(await mirrorIds(newId)).toEqual(moved);
    const wall = await docState(newId);
    expect(wall.notes).toEqual(moved);
    expect(wall.connections).toEqual(["k1"]);
    const contents = readNotes(getOrOpenBoardDoc(newId).doc)
      .map((n) => n.content)
      .sort();
    expect(contents).toContain("본문 n1");

    // 첫 벽: 비었다. 남은 것은 이 기기의 입구 카드 하나뿐이다.
    expect(await mirrorIds(SYSTEM_BOARD_ID)).toEqual(["remote-card"]);
    const first = await docState(SYSTEM_BOARD_ID);
    expect(first.notes).toEqual(["remote-card"]);
    expect(first.connections).toEqual([]);

    // 파일함은 새 벽 아래로 따라간다. 입구 카드의 남의 벽은 그대로다.
    const boards = await getDB().boards.toArray();
    expect(boards.find((b) => b.id === "folder1")?.parentBoardId).toBe(newId);
    expect(boards.find((b) => b.id === "remote1")?.parentBoardId).toBe(SYSTEM_BOARD_ID);

    // 새 벽만 공유 중이고 첫 벽은 이 기기에만이다. 화면은 새 벽으로 옮겨 갔다.
    expect(useShare.getState().byBoard[newId]?.status).toBe("shared");
    expect(useShare.getState().byBoard[SYSTEM_BOARD_ID]).toBeUndefined();
    expect(useWorkspace.getState().currentBoardId).toBe(newId);
    expect(boards.find((b) => b.id === newId)?.name).toBe("아침 생각");
  });

  test("마카로 쓴 벽 획도 새 벽으로 따라가고 첫 벽에는 남지 않는다 (wall-marker n1)", async () => {
    await seedFirstWall();
    const handle = getOrOpenBoardDoc(SYSTEM_BOARD_ID);
    const stroke = (id: string): WallStroke => ({
      id,
      boardId: SYSTEM_BOARD_ID,
      points: [
        { x: 1, y: 2 },
        { x: 30, y: 40 },
      ],
      color: "red",
      width: "mid",
      createdAt: 5,
      updatedAt: 5,
    });
    putStroke(handle.doc, stroke("w1"));
    putStroke(handle.doc, stroke("w2"));
    configureShare({ api: fakeShareApi(), uploadDoc: vi.fn(async () => {}), onBoardShared: vi.fn() });

    const newId = await shareFirstWall();

    const wall = getOrOpenBoardDoc(newId);
    await wall.whenLoaded;
    expect(readStrokes(wall.doc).map((s) => [s.id, s.boardId])).toEqual([
      ["w1", newId],
      ["w2", newId],
    ]);
    expect(readStrokes(wall.doc)[0].color).toBe("red");
    expect(readStrokes(handle.doc)).toEqual([]);
  });

  test("내용을 옮기는 동안만 벽 획 입력을 막고 업로드 때는 풀려 있다 (W5)", async () => {
    await seedFirstWall();
    const during: boolean[] = [];
    let atUpload: boolean | null = null;
    const original = useStorage.getState().saveBoard;
    useStorage.setState({
      saveBoard: async (patch) => {
        // 옮기기 단계(업로드 전)의 저장 호출만 본다.
        if (atUpload === null) during.push(isWallInputBlocked());
        return original(patch);
      },
    });
    configureShare({
      api: fakeShareApi(),
      uploadDoc: vi.fn(async () => {
        atUpload = isWallInputBlocked();
      }),
      onBoardShared: vi.fn(),
    });

    await shareFirstWall();

    expect(during.length).toBeGreaterThan(0);
    expect(during.every(Boolean)).toBe(true);
    expect(atUpload).toBe(false);
    expect(isWallInputBlocked()).toBe(false);
  });

  test("공유가 실패해 되돌린 뒤에도 입력 차단이 남지 않는다 (W5)", async () => {
    await seedFirstWall();
    configureShare({
      api: fakeShareApi(),
      uploadDoc: vi.fn(async () => {
        throw new Error("올리다 끊겼어요");
      }),
      onBoardShared: vi.fn(),
    });
    await expect(shareFirstWall()).rejects.toMatchObject({ reason: "share" });
    expect(isWallInputBlocked()).toBe(false);
  });

  test("공유가 실패하면 벽 획도 첫 벽으로 돌아온다 (wall-marker n1)", async () => {
    await seedFirstWall();
    const handle = getOrOpenBoardDoc(SYSTEM_BOARD_ID);
    const s: WallStroke = {
      id: "w1",
      boardId: SYSTEM_BOARD_ID,
      points: [{ x: 0, y: 0 }],
      color: "blue",
      width: "thick",
      createdAt: 5,
      updatedAt: 5,
    };
    putStroke(handle.doc, s);
    configureShare({
      api: fakeShareApi(),
      uploadDoc: vi.fn(async () => {
        throw new Error("올리다 끊겼어요");
      }),
      onBoardShared: vi.fn(),
    });

    await expect(shareFirstWall()).rejects.toMatchObject({ reason: "share" });

    expect(readStrokes(handle.doc)).toEqual([s]);
  });

  test("첫 벽에 제목이 없으면 이름 없는 보드 기본값으로 올라간다", async () => {
    await seedFirstWall("");
    const api = fakeShareApi();
    configureShare({ api, uploadDoc: vi.fn(async () => {}), onBoardShared: vi.fn() });

    await shareFirstWall();

    expect((api.share as ReturnType<typeof vi.fn>).mock.calls[0][1]).toBe("이름 없는 보드");
  });

  test("기기 주인이 다른 계정이면 벽도 서버도 건드리지 않고 account 이유로 멈춘다 (F3)", async () => {
    await seedFirstWall();
    const api = fakeShareApi();
    const uploadDoc = vi.fn(async () => {});
    configureShare({ api, uploadDoc, onBoardShared: vi.fn(), localOwnerId: async () => "someone-else" });

    await expect(shareFirstWall()).rejects.toMatchObject({ reason: "account" });

    expect(api.share).not.toHaveBeenCalled();
    expect(uploadDoc).not.toHaveBeenCalled();
    expect(await mirrorIds(SYSTEM_BOARD_ID)).toEqual(["folder-card", "n1", "n2", "remote-card"]);
    expect(await otherBoardIds()).toEqual([]);
  });

  test("공유 실패: 첫 벽은 그대로이고 새 벽은 지워진다", async () => {
    await seedFirstWall();
    const api = fakeShareApi();
    configureShare({
      api,
      uploadDoc: vi.fn(async () => {
        throw new Error("올리다 끊겼어요");
      }),
      onBoardShared: vi.fn(),
    });

    await expect(shareFirstWall()).rejects.toMatchObject({ reason: "share" });

    // 첫 벽 메모 수가 그대로다 — 문서와 미러 둘 다.
    expect(await mirrorIds(SYSTEM_BOARD_ID)).toEqual(["folder-card", "n1", "n2", "remote-card"]);
    const first = await docState(SYSTEM_BOARD_ID);
    expect(first.notes).toEqual(["folder-card", "n1", "n2", "remote-card"]);
    expect(first.connections).toEqual(["k1"]);
    // 파일함 부모도 돌아왔고, 새 벽은 남지 않는다.
    const boards = await getDB().boards.toArray();
    expect(boards.find((b) => b.id === "folder1")?.parentBoardId).toBe(SYSTEM_BOARD_ID);
    expect(await otherBoardIds()).toEqual([]);
    expect(Object.keys(useShare.getState().byBoard)).toEqual([]);
    // 서버 행은 startShare가 이미 지웠다. 시스템 보드 id는 어디에도 가지 않았다.
    expect(api.unshare).toHaveBeenCalledTimes(1);
    expect((api.unshare as ReturnType<typeof vi.fn>).mock.calls[0][0]).not.toBe(SYSTEM_BOARD_ID);
    expect(useWorkspace.getState().currentBoardId).toBe(SYSTEM_BOARD_ID);
  });

  test("되돌리지 못하면 내용이 있는 새 벽을 남기고 그 벽 id를 오류에 싣는다 (F4)", async () => {
    await seedFirstWall();
    const api = fakeShareApi();
    const bulkPut = vi.spyOn(getDB().notes, "bulkPut");
    configureShare({
      api,
      uploadDoc: vi.fn(async () => {
        // 올리다 끊긴 뒤, 되돌리려고 첫 벽 미러에 쓰는 순간 디스크가 막혔다.
        bulkPut.mockRejectedValueOnce(new Error("disk"));
        throw new Error("올리다 끊겼어요");
      }),
      onBoardShared: vi.fn(),
    });

    const attempt = shareFirstWall();
    await expect(attempt).rejects.toMatchObject({
      reason: "share",
      contentNotRestored: true,
      serverRowLeft: false,
    });
    const [newId] = await otherBoardIds();
    await expect(attempt).rejects.toMatchObject({ contentBoardId: newId });
    expect(newId).toBeTruthy();
    // 지우지 않았다 — 내용이 그 벽에 있다.
    expect(await mirrorIds(newId)).toEqual(["folder-card", "n1", "n2"]);
    bulkPut.mockRestore();
  });

  test("서버 행도 못 지우고 되돌리지도 못하면 두 사실을 모두 싣는다 (F4)", async () => {
    await seedFirstWall();
    const api = fakeShareApi();
    (api.unshare as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("offline"));
    const bulkPut = vi.spyOn(getDB().notes, "bulkPut");
    configureShare({
      api,
      uploadDoc: vi.fn(async () => {
        bulkPut.mockRejectedValueOnce(new Error("disk"));
        throw new Error("올리다 끊겼어요");
      }),
      onBoardShared: vi.fn(),
    });

    await expect(shareFirstWall()).rejects.toMatchObject({
      contentNotRestored: true,
      serverRowLeft: true,
    });
    bulkPut.mockRestore();
  });

  test("다시 시도하면 새 벽으로 올라간다", async () => {
    await seedFirstWall();
    const uploadDoc = vi
      .fn<(id: string, token: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error("끊겼어요"))
      .mockResolvedValue(undefined);
    configureShare({ api: fakeShareApi(), uploadDoc, onBoardShared: vi.fn() });

    await expect(shareFirstWall()).rejects.toMatchObject({ reason: "share" });
    const newId = await shareFirstWall();

    expect(await mirrorIds(newId)).toEqual(["folder-card", "n1", "n2"]);
    expect(await mirrorIds(SYSTEM_BOARD_ID)).toEqual(["remote-card"]);
  });

  test("로그인 실패: 아무것도 옮기지 않고 서버도 부르지 않는다", async () => {
    await seedFirstWall();
    useAuth.setState({ session: null, user: null, status: "anonymous", hydrated: true, hydrating: false });
    configureAuth({
      now: () => NOW,
      api: fakeAuthApi(),
      googleIdToken: vi.fn(async () => {
        throw new Error("창을 닫았어요");
      }),
    });
    const api = fakeShareApi();
    const uploadDoc = vi.fn(async () => {});
    configureShare({ api, uploadDoc, onBoardShared: vi.fn() });

    await expect(shareFirstWall()).rejects.toMatchObject({ reason: "login" });

    expect(api.share).not.toHaveBeenCalled();
    expect(uploadDoc).not.toHaveBeenCalled();
    expect(await mirrorIds(SYSTEM_BOARD_ID)).toEqual(["folder-card", "n1", "n2", "remote-card"]);
    expect(await otherBoardIds()).toEqual([]);
  });

  test("두 번 눌러도 새 벽은 하나만 생긴다", async () => {
    await seedFirstWall();
    const api = fakeShareApi();
    configureShare({ api, uploadDoc: vi.fn(async () => {}), onBoardShared: vi.fn() });

    const [a, b] = await Promise.all([shareFirstWall(), shareFirstWall()]);

    expect(a).toBe(b);
    expect(api.share).toHaveBeenCalledTimes(1);
    expect(await otherBoardIds()).toEqual([a]);
  });
});

describe("H1 · 첫 벽 공유는 탭 사이에서도 한 번에 하나만 돈다", () => {
  // 탭마다 새 벽 id를 만들어 벽별 락이 겹치지 않으므로, 첫 벽 공유는 고정 키 하나를 쥔다.
  const LOCK_KEY = "moss:shareStarting:first-wall";

  afterEach(() => {
    localStorage.removeItem(LOCK_KEY);
  });

  test("다른 탭이 첫 벽을 공유하는 중이면 아무것도 건드리지 않고 elsewhere 이유로 멈춘다", async () => {
    await seedFirstWall();
    localStorage.setItem(
      LOCK_KEY,
      JSON.stringify({ token: "other-tab", expiresAt: Date.now() + 20_000 }),
    );
    const api = fakeShareApi();
    const uploadDoc = vi.fn(async () => {});
    configureShare({ api, uploadDoc, onBoardShared: vi.fn() });

    await expect(shareFirstWall()).rejects.toMatchObject({
      name: "ShareStartError",
      reason: "elsewhere",
    });

    expect(api.myBoards).not.toHaveBeenCalled();
    expect(api.share).not.toHaveBeenCalled();
    expect(uploadDoc).not.toHaveBeenCalled();
    expect(await mirrorIds(SYSTEM_BOARD_ID)).toEqual(["folder-card", "n1", "n2", "remote-card"]);
    expect(await otherBoardIds()).toEqual([]);
    // 남의 락을 지우지 않는다.
    expect(JSON.parse(localStorage.getItem(LOCK_KEY) ?? "{}").token).toBe("other-tab");
  });

  test("다른 탭의 락이 만료됐으면(그 탭이 죽었다) 공유한다", async () => {
    await seedFirstWall();
    localStorage.setItem(
      LOCK_KEY,
      JSON.stringify({ token: "dead-tab", expiresAt: Date.now() - 1 }),
    );
    configureShare({ api: fakeShareApi(), uploadDoc: vi.fn(async () => {}), onBoardShared: vi.fn() });

    const newId = await shareFirstWall();

    expect(useShare.getState().byBoard[newId]?.status).toBe("shared");
  });

  test("진행하는 동안 락을 쥐고 끝나면 푼다", async () => {
    await seedFirstWall();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    configureShare({
      api: fakeShareApi(),
      uploadDoc: vi.fn(() => gate),
      onBoardShared: vi.fn(),
    });

    const pending = shareFirstWall();
    await vi.waitFor(() => expect(localStorage.getItem(LOCK_KEY)).not.toBeNull());
    release();
    await pending;

    expect(localStorage.getItem(LOCK_KEY)).toBeNull();
  });

  test("실패해도 락을 푼다", async () => {
    await seedFirstWall();
    configureShare({
      api: fakeShareApi(),
      uploadDoc: vi.fn(async () => {
        throw new Error("끊겼어요");
      }),
      onBoardShared: vi.fn(),
    });

    await expect(shareFirstWall()).rejects.toMatchObject({ name: "ShareStartError" });

    expect(localStorage.getItem(LOCK_KEY)).toBeNull();
  });

  test("로그인에서 멈춰도 락을 푼다", async () => {
    await seedFirstWall();
    useAuth.setState({ session: null, user: null, status: "anonymous", hydrated: true, hydrating: false });
    configureAuth({
      now: () => NOW,
      api: {
        ...fakeAuthApi(),
        googleLogin: vi.fn(async () => {
          throw new Error("로그인 창을 닫았어요");
        }),
      },
    });
    configureShare({ api: fakeShareApi(), uploadDoc: vi.fn(async () => {}), onBoardShared: vi.fn() });

    await expect(shareFirstWall()).rejects.toMatchObject({ reason: "login" });

    expect(localStorage.getItem(LOCK_KEY)).toBeNull();
  });
});

describe("T15 실경로 — 기본 업로드가 새 벽의 문서를 서버로 민다", () => {
  test("provider에 넘어가는 문서에 옮긴 메모가 들어 있고, 이름은 새 벽 id다", async () => {
    await seedFirstWall();
    const created: Array<{ config: CollabProviderConfig; destroy: ReturnType<typeof vi.fn> }> = [];
    const factory: CollabProviderFactory = {
      create(config) {
        const destroy = vi.fn();
        created.push({ config, destroy });
        return { awareness: null, connect: vi.fn(), disconnect: vi.fn(), destroy };
      },
    };
    configureCollab({
      providerFactory: factory,
      fetchBoardToken: vi.fn(async () => ({ boardToken: "bt", expiresInSeconds: 3600 })),
      syncUrl: () => "ws://sync.test",
      now: () => NOW,
    });
    configureShare({ api: fakeShareApi(), onBoardShared: vi.fn() });

    const pending = shareFirstWall();
    await vi.waitFor(() => expect(created).toHaveLength(1));

    const sent = created[0].config;
    expect(sent.name).not.toBe(SYSTEM_BOARD_ID);
    expect(
      readNotes(sent.document)
        .map((n) => n.id)
        .sort(),
    ).toEqual(["folder-card", "n1", "n2"]);

    sent.onAcknowledged?.();
    const newId = await pending;
    expect(newId).toBe(sent.name);
    expect(useShare.getState().byBoard[newId]?.status).toBe("shared");
  });
});
