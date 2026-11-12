/**
 * cmd-z-undo 웨이브 3 코드 리뷰 회귀 시험 — 화면 쪽.
 *
 * - 편집 창 flush는 ProseMirror 문서로 판정한다. 치지 않고 열고 닫으면 아무것도 안 쓴다.
 * - 도크 할 일 버튼·글자 키 제목 편집은 동작 하나 = 기록 1단계다.
 * - 글상자 왼쪽 핸들의 x는 자동 측정(setFaceHeight)이 기록 밖으로 쓰지 않는다.
 * 실제 Milkdown을 jsdom에 띄운다(편집기 모킹 없음). 타이핑은 본문 글 노드를 고쳐
 * ProseMirror DOMObserver가 읽게 한다.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { act, fireEvent, render, renderHook, screen, waitFor as rtlWaitFor } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import { useWorkspace } from "@/state/workspace";
import { runEditFlush } from "@/state/editFlush";
import { updateNoteField } from "@/state/ydoc/model";
import { dispatchOp } from "@/state/bridge/mossBridge";
import { Providers } from "@/components/providers";
import MarkdownEditor from "@/components/workspace/cards/_shared/MarkdownEditor";
import { MemoExpandDialog } from "@/components/workspace/cards/MemoExpandDialog";
import { Dock } from "@/components/workspace/Dock";
import { DraggableCard } from "@/components/workspace/DraggableCard";
import { useCardFlowShortcuts } from "@/components/workspace/useCardFlowShortcuts";
import { ShortcutsBinder } from "@/components/workspace/ShortcutsBinder";
import {
  addMemo,
  bootBoard,
  doc,
  note,
  pressUndo,
  readyCheck,
  setupNavigatorStorage,
  sleep,
  teardown,
  um,
  waitFor,
  ws,
} from "./undoTestKit";

const originalRange = {
  getClientRects: Range.prototype.getClientRects,
  getBoundingClientRect: Range.prototype.getBoundingClientRect,
};

beforeEach(() => {
  setupNavigatorStorage();
  // jsdom 대역: matchMedia(Dock), Range 좌표(ProseMirror가 글 노드 변경을 읽을 때 쓴다).
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }),
  });
  const rect = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON() {} };
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => rect as DOMRect;
});
afterEach(async () => {
  Range.prototype.getClientRects = originalRange.getClientRects;
  Range.prototype.getBoundingClientRect = originalRange.getBoundingClientRect;
  await teardown();
});

/** 본문 첫 문단 글을 바꾼다 — 사람이 친 것처럼 DOM을 고친다. */
function typeInto(root: ParentNode, text: string) {
  const p = root.querySelector(".ProseMirror p")!;
  const t = p.firstChild as Text | null;
  if (t) t.data = text;
  else p.appendChild(document.createTextNode(text));
}

async function openExpanded(id: string) {
  const view = render(
    <I18nProvider locale="ko">
      <MemoExpandDialog />
    </I18nProvider>,
  );
  act(() => ws().setExpandedCard(id));
  await rtlWaitFor(() => expect(view.baseElement.querySelector(".ProseMirror")).not.toBeNull(), {
    timeout: 3000,
  });
  await act(() => sleep(400));
  return view;
}

function closeExpanded() {
  fireEvent.click(screen.getAllByRole("button", { name: "닫기" })[0]);
}

describe("편집기 flush는 문서가 바뀌었을 때만 쓴다", () => {
  const SAMPLES = ["hello", "* a\n* b", "# 제목\n본문", "line1\nline2", "a  b", "- [ ] buy milk", ""];

  it.each(SAMPLES)("치지 않고 flush하면 onChange가 안 불린다: %j", async (value) => {
    const calls: string[] = [];
    const { container } = render(
      <I18nProvider locale="ko">
        <MarkdownEditor value={value} editable onChange={(md) => calls.push(md)} />
      </I18nProvider>,
    );
    await rtlWaitFor(() => expect(container.querySelector(".ProseMirror")).not.toBeNull(), { timeout: 3000 });
    await sleep(400);
    runEditFlush();
    expect(calls).toEqual([]);
  });

  it("쳤으면 0.2초 디바운스 전 flush가 친 글을 내보내고, 다시 flush해도 또 쓰지 않는다", async () => {
    const calls: string[] = [];
    const { container } = render(
      <I18nProvider locale="ko">
        <MarkdownEditor value="hello" editable onChange={(md) => calls.push(md)} />
      </I18nProvider>,
    );
    await rtlWaitFor(() => expect(container.querySelector(".ProseMirror p")).not.toBeNull(), { timeout: 3000 });
    await sleep(300);
    typeInto(container, "hello world");
    await sleep(20);
    runEditFlush();
    expect(calls).toEqual(["hello world\n"]);
    runEditFlush();
    await sleep(300);
    expect(calls).toEqual(["hello world\n"]);
  });

  for (const content of ["hello", "- [ ] buy milk"]) {
    it(`펼친 창을 치지 않고 열고 닫으면 본문·기록·수정 시각이 그대로다: ${JSON.stringify(content)}`, async () => {
      const P = await bootBoard();
      const id = addMemo(0, 0);
      ws().setContent(id, content);
      await readyCheck(P);
      const before = note(id)!;
      await openExpanded(id);
      closeExpanded();
      await act(() => sleep(700));
      const after = note(id)!;
      expect(ws().expandedCardId).toBeNull();
      expect(after.content).toBe(content);
      expect(after.updatedAt).toBe(before.updatedAt);
      expect(um().undoStack.length).toBe(0);
    });
  }

  it("앞 동작 뒤 펼친 창을 치지 않고 닫으면 cmd+z 1번이 앞 동작을 되돌린다", async () => {
    const P = await bootBoard();
    const { id } = (await dispatchOp("notes.create", { content: "hello", x: 10, y: 10 })) as { id: string };
    await waitFor(() => note(id)?.content === "hello", "브리지 메모");
    await readyCheck(P);
    ws().setMemoColor([id], "pink");
    await sleep(600);
    expect(um().undoStack.length).toBe(1);
    const { baseElement } = await openExpanded(id);
    fireEvent.keyDown(baseElement.querySelector(".ProseMirror")!, { key: "Escape" });
    await rtlWaitFor(() => expect(ws().expandedCardId).toBeNull());
    await sleep(100);
    expect(note(id)?.content).toBe("hello");
    expect(um().undoStack.length).toBe(1);
    pressUndo();
    expect(note(id)?.color).toBeUndefined();
  });

  it("창을 열어 둔 사이 다른 탭이 고친 본문을, 치지 않고 닫아도 덮어쓰지 않는다", async () => {
    const P = await bootBoard();
    const id = addMemo(0, 0);
    ws().setContent(id, "hello");
    await readyCheck(P);
    await openExpanded(id);
    const other = new Y.Doc();
    Y.applyUpdate(other, Y.encodeStateAsUpdate(doc()));
    updateNoteField(other, id, "content", "REMOTE");
    await act(async () => {
      Y.applyUpdate(doc(), Y.encodeStateAsUpdate(other, Y.encodeStateVector(doc())), "remote-peer");
      await sleep(100);
    });
    await waitFor(() => ws().cards.find((c) => c.id === id)?.content === "REMOTE", "원격 반영");
    closeExpanded();
    await act(() => sleep(700));
    expect(ws().expandedCardId).toBeNull();
    expect(note(id)?.content).toBe("REMOTE");
  });

  it("창에서 친 마지막 0.2초 글은 바로 닫아도 남고 편집 1단계다", async () => {
    const P = await bootBoard();
    const id = addMemo(0, 0);
    ws().setContent(id, "hello");
    await readyCheck(P);
    const { baseElement } = await openExpanded(id);
    typeInto(baseElement, "hello world");
    await sleep(20);
    closeExpanded();
    await act(() => sleep(700));
    expect(note(id)?.content).toBe("hello world\n");
    expect(um().undoStack.length).toBe(1);
    pressUndo();
    expect(note(id)?.content).toBe("hello");
  });
});

describe("도크 할 일 버튼", () => {
  async function clickTodo(): Promise<string> {
    const P = await bootBoard();
    render(
      <I18nProvider locale="ko">
        <Dock />
      </I18nProvider>,
    );
    await readyCheck(P);
    fireEvent.click(screen.getByLabelText("할 일"));
    const id = ws().cards.at(-1)!.id;
    expect(note(id)?.content).toBe("- [ ] ");
    return id;
  }

  it("치지 않고 편집을 끝내면 1단계이고 cmd+z 1번에 카드가 사라진다", async () => {
    const id = await clickTodo();
    ws().setEditing(null);
    expect(um().undoStack.length).toBe(1);
    pressUndo();
    expect(note(id)).toBeUndefined();
  });

  it("항목을 적고 끝내면 생성 1단계·편집 1단계이고 첫 cmd+z는 빈 할 일을 남긴다", async () => {
    const id = await clickTodo();
    ws().setContent(id, "- [ ] milk");
    ws().setEditing(null);
    await sleep(700);
    expect(um().undoStack.length).toBe(2);
    pressUndo();
    expect(note(id)?.content).toBe("- [ ] ");
    pressUndo();
    expect(note(id)).toBeUndefined();
  });
});

describe("고른 메모에서 글자를 쳐 들어간 제목 편집", () => {
  it("빈 제목: 편집 1회는 1단계이고 첫 글자는 제목에 들어간다", async () => {
    const P = await bootBoard();
    const id = addMemo(100, 100);
    useWorkspace.setState({ selectedIds: [id] });
    await readyCheck(P);
    renderHook(() => useCardFlowShortcuts());
    fireEvent.keyDown(window, { key: "a" });
    expect(ws().editingId).toBe(id);
    expect(ws().cards.find((c) => c.id === id)?.title).toBe("a");
    ws().setTitle(id, "ab");
    ws().setTitle(id, "abc");
    ws().commitTitle(id);
    ws().setEditing(null);
    expect(note(id)?.title).toBe("abc");
    expect(um().undoStack.length).toBe(1);
    pressUndo();
    expect(note(id)?.title).toBeUndefined();
  });

  it("기존 제목: 0.7초 뒤에도 1단계이고 cmd+z 1번에 옛 제목으로 돌아간다", async () => {
    const P = await bootBoard();
    const id = addMemo(0, 0);
    ws().setTitle(id, "Old");
    ws().commitTitle(id);
    await readyCheck(P);
    renderHook(() => useCardFlowShortcuts());
    useWorkspace.setState({ selectedIds: [id] });
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    expect(ws().editingId).toBe(id);
    expect(ws().cards.find((c) => c.id === id)?.title).toBe("Olda");
    ws().setTitle(id, "Oldab");
    ws().setTitle(id, "Oldabc");
    ws().commitTitle(id);
    ws().setEditing(null);
    await sleep(700);
    expect(um().undoStack.length).toBe(1);
    pressUndo();
    expect(note(id)?.title).toBe("Old");
  });
});

describe("자동 측정은 자기 칸만 기록 밖으로 쓴다", () => {
  let restoreOffset: (() => void) | null = null;
  afterEach(() => {
    restoreOffset?.();
    restoreOffset = null;
  });

  it("글상자 왼쪽 핸들로 폭을 줄이면 cmd+z 1번에 폭과 x가 함께 돌아간다", async () => {
    const P = await bootBoard();
    const g = addMemo(400, 100, "textbox");
    ws().setContent(g, "글 ".repeat(40));
    ws().setTextWidth(g, 300);
    // 레이아웃 대역: 글상자 높이 = 글 길이 / 폭(줄 수) × 20px.
    const desc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get() {
        const w = useWorkspace.getState().cards.find((c) => c.id === g)?.width ?? 200;
        return Math.ceil(2000 / w) * 20;
      },
    });
    restoreOffset = () => {
      if (desc) Object.defineProperty(HTMLElement.prototype, "offsetHeight", desc);
      else delete (HTMLElement.prototype as unknown as { offsetHeight?: number }).offsetHeight;
    };
    useWorkspace.setState({ selectedIds: [g], editingId: null });
    // DraggableCard가 AIOptOutBadge의 Radix Tooltip을 그리므로 TooltipProvider가 필요하다
    // (canvasCapture.test의 Providers 래핑과 같은 처방). 제품 코드 변경 없음.
    const view = render(
      <I18nProvider locale="ko">
        <Providers>
          <Live id={g} />
        </Providers>
      </I18nProvider>,
    );
    await readyCheck(P);
    const x0 = note(g)!.x;
    const w0 = note(g)!.width;
    const h = view.container.querySelector('[data-resize-handle="w"]') as HTMLElement;
    fireEvent.mouseDown(h, { button: 0, clientX: 0, clientY: 0 });
    for (let i = 1; i <= 6; i++) fireEvent.mouseMove(window, { clientX: 20 * i, clientY: 0 });
    fireEvent.mouseUp(window, { clientX: 120, clientY: 0 });
    expect(note(g)!.width).toBeLessThan(w0);
    expect(note(g)!.x).toBeGreaterThan(x0);
    pressUndo();
    expect(note(g)!.width).toBe(w0);
    expect(note(g)!.x).toBe(x0);
  });
});

/** 스토어의 지금 카드로 DraggableCard를 그린다(Canvas가 하는 일). */
function Live({ id }: { id: string }) {
  const c = useWorkspace((s) => s.cards.find((x) => x.id === id));
  return c ? <DraggableCard card={c} /> : null;
}

describe("편집 모드가 없는 카드에 이어 친 제목", () => {
  // 코드 리뷰 웨이브 3 r2: 사진은 글자 키 경로를 지나도 editingId가 서지 않는다.
  it("고른 사진에 'abc'를 치면 1단계이고 cmd+z 1번에 제목이 돌아간다", async () => {
    const P = await bootBoard();
    const id = ws().addPhotoAt(100, 100, { ref: "opfs:x.png", mediaType: "image/png", naturalW: 10, naturalH: 10 });
    useWorkspace.setState({ selectedIds: [id], editingId: null });
    await readyCheck(P);
    const before = note(id)?.title;
    renderHook(() => useCardFlowShortcuts());
    for (const key of ["a", "b", "c"]) fireEvent.keyDown(window, { key });
    await sleep(600);
    expect(note(id)?.title).toBe(`${before ?? ""}abc`);
    expect(um().undoStack.length).toBe(1);
    pressUndo();
    expect(note(id)?.title ?? "").toBe(before ?? "");
  });

  // 코드 리뷰 웨이브 3 r3: 이어 치기는 열어 둔 묶음이 아니다 — 다른 동작이 그 단계에 섞이지 않는다.
  const photo = () =>
    ws().addPhotoAt(100, 100, { ref: "opfs:x.png", mediaType: "image/png", naturalW: 10, naturalH: 10 });

  it("Tab 길: 사진 제목 치기와 다음 메모 제목 편집은 2단계다", async () => {
    const P = await bootBoard();
    const p = photo();
    const q = addMemo(600, 100);
    useWorkspace.setState({ selectedIds: [p], editingId: null });
    await readyCheck(P);
    renderHook(() => useCardFlowShortcuts());
    fireEvent.keyDown(window, { key: "a" });
    fireEvent.keyDown(window, { key: "b" });
    fireEvent.keyDown(window, { key: "Tab" });
    expect(ws().selectedIds).toEqual([q]);
    fireEvent.keyDown(window, { key: "c" });
    expect(ws().editingId).toBe(q);
    ws().setTitle(q, "cd");
    ws().commitTitle(q);
    ws().setEditing(null);
    await sleep(600);
    pressUndo();
    expect(note(p)?.title).toBe("ab");
    expect(note(q)?.title).toBeUndefined();
  });

  it("Cmd+1 길: 사진 제목 치기 뒤 새 메모 만들기는 따로 1단계다", async () => {
    const P = await bootBoard();
    const p = photo();
    useWorkspace.setState({ selectedIds: [p], editingId: null });
    await readyCheck(P);
    render(<ShortcutsBinder />);
    fireEvent.keyDown(window, { key: "a" });
    fireEvent.keyDown(window, { key: "b" });
    const before = ws().cards.length;
    fireEvent.keyDown(window, { key: "1", metaKey: true });
    expect(ws().cards.length).toBe(before + 1);
    const n = ws().cards.at(-1)!.id;
    ws().setEditing(null);
    await sleep(600);
    pressUndo();
    expect(note(n)).toBeUndefined();
    expect(note(p)?.title).toBe("ab");
  });

  it("두 글자 사이에 다른 카드 쓰기가 끼면 뒷글자는 새 단계다", async () => {
    const P = await bootBoard();
    const p = photo();
    const r = addMemo(600, 100);
    useWorkspace.setState({ selectedIds: [p], editingId: null });
    await readyCheck(P);
    renderHook(() => useCardFlowShortcuts());
    fireEvent.keyDown(window, { key: "a" });
    ws().setContent(r, "끼어든 글");
    fireEvent.keyDown(window, { key: "b" });
    await sleep(600);
    expect(um().undoStack.length).toBe(3);
    pressUndo();
    expect(note(p)?.title).toBe("a");
    expect(note(r)?.content).toBe("끼어든 글");
  });

  // 코드 리뷰 웨이브 3 r4: 선택만 바꿔도 기록 단계는 안 생긴다 — 다른 카드에 갔다 오면 새 단계다.
  it("Tab으로 갔다 Shift+Tab으로 돌아와 친 글자는 새 단계다", async () => {
    const P = await bootBoard();
    const p = photo();
    addMemo(600, 100);
    useWorkspace.setState({ selectedIds: [p], editingId: null });
    await readyCheck(P);
    renderHook(() => useCardFlowShortcuts());
    fireEvent.keyDown(window, { key: "a" });
    await sleep(120);
    fireEvent.keyDown(window, { key: "Tab" });
    await sleep(120);
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(ws().selectedIds).toEqual([p]);
    fireEvent.keyDown(window, { key: "b" });
    await sleep(600);
    pressUndo();
    expect(note(p)?.title).toBe("a");
  });

  it("다른 카드를 눌렀다 사진을 다시 눌러 친 글자는 새 단계다", async () => {
    const P = await bootBoard();
    const p = photo();
    const q = addMemo(600, 100);
    useWorkspace.setState({ selectedIds: [p], editingId: null });
    await readyCheck(P);
    renderHook(() => useCardFlowShortcuts());
    fireEvent.keyDown(window, { key: "a" });
    await sleep(120);
    ws().selectOne(q);
    await sleep(120);
    ws().selectOne(p);
    fireEvent.keyDown(window, { key: "b" });
    await sleep(600);
    pressUndo();
    expect(note(p)?.title).toBe("a");
  });

  // 코드 리뷰 웨이브 3 r5: 선택 내용이 그대로면 새 배열이 와도 이어 친다.
  it("이어 치는 사이 브리지가 다른 카드를 지워도 'abc'는 1단계다", async () => {
    const P = await bootBoard();
    const p = photo();
    const r = addMemo(600, 100);
    useWorkspace.setState({ selectedIds: [p], editingId: null });
    await readyCheck(P);
    renderHook(() => useCardFlowShortcuts());
    fireEvent.keyDown(window, { key: "a" });
    fireEvent.keyDown(window, { key: "b" });
    const top = um().undoStack.at(-1);
    await dispatchOp("notes.delete", { id: r });
    expect(um().undoStack.at(-1)).toBe(top);
    expect(ws().selectedIds).toEqual([p]);
    fireEvent.keyDown(window, { key: "c" });
    expect(note(p)?.title).toBe("abc");
    await sleep(600);
    pressUndo();
    expect(note(p)?.title).toBeUndefined();
  });
});
