import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspace, SYSTEM_BOARD_ID } from "@/state/workspace";
import { useStorage } from "@/state/storage";
import { resetDB } from "@/state/db/schema";
import { dispatchOp, type BridgeNote } from "@/state/bridge/mossBridge";

// storage 미초기화 → persistCard는 no-op. dispatchOp는 in-memory store만 검증한다.
beforeEach(() => {
  useStorage.setState({ initialized: false });
  useWorkspace.setState({
    cards: [],
    selectedIds: [],
    editingId: null,
    expandedCardId: null,
    currentBoardId: SYSTEM_BOARD_ID,
  });
});

describe("dispatchOp", () => {
  it("ping → connected + 현재 보드 id", async () => {
    const r = (await dispatchOp("ping")) as {
      connected: boolean;
      boardId: string;
      cards: number;
    };
    expect(r.connected).toBe(true);
    expect(r.boardId).toBe(SYSTEM_BOARD_ID);
    expect(r.cards).toBe(0);
  });

  it("notes.create → 카드가 store에 추가되고 id 반환", async () => {
    const r = (await dispatchOp("notes.create", { content: "안녕" })) as { id: string };
    expect(r.id).toBeTruthy();
    const cards = useWorkspace.getState().cards;
    expect(cards).toHaveLength(1);
    expect(cards[0]!.content).toBe("안녕");
    expect(cards[0]!.kind).toBe("text");
    // 프로그래매틱 생성은 편집/선택을 남기지 않는다.
    expect(useWorkspace.getState().editingId).toBeNull();
    expect(useWorkspace.getState().selectedIds).toHaveLength(0);
  });

  it("notes.create → x/y 좌표 반영, 기본값 40", async () => {
    await dispatchOp("notes.create", { content: "a", x: 100, y: 200 });
    await dispatchOp("notes.create", { content: "b" });
    const cards = useWorkspace.getState().cards;
    expect({ x: cards[0]!.x, y: cards[0]!.y }).toEqual({ x: 100, y: 200 });
    expect({ x: cards[1]!.x, y: cards[1]!.y }).toEqual({ x: 40, y: 40 });
  });

  it("notes.create kind=link → link 카드 + URL JSON content", async () => {
    const r = (await dispatchOp("notes.create", {
      content: "https://example.com",
      kind: "link",
    })) as { id: string; kind: string };
    expect(r.kind).toBe("link");
    const card = useWorkspace.getState().cards[0]!;
    expect(card.kind).toBe("link");
    expect(JSON.parse(card.content)).toMatchObject({ url: "https://example.com" });
  });

  it("notes.create kind=mindmap → mindmap 카드 + 루트 토픽", async () => {
    const r = (await dispatchOp("notes.create", {
      content: "중심 생각",
      kind: "mindmap",
    })) as { kind: string };
    expect(r.kind).toBe("mindmap");
    const card = useWorkspace.getState().cards[0]!;
    expect(card.kind).toBe("mindmap");
    expect(JSON.parse(card.content).root.text).toBe("중심 생각");
  });

  it("notes.create 미지원 kind → throw", async () => {
    await expect(dispatchOp("notes.create", { content: "x", kind: "image" })).rejects.toThrow(
      "지원하지 않는 kind",
    );
  });

  it("notes.list → BridgeNote 배열", async () => {
    await dispatchOp("notes.create", { content: "x" });
    const list = (await dispatchOp("notes.list")) as BridgeNote[];
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ content: "x", kind: "text" });
    expect(list[0]).toHaveProperty("id");
    expect(list[0]).toHaveProperty("width");
  });

  it("notes.get → id로 단건 조회, 없으면 throw", async () => {
    const { id } = (await dispatchOp("notes.create", { content: "z" })) as { id: string };
    const got = (await dispatchOp("notes.get", { id })) as BridgeNote;
    expect(got.content).toBe("z");
    await expect(dispatchOp("notes.get", { id: "nope" })).rejects.toThrow("찾을 수 없습니다");
  });

  it("notes.update → 본문 교체, 없으면 throw", async () => {
    const { id } = (await dispatchOp("notes.create", { content: "old" })) as { id: string };
    await dispatchOp("notes.update", { id, content: "new" });
    expect(useWorkspace.getState().cards[0]!.content).toBe("new");
    await expect(dispatchOp("notes.update", { id: "nope", content: "x" })).rejects.toThrow(
      "찾을 수 없습니다",
    );
  });

  it("notes.delete → 카드 제거, 없으면 throw", async () => {
    const { id } = (await dispatchOp("notes.create", { content: "bye" })) as { id: string };
    await dispatchOp("notes.delete", { id });
    expect(useWorkspace.getState().cards).toHaveLength(0);
    await expect(dispatchOp("notes.delete", { id: "nope" })).rejects.toThrow("찾을 수 없습니다");
  });

  it("알 수 없는 op → throw", async () => {
    await expect(dispatchOp("notes.frobnicate")).rejects.toThrow("알 수 없는 op");
  });

  describe("ai.preview", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("in-page fetch로 /api/preview 호출(same-origin)", async () => {
      const fetchMock = vi.fn(async () =>
        new Response(JSON.stringify({ title: "예시" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
      vi.stubGlobal("fetch", fetchMock);
      const r = (await dispatchOp("ai.preview", { url: "https://example.com" })) as {
        title: string;
      };
      expect(r.title).toBe("예시");
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/preview?url=${encodeURIComponent("https://example.com")}`,
      );
    });

    it("url 없으면 throw", async () => {
      await expect(dispatchOp("ai.preview", {})).rejects.toThrow("url이 필요");
    });

    it("non-ok 응답 → throw", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response("forbidden", { status: 403 })),
      );
      await expect(dispatchOp("ai.preview", { url: "https://x.com" })).rejects.toThrow("403");
    });
  });

  describe("boards (useWorkspace 액션 경유)", () => {
    it("boards.list → 사용자 보드 + current", async () => {
      useWorkspace.setState({
        boards: [
          { id: "b1", name: "아이디어" },
          { id: "b2", name: "초안" },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ] as any,
        currentBoardId: "b1",
      });
      const r = (await dispatchOp("boards.list")) as {
        boards: { id: string; name: string }[];
        current: string;
      };
      expect(r.boards).toEqual([
        { id: "b1", name: "아이디어" },
        { id: "b2", name: "초안" },
      ]);
      expect(r.current).toBe("b1");
    });

    it("boards.create → createBoard 호출 + id 반환", async () => {
      const createBoard = vi.fn(async () => "b-new");
      useWorkspace.setState({ createBoard });
      const r = (await dispatchOp("boards.create", { name: "새 보드" })) as { id: string };
      expect(createBoard).toHaveBeenCalledWith("새 보드");
      expect(r.id).toBe("b-new");
    });

    it("boards.rename → renameBoard 호출, 인자 검증", async () => {
      const renameBoard = vi.fn(async () => {});
      useWorkspace.setState({ renameBoard });
      await dispatchOp("boards.rename", { id: "b1", name: "바뀐 이름" });
      expect(renameBoard).toHaveBeenCalledWith("b1", "바뀐 이름");
      await expect(dispatchOp("boards.rename", { id: "b1" })).rejects.toThrow("필요");
    });

    it("boards.delete → removeBoard 호출", async () => {
      const removeBoard = vi.fn(async () => {});
      useWorkspace.setState({ removeBoard });
      await dispatchOp("boards.delete", { id: "b1" });
      expect(removeBoard).toHaveBeenCalledWith("b1");
    });

    it("boards.switch → setCurrentBoard 호출 + 현재 보드 반환", async () => {
      const setCurrentBoard = vi.fn(async (id: string) => {
        useWorkspace.setState({ currentBoardId: id });
      });
      useWorkspace.setState({ setCurrentBoard });
      const r = (await dispatchOp("boards.switch", { id: "b2" })) as { currentBoardId: string };
      expect(setCurrentBoard).toHaveBeenCalledWith("b2");
      expect(r.currentBoardId).toBe("b2");
    });
  });

  describe("connections (storage 데이터 경로)", () => {
    it("connections.list → loadConnections(noteId 필터)", async () => {
      const conn = {
        id: "x1",
        sourceNoteId: "a",
        targetNoteId: "b",
        source: "manual" as const,
        status: "active" as const,
        createdAt: 0,
      };
      const loadConnections = vi.fn(async () => [conn]);
      useStorage.setState({ loadConnections });
      const r = await dispatchOp("connections.list", { noteId: "n1" });
      expect(loadConnections).toHaveBeenCalledWith(["n1"]);
      expect(r).toEqual([conn]);
      await dispatchOp("connections.list", {});
      expect(loadConnections).toHaveBeenLastCalledWith(undefined);
    });

    it("connections.create → saveConnection(source/target), id 생성", async () => {
      const saveConnection = vi.fn(async () => {});
      useStorage.setState({ saveConnection });
      const r = (await dispatchOp("connections.create", {
        sourceNoteId: "a",
        targetNoteId: "b",
        label: "관련",
      })) as { id: string };
      expect(r.id).toMatch(/^cx-/);
      expect(saveConnection).toHaveBeenCalledWith(
        expect.objectContaining({ sourceNoteId: "a", targetNoteId: "b", label: "관련" }),
      );
      await expect(
        dispatchOp("connections.create", { sourceNoteId: "a" }),
      ).rejects.toThrow("필요");
    });

    it("connections.delete → removeConnection 호출", async () => {
      const removeConnection = vi.fn(async () => {});
      useStorage.setState({ removeConnection });
      await dispatchOp("connections.delete", { id: "x1" });
      expect(removeConnection).toHaveBeenCalledWith("x1");
    });
  });

  // 실제 fake-indexeddb로 현재 보드가 아닌 보드를 직접 타겟.
  describe("현재-보드 외 직접 타겟 (real DB)", () => {
    beforeEach(async () => {
      Object.defineProperty(navigator, "storage", {
        value: {
          persist: vi.fn(async () => true),
          persisted: vi.fn(async () => false),
          estimate: vi.fn(async () => ({ usage: 0, quota: 1000 })),
          getDirectory: vi.fn(),
        },
        configurable: true,
        writable: true,
      });
      await useStorage.getState().init();
      useWorkspace.setState({ cards: [], currentBoardId: SYSTEM_BOARD_ID });
    });
    afterEach(async () => {
      await resetDB();
      useStorage.setState({ initialized: false, settings: null, quota: null });
    });

    it("notes.create boardId → 그 보드 DB에 저장, 현재 store엔 없음", async () => {
      const r = (await dispatchOp("notes.create", {
        content: "딴 보드 카드",
        boardId: "b-other",
      })) as { id: string; boardId: string | null };
      expect(r.boardId).toBe("b-other");
      expect(useWorkspace.getState().cards).toHaveLength(0); // 현재(system) 화면 변화 없음
      const notes = await useStorage.getState().loadCards("b-other");
      expect(notes.map((n) => n.content)).toContain("딴 보드 카드");
    });

    it("notes.create kind=link + boardId → 그 보드에 link 카드 저장", async () => {
      const r = (await dispatchOp("notes.create", {
        content: "https://moss.app",
        kind: "link",
        boardId: "b-z",
      })) as { kind: string; boardId: string | null };
      expect(r.kind).toBe("link");
      const notes = await useStorage.getState().loadCards("b-z");
      expect(notes[0]!.kind).toBe("link");
      expect(JSON.parse(notes[0]!.content)).toMatchObject({ url: "https://moss.app" });
    });

    it("notes.list boardId → 그 보드만 반환, 현재 보드와 분리", async () => {
      await dispatchOp("notes.create", { content: "A", boardId: "b-x" });
      const other = (await dispatchOp("notes.list", { boardId: "b-x" })) as BridgeNote[];
      expect(other.map((n) => n.content)).toContain("A");
      const current = (await dispatchOp("notes.list")) as BridgeNote[];
      expect(current).toHaveLength(0);
    });

    it("notes.get/update/delete → id로 보드 무관 동작", async () => {
      const { id } = (await dispatchOp("notes.create", {
        content: "orig",
        boardId: "b-y",
      })) as { id: string };

      expect(((await dispatchOp("notes.get", { id })) as BridgeNote).content).toBe("orig");

      await dispatchOp("notes.update", { id, content: "changed" });
      expect(((await dispatchOp("notes.get", { id })) as BridgeNote).content).toBe("changed");

      await dispatchOp("notes.delete", { id });
      await expect(dispatchOp("notes.get", { id })).rejects.toThrow("찾을 수 없습니다");
    });

    it('boardId "system"은 현재가 사용자 보드여도 시스템 보드(null)를 타겟', async () => {
      useWorkspace.setState({ currentBoardId: "b-user" });
      await dispatchOp("notes.create", { content: "시스템행", boardId: "system" });
      const sys = await useStorage.getState().loadCards(null);
      expect(sys.map((n) => n.content)).toContain("시스템행");
    });

    it("notes.update 존재하지 않는 id → throw(junk 생성 안 함)", async () => {
      await expect(dispatchOp("notes.update", { id: "ghost", content: "x" })).rejects.toThrow(
        "찾을 수 없습니다",
      );
      const all = await useStorage.getState().loadCards(null);
      expect(all).toHaveLength(0);
    });
  });
});
