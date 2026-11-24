import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import { ShareControl } from "@/components/share/ShareControl";
import { countSubBoards } from "@/components/share/ShareSheet";
import { configureAuth, resetAuthStore, useAuth } from "@/state/auth/store";
import { deleteAuthDatabase, saveSession } from "@/state/auth/tokenStore";
import type { AuthApi } from "@/state/auth/api";
import type { AuthSession, BoardSummary } from "@/state/auth/types";
import type { Board } from "@/state/db/schema";
import { configureShare, resetShareStore, useShare, type ShareApi } from "@/state/share";
import { useWorkspace } from "@/state/workspace";

/**
 * local-promise n4 — 공유 시트. 실제 `useShare.startShare`·`useAuth` 스토어를 거치고,
 * 네트워크 끝(서버 API·Google 토큰·업로드 확인)만 대신한다.
 */
const NOW = 1_700_000_000_000;
const SHEET = "이 벽을 공유할까요?";
const GOOGLE_SHARE = "Google로 로그인하고 공유";

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

const board: BoardSummary = { id: "b1", name: "이직 고민", role: "owner", ownerName: "동환" };

function fakeAuthApi(): AuthApi {
  return {
    googleLogin: vi.fn(async () => session),
    signup: vi.fn(async () => session),
    login: vi.fn(async () => session),
    refresh: vi.fn(async () => session),
    previewInvite: vi.fn(async () => ({ boardName: "이직 고민", ownerName: "동환" })),
    acceptInvite: vi.fn(async () => board),
  };
}

function fakeShareApi(overrides: Partial<ShareApi> = {}): ShareApi {
  return {
    share: vi.fn(async () => board),
    boardToken: vi.fn(async () => ({ boardToken: "bt-1", expiresInSeconds: 3600 })),
    unshare: vi.fn(async () => undefined),
    reissueInvite: vi.fn(async () => "tok-1"),
    removeMember: vi.fn(async () => undefined),
    members: vi.fn(async () => []),
    myBoards: vi.fn(async () => []),
    ...overrides,
  };
}

function mount(props: Partial<Parameters<typeof ShareControl>[0]> = {}) {
  return render(
    <I18nProvider locale="ko">
      <ShareControl boardId="b1" boardName="이직 고민" role="owner" {...props} />
    </I18nProvider>,
  );
}

async function openSheet() {
  fireEvent.click(screen.getByRole("button", { name: "공유" }));
  return screen.findByRole("dialog", { name: SHEET });
}

async function loginState() {
  await saveSession(session);
  useAuth.setState({
    session,
    user: session.user,
    status: "authenticated",
    hydrated: true,
    hydrating: false,
  });
}

function badgeLabel(): string {
  return screen.getByTestId("wall-badge-label").textContent ?? "";
}

function wallBoard(id: string, parentBoardId: string | null, extra: Partial<Board> = {}): Board {
  return {
    id,
    name: id,
    isSystem: false,
    parentBoardId,
    createdAt: 0,
    updatedAt: 0,
    lastOpenedAt: 0,
    ...extra,
  };
}

const initialBoards = useWorkspace.getState().boards;

beforeEach(async () => {
  await deleteAuthDatabase();
  resetAuthStore();
  resetShareStore();
  configureAuth({ now: () => NOW });
});

afterEach(() => {
  resetAuthStore();
  resetShareStore();
  useWorkspace.setState({ boards: initialBoards });
  Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
});

describe("T4 · 혼자 쓰는 벽에서 공유 ↗ 를 누르면 시트가 뜬다", () => {
  test("제목·본문·두 버튼이 보이고 서버는 아직 아무것도 받지 않는다", async () => {
    const shareApi = fakeShareApi();
    const googleIdToken = vi.fn(async () => "id-token");
    configureShare({ api: shareApi, uploadDoc: vi.fn(async () => {}) });
    configureAuth({ api: fakeAuthApi(), googleIdToken });
    mount();

    const sheet = await openSheet();
    expect(sheet.textContent).toContain("이 벽을 공유할까요?");
    expect(sheet.textContent).toContain("이 벽은 moss 서버에 올라갑니다.");
    expect(sheet.textContent).toContain("다른 벽은 그대로 이 기기에만 있어요.");
    expect(screen.getByRole("button", { name: GOOGLE_SHARE })).toBeTruthy();
    expect(screen.getByRole("button", { name: "취소" })).toBeTruthy();
    // 열기만으로는 로그인 창도 서버 요청도 없다. 배지도 그대로다.
    expect(googleIdToken).not.toHaveBeenCalled();
    expect(shareApi.share).not.toHaveBeenCalled();
    expect(badgeLabel()).toBe("🔒 이 기기에만");
  });

  test("로그인한 사람에게도 같은 시트가 뜨고 버튼만 공유로 바뀐다", async () => {
    configureShare({ api: fakeShareApi(), uploadDoc: vi.fn(async () => {}) });
    configureAuth({ api: fakeAuthApi(), googleIdToken: vi.fn(async () => "id-token") });
    await loginState();
    mount();

    const sheet = await openSheet();
    expect(sheet.textContent).toContain("이 벽은 moss 서버에 올라갑니다.");
    expect(screen.queryByRole("button", { name: GOOGLE_SHARE })).toBeNull();
    expect(screen.getByRole("button", { name: "공유" })).toBeTruthy();
  });
});

describe("T5 · 취소하면 아무것도 올라가지 않는다", () => {
  test("취소 버튼: 시트가 닫히고 Google 로그인·공유 API·업로드가 불리지 않는다", async () => {
    const shareApi = fakeShareApi();
    const googleIdToken = vi.fn(async () => "id-token");
    const uploadDoc = vi.fn(async () => {});
    configureShare({ api: shareApi, uploadDoc });
    configureAuth({ api: fakeAuthApi(), googleIdToken });
    mount();

    await openSheet();
    fireEvent.click(screen.getByRole("button", { name: "취소" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(googleIdToken).not.toHaveBeenCalled();
    expect(shareApi.share).not.toHaveBeenCalled();
    expect(uploadDoc).not.toHaveBeenCalled();
    expect(badgeLabel()).toBe("🔒 이 기기에만");
  });

  test("Esc로 닫아도 같다", async () => {
    const shareApi = fakeShareApi();
    const googleIdToken = vi.fn(async () => "id-token");
    configureShare({ api: shareApi, uploadDoc: vi.fn(async () => {}) });
    configureAuth({ api: fakeAuthApi(), googleIdToken });
    mount();

    const sheet = await openSheet();
    fireEvent.keyDown(sheet, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(googleIdToken).not.toHaveBeenCalled();
    expect(shareApi.share).not.toHaveBeenCalled();
    expect(badgeLabel()).toBe("🔒 이 기기에만");
  });
});

describe("T6 · 서버가 받은 뒤 시트가 닫히고 링크 복사 팝오버가 열린다", () => {
  test("주 버튼 → 실제 startShare → 배지 공유 중 → 팝오버", async () => {
    const shareApi = fakeShareApi();
    const uploadDoc = vi.fn(async () => {});
    const onStartShare = vi.fn();
    configureShare({ api: shareApi, uploadDoc });
    configureAuth({ api: fakeAuthApi(), googleIdToken: vi.fn(async () => "id-token") });
    mount({ onStartShare });

    await openSheet();
    fireEvent.click(screen.getByRole("button", { name: GOOGLE_SHARE }));

    expect(await screen.findByRole("dialog", { name: "함께 쓰기" })).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: SHEET })).toBeNull();
    expect(shareApi.share).toHaveBeenCalledWith("b1", "이직 고민", session.accessToken);
    expect(uploadDoc).toHaveBeenCalledWith("b1", session.accessToken);
    expect(onStartShare).toHaveBeenCalledWith("b1");
    expect(useShare.getState().byBoard.b1?.status).toBe("shared");
    expect(badgeLabel()).toBe("☁ 공유 중");
    expect(await screen.findByText("링크 복사")).toBeTruthy();
  });

  test("올리는 중에는 두 버튼이 막히고 Esc로도 닫히지 않으며 서버 행은 하나만 생긴다", async () => {
    let finishUpload: () => void = () => {};
    const uploadDoc = vi.fn(() => new Promise<void>((resolve) => (finishUpload = resolve)));
    const shareApi = fakeShareApi();
    configureShare({ api: shareApi, uploadDoc });
    configureAuth({ api: fakeAuthApi(), googleIdToken: vi.fn(async () => "id-token") });
    await loginState();
    mount();

    const sheet = await openSheet();
    const primary = screen.getByRole("button", { name: "공유" });
    fireEvent.click(primary);
    fireEvent.click(primary);

    expect(await screen.findByText("올리는 중…")).toBeTruthy();
    expect((screen.getByRole("button", { name: "공유" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "취소" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(sheet, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: SHEET })).toBeTruthy();
    // 서버가 받기 전에는 공유 중이 아니다.
    expect(badgeLabel()).toBe("올리는 중");

    await act(async () => {
      finishUpload();
    });
    expect(await screen.findByRole("dialog", { name: "함께 쓰기" })).toBeTruthy();
    expect(shareApi.share).toHaveBeenCalledTimes(1);
    expect(badgeLabel()).toBe("☁ 공유 중");
  });
});

describe("T8 · 로그인하지 못하면 이유를 말하고 벽은 이 기기에 남는다", () => {
  test("Google 창을 닫으면 로그인 실패 문구, 서버 요청 0건, 다시 누를 수 있다", async () => {
    const shareApi = fakeShareApi();
    const googleIdToken = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("popup_closed"))
      .mockResolvedValue("id-token");
    configureShare({ api: shareApi, uploadDoc: vi.fn(async () => {}) });
    configureAuth({ api: fakeAuthApi(), googleIdToken });
    mount();

    await openSheet();
    fireEvent.click(screen.getByRole("button", { name: GOOGLE_SHARE }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("로그인하지 못했어요. 벽은 이 기기에 그대로 있어요.");
    expect(shareApi.share).not.toHaveBeenCalled();
    expect(badgeLabel()).toBe("🔒 이 기기에만");
    expect(useShare.getState().byBoard.b1).toBeUndefined();

    // 버튼은 그대로 눌린다 — 두 번째는 로그인되어 공유까지 간다.
    const retry = screen.getByRole("button", { name: GOOGLE_SHARE }) as HTMLButtonElement;
    expect(retry.disabled).toBe(false);
    fireEvent.click(retry);
    expect(await screen.findByRole("dialog", { name: "함께 쓰기" })).toBeTruthy();
    expect(badgeLabel()).toBe("☁ 공유 중");
  });
});

describe("T9 · 올리다 끊기면 공유하지 못했다고 말한다", () => {
  test("업로드 실패: 문구와 다시 시도, 서버 행 정리, 배지는 이 기기에만 — 다시 시도하면 성공한다", async () => {
    const shareApi = fakeShareApi();
    const uploadDoc = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("연결이 끊겼어요"))
      .mockResolvedValue(undefined);
    configureShare({ api: shareApi, uploadDoc });
    configureAuth({ api: fakeAuthApi(), googleIdToken: vi.fn(async () => "id-token") });
    await loginState();
    mount();

    await openSheet();
    fireEvent.click(screen.getByRole("button", { name: "공유" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("공유하지 못했어요. 벽은 이 기기에 그대로 있어요.");
    expect(shareApi.unshare).toHaveBeenCalledWith("b1", session.accessToken);
    expect(badgeLabel()).toBe("🔒 이 기기에만");
    expect(useShare.getState().byBoard.b1?.status ?? "local").toBe("local");

    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByRole("dialog", { name: "함께 쓰기" })).toBeTruthy();
    expect(badgeLabel()).toBe("☁ 공유 중");
    expect(uploadDoc).toHaveBeenCalledTimes(2);
  });
});

describe("G2 · 다른 창이 같은 벽을 공유하는 중이면 시작하지 않고 그렇게 말한다", () => {
  const lockKey = "moss:shareStarting:b1";

  afterEach(() => localStorage.removeItem(lockKey));

  test("서버 호출 없이 '다른 창에서 공유하는 중이에요'를 보이고 다시 시도할 수 있다", async () => {
    localStorage.setItem(
      lockKey,
      JSON.stringify({ token: "other-tab", expiresAt: Date.now() + 20_000 }),
    );
    const shareApi = fakeShareApi();
    const uploadDoc = vi.fn(async () => {});
    configureShare({ api: shareApi, uploadDoc });
    configureAuth({ api: fakeAuthApi(), googleIdToken: vi.fn(async () => "id-token") });
    await loginState();
    mount();

    await openSheet();
    fireEvent.click(screen.getByRole("button", { name: "공유" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("다른 창에서 공유하는 중이에요");
    expect(shareApi.share).not.toHaveBeenCalled();
    expect(shareApi.unshare).not.toHaveBeenCalled();
    expect(uploadDoc).not.toHaveBeenCalled();
    expect(badgeLabel()).toBe("🔒 이 기기에만");

    // 그 창이 끝났거나 죽어 락이 풀리면 다시 시도할 수 있다.
    localStorage.removeItem(lockKey);
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByRole("dialog", { name: "함께 쓰기" })).toBeTruthy();
    expect(shareApi.share).toHaveBeenCalledTimes(1);
  });
});

describe("T11 · 로그인한 사람은 Google 창 없이 공유한다", () => {
  test("공유를 누르면 로그인 창 없이 공유 중이 된다", async () => {
    const shareApi = fakeShareApi();
    const googleIdToken = vi.fn(async () => "id-token");
    configureShare({ api: shareApi, uploadDoc: vi.fn(async () => {}) });
    configureAuth({ api: fakeAuthApi(), googleIdToken });
    await loginState();
    mount();

    await openSheet();
    expect(screen.getByRole("button", { name: "취소" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "공유" }));

    expect(await screen.findByRole("dialog", { name: "함께 쓰기" })).toBeTruthy();
    expect(googleIdToken).not.toHaveBeenCalled();
    expect(shareApi.share).toHaveBeenCalledTimes(1);
    expect(badgeLabel()).toBe("☁ 공유 중");
  });
});

describe("오프라인", () => {
  test("공유를 누르면 연결되면 다시 시도해 달라고 하고 아무것도 부르지 않는다", async () => {
    const shareApi = fakeShareApi();
    const googleIdToken = vi.fn(async () => "id-token");
    configureShare({ api: shareApi, uploadDoc: vi.fn(async () => {}) });
    configureAuth({ api: fakeAuthApi(), googleIdToken });
    mount();

    await openSheet();
    Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
    fireEvent.click(screen.getByRole("button", { name: GOOGLE_SHARE }));

    expect((await screen.findByRole("alert")).textContent).toBe("연결되면 다시 시도해 주세요");
    expect(googleIdToken).not.toHaveBeenCalled();
    expect(shareApi.share).not.toHaveBeenCalled();
    expect(badgeLabel()).toBe("🔒 이 기기에만");
  });
});

describe("D8 · 벽 안 파일함이 있을 때만 함께 올라간다고 덧붙인다", () => {
  test("파일함 0개: 덧붙임 문구가 없다", async () => {
    useWorkspace.setState({ boards: [wallBoard("b1", null), wallBoard("other", null)] });
    configureShare({ api: fakeShareApi(), uploadDoc: vi.fn(async () => {}) });
    mount();

    await openSheet();
    expect(screen.queryByTestId("share-sheet-folders")).toBeNull();
    expect(screen.queryByText(/파일함/)).toBeNull();
  });

  test("파일함 2개(손자 포함): 이 벽 안 파일함 2개도 함께 올라가요", async () => {
    useWorkspace.setState({
      boards: [
        wallBoard("b1", null),
        wallBoard("c1", "b1"),
        wallBoard("c2", "c1"),
        wallBoard("elsewhere", "other"),
      ],
    });
    configureShare({ api: fakeShareApi(), uploadDoc: vi.fn(async () => {}) });
    mount();

    await openSheet();
    expect(screen.getByTestId("share-sheet-folders").textContent).toBe(
      "이 벽 안 파일함 2개도 함께 올라가요.",
    );
  });
});

describe("countSubBoards", () => {
  const never = () => false;

  test("이 벽 아래 모든 깊이를 세고 다른 벽의 파일함은 세지 않는다", () => {
    const boards = [
      wallBoard("root", null),
      wallBoard("a", "root"),
      wallBoard("a1", "a"),
      wallBoard("z", "other"),
    ];
    expect(countSubBoards(boards, "root", never)).toBe(2);
    expect(countSubBoards(boards, "other", never)).toBe(1);
  });

  test("이미 공유 중인 파일함과 다른 사람의 보드는 세지 않는다", () => {
    const boards = [
      wallBoard("root", null),
      wallBoard("a", "root"),
      wallBoard("b", "root"),
      wallBoard("c", "root", { remote: true }),
    ];
    expect(countSubBoards(boards, "root", (id) => id === "a")).toBe(1);
  });

  test("부모 체인이 순환해도 끝난다", () => {
    const boards = [wallBoard("x", "y"), wallBoard("y", "x")];
    expect(countSubBoards(boards, "x", never)).toBe(1);
  });
});
