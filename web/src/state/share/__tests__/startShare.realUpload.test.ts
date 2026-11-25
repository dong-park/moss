/**
 * local-promise n2 실경로 — startShare가 주입 stub 없이 기본 업로드(`uploadBoardDocConfirmed`)를
 * 거친다. 가짜인 것은 네트워크 경계(provider 팩토리·서버 API)뿐이다.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { configureAuth, resetAuthDeps, useAuth } from "@/state/auth/store";
import { clearSession } from "@/state/auth/tokenStore";
import type { AuthSession, BoardSummary } from "@/state/auth/types";
import {
  configureCollab,
  resetCollabStore,
  CONFIRMED_UPLOAD_IDLE_TIMEOUT_MS,
  type CollabProviderConfig,
  type CollabProviderFactory,
} from "@/state/collab";
import { activateBoardDoc, destroyBoardDocs } from "@/state/ydoc/activeDoc";
import type { ShareApi } from "../api";
import { configureShare, resetShareStore, useShare } from "../store";
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

function fakeShareApi(): ShareApi {
  return {
    share: vi.fn(async (): Promise<BoardSummary> => ({ id: "wall", name: "벽", role: "owner", ownerName: "동환" })),
    boardToken: vi.fn(async () => ({ boardToken: "bt", expiresInSeconds: 3600 })),
    unshare: vi.fn(async () => undefined),
    reissueInvite: vi.fn(async () => "tok-1"),
    removeMember: vi.fn(async () => undefined),
    members: vi.fn(async () => []),
    myBoards: vi.fn(async () => []),
    usage: vi.fn(async (_accessToken: string) => ({ boards: 0, maxBoards: 10, fileBytes: 0, maxFileBytes: 1 })),
  };
}

function makeFactory() {
  const created: Array<{ config: CollabProviderConfig; destroy: ReturnType<typeof vi.fn> }> = [];
  const factory: CollabProviderFactory = {
    create(config) {
      const destroy = vi.fn();
      created.push({ config, destroy });
      return { awareness: null, connect: vi.fn(), disconnect: vi.fn(), destroy };
    },
  };
  return { factory, created };
}

async function until(check: () => boolean) {
  for (let i = 0; i < 50 && !check(); i++) await Promise.resolve();
  expect(check()).toBe(true);
}

beforeEach(async () => {
  await clearSession();
  resetShareStore();
  resetAuthDeps();
  resetCollabStore();
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
  vi.useRealTimers();
  await clearSession();
  resetShareStore();
  resetAuthDeps();
  resetCollabStore();
  useAuth.setState({ session: null, user: null, status: "anonymous", hydrated: false, hydrating: false });
  await destroyBoardDocs();
});

describe("startShare 실경로 — 지금 보고 있는 벽을 일회 연결로 올리고 확인한다", () => {
  test("활성 벽도 건너뛰지 않고, 서버 ack 전에는 shared가 아니다", async () => {
    const { factory, created } = makeFactory();
    const fetchBoardToken = vi.fn(async () => ({ boardToken: "bt", expiresInSeconds: 3600 }));
    configureCollab({ providerFactory: factory, fetchBoardToken, syncUrl: () => "ws://sync.test", now: () => NOW });
    const api = fakeShareApi();
    configureShare({ api, onBoardShared: vi.fn() });
    await activateBoardDoc("wall"); // 사용자가 지금 보고 있는 벽

    const pending = useShare.getState().startShare("wall", "벽");
    await vi.waitFor(() => expect(created).toHaveLength(1));

    // 업로드용 연결이 붙었고 서버 행 뒤에 보드 토큰을 받았다.
    expect(created[0].config.name).toBe("wall");
    expect(fetchBoardToken).toHaveBeenCalledWith("wall", session.accessToken);
    expect(wallShareState("wall")).toBe("uploading");

    // step2(onSynced)만으로는 서버가 내 내용을 받았다고 볼 수 없다.
    created[0].config.onSynced?.();
    await Promise.resolve();
    expect(wallShareState("wall")).toBe("uploading");
    expect(api.reissueInvite).not.toHaveBeenCalled();

    created[0].config.onAcknowledged?.();
    await pending;

    expect(wallShareState("wall")).toBe("shared");
    expect(created[0].destroy).toHaveBeenCalledTimes(1);
    expect(api.reissueInvite).toHaveBeenCalledTimes(1);
  });

  test("서버가 연결을 끊으면(거절) 서버 행을 지우고 이 기기에만으로 돌아온다", async () => {
    const { factory, created } = makeFactory();
    configureCollab({
      providerFactory: factory,
      fetchBoardToken: vi.fn(async () => ({ boardToken: "bt", expiresInSeconds: 3600 })),
      syncUrl: () => "ws://sync.test",
      now: () => NOW,
    });
    const api = fakeShareApi();
    configureShare({ api, onBoardShared: vi.fn() });
    await activateBoardDoc("wall");

    const pending = useShare.getState().startShare("wall", "벽");
    const outcome = expect(pending).rejects.toMatchObject({ reason: "share" });
    await vi.waitFor(() => expect(created).toHaveLength(1));
    created[0].config.onClose(4403);
    await outcome;

    expect(api.unshare).toHaveBeenCalledWith("wall", session.accessToken);
    expect(wallShareState("wall")).toBe("local");
    expect(created[0].destroy).toHaveBeenCalledTimes(1);
  });

  test("업로드 시간이 넘으면 서버 행을 지우고 이 기기에만으로 돌아온다", async () => {
    const { factory, created } = makeFactory();
    configureCollab({
      providerFactory: factory,
      fetchBoardToken: vi.fn(async () => ({ boardToken: "bt", expiresInSeconds: 3600 })),
      syncUrl: () => "ws://sync.test",
      now: () => NOW,
    });
    const api = fakeShareApi();
    configureShare({ api, onBoardShared: vi.fn() });
    await activateBoardDoc("wall");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    const pending = useShare.getState().startShare("wall", "벽");
    const outcome = expect(pending).rejects.toMatchObject({ reason: "share" });
    await until(() => created.length === 1);
    await vi.advanceTimersByTimeAsync(CONFIRMED_UPLOAD_IDLE_TIMEOUT_MS);
    await outcome;

    expect(api.unshare).toHaveBeenCalledTimes(1);
    expect(api.reissueInvite).not.toHaveBeenCalled();
    expect(wallShareState("wall")).toBe("local");
    expect(useShare.getState().failureByBoard.wall).toBe("share");
  });
});
