import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { useWorkspace, type Card } from "@/state/workspace";
import { renderCard } from "./setupCard";

/** baseProps 밖 필드까지 쓰는 textbox 카드 한 장을 store에 심고 렌더한다. */
function seed(card: Partial<Card> = {}): Card {
  const full: Card = {
    id: "tb",
    kind: "textbox",
    x: 0,
    y: 0,
    width: 200,
    content: "본문",
    autoWidth: false,
    textSize: "m",
    ...card,
  };
  useWorkspace.setState({ cards: [full], selectedIds: [], editingId: null });
  return full;
}

afterEach(() => {
  useWorkspace.setState({ cards: [], selectedIds: [], editingId: null });
});

describe("FEAT-text-tool · TextboxCardContent", () => {
  it("편집 중 — textarea가 뜨고 타이핑이 onChange로 전달된다", () => {
    seed({ content: "안녕" });
    const onChange = vi.fn();
    renderCard("textbox", {
      content: "안녕",
      editing: true,
      onChange,
      card: { id: "tb", autoWidth: false },
    });
    const input = screen.getByLabelText("텍스트 입력") as HTMLTextAreaElement;
    expect(input.value).toBe("안녕");
    fireEvent.change(input, { target: { value: "안녕하세요" } });
    expect(onChange).toHaveBeenCalledWith("안녕하세요");
  });

  it("비편집 — 평문 텍스트로 content를 보여준다", () => {
    seed();
    renderCard("textbox", {
      content: "구역 제목",
      editing: false,
      card: { id: "tb", autoWidth: false },
    });
    expect(screen.getByText("구역 제목")).toBeTruthy();
    expect(screen.queryByLabelText("텍스트 입력")).toBeNull();
  });

  it("Esc — 내용이 있으면 onCommitEdit", () => {
    seed({ content: "메모" });
    const onCommit = vi.fn();
    renderCard("textbox", {
      content: "메모",
      editing: true,
      onCommit,
      card: { id: "tb", autoWidth: false },
    });
    fireEvent.keyDown(screen.getByLabelText("텍스트 입력"), { key: "Escape" });
    expect(onCommit).toHaveBeenCalled();
  });

  it("빈 채로 바깥을 클릭하면 휴지통 없이 삭제 (AC-6)", () => {
    seed({ content: "" });
    const onCommit = vi.fn();
    renderCard("textbox", {
      content: "",
      editing: true,
      onCommit,
      card: { id: "tb", autoWidth: false },
    });
    fireEvent.blur(screen.getByLabelText("텍스트 입력"));
    expect(onCommit).not.toHaveBeenCalled();
    expect(useWorkspace.getState().cards.find((c) => c.id === "tb")).toBeUndefined();
  });

  it("자동 폭은 scale 무관 offsetWidth로 재고 폰트 로드 후 재측정 (P1-1)", async () => {
    let offset = 200;
    const offsetSpy = vi
      .spyOn(HTMLElement.prototype, "offsetWidth", "get")
      .mockImplementation(() => offset);
    // 월드 레이어 scale이 곱해진 값 — 측정에 쓰이면 안 된다.
    const rectSpy = vi
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockReturnValue({
        width: 400,
        height: 0,
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect);
    const fontsDescriptor = Object.getOwnPropertyDescriptor(document, "fonts");
    let resolveReady: () => void = () => {};
    const ready = new Promise<void>((r) => {
      resolveReady = r;
    });
    Object.defineProperty(document, "fonts", {
      value: { ready },
      configurable: true,
    });

    try {
      seed({ id: "tb", content: "안", autoWidth: true, width: 60 });
      renderCard("textbox", {
        content: "안",
        editing: false,
        card: { id: "tb", autoWidth: true },
      });
      await act(async () => {
        await Promise.resolve();
      });
      // 400(scale 곱)이 아니라 offsetWidth 200 + 패딩 8.
      expect(useWorkspace.getState().cards[0].width).toBe(208);

      offset = 260;
      await act(async () => {
        resolveReady();
        await ready;
      });
      expect(useWorkspace.getState().cards[0].width).toBe(268);
    } finally {
      offsetSpy.mockRestore();
      rectSpy.mockRestore();
      if (fontsDescriptor) {
        Object.defineProperty(document, "fonts", fontsDescriptor);
      } else {
        delete (document as { fonts?: unknown }).fonts;
      }
    }
  });

  it("선택 시 툴바 — 크기 버튼이 setTextStyle을 부른다 (AC-5)", () => {
    seed({ textSize: "m" });
    useWorkspace.setState({ selectedIds: ["tb"] });
    renderCard("textbox", {
      content: "본문",
      editing: false,
      card: { id: "tb", autoWidth: false },
    });
    fireEvent.click(screen.getByLabelText("크게"));
    expect(useWorkspace.getState().cards[0].textSize).toBe("l");

    fireEvent.click(screen.getByLabelText("빨강"));
    expect(useWorkspace.getState().cards[0].color).toBe("#dc2626");
  });
});
