import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/Provider";
import { serializeBlock } from "@/state/blocks";
import { useWorkspace, type Card } from "@/state/workspace";
import { MobileLinkEditor } from "../MobileLinkEditor";
import { useMobileCanvas } from "../mobileCanvas";

const original = serializeBlock({ type: "link", url: "https://example.com/old" });
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
  useMobileCanvas.getState().close();
  useWorkspace.setState({ cards: [{ id: "a", kind: "text", x: 0, y: 0, width: 240, content: original } as Card], currentBoardId: "links", view: "canvas", penMode: false, editingId: null });
});
function mount() {
  useMobileCanvas.getState().editLink("a");
  const operation = useMobileCanvas.getState().operation;
  if (operation.kind !== "link") throw Error("Missing editor operation");
  return render(<I18nProvider locale="ko"><MobileLinkEditor operation={operation} /></I18nProvider>);
}
it("typing and Cancel leave the original URL unchanged", () => {
  mount();
  fireEvent.change(screen.getByLabelText("링크 주소"), { target: { value: "https://example.com/draft" } });
  expect(useWorkspace.getState().cards[0].content).toBe(original);
  fireEvent.click(screen.getByText("취소"));
  expect(useWorkspace.getState().cards[0].content).toBe(original);
  expect(useMobileCanvas.getState().operation.kind).toBe("idle");
});

it("Done validates and commits the draft", () => {
  mount();
  fireEvent.change(screen.getByLabelText("링크 주소"), { target: { value: "javascript:alert(1)" } });
  fireEvent.click(screen.getByText("완료"));
  expect(screen.getByRole("alert")).toBeTruthy();
  expect(useWorkspace.getState().cards[0].content).toBe(original);
  fireEvent.change(screen.getByLabelText("링크 주소"), { target: { value: "https://example.com/new" } });
  fireEvent.click(screen.getByText("완료"));
  expect(useWorkspace.getState().cards[0].content).toContain("https://example.com/new");
  expect(useMobileCanvas.getState().operation.kind).toBe("idle");
});
it("a concurrent URL change is preserved instead of overwritten", () => {
  mount();
  const remote = serializeBlock({ type: "link", url: "https://example.com/remote" })!;
  act(() => useWorkspace.setState({ cards: [{ ...useWorkspace.getState().cards[0], content: remote }] }));
  fireEvent.change(screen.getByLabelText("링크 주소"), { target: { value: "https://example.com/local" } });
  fireEvent.click(screen.getByText("완료"));
  expect(screen.getByRole("alert").textContent).toContain("다른 곳");
  expect(useWorkspace.getState().cards[0].content).toBe(remote);
});
it("browser back discards the local draft", async () => {
  mount();
  fireEvent.change(screen.getByLabelText("링크 주소"), { target: { value: "https://example.com/draft" } });
  window.history.back();
  await waitFor(() => expect(useMobileCanvas.getState().operation.kind).toBe("idle"));
  expect(useWorkspace.getState().cards[0].content).toBe(original);
});

it("keeps eight pixels below the measured header and follows window resize", () => {
  const header = document.createElement("div");
  header.dataset.workspaceEditorHeader = "";
  let bottom = 92;
  header.getBoundingClientRect = () => ({ bottom } as DOMRect);
  document.body.appendChild(header);
  const view = mount();
  const dialog = screen.getByRole("dialog");
  expect(dialog.style.top).toBe("100px");
  bottom = 112;
  act(() => window.dispatchEvent(new Event("resize")));
  expect(dialog.style.top).toBe("120px");
  expect(dialog.style.maxHeight).toBe(`${Math.max(0, window.innerHeight - 128)}px`);
  view.unmount();
  header.remove();
});
