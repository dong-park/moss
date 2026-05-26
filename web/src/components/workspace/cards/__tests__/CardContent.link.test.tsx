import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { parseLink, serializeLink } from "@/state/cardContent";
import { renderCard } from "./setupCard";

function urlInput(): HTMLInputElement {
  return screen.getByPlaceholderText("URL을 붙여넣어 주세요") as HTMLInputElement;
}
function titleInput(): HTMLInputElement {
  return screen.getByPlaceholderText("제목") as HTMLInputElement;
}
function summaryInput(): HTMLInputElement {
  return screen.getByPlaceholderText("설명") as HTMLInputElement;
}

describe("LinkCardContent · 키보드 UX", () => {
  beforeEach(() => {
    // /api/preview 요청은 통째로 mock. 응답은 빈 메타.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ url: "https://example.com" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("render — 카드 표면에 cards/v2/link.png 적용 + URL 입력 노출", () => {
    const initial = serializeLink({ url: "https://example.com" });
    const { container } = renderCard("link", initial);

    const surface = container.querySelector('[style*="cards/v2/link.png"]');
    expect(surface).not.toBeNull();
    // editing=true(default)이므로 URL input이 보인다.
    expect(urlInput()).toBeTruthy();
    expect(urlInput().value).toBe("https://example.com");
  });

  it("Enter on URL → URL commit + /api/preview fetch 호출", async () => {
    const { onChange } = renderCard("link", "");

    const url = urlInput();
    fireEvent.change(url, { target: { value: "https://moss.dev" } });
    fireEvent.keyDown(url, { key: "Enter" });

    // 1) onChange로 URL 즉시 저장
    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(parseLink(last).url).toBe("https://moss.dev");

    // 2) /api/preview fetch가 트리거됨
    await waitFor(() => {
      const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
      expect(fetchMock).toHaveBeenCalled();
      const calledWith = String(fetchMock.mock.calls[0][0]);
      expect(calledWith).toContain("/api/preview?url=");
      expect(calledWith).toContain(encodeURIComponent("https://moss.dev"));
    });
  });

  it("Tab on URL → 제목 필드로 포커스 이동", async () => {
    renderCard("link", serializeLink({ url: "https://example.com" }));

    const url = urlInput();
    act(() => url.focus());
    expect(document.activeElement).toBe(url);

    fireEvent.keyDown(url, { key: "Tab" });
    await waitFor(() => {
      expect(document.activeElement).toBe(titleInput());
    });
  });

  it("Cmd+K 어디서든 → URL 필드로 점프", async () => {
    renderCard("link", serializeLink({ url: "https://example.com" }));

    const summary = summaryInput();
    act(() => summary.focus());
    expect(document.activeElement).toBe(summary);

    fireEvent.keyDown(summary, { key: "k", metaKey: true });
    await waitFor(() => {
      expect(document.activeElement).toBe(urlInput());
    });
  });

  it("Esc → onCommitEdit 호출", () => {
    const { onCommit } = renderCard("link", serializeLink({ url: "https://example.com" }));

    fireEvent.keyDown(titleInput(), { key: "Escape" });
    expect(onCommit).toHaveBeenCalled();
  });

  it("제목 입력 → onChange 페이로드에 title 필드 포함", () => {
    const { onChange } = renderCard("link", serializeLink({ url: "https://example.com" }));

    fireEvent.change(titleInput(), { target: { value: "Moss" } });

    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    const parsed = parseLink(last);
    expect(parsed.url).toBe("https://example.com");
    expect(parsed.title).toBe("Moss");
  });
});
