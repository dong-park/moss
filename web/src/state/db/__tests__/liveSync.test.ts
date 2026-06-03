import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDB, resetDB, type Note } from "@/state/db/schema";
import { SYSTEM_BOARD_ID, useWorkspace } from "@/state/workspace";
import {
  __getTabId,
  __resetLiveSyncForTest,
  broadcastCardChange,
  handleIncoming,
  initLiveSync,
  isCardConflicted,
  resolveConflict,
  type CardSyncMsg,
} from "@/state/db/liveSync";

const CHANNEL_NAME = "moss-card-sync";
const OTHER = "other-tab";

function makeNote(overrides: Partial<Note> = {}): Note {
  const now = Date.now();
  return {
    id: "n1",
    boardId: null,
    kind: "text",
    x: 0,
    y: 0,
    width: 240,
    rotation: 0,
    content: "hello",
    aiOptOut: false,
    createdAt: now,
    updatedAt: now,
    lastVisitedAt: now,
    ...overrides,
  };
}

function resetStore() {
  useWorkspace.setState({
    cards: [],
    editingId: null,
    expandedCardId: null,
    currentBoardId: SYSTEM_BOARD_ID,
  });
}

/** 다음 채널 메시지 1개를 받는다(타임아웃 시 reject). */
function nextMessage(ch: BroadcastChannel, timeout = 1000): Promise<CardSyncMsg> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      ch.removeEventListener("message", onMsg);
      reject(new Error("no message"));
    }, timeout);
    const onMsg = (ev: MessageEvent) => {
      clearTimeout(t);
      ch.removeEventListener("message", onMsg);
      resolve(ev.data as CardSyncMsg);
    };
    ch.addEventListener("message", onMsg);
  });
}

beforeEach(() => {
  __resetLiveSyncForTest();
  resetStore();
});

afterEach(async () => {
  __resetLiveSyncForTest();
  await resetDB();
});

describe("liveSync — 발신(broadcast)", () => {
  it("broadcastCardChange가 origin(자기 탭 id)을 실어 다른 채널에 전달한다", async () => {
    initLiveSync();
    const listener = new BroadcastChannel(CHANNEL_NAME);
    try {
      const got = nextMessage(listener);
      broadcastCardChange({
        type: "card-upsert",
        id: "n1",
        boardId: null,
        updatedAt: 100,
      });
      const msg = await got;
      expect(msg.type).toBe("card-upsert");
      expect(msg.id).toBe("n1");
      expect(msg.origin).toBe(__getTabId());
    } finally {
      listener.close();
    }
  });

  it("Dexie notes 쓰기가 커밋 완료 시 card-upsert를 방송한다", async () => {
    initLiveSync();
    const listener = new BroadcastChannel(CHANNEL_NAME);
    try {
      const got = nextMessage(listener);
      await getDB().notes.put(makeNote({ id: "hooked", updatedAt: 7 }));
      const msg = await got;
      expect(msg.type).toBe("card-upsert");
      expect(msg.id).toBe("hooked");
    } finally {
      listener.close();
    }
  });

  it("Dexie notes 삭제가 card-delete를 방송한다", async () => {
    await getDB().notes.put(makeNote({ id: "del1" }));
    initLiveSync();
    const listener = new BroadcastChannel(CHANNEL_NAME);
    try {
      const got = nextMessage(listener);
      await getDB().notes.delete("del1");
      const msg = await got;
      expect(msg.type).toBe("card-delete");
      expect(msg.id).toBe("del1");
    } finally {
      listener.close();
    }
  });
});

describe("liveSync — 수신(handleIncoming)", () => {
  it("AC-1: 편집 중 아닌 카드를 다른 탭 변경으로 갱신한다", async () => {
    useWorkspace.setState({
      cards: [{ id: "n1", kind: "text", x: 0, y: 0, width: 240, content: "old" }],
    });
    await getDB().notes.put(makeNote({ id: "n1", content: "new", updatedAt: 200 }));
    await handleIncoming({
      type: "card-upsert",
      id: "n1",
      boardId: null,
      updatedAt: 200,
      origin: OTHER,
    });
    const card = useWorkspace.getState().cards.find((c) => c.id === "n1");
    expect(card?.content).toBe("new");
    expect(isCardConflicted("n1")).toBe(false);
  });

  it("AC-1: store에 없던 카드(생성)를 추가한다", async () => {
    await getDB().notes.put(makeNote({ id: "fresh", content: "added", updatedAt: 50 }));
    await handleIncoming({
      type: "card-upsert",
      id: "fresh",
      boardId: null,
      updatedAt: 50,
      origin: OTHER,
    });
    expect(useWorkspace.getState().cards.some((c) => c.id === "fresh")).toBe(true);
  });

  it("AC-2: 편집 중 카드는 덮어쓰지 않고 충돌 플래그만 세운다", async () => {
    useWorkspace.setState({
      cards: [{ id: "n1", kind: "text", x: 0, y: 0, width: 240, content: "내가 쓰는 중" }],
      editingId: "n1",
    });
    await getDB().notes.put(makeNote({ id: "n1", content: "남이 바꿈", updatedAt: 300 }));
    await handleIncoming({
      type: "card-upsert",
      id: "n1",
      boardId: null,
      updatedAt: 300,
      origin: OTHER,
    });
    const card = useWorkspace.getState().cards.find((c) => c.id === "n1");
    expect(card?.content).toBe("내가 쓰는 중"); // 보존
    expect(isCardConflicted("n1")).toBe(true);
  });

  it("자기 발신(origin === 내 탭 id) 메시지는 무시한다", async () => {
    useWorkspace.setState({
      cards: [{ id: "n1", kind: "text", x: 0, y: 0, width: 240, content: "old" }],
    });
    await getDB().notes.put(makeNote({ id: "n1", content: "new", updatedAt: 200 }));
    await handleIncoming({
      type: "card-upsert",
      id: "n1",
      boardId: null,
      updatedAt: 200,
      origin: __getTabId(),
    });
    expect(useWorkspace.getState().cards.find((c) => c.id === "n1")?.content).toBe("old");
  });

  it("updatedAt이 stale(이미 본 것보다 오래됨)이면 무시한다", async () => {
    useWorkspace.setState({
      cards: [{ id: "n1", kind: "text", x: 0, y: 0, width: 240, content: "v2" }],
    });
    // 먼저 updatedAt=200을 관측.
    await getDB().notes.put(makeNote({ id: "n1", content: "v2", updatedAt: 200 }));
    await handleIncoming({
      type: "card-upsert",
      id: "n1",
      boardId: null,
      updatedAt: 200,
      origin: OTHER,
    });
    // 이후 더 오래된 updatedAt=100 메시지 → 무시.
    await getDB().notes.put(makeNote({ id: "n1", content: "stale-v1", updatedAt: 100 }));
    await handleIncoming({
      type: "card-upsert",
      id: "n1",
      boardId: null,
      updatedAt: 100,
      origin: OTHER,
    });
    expect(useWorkspace.getState().cards.find((c) => c.id === "n1")?.content).toBe("v2");
  });

  it("AC-3: 삭제 메시지가 편집 중 아닌 카드를 제거한다", async () => {
    useWorkspace.setState({
      cards: [{ id: "n1", kind: "text", x: 0, y: 0, width: 240, content: "x" }],
    });
    await handleIncoming({
      type: "card-delete",
      id: "n1",
      boardId: null,
      updatedAt: 400,
      origin: OTHER,
    });
    expect(useWorkspace.getState().cards.some((c) => c.id === "n1")).toBe(false);
  });

  it("AC-2: 편집 중 카드 삭제는 제거하지 않고 충돌만 표시한다", async () => {
    useWorkspace.setState({
      cards: [{ id: "n1", kind: "text", x: 0, y: 0, width: 240, content: "x" }],
      editingId: "n1",
    });
    await handleIncoming({
      type: "card-delete",
      id: "n1",
      boardId: null,
      updatedAt: 400,
      origin: OTHER,
    });
    expect(useWorkspace.getState().cards.some((c) => c.id === "n1")).toBe(true);
    expect(isCardConflicted("n1")).toBe(true);
  });

  it("AC-3: 다른 보드로 이동된 카드는 현재 보드 뷰에서 제거된다", async () => {
    useWorkspace.setState({
      cards: [{ id: "n1", kind: "text", x: 0, y: 0, width: 240, content: "x" }],
      currentBoardId: SYSTEM_BOARD_ID, // storage boardId = null
    });
    await getDB().notes.put(makeNote({ id: "n1", boardId: "board-b", updatedAt: 500 }));
    await handleIncoming({
      type: "card-upsert",
      id: "n1",
      boardId: "board-b",
      updatedAt: 500,
      origin: OTHER,
    });
    expect(useWorkspace.getState().cards.some((c) => c.id === "n1")).toBe(false);
  });
});

describe("liveSync — 충돌 해소(resolveConflict)", () => {
  it("새로고침: DB 최신본을 store에 반영하고 편집을 닫고 충돌을 지운다", async () => {
    useWorkspace.setState({
      cards: [{ id: "n1", kind: "text", x: 0, y: 0, width: 240, content: "내 편집" }],
      editingId: "n1",
    });
    await getDB().notes.put(makeNote({ id: "n1", content: "최신본", updatedAt: 600 }));
    // 편집 중 외부 변경 → 충돌.
    await handleIncoming({
      type: "card-upsert",
      id: "n1",
      boardId: null,
      updatedAt: 600,
      origin: OTHER,
    });
    expect(isCardConflicted("n1")).toBe(true);

    await resolveConflict("n1");
    expect(useWorkspace.getState().cards.find((c) => c.id === "n1")?.content).toBe("최신본");
    expect(useWorkspace.getState().editingId).toBe(null);
    expect(isCardConflicted("n1")).toBe(false);
  });

  it("새로고침: DB에서 사라진 카드는 store에서 제거한다", async () => {
    useWorkspace.setState({
      cards: [{ id: "n1", kind: "text", x: 0, y: 0, width: 240, content: "x" }],
      editingId: "n1",
    });
    // DB에 노트 없음(삭제됨) 상태에서 충돌 후 해소.
    await handleIncoming({
      type: "card-delete",
      id: "n1",
      boardId: null,
      updatedAt: 700,
      origin: OTHER,
    });
    expect(isCardConflicted("n1")).toBe(true);
    await resolveConflict("n1");
    expect(useWorkspace.getState().cards.some((c) => c.id === "n1")).toBe(false);
    expect(useWorkspace.getState().editingId).toBe(null);
  });
});

describe("liveSync — 멱등 init", () => {
  it("initLiveSync는 여러 번 호출해도 한 번만 시작한다(같은 dispose)", () => {
    const d1 = initLiveSync();
    const d2 = initLiveSync();
    expect(d1).toBe(d2);
  });
});
