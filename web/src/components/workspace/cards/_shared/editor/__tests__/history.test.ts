import { describe, expect, it } from "vitest";
import { Editor, defaultValueCtx, editorViewCtx, rootCtx } from "@milkdown/core";
import { history, historyKeymap } from "@milkdown/plugin-history";
import { editorPlugins } from "../extensions";

/* cmd-z-undo n2 — 메모 편집기 history. jsdom은 navigator.platform이 비어 Mod=ctrl이다. */

describe("editorPlugins history 등록", () => {
  it("history 플러그인과 keymap이 실제 배열에 들어 있다", () => {
    for (const p of history) expect(editorPlugins).toContain(p);
    expect(editorPlugins).toContain(historyKeymap.ctx);
    expect(editorPlugins).toContain(historyKeymap.shortcuts);
  });
});

async function make(initial: string) {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, initial);
    })
    .use(editorPlugins)
    .create();
  const view = editor.action((ctx) => ctx.get(editorViewCtx));
  const key = (shift: boolean) =>
    view.dom.dispatchEvent(
      new KeyboardEvent("keydown", { key: shift ? "Z" : "z", keyCode: 90, ctrlKey: true, shiftKey: shift, bubbles: true, cancelable: true }),
    );
  return { editor, view, root, key };
}

describe("실제 Editor(editorPlugins)에서 되돌리기", () => {
  it("T2: ctrl+z는 친 글자를 지우고 ctrl+shift+z는 되살린다", async () => {
    const { editor, view, root, key } = await make("hello");
    try {
      view.dispatch(view.state.tr.insertText(" world", view.state.doc.content.size - 1));
      expect(view.state.doc.textContent).toBe("hello world");
      key(false);
      expect(view.state.doc.textContent).toBe("hello");
      key(true);
      expect(view.state.doc.textContent).toBe("hello world");
    } finally {
      await editor.destroy();
      root.remove();
    }
  });

  it("T3: 편집기를 연 직후 ctrl+z는 본문을 바꾸지 않는다", async () => {
    const { editor, view, root, key } = await make("hello");
    try {
      key(false);
      expect(view.state.doc.textContent).toBe("hello");
    } finally {
      await editor.destroy();
      root.remove();
    }
  });
});
