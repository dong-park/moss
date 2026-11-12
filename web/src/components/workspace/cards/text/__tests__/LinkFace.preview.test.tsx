import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/Provider";
import { fillLinkMemo, useLinkPreviewStatus } from "../../../linkMemo";
import { useWorkspace, type Card } from "@/state/workspace";
import { LinkFace } from "../LinkFace";
beforeEach(() => {
  useLinkPreviewStatus.setState({ byCard: {} });
  useWorkspace.setState({ cards: [{ id: "a", kind: "text", x: 0, y: 0, width: 240, content: "" } as Card] });
});
it("announces preview failure and keeps URL and exposes retry without bubbling card actions", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
  fillLinkMemo("a", "https://example.com");
  const parentAction = vi.fn();
  render(<I18nProvider locale="ko"><div onMouseDown={parentAction} onClick={parentAction} onKeyDown={parentAction}>
    <LinkFace cardId="a" face={{ t: "link", url: "https://example.com", title: "https://example.com", site: "example.com" }} />
  </div></I18nProvider>);
  expect(screen.getByRole("status").textContent).toContain("불러오는 중");
  await vi.waitFor(() => expect(screen.getByRole("status").textContent).toContain("입력한 주소는 그대로"));
  const retry = screen.getByRole("button", { name: "미리보기 다시 시도" });
  fireEvent.mouseDown(retry);
  fireEvent.keyDown(retry, { key: "Enter" });
  fireEvent.click(retry);
  expect(parentAction).not.toHaveBeenCalled();
  expect(fetch).toHaveBeenCalledTimes(2);
});
