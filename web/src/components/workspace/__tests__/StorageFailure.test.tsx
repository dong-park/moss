import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import { StorageBootstrap } from "@/components/notifications/StorageBootstrap";
import { resetAuthStore } from "@/state/auth/store";
import {
  SYSTEM_BOARD_ID,
  __resetBoardNavigatorForTest,
  useWorkspace,
} from "@/state/workspace";
import { useStorage } from "@/state/storage";
import { getDB, resetDB } from "@/state/db/schema";

/**
 * first-wall n5 (T9) — 저장소를 못 열면 빈 흰 화면 대신 안내 한 줄과 [다시 시도].
 * 실패는 `db.open()`에서 일으킨다 — 실제 부팅 경로(StorageBootstrap → init → runBootstrap)를
 * 그대로 타고, 안내는 실제 WorkspaceShell이 그린다.
 */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
}));

const MESSAGE = "이 브라우저에 벽을 저장할 수 없어요";
const originalLoad = useWorkspace.getState().loadFromStorage;

function mountApp() {
  return render(
    <I18nProvider locale="ko">
      <StorageBootstrap />
      <WorkspaceShell />
    </I18nProvider>,
  );
}

beforeEach(async () => {
  window.history.replaceState(null, "", "/");
  resetAuthStore();
  __resetBoardNavigatorForTest();
  await resetDB();
  useStorage.setState({ initialized: false, settings: null, quota: null });
  useWorkspace.setState({
    cards: [],
    boards: [],
    currentBoardId: SYSTEM_BOARD_ID,
    lastNonSystemBoardId: null,
    viewportByBoard: {},
    boardTransitioning: false,
    migrationPending: false,
    bootstrapComplete: false,
    bootstrapFailed: false,
  });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(async () => {
  useWorkspace.setState({ loadFromStorage: originalLoad });
  vi.restoreAllMocks();
  resetAuthStore();
  __resetBoardNavigatorForTest();
  await resetDB();
});

describe("저장소를 못 열 때 (T9)", () => {
  it("첫 init이 실패하면 안내와 다시 시도가 뜨고, 눌러서 성공하면 첫 벽으로 간다", async () => {
    vi.spyOn(getDB(), "open").mockRejectedValueOnce(new Error("blocked"));

    mountApp();

    expect(await screen.findByText(MESSAGE)).toBeTruthy();
    const retry = screen.getByRole("button", { name: "다시 시도" });
    expect(window.location.pathname).toBe("/");
    expect(useWorkspace.getState().bootstrapComplete).toBe(false);

    fireEvent.click(retry);

    await waitFor(() =>
      expect(window.location.pathname).toBe(`/b/${SYSTEM_BOARD_ID}`),
    );
    expect(screen.queryByText(MESSAGE)).toBeNull();
    expect(screen.queryByRole("button", { name: "다시 시도" })).toBeNull();
    expect(useWorkspace.getState().bootstrapFailed).toBe(false);
    expect(useWorkspace.getState().bootstrapComplete).toBe(true);
  });

  it("계속 실패하면 눌러도 안내가 남고 버튼은 다시 눌린다 — 로딩 표시는 돌지 않는다", async () => {
    const open = vi.spyOn(getDB(), "open").mockRejectedValue(new Error("blocked"));

    mountApp();
    await screen.findByText(MESSAGE);
    expect(open).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(open).toHaveBeenCalledTimes(2));

    // 두 번째 실패가 끝나면 버튼이 다시 눌릴 수 있고 안내가 그대로다.
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "다시 시도" }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    expect(screen.getByText(MESSAGE)).toBeTruthy();
    expect(screen.queryByText("이전하는 중이에요…")).toBeNull();
    expect(useWorkspace.getState().migrationPending).toBe(false);
    expect(window.location.pathname).toBe("/");
  });

  it("불러오기가 로딩 표시를 켠 뒤 실패해도 로딩이 남지 않고 안내로 바뀐다", async () => {
    useWorkspace.setState({
      loadFromStorage: async () => {
        useWorkspace.setState({ migrationPending: true });
        throw new Error("load failed");
      },
    });

    mountApp();

    expect(await screen.findByText(MESSAGE)).toBeTruthy();
    expect(useWorkspace.getState().migrationPending).toBe(false);
    expect(screen.queryByText("이전하는 중이에요…")).toBeNull();
  });
});
