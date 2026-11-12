import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/Provider";
import { useWorkspace } from "@/state/workspace";
import { useCollab } from "@/state/collab";
import { beginSave, useSaveFeedback } from "@/state/saveFeedback";
import { SaveFeedback } from "../SaveFeedback";
afterEach(() => {
  useSaveFeedback.setState({ boards: {} });
  useCollab.setState({ boardId: null, status: "idle", error: null });
});
it("board and memo show the same state, autosave-close explanation, and accessible retry", async () => {
  useWorkspace.setState({ currentBoardId: "a" });
  let retry = () => Promise.resolve();
  const perform = vi.fn(async () => { beginSave("a", "document", retry).success(); });
  retry = perform;
  beginSave("a", "document", retry).failure();
  render(<I18nProvider locale="ko"><SaveFeedback /><SaveFeedback explainClose /></I18nProvider>);
  expect(screen.getAllByRole("status").map((el) => el.textContent)).toEqual([
    "이 기기 저장 실패 · 내용을 유지하고 있어요", "이 기기 저장 실패 · 내용을 유지하고 있어요",
  ]);
  expect(screen.getByText("자동 저장 · 닫아도 변경 유지")).toBeTruthy();
  await act(async () => fireEvent.click(screen.getAllByRole("button", { name: "저장 재시도" })[1]));
  expect(screen.getAllByText("이 기기에 저장됨")).toHaveLength(2);
});
it("connected sharing never marks pending local storage saved or claims server durability", () => {
  useWorkspace.setState({ currentBoardId: "a" });
  useCollab.setState({ boardId: "a", status: "connected", error: null });
  beginSave("a", "document", async () => {});
  render(<I18nProvider locale="ko"><SaveFeedback /></I18nProvider>);
  expect(screen.getByRole("status").textContent).toBe("이 기기에 저장 중");
  expect(screen.getByText("공유 연결됨").title).toContain("서버 저장 완료를 확인하는 신호는 제공되지 않아요");
});
