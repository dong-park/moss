import { beforeEach, describe, expect, it } from "vitest";
import { useWorkspace, type Card } from "@/state/workspace";
import { useToasts } from "@/state/notifications";
import {
  hasMemoText,
  hasOverlayStrokes,
  isMemoEmpty,
  wasNeverFilled,
  markFilled,
  __resetEmptyTracking,
} from "@/state/emptyCleanup";
import { serializeBlocks, serializeHandwriting } from "@/state/cardContent";

/* FEAT-memo-empty-cleanup (W7) — 빈 메모 자동 정리.
 * 스토리지는 테스트에서 미초기화 상태(removeNote/persist no-op)이므로 store 레벨
 * 동작(cards 배열·토스트·never-filled 판정)만 결정적으로 검증한다. */

const STROKE = serializeHandwriting({ paths: [[{ x: 1, y: 2 }]] });

function makeTextCard(patch: Partial<Card> = {}): Card {
  return { id: "c1", kind: "text", x: 0, y: 0, width: 240, content: "", ...patch };
}

beforeEach(() => {
  __resetEmptyTracking();
  // 구독은 workspace.ts import 시 자동 시작(멱등) — 여기선 누적 상태만 비운다.
  useWorkspace.setState({
    cards: [],
    selectedIds: [],
    editingId: null,
    expandedCardId: null,
  });
  useToasts.setState({ toasts: [] });
  __resetEmptyTracking(); // 위 setState가 구독으로 남길 수 있는 흔적 제거.
});

describe("순수 판정 헬퍼", () => {
  it("hasMemoText — 공백/빈 문자열은 false, 글자는 true", () => {
    expect(hasMemoText("")).toBe(false);
    expect(hasMemoText("   \n ")).toBe(false);
    expect(hasMemoText("hi")).toBe(true);
  });

  it("hasMemoText — 레거시 블록 JSON도 정규화해 판정", () => {
    expect(hasMemoText(serializeBlocks([{ type: "text", text: "안녕" }]))).toBe(true);
    expect(hasMemoText(serializeBlocks([]))).toBe(false);
  });

  it("hasOverlayStrokes — 빈/획없음 false, 획 있으면 true", () => {
    expect(hasOverlayStrokes(undefined)).toBe(false);
    expect(hasOverlayStrokes("")).toBe(false);
    expect(hasOverlayStrokes(serializeHandwriting({ paths: [] }))).toBe(false);
    expect(hasOverlayStrokes(STROKE)).toBe(true);
  });

  it("isMemoEmpty — 본문·overlay 둘 다 비어야 빈 것", () => {
    expect(isMemoEmpty({ content: "", overlay: undefined })).toBe(true);
    expect(isMemoEmpty({ content: "x", overlay: undefined })).toBe(false);
    expect(isMemoEmpty({ content: "", overlay: STROKE })).toBe(false);
  });
});

describe("never-filled 추적(store 구독)", () => {
  it("비공백 본문이 한 번 들어오면 filled로 기록된다", () => {
    useWorkspace.setState({ cards: [makeTextCard({ id: "f1", content: "" })] });
    expect(wasNeverFilled("f1")).toBe(true);
    // 타이핑 시뮬레이션 — setContent가 cards 레퍼런스를 바꾸고 구독이 관찰.
    useWorkspace.getState().setContent("f1", "hello");
    expect(wasNeverFilled("f1")).toBe(false);
    // 이후 다시 비워도 filled 기억은 유지(AC-3 보존 근거).
    useWorkspace.getState().setContent("f1", "");
    expect(wasNeverFilled("f1")).toBe(false);
  });

  it("overlay에 획이 들어와도 filled로 기록된다", () => {
    useWorkspace.setState({ cards: [makeTextCard({ id: "f2" })] });
    useWorkspace.getState().setOverlay("f2", STROKE);
    expect(wasNeverFilled("f2")).toBe(false);
  });
});

describe("deleteCardIfEmpty", () => {
  it("AC-1 — never-filled 빈 카드는 삭제 + undo 토스트", () => {
    useWorkspace.setState({ cards: [makeTextCard({ id: "e1" })] });
    useWorkspace.getState().deleteCardIfEmpty("e1");
    expect(useWorkspace.getState().cards.find((c) => c.id === "e1")).toBeUndefined();
    const toasts = useToasts.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].title).toBe("빈 메모 삭제됨");
    expect(toasts[0].action?.label).toBe("실행취소");
  });

  it("AC-2 — overlay(펜 그림) 있으면 보존", () => {
    useWorkspace.setState({ cards: [makeTextCard({ id: "e2", overlay: STROKE })] });
    useWorkspace.getState().deleteCardIfEmpty("e2");
    expect(useWorkspace.getState().cards.find((c) => c.id === "e2")).toBeDefined();
    expect(useToasts.getState().toasts).toHaveLength(0);
  });

  it("AC-3 — 내용을 지운(once-filled) 카드는 보존", () => {
    markFilled("e3"); // 과거에 내용이 있었음.
    useWorkspace.setState({ cards: [makeTextCard({ id: "e3", content: "" })] });
    useWorkspace.getState().deleteCardIfEmpty("e3");
    expect(useWorkspace.getState().cards.find((c) => c.id === "e3")).toBeDefined();
    expect(useToasts.getState().toasts).toHaveLength(0);
  });

  it("AC-4 — undo 토스트 액션이 카드를 복원", () => {
    const card = makeTextCard({ id: "e4" });
    useWorkspace.setState({ cards: [card] });
    useWorkspace.getState().deleteCardIfEmpty("e4");
    expect(useWorkspace.getState().cards.find((c) => c.id === "e4")).toBeUndefined();

    const toast = useToasts.getState().toasts[0];
    void toast.action?.onClick();
    expect(useWorkspace.getState().cards.find((c) => c.id === "e4")).toBeDefined();
    // 복원 후엔 filled로 표시되어 같은 카드가 즉시 재삭제되지 않는다.
    expect(wasNeverFilled("e4")).toBe(false);
  });

  it("text가 아닌 카드는 no-op", () => {
    useWorkspace.setState({ cards: [makeTextCard({ id: "e5", kind: "image" })] });
    useWorkspace.getState().deleteCardIfEmpty("e5");
    expect(useWorkspace.getState().cards.find((c) => c.id === "e5")).toBeDefined();
  });

  it("존재하지 않는 id는 no-op", () => {
    useWorkspace.getState().deleteCardIfEmpty("nope");
    expect(useToasts.getState().toasts).toHaveLength(0);
  });
});
