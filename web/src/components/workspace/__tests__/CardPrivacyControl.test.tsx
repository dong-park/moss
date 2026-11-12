import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import { useWorkspace, type Card } from "@/state/workspace";
import { useMobileCanvas } from "../mobileCanvas";
import { CardPrivacyControl } from "../CardPrivacyControl";

const card: Card = { id: "a", kind: "text", content: "memo", width: 240, x: 10, y: 20 };
beforeEach(() => {
  useMobileCanvas.getState().close();
  useWorkspace.setState({ cards: [card], selectedIds: [card.id], editingId: null, expandedCardId: null, penMode: false });
});
afterEach(() => vi.restoreAllMocks());
const mount = () => render(<I18nProvider locale="ko"><CardPrivacyControl /></I18nProvider>);

it("opening privacy never changes AI settings; only the named checkbox does", () => {
  const toggle = vi.spyOn(useWorkspace.getState(), "toggleAIOptOut");
  mount();
  const trigger = screen.getByRole("button", { name: "개인정보 · AI 허용" });
  expect(screen.queryByRole("checkbox")).toBeNull();
  fireEvent.pointerDown(trigger); fireEvent.click(trigger);
  expect(toggle).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("checkbox", { name: "이 카드 AI 처리 제외" }));
  expect(toggle).toHaveBeenCalledExactlyOnceWith(card.id);
  expect(useWorkspace.getState().cards[0].aiOptOut).toBe(true);
});

it("Escape closes settings and returns focus without altering the card", () => {
  mount();
  const trigger = screen.getByRole("button");
  fireEvent.click(trigger);
  const input = screen.getByRole("checkbox"); input.focus();
  fireEvent.keyDown(input, { key: "Escape" });
  expect(screen.queryByRole("checkbox")).toBeNull();
  expect(document.activeElement).toBe(trigger);
  expect(useWorkspace.getState().cards[0]).toEqual(card);
});

it("Tab and Space stay native to settings and never reach canvas shortcuts", () => {
  const shortcut = vi.fn((e: KeyboardEvent) => e.preventDefault());
  window.addEventListener("keydown", shortcut);
  try {
    mount();
    const trigger = screen.getByRole("button");
    expect(fireEvent.keyDown(trigger, { key: "Tab", code: "Tab" })).toBe(true);
    expect(fireEvent.keyDown(trigger, { key: " ", code: "Space" })).toBe(true);
    expect(shortcut).not.toHaveBeenCalled();
    expect(useWorkspace.getState().selectedIds).toEqual([card.id]);
  } finally { window.removeEventListener("keydown", shortcut); }
});
