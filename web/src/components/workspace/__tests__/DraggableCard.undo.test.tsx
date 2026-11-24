/**
 * cmd-z-undo n4 — DraggableCard mouseup 처리의 모든 길(T5 화면 칸, T8 편집 중 끌기).
 *
 * 길마다 셋을 단언한다: cmd+z 앞에 그 길이 쓴 결과가 문서에 있다(소속이 바뀌면 모든 카드의
 * frameId), 길이 끝난 뒤 묶음 깊이 0·captureTimeout 500, 쓴 것이 있으면 undoStack +1이고
 * cmd+z 1번에 그 길의 쓰기가 모두 돌아간다. 놓은 뒤 비동기로 끝나는 길은 commit이 끝날
 * 때까지 실제 시간 최대 2초 조건 대기한다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nProvider } from "@/i18n/Provider";
import { useWorkspace } from "@/state/workspace";
import { useStorage } from "@/state/storage";
import { DraggableCard } from "@/components/workspace/DraggableCard";
import { getOrOpenBoardDoc } from "@/state/ydoc/activeDoc";
import { readNote } from "@/state/ydoc/model";
import { getBoardUndoGroupState } from "@/state/ydoc/undo";
import {
  addMemo,
  bootBoard,
  card,
  expectGroupClosed,
  note,
  pressUndo,
  readyCheck,
  setupNavigatorStorage,
  sleep,
  teardown,
  um,
  under,
  waitFor,
  ws,
} from "./undoTestKit";

vi.mock("@/components/workspace/cards/_shared/MarkdownEditor", () => ({
  default: ({ value }: { value: string }) => <div data-testid="inline-editor">{value}</div>,
  ExpandedMarkdownEditor: (props: { value: string }) => <div>{props.value}</div>,
}));

function wrap(ui: ReactNode) {
  return render(<I18nProvider locale="ko">{ui}</I18nProvider>);
}
const root = (container: HTMLElement, id: string) =>
  container.querySelector(`[data-card-id="${id}"]`) as HTMLElement;

/** 누르고 여러 번 움직여 놓는다(화면 좌표 = 월드 좌표, scale 1). */
function dragBy(el: HTMLElement, dx: number, dy: number) {
  fireEvent.mouseDown(el, { button: 0, clientX: 0, clientY: 0 });
  for (let i = 1; i <= 5; i++) fireEvent.mouseMove(window, { clientX: (dx * i) / 5, clientY: (dy * i) / 5 });
  fireEvent.mouseUp(window, { clientX: dx, clientY: dy });
}

/** WAAPI 흉내 — onfinish를 손으로 부른다(DraggableCard.trashDrop.test.tsx 본보기). */
function fakeAnimate() {
  const anims: { onfinish: (() => void) | null; cancel: () => void }[] = [];
  const proto = HTMLElement.prototype as unknown as { animate?: unknown };
  proto.animate = () => {
    const a = { onfinish: null, cancel: () => {} };
    anims.push(a);
    return a;
  };
  return { anims, restore: () => delete proto.animate };
}

beforeEach(() => setupNavigatorStorage());
afterEach(async () => {
  await teardown();
});

/** 판 F(1200×600)와 그 밖의 메모들을 두고 준비 확인까지 마친다. */
async function boardWithFrame(memos: [number, number][]) {
  const p = await bootBoard();
  const f = ws().addFrameAt(0, 0);
  ws().resizeFrame(f, { width: 1200, height: 600 });
  const ids = memos.map(([x, y]) => addMemo(x, y));
  await readyCheck(p);
  return { p, f, ids };
}

describe("DraggableCard 놓기 길 — 묶음 1단계", () => {
  it("보통 드롭: 판 밖 A를 F 안에 놓으면 +1, 드롭 직후 frameId F, cmd+z 1번에 원래 자리·소속", async () => {
    const { f, ids } = await boardWithFrame([[1500, 1500]]);
    const [a] = ids;
    const { container } = wrap(<DraggableCard card={card(a)} />);
    dragBy(root(container, a), -1300, -1300);
    expect(note(a)).toMatchObject({ x: 200, y: 200, frameId: f });
    expectGroupClosed();
    expect(um().undoStack.length).toBe(1);
    pressUndo();
    expect(note(a)).toMatchObject({ x: 1500, y: 1500 });
    expect(note(a)?.frameId).toBeUndefined();
  });

  it("여러 장 드롭: 두 카드를 F 안에 놓으면 +1, 둘 다 frameId F, cmd+z 1번에 둘이 함께 돌아간다", async () => {
    const { f, ids } = await boardWithFrame([[1500, 1500], [1800, 1500]]);
    const [a, b] = ids;
    useWorkspace.setState({ selectedIds: [a, b] });
    const { container } = wrap(<DraggableCard card={card(a)} />);
    dragBy(root(container, a), -1300, -1300);
    expect(note(a)).toMatchObject({ x: 200, y: 200, frameId: f });
    expect(note(b)).toMatchObject({ x: 500, y: 200, frameId: f });
    expectGroupClosed();
    expect(um().undoStack.length).toBe(1);
    pressUndo();
    expect(note(a)).toMatchObject({ x: 1500, y: 1500 });
    expect(note(b)).toMatchObject({ x: 1800, y: 1500 });
    expect(note(a)?.frameId).toBeUndefined();
    expect(note(b)?.frameId).toBeUndefined();
  });

  it("판 단독 드래그: 판과 멤버가 옮겨지고 새로 들어온 카드도 소속되며, cmd+z 1번에 모두 돌아간다", async () => {
    const p = await bootBoard();
    const f = ws().addFrameAt(0, 0);
    const member = addMemo(20, 20);
    const stray = addMemo(1030, 1030);
    expect(card(member).frameId).toBe(f);
    await readyCheck(p);
    const { container } = wrap(<DraggableCard card={card(f)} />);
    dragBy(root(container, f), 1000, 1000);
    expect(note(f)).toMatchObject({ x: 1000, y: 1000 });
    expect(note(member)).toMatchObject({ x: 1020, y: 1020, frameId: f });
    expect(note(stray)).toMatchObject({ x: 1030, frameId: f });
    expectGroupClosed();
    expect(um().undoStack.length).toBe(1);
    pressUndo();
    expect(note(f)).toMatchObject({ x: 0, y: 0 });
    expect(note(member)).toMatchObject({ x: 20, y: 20, frameId: f });
    expect(note(stray)?.frameId).toBeUndefined();
  });

  it("이동 없이 놓기: 쓴 것이 없고 묶음 깊이 0·500, undoStack 0", async () => {
    const { ids } = await boardWithFrame([[1500, 1500]]);
    const [a] = ids;
    const { container } = wrap(<DraggableCard card={card(a)} />);
    fireEvent.mouseDown(root(container, a), { button: 0, clientX: 0, clientY: 0 });
    fireEvent.mouseUp(window, { clientX: 0, clientY: 0 });
    expect(note(a)).toMatchObject({ x: 1500, y: 1500 });
    expectGroupClosed();
    expect(um().undoStack.length).toBe(0);
  });

  it("다중 선택 중 클릭(이동 없음): 단일 선택으로 돌아가고 묶음 깊이 0·500, undoStack 0", async () => {
    const { ids } = await boardWithFrame([[1500, 1500], [1800, 1500]]);
    const [a, b] = ids;
    useWorkspace.setState({ selectedIds: [a, b] });
    const { container } = wrap(<DraggableCard card={card(a)} />);
    fireEvent.mouseDown(root(container, a), { button: 0, clientX: 0, clientY: 0 });
    fireEvent.mouseUp(window, { clientX: 0, clientY: 0 });
    expect(ws().selectedIds).toEqual([a]);
    expectGroupClosed();
    expect(um().undoStack.length).toBe(0);
  });

  it("휴지통 한 장(jsdom 즉시 길): 지우기 뒤 +1, cmd+z 1번에 끌기 전 자리로 돌아온다", async () => {
    const { ids } = await boardWithFrame([[1500, 1500]]);
    const [a] = ids;
    const trash = document.createElement("div");
    trash.setAttribute("data-dock-id", "trash");
    const { container } = wrap(<DraggableCard card={card(a)} />);
    under([trash]);
    dragBy(root(container, a), 40, 0);
    await waitFor(() => getBoardUndoGroupState()?.depth === 0, "휴지통 commit");
    expect(note(a)).toBeUndefined();
    expectGroupClosed();
    expect(um().undoStack.length).toBe(1);
    pressUndo();
    expect(note(a)).toMatchObject({ x: 1500, y: 1500 });
  });

  it("휴지통 두 장(가짜 animate): onfinish로 지운 뒤 +1, cmd+z 1번에 두 카드가 끌기 전 자리로 돌아온다", async () => {
    const { ids } = await boardWithFrame([[1500, 1500], [1800, 1500]]);
    const [a, b] = ids;
    useWorkspace.setState({ selectedIds: [a, b] });
    const anim = fakeAnimate();
    const trash = document.createElement("div");
    trash.setAttribute("data-dock-id", "trash");
    document.body.appendChild(trash);
    try {
      const { container } = wrap(<DraggableCard card={card(a)} />);
      under([trash]);
      dragBy(root(container, a), 40, 0);
      // 모션 중에는 묶음이 열려 있다 — 여러 장 이동 쓰기와 지우기가 한 단계로 묶인다.
      expect(getBoardUndoGroupState()?.depth).toBe(1);
      anim.anims.at(-1)!.onfinish!();
      await waitFor(() => getBoardUndoGroupState()?.depth === 0, "휴지통 commit");
      expect(note(a)).toBeUndefined();
      expect(note(b)).toBeUndefined();
      expectGroupClosed();
      expect(um().undoStack.length).toBe(1);
      pressUndo();
      expect(note(a)).toMatchObject({ x: 1500, y: 1500 });
      expect(note(b)).toMatchObject({ x: 1800, y: 1500 });
    } finally {
      anim.restore();
    }
  });

  it("내보내기(브레드크럼): 옮기기가 끝난 뒤 묶음 깊이 0·500, 카드는 Q에만 있고 기록은 그대로", async () => {
    await useStorage.getState().init();
    await ws().loadFromStorage();
    const q = await ws().createBoard("Q");
    const p = await ws().createBoard("P");
    const a = addMemo(100, 100);
    await readyCheck(p);
    const crumb = document.createElement("div");
    crumb.setAttribute("data-crumb-board-id", q);
    const { container } = wrap(<DraggableCard card={card(a)} />);
    under([crumb]);
    dragBy(root(container, a), 40, 0);
    await waitFor(() => getBoardUndoGroupState()?.depth === 0 && !note(a), "내보내기 commit");
    const qDoc = getOrOpenBoardDoc(q);
    await qDoc.whenLoaded;
    expect(readNote(qDoc.doc, a)).toBeDefined();
    expectGroupClosed();
    expect(um().undoStack.length).toBe(0);
  });

  it("함 흡수: 옮기기가 끝난 뒤 묶음 깊이 0·500, 카드는 함 보드에만 있고 기록은 그대로", async () => {
    const p = await bootBoard();
    const a = addMemo(100, 100);
    const h = ws().createSubcanvas(600, 100);
    const ref = card(h).boardRef!;
    await waitFor(async () => (await useStorage.getState().loadBoards()).some((b) => b.id === ref), "함 보드");
    await readyCheck(p);
    const funnel = document.createElement("div");
    funnel.setAttribute("data-card-id", h);
    const { container } = wrap(<DraggableCard card={card(a)} />);
    under([funnel]);
    dragBy(root(container, a), 40, 0);
    await waitFor(() => getBoardUndoGroupState()?.depth === 0 && !note(a), "흡수 commit");
    const child = getOrOpenBoardDoc(ref);
    await child.whenLoaded;
    expect(readNote(child.doc, a)).toBeDefined();
    expectGroupClosed();
    expect(um().undoStack.length).toBe(0);
  });

  it("함 흡수 거부(가짜 animate, 사이클 가드): 카드가 남아도 done을 지나 묶음 깊이 0·500", async () => {
    const p = await bootBoard();
    const h1 = ws().createSubcanvas(100, 100);
    const h2 = ws().createSubcanvas(600, 100);
    const r1 = card(h1).boardRef!;
    const r2 = card(h2).boardRef!;
    await waitFor(async () => {
      const boards = await useStorage.getState().loadBoards();
      return boards.some((b) => b.id === r1) && boards.some((b) => b.id === r2);
    }, "함 보드");
    // h2의 보드가 h1 보드의 자손이면 h1을 h2에 넣는 것은 사이클이다.
    await useStorage.getState().saveBoard({ id: r2, parentBoardId: r1 });
    useWorkspace.setState({ boards: await useStorage.getState().loadBoards() });
    await readyCheck(p);
    const anim = fakeAnimate();
    const funnelEl = document.createElement("div");
    funnelEl.setAttribute("data-card-id", h2);
    document.body.appendChild(funnelEl);
    try {
      const { container } = wrap(<DraggableCard card={card(h1)} />);
      under([funnelEl]);
      dragBy(root(container, h1), 40, 0);
      expect(getBoardUndoGroupState()?.depth).toBe(1);
      anim.anims.at(-1)!.onfinish!();
      await waitFor(() => getBoardUndoGroupState()?.depth === 0, "거부 commit");
      expect(card(h1)).toBeDefined();
      expect(note(h1)).toBeDefined();
      expectGroupClosed();
      expect(um().undoStack.length).toBe(0);
    } finally {
      anim.restore();
    }
  });

  it("T8 편집 중 그 카드 끌기: 편집을 마친 뒤 1단계, cmd+z 1번에 편집과 이동이 함께 돌아간다", async () => {
    const p = await bootBoard();
    const a = addMemo(100, 100);
    await readyCheck(p);
    ws().setEditing(a);
    ws().setTitle(a, "제목 하나");
    const { container } = wrap(<DraggableCard card={card(a)} />);
    dragBy(root(container, a), 300, 200);
    expect(note(a)).toMatchObject({ x: 400, y: 300 });
    expect(getBoardUndoGroupState()).toEqual({ depth: 1, captureTimeout: Infinity });
    await sleep(600);
    ws().setTitle(a, "제목 하나 둘");
    ws().setEditing(null);
    // 편집을 마치면 제목 입력칸 포커스도 빠진다(입력칸 포커스면 cmd+z는 캔버스에 안 간다).
    (document.activeElement as HTMLElement | null)?.blur?.();
    expectGroupClosed();
    expect(um().undoStack.length).toBe(1);
    pressUndo();
    expect(note(a)).toMatchObject({ x: 100, y: 100 });
    expect(note(a)?.title).toBeUndefined();
  });

  it("드래그 중 언마운트: 묶음 깊이 0·500으로 돌아오고 다음 동작 둘이 2단계다", async () => {
    const { ids } = await boardWithFrame([[1500, 1500], [1800, 1500]]);
    const [a, b] = ids;
    useWorkspace.setState({ selectedIds: [a, b] });
    const { container, unmount } = wrap(<DraggableCard card={card(a)} />);
    fireEvent.mouseDown(root(container, a), { button: 0, clientX: 0, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: 50, clientY: 0 });
    expect(getBoardUndoGroupState()?.depth).toBe(1);
    unmount();
    expectGroupClosed();
    // 떼어진 리스너는 늦은 mouseup에도 반응하지 않는다.
    fireEvent.mouseUp(window, { clientX: 50, clientY: 0 });
    const n0 = um().undoStack.length;
    ws().resizeCard(a, { width: 300, height: 300 });
    ws().resizeCard(b, { width: 300, height: 300 });
    expect(um().undoStack.length).toBe(n0 + 2);
  });
});
