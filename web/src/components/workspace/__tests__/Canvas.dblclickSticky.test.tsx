import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import { Canvas } from "@/components/workspace/Canvas";
import { SYSTEM_BOARD_ID, useWorkspace } from "@/state/workspace";
import { useStorage } from "@/state/storage";
import { resetDB } from "@/state/db/schema";
import { flushAll } from "@/state/cardPersist";
import { resetCollabStore } from "@/state/collab";

// FEAT-first-wall n4 — 빈 벽 두 번 누르기 → 그 자리에 포스트잇(T4·T6, D6=B, D7=A).
// 실제 Canvas 이벤트 핸들러와 스토어 addCardAt·영속 경로를 탄다.

let originalStorage: PropertyDescriptor | undefined;

beforeEach(async () => {
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
  resetCollabStore();
  await useStorage.getState().init();
  await useWorkspace.getState().loadFromStorage();
  useWorkspace.setState({
    cards: [],
    selectedIds: [],
    editingId: null,
    heldTool: null,
    textPlacementArmed: false,
    viewport: { x: 20, y: 10, scale: 2 },
  });
});

afterEach(async () => {
  await new Promise((r) => setTimeout(r, 20));
  await flushAll().catch(() => undefined);
  await resetDB();
  resetCollabStore();
  useStorage.setState({ initialized: false, settings: null, quota: null });
  useWorkspace.setState({
    cards: [],
    selectedIds: [],
    editingId: null,
    heldTool: null,
    textPlacementArmed: false,
    boards: [],
    currentBoardId: SYSTEM_BOARD_ID,
    viewportByBoard: {},
    viewport: { x: 0, y: 0, scale: 1 },
  });
  if (originalStorage) Object.defineProperty(navigator, "storage", originalStorage);
});

async function mountCanvas() {
  const utils = render(
    <I18nProvider locale="ko">
      <Canvas />
    </I18nProvider>,
  );
  await act(async () => {
    await Promise.resolve();
  });
  const root = utils.container.querySelector<HTMLElement>('[data-canvas-root="true"]');
  expect(root).toBeTruthy();
  return { ...utils, root: root! };
}

describe("FEAT-first-wall n4: 빈 곳 두 번 누르기 → 포스트잇", () => {
  it("빈 바탕을 두 번 누르면 누른 점의 월드 좌표에 편집 상태 노랑 포스트잇이 1장 생긴다 (T4)", async () => {
    const { root } = await mountCanvas();

    fireEvent.doubleClick(root, { clientX: 140, clientY: 90 });

    const s = useWorkspace.getState();
    expect(s.cards).toHaveLength(1);
    const card = s.cards[0];
    expect(card.kind).toBe("text");
    // viewport {x:20, y:10, scale:2} → ((140-20)/2, (90-10)/2)
    expect(card.x).toBe(60);
    expect(card.y).toBe(40);
    expect(s.editingId).toBe(card.id);
    // 색은 저장하지 않는다 — 빈 값이 기본 노랑이다.
    expect(card.color).toBeUndefined();
    expect(card.content).toBe("");
  });

  it("카드 위를 두 번 누르면 카드 수가 바뀌지 않는다", async () => {
    const { root } = await mountCanvas();
    // 캔버스 안의 비-바탕 요소(카드·UI)와 같은 조건 — target이 바탕이 아니다.
    const child = document.createElement("div");
    child.setAttribute("data-card-id", "c-existing");
    root.appendChild(child);

    fireEvent.doubleClick(child, { clientX: 140, clientY: 90 });

    expect(useWorkspace.getState().cards).toHaveLength(0);
  });

  it("실제 카드 요소를 두 번 눌러도 새 포스트잇은 생기지 않는다", async () => {
    useWorkspace.getState().addCardAt("text", 0, 0);
    const { root } = await mountCanvas();
    const before = useWorkspace.getState().cards.length;
    const cardEl = root.querySelector<HTMLElement>("[data-card-id]");
    expect(cardEl).toBeTruthy();

    fireEvent.doubleClick(cardEl!, { clientX: 30, clientY: 30 });

    expect(useWorkspace.getState().cards).toHaveLength(before);
  });

  it("마카를 든 채 두 번 누르면 포스트잇이 생기지 않는다 (D7)", async () => {
    useWorkspace.setState({ heldTool: { kind: "marker", color: "blue" } });
    const { root } = await mountCanvas();

    fireEvent.doubleClick(root, { clientX: 140, clientY: 90 });

    expect(useWorkspace.getState().cards).toHaveLength(0);
  });

  it("T 배치 직후의 두 번 누르기는 포스트잇을 또 만들지 않는다", async () => {
    useWorkspace.getState().armTextPlacement();
    const { root } = await mountCanvas();

    fireEvent.mouseDown(root, { button: 0, clientX: 140, clientY: 90 });
    expect(useWorkspace.getState().cards.map((c) => c.kind)).toEqual(["textbox"]);
    fireEvent.doubleClick(root, { clientX: 140, clientY: 90 });

    expect(useWorkspace.getState().cards.map((c) => c.kind)).toEqual(["textbox"]);
  });

  it("빈 채로 떠나도 다시 불러온 벽에 그 포스트잇이 남는다 (T6, D6)", async () => {
    const { root } = await mountCanvas();
    fireEvent.doubleClick(root, { clientX: 140, clientY: 90 });
    const id = useWorkspace.getState().cards[0].id;

    // 아무것도 안 쓰고 편집을 끝낸다.
    act(() => {
      useWorkspace.getState().setEditing(null);
    });
    await new Promise((r) => setTimeout(r, 20));
    await flushAll();

    // 메모리 상태를 비우고 저장소에서 다시 불러온다.
    useWorkspace.setState({ cards: [], selectedIds: [], editingId: null });
    await useWorkspace.getState().loadFromStorage();

    const loaded = useWorkspace.getState().cards.find((c) => c.id === id);
    expect(loaded).toBeTruthy();
    expect(loaded?.kind).toBe("text");
    expect(loaded?.content).toBe("");
  });
});
