import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Schema } from "@milkdown/prose/model";
import { editorViewCtx, parserCtx, serializerCtx } from "@milkdown/core";
import { I18nProvider } from "@/i18n/Provider";
import { useToasts } from "@/state/notifications";
import { BlockMenu } from "../_shared/editor/BlockMenu";
import { paragraphBlock, buildBlockWidget } from "../_shared/editor/blockView";

/**
 * FEAT-sticky-redesign n4 — 메모 창 블록(링크·녹음·파일).
 *
 * BlockMenu는 실제 Milkdown 인스턴스(useInstance) 위에서 동작하는데, jsdom에서
 * ProseMirror뷰를 실측정하는 건 이 저장소 전체가 피하는 패턴이다(MemoExpand.test.tsx
 * 주석 참고). 여기서는 @milkdown/react의 useInstance를 모킹해 "삽입 액션이 어떤
 * ctx.get(editorViewCtx)/parserCtx/serializerCtx를 거쳐 어떤 마크다운을 만드는지"만
 * 검증한다 — view.dispatch/tr.replace는 스텁이라 실제 ProseMirror 트랜스폼을
 * 타지 않는다(Slice 생성 자체는 검증 없이 필드만 저장하므로 안전).
 *
 * 실경로 갭: 커서 위치 삽입이 아니라 "문서 끝에 새 문단으로 추가"다(구현 메모).
 * 녹음 UI의 실제 MediaRecorder 동작·마이크 접근은 여기서 모킹되며, 실제 브라우저
 * 동작은 dev 서버 수동 확인으로 대신한다(브리프 요구).
 */

let ctxState: {
  view: {
    state: { doc: unknown; tr: { replace: ReturnType<typeof vi.fn> } };
    dispatch: ReturnType<typeof vi.fn>;
  };
  serializer: ReturnType<typeof vi.fn>;
  parser: ReturnType<typeof vi.fn>;
};

function resetCtxState() {
  const fakeTr = { scrollIntoView: () => fakeTr };
  ctxState = {
    view: {
      state: { doc: { content: { size: 0 } }, tr: { replace: vi.fn(() => fakeTr) } },
      dispatch: vi.fn(),
    },
    serializer: vi.fn(() => ""),
    parser: vi.fn((md: string) => ({ content: { md } })),
  };
}

vi.mock("@milkdown/react", () => ({
  useInstance: () => [
    false,
    () => ({
      action: (fn: (ctx: { get: (slice: unknown) => unknown }) => void) =>
        fn({
          get: (slice: unknown) => {
            if (slice === editorViewCtx) return ctxState.view;
            if (slice === serializerCtx) return ctxState.serializer;
            if (slice === parserCtx) return ctxState.parser;
            throw new Error("unexpected ctx slice in test");
          },
        }),
    }),
  ],
}));

function mount() {
  return render(
    <I18nProvider locale="ko">
      <BlockMenu />
    </I18nProvider>,
  );
}

function openMenu() {
  const trigger = screen.getByLabelText("블록 추가");
  fireEvent.pointerDown(trigger, { button: 0, pointerType: "mouse" });
  fireEvent.click(trigger);
}

beforeEach(() => {
  resetCtxState();
});

afterEach(() => {
  useToasts.getState().clear();
});

describe("FEAT-sticky-redesign n4 · 블록 추가 메뉴", () => {
  it("메뉴 4항목(이미지·링크·녹음·파일)이 노출된다", () => {
    mount();
    openMenu();
    expect(screen.getByText("이미지")).toBeTruthy();
    expect(screen.getByText("링크")).toBeTruthy();
    expect(screen.getByText("녹음")).toBeTruthy();
    expect(screen.getByText("파일")).toBeTruthy();
  });

  it("링크 삽입 → 본문 마크다운에 moss-link 블록이 생긴다(countBlocks 대상)", () => {
    mount();
    openMenu();
    fireEvent.click(screen.getByText("링크"));

    fireEvent.change(screen.getByPlaceholderText("URL"), {
      target: { value: "https://example.com" },
    });
    fireEvent.click(screen.getByText("추가"));

    expect(ctxState.parser).toHaveBeenCalled();
    const inserted = ctxState.parser.mock.calls.at(-1)?.[0] as string;
    expect(inserted).toContain("moss-link");
    expect(inserted).toContain("https://example.com");
    expect(ctxState.view.dispatch).toHaveBeenCalled();
  });

  it("지원하지 않는 링크 스킴은 삽입 대신 토스트를 띄운다", () => {
    mount();
    openMenu();
    fireEvent.click(screen.getByText("링크"));

    fireEvent.change(screen.getByPlaceholderText("URL"), {
      target: { value: "javascript:alert(1)" },
    });
    fireEvent.click(screen.getByText("추가"));

    expect(ctxState.parser).not.toHaveBeenCalled();
    expect(
      useToasts.getState().toasts.some((tt) => tt.title === "지원하지 않는 링크예요."),
    ).toBe(true);
  });

  it("이미지 용량 초과 시 토스트만 뜨고 삽입되지 않는다", () => {
    mount();
    const input = document.querySelector('input[type="file"][accept="image/*"]') as HTMLInputElement;
    const big = new File([new Uint8Array(11 * 1024 * 1024)], "big.png", { type: "image/png" });
    Object.defineProperty(input, "files", { value: [big] });
    fireEvent.change(input);

    expect(
      useToasts.getState().toasts.some((tt) => tt.title.includes("너무 커요")),
    ).toBe(true);
    expect(ctxState.parser).not.toHaveBeenCalled();
  });

  it("녹음: 마이크 권한 거부 시 블록을 넣지 않고 토스트를 띄운다", async () => {
    const denied = Object.assign(new Error("denied"), { name: "NotAllowedError" });
    const getUserMedia = vi.fn().mockRejectedValue(denied);
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia },
      configurable: true,
    });

    mount();
    openMenu();
    fireEvent.click(screen.getByText("녹음"));

    await waitFor(() => {
      expect(
        useToasts.getState().toasts.some((tt) => tt.title === "마이크 권한이 필요해요"),
      ).toBe(true);
    });
    expect(ctxState.parser).not.toHaveBeenCalled();
  });
});

/* ── 문단 → 블록 판정(구조적, 실제 ProseMirror 노드) ────────────── */
const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: {
      group: "block",
      content: "inline*",
      toDOM: () => ["p", 0],
      parseDOM: [{ tag: "p" }],
    },
    text: { group: "inline" },
  },
  marks: {
    link: {
      attrs: { href: {}, title: { default: null } },
      inclusive: false,
      toDOM: (mark) => ["a", mark.attrs],
    },
  },
});

function linkParagraph(label: string, href: string, title: string) {
  return schema.node("paragraph", null, [
    schema.text(label, [schema.mark("link", { href, title })]),
  ]);
}

describe("FEAT-sticky-redesign n4 · paragraphBlock(구조 판정)", () => {
  it("moss-audio 문단을 audio 블록으로 인식한다", () => {
    const node = linkParagraph("녹음", "opfs://rec1.webm", "moss-audio");
    expect(paragraphBlock(node)).toEqual({ type: "audio", ref: "opfs:rec1.webm" });
  });

  it("moss-file 문단을 file 블록으로 인식한다", () => {
    const node = linkParagraph("보고서.pdf", "opfs://doc1.pdf", "moss-file");
    expect(paragraphBlock(node)).toEqual({
      type: "file",
      ref: "opfs:doc1.pdf",
      filename: "보고서.pdf",
    });
  });

  it("moss-link 문단을 link 블록으로 인식한다", () => {
    const node = linkParagraph("예시", "https://example.com", "moss-link");
    expect(paragraphBlock(node)).toEqual({
      type: "link",
      url: "https://example.com",
      title: "예시",
    });
  });

  it("title이 sentinel이 아닌 일반 링크는 블록이 아니다", () => {
    const node = linkParagraph("그냥 링크", "https://example.com", "");
    expect(paragraphBlock(node)).toBeNull();
  });

  it("허용 스킴이 아닌 moss-link는 블록으로 인정하지 않는다(정규형 아님)", () => {
    const node = linkParagraph("위험", "javascript:alert(1)", "moss-link");
    expect(paragraphBlock(node)).toBeNull();
  });

  it("문단에 자식이 2개 이상이면(문단 단독 아님) 블록이 아니다", () => {
    const node = schema.node("paragraph", null, [
      schema.text("앞 "),
      schema.text("녹음", [schema.mark("link", { href: "opfs://a.webm", title: "moss-audio" })]),
    ]);
    expect(paragraphBlock(node)).toBeNull();
  });
});

describe("FEAT-sticky-redesign n4 · buildBlockWidget(readonly)", () => {
  it("녹음 위젯 — 기본 모드는 재생 버튼이 있다", () => {
    const el = buildBlockWidget({ type: "audio", ref: "opfs:a.webm" }, { readonly: false });
    expect(el.querySelector("[data-moss-audio-play]")).toBeTruthy();
  });

  it("녹음 위젯 — readonly 모드는 재생 버튼이 없다(박스 높이는 동일 유지)", () => {
    const editable = buildBlockWidget({ type: "audio", ref: "opfs:a.webm" }, { readonly: false });
    const readonly = buildBlockWidget({ type: "audio", ref: "opfs:a.webm" }, { readonly: true });
    expect(readonly.querySelector("[data-moss-audio-play]")).toBeNull();
    expect(readonly.style.height).toBe(editable.style.height);
  });

  it("파일 위젯 — readonly 모드는 열기 버튼이 없다", () => {
    const el = buildBlockWidget(
      { type: "file", ref: "opfs:a.pdf", filename: "a.pdf" },
      { readonly: true },
    );
    expect(el.querySelector("[data-moss-file-open]")).toBeNull();
  });

  it("링크 위젯 — 도메인과 제목을 보여준다", () => {
    const el = buildBlockWidget(
      { type: "link", url: "https://example.com/path", title: "예시" },
      { readonly: false },
    );
    expect(el.textContent).toContain("예시");
    expect(el.textContent).toContain("example.com");
  });
});
