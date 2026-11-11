import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MilkdownProvider, useInstance } from "@milkdown/react";
import { I18nProvider } from "@/i18n/Provider";
import { ExpandedMarkdownEditor } from "../MarkdownEditor";
import { editorViewCtx } from "@milkdown/core";
import { runEditFlush } from "@/state/editFlush";
import { act } from "@testing-library/react";
import { MemoTitleRow } from "../MemoTitleRow";

// Real Milkdown/contenteditable: do not replace the editor with a textarea.
function mount(canonical: boolean) {
  const onChange = vi.fn();
  let instance: ReturnType<typeof useInstance>[1];
  function Probe() { const [, get] = useInstance(); instance = get; return null; }
  const result = render(<I18nProvider locale="ko"><MilkdownProvider>
    <ExpandedMarkdownEditor value={"- [ ] " + "longword".repeat(60)} onChange={onChange}
      canonical={canonical} titleSlot={<MemoTitleRow editable title={"title".repeat(80)} />} /><Probe />
  </MilkdownProvider></I18nProvider>);
  return { ...result, onChange, getEditor: () => instance() };
}

describe("mobile memo layout policy", () => {
  it("marks ink-free notes for reflow without replacing their editable document", async () => {
    const { container, rerender, onChange } = mount(false);
    await waitFor(() => expect(container.querySelector('[contenteditable=true]')).toBeTruthy());
    const editor = container.querySelector('[contenteditable=true]');
    expect(container.querySelector('[data-memo-layout]')?.getAttribute('data-memo-layout')).toBe('reflow');
    rerender(<I18nProvider locale="ko"><MilkdownProvider><ExpandedMarkdownEditor value="ignored external value" onChange={onChange} canonical /></MilkdownProvider></I18nProvider>);
    expect(container.querySelector('[contenteditable=true]')).toBe(editor);
    expect(editor?.textContent).toContain('longword');
    expect(container.querySelector('[data-memo-layout]')?.getAttribute('data-memo-layout')).toBe('canonical');
  });

  it("flushes real contenteditable edits and retains undo after changing layout", async () => {
    const { container, getEditor, onChange, rerender } = mount(false);
    await waitFor(() => expect(container.querySelector('[contenteditable=true]')).toBeTruthy());
    const editor = getEditor();
    act(() => editor!.action(ctx => {
      const view = ctx.get(editorViewCtx);
      view.dispatch(view.state.tr.insertText("saved input", 1));
    }));
    act(() => runEditFlush());
    expect(onChange.mock.lastCall?.[0]).toContain('saved input');
    rerender(<I18nProvider locale="ko"><MilkdownProvider><ExpandedMarkdownEditor value="external" onChange={onChange} canonical /></MilkdownProvider></I18nProvider>);
    const editable = container.querySelector('[contenteditable=true]')!;
    editor!.action(ctx => ctx.get(editorViewCtx).setProps({
      // jsdom cannot calculate Range geometry. Only suppress scrolling; the
      // actual keyboard command and history transaction still run.
      handleScrollToSelection: () => true,
    }));
    fireEvent.keyDown(editable, { key: 'z', keyCode: 90, ctrlKey: true });
    expect(editable.textContent).not.toContain('saved input');
  });

  it.each([360, 390, 430])("fits canonical ink at %ipx and offers explicit reversible 100 percent view", async (width) => {
    vi.stubGlobal('ResizeObserver', class {
      observe(target: Element) { this.callback([{ contentRect: { width: width - 40 }, target }]); }
      disconnect() {}
      constructor(private callback: (entries: unknown[]) => void) {}
    });
    const { container } = mount(true);
    const body = container.querySelector('[data-memo-body-column]') as HTMLElement;
    expect(body.style.width).toBe('720px');
    const surface = container.querySelector('[data-memo-layout]') as HTMLElement;
    expect(Number(surface.style.getPropertyValue('--memo-fit-scale'))).toBeCloseTo((width - 40) / 720);
    fireEvent.click(screen.getByRole('button', { name: '100%' }));
    expect(surface.getAttribute('data-memo-full-size')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: /%/ }));
    expect(surface.getAttribute('data-memo-full-size')).toBe('false');
    await waitFor(() => expect(body.querySelector('[contenteditable=true]')).toBeTruthy());
    vi.unstubAllGlobals();
  });
});
