import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Schema } from "@milkdown/prose/model";
import { EditorState } from "@milkdown/prose/state";
import { EditorView } from "@milkdown/prose/view";
import { editorViewCtx, parserCtx } from "@milkdown/core";
import { I18nProvider } from "@/i18n/Provider";
import { useToasts } from "@/state/notifications";
import { BlockMenu } from "../_shared/editor/BlockMenu";
import {
  paragraphBlock,
  buildBlockWidget,
  shouldOpenFileInNewTab,
  createBlockDecorationsPlugin,
} from "../_shared/editor/blockView";

/**
 * FEAT-sticky-redesign n4 — 메모 창 블록(링크·녹음·파일). 2단계 리뷰 P1 수정 반영.
 *
 * BlockMenu는 실제 Milkdown 인스턴스(useInstance) 위에서 동작하는데, jsdom에서
 * ProseMirror뷰를 실측정하는 건 이 저장소 전체가 피하는 패턴이다(MemoExpand.test.tsx
 * 주석 참고). 여기서는 @milkdown/react의 useInstance를 모킹해 "삽입 액션이 어떤
 * ctx.get(editorViewCtx)/parserCtx를 거쳐 어떤 위치에 삽입을 시도하는지"만 검증한다.
 * 삽입 트랜잭션 자체(기존 문단 불변·새 문단 위치·단일 스텝)는 아래 별도
 * describe에서 실제 prosemirror-model/state로 검증한다(목이 아니라 실물).
 */

let ctxState: {
  view: {
    state: {
      doc: { content: { size: number } };
      selection: { $from: { after: () => number } };
      tr: { insert: ReturnType<typeof vi.fn>; scrollIntoView: () => unknown };
    };
    dispatch: ReturnType<typeof vi.fn>;
    hasFocus: () => boolean;
  };
  parser: ReturnType<typeof vi.fn>;
};

function resetCtxState() {
  const fakeTr = {
    insert: vi.fn(() => fakeTr),
    scrollIntoView: () => fakeTr,
  };
  ctxState = {
    view: {
      state: {
        doc: { content: { size: 0 } },
        selection: { $from: { after: () => 0 } },
        tr: fakeTr,
      },
      dispatch: vi.fn(),
      hasFocus: () => false,
    },
    parser: vi.fn((md: string) => ({ content: md })),
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

  it("링크 삽입 → parser가 moss-link 블록 markdown으로 호출되고 삽입이 dispatch된다", () => {
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
    expect(ctxState.view.state.tr.insert).toHaveBeenCalled();
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

  it("이미지 용량 초과 시 토스트만 뜨고 삽입되지 않는다", async () => {
    mount();
    const input = document.querySelector('input[type="file"][accept="image/*"]') as HTMLInputElement;
    const big = new File([new Uint8Array(11 * 1024 * 1024)], "big.png", { type: "image/png" });
    Object.defineProperty(input, "files", { value: [big] });
    fireEvent.change(input);

    await waitFor(() => {
      expect(useToasts.getState().toasts.some((tt) => tt.title.includes("너무 커요"))).toBe(true);
    });
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

describe("2단계 리뷰 P1-3: 커서 위치 삽입", () => {
  it("에디터에 포커스가 있었으면 저장된 커서 위치에 삽입한다(문서 끝이 아니다)", () => {
    mount();
    ctxState.view.state.doc.content.size = 20;
    ctxState.view.state.selection.$from.after = () => 7;
    ctxState.view.hasFocus = () => true;

    openMenu(); // 트리거 pointerdown에서 커서 위치(7)를 캡처한다.
    fireEvent.click(screen.getByText("링크"));
    fireEvent.change(screen.getByPlaceholderText("URL"), {
      target: { value: "https://example.com" },
    });
    fireEvent.click(screen.getByText("추가"));

    expect(ctxState.view.state.tr.insert).toHaveBeenCalledWith(7, expect.any(String));
  });

  it("에디터에 포커스가 없었으면(커서 없음) 문서 끝에 삽입한다", () => {
    mount();
    ctxState.view.state.doc.content.size = 42;
    ctxState.view.hasFocus = () => false; // 포커스 없음 — 커서를 신뢰하지 않는다.

    openMenu();
    fireEvent.click(screen.getByText("링크"));
    fireEvent.change(screen.getByPlaceholderText("URL"), {
      target: { value: "https://example.com" },
    });
    fireEvent.click(screen.getByText("추가"));

    expect(ctxState.view.state.tr.insert).toHaveBeenCalledWith(42, expect.any(String));
  });
});

describe("2단계 리뷰 P1-1: 마이크 누수", () => {
  afterEach(() => {
    // @ts-expect-error 테스트 전용 글로벌 정리
    delete global.MediaRecorder;
  });

  it("녹음 중 컴포넌트가 언마운트되면 마이크 트랙을 정지한다", async () => {
    const stopTrack = vi.fn();
    const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] });
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia },
      configurable: true,
    });

    class FakeRecorder {
      state = "recording";
      ondataavailable: (() => void) | null = null;
      onstop: (() => void) | null = null;
      start() {}
      stop() {
        this.state = "inactive";
      }
      static isTypeSupported() {
        return false;
      }
    }
    // @ts-expect-error 테스트 전용 글로벌
    global.MediaRecorder = FakeRecorder;

    const { unmount } = mount();
    openMenu();
    fireEvent.click(screen.getByText("녹음"));
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    await Promise.resolve();
    await Promise.resolve();

    unmount();
    expect(stopTrack).toHaveBeenCalled();
  });

  it("getUserMedia 대기 중 언마운트되면 녹음을 시작하지 않는다(MediaRecorder 미생성)", async () => {
    let resolveGum!: (stream: { getTracks: () => { stop: () => void }[] }) => void;
    const gumPromise = new Promise<{ getTracks: () => { stop: () => void }[] }>((res) => {
      resolveGum = res;
    });
    const getUserMedia = vi.fn().mockReturnValue(gumPromise);
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia },
      configurable: true,
    });

    const ctorSpy = vi.fn();
    class FakeRecorder {
      constructor() {
        ctorSpy();
      }
      static isTypeSupported() {
        return false;
      }
    }
    // @ts-expect-error 테스트 전용 글로벌
    global.MediaRecorder = FakeRecorder;

    const { unmount } = mount();
    openMenu();
    fireEvent.click(screen.getByText("녹음"));
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());

    unmount(); // getUserMedia가 아직 안 풀린 상태에서 언마운트.

    const stopTrack = vi.fn();
    resolveGum({ getTracks: () => [{ stop: stopTrack }] });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(ctorSpy).not.toHaveBeenCalled();
    expect(stopTrack).toHaveBeenCalled();
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

describe("2단계 리뷰 P1-3: 커서 위치 삽입(실제 prosemirror-model/state 트랜잭션)", () => {
  it("기존 문단은 참조 그대로 유지되고, 새 문단이 커서 뒤에 단일 스텝으로 삽입된다", () => {
    const state = EditorState.create({
      schema,
      doc: schema.node("doc", null, [schema.node("paragraph", null, [schema.text("기존 문단")])]),
    });
    const existingParagraph = state.doc.child(0);
    const cursorPos = state.doc.content.size; // 문서 끝(이 문단 바로 뒤)에 커서가 있다고 가정.

    const newBlockDoc = schema.node("doc", null, [
      linkParagraph("예시", "https://example.com", "moss-link"),
    ]);
    const tr = state.tr.insert(cursorPos, newBlockDoc.content);

    // 단일 스텝 — undo 한 번으로 삽입만 사라진다(전체 재파싱·교체가 아니다).
    expect(tr.steps).toHaveLength(1);

    const next = state.apply(tr);
    // 기존 문단 노드는 바이트 단위가 아니라 객체 참조 수준으로 안 바뀌었다(더 강한 보장).
    expect(next.doc.child(0)).toBe(existingParagraph);
    expect(next.doc.childCount).toBe(2);
    expect(paragraphBlock(next.doc.child(1))).toEqual({
      type: "link",
      url: "https://example.com",
      title: "예시",
    });
  });
});

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

describe("n10 브라우저 결함2: readonly 뷰의 초기 렌더가 실제로 버튼을 숨긴다(실제 EditorView)", () => {
  it("editable:false로 마운트된 뷰는 (트랜잭션 없이도) 파일 블록에 열기 버튼을 그리지 않는다", async () => {
    const doc = schema.node("doc", null, [
      linkParagraph("보고서.pdf", "opfs://doc1.pdf", "moss-file"),
    ]);
    const state = EditorState.create({ schema, doc, plugins: [createBlockDecorationsPlugin()] });
    const dom = document.createElement("div");
    document.body.appendChild(dom);
    const view = new EditorView(dom, { state, editable: () => false });
    try {
      // ProseMirror는 view(view) 훅보다 먼저 초기 decorations를 계산한다 — 그 뒤
      // view가 붙으면서 강제 재계산이 일어나는지는 마이크로태스크 큐를 흘려봐야 한다.
      await Promise.resolve();
      await Promise.resolve();
      expect(dom.querySelector("[data-moss-file-open]")).toBeNull();
    } finally {
      view.destroy();
    }
  });

  it("editable:true로 마운트된 뷰는 파일 블록에 열기 버튼을 그린다(대조군)", async () => {
    const doc = schema.node("doc", null, [
      linkParagraph("보고서.pdf", "opfs://doc1.pdf", "moss-file"),
    ]);
    const state = EditorState.create({ schema, doc, plugins: [createBlockDecorationsPlugin()] });
    const dom = document.createElement("div");
    document.body.appendChild(dom);
    const view = new EditorView(dom, { state, editable: () => true });
    try {
      await Promise.resolve();
      await Promise.resolve();
      expect(dom.querySelector("[data-moss-file-open]")).toBeTruthy();
    } finally {
      view.destroy();
    }
  });
});

describe("2단계 리뷰 P1-2: 파일 블록 '열기'는 확장자로 새 탭/다운로드를 가른다(사용자 결정)", () => {
  it("pdf·이미지(svg 제외)·오디오·text/plain은 새 탭", () => {
    expect(shouldOpenFileInNewTab("보고서.pdf")).toBe(true);
    expect(shouldOpenFileInNewTab("사진.png")).toBe(true);
    expect(shouldOpenFileInNewTab("녹음.mp3")).toBe(true);
    expect(shouldOpenFileInNewTab("메모.txt")).toBe(true);
  });

  it("html·svg·그 외는 강제 다운로드(새 탭 아님)", () => {
    expect(shouldOpenFileInNewTab("페이지.html")).toBe(false);
    expect(shouldOpenFileInNewTab("아이콘.svg")).toBe(false);
    expect(shouldOpenFileInNewTab("압축.zip")).toBe(false);
  });
});
