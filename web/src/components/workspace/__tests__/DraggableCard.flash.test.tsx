import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nProvider } from "@/i18n/Provider";
import { SYSTEM_BOARD_ID, useWorkspace, type Card } from "@/state/workspace";
import { DraggableCard } from "@/components/workspace/DraggableCard";

/** KS-5 D5: flashCardId인 카드에만 반짝임 오버레이가 붙는다. */
vi.mock("@/components/workspace/cards/_shared/MarkdownEditor", () => ({
  default: ({ value }: { value: string }) => (
    <textarea data-testid="inline-editor" defaultValue={value} />
  ),
  ExpandedMarkdownEditor: (props: { value: string }) => (
    <div data-testid="expanded-editor-wrap">{props.value}</div>
  ),
}));

function wrap(ui: ReactNode) {
  return render(<I18nProvider locale="ko">{ui}</I18nProvider>);
}

const root = (container: HTMLElement, id: string) =>
  container.querySelector(`[data-card-id="${id}"]`) as HTMLElement;

beforeEach(() => {
  (document as unknown as { elementsFromPoint: () => Element[] }).elementsFromPoint =
    () => [];
  useWorkspace.setState({
    cards: [],
    selectedIds: [],
    editingId: null,
    expandedCardId: null,
    draggingId: null,
    draggingMulti: false,
    currentBoardId: SYSTEM_BOARD_ID,
    viewport: { x: 0, y: 0, scale: 1 },
    heldTool: null,
    flashCardId: null,
    flashStartedAt: null,
  });
});

const textCard = (id: string): Card => ({
  id,
  kind: "text",
  x: 0,
  y: 0,
  width: 300,
  content: "안녕",
});

describe("DraggableCard · 검색 점프 반짝임", () => {
  it("flashCardId인 카드 DOM에 반짝임 클래스가 붙고 다른 카드엔 없다", () => {
    const a = textCard("a");
    const b = textCard("b");
    useWorkspace.setState({
      cards: [a, b],
      flashCardId: "a",
      flashStartedAt: 1000,
    });
    const { container } = wrap(
      <>
        <DraggableCard card={a} />
        <DraggableCard card={b} />
      </>,
    );
    expect(root(container, "a").querySelector(".moss-card-flash")).not.toBeNull();
    expect(root(container, "b").querySelector(".moss-card-flash")).toBeNull();
  });

  it("flashCardId가 비면 반짝임이 사라진다", () => {
    const a = textCard("a");
    useWorkspace.setState({ cards: [a], flashCardId: "a", flashStartedAt: 1000 });
    const { container } = wrap(<DraggableCard card={a} />);
    expect(root(container, "a").querySelector(".moss-card-flash")).not.toBeNull();

    act(() => {
      useWorkspace.setState({ flashCardId: null, flashStartedAt: null });
    });
    expect(root(container, "a").querySelector(".moss-card-flash")).toBeNull();
  });
});

describe("moss-card-flash 키프레임 (H5)", () => {
  it("끝(100%)에서 투명해져 불투명에서 뚝 끊기지 않는다", () => {
    const css = readFileSync(resolve(__dirname, "../../../app/globals.css"), "utf8");
    const block = css.match(/@keyframes moss-card-flash\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(block).not.toBe("");

    // "65%, 100% { ... }" 처럼 묶인 선택자도 100%를 가진 규칙으로 본다.
    const rules = [...block.matchAll(/([\d.%,\s]+)\{([^}]*)\}/g)];
    const end = rules.find((m) => m[1].split(",").some((k) => k.trim() === "100%"));
    expect(end).toBeDefined();
    expect(end?.[2]).toMatch(/opacity:\s*0\s*;?/);
    // 끝에서 불투명하게 남는 규칙이 100%와 묶여 있지 않다.
    expect(end?.[1].split(",").length).toBe(1);
  });
});
