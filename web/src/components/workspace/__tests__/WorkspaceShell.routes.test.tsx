import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import {
  parseBoardId,
  RootBoardRedirect,
  RouteBoardSync,
  useBoardIdFromPath,
} from "@/components/workspace/WorkspaceShell";
import { WorkspaceGate } from "@/components/auth/WorkspaceGate";
import { resetAuthStore, useAuth } from "@/state/auth/store";
import {
  SYSTEM_BOARD_ID,
  __resetBoardNavigatorForTest,
  setBoardNavigator,
  useWorkspace,
} from "@/state/workspace";
import { newBoardId } from "@/state/boardIds";
import { useStorage } from "@/state/storage";
import { getDB, resetDB, DEFAULT_SETTINGS } from "@/state/db/schema";

/**
 * FEAT-onboarding-routes n3 — URL을 보드 전환의 원본으로 만든다 (D1·D2·D4·D8).
 *
 * - navigateToBoard는 라우터 sink가 있으면 URL만 바꾸고 상태는 건드리지 않는다.
 *   sink가 없으면(라우터 없는 유닛 환경) setCurrentBoard로 폴백한다.
 * - RouteBoardSync는 URL의 boardId를 부팅 완료 뒤에 연다(AC-12 이전 중 진입).
 * - RootBoardRedirect(`/`)는 마지막 연 보드로 replace한다(AC-6).
 */
const push = vi.fn();
const replace = vi.fn();
const { pathnameRef } = vi.hoisted(() => ({ pathnameRef: { value: "/" } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => pathnameRef.value,
}));

beforeEach(async () => {
  push.mockClear();
  replace.mockClear();
  pathnameRef.value = "/";
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
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  resetAuthStore();
  __resetBoardNavigatorForTest();
  await resetDB();
});

describe("navigateToBoard · URL이 원본 (D8)", () => {
  it("라우터 sink가 있으면 push만 하고 상태는 바꾸지 않는다", async () => {
    const sink = vi.fn();
    setBoardNavigator(sink);
    await useWorkspace.getState().navigateToBoard("board-x");
    expect(sink).toHaveBeenCalledWith("board-x");
    expect(useWorkspace.getState().currentBoardId).toBe(SYSTEM_BOARD_ID);
  });

  it("같은 보드면 history를 쌓지 않는다 (spec §6)", async () => {
    const sink = vi.fn();
    setBoardNavigator(sink);
    useWorkspace.setState({ currentBoardId: "board-x" });
    await useWorkspace.getState().navigateToBoard("board-x");
    expect(sink).not.toHaveBeenCalled();
  });

  it("이전 중에는 이동하지 않는다 (n23 가드)", async () => {
    const sink = vi.fn();
    setBoardNavigator(sink);
    useWorkspace.setState({ migrationPending: true });
    await useWorkspace.getState().navigateToBoard("board-x");
    expect(sink).not.toHaveBeenCalled();
  });

  it("라우터가 없으면 setCurrentBoard로 폴백한다", async () => {
    await useStorage.getState().init();
    const id = await useWorkspace.getState().createBoard("A");
    useWorkspace.setState({ currentBoardId: SYSTEM_BOARD_ID });
    await useWorkspace.getState().navigateToBoard(id);
    expect(useWorkspace.getState().currentBoardId).toBe(id);
  });
});

describe("RouteBoardSync · /b/[boardId] 동기화", () => {
  it("부팅 완료 뒤 URL의 보드를 연다 (AC-1 새로고침 유지)", async () => {
    await useStorage.getState().init();
    const id = await useWorkspace.getState().createBoard("A");
    useWorkspace.setState({
      currentBoardId: SYSTEM_BOARD_ID,
      bootstrapComplete: true,
    });
    render(<RouteBoardSync boardId={id} />);
    await waitFor(() => expect(useWorkspace.getState().currentBoardId).toBe(id));
  });

  it("부팅(마이그레이션) 전에는 열지 않는다 (AC-12)", async () => {
    await useStorage.getState().init();
    const id = await useWorkspace.getState().createBoard("A");
    useWorkspace.setState({
      currentBoardId: SYSTEM_BOARD_ID,
      bootstrapComplete: false,
    });
    render(<RouteBoardSync boardId={id} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(useWorkspace.getState().currentBoardId).toBe(SYSTEM_BOARD_ID);

    useWorkspace.setState({ bootstrapComplete: true });
    await waitFor(() => expect(useWorkspace.getState().currentBoardId).toBe(id));
  });

  it("마운트 중 스토어 이동 요청은 history.pushState로 URL을 바꾼다 (P1)", async () => {
    const pushState = vi.spyOn(window.history, "pushState");
    await useStorage.getState().init();
    const id = await useWorkspace.getState().createBoard("A");
    useWorkspace.setState({
      currentBoardId: SYSTEM_BOARD_ID,
      bootstrapComplete: true,
    });
    render(<RouteBoardSync boardId={SYSTEM_BOARD_ID} />);
    await useWorkspace.getState().navigateToBoard(id);
    expect(pushState).toHaveBeenCalledWith(null, "", `/b/${id}`);
  });
});

describe("RouteBoardSync · 로컬에 없는 보드 (n5)", () => {
  it("모르는 id는 빈 보드 행을 만들지 않고 안내 카드를 띄운다 (AC-8 핵심)", async () => {
    await useStorage.getState().init();
    useWorkspace.setState({
      currentBoardId: SYSTEM_BOARD_ID,
      bootstrapComplete: true,
    });
    render(
      <I18nProvider locale="ko">
        <RouteBoardSync boardId="unknown-id" />
      </I18nProvider>,
    );
    expect(await screen.findByText("이 보드를 볼 수 없어요")).toBeTruthy();
    expect(useWorkspace.getState().currentBoardId).toBe(SYSTEM_BOARD_ID);
    expect(await getDB().boards.get("unknown-id")).toBeUndefined();
  });

  it("휴지통에 흔적이 남은 보드는 '찾을 수 없는 보드예요' + '마지막 보드로' (AC-8)", async () => {
    await useStorage.getState().init();
    await getDB().trash.put({
      id: "t1",
      note: {
        id: "t1",
        boardId: "gone-board",
        kind: "text",
        x: 0,
        y: 0,
        width: 240,
        rotation: 0,
        content: "",
        aiOptOut: false,
        createdAt: 1,
        updatedAt: 1,
        lastVisitedAt: 1,
      },
      boardName: "지운 보드",
      deletedAt: 2,
    });
    useWorkspace.setState({
      currentBoardId: SYSTEM_BOARD_ID,
      bootstrapComplete: true,
    });
    render(
      <I18nProvider locale="ko">
        <RouteBoardSync boardId="gone-board" />
      </I18nProvider>,
    );
    expect(await screen.findByText("찾을 수 없는 보드예요")).toBeTruthy();
    expect(useWorkspace.getState().currentBoardId).toBe(SYSTEM_BOARD_ID);
    fireEvent.click(screen.getByRole("button", { name: "마지막 보드로" }));
    expect(replace).toHaveBeenCalledWith("/");
  });

  it("설정의 지운 보드 id 목록에 있으면 '찾을 수 없는 보드예요' (P1 AC-8)", async () => {
    await useStorage.getState().init();
    await getDB().settings.put({
      ...DEFAULT_SETTINGS,
      deletedBoardIds: ["deleted-board"],
    });
    useWorkspace.setState({
      currentBoardId: SYSTEM_BOARD_ID,
      bootstrapComplete: true,
    });
    render(
      <I18nProvider locale="ko">
        <RouteBoardSync boardId="deleted-board" />
      </I18nProvider>,
    );
    expect(await screen.findByText("찾을 수 없는 보드예요")).toBeTruthy();
    expect(useWorkspace.getState().currentBoardId).toBe(SYSTEM_BOARD_ID);
    expect(await getDB().boards.get("deleted-board")).toBeUndefined();
  });
});

describe("RootBoardRedirect · /는 갈림길 (D4·AC-6)", () => {
  it("마지막으로 연 보드를 주소로 replaceState한다 (P1)", async () => {
    const replaceState = vi.spyOn(window.history, "replaceState");
    await useStorage.getState().init();
    const id = await useWorkspace.getState().createBoard("A");
    useWorkspace.setState({ bootstrapComplete: true });
    render(<RootBoardRedirect />);
    await waitFor(() =>
      expect(replaceState).toHaveBeenCalledWith(null, "", `/b/${id}`),
    );
  });

  it("사용자 보드가 없으면 첫 보드 고르기를 보여 주고 replace하지 않는다 (n4 AC-5)", async () => {
    const replaceState = vi.spyOn(window.history, "replaceState");
    useWorkspace.setState({ boards: [], cards: [], bootstrapComplete: true });
    render(
      <I18nProvider locale="ko">
        <RootBoardRedirect />
      </I18nProvider>,
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(replaceState).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "예제로 시작" })).toBeTruthy();
  });
});

describe("주소 → 보드 id (P1)", () => {
  it("parseBoardId는 /b/<id>만 뽑고 다른 경로는 undefined", () => {
    expect(parseBoardId("/b/abc")).toBe("abc");
    expect(parseBoardId("/b/abc/")).toBe("abc");
    expect(parseBoardId("/b/00000000-0000-4000-8000-000000000001")).toBe(
      "00000000-0000-4000-8000-000000000001",
    );
    expect(parseBoardId("/")).toBeUndefined();
    expect(parseBoardId("/b")).toBeUndefined();
    expect(parseBoardId("/b/abc/def")).toBeUndefined();
    expect(parseBoardId(null)).toBeUndefined();
  });

  it("usePathname이 바뀌면 boardId가 따라간다", async () => {
    function Probe() {
      const id = useBoardIdFromPath();
      return <div data-testid="probe">{id ?? "none"}</div>;
    }
    const { rerender } = render(<Probe />);
    expect(screen.getByTestId("probe").textContent).toBe("none");
    pathnameRef.value = "/b/xyz";
    rerender(<Probe />);
    await waitFor(() => expect(screen.getByTestId("probe").textContent).toBe("xyz"));
  });

  it("popstate에서 window.location을 다시 읽는다 (안전망)", async () => {
    function Probe() {
      const id = useBoardIdFromPath();
      return <div data-testid="probe">{id ?? "none"}</div>;
    }
    render(<Probe />);
    // 주소만 바꾸고 pathnameRef는 그대로 둔다 — Next가 반영하지 못한 상황을 흉내낸다.
    window.history.pushState(null, "", "/b/pop-board");
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("probe").textContent).toBe("pop-board"),
    );
  });
});

describe("로그인 게이트와 /b/[boardId] 복귀 (AC-4)", () => {
  it("로그인 전에는 온보딩만, 로그인 뒤 그 주소의 보드를 연다", async () => {
    await useStorage.getState().init();
    const id = await useWorkspace.getState().createBoard("A");
    useWorkspace.setState({
      currentBoardId: SYSTEM_BOARD_ID,
      bootstrapComplete: true,
    });
    useAuth.setState({ status: "anonymous", hydrated: true });

    render(
      <I18nProvider locale="ko">
        <WorkspaceGate>
          <RouteBoardSync boardId={id} />
        </WorkspaceGate>
      </I18nProvider>,
    );
    expect(screen.getByText("moss에 오신 것을 환영해요")).toBeTruthy();

    // 로그인 완료 — 게이트가 워크스페이스로 바뀌고 URL의 보드가 열린다.
    useAuth.setState({
      status: "authenticated",
      hydrated: true,
      user: { id: "u1", name: "동환", avatar: null },
    });
    await waitFor(() => expect(useWorkspace.getState().currentBoardId).toBe(id));
    expect(screen.queryByText("moss에 오신 것을 환영해요")).toBeNull();
  });
});

describe("새 보드 id는 UUID (D2)", () => {
  it("createBoard가 만든 id는 UUID 형식이고 기존 b-… 형식이 아니다", async () => {
    await useStorage.getState().init();
    const id = await useWorkspace.getState().createBoard("A");
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("newBoardId는 매번 다른 값을 돌려준다", () => {
    expect(newBoardId()).not.toBe(newBoardId());
  });
});
