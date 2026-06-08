import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import { MarkdownToolbar } from "@/components/workspace/cards/_shared/MarkdownToolbar";

// Milkdown은 jsdom에서 불안정 — useInstance를 스텁(렌더만 검증, 커맨드 실행 X).
vi.mock("@milkdown/react", () => ({
  useInstance: () => [false, () => ({ action: vi.fn() })],
}));

function renderToolbar() {
  return render(
    <I18nProvider locale="ko">
      <MarkdownToolbar />
    </I18nProvider>,
  );
}

describe("MarkdownToolbar", () => {
  it("링크·이미지 버튼 + 파일 입력이 렌더된다", () => {
    const { container } = renderToolbar();
    expect(container.querySelector('[data-toolbar-btn="link"]')).not.toBeNull();
    expect(container.querySelector('[data-toolbar-btn="image"]')).not.toBeNull();
    // 이미지 버튼은 숨은 파일 입력을 트리거한다.
    expect(container.querySelector('input[type="file"][accept="image/*"]')).not.toBeNull();
  });

  it("기존 서식 버튼(굵게/H1)도 유지된다", () => {
    const { container } = renderToolbar();
    expect(container.querySelector('[data-toolbar-btn="bold"]')).not.toBeNull();
    expect(container.querySelector('[data-toolbar-btn="h1"]')).not.toBeNull();
  });
});
