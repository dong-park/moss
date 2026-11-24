import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import { ShareControl } from "@/components/share/ShareControl";
import { configureAuth, resetAuthStore, useAuth } from "@/state/auth/store";
import { deleteAuthDatabase } from "@/state/auth/tokenStore";
import type { AuthSession } from "@/state/auth/types";
import { ShareStartError, resetShareStore, useShare } from "@/state/share";
import { AccountOwnerGuard } from "@/components/auth/AccountOwnerGuard";
import { DEFAULT_SETTINGS, getDB, resetDB, type Note } from "@/state/db/schema";
import { useStorage } from "@/state/storage";
import { useWorkspace } from "@/state/workspace";

/**
 * local-promise n5 — 첫 벽 시트. 옮기기 자체는 `state/share/__tests__/firstWall.test.ts`가 본다.
 * 여기서는 시트가 첫 벽일 때만 한 줄을 더 알리고, 주 버튼이 옮기기 경로를 타며, 새 벽 id를 넘기는지만 본다.
 */
const realUpdateSettings = useStorage.getState().updateSettings;
const shareFirstWall = vi.fn<() => Promise<string>>();
vi.mock("@/state/share/firstWall", () => ({
  shareFirstWall: () => shareFirstWall(),
}));

const NOW = 1_700_000_000_000;
const SHEET = "이 벽을 공유할까요?";
const LINE = "이 벽을 새 벽으로 옮겨 공유해요";

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

function mount(props: Partial<Parameters<typeof ShareControl>[0]> = {}) {
  return render(
    <I18nProvider locale="ko">
      <ShareControl boardId="system" boardName="" role="owner" firstWall {...props} />
    </I18nProvider>,
  );
}

async function openSheet() {
  fireEvent.click(screen.getByRole("button", { name: "공유" }));
  return screen.findByRole("dialog", { name: SHEET });
}

beforeEach(async () => {
  await deleteAuthDatabase();
  resetAuthStore();
  resetShareStore();
  configureAuth({ now: () => NOW });
  useAuth.setState({
    session,
    user: session.user,
    status: "authenticated",
    hydrated: true,
    hydrating: false,
  });
  shareFirstWall.mockReset();
});

afterEach(() => {
  resetAuthStore();
  resetShareStore();
});

describe("T15 · 첫 벽 시트", () => {
  test("첫 벽이면 시트에 새 벽으로 옮겨 공유한다는 한 줄이 더 보인다", async () => {
    mount();
    const sheet = await openSheet();
    expect(sheet.textContent).toContain("이 벽은 moss 서버에 올라갑니다.");
    expect(sheet.textContent).toContain(LINE);
  });

  test("첫 벽이 아니면 그 줄이 없다", async () => {
    mount({ boardId: "a", firstWall: false });
    const sheet = await openSheet();
    expect(sheet.textContent).not.toContain(LINE);
  });

  test("공유를 누르면 옮기기 경로를 타고, 새 벽 id를 넘겨 팝오버를 연다", async () => {
    shareFirstWall.mockImplementation(async () => {
      useShare.setState({ byBoard: { "new-wall": { status: "shared", inviteToken: "tok", role: "owner" } } });
      return "new-wall";
    });
    const onStartShare = vi.fn();
    mount({ onStartShare });
    await openSheet();

    fireEvent.click(screen.getByRole("button", { name: "공유" }));

    await waitFor(() => expect(onStartShare).toHaveBeenCalledWith("new-wall"));
    expect(shareFirstWall).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog", { name: SHEET })).toBeNull();
  });

  test("옮겨 공유하지 못하면 이유를 말하고 시트가 남는다", async () => {
    shareFirstWall.mockRejectedValue(new ShareStartError("share", new Error("끊김")));
    const onStartShare = vi.fn();
    mount({ onStartShare });
    await openSheet();

    fireEvent.click(screen.getByRole("button", { name: "공유" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("공유하지 못했어요");
    expect(onStartShare).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: SHEET })).toBeTruthy();
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeTruthy();
  });
});

describe("F3 · 주인 기록이 없는 기기의 첫 벽", () => {
  const ANONYMOUS = "이 기기의 기존 메모가 모두 올라가요";

  afterEach(() => {
    useStorage.setState({ initialized: false, settings: null, updateSettings: realUpdateSettings });
  });

  test("주인 기록이 없으면 기존 메모가 모두 올라간다고 알리고 한 번 더 확인받는다", async () => {
    useStorage.setState({ initialized: true, settings: { ...DEFAULT_SETTINGS, ownerUserId: null } });
    shareFirstWall.mockResolvedValue("new-wall");
    mount();
    const sheet = await openSheet();
    expect(sheet.textContent).toContain(ANONYMOUS);

    fireEvent.click(screen.getByRole("button", { name: "확인했어요" }));
    expect(shareFirstWall).not.toHaveBeenCalled();

    useShare.setState({ byBoard: { "new-wall": { status: "shared", inviteToken: "t", role: "owner" } } });
    fireEvent.click(screen.getByRole("button", { name: "공유" }));
    await waitFor(() => expect(shareFirstWall).toHaveBeenCalledTimes(1));
  });

  test("주인 기록이 있으면 그 줄도 없고 바로 공유한다", async () => {
    useStorage.setState({ initialized: true, settings: { ...DEFAULT_SETTINGS, ownerUserId: "u1" } });
    shareFirstWall.mockResolvedValue("new-wall");
    mount();
    const sheet = await openSheet();
    expect(sheet.textContent).not.toContain(ANONYMOUS);

    fireEvent.click(screen.getByRole("button", { name: "공유" }));
    await waitFor(() => expect(shareFirstWall).toHaveBeenCalledTimes(1));
  });

  describe("기록 시점의 익명 메모 표시는 공유가 끝난 뒤에만 지운다 (G6·H2)", () => {
    function markedStorage() {
      const updateSettings = vi.fn(async () => {});
      useStorage.setState({
        initialized: true,
        settings: { ...DEFAULT_SETTINGS, ownerUserId: "u1", anonymousDataAtClaim: true },
        updateSettings,
      });
      return updateSettings;
    }

    test("주인 기록이 있어도 표시가 있으면 확인을 받고, 확인 클릭만으로는 표시를 지우지 않는다", async () => {
      const updateSettings = markedStorage();
      shareFirstWall.mockResolvedValue("new-wall");
      mount();
      const sheet = await openSheet();
      expect(sheet.textContent).toContain(ANONYMOUS);

      fireEvent.click(screen.getByRole("button", { name: "확인했어요" }));

      expect(shareFirstWall).not.toHaveBeenCalled();
      expect(updateSettings).not.toHaveBeenCalled();
      // 안내 줄은 남고 주 버튼은 공유가 된다.
      expect(sheet.textContent).toContain(ANONYMOUS);
      expect(screen.getByRole("button", { name: "공유" })).toBeTruthy();
    });

    test("확인만 하고 시트를 닫으면 표시가 남아 다음 시트가 다시 확인을 받는다", async () => {
      const updateSettings = markedStorage();
      mount();
      await openSheet();
      fireEvent.click(screen.getByRole("button", { name: "확인했어요" }));
      fireEvent.click(screen.getByRole("button", { name: "취소" }));
      await waitFor(() => expect(screen.queryByRole("dialog", { name: SHEET })).toBeNull());

      const reopened = await openSheet();

      expect(updateSettings).not.toHaveBeenCalled();
      expect(reopened.textContent).toContain(ANONYMOUS);
      expect(screen.getByRole("button", { name: "확인했어요" })).toBeTruthy();
    });

    test("공유가 실패하면 표시가 남는다", async () => {
      const updateSettings = markedStorage();
      shareFirstWall.mockRejectedValue(new ShareStartError("share", new Error("끊김")));
      mount();
      await openSheet();
      fireEvent.click(screen.getByRole("button", { name: "확인했어요" }));
      fireEvent.click(screen.getByRole("button", { name: "공유" }));
      await screen.findByRole("alert");

      expect(updateSettings).not.toHaveBeenCalled();
    });

    test("공유가 끝나면 그때 표시를 지운다", async () => {
      const updateSettings = markedStorage();
      let clearedDuringUpload = true;
      shareFirstWall.mockImplementation(async () => {
        // 표시는 업로드가 끝나기 전에는 그대로여야 한다.
        clearedDuringUpload = updateSettings.mock.calls.length > 0;
        useShare.setState({
          byBoard: { "new-wall": { status: "shared", inviteToken: "t", role: "owner" } },
        });
        return "new-wall";
      });
      mount();
      await openSheet();
      fireEvent.click(screen.getByRole("button", { name: "확인했어요" }));
      fireEvent.click(screen.getByRole("button", { name: "공유" }));

      await waitFor(() =>
        expect(updateSettings).toHaveBeenCalledWith({ anonymousDataAtClaim: false }),
      );
      expect(updateSettings).toHaveBeenCalledTimes(1);
      expect(clearedDuringUpload).toBe(false);
    });
  });

  test("세션이 복원돼 바로 기록된 기기도 익명 메모가 있었다면 첫 벽 공유가 확인을 받는다 (G6)", async () => {
    // 로그인 전에 쓴 메모가 있는 기기. 이미 로그인된 세션이 복원되면 가드가 곧바로 주인을 기록한다.
    await resetDB();
    useStorage.setState({ initialized: false, settings: null });
    await useStorage.getState().init();
    const note: Note = {
      id: "anon-1",
      boardId: "system",
      kind: "text",
      x: 0,
      y: 0,
      width: 240,
      rotation: 0,
      content: "로그인 전에 쓴 메모",
      aiOptOut: false,
      createdAt: 1,
      updatedAt: 1,
      lastVisitedAt: 1,
    };
    await getDB().notes.put(note);
    render(
      <I18nProvider locale="ko">
        <AccountOwnerGuard />
      </I18nProvider>,
    );
    await waitFor(() =>
      expect(useStorage.getState().settings?.ownerUserId).toBe("u1"),
    );

    shareFirstWall.mockResolvedValue("new-wall");
    mount();
    const sheet = await openSheet();

    expect(sheet.textContent).toContain(ANONYMOUS);
    await resetDB();
  });

  test("다른 계정의 것이라 멈추면 이유를 말한다", async () => {
    shareFirstWall.mockRejectedValue(new ShareStartError("account", new Error("다른 계정")));
    mount();
    await openSheet();

    fireEvent.click(screen.getByRole("button", { name: "공유" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("다른 Google 계정");
  });
});

describe("G4 · 다른 계정의 기기라 멈추면 다시 시도 대신 로그아웃을 준다", () => {
  test("주 버튼이 로그아웃이고, 로그아웃하면 실패 문구가 사라지고 다시 로그인해 공유할 수 있다", async () => {
    shareFirstWall.mockRejectedValue(new ShareStartError("account", new Error("다른 계정")));
    const logout = vi.fn(async () => {
      useAuth.setState({ status: "anonymous", user: null, session: null });
    });
    useAuth.setState({ logout });
    mount();
    await openSheet();
    fireEvent.click(screen.getByRole("button", { name: "공유" }));

    expect((await screen.findByRole("alert")).textContent).toContain("다른 Google 계정");
    // 같은 계정으로 다시 시도해 봐야 같은 이유로 멈춘다 — 다시 시도 버튼이 없다.
    expect(screen.queryByRole("button", { name: "다시 시도" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "로그아웃" }));

    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(screen.getByRole("button", { name: "Google로 로그인하고 공유" })).toBeTruthy();
    expect(shareFirstWall).toHaveBeenCalledTimes(1);
  });
});

describe("F4 · 정리하지 못한 것을 따로 말한다", () => {
  const realNavigate = useWorkspace.getState().navigateToBoard;
  afterEach(() => {
    useWorkspace.setState({ navigateToBoard: realNavigate });
  });

  test("내용을 되돌리지 못하면 내용이 새 벽에 있다고 알리고 그 벽으로 가는 길을 준다", async () => {
    shareFirstWall.mockRejectedValue(
      new ShareStartError("share", new Error("끊김"), {
        contentNotRestored: true,
        contentBoardId: "new-wall",
      }),
    );
    const navigateToBoard = vi.fn(async () => {});
    useWorkspace.setState({ navigateToBoard });
    mount();
    await openSheet();

    fireEvent.click(screen.getByRole("button", { name: "공유" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("새로 만든 벽에 있어요");
    // 다시 시도 대신 그 벽으로 가는 버튼이 주 버튼이다.
    expect(screen.queryByRole("button", { name: "다시 시도" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "그 벽으로 가기" }));

    expect(navigateToBoard).toHaveBeenCalledWith("new-wall");
    expect(screen.queryByRole("dialog", { name: SHEET })).toBeNull();
  });

  test("서버 행을 지우지 못했으면 다음 시도가 먼저 정리한다고 알린다", async () => {
    shareFirstWall.mockRejectedValue(
      new ShareStartError("share", new Error("끊김"), { serverRowLeft: true }),
    );
    mount();
    await openSheet();

    fireEvent.click(screen.getByRole("button", { name: "공유" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("서버에 남은 기록");
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeTruthy();
  });

  test("이미 공유 중이던 벽의 내용을 올리지 못하면 공유는 유지되지만 내용은 확인되지 않았다고 말한다 (G4)", async () => {
    shareFirstWall.mockRejectedValue(
      new ShareStartError("share", new Error("끊김"), { contentUnconfirmed: true }),
    );
    mount();
    await openSheet();

    fireEvent.click(screen.getByRole("button", { name: "공유" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("이미 공유 중이에요");
    expect(alert.textContent).toContain("서버가 받았는지 확인하지 못했어요");
    expect(alert.textContent).toContain("공유는 그대로 유지돼요");
    expect(alert.textContent).not.toContain("공유하지 못했어요");
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeTruthy();
  });

  test("이미 공유 중이던 벽이라도 서버가 거절했으면 거절 문구가 먼저다 (H5)", async () => {
    const closed = new Error("거절");
    closed.name = "UploadNotConfirmedError";
    (closed as Error & { reason: string }).reason = "rejected";
    shareFirstWall.mockRejectedValue(
      new ShareStartError("share", closed, { contentUnconfirmed: true }),
    );
    mount();
    await openSheet();

    fireEvent.click(screen.getByRole("button", { name: "공유" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("받지 않았어요");
    expect(alert.textContent).not.toContain("확인하지 못했어요");
  });

  test("응답이 늦은 것은 이미 공유 중이던 벽이면 확인하지 못했다고 말한다 (H5)", async () => {
    const late = new Error("늦음");
    late.name = "UploadNotConfirmedError";
    (late as Error & { reason: string }).reason = "timeout";
    shareFirstWall.mockRejectedValue(
      new ShareStartError("share", late, { contentUnconfirmed: true }),
    );
    mount();
    await openSheet();

    fireEvent.click(screen.getByRole("button", { name: "공유" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("서버가 받았는지 확인하지 못했어요");
  });

  test("시간 초과와 서버 거절은 다른 문구로 말한다 (F5)", async () => {
    const timeout = new Error("늦음");
    timeout.name = "UploadNotConfirmedError";
    (timeout as Error & { reason: string }).reason = "timeout";
    shareFirstWall.mockRejectedValueOnce(new ShareStartError("share", timeout));
    mount();
    await openSheet();
    fireEvent.click(screen.getByRole("button", { name: "공유" }));
    expect((await screen.findByRole("alert")).textContent).toContain("응답이 늦어");

    const closed = new Error("끊김");
    closed.name = "UploadNotConfirmedError";
    (closed as Error & { reason: string }).reason = "closed";
    shareFirstWall.mockRejectedValueOnce(new ShareStartError("share", closed));
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("받지 않았어요"));
  });
});
