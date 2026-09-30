import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { resetAuthStore, useAuth, type AuthSession } from "@/state/auth";
import { useToasts } from "@/state/notifications";
import type { CollabAwareness, CollabProviderConfig, CollabProviderFactory } from "../provider";
import { configureCollab, resetCollabStore, useCollab } from "../store";

const NOW = 1_700_000_000_000;

function makeToken(expSeconds: number): string {
  const enc = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${enc({ alg: "HS256" })}.${enc({ exp: expSeconds })}.sig`;
}

const session: AuthSession = {
  accessToken: makeToken(9_999_999_999),
  refreshToken: makeToken(9_999_999_999),
  user: { id: "u1", name: "동환", avatar: null },
};

interface CreatedProvider {
  config: CollabProviderConfig;
  handle: {
    awareness: CollabAwareness;
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  };
  states: Map<number, Record<string, unknown>>;
  emit: () => void;
}

function makeFactory() {
  const created: CreatedProvider[] = [];
  const factory: CollabProviderFactory = {
    create(config) {
      const listeners: Array<() => void> = [];
      const states = new Map<number, Record<string, unknown>>();
      const awareness: CollabAwareness = {
        clientID: 1,
        getStates: () => states,
        setLocalStateField: (field, value) => {
          const local = states.get(1) ?? {};
          local[field] = value;
          states.set(1, local);
        },
        on: (_event, handler) => {
          listeners.push(handler);
        },
        off: (_event, handler) => {
          const i = listeners.indexOf(handler);
          if (i >= 0) listeners.splice(i, 1);
        },
      };
      const handle = {
        awareness,
        connect: vi.fn(),
        disconnect: vi.fn(),
        destroy: vi.fn(),
      };
      created.push({
        config,
        handle,
        states,
        emit: () => listeners.forEach((l) => l()),
      });
      return handle;
    },
  };
  return { factory, created };
}

function authenticate(): void {
  useAuth.setState({
    session,
    user: session.user,
    status: "authenticated",
    hydrated: true,
    hydrating: false,
  });
}

beforeEach(() => {
  resetAuthStore();
  resetCollabStore();
  useToasts.getState().clear();
});

afterEach(() => {
  resetAuthStore();
  resetCollabStore();
});

describe("useCollab.connect", () => {
  it("보드 토큰을 받아 보드 Y.Doc에 provider를 붙이고 연결한다", async () => {
    const doc = new Y.Doc();
    const { factory, created } = makeFactory();
    const fetchBoardToken = vi.fn(async () => ({
      boardToken: "bt-1",
      expiresInSeconds: 3600,
    }));
    configureCollab({
      providerFactory: factory,
      fetchBoardToken,
      getBoardDoc: () => doc,
      syncUrl: () => "ws://sync.test",
      now: () => NOW,
    });
    authenticate();

    await useCollab.getState().connect("b1");

    expect(fetchBoardToken).toHaveBeenCalledWith("b1", session.accessToken);
    expect(created).toHaveLength(1);
    expect(created[0].config.name).toBe("b1");
    expect(created[0].config.url).toBe("ws://sync.test");
    expect(created[0].config.document).toBe(doc);
    expect(created[0].handle.connect).toHaveBeenCalledTimes(1);
    expect(useCollab.getState().boardId).toBe("b1");
  });

  it("같은 보드에 중복 connect해도 provider를 하나만 만든다", async () => {
    const { factory, created } = makeFactory();
    configureCollab({
      providerFactory: factory,
      fetchBoardToken: async () => ({ boardToken: "bt", expiresInSeconds: 3600 }),
      getBoardDoc: () => new Y.Doc(),
      syncUrl: () => "ws://sync.test",
      now: () => NOW,
    });
    authenticate();

    await Promise.all([
      useCollab.getState().connect("b1"),
      useCollab.getState().connect("b1"),
    ]);
    await useCollab.getState().connect("b1");

    expect(created).toHaveLength(1);
  });

  it("문서를 찾지 못하면 provider를 만들지 않고 error를 남긴다", async () => {
    const { factory, created } = makeFactory();
    configureCollab({
      providerFactory: factory,
      fetchBoardToken: async () => ({ boardToken: "bt", expiresInSeconds: 3600 }),
      getBoardDoc: () => null,
      syncUrl: () => "ws://sync.test",
      now: () => NOW,
    });
    authenticate();

    await useCollab.getState().connect("b1");

    expect(created).toHaveLength(0);
    expect(useCollab.getState().boardId).toBeNull();
    expect(useCollab.getState().error).toBeTruthy();
  });

  it("서버가 4403으로 끊으면 재연결을 멈추고 revoked를 표시한다 (AC-14 신호)", async () => {
    const { factory, created } = makeFactory();
    configureCollab({
      providerFactory: factory,
      fetchBoardToken: async () => ({ boardToken: "bt", expiresInSeconds: 3600 }),
      getBoardDoc: () => new Y.Doc(),
      syncUrl: () => "ws://sync.test",
      now: () => NOW,
    });
    authenticate();

    await useCollab.getState().connect("b1");
    created[0].config.onClose(4403);

    expect(useCollab.getState().error).toBe("revoked");
    // 재연결을 멈춘다 — provider를 파괴하고 boardId를 비운다 (n9).
    expect(created[0].handle.destroy).toHaveBeenCalledTimes(1);
    expect(useCollab.getState().boardId).toBeNull();
    expect(useCollab.getState().status).toBe("idle");
    expect(useCollab.getState().revokedBoardId).toBe("b1");
  });

  it("일시적 close(1000)는 세션을 유지한다 — 재연결은 provider에 맡긴다", async () => {
    const { factory, created } = makeFactory();
    configureCollab({
      providerFactory: factory,
      fetchBoardToken: async () => ({ boardToken: "bt", expiresInSeconds: 3600 }),
      getBoardDoc: () => new Y.Doc(),
      syncUrl: () => "ws://sync.test",
      now: () => NOW,
    });
    authenticate();

    await useCollab.getState().connect("b1");
    created[0].config.onClose(1000);

    expect(useCollab.getState().boardId).toBe("b1");
    expect(useCollab.getState().revokedBoardId).toBeNull();
    expect(created[0].handle.destroy).not.toHaveBeenCalled();
  });

  it("revoked 뒤 새 connect는 정상으로 다시 붙는다", async () => {
    const { factory, created } = makeFactory();
    configureCollab({
      providerFactory: factory,
      fetchBoardToken: async () => ({ boardToken: "bt", expiresInSeconds: 3600 }),
      getBoardDoc: () => new Y.Doc(),
      syncUrl: () => "ws://sync.test",
      now: () => NOW,
    });
    authenticate();

    await useCollab.getState().connect("b1");
    created[0].config.onClose(4403);
    await useCollab.getState().connect("b2");

    expect(useCollab.getState().boardId).toBe("b2");
    expect(useCollab.getState().revokedBoardId).toBeNull();
    expect(created).toHaveLength(2);
  });

  it("서버가 4413(문서 한도 초과)으로 끊으면 '보드가 너무 커요'를 알린다 (spec §7)", async () => {
    const { factory, created } = makeFactory();
    configureCollab({
      providerFactory: factory,
      fetchBoardToken: async () => ({ boardToken: "bt", expiresInSeconds: 3600 }),
      getBoardDoc: () => new Y.Doc(),
      syncUrl: () => "ws://sync.test",
      now: () => NOW,
    });
    authenticate();

    await useCollab.getState().connect("b1");
    created[0].config.onClose(4413);

    expect(useCollab.getState().error).toBe("boardTooLarge");
    expect(useToasts.getState().toasts.some((t) => t.title.includes("보드가 너무 커요"))).toBe(
      true,
    );
  });
});

describe("useCollab awareness", () => {
  async function connectWithLocal(overrides: Partial<Parameters<typeof configureCollab>[0]> = {}) {
    const doc = new Y.Doc();
    const { factory, created } = makeFactory();
    configureCollab({
      providerFactory: factory,
      fetchBoardToken: async () => ({ boardToken: "bt", expiresInSeconds: 3600 }),
      getBoardDoc: () => doc,
      syncUrl: () => "ws://sync.test",
      now: () => NOW,
      ...overrides,
    });
    authenticate();
    useCollab.getState().setUserName("동환");
    await useCollab.getState().connect("b1");
    return { doc, created };
  }

  it("user·cursor·selection·dragging을 로컬 awareness에 발행한다", async () => {
    const { created } = await connectWithLocal();
    const local = created[0].states.get(1)!;
    expect(local.user).toEqual({ name: "동환" });

    useCollab.getState().publishCursor(10, 20);
    useCollab.getState().publishSelection([
      { noteId: "n1", x: 1, y: 2, width: 3, height: 4, rotation: 0 },
    ]);
    useCollab.getState().publishDragging({ noteId: "n1", x: 1, y: 2, rotation: 0 });

    expect(local.cursor).toEqual({ x: 10, y: 20 });
    expect(local.selection).toEqual([
      { noteId: "n1", x: 1, y: 2, width: 3, height: 4, rotation: 0 },
    ]);
    expect(local.dragging).toEqual({ noteId: "n1", x: 1, y: 2, rotation: 0 });

    // 선택 해제는 null로 실어 원격이 지운다 — 선택 스로틀의 trailing 뒤 반영.
    useCollab.getState().publishSelection([]);
    await new Promise((r) => setTimeout(r, 50));
    expect(local.selection).toBeNull();
  });

  it("P1: 같은 선택을 반복 발행해도 awareness에는 한 번만 쓴다", async () => {
    const { created } = await connectWithLocal();
    const awareness = created[0].handle.awareness;
    const spy = vi.spyOn(awareness, "setLocalStateField");
    const rects = [{ noteId: "n1", x: 1, y: 2, width: 3, height: 4, rotation: 0 }];

    useCollab.getState().publishSelection(rects);
    useCollab.getState().publishSelection(rects);
    useCollab.getState().publishSelection([...rects]);
    // 같은 값 3번 → 스로틀 leading/trailing 어느 쪽이든 정확히 1회.
    await new Promise((r) => setTimeout(r, 60));

    const selectionWrites = spy.mock.calls.filter(([field]) => field === "selection");
    expect(selectionWrites).toHaveLength(1);
    spy.mockRestore();
  });

  it("원격 awareness 변경을 participants로 반영한다", async () => {
    const { created } = await connectWithLocal();

    created[0].states.set(2, { user: { name: "민지" }, cursor: { x: 5, y: 6 } });
    created[0].emit();

    const participants = useCollab.getState().participants;
    expect(participants).toHaveLength(1);
    expect(participants[0].user.name).toBe("민지");
    expect(participants[0].cursor).toEqual({ x: 5, y: 6 });
  });

  it("AC-7: Awareness 발행은 Y.Doc에 쓰지 않는다", async () => {
    const { doc } = await connectWithLocal();

    let updates = 0;
    doc.on("update", () => {
      updates += 1;
    });

    useCollab.getState().publishCursor(1, 2);
    useCollab.getState().publishSelection([
      { noteId: "n1", x: 0, y: 0, width: 1, height: 1, rotation: 0 },
    ]);
    useCollab.getState().publishDragging({ noteId: "n1", x: 3, y: 4, rotation: 0 });

    expect(updates).toBe(0);
  });
});

describe("useCollab 토큰 수명 (AC-11)", () => {
  it("보드 토큰이 만료 임박하면 token()이 새 토큰을 받는다", async () => {
    let now = NOW;
    const doc = new Y.Doc();
    const { factory, created } = makeFactory();
    const fetchBoardToken = vi
      .fn()
      .mockResolvedValueOnce({ boardToken: "bt-1", expiresInSeconds: 3600 })
      .mockResolvedValueOnce({ boardToken: "bt-2", expiresInSeconds: 3600 });
    configureCollab({
      providerFactory: factory,
      fetchBoardToken,
      getBoardDoc: () => doc,
      syncUrl: () => "ws://sync.test",
      now: () => now,
    });
    authenticate();

    await useCollab.getState().connect("b1");
    const token = created[0].config.token;

    // 아직 유효 — 캐시를 그대로 쓴다(추가 요청 없음).
    expect(await token()).toBe("bt-1");
    expect(fetchBoardToken).toHaveBeenCalledTimes(1);

    // 1시간 뒤 재연결 — 만료 임박이라 새 토큰을 받는다.
    now += 3600 * 1000;
    expect(await token()).toBe("bt-2");
    expect(fetchBoardToken).toHaveBeenCalledTimes(2);
  });
});

describe("useCollab.disconnect", () => {
  it("provider를 destroy하고 상태를 비운다", async () => {
    const { factory, created } = makeFactory();
    configureCollab({
      providerFactory: factory,
      fetchBoardToken: async () => ({ boardToken: "bt", expiresInSeconds: 3600 }),
      getBoardDoc: () => new Y.Doc(),
      syncUrl: () => "ws://sync.test",
      now: () => NOW,
    });
    authenticate();
    await useCollab.getState().connect("b1");

    useCollab.getState().disconnect();

    expect(created[0].handle.destroy).toHaveBeenCalledTimes(1);
    expect(useCollab.getState().boardId).toBeNull();
    expect(useCollab.getState().participants).toEqual([]);
  });
});
