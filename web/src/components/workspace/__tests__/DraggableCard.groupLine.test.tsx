import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import { useWorkspace, type Card } from "@/state/workspace";
import { DraggableCard } from "@/components/workspace/DraggableCard";

vi.mock("@/components/workspace/cards/_shared/MarkdownEditor", () => ({
  default: () => null,
  ExpandedMarkdownEditor: () => null,
}));

const frame: Card = {
  id: "f1",
  kind: "frame",
  x: 0,
  y: 0,
  width: 320,
  height: 220,
  content: '{"name":"판"}',
};

function mount(selectedIds: string[]) {
  useWorkspace.setState({ cards: [frame], selectedIds, editingId: null });
  return render(
    <I18nProvider locale="ko">
      <DraggableCard card={frame} />
    </I18nProvider>,
  );
}

describe("메모판 그룹 선 (FT-1)", () => {
  it("whiteboard.png 없이 화면 기준 1px 선과 옅은 면으로 그리고, 이름표는 판 밖 위에 둔다 (PZ-3)", () => {
    const { container } = mount([]);
    expect(container.innerHTML).not.toContain("whiteboard.png");
    const line = container.querySelector<HTMLElement>("[data-frame-line]")!;
    expect(line.style.border).toContain("calc(1px * var(--zoom-inv, 1))");
    expect(line.style.border).toContain("--color-frame-line");
    expect(line.style.background).toContain("--frame-fill");
    const label = container.querySelector<HTMLElement>("[data-frame-label]")!;
    // 판 윗변에 아랫변을 붙이고, 줌을 거슬러 키워 화면 크기를 고정한다.
    expect(label.style.bottom).toBe("100%");
    expect(label.style.transform).toBe("scale(var(--zoom-inv, 1))");
    expect(label.textContent).toBe("판");
    expect((container.firstElementChild as HTMLElement).style.overflow).toBe("visible");
  });

  it("고르면 선과 이름이 선택 파랑으로 바뀐다", () => {
    const { container } = mount(["f1"]);
    const line = container.querySelector<HTMLElement>("[data-frame-line]")!;
    expect(line.style.border).toContain("--color-accent-blue");
    const label = container.querySelector<HTMLElement>('[style*="z-index: 15"]')!;
    expect(label.style.color).toContain("--color-accent-blue");
  });
});
