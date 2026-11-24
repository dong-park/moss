import { beforeEach, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import { useWorkspace, type Card } from "@/state/workspace";
import { EMPTY_LINK_CONTENT } from "../../../linkMemo";
import { TextCardContent } from "../Content";

vi.mock("../../../useCompactControls", () => ({ useCompactControls: () => true }));
beforeEach(() => {
  useWorkspace.setState({ cards: [{ id: "mobile-link", kind: "text", x: 0, y: 0, width: 240, content: EMPTY_LINK_CONTENT } as Card], editingId: null });
});
it("mobile empty link outside editing exposes no focusable URL field", () => {
  render(<I18nProvider locale="ko"><TextCardContent card={useWorkspace.getState().cards[0]} editing={false} onChange={() => {}} onCommitEdit={() => {}} /></I18nProvider>);
  expect(screen.queryByRole("textbox", { name: "링크" })).toBeNull();
});
