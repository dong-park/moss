import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const KEY = "moss:sharedBoards";

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

afterEach(() => {
  localStorage.clear();
});

async function load() {
  const share = await import("../store");
  const wall = await import("../wallState");
  const auth = await import("@/state/auth");
  return { ...share, ...wall, useAuth: auth.useAuth };
}

type Loaded = Awaited<ReturnType<typeof load>>;

function signIn(useAuth: Loaded["useAuth"], id: string): void {
  useAuth.setState({
    session: {
      accessToken: "a",
      refreshToken: "r",
      user: { id, name: id, avatar: null },
    },
    user: { id, name: id, avatar: null },
    status: "authenticated",
    hydrated: true,
    hydrating: false,
  });
}

function persisted(): unknown {
  const raw = localStorage.getItem(KEY);
  return raw === null ? null : JSON.parse(raw);
}

describe("공유 중인 벽을 기기에 남긴다 (F2)", () => {
  test("공유 중으로 복원되면 기기에 계정과 함께 기록되고 해제하면 지워진다", async () => {
    const { useShare, useAuth } = await load();
    signIn(useAuth, "u1");

    useShare.getState().restoreShared("b1", "owner");
    expect(persisted()).toEqual({ userId: "u1", boards: { b1: "owner" } });

    useShare.getState().setLocal("b1");
    expect(persisted()).toEqual({ userId: "u1", boards: {} });

    useShare.getState().restoreShared("b2", "editor");
    useShare.getState().forgetBoard("b2");
    expect(persisted()).toEqual({ userId: "u1", boards: {} });
  });

  test("새로고침해 모듈을 다시 읽어도 동기화 없이 공유 중으로 시작한다", async () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ userId: "u1", boards: { b1: "owner", b2: "editor" } }),
    );
    const { useShare } = await load();

    expect(useShare.getState().byBoard.b1).toMatchObject({ status: "shared", role: "owner" });
    expect(useShare.getState().byBoard.b2).toMatchObject({ status: "shared", role: "editor" });
  });

  test("로그아웃 상태로 새로고침하면 공유 중이 아니라 로그아웃된 공유로 읽힌다 (D5)", async () => {
    localStorage.setItem(KEY, JSON.stringify({ userId: "u1", boards: { b1: "owner" } }));
    const { wallShareState, useAuth } = await load();
    useAuth.setState({ session: null, user: null, status: "anonymous" });

    expect(wallShareState("b1")).toBe("sharedLoggedOut");
  });

  test("다른 탭의 공유 시작·해제가 이 탭 배지에 반영된다", async () => {
    const { useShare, useAuth } = await load();
    signIn(useAuth, "u1");
    useShare.getState().restoreShared("mine", "owner");

    // 다른 탭이 b9 를 공유하고 mine 을 해제했다.
    localStorage.setItem(KEY, JSON.stringify({ userId: "u1", boards: { b9: "owner" } }));
    window.dispatchEvent(new StorageEvent("storage", { key: KEY }));

    expect(useShare.getState().byBoard.b9?.status).toBe("shared");
    expect(useShare.getState().byBoard.mine?.status).toBe("local");
  });

  test("다른 탭이 로그아웃해 값이 지워져도 이 탭의 공유를 해제로 보지 않는다", async () => {
    const { useShare, useAuth } = await load();
    signIn(useAuth, "u1");
    useShare.getState().restoreShared("mine", "owner");

    localStorage.removeItem(KEY);
    window.dispatchEvent(new StorageEvent("storage", { key: KEY }));

    expect(useShare.getState().byBoard.mine?.status).toBe("shared");
  });

  test("이 탭의 쓰기는 다른 탭이 기록한 공유를 지우지 않는다", async () => {
    const { useShare, useAuth } = await load();
    signIn(useAuth, "u1");
    // 다른 탭이 먼저 b9 를 기록했다. 이 탭은 아직 모른다.
    localStorage.setItem(KEY, JSON.stringify({ userId: "u1", boards: { b9: "owner" } }));

    useShare.getState().restoreShared("b1", "owner");

    expect(persisted()).toEqual({ userId: "u1", boards: { b9: "owner", b1: "owner" } });
  });

  test("다른 계정의 값 위에는 이어 쓰지 않고 이 계정의 목록으로 새로 쓴다", async () => {
    const { useShare, useAuth } = await load();
    signIn(useAuth, "u2");
    localStorage.setItem(KEY, JSON.stringify({ userId: "u1", boards: { a1: "editor" } }));

    useShare.getState().restoreShared("b1", "owner");

    expect(persisted()).toEqual({ userId: "u2", boards: { b1: "owner" } });
  });

  test("손상된 값은 빈 값으로 읽는다", async () => {
    localStorage.setItem(KEY, "{not json");
    const { useShare } = await load();

    expect(useShare.getState().byBoard).toEqual({});
  });
});

describe("계정이 바뀌면 남의 공유 목록을 쓰지 않는다 (G1)", () => {
  test("계정이 적히지 않은 옛 형식 값은 읽지 않고 버린다", async () => {
    localStorage.setItem(KEY, JSON.stringify({ b1: "owner", b2: "editor" }));
    const { useShare } = await load();

    expect(useShare.getState().byBoard).toEqual({});
  });

  test("로그인한 계정이 기록한 계정과 같으면 복원한 공유를 확인된 것으로 쓴다", async () => {
    localStorage.setItem(KEY, JSON.stringify({ userId: "u1", boards: { b1: "editor" } }));
    const { useShare, useAuth } = await load();
    // 계정을 알기 전에는 확인되지 않은 항목이다.
    expect(useShare.getState().byBoard.b1?.unconfirmed).toBe(true);

    signIn(useAuth, "u1");

    expect(useShare.getState().byBoard.b1).toMatchObject({ status: "shared", role: "editor" });
    expect(useShare.getState().byBoard.b1?.unconfirmed).toBeFalsy();
    expect(persisted()).toEqual({ userId: "u1", boards: { b1: "editor" } });
  });

  test("다른 계정으로 로그인하면 복원한 공유를 버리고 기기의 기록도 비운다", async () => {
    localStorage.setItem(KEY, JSON.stringify({ userId: "A", boards: { b1: "editor" } }));
    const { useShare, useAuth } = await load();

    signIn(useAuth, "B");

    expect(useShare.getState().byBoard.b1).toBeUndefined();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  test("로그아웃하면 기기에 남은 공유 기록을 비운다", async () => {
    const { useShare, useAuth } = await load();
    signIn(useAuth, "u1");
    useShare.getState().restoreShared("b1", "owner");
    expect(persisted()).not.toBeNull();

    useAuth.setState({ session: null, user: null, status: "anonymous" });

    expect(localStorage.getItem(KEY)).toBeNull();
    // 이 탭의 배지는 로그아웃된 공유로 남는다 (D5).
    expect(useShare.getState().byBoard.b1?.status).toBe("shared");
  });

  test("로그아웃한 탭에서 다른 계정이 로그인하면 앞 계정의 공유가 이 계정의 것으로 남지 않는다", async () => {
    const { useShare, useAuth } = await load();
    signIn(useAuth, "A");
    useShare.getState().restoreShared("b1", "editor");

    useAuth.setState({ session: null, user: null, status: "anonymous" });
    signIn(useAuth, "B");

    expect(useShare.getState().byBoard.b1).toBeUndefined();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  test("같은 계정으로 다시 로그인하면 로그아웃 때 비운 기록을 되살린다", async () => {
    const { useShare, useAuth } = await load();
    signIn(useAuth, "A");
    useShare.getState().restoreShared("b1", "editor");
    useAuth.setState({ session: null, user: null, status: "anonymous" });

    signIn(useAuth, "A");

    expect(useShare.getState().byBoard.b1?.unconfirmed).toBeFalsy();
    expect(persisted()).toEqual({ userId: "A", boards: { b1: "editor" } });
  });

  test("서버 목록으로 확인한 항목은 확인되지 않은 표시를 벗는다", async () => {
    localStorage.setItem(KEY, JSON.stringify({ userId: "u1", boards: { b1: "editor" } }));
    const { useShare } = await load();
    expect(useShare.getState().byBoard.b1?.unconfirmed).toBe(true);

    useShare.getState().restoreShared("b1", "editor");

    expect(useShare.getState().byBoard.b1?.unconfirmed).toBeFalsy();
  });
});

describe("로그아웃으로 기록이 비워진 뒤 다른 탭의 쓰기 (H3)", () => {
  test("기록이 비어 있으면 변경분이 아니라 이 탭의 확인된 공유 전체를 쓴다", async () => {
    const { useShare, useAuth } = await load();
    signIn(useAuth, "u1");
    useShare.getState().restoreShared("b1", "owner");
    // 다른 탭이 로그아웃해 기록을 비웠다.
    localStorage.removeItem(KEY);

    useShare.getState().restoreShared("b2", "owner");

    expect(persisted()).toEqual({ userId: "u1", boards: { b1: "owner", b2: "owner" } });
  });

  test("다른 계정의 기록 위에는 이어 쓰지 않고 이 탭의 확인된 공유 전체를 쓴다", async () => {
    const { useShare, useAuth } = await load();
    signIn(useAuth, "u2");
    useShare.getState().restoreShared("b1", "owner");
    localStorage.setItem(KEY, JSON.stringify({ userId: "u1", boards: { a1: "editor" } }));

    useShare.getState().restoreShared("b2", "owner");

    expect(persisted()).toEqual({ userId: "u2", boards: { b1: "owner", b2: "owner" } });
  });

  test("기록이 있으면 여전히 변경분만 반영한다 — 다른 탭의 공유를 지우지 않는다", async () => {
    const { useShare, useAuth } = await load();
    signIn(useAuth, "u1");
    useShare.getState().restoreShared("b1", "owner");
    // 다른 탭이 b9 를 더했다. 이 탭은 아직 모른다.
    localStorage.setItem(KEY, JSON.stringify({ userId: "u1", boards: { b1: "owner", b9: "owner" } }));

    useShare.getState().setLocal("b1");

    expect(persisted()).toEqual({ userId: "u1", boards: { b9: "owner" } });
  });

  test("T1 로그아웃 → T2(같은 계정)가 b2 공유 → T3에서 b1이 여전히 공유 중이다", async () => {
    // T2: b1 을 공유 중인 같은 계정의 탭.
    const t2 = await load();
    signIn(t2.useAuth, "u1");
    t2.useShare.getState().restoreShared("b1", "owner");

    // T3: 기록에서 b1 을 이어받은 같은 계정의 셋째 탭.
    vi.resetModules();
    const t3 = await load();
    signIn(t3.useAuth, "u1");
    expect(t3.useShare.getState().byBoard.b1?.status).toBe("shared");

    // T1 이 로그아웃했다 — 기록이 지워진다. 이것은 "전부 해제"가 아니다.
    localStorage.removeItem(KEY);
    window.dispatchEvent(new StorageEvent("storage", { key: KEY }));
    expect(t3.useShare.getState().byBoard.b1?.status).toBe("shared");

    // T2 가 b2 를 공유했다.
    t2.useShare.getState().restoreShared("b2", "owner");
    window.dispatchEvent(new StorageEvent("storage", { key: KEY }));

    expect(t3.useShare.getState().byBoard.b1?.status).toBe("shared");
    expect(t3.useShare.getState().byBoard.b2?.status).toBe("shared");
  });
});
