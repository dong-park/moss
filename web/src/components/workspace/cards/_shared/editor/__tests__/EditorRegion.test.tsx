import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { render, screen, cleanup } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nProvider } from "@/i18n/Provider";
import { useWorkspace } from "@/state/workspace";
import { EditorRegion } from "../EditorRegion";

/* FEAT-memo-a11y (W9) — EditorRegion a11y 보강 (AC-1~5). */

function wrap(ui: ReactNode) {
  return render(<I18nProvider locale="ko">{ui}</I18nProvider>);
}

beforeEach(() => {
  useWorkspace.setState({ penMode: false });
});
afterEach(() => cleanup());

describe("EditorRegion — role/aria (AC-1)", () => {
  it("role=textbox + aria-multiline + i18n 라벨 + 단축키 노출", () => {
    wrap(
      <EditorRegion editable>
        <div>본문</div>
      </EditorRegion>,
    );
    const box = screen.getByRole("textbox");
    expect(box.getAttribute("aria-multiline")).toBe("true");
    // 라벨 i18n (workspace.memo.editor.label)
    expect(box.getAttribute("aria-label")).toBe("메모 편집기");
    // editable이면 readonly 아님
    expect(box.getAttribute("aria-readonly")).toBe("false");
    // 레이아웃 불변 보장 — display:contents 유지
    expect((box as HTMLElement).style.display).toBe("contents");
  });

  it("editable=false면 aria-readonly=true", () => {
    wrap(
      <EditorRegion editable={false}>
        <div>본문</div>
      </EditorRegion>,
    );
    expect(screen.getByRole("textbox").getAttribute("aria-readonly")).toBe("true");
  });

  it("label prop으로 라벨 override 가능", () => {
    wrap(
      <EditorRegion editable label="제목 메모">
        <div>본문</div>
      </EditorRegion>,
    );
    expect(screen.getByRole("textbox").getAttribute("aria-label")).toBe("제목 메모");
  });
});

describe("EditorRegion — 서식 단축 노출 (AC-2)", () => {
  it("aria-keyshortcuts에 Cmd/Ctrl+B·I·E 노출", () => {
    wrap(
      <EditorRegion editable>
        <div>본문</div>
      </EditorRegion>,
    );
    const ks = screen.getByRole("textbox").getAttribute("aria-keyshortcuts") ?? "";
    expect(ks).toContain("Meta+B");
    expect(ks).toContain("Meta+I");
    expect(ks).toContain("Meta+E");
    expect(ks).toContain("Control+B");
  });
});

describe("EditorRegion — 가시 포커스 링 (AC-3)", () => {
  it("ink-blue 2px focus-visible 링 규칙을 주입한다", () => {
    wrap(
      <EditorRegion editable>
        <div>본문</div>
      </EditorRegion>,
    );
    // React 19 hoistable style — 문서 어딘가에 규칙이 존재해야 한다.
    const css = document.documentElement.innerHTML;
    expect(css).toContain(".ProseMirror:focus-visible");
    expect(css).toContain("--color-accent-blue");
  });
});

describe("EditorRegion — aria-live SR 안내 (AC-4)", () => {
  it("카드가 여러 개여도 라이브 영역(role=status)은 정확히 1개", () => {
    wrap(
      <>
        <EditorRegion editable={false}>
          <div>A</div>
        </EditorRegion>
        <EditorRegion editable={false}>
          <div>B</div>
        </EditorRegion>
        <EditorRegion editable={false}>
          <div>C</div>
        </EditorRegion>
      </>,
    );
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("펜 모드 토글이 aria-live로 안내된다", () => {
    wrap(
      <EditorRegion editable={false}>
        <div>본문</div>
      </EditorRegion>,
    );
    act(() => {
      useWorkspace.setState({ penMode: true });
    });
    expect(screen.getByRole("status").textContent).toContain("펜 모드 켜짐");
    act(() => {
      useWorkspace.setState({ penMode: false });
    });
    expect(screen.getByRole("status").textContent).toContain("펜 모드 꺼짐");
  });

  it("편집 이탈(저장 커밋)이 aria-live로 안내된다", () => {
    const { rerender } = wrap(
      <EditorRegion editable>
        <div>본문</div>
      </EditorRegion>,
    );
    rerender(
      <I18nProvider locale="ko">
        <EditorRegion editable={false}>
          <div>본문</div>
        </EditorRegion>
      </I18nProvider>,
    );
    expect(screen.getByRole("status").textContent).toContain("메모 저장됨");
  });
});
