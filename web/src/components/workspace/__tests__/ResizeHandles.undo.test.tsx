/**
 * cmd-z-undo n4 — ResizeHandles mouseup 처리의 모든 길(T6 첫째 화면 칸).
 *
 * 길마다 셋을 단언한다: cmd+z 앞에 그 길이 쓴 결과가 문서에 있다(소속이 바뀌면 frameId),
 * 길이 끝난 뒤 묶음 깊이 0·captureTimeout 500, 쓴 것이 있으면 undoStack +1이고 cmd+z 1번에
 * 그 길의 쓰기가 모두 돌아간다.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { ResizeHandles } from "@/components/workspace/ResizeHandles";
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
  teardown,
  um,
  ws,
} from "./undoTestKit";

beforeEach(() => setupNavigatorStorage());
afterEach(async () => {
  await teardown();
});

function handle(container: HTMLElement, dir: string) {
  return container.querySelector(`[data-resize-handle="${dir}"]`) as HTMLElement;
}

/** 핸들을 누르고 n번 움직여 놓는다. */
function resizeBy(el: HTMLElement, dx: number, dy: number, n = 30) {
  fireEvent.mouseDown(el, { button: 0, clientX: 0, clientY: 0 });
  for (let i = 1; i <= n; i++) fireEvent.mouseMove(window, { clientX: (dx * i) / n, clientY: (dy * i) / n });
  fireEvent.mouseUp(window, { clientX: dx, clientY: dy });
}

describe("ResizeHandles 놓기 길 — 묶음 1단계", () => {
  it("메모 크기 조절 30번: +1, cmd+z 1번에 원래 크기", async () => {
    const p = await bootBoard();
    const a = addMemo(100, 100);
    await readyCheck(p);
    const w0 = card(a).width;
    const { container } = render(<ResizeHandles card={card(a)} measuredHeight={w0} />);
    resizeBy(handle(container, "se"), 150, 150);
    expect(note(a)?.width).toBe(w0 + 150);
    expectGroupClosed();
    expect(um().undoStack.length).toBe(1);
    pressUndo();
    expect(note(a)?.width).toBe(w0);
  });

  it("판 크기 조절로 X가 F에 들어옴: +1, cmd+z 앞 X frameId F, cmd+z 1번에 F 크기와 X 소속이 함께 돌아간다", async () => {
    const p = await bootBoard();
    const f = ws().addFrameAt(0, 0);
    const x = addMemo(500, 20);
    expect(card(x).frameId).toBeUndefined();
    await readyCheck(p);
    const { container } = render(<ResizeHandles card={card(f)} measuredHeight={220} />);
    resizeBy(handle(container, "e"), 600, 0);
    expect(note(f)?.width).toBe(920);
    expect(note(x)?.frameId).toBe(f);
    expectGroupClosed();
    expect(um().undoStack.length).toBe(1);
    pressUndo();
    expect(note(f)?.width).toBe(320);
    expect(note(x)?.frameId).toBeUndefined();
  });

  it("글상자 오른쪽 핸들(setTextWidth가 이동마다 문서에 씀): +1, cmd+z 1번에 원래 폭·자동 폭", async () => {
    const p = await bootBoard();
    const g = addMemo(100, 100, "textbox");
    await readyCheck(p);
    const w0 = card(g).width;
    const { container } = render(<ResizeHandles card={card(g)} measuredHeight={40} />);
    resizeBy(handle(container, "e"), 120, 0);
    expect(note(g)).toMatchObject({ width: w0 + 120, autoWidth: false });
    expectGroupClosed();
    expect(um().undoStack.length).toBe(1);
    pressUndo();
    expect(note(g)?.width).toBe(w0);
    expect(note(g)?.autoWidth).toBe(true);
  });

  it("글상자 왼쪽 핸들(setTextWidth + moveCard): +1, cmd+z 1번에 원래 폭", async () => {
    const p = await bootBoard();
    const g = addMemo(400, 100, "textbox");
    await readyCheck(p);
    const w0 = card(g).width;
    const { container } = render(<ResizeHandles card={card(g)} measuredHeight={40} />);
    resizeBy(handle(container, "w"), -120, 0);
    expect(note(g)?.width).toBe(w0 + 120);
    expectGroupClosed();
    expect(um().undoStack.length).toBe(1);
    pressUndo();
    expect(note(g)?.width).toBe(w0);
  });

  it("누르고 움직이지 않고 놓기: 쓴 것이 없고 묶음 깊이 0·500, undoStack 0", async () => {
    const p = await bootBoard();
    const a = addMemo(100, 100);
    await readyCheck(p);
    const { container } = render(<ResizeHandles card={card(a)} measuredHeight={100} />);
    fireEvent.mouseDown(handle(container, "se"), { button: 0, clientX: 0, clientY: 0 });
    fireEvent.mouseUp(window, { clientX: 0, clientY: 0 });
    expectGroupClosed();
    expect(um().undoStack.length).toBe(0);
  });

  it("크기 조절 중 언마운트: 묶음 깊이 0·500으로 돌아오고 다음 동작 둘이 2단계다", async () => {
    const p = await bootBoard();
    const a = addMemo(100, 100);
    const b = addMemo(600, 100);
    await readyCheck(p);
    const { container, unmount } = render(<ResizeHandles card={card(a)} measuredHeight={100} />);
    fireEvent.mouseDown(handle(container, "se"), { button: 0, clientX: 0, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: 40, clientY: 40 });
    expect(getBoardUndoGroupState()?.depth).toBe(1);
    unmount();
    expectGroupClosed();
    const n0 = um().undoStack.length;
    ws().resizeCard(a, { width: 300, height: 300 });
    ws().resizeCard(b, { width: 300, height: 300 });
    expect(um().undoStack.length).toBe(n0 + 2);
  });
});
