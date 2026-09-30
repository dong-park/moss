import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { configureAuth, resetAuthDeps, useAuth } from "@/state/auth/store";
import type { AuthSession, BoardSummary } from "@/state/auth/types";
import type { ShareApi } from "../api";
import type { BoardMember } from "../types";
import { configureShare, resetShareStore, UNNAMED_BOARD, useShare } from "../store";

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

function fakeShareApi(overrides: Partial<ShareApi> = {}): ShareApi {
  return {
    share: vi.fn(async (): Promise<BoardSummary> => ({ id: "b1", name: "보드", role: "owner", ownerName: "동환" })),
    boardToken: vi.fn(async () => ({ boardToken: "bt", expiresInSeconds: 3600 })),
    unshare: vi.fn(async () => undefined),
    reissueInvite: vi.fn(async () => "tok-1"),
    removeMember: vi.fn(async () => undefined),
    members: vi.fn(async () => [] as BoardMember[]),
    myBoards: vi.fn(async () => []),
    ...overrides,
  };
}

beforeEach(() => {
  resetShareStore();
  resetAuthDeps();
  configureAuth({ now: () => NOW });
  useAuth.setState({
    session,
    user: session.user,
    status: "authenticated",
    hydrated: true,
    hydrating: false,
  });
});

afterEach(() => {
  resetShareStore();
  resetAuthDeps();
  useAuth.setState({
    session: null,
    user: null,
    status: "anonymous",
    hydrated: false,
    hydrating: false,
  });
});

describe("startShare 보드별 in-flight 가드 (n8a 리뷰 1)", () => {
  test("같은 보드에 동시에 두 번 눌러도 공유·재발급은 한 번이다", async () => {
    const api = fakeShareApi();
    configureShare({ api });

    await Promise.all([
      useShare.getState().startShare("b1", "보드"),
      useShare.getState().startShare("b1", "보드"),
    ]);

    expect(api.share).toHaveBeenCalledTimes(1);
    expect(api.reissueInvite).toHaveBeenCalledTimes(1);
    expect(useShare.getState().byBoard.b1).toMatchObject({ status: "shared", role: "owner" });
  });

  test("다른 보드는 서로 잠그지 않는다", async () => {
    const api = fakeShareApi();
    configureShare({ api });

    await Promise.all([
      useShare.getState().startShare("b1", "보드1"),
      useShare.getState().startShare("b2", "보드2"),
    ]);

    expect(api.share).toHaveBeenCalledTimes(2);
    expect(useShare.getState().byBoard.b1.status).toBe("shared");
    expect(useShare.getState().byBoard.b2.status).toBe("shared");
  });

  test("실패는 그 보드의 errorByBoard에만 남는다", async () => {
    const api = fakeShareApi({
      share: vi.fn(async () => {
        throw new Error("권한이 없어요");
      }),
    });
    configureShare({ api });

    await expect(useShare.getState().startShare("b1", "보드")).rejects.toThrow("권한이 없어요");

    expect(useShare.getState().errorByBoard.b1).toBe("권한이 없어요");
    expect(useShare.getState().busyByBoard.b1).toBe(false);
    expect(useShare.getState().errorByBoard.b2).toBeUndefined();
  });
});

describe("restoreShared (n8a 리뷰 2)", () => {
  test("이미 shared면 토큰을 건드리지 않는다 — 재발급하지 않는다", () => {
    useShare.setState({
      byBoard: { b1: { status: "shared", inviteToken: "tok-old", role: "owner" } },
    });

    useShare.getState().restoreShared("b1", "owner");

    expect(useShare.getState().byBoard.b1.inviteToken).toBe("tok-old");
  });

  test("shared 복원은 토큰이 없으면 링크 새로 만들기 대상으로 둔다", () => {
    useShare.getState().restoreShared("b1", "editor");

    expect(useShare.getState().byBoard.b1).toEqual({
      status: "shared",
      inviteToken: null,
      role: "editor",
    });
  });
});

describe("removeMember 갱신 (n8a 리뷰 4)", () => {
  test("내보내기 성공 뒤 멤버 목록을 서버 값으로 바꾼다", async () => {
    const after: BoardMember[] = [{ id: "u1", name: "동환", avatar: null, role: "owner" }];
    const api = fakeShareApi({ members: vi.fn(async () => after) });
    configureShare({ api });
    useShare.setState({
      byBoard: {
        b1: {
          status: "shared",
          inviteToken: "tok",
          role: "owner",
          members: [
            { id: "u1", name: "동환", avatar: null, role: "owner" },
            { id: "u2", name: "민지", avatar: null, role: "editor" },
          ],
        },
      },
    });

    await useShare.getState().removeMember("b1", "u2");

    expect(api.removeMember).toHaveBeenCalledWith("b1", "u2", session.accessToken);
    expect(useShare.getState().byBoard.b1.members).toEqual(after);
  });
});

describe("startShare 빈 보드 이름 (/prove AC-4)", () => {
  test("빈 이름이면 기본 이름을 보낸다", async () => {
    const api = fakeShareApi();
    configureShare({ api });
    await useShare.getState().startShare("b1", "  ");
    expect(api.share).toHaveBeenCalledWith("b1", UNNAMED_BOARD, session.accessToken);
  });
});
