import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import { useWorkspace } from "@/state/workspace";
import { MemoExpandDialog } from "../MemoExpandDialog";
import { Dock } from "../../Dock";

beforeEach(() => {
  vi.stubGlobal("innerWidth", 390);
  vi.stubGlobal("innerHeight", 844);
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} })));
  useWorkspace.setState({
    cards: [{ id: "mobile-note", kind: "text", x: 10, y: 20, width: 240, title: "읽을 메모", content: "본문 보존" }],
    currentBoardId: "mobile-flow", selectedIds: [], editingId: null, expandedCardId: null, penMode: false,
  });
});
afterEach(() => vi.unstubAllGlobals());

function mount() {
  return render(<I18nProvider locale="ko"><MemoExpandDialog /></I18nProvider>);
}

it("opens an existing mobile memo for reading, with no editable field or keyboard focus", async () => {
  mount();
  act(() => useWorkspace.getState().setExpandedCard("mobile-note"));
  await waitFor(() => expect(document.querySelector(".ProseMirror")).toBeTruthy());
  expect(document.querySelector(".ProseMirror")?.getAttribute("contenteditable")).toBe("false");
  expect(screen.queryByRole("textbox", { name: "메모 제목" })).toBeNull();
  expect(document.activeElement?.getAttribute("contenteditable")).not.toBe("true");
  expect(screen.getByRole("button", { name: "편집" })).toBeTruthy();
});

it("enters editing explicitly and Done keeps the title and closes the detail", async () => {
  mount();
  act(() => useWorkspace.getState().setExpandedCard("mobile-note"));
  fireEvent.click(await screen.findByRole("button", { name: "편집" }));
  const title = await screen.findByRole("textbox", { name: "메모 제목" });
  fireEvent.change(title, { target: { value: " 수정한 제목 " } });
  await waitFor(() => expect(document.querySelector('.ProseMirror[contenteditable="true"]')).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "완료" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(useWorkspace.getState().cards[0]).toMatchObject({ title: "수정한 제목", content: "본문 보존" });
});

it("creates a mobile memo directly in the full editor instead of inline canvas input", () => {
  render(<I18nProvider locale="ko"><Dock /><MemoExpandDialog /></I18nProvider>);
  fireEvent.click(screen.getByRole("button", { name: "메모" }));
  const state = useWorkspace.getState();
  expect(state.expandedCardId).toBe(state.selectedIds[0]);
  expect(state.editingId).toBeNull();
  expect(screen.getByRole("button", { name: "완료" })).toBeTruthy();
});
