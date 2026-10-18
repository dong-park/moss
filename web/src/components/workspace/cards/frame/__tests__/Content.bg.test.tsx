import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import type { Card } from "@/state/workspace";
import { encodeFrameContent } from "@/state/frameContent";
import { FrameCardContent } from "../Content";

let res: { state: string; url: string | null } = { state: "ready", url: "blob:bg" };
vi.mock("../../photo/usePhotoUrl", () => ({ usePhotoUrl: () => res }));

function card(withBg: boolean): Card {
  return {
    id: "f1",
    kind: "frame",
    x: 0,
    y: 0,
    width: 320,
    height: 220,
    content: encodeFrameContent({ name: "판" }),
    ...(withBg ? { attachmentRef: "opfs://bg.png", mediaType: "image/png" } : {}),
  };
}

const view = (c: Card) =>
  render(
    <I18nProvider locale="ko">
      <FrameCardContent card={c} />
    </I18nProvider>,
  );

describe("FrameCardContent · 배경 그리기 (T5)", () => {
  it("배경 img를 이름표보다 앞(아래층)에 그리고 클릭을 막지 않는다", () => {
    res = { state: "ready", url: "blob:bg" };
    const { container } = view(card(true));
    const bg = container.querySelector("[data-frame-bg]") as HTMLElement;
    const img = bg.querySelector("img") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("blob:bg");
    expect(bg.className).toContain("pointer-events-none");
    expect(img.className).toContain("pointer-events-none");
    const label = container.querySelector('[role="button"]') as HTMLElement;
    expect(bg.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("파일이 기기에 없으면 '찾을 수 없음' 자리표시를 그린다", () => {
    res = { state: "missing", url: null };
    const { container } = view(card(true));
    expect(container.querySelector('[data-frame-bg="missing"]')).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
  });

  it("내려받는 중이면 빈 판으로 둔다", () => {
    res = { state: "pending", url: null };
    const { container } = view(card(true));
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).not.toContain("찾을 수 없");
  });

  it("배경이 없으면 아무것도 그리지 않는다", () => {
    const { container } = view(card(false));
    expect(container.querySelector("[data-frame-bg]")).toBeNull();
  });
});
