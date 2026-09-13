import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { useWorkspace } from "@/state/workspace";
import { parseBlock } from "@/state/blocks";
import { buildBlockWidget } from "../_shared/editor/blockView";
import { renderCard } from "./setupCard";

/**
 * FEAT-sticky-redesign n5 — 메모 앞면(첫 이미지 크게 + 나머지 배지).
 *
 * Milkdown(ProseMirror)은 jsdom에서 신뢰성이 낮아 이 저장소 전체가 실측정 마운트를
 * 피한다(MemoExpand.test.tsx·CardContent.text.test.tsx와 동일 전략). 여기서는
 * MarkdownEditor를 "줄 단위로 블록을 인식해 그리는" 최소 스텁으로 교체해 이미지·
 * 배지 배선(TextCardContent 쪽 로직)만 검증한다. buildBlockWidget 자체의 readonly
 * 렌더(재생 버튼 유무 등)는 blockView.ts 단위 테스트(MemoBlocks.test.tsx)가 이미
 * 덮는다 — 여기서는 "앞면 높이 == 창 높이"만 별도로 재확인한다.
 */
vi.mock("@/components/workspace/cards/_shared/MarkdownEditor", () => ({
  default: ({ value }: { value: string }) => {
    const lines = value.split("\n").filter((l) => l.trim() !== "");
    return (
      <div data-testid="markdown-stub">
        {lines.map((line, i) => {
          const block = parseBlock(line);
          if (block?.type === "image") {
            // eslint-disable-next-line @next/next/no-img-element
            return <img key={i} alt="" src={block.ref} />;
          }
          if (block) {
            return <div key={i} data-moss-block={block.type} />;
          }
          return <span key={i}>{line}</span>;
        })}
      </div>
    );
  },
  ExpandedMarkdownEditor: () => null,
}));

const MEMO_MD = [
  "![](opfs://img1.png)",
  "",
  "[녹음](opfs://rec1.webm \"moss-audio\")",
  "",
  "[녹음](opfs://rec2.webm \"moss-audio\")",
  "",
  '[예시](https://example.com "moss-link")',
].join("\n");

afterEach(() => {
  useWorkspace.setState({ expandedCardId: null });
});

describe("FEAT-sticky-redesign n5 · 메모 앞면", () => {
  it("이미지가 보인다", () => {
    renderCard("text", { content: MEMO_MD, editing: false });
    expect(document.querySelector("img")).toBeTruthy();
  });

  it("녹음 2개·링크 1개 배지가 뜨고, 파일 배지는 없다", () => {
    renderCard("text", { content: MEMO_MD, editing: false });
    expect(screen.getByLabelText("녹음 2개")).toBeTruthy();
    expect(screen.getByLabelText("링크 1개")).toBeTruthy();
    expect(screen.queryByLabelText(/파일 \d+개/)).toBeNull();
  });

  it("블록이 없으면 배지도 없다", () => {
    renderCard("text", { content: "그냥 본문", editing: false });
    expect(document.querySelector("[data-moss-front-badges]")).toBeNull();
  });

  it("편집 모드(editing=true)에서는 배지를 그리지 않는다", () => {
    renderCard("text", { content: MEMO_MD, editing: true });
    expect(document.querySelector("[data-moss-front-badges]")).toBeNull();
  });

  it("배지를 누르면 expandedCardId가 그 카드로 설정된다", () => {
    renderCard("text", { content: MEMO_MD, editing: false, card: { id: "c1" } });
    fireEvent.click(screen.getByLabelText("녹음 2개"));
    expect(useWorkspace.getState().expandedCardId).toBe("c1");
  });

  it("앞면 이미지를 누르면 expandedCardId가 그 카드로 설정된다", () => {
    renderCard("text", { content: MEMO_MD, editing: false, card: { id: "c1" } });
    fireEvent.click(document.querySelector("img")!);
    expect(useWorkspace.getState().expandedCardId).toBe("c1");
  });

  it("본문 일반 텍스트를 누르면 확대되지 않는다(카드 선택/드래그만)", () => {
    renderCard("text", { content: "그냥 본문", editing: false, card: { id: "c1" } });
    fireEvent.click(screen.getByText("그냥 본문"));
    expect(useWorkspace.getState().expandedCardId).toBeNull();
  });
});

describe("FEAT-sticky-redesign n5 · 블록 앞면 높이 == 창 높이(펜 좌표 1:1)", () => {
  it("녹음·파일·링크 위젯 모두 readonly(앞면)와 editable(창) 높이가 같다", () => {
    const cases = [
      { type: "audio" as const, ref: "opfs:a.webm" },
      { type: "file" as const, ref: "opfs:a.pdf", filename: "a.pdf" },
      { type: "link" as const, url: "https://example.com", title: "예시" },
    ];
    for (const block of cases) {
      const windowEl = buildBlockWidget(block, { readonly: false });
      const frontEl = buildBlockWidget(block, { readonly: true });
      expect(frontEl.style.height).toBe(windowEl.style.height);
      // 높이가 실제로 고정값(32px)이라는 것도 같이 확인 — 둘 다 "" 이 아니어야 의미 있다.
      expect(frontEl.style.height).toBe("32px");
    }
  });
});
