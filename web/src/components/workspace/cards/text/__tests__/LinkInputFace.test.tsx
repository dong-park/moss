import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import { useWorkspace, type Card } from "@/state/workspace";
import { EMPTY_LINK_CONTENT } from "../../../linkMemo";
import { TextCardContent } from "../Content";

/* spec/card-faces.md — 빈 링크 카드는 카드 입력칸에서 주소를 받는다. */

const ID = "link-1";
const card = () => useWorkspace.getState().cards.find((c) => c.id === ID)!;

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
  useWorkspace.setState({
    cards: [{ id: ID, kind: "text", x: 0, y: 0, width: 240, height: 240, content: EMPTY_LINK_CONTENT } as Card],
  });
});

describe("LinkInputFace", () => {
  it("허용 안 되는 주소는 안내만, http 주소면 링크 블록으로 채운다", async () => {
    render(
      <I18nProvider locale="ko">
        <TextCardContent card={card()} editing onChange={() => {}} onCommitEdit={() => {}} />
      </I18nProvider>,
    );
    const input = screen.getByRole("textbox", { name: "링크" });
    fireEvent.change(input, { target: { value: "javascript:alert(1)" } });
    fireEvent.submit(input.closest("form")!);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(card().content).toBe(EMPTY_LINK_CONTENT);

    fireEvent.change(input, { target: { value: " https://example.com " } });
    fireEvent.submit(input.closest("form")!);
    expect(card().content).toContain("https://example.com");
  });
});
