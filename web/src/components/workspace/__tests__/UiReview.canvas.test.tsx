import { afterEach, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useWorkspace, type Card } from "@/state/workspace";
import { I18nProvider } from "@/i18n/Provider";
import { TextboxCardContent } from "../cards/textbox/Content";

const text: Card = { id: "text", kind: "textbox", x: 100, y: 100, width: 200, content: "x".repeat(500), autoWidth: true };
afterEach(() => vi.restoreAllMocks());

it("long unbroken text wraps in edit and read mode and caps automatic measurement", () => {
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(8000);
  const measured = vi.spyOn(useWorkspace.getState(), "setTextMeasuredWidth");
  useWorkspace.setState({ cards: [text], selectedIds: [] });
  const props = { card: text, editing: true, onChange: vi.fn(), onCommitEdit: vi.fn() };
  const view = render(<I18nProvider locale="ko"><TextboxCardContent {...props} /></I18nProvider>);
  const input = screen.getByRole("textbox") as HTMLTextAreaElement;
  expect(input.value).toBe(text.content);
  expect(input.wrap).toBe("soft");
  expect(input.style.whiteSpace).toBe("pre-wrap");
  expect(input.style.overflowWrap).toBe("anywhere");
  expect(measured).toHaveBeenCalledWith(text.id, 480);
  view.rerender(<I18nProvider locale="ko"><TextboxCardContent {...props} editing={false} /></I18nProvider>);
  const display = view.container.querySelector<HTMLElement>("[data-textbox-text]")!;
  expect(display.textContent).toBe(text.content);
  expect(display.style.whiteSpace).toBe("pre-wrap");
  expect(display.style.overflowWrap).toBe("anywhere");
});

it("content overview excludes frame whitespace without changing cards", () => {
  const cards: Card[] = [
    { id: "frame", kind: "frame", x: 0, y: 0, width: 1200, height: 1200, content: "" },
    { ...text, kind: "text", width: 200, height: 200, autoWidth: undefined },
  ];
  useWorkspace.setState({ cards });
  useWorkspace.getState().fitAllCards({ width: 800, height: 600, insets: { top: 0, bottom: 0, left: 0, right: 0 }, contentOnly: true });
  expect(useWorkspace.getState().viewport).toEqual({ x: 200, y: 100, scale: 1 });
  expect(useWorkspace.getState().cards).toEqual(cards);
  useWorkspace.getState().fitAllCards({ width: 800, height: 600, insets: { top: 0, bottom: 0, left: 0, right: 0 } });
  expect(useWorkspace.getState().viewport.scale).toBe(0.5);
});

it("content overview still includes folders and falls back for a frame-only board", () => {
  const frame: Card = { id: "f", kind: "frame", x: 0, y: 0, width: 1200, height: 1200, content: "" };
  const fit = () => useWorkspace.getState().fitAllCards({ width: 600, height: 600, insets: { top: 0, bottom: 0, left: 0, right: 0 }, contentOnly: true });
  useWorkspace.setState({ cards: [frame] }); fit();
  expect(useWorkspace.getState().viewport.scale).toBe(0.5);
  useWorkspace.setState({ cards: [frame, { ...text, kind: "board", width: 200, height: 200, x: 2000, boardRef: "child" }] }); fit();
  expect(useWorkspace.getState().viewport).toEqual({ x: -1800, y: 100, scale: 1 });
});
