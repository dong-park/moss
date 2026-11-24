import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import * as Y from "yjs";
import { CollabSession } from "../CollabSession";
import { resetAuthStore, useAuth, type AuthSession } from "@/state/auth";
import { configureCollab, resetCollabStore, useCollab } from "@/state/collab";
import { configureMembership, resetMembershipDeps } from "@/state/membership";
import { resetShareStore, useShare } from "@/state/share";
import { restoreSharedFromDevice } from "@/state/share/store";
import { useStorage } from "@/state/storage";
import { useWorkspace, SYSTEM_BOARD_ID } from "@/state/workspace";

const NOW = 1_700_000_000_000;

function makeToken(expSeconds: number): string {
  const enc = (obj: unknown) =>
    btoa(JSON.stringify(obj))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  return `${enc({ alg: "HS256" })}.${enc({ exp: expSeconds })}.sig`;
}

const session: AuthSession = {
  accessToken: makeToken(9_999_999_999),
  refreshToken: makeToken(9_999_999_999),
  user: { id: "u1", name: "동환", avatar: null },
};

function makeFactory() {
  const created: Array<{ handle: { destroy: ReturnType<typeof vi.fn> } }> = [];
  const factory = {
    create() {
      const handle = {
        awareness: null,
        connect: vi.fn(),
        disconnect: vi.fn(),
        destroy: vi.fn(),
      };
      created.push({ handle });
      return handle;
    },
  };
  return { factory, created };
}

beforeEach(() => {
  resetAuthStore();
  resetCollabStore();
  resetShareStore();
  resetMembershipDeps();
});

afterEach(() => {
  resetAuthStore();
  resetCollabStore();
  resetShareStore();
  resetMembershipDeps();
  useStorage.setState({ initialized: false, settings: null, quota: null });
  useWorkspace.setState({ currentBoardId: SYSTEM_BOARD_ID });
});

describe("CollabSession", () => {
  it("shared + 로그인 상태에서 연결하고, 공유가 풀리면 끊는다", async () => {
    const { factory, created } = makeFactory();
    configureCollab({
      providerFactory: factory,
      fetchBoardToken: async () => ({
        boardToken: "bt",
        expiresInSeconds: 3600,
      }),
      getBoardDoc: () => new Y.Doc(),
      syncUrl: () => "ws://sync.test",
      now: () => NOW,
    });
    useAuth.setState({
      session,
      user: session.user,
      status: "authenticated",
      hydrated: true,
      hydrating: false,
    });
    useWorkspace.setState({ currentBoardId: "b1" });
    useShare.setState({
      byBoard: { b1: { status: "shared", inviteToken: null } },
    });

    render(<CollabSession />);

    await waitFor(() => expect(created).toHaveLength(1));

    useShare.setState({
      byBoard: { b1: { status: "local", inviteToken: null } },
    });

    await waitFor(() => expect(created[0].handle.destroy).toHaveBeenCalled());
  });

  it("G1: 다른 계정이 남긴 공유 기록으로는 이 계정의 토큰으로 연결하지 않는다", async () => {
    const { factory, created } = makeFactory();
    const fetchBoardToken = vi.fn(async () => ({ boardToken: "bt", expiresInSeconds: 3600 }));
    configureCollab({
      providerFactory: factory,
      fetchBoardToken,
      getBoardDoc: () => new Y.Doc(),
      syncUrl: () => "ws://sync.test",
      now: () => NOW,
    });
    useAuth.setState({
      session,
      user: session.user, // u1
      status: "authenticated",
      hydrated: true,
      hydrating: false,
    });
    useWorkspace.setState({ currentBoardId: "b1" });
    // 계정 A 가 이 기기에 남긴 공유 기록. 새로고침 뒤 B(u1)가 로그인한 상태다.
    localStorage.setItem(
      "moss:sharedBoards",
      JSON.stringify({ userId: "A", boards: { b1: "editor" } }),
    );
    restoreSharedFromDevice();

    render(<CollabSession />);
    await new Promise((r) => setTimeout(r, 30));

    expect(useShare.getState().byBoard.b1).toBeUndefined();
    expect(fetchBoardToken).not.toHaveBeenCalled();
    expect(created).toHaveLength(0);
    localStorage.removeItem("moss:sharedBoards");
  });

  it("G1: 같은 계정의 기록이면 서버 목록 확인을 기다리지 않고 연결한다", async () => {
    const { factory, created } = makeFactory();
    configureCollab({
      providerFactory: factory,
      fetchBoardToken: async () => ({ boardToken: "bt", expiresInSeconds: 3600 }),
      getBoardDoc: () => new Y.Doc(),
      syncUrl: () => "ws://sync.test",
      now: () => NOW,
    });
    useAuth.setState({
      session,
      user: session.user,
      status: "authenticated",
      hydrated: true,
      hydrating: false,
    });
    useWorkspace.setState({ currentBoardId: "b1" });
    localStorage.setItem(
      "moss:sharedBoards",
      JSON.stringify({ userId: "u1", boards: { b1: "editor" } }),
    );
    restoreSharedFromDevice();

    render(<CollabSession />);

    await waitFor(() => expect(created).toHaveLength(1));
    localStorage.removeItem("moss:sharedBoards");
  });

  it("P2: 언마운트하면 provider를 destroy한다", async () => {
    const { factory, created } = makeFactory();
    configureCollab({
      providerFactory: factory,
      fetchBoardToken: async () => ({
        boardToken: "bt",
        expiresInSeconds: 3600,
      }),
      getBoardDoc: () => new Y.Doc(),
      syncUrl: () => "ws://sync.test",
      now: () => NOW,
    });
    useAuth.setState({
      session,
      user: session.user,
      status: "authenticated",
      hydrated: true,
      hydrating: false,
    });
    useWorkspace.setState({ currentBoardId: "b1" });
    useShare.setState({
      byBoard: { b1: { status: "shared", inviteToken: null } },
    });

    const { unmount } = render(<CollabSession />);
    await waitFor(() => expect(created).toHaveLength(1));

    unmount();

    expect(created[0].handle.destroy).toHaveBeenCalled();
  });

  it("revoked(4403) 뒤 로컬 사본 삭제를 잇고 한 번 알린다 (AC-13·AC-14)", async () => {
    const { factory } = makeFactory();
    configureCollab({
      providerFactory: factory,
      fetchBoardToken: async () => ({
        boardToken: "bt",
        expiresInSeconds: 3600,
      }),
      getBoardDoc: () => new Y.Doc(),
      syncUrl: () => "ws://sync.test",
      now: () => NOW,
    });
    const deleteDoc = vi.fn(async () => {});
    const notify = vi.fn();
    configureMembership({ deleteDoc, notify });
    useAuth.setState({
      session,
      user: session.user,
      status: "authenticated",
      hydrated: true,
      hydrating: false,
    });
    useWorkspace.setState({ currentBoardId: "b1" });
    useShare.setState({
      byBoard: { b1: { status: "shared", inviteToken: null } },
    });

    render(<CollabSession />);
    await waitFor(() => expect(useCollab.getState().boardId).toBe("b1"));

    // 실제 4403 close가 store에서 만드는 상태.
    useCollab.setState({
      boardId: null,
      status: "idle",
      error: "revoked",
      revokedBoardId: "b1",
    });

    await waitFor(() => expect(deleteDoc).toHaveBeenCalledWith("b1"));
    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith("공유가 끝난 보드예요"),
    );
    expect(useShare.getState().byBoard.b1).toBeUndefined();
  });

  it("로그인하지 않았으면 연결하지 않는다 (AC-1)", async () => {
    const { factory, created } = makeFactory();
    configureCollab({
      providerFactory: factory,
      fetchBoardToken: async () => ({
        boardToken: "bt",
        expiresInSeconds: 3600,
      }),
      getBoardDoc: () => new Y.Doc(),
      syncUrl: () => "ws://sync.test",
      now: () => NOW,
    });
    useWorkspace.setState({ currentBoardId: "b1" });
    useShare.setState({
      byBoard: { b1: { status: "shared", inviteToken: null } },
    });

    render(<CollabSession />);
    await new Promise((r) => setTimeout(r, 20));

    expect(created).toHaveLength(0);
  });
});
