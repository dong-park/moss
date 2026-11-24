import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { AuthApi } from "@/state/auth/api";
import { configureAuth, resetAuthDeps, useAuth } from "@/state/auth/store";
import { clearSession } from "@/state/auth/tokenStore";
import type { AuthSession, BoardSummary } from "@/state/auth/types";
import { resetCollabStore, useCollab } from "@/state/collab";
import type { ShareApi } from "../api";
import type { BoardMember } from "../types";
import {
  configureShare,
  resetShareStore,
  ShareStartError,
  UNNAMED_BOARD,
  useShare,
} from "../store";
import { wallShareState } from "../wallState";

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

beforeEach(async () => {
  // 로그인 테스트가 IndexedDB에 남긴 세션이 다음 테스트로 새지 않게 한다.
  await clearSession();
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

afterEach(async () => {
  await clearSession();
  resetShareStore();
  resetCollabStore();
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
    configureShare({ api, uploadDoc: vi.fn(async () => {}) });

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
    configureShare({ api, uploadDoc: vi.fn(async () => {}) });

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
    configureShare({ api, uploadDoc: vi.fn(async () => {}) });

    await expect(useShare.getState().startShare("b1", "보드")).rejects.toThrow("권한이 없어요");

    expect(useShare.getState().errorByBoard.b1).toBe("권한이 없어요");
    expect(useShare.getState().busyByBoard.b1).toBe(false);
    expect(useShare.getState().errorByBoard.b2).toBeUndefined();
  });
});

describe("startShare 두 탭이 같은 벽을 공유하려 할 때 (G2)", () => {
  const lockKey = (id: string) => `moss:shareStarting:${id}`;

  afterEach(() => {
    localStorage.removeItem(lockKey("b1"));
  });

  test("다른 탭이 시작 중이면 서버를 부르지 않고 elsewhere 이유로 멈춘다", async () => {
    localStorage.setItem(
      lockKey("b1"),
      JSON.stringify({ token: "other-tab", expiresAt: Date.now() + 20_000 }),
    );
    const api = fakeShareApi();
    const uploadDoc = vi.fn(async () => {});
    configureShare({ api, uploadDoc });

    const attempt = useShare.getState().startShare("b1", "보드");

    await expect(attempt).rejects.toMatchObject({ name: "ShareStartError", reason: "elsewhere" });
    expect(api.myBoards).not.toHaveBeenCalled();
    expect(api.share).not.toHaveBeenCalled();
    expect(uploadDoc).not.toHaveBeenCalled();
    expect(api.unshare).not.toHaveBeenCalled();
    expect(useShare.getState().failureByBoard.b1).toBe("elsewhere");
    expect(useShare.getState().busyByBoard.b1).toBe(false);
    // 남의 락을 지우지 않는다.
    expect(JSON.parse(localStorage.getItem(lockKey("b1")) ?? "{}").token).toBe("other-tab");
  });

  test("다른 탭의 락이 만료됐으면(그 탭이 죽었다) 시작한다", async () => {
    localStorage.setItem(
      lockKey("b1"),
      JSON.stringify({ token: "dead-tab", expiresAt: Date.now() - 1 }),
    );
    configureShare({ api: fakeShareApi(), uploadDoc: vi.fn(async () => {}) });

    await useShare.getState().startShare("b1", "보드");

    expect(useShare.getState().byBoard.b1?.status).toBe("shared");
  });

  test("진행하는 동안 락을 쥐고 끝나면 푼다", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    configureShare({ api: fakeShareApi(), uploadDoc: vi.fn(() => gate) });

    const attempt = useShare.getState().startShare("b1", "보드");
    await vi.waitFor(() => expect(localStorage.getItem(lockKey("b1"))).not.toBeNull());
    release();
    await attempt;

    expect(localStorage.getItem(lockKey("b1"))).toBeNull();
  });

  test("실패해도 락을 푼다", async () => {
    configureShare({
      api: fakeShareApi(),
      uploadDoc: vi.fn(async () => {
        throw new Error("끊겼어요");
      }),
    });

    await expect(useShare.getState().startShare("b1", "보드")).rejects.toBeInstanceOf(
      ShareStartError,
    );

    expect(localStorage.getItem(lockKey("b1"))).toBeNull();
  });

  test("락을 얻은 뒤 상태 갱신이 던져도 락과 진행 표시가 새지 않는다", async () => {
    configureShare({ api: fakeShareApi(), uploadDoc: vi.fn(async () => {}) });
    const unsubscribe = useShare.subscribe(() => {
      throw new Error("구독자 오류");
    });

    await expect(useShare.getState().startShare("b1", "보드")).rejects.toThrow("구독자 오류");
    unsubscribe();

    expect(localStorage.getItem(lockKey("b1"))).toBeNull();
    // 진행 중 표시도 풀려 다시 시작할 수 있다.
    await useShare.getState().startShare("b1", "보드");
    expect(useShare.getState().byBoard.b1?.status).toBe("shared");
  });

  test("다른 보드의 락은 이 보드를 막지 않는다", async () => {
    localStorage.setItem(
      lockKey("other"),
      JSON.stringify({ token: "other-tab", expiresAt: Date.now() + 20_000 }),
    );
    configureShare({ api: fakeShareApi(), uploadDoc: vi.fn(async () => {}) });

    await useShare.getState().startShare("b1", "보드");

    expect(useShare.getState().byBoard.b1?.status).toBe("shared");
    localStorage.removeItem(lockKey("other"));
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
    configureShare({ api, uploadDoc: vi.fn(async () => {}) });
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
    configureShare({ api, uploadDoc: vi.fn(async () => {}) });
    await useShare.getState().startShare("b1", "  ");
    expect(api.share).toHaveBeenCalledWith("b1", UNNAMED_BOARD, session.accessToken);
  });
});

function deferred() {
  let resolve!: () => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function signOut() {
  useAuth.setState({ session: null, user: null, status: "anonymous", hydrated: true });
}

/** spec 상태 모델의 불가능한 조합 셋이 이 보드에 없다. */
function expectNoImpossibleCombination(boardId: string, api: ShareApi) {
  const state = wallShareState(boardId);
  // 이 기기에만인데 동기화 연결이 열려 있다.
  if (useCollab.getState().boardId === boardId) expect(state).not.toBe("local");
  // 공유 중인데 서버 행이 없다 — share 호출이 있었고 그 뒤에 지워지지 않았어야 한다.
  if (state === "shared" || state === "sharedLoggedOut") {
    const shareCalls = (api.share as ReturnType<typeof vi.fn>).mock.calls.filter((c) => c[0] === boardId);
    const unshareCalls = (api.unshare as ReturnType<typeof vi.fn>).mock.calls.filter((c) => c[0] === boardId);
    expect(shareCalls.length).toBeGreaterThan(unshareCalls.length);
  }
}

describe("startShare 순서 — 서버가 받은 뒤에만 공유 중이다 (T6)", () => {
  test("업로드가 끝나기 전에는 shared가 아니고 올리는 중이다", async () => {
    const upload = deferred();
    const api = fakeShareApi();
    const uploadDoc = vi.fn(() => upload.promise);
    configureShare({ api, uploadDoc });

    const pending = useShare.getState().startShare("b1", "보드");
    await vi.waitFor(() => expect(uploadDoc).toHaveBeenCalledTimes(1));

    // 서버 행은 있지만 내용이 아직 확인되지 않았다.
    expect(api.share).toHaveBeenCalledTimes(1);
    expect(useShare.getState().byBoard.b1?.status ?? "local").toBe("local");
    expect(wallShareState("b1")).toBe("uploading");
    expect(useShare.getState().busyByBoard.b1).toBe(true);
    // 초대 토큰은 확인 뒤에야 만든다.
    expect(api.reissueInvite).not.toHaveBeenCalled();
    expectNoImpossibleCombination("b1", api);

    upload.resolve();
    await pending;

    expect(wallShareState("b1")).toBe("shared");
    expect(useShare.getState().byBoard.b1).toMatchObject({ status: "shared", inviteToken: "tok-1" });
    expect(useShare.getState().phaseByBoard.b1).toBeUndefined();
    expectNoImpossibleCombination("b1", api);
  });

  test("호출 순서는 서버 행 → 업로드 확인 → 초대 토큰이다", async () => {
    const calls: string[] = [];
    const api = fakeShareApi({
      share: vi.fn(async () => {
        calls.push("share");
        return { id: "b1", name: "보드", role: "owner", ownerName: "동환" } as BoardSummary;
      }),
      reissueInvite: vi.fn(async () => {
        calls.push("invite");
        return "tok-1";
      }),
    });
    configureShare({
      api,
      uploadDoc: vi.fn(async () => {
        calls.push("upload");
      }),
    });

    await useShare.getState().startShare("b1", "보드");

    expect(calls).toEqual(["share", "upload", "invite"]);
  });

  test("업로드에는 서버 행을 만든 세션의 토큰을 쓴다", async () => {
    const uploadDoc = vi.fn(async () => {});
    configureShare({ api: fakeShareApi(), uploadDoc });

    await useShare.getState().startShare("b1", "보드");

    expect(uploadDoc).toHaveBeenCalledWith("b1", session.accessToken);
  });

  test("같은 보드를 두 번 눌러도 업로드는 한 번이다", async () => {
    const upload = deferred();
    const uploadDoc = vi.fn(() => upload.promise);
    configureShare({ api: fakeShareApi(), uploadDoc });

    const first = useShare.getState().startShare("b1", "보드");
    const second = useShare.getState().startShare("b1", "보드");
    await vi.waitFor(() => expect(uploadDoc).toHaveBeenCalledTimes(1));
    upload.resolve();
    await Promise.all([first, second]);

    expect(uploadDoc).toHaveBeenCalledTimes(1);
  });
});

describe("startShare 업로드 실패 — 서버 행을 지우고 이 기기에만으로 돌아온다 (T9)", () => {
  test("업로드가 실패하면 서버 행 삭제가 불리고 local이다", async () => {
    const api = fakeShareApi();
    configureShare({
      api,
      uploadDoc: vi.fn(async () => {
        throw new Error("서버가 벽 내용을 받았는지 확인하지 못했어요");
      }),
    });

    const attempt = useShare.getState().startShare("b1", "보드");
    await expect(attempt).rejects.toBeInstanceOf(ShareStartError);
    await expect(attempt).rejects.toMatchObject({ reason: "share", serverRowLeft: false });

    expect(api.unshare).toHaveBeenCalledWith("b1", session.accessToken);
    expect(api.reissueInvite).not.toHaveBeenCalled();
    expect(useShare.getState().byBoard.b1?.status ?? "local").toBe("local");
    expect(wallShareState("b1")).toBe("local");
    expect(useShare.getState().failureByBoard.b1).toBe("share");
    expect(useShare.getState().busyByBoard.b1).toBe(false);
    expect(useShare.getState().phaseByBoard.b1).toBeUndefined();
    expectNoImpossibleCombination("b1", { ...api, share: vi.fn(), unshare: vi.fn() });
  });

  test("확인 업로드가 늦어 끝나지 않은 것과 서버가 거절한 것을 가른다 (F5)", async () => {
    const make = (reason: string) => {
      const err = new Error("x");
      err.name = "UploadNotConfirmedError";
      (err as Error & { reason: string }).reason = reason;
      return err;
    };
    const api = fakeShareApi();
    configureShare({
      api,
      uploadDoc: vi.fn(async () => {
        throw make("timeout");
      }),
    });
    await expect(useShare.getState().startShare("b1", "보드")).rejects.toMatchObject({
      uploadFailure: "timeout",
    });

    configureShare({
      uploadDoc: vi.fn(async () => {
        throw make("closed");
      }),
    });
    await expect(useShare.getState().startShare("b1", "보드")).rejects.toMatchObject({
      uploadFailure: "rejected",
    });
  });

  test("초대 토큰을 못 만들어도 같은 이유로 되돌린다", async () => {
    const api = fakeShareApi({
      reissueInvite: vi.fn(async () => {
        throw new Error("링크를 못 만들었어요");
      }),
    });
    configureShare({ api, uploadDoc: vi.fn(async () => {}) });

    await expect(useShare.getState().startShare("b1", "보드")).rejects.toThrow("링크를 못 만들었어요");

    expect(api.unshare).toHaveBeenCalledTimes(1);
    expect(wallShareState("b1")).toBe("local");
  });

  test("서버 행을 지우지 못해도 상태는 이 기기에만이고 오류에 그 사실이 남는다", async () => {
    const api = fakeShareApi({
      unshare: vi.fn(async () => {
        throw new Error("offline");
      }),
    });
    configureShare({
      api,
      uploadDoc: vi.fn(async () => {
        throw new Error("끊겼어요");
      }),
    });

    await expect(useShare.getState().startShare("b1", "보드")).rejects.toMatchObject({
      reason: "share",
      serverRowLeft: true,
      message: "끊겼어요",
    });

    expect(wallShareState("b1")).toBe("local");
    expect(useShare.getState().errorByBoard.b1).toBe("끊겼어요");
    expect(useShare.getState().busyByBoard.b1).toBe(false);
  });

  test("지우지 못한 서버 행은 다음 시도가 만들기 전에 먼저 지운다 (F4)", async () => {
    const calls: string[] = [];
    const api = fakeShareApi({
      share: vi.fn(async (): Promise<BoardSummary> => {
        calls.push("share");
        return { id: "b1", name: "보드", role: "owner", ownerName: "동환" };
      }),
      unshare: vi.fn(async () => {
        calls.push("unshare");
        if (calls.filter((c) => c === "unshare").length === 1) throw new Error("offline");
      }),
    });
    const uploadDoc = vi
      .fn<(boardId: string, token: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error("끊겼어요"))
      .mockResolvedValue(undefined);
    configureShare({ api, uploadDoc });

    await expect(useShare.getState().startShare("b1", "보드")).rejects.toMatchObject({
      serverRowLeft: true,
    });
    await useShare.getState().startShare("b1", "보드");

    // share → (롤백 unshare 실패) → 다음 시도: unshare(정리) → share
    expect(calls).toEqual(["share", "unshare", "unshare", "share"]);
    expect(wallShareState("b1")).toBe("shared");
  });

  test("남은 서버 행은 만든 계정으로만 지운다 — 다른 계정의 토큰으로 지우려 하지 않는다 (G4)", async () => {
    const api = fakeShareApi({
      unshare: vi
        .fn<ShareApi["unshare"]>()
        .mockRejectedValueOnce(new Error("offline")) // A 의 롤백이 못 지운다
        .mockResolvedValue(undefined),
    });
    const uploadDoc = vi
      .fn<(boardId: string, token: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error("끊겼어요"))
      .mockResolvedValue(undefined);
    configureShare({ api, uploadDoc });
    await expect(useShare.getState().startShare("b1", "보드")).rejects.toMatchObject({
      serverRowLeft: true,
    });
    (api.unshare as ReturnType<typeof vi.fn>).mockClear();

    // 같은 탭에서 다른 계정(B)이 로그인해 같은 id의 벽을 공유한다.
    const sessionB: AuthSession = {
      accessToken: makeToken(NOW / 1000 + 600) + "-b",
      refreshToken: makeToken(NOW / 1000 + 600),
      user: { id: "u2", name: "다른 사람", avatar: null },
    };
    useAuth.setState({ session: sessionB, user: sessionB.user, status: "authenticated" });
    await useShare.getState().startShare("b1", "보드");

    // B 의 시작은 A 가 남긴 행을 B 의 토큰으로 지우지 않고, A 의 것 때문에 막히지도 않는다.
    expect(api.unshare).not.toHaveBeenCalled();
    expect(wallShareState("b1")).toBe("shared");

    // A 가 돌아와 다시 시작하면 A 의 토큰으로 먼저 정리한다.
    useShare.getState().setLocal("b1");
    useAuth.setState({ session, user: session.user, status: "authenticated" });
    await useShare.getState().startShare("b1", "보드");
    expect(api.unshare).toHaveBeenCalledWith("b1", session.accessToken);
  });

  test("남은 서버 행을 또 못 지우면 새로 만들지 않고 serverRowLeft로 멈춘다 (F4)", async () => {
    const api = fakeShareApi({
      unshare: vi.fn(async () => {
        throw new Error("offline");
      }),
    });
    const uploadDoc = vi
      .fn<(boardId: string, token: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error("끊겼어요"))
      .mockResolvedValue(undefined);
    configureShare({ api, uploadDoc });

    await expect(useShare.getState().startShare("b1", "보드")).rejects.toMatchObject({
      serverRowLeft: true,
    });
    (api.share as ReturnType<typeof vi.fn>).mockClear();
    await expect(useShare.getState().startShare("b1", "보드")).rejects.toMatchObject({
      serverRowLeft: true,
    });

    expect(api.share).not.toHaveBeenCalled();
    expect(wallShareState("b1")).toBe("local");
  });

  test("서버 행 만들기가 실패하면 지우지 않는다 — 남의 보드를 건드리지 않게", async () => {
    const api = fakeShareApi({
      share: vi.fn(async () => {
        throw new Error("권한이 없어요");
      }),
    });
    const uploadDoc = vi.fn(async () => {});
    configureShare({ api, uploadDoc });

    await expect(useShare.getState().startShare("b1", "보드")).rejects.toMatchObject({ reason: "share" });

    expect(api.unshare).not.toHaveBeenCalled();
    expect(uploadDoc).not.toHaveBeenCalled();
  });

  test("서버에 이미 있는 행에서 업로드가 실패하면 서버 행을 지우지 않고 공유 중으로 둔다", async () => {
    const api = fakeShareApi({
      myBoards: vi.fn(async (): Promise<BoardSummary[]> => [
        { id: "b1", name: "보드", role: "owner", ownerName: "동환" },
      ]),
    });
    configureShare({
      api,
      uploadDoc: vi.fn(async () => {
        throw new Error("끊겼어요");
      }),
    });

    await expect(useShare.getState().startShare("b1", "보드")).rejects.toMatchObject({
      reason: "share",
      serverRowLeft: false,
      // 공유는 유지되지만 이번에 올린 내용은 서버가 받았는지 확인되지 않았다 (G4).
      contentUnconfirmed: true,
    });

    expect(api.unshare).not.toHaveBeenCalled();
    expect(useShare.getState().byBoard.b1?.status).toBe("shared");
    expect(useShare.getState().byBoard.b1?.role).toBe("owner");
    expect(useShare.getState().busyByBoard.b1).toBe(false);
  });

  test("서버에 이미 있는 행에서 초대 토큰이 실패해도 지우지 않는다", async () => {
    const api = fakeShareApi({
      myBoards: vi.fn(async (): Promise<BoardSummary[]> => [
        { id: "b1", name: "보드", role: "owner", ownerName: "동환" },
      ]),
      reissueInvite: vi.fn(async () => {
        throw new Error("링크를 못 만들었어요");
      }),
    });
    configureShare({ api, uploadDoc: vi.fn(async () => {}) });

    await expect(useShare.getState().startShare("b1", "보드")).rejects.toThrow("링크를 못 만들었어요");

    expect(api.unshare).not.toHaveBeenCalled();
    expect(useShare.getState().byBoard.b1?.status).toBe("shared");
  });

  test("내 보드 목록을 읽지 못하면 서버 행을 만들지 않는다", async () => {
    const api = fakeShareApi({
      myBoards: vi.fn(async () => {
        throw new Error("offline");
      }),
    });
    const uploadDoc = vi.fn(async () => {});
    configureShare({ api, uploadDoc });

    await expect(useShare.getState().startShare("b1", "보드")).rejects.toMatchObject({ reason: "share" });

    expect(api.share).not.toHaveBeenCalled();
    expect(api.unshare).not.toHaveBeenCalled();
    expect(uploadDoc).not.toHaveBeenCalled();
    expect(wallShareState("b1")).toBe("local");
  });

  test("다시 누르면 처음부터 한다", async () => {
    const api = fakeShareApi();
    const uploadDoc = vi
      .fn<(boardId: string, token: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error("끊겼어요"))
      .mockResolvedValueOnce(undefined);
    configureShare({ api, uploadDoc });

    await expect(useShare.getState().startShare("b1", "보드")).rejects.toThrow("끊겼어요");
    await useShare.getState().startShare("b1", "보드");

    expect(api.share).toHaveBeenCalledTimes(2);
    expect(uploadDoc).toHaveBeenCalledTimes(2);
    expect(wallShareState("b1")).toBe("shared");
    expect(useShare.getState().failureByBoard.b1).toBeNull();
    expect(useShare.getState().errorByBoard.b1).toBeNull();
  });
});

describe("startShare 다른 계정의 기기 (F3)", () => {
  test("기기 주인이 다른 계정이면 서버를 부르지 않고 account 이유로 멈춘다", async () => {
    const api = fakeShareApi();
    const uploadDoc = vi.fn(async () => {});
    configureShare({ api, uploadDoc, localOwnerId: async () => "someone-else" });

    await expect(useShare.getState().startShare("b1", "보드")).rejects.toMatchObject({
      reason: "account",
    });

    expect(api.myBoards).not.toHaveBeenCalled();
    expect(api.share).not.toHaveBeenCalled();
    expect(uploadDoc).not.toHaveBeenCalled();
    expect(useShare.getState().failureByBoard.b1).toBe("account");
    expect(useShare.getState().busyByBoard.b1).toBe(false);
    expect(wallShareState("b1")).toBe("local");
  });

  test("주인 기록이 없거나 같은 계정이면 공유한다", async () => {
    const api = fakeShareApi();
    configureShare({ api, uploadDoc: vi.fn(async () => {}), localOwnerId: async () => null });
    await useShare.getState().startShare("b1", "보드");
    expect(wallShareState("b1")).toBe("shared");

    useShare.getState().setLocal("b2");
    configureShare({ localOwnerId: async () => "u1" });
    await useShare.getState().startShare("b2", "보드");
    expect(useShare.getState().byBoard.b2?.status).toBe("shared");
  });
});

describe("startShare 로그인 — 끝내지 못하면 서버를 부르지 않는다 (T8)", () => {
  test("세션이 없으면 로그인 실패이고 서버 호출이 없다", async () => {
    signOut();
    const api = fakeShareApi();
    const uploadDoc = vi.fn(async () => {});
    configureShare({ api, uploadDoc });

    await expect(useShare.getState().startShare("b1", "보드")).rejects.toMatchObject({
      name: "ShareStartError",
      reason: "login",
    });

    expect(api.share).not.toHaveBeenCalled();
    expect(api.unshare).not.toHaveBeenCalled();
    expect(uploadDoc).not.toHaveBeenCalled();
    expect(wallShareState("b1")).toBe("local");
    expect(useShare.getState().failureByBoard.b1).toBe("login");
    expect(useShare.getState().busyByBoard.b1).toBe(false);
  });

  test("login 옵션으로 Google 로그인을 끝내면 그 세션으로 공유한다", async () => {
    signOut();
    const googleLogin = vi.fn(async () => session);
    configureAuth({
      now: () => NOW,
      googleIdToken: vi.fn(async () => "id-token"),
      api: { googleLogin } as unknown as AuthApi,
    });
    const api = fakeShareApi();
    configureShare({ api, uploadDoc: vi.fn(async () => {}) });

    await useShare.getState().startShare("b1", "보드", { login: true });

    expect(googleLogin).toHaveBeenCalledTimes(1);
    expect(api.share).toHaveBeenCalledWith("b1", "보드", session.accessToken);
    expect(wallShareState("b1")).toBe("shared");
  });

  test("login 옵션이어도 로그인을 못 끝내면 서버를 부르지 않는다", async () => {
    signOut();
    configureAuth({
      now: () => NOW,
      googleIdToken: vi.fn(async () => {
        throw new Error("Google 창을 닫았어요");
      }),
    });
    const api = fakeShareApi();
    configureShare({ api, uploadDoc: vi.fn(async () => {}) });

    await expect(
      useShare.getState().startShare("b1", "보드", { login: true }),
    ).rejects.toMatchObject({ reason: "login", message: "Google 창을 닫았어요" });

    expect(api.share).not.toHaveBeenCalled();
    expect(wallShareState("b1")).toBe("local");
  });

  test("로그인 중에는 아직 올리는 중이 아니다", async () => {
    signOut();
    let finishLogin!: () => void;
    const googleIdToken = vi.fn(
      () => new Promise<string>((res) => (finishLogin = () => res("id-token"))),
    );
    configureAuth({
      now: () => NOW,
      googleIdToken,
      api: { googleLogin: vi.fn(async () => session) } as unknown as AuthApi,
    });
    configureShare({ api: fakeShareApi(), uploadDoc: vi.fn(async () => {}) });

    const pending = useShare.getState().startShare("b1", "보드", { login: true });
    await vi.waitFor(() => expect(googleIdToken).toHaveBeenCalled());
    expect(useShare.getState().phaseByBoard.b1).toBe("login");

    expect(wallShareState("b1")).toBe("local");
    expect(useShare.getState().busyByBoard.b1).toBe(true);

    finishLogin();
    await pending;
    expect(wallShareState("b1")).toBe("shared");
  });
});

describe("공유 해제와 로그아웃 (T13, D5)", () => {
  test("공유 해제 뒤 이 기기에만이고 동기화 연결이 닫힌다", async () => {
    const api = fakeShareApi();
    configureShare({ api, uploadDoc: vi.fn(async () => {}) });
    await useShare.getState().startShare("b1", "보드");
    useCollab.setState({ boardId: "b1", status: "connected" });
    expect(wallShareState("b1")).toBe("shared");

    await useShare.getState().unshare("b1");

    expect(api.unshare).toHaveBeenCalledWith("b1", session.accessToken);
    expect(wallShareState("b1")).toBe("local");
    await vi.waitFor(() => expect(useCollab.getState().boardId).toBeNull());
    expectNoImpossibleCombination("b1", api);
  });

  test("다른 보드의 연결은 해제가 건드리지 않는다", async () => {
    configureShare({ api: fakeShareApi(), uploadDoc: vi.fn(async () => {}) });
    await useShare.getState().startShare("b1", "보드");
    useCollab.setState({ boardId: "other", status: "connected" });

    await useShare.getState().unshare("b1");
    await new Promise((r) => setTimeout(r, 0));

    expect(useCollab.getState().boardId).toBe("other");
  });

  test("로그아웃해도 공유 벽은 남고 로그아웃 상태로 읽힌다", async () => {
    configureShare({ api: fakeShareApi(), uploadDoc: vi.fn(async () => {}) });
    await useShare.getState().startShare("b1", "보드");
    expect(wallShareState("b1")).toBe("shared");

    signOut();

    expect(useShare.getState().byBoard.b1.status).toBe("shared");
    expect(wallShareState("b1")).toBe("sharedLoggedOut");

    useAuth.setState({ session, user: session.user, status: "authenticated" });
    expect(wallShareState("b1")).toBe("shared");
  });

  test("세션이 만료돼도 로그아웃 상태로 읽힌다", () => {
    useShare.getState().restoreShared("b1", "owner");
    useAuth.setState({ status: "expired" });

    expect(wallShareState("b1")).toBe("sharedLoggedOut");
  });
});
