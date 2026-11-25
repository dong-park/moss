import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import { ShareControlMount } from "../ShareControlMount";
import { useWorkspace } from "@/state/workspace";
import { SYSTEM_BOARD_ID } from "@/state/boardIds";
import { configureAuth, resetAuthStore, useAuth } from "@/state/auth/store";
import { deleteAuthDatabase } from "@/state/auth/tokenStore";
import type { AuthSession, BoardSummary } from "@/state/auth/types";
import { configureShare, resetShareStore, useShare, type ShareApi } from "@/state/share";

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

const sharedBoard: BoardSummary = { id: "b", name: "공유한 벽", role: "owner", ownerName: "동환" };

function fakeShareApi(overrides: Partial<ShareApi> = {}): ShareApi {
  return {
    share: vi.fn(async () => sharedBoard),
    boardToken: vi.fn(async () => ({ boardToken: "bt", expiresInSeconds: 3600 })),
    unshare: vi.fn(async () => undefined),
    reissueInvite: vi.fn(async () => "tok-1"),
    removeMember: vi.fn(async () => undefined),
    members: vi.fn(async () => []),
    myBoards: vi.fn(async () => []),
    usage: vi.fn(async (_accessToken: string) => ({ boards: 0, maxBoards: 10, fileBytes: 0, maxFileBytes: 1 })),
    ...overrides,
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

function signOut() {
  useAuth.setState({ session: null, user: null, status: "anonymous", hydrated: true, hydrating: false });
}

function useBoards(currentBoardId: string) {
  useWorkspace.setState({
    currentBoardId,
    boards: [
      { id: SYSTEM_BOARD_ID, name: "", isSystem: true },
      { id: "a", name: "혼자 쓰는 벽" },
      { id: "b", name: "공유한 벽" },
    ] as never,
  });
}

function mount() {
  return render(
    <I18nProvider locale="ko">
      <ShareControlMount />
    </I18nProvider>,
  );
}

function badgeText(): string {
  return screen.getByTestId("wall-badge").textContent ?? "";
}

beforeEach(async () => {
  await deleteAuthDatabase();
  resetAuthStore();
  resetShareStore();
  configureAuth({ now: () => NOW });
  configureShare({ api: fakeShareApi(), uploadDoc: vi.fn(async () => {}) });
});

afterEach(() => {
  resetAuthStore();
  resetShareStore();
});

describe("ShareControlMount", () => {
  it("T15 · 첫 벽(시스템 보드)에도 배지와 공유 ↗ 버튼이 있다", () => {
    useBoards(SYSTEM_BOARD_ID);
    mount();
    expect(screen.getByTestId("wall-badge-label").textContent).toBe("🔒 이 기기에만");
    expect(screen.getByRole("button", { name: "공유" }).textContent).toBe("공유 ↗");
  });

  it("혼자 쓰는 벽에는 배지와 공유 ↗ 버튼이 함께 있다", () => {
    useBoards("a");
    mount();
    expect(screen.getByTestId("wall-badge-label").textContent).toBe("🔒 이 기기에만");
    expect(screen.getByRole("button", { name: "공유" }).textContent).toBe("공유 ↗");
  });

  it("T3 · 혼자 쓰는 벽 A → 공유한 벽 B → 다시 A로 오면 배지가 따라 바뀐다", () => {
    signIn();
    useShare.setState({ byBoard: { b: { status: "shared", inviteToken: "tok", role: "owner" } } });
    useBoards("a");
    mount();
    expect(screen.getByTestId("wall-badge-label").textContent).toBe("🔒 이 기기에만");

    act(() => useBoards("b"));
    expect(screen.getByTestId("wall-badge-label").textContent).toBe("☁ 공유 중");
    expect(screen.getByTestId("wall-badge").dataset.state).toBe("shared");

    act(() => useBoards("a"));
    expect(screen.getByTestId("wall-badge-label").textContent).toBe("🔒 이 기기에만");
  });

  it("T12 · 로그아웃해도 혼자 쓰는 벽의 배지는 이 기기에만이다", () => {
    signIn();
    useBoards("a");
    mount();
    expect(screen.getByTestId("wall-badge-label").textContent).toBe("🔒 이 기기에만");

    act(() => signOut());
    expect(screen.getByTestId("wall-badge-label").textContent).toBe("🔒 이 기기에만");
  });

  it("공유 중인 벽에서 로그아웃하면 로그인하면 맞춰요 문구가 된다", () => {
    signIn();
    useShare.setState({ byBoard: { b: { status: "shared", inviteToken: "tok", role: "owner" } } });
    useBoards("b");
    mount();
    expect(screen.getByTestId("wall-badge-label").textContent).toBe("☁ 공유 중");

    act(() => signOut());
    expect(screen.getByTestId("wall-badge-label").textContent).toBe("☁ 공유 중 · 로그인하면 맞춰요");
    expect(screen.getByTestId("wall-badge").dataset.state).toBe("sharedLoggedOut");
  });

  it("공유 시작은 올리는 중을 거쳐 서버가 받은 뒤에야 공유 중이 된다 (실제 store)", async () => {
    let finishUpload: () => void = () => {};
    const uploadDoc = vi.fn(
      () => new Promise<void>((resolve) => (finishUpload = resolve)),
    );
    configureShare({ api: fakeShareApi(), uploadDoc, localOwnerId: async () => null });
    signIn();
    useBoards("a");
    mount();

    let started: Promise<void> = Promise.resolve();
    await act(async () => {
      started = useShare.getState().startShare("a", "혼자 쓰는 벽");
    });
    // 업로드가 끝나기 전에는 공유 중을 띄우지 않는다. 서버 행 확인 같은 앞 단계를 지나야 올리는 중이 된다.
    await waitFor(() => expect(badgeText()).toContain("올리는 중"));
    expect(badgeText()).not.toContain("공유 중");

    await act(async () => {
      finishUpload();
      await started;
    });
    expect(screen.getByTestId("wall-badge-label").textContent).toBe("☁ 공유 중");
  });

  it("T13 · 공유를 해제하면 배지가 이 기기에만으로 돌아온다", async () => {
    signIn();
    useShare.setState({ byBoard: { b: { status: "shared", inviteToken: "tok", role: "owner" } } });
    useBoards("b");
    mount();
    expect(screen.getByTestId("wall-badge-label").textContent).toBe("☁ 공유 중");

    await act(async () => {
      await useShare.getState().unshare("b");
    });
    expect(screen.getByTestId("wall-badge-label").textContent).toBe("🔒 이 기기에만");
  });

  it("공유 ↗ 버튼은 공유 중인 벽에서 링크 복사·멤버 팝오버를 연다", async () => {
    signIn();
    useShare.setState({ byBoard: { b: { status: "shared", inviteToken: "tok", role: "owner" } } });
    useBoards("b");
    mount();
    fireEvent.click(screen.getByRole("button", { name: "공유" }));
    expect(await screen.findByRole("dialog", { name: "함께 쓰기" })).toBeTruthy();
    expect(screen.getByText("링크 복사")).toBeTruthy();
  });
});
