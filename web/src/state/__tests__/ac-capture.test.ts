/**
 * FEAT-capture spec AC-1 ~ AC-5 통합 회귀 테스트.
 * docs/specs/FEAT-capture.md §3 수용 기준에 직접 매핑.
 *
 * 단일 시나리오 테스트는 각 task 단위(workspace.test.ts, useShortcuts.test.tsx 등)에 있음.
 * 이 파일은 spec 회귀 방지 — 어느 한 곳이 깨지면 여기서 잡힌다.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CAPTURE_TOOLS,
  useWorkspace,
  type CaptureToolId,
} from "@/state/workspace";
import { useStorage } from "@/state/storage";
import { resetDB } from "@/state/db/schema";

let originalStorage: PropertyDescriptor | undefined;

beforeEach(() => {
  originalStorage = Object.getOwnPropertyDescriptor(navigator, "storage");
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
});

afterEach(async () => {
  vi.useRealTimers();
  await resetDB();
  useStorage.setState({ initialized: false, settings: null, quota: null });
  useWorkspace.setState({
    cards: [],
    selectedIds: [],
    editingId: null,
    pendingAIGate: null,
    lastToolId: "text",
  });
  if (originalStorage) {
    Object.defineProperty(navigator, "storage", originalStorage);
  }
});

describe("AC-1: 단축키 진입 — addCardAtViewportCenter", () => {
  it("addCardAtViewportCenter(text) → text 카드 + editing 활성 (2초 이내 입력 시작)", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();
    const id = useWorkspace.getState().addCardAtViewportCenter("text", {
      width: 1000,
      height: 600,
    });
    await new Promise((r) => setTimeout(r, 5));
    const state = useWorkspace.getState();
    const card = state.cards.find((c) => c.id === id);
    expect(card?.kind).toBe("text");
    expect(state.editingId).toBe(id);
  });

  it("addCardAtViewportCenter 위치 — viewport 중앙 부근에 떨어짐", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();
    // n10 결함4 수정 이후: 그 자리에 이미 카드가 있으면 비켜 놓는다(아래 별도
    // describe에서 검증) — 이 테스트는 "겹치는 게 없을 때"의 순수 중앙 좌표
    // 계산만 보므로 seed 카드를 지우고 시작한다.
    useWorkspace.setState({ cards: [] });
    const id = useWorkspace.getState().addCardAtViewportCenter("text", {
      width: 1000,
      height: 600,
    });
    await new Promise((r) => setTimeout(r, 5));
    const card = useWorkspace.getState().cards.find((c) => c.id === id);
    // text 카드 폭 240, 화면 중앙 (500, 300). card.x = 500 - 120 = 380.
    expect(card!.x).toBe(380);
    // y는 300 - 20 = 280
    expect(card!.y).toBe(280);
  });
});

describe("n10 브라우저 결함4: 독 Enter/가운데 생성이 같은 자리에 겹치지 않는다", () => {
  it("메모판 → 메모 → 파일함을 연달아 화면 가운데에 만들면 서로 겹치지 않는다", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();
    useWorkspace.setState({ cards: [] });
    const viewportSize = { width: 1000, height: 600 };
    const frameId = useWorkspace.getState().addFrameAtViewportCenter(viewportSize);
    const textId = useWorkspace.getState().addCardAtViewportCenter("text", viewportSize);
    const boardId = useWorkspace.getState().createSubcanvasAtViewportCenter(viewportSize);
    await new Promise((r) => setTimeout(r, 5));

    const cards = useWorkspace.getState().cards;
    const frame = cards.find((c) => c.id === frameId)!;
    const text = cards.find((c) => c.id === textId)!;
    const board = cards.find((c) => c.id === boardId)!;

    // frame은 배경 레이어라 겹쳐도 무방 — 메모와 파일함(둘 다 비-frame)만 서로
    // 겹치지 않으면 된다(하나를 살짝 끌면 바로 밑 카드에 흡수되던 결함4).
    const overlap =
      text.x < board.x + board.width &&
      text.x + text.width > board.x &&
      text.y < board.y + (board.height ?? board.width) &&
      text.y + (text.height ?? text.width) > board.y;
    expect(overlap).toBe(false);
    expect(frame).toBeDefined();
  });
});

describe("AC-2: 10종 type 모두 작동", () => {
  it.each(CAPTURE_TOOLS)(
    "addCardAt(%s) → 정확한 CardKind + editing 진입",
    async (tool: CaptureToolId) => {
      await useStorage.getState().init();
      await useWorkspace.getState().loadFromStorage();
      const id = useWorkspace.getState().addCardAt(tool, 0, 0);
      await new Promise((r) => setTimeout(r, 5));
      const state = useWorkspace.getState();
      const card = state.cards.find((c) => c.id === id);
      expect(card?.kind).toBe(tool);
      expect(state.editingId).toBe(id);
    },
  );
});

describe("AC-3: 미완성 허용 — 빈 카드 ESC", () => {
  it("빈 카드 생성 → setEditing(null) → 카드 유지", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();
    const id = useWorkspace.getState().addCardAt("text", 0, 0);
    await new Promise((r) => setTimeout(r, 10));

    // ESC 동작 시뮬레이션 — setEditing(null)
    useWorkspace.getState().setEditing(null);

    const card = useWorkspace.getState().cards.find((c) => c.id === id);
    expect(card).toBeDefined();
    expect(card?.content).toBe("");
    expect(useWorkspace.getState().editingId).toBeNull();
  });

  it("새로고침 후에도 빈 카드 유지 (highlight→마크다운 환원)", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();
    const id = useWorkspace.getState().addCardAt("highlight", 0, 0);
    await new Promise((r) => setTimeout(r, 10));
    useWorkspace.getState().setEditing(null);

    // 새 세션
    useStorage.setState({ initialized: false, settings: null, quota: null });
    useWorkspace.setState({
      cards: [],
      selectedIds: [],
      editingId: null,
      lastToolId: "text",
    });
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();

    const card = useWorkspace.getState().cards.find((c) => c.id === id);
    expect(card).toBeDefined();
    // FEAT-markdown-memo-pen: code/checklist/highlight는 로드 시 마크다운 text로
    // 환원된다. 빈 highlight(quote="")는 빈 인용 블록 ">"가 된다.
    expect(card?.kind).toBe("text");
    expect(card?.content).toBe(">");
  });
});

describe("AC-4: 입력 후 즉시 영속 (디바운스 후)", () => {
  it("setContent → 300ms 후 storage.saveNote 호출 (회귀 방지)", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();
    const id = useWorkspace.getState().addCardAt("text", 0, 0);
    await new Promise((r) => setTimeout(r, 10));

    const saveSpy = vi.spyOn(useStorage.getState(), "saveNote");
    vi.useFakeTimers();
    useWorkspace.getState().setContent(id, "안녕");
    expect(saveSpy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(310);
    expect(saveSpy).toHaveBeenCalled();
    expect(saveSpy.mock.calls[0][0].content).toBe("안녕");
  });
});

describe("AC-5는 useClipboardWatch.test.tsx에서 검증 (시나리오 8개)", () => {
  it("CAPTURE_TOOLS 순서 = 독 노출 순서 = 단축키 인덱스", () => {
    // FEAT-sticky-redesign: 메모는 한 종류(text)로 통합 — image·link·audio·mindmap·file은
    // 메모 안 블록이 되어 독립 캡처 도구에서 제외(6→1종).
    expect(CAPTURE_TOOLS).toEqual(["text"]);
  });
});
