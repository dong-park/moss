/**
 * remote-mcp n1 — 로그인한 사용자의 보드는 모두 서버에 저장된다 (T1·T2, D1·D2).
 *
 * Dexie·zustand는 실제 인스턴스를 쓰고 Ktor 계약(share·usage)만 주입 대체한다.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { AuthRequestError, useAuth } from "@/state/auth";
import { configureAuth, resetAuthDeps } from "@/state/auth/store";
import type { AuthSession, BoardSummary } from "@/state/auth/types";
import { getDB, resetDB, type Board } from "@/state/db/schema";
import {
  canCreateBoard,
  configureMembership,
  finishUploadChoice,
  prepareUploadChoice,
  registerBoards,
  registerNewBoards,
  resetMembershipDeps,
  shareSubBoards,
  syncMyBoards,
  unshareRemovedSubBoards,
} from "@/state/membership";
import { configureShare, useShare, type BoardMember } from "@/state/share";
import type { ShareApi } from "@/state/share";
import { resetShareStore } from "@/state/share/store";
import { useStorage } from "@/state/storage";
import { BOARD_UNDO_MS, SYSTEM_BOARD_ID, useWorkspace, type Card } from "@/state/workspace";
import { destroyBoardDocs } from "@/state/ydoc/activeDoc";

const NOW = 1_700_000_000_000;

const LOCAL_ONLY_BOARDS = "보드는 100개까지 저장할 수 있어요. 서버에 올리지 못한 보드는 이 기기에만 있어요.";
const OWNER: BoardMember = { id: "me", name: "동환", avatar: null, role: "owner" };
const EDITOR: BoardMember = { id: "u2", name: "지수", avatar: null, role: "editor" };

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

function summary(id: string): BoardSummary {
  return { id, name: `보드 ${id}`, role: "owner", ownerName: "동환" };
}

function fakeApi(overrides: Partial<ShareApi> = {}): ShareApi {
  return {
    share: vi.fn(async (id: string) => summary(id)),
    boardToken: vi.fn(async () => ({ boardToken: "bt", expiresInSeconds: 3600 })),
    unshare: vi.fn(async () => undefined),
    reissueInvite: vi.fn(async () => "tok"),
    removeMember: vi.fn(async () => undefined),
    members: vi.fn(async () => []),
    myBoards: vi.fn(async () => [] as BoardSummary[]),
    usage: vi.fn(async () => ({ boards: 3, maxBoards: 100, fileBytes: 0, maxFileBytes: 1024 ** 3 })),
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

let notified: string[];
let uploadDoc: Mock<(boardId: string, accessToken: string) => Promise<void>>;
let originalStorage: PropertyDescriptor | undefined;

function install(api: ShareApi) {
  configureShare({ api, onBoardShared: vi.fn() });
  configureMembership({ api, uploadDoc, notify: (m) => notified.push(m) });
}

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
  uploadDoc = vi.fn(async () => {});
  install(fakeApi());
  useAuth.setState({ session, user: session.user, status: "authenticated", hydrated: true, hydrating: false });
  await useStorage.getState().init();
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

describe("T2 · 저장 상한에 닿으면 새 보드 만들기가 막힌다", () => {
  it("보드 수가 상한이면 막고 안내 문구를 띄운다", async () => {
    install(fakeApi({ usage: vi.fn(async () => ({ boards: 100, maxBoards: 100, fileBytes: 0, maxFileBytes: 1024 ** 3 })) }));
    expect(await canCreateBoard()).toBe(false);
    expect(notified).toEqual(["보드를 100개까지 저장할 수 있어요. 쓰지 않는 보드를 지우면 새로 만들 수 있어요."]);
  });

  it("첨부 합계가 상한이면 막고 용량 문구를 띄운다", async () => {
    install(fakeApi({ usage: vi.fn(async () => ({ boards: 5, maxBoards: 100, fileBytes: 1024 ** 3, maxFileBytes: 1024 ** 3 })) }));
    expect(await canCreateBoard()).toBe(false);
    expect(notified).toEqual(["저장 용량 1GB을 다 썼어요. 첨부가 큰 보드를 지우면 새로 만들 수 있어요."]);
  });

  it("상한 아래면 통과하고 안내가 없다", async () => {
    expect(await canCreateBoard()).toBe(true);
    expect(notified).toEqual([]);
  });

  it("로그인하지 않았거나 서버에 닿지 못하면 막지 않는다", async () => {
    const usage = vi.fn(async () => {
      throw new TypeError("network");
    });
    install(fakeApi({ usage }));
    expect(await canCreateBoard()).toBe(true);

    useAuth.setState({ session: null, user: null, status: "anonymous" });
    usage.mockClear();
    expect(await canCreateBoard()).toBe(true);
    expect(usage).not.toHaveBeenCalled();
  });
});

describe("T1 · 보드를 서버에 저장한다 (초대 링크 없이)", () => {
  it("서버에 올리고 내용도 한 번 올린다. 초대 링크는 만들지 않는다", async () => {
    const api = fakeApi();
    install(api);
    await getDB().boards.put(makeBoard("b1"));

    const result = await registerBoards(["b1"]);

    expect(result.registered).toEqual(["b1"]);
    expect(api.reissueInvite).not.toHaveBeenCalled();
    expect(useShare.getState().byBoard.b1).toMatchObject({ status: "shared", role: "owner", inviteToken: null });
    expect(uploadDoc).toHaveBeenCalledWith("b1", session.accessToken);
  });

  it("상한(413)에 닿으면 거기서 멈추고 이 기기에만 있다고 안내한다. 이미 올라간 보드는 그대로다", async () => {
    const share = vi
      .fn<ShareApi["share"]>()
      .mockResolvedValueOnce(summary("b1"))
      .mockRejectedValueOnce(new AuthRequestError("보드는 100개까지 저장할 수 있어요", 413, "quota_exceeded"));
    install(fakeApi({ share }));
    for (const id of ["b1", "b2", "b3"]) await getDB().boards.put(makeBoard(id));

    const result = await registerBoards(["b1", "b2", "b3"]);

    expect(result.registered).toEqual(["b1"]);
    expect(result.blocked).toBe("보드는 100개까지 저장할 수 있어요");
    expect(share).toHaveBeenCalledTimes(2); // b3은 시도하지 않는다
    expect(notified).toEqual([LOCAL_ONLY_BOARDS]);
    expect(useShare.getState().byBoard.b1?.status).toBe("shared");
    expect(useShare.getState().byBoard.b2?.status).not.toBe("shared");
  });

  it("오프라인이면 그 보드를 실패로 적고 안내는 띄우지 않는다", async () => {
    install(fakeApi({ share: vi.fn(async () => { throw new TypeError("network"); }) }));
    await getDB().boards.put(makeBoard("b1"));
    const result = await registerBoards(["b1"]);
    expect(result).toMatchObject({ registered: [], failed: ["b1"], blocked: null });
    expect(notified).toEqual([]);
  });

  it("고르기를 끝낸 뒤에 만든 최상위 보드만 자동으로 올린다", async () => {
    const share = vi.fn<ShareApi["share"]>(async (id) => summary(id));
    install(fakeApi({ share }));
    const since = NOW + 1000;
    await getDB().boards.bulkPut([
      makeBoard("old", { createdAt: NOW }),
      makeBoard("fresh", { createdAt: since + 1 }),
      makeBoard("child", { createdAt: since + 2, parentBoardId: "fresh" }),
      makeBoard("remote", { createdAt: since + 3, remote: true }),
    ]);

    // 고르기 전에는 아무것도 올리지 않는다 (D1).
    await registerNewBoards();
    expect(share).not.toHaveBeenCalled();

    await useStorage.getState().updateSettings({ serverStoreSince: { me: since } });
    await registerNewBoards();
    expect(share.mock.calls.map((c) => c[0])).toEqual(["fresh"]);
  });
});

describe("D1 · 처음 로그인하면 올릴 보드를 고른다", () => {
  it("로컬 보드가 있으면 목록을 주고, 고른 것만 올리고, 로그아웃해도 로컬 사본이 남는다", async () => {
    const share = vi.fn<ShareApi["share"]>(async (id) => summary(id));
    install(fakeApi({ share }));
    await getDB().boards.bulkPut([makeBoard("a"), makeBoard("b"), makeBoard("sub", { parentBoardId: "a" })]);

    const prepared = await prepareUploadChoice("me");
    expect(prepared?.boards.map((b) => b.id).sort()).toEqual(["a", "b"]);
    expect(share).not.toHaveBeenCalled();
    expect(useStorage.getState().settings?.serverStoreSince?.me).toBeUndefined();

    const result = await finishUploadChoice("me", prepared!.since, ["a"]);
    expect(result.registered).toEqual(["a"]);
    expect(share.mock.calls.map((c) => c[0])).toEqual(["a"]);
    expect(useStorage.getState().settings?.serverStoreSince?.me).toBe(prepared!.since);
    // 한 번 끝낸 계정에는 다시 묻지 않는다.
    expect(await prepareUploadChoice("me")).toBeNull();

    // 로그아웃해도 올리지 않은 보드를 포함한 로컬 사본은 그대로다.
    await useAuth.getState().logout();
    const ids = (await getDB().boards.toArray()).map((b) => b.id).sort();
    expect(ids).toEqual(expect.arrayContaining(["a", "b", "sub"]));
  });

  it("고를 보드가 없으면 창 없이 끝내고, 이후 만든 보드는 자동으로 올라간다", async () => {
    expect(await prepareUploadChoice("me")).toBeNull();
    expect(useStorage.getState().settings?.serverStoreSince?.me).toBeTypeOf("number");
  });

  it("서버에 닿지 못하면 끝낸 것으로 기록하지 않는다", async () => {
    install(fakeApi({ share: vi.fn(async () => { throw new TypeError("network"); }) }));
    await getDB().boards.put(makeBoard("a"));
    const prepared = await prepareUploadChoice("me");
    const result = await finishUploadChoice("me", prepared!.since, ["a"]);
    expect(result.failed).toEqual(["a"]);
    expect(useStorage.getState().settings?.serverStoreSince?.me).toBeUndefined();
  });

  it("건너뛰기는 아무것도 올리지 않고 끝낸다", async () => {
    const share = vi.fn<ShareApi["share"]>(async (id) => summary(id));
    install(fakeApi({ share }));
    await getDB().boards.put(makeBoard("a"));
    const prepared = await prepareUploadChoice("me");
    await finishUploadChoice("me", prepared!.since, []);
    expect(share).not.toHaveBeenCalled();
    expect(await prepareUploadChoice("me")).toBeNull();
  });
});

describe("지운 최상위 보드는 서버에서도 지운다", () => {
  it("소유자 기기의 최상위 보드만 서버 사본을 지운다", async () => {
    const unshare = vi.fn<ShareApi["unshare"]>(async () => undefined);
    install(fakeApi({ unshare }));
    useShare.getState().restoreShared("mine", "owner");
    useShare.getState().restoreShared("theirs", "editor");
    useShare.getState().setLocal("localOnly");

    await unshareRemovedSubBoards([
      makeBoard("mine"),
      makeBoard("theirs", { parentBoardId: SYSTEM_BOARD_ID }),
      makeBoard("localOnly"),
    ]);

    expect(unshare.mock.calls.map((c) => c[0])).toEqual(["mine"]);
  });

  it("다른 멤버가 있는 최상위 보드는 소유자가 지워도 서버 사본을 두고 공유를 풀지 않는다", async () => {
    const unshare = vi.fn<ShareApi["unshare"]>(async () => undefined);
    const members = vi.fn<ShareApi["members"]>(async (id) =>
      id === "together" ? [OWNER, EDITOR] : [OWNER],
    );
    install(fakeApi({ unshare, members }));
    useShare.getState().restoreShared("together", "owner");
    useShare.getState().restoreShared("alone", "owner");

    await unshareRemovedSubBoards([makeBoard("together"), makeBoard("alone")]);

    expect(unshare.mock.calls.map((c) => c[0])).toEqual(["alone"]);
    expect(useShare.getState().byBoard.together?.status).toBe("shared");
  });

  it("멤버를 확인하지 못하면(오프라인) 최상위 보드의 서버 사본을 지우지 않는다", async () => {
    const unshare = vi.fn<ShareApi["unshare"]>(async () => undefined);
    install(fakeApi({ unshare, members: vi.fn(async () => { throw new TypeError("network"); }) }));
    useShare.getState().restoreShared("mine", "owner");

    await unshareRemovedSubBoards([makeBoard("mine")]);

    expect(unshare).not.toHaveBeenCalled();
  });
});

describe("저장 상한(413)은 조용히 묻히지 않는다", () => {
  it("413 too_large(크기 초과)는 저장 상한 안내를 띄우지 않고 다음 동기화에 다시 시도한다", async () => {
    const share = vi.fn<ShareApi["share"]>(async () => {
      throw new AuthRequestError("보드 용량(500MB)을 넘었어요", 413, "too_large");
    });
    install(fakeApi({ share }));
    await getDB().boards.bulkPut([makeBoard("parent"), makeBoard("box1", { parentBoardId: "parent" })]);
    useShare.getState().restoreShared("parent", "owner");

    await shareSubBoards();

    expect(notified).toEqual([]);
    expect(useShare.getState().byBoard.box1?.status).not.toBe("shared");
  });

  it("/me/usage가 실패해 로컬로 만든 보드가 413을 받으면 안내하고 이 기기에만 둔다. 다시 시도해도 안내는 한 번", async () => {
    const share = vi.fn<ShareApi["share"]>(async () => {
      throw new AuthRequestError("보드는 100개까지 저장할 수 있어요", 413, "quota_exceeded");
    });
    install(fakeApi({ share, usage: vi.fn(async () => { throw new TypeError("network"); }) }));
    await useStorage.getState().updateSettings({ serverStoreSince: { me: Date.now() - 1000 } });

    const id = await useWorkspace.getState().createBoard("새 보드");

    await vi.waitFor(() => expect(notified).toEqual([LOCAL_ONLY_BOARDS]));
    expect(await getDB().boards.get(id)).toBeDefined();
    expect(useShare.getState().byBoard[id]?.status).not.toBe("shared");

    await registerNewBoards(); // 다음 동기화가 다시 시도한다
    expect(share).toHaveBeenCalledTimes(2);
    expect(notified).toHaveLength(1);
  });

  it("공유 보드 안 파일함이 413을 받으면 안내하고 그 파일함은 이 기기에만 둔다", async () => {
    const share = vi.fn<ShareApi["share"]>(async () => {
      throw new AuthRequestError("보드는 100개까지 저장할 수 있어요", 413, "quota_exceeded");
    });
    install(fakeApi({ share }));
    await getDB().boards.bulkPut([
      makeBoard("parent"),
      makeBoard("box1", { parentBoardId: "parent" }),
      makeBoard("box2", { parentBoardId: "parent" }),
    ]);
    useShare.getState().restoreShared("parent", "owner");

    await shareSubBoards();

    expect(share).toHaveBeenCalledTimes(1); // 상한에 닿으면 나머지는 시도하지 않는다
    expect(notified).toEqual([LOCAL_ONLY_BOARDS]);
    expect(useShare.getState().byBoard.box1?.status).not.toBe("shared");
    expect(await getDB().boards.get("box1")).toBeDefined();
  });
});

describe("새 보드 만들기 배선 (workspace)", () => {
  it("상한에 닿았으면 보드를 만들지 않고 안내만 띄운다. 기존 보드는 그대로다", async () => {
    install(fakeApi({ usage: vi.fn(async () => ({ boards: 100, maxBoards: 100, fileBytes: 0, maxFileBytes: 1024 ** 3 })) }));
    await getDB().boards.put(makeBoard("existing"));
    const before = (await getDB().boards.toArray()).length;

    await useWorkspace.getState().createBoard("새 보드");

    expect((await getDB().boards.toArray()).length).toBe(before);
    expect(notified).toHaveLength(1);
    expect(await getDB().boards.get("existing")).toBeDefined();
  });

  it("상한 아래면 만들고 서버에 저장한다", async () => {
    const share = vi.fn<ShareApi["share"]>(async (id) => summary(id));
    install(fakeApi({ share }));
    const since = Date.now() - 1000;
    await useStorage.getState().updateSettings({ serverStoreSince: { me: since } });

    const id = await useWorkspace.getState().createBoard("새 보드");

    await vi.waitFor(() => expect(share).toHaveBeenCalledWith(id, "새 보드", session.accessToken));
    expect(notified).toEqual([]);
  });
});

describe("D9 — 다른 멤버가 있는 최상위 보드를 소유자가 지운다", () => {
  let onServer: Set<string>;
  let unshare: Mock<ShareApi["unshare"]>;
  let confirmMemberDelete: Mock<(others: number | null) => Promise<boolean>>;

  function setup(answer: boolean) {
    onServer = new Set(["together"]);
    unshare = vi.fn<ShareApi["unshare"]>(async (id) => {
      onServer.delete(id);
    });
    install(
      fakeApi({
        unshare,
        members: vi.fn(async () => [OWNER, EDITOR]),
        myBoards: vi.fn(async () => [...onServer].map(summary)),
      }),
    );
    confirmMemberDelete = vi.fn(async () => answer);
    configureMembership({ confirmMemberDelete });
    useShare.getState().restoreShared("together", "owner");
  }

  afterEach(() => {
    // 남은 undo 타이머가 다음 테스트의 가짜 API를 부르지 않게 한다.
    useWorkspace.setState({ pendingBoardUndo: null, pendingSubcanvasUndo: null });
  });

  it("확인하면 실행 취소 기간 뒤 서버 사본을 지우고, 다음 syncMyBoards가 되살리지 않는다", async () => {
    setup(true);
    await getDB().boards.put(makeBoard("together"));
    const timers = vi.spyOn(globalThis, "setTimeout");

    await useWorkspace.getState().removeBoardWithUndo("together");
    const expire = timers.mock.calls.find((c) => c[1] === BOARD_UNDO_MS)?.[0] as () => void;
    timers.mockRestore();

    expect(confirmMemberDelete).toHaveBeenCalledWith(1);
    expect(unshare).not.toHaveBeenCalled(); // 실행 취소 기간에는 서버를 건드리지 않는다
    expire();
    await vi.waitFor(() => expect(unshare).toHaveBeenCalledWith("together", session.accessToken));

    await syncMyBoards();
    expect(await getDB().boards.get("together")).toBeUndefined();
  });

  it("확인을 거절하면 보드를 지우지 않는다", async () => {
    setup(false);
    await getDB().boards.put(makeBoard("together"));

    await useWorkspace.getState().removeBoardWithUndo("together");

    expect(confirmMemberDelete).toHaveBeenCalledWith(1);
    expect(await getDB().boards.get("together")).toBeDefined();
    expect(useWorkspace.getState().pendingBoardUndo).toBeNull();
    expect(unshare).not.toHaveBeenCalled();
  });

  it("홈의 보드 카드를 지울 때도 묻고, 거절하면 카드와 보드가 남는다", async () => {
    setup(false);
    await getDB().boards.put(makeBoard("together", { parentBoardId: SYSTEM_BOARD_ID }));
    const card = { id: "c1", kind: "board", boardRef: "together" } as Card;
    useWorkspace.setState({
      cards: [card],
      boards: await useStorage.getState().loadBoards(),
      currentBoardId: SYSTEM_BOARD_ID,
    });

    useWorkspace.getState().removeSelected(["c1"]);

    await vi.waitFor(() => expect(confirmMemberDelete).toHaveBeenCalledWith(1));
    await new Promise((r) => setTimeout(r, 0));
    expect(useWorkspace.getState().cards.map((c) => c.id)).toEqual(["c1"]);
    expect(await getDB().boards.get("together")).toBeDefined();
  });

  it("홈의 보드 카드 삭제를 확인하면 카드와 보드를 지운다", async () => {
    setup(true);
    await getDB().boards.put(makeBoard("together", { parentBoardId: SYSTEM_BOARD_ID }));
    const card = { id: "c1", kind: "board", boardRef: "together" } as Card;
    useWorkspace.setState({
      cards: [card],
      boards: await useStorage.getState().loadBoards(),
      currentBoardId: SYSTEM_BOARD_ID,
    });

    useWorkspace.getState().remove("c1");

    await vi.waitFor(async () => expect(await getDB().boards.get("together")).toBeUndefined());
    expect(useWorkspace.getState().cards).toEqual([]);
  });

  it("혼자 쓰는 보드는 묻지 않는다", async () => {
    setup(true);
    install(fakeApi({ members: vi.fn(async () => [OWNER]) }));
    configureMembership({ confirmMemberDelete });
    await getDB().boards.put(makeBoard("together"));

    await useWorkspace.getState().removeBoardWithUndo("together");

    expect(confirmMemberDelete).not.toHaveBeenCalled();
    expect(await getDB().boards.get("together")).toBeUndefined();
  });
});

