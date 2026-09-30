import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import type { Card } from "@/state/workspace";

/* ─────────────────────────────────────────────────────────────
 * FEAT-photo-card — 사진 카드 렌더(C).
 * resolveAttachment만 모킹해 ready/pending/missing과 캡션 입력칸 동작을 본다.
 * ───────────────────────────────────────────────────────────── */

const resolveAttachment = vi.fn();
const onFilesMapChange = vi.fn(() => () => {});

vi.mock("@/state/share/attachments", () => ({
  resolveAttachment: (...args: unknown[]) => resolveAttachment(...args),
  onFilesMapChange: (...args: unknown[]) => onFilesMapChange(...args),
}));

// eslint-disable-next-line import/first
import { PhotoCardContent, normalizeCaption } from "../photo/Content";

function photoCard(over: Partial<Card> = {}): Card {
  return {
    id: "p1",
    kind: "photo",
    x: 0,
    y: 0,
    width: 240,
    height: 180,
    content: "",
    attachmentRef: "opfs:x.png",
    mediaType: "image/png",
    ...over,
  };
}

function renderPhoto(card: Card, editing = false, onChange = vi.fn(), onCommitEdit = vi.fn()) {
  render(
    <I18nProvider locale="ko">
      <PhotoCardContent
        card={card}
        editing={editing}
        onChange={onChange}
        onCommitEdit={onCommitEdit}
      />
    </I18nProvider>,
  );
  return { onChange, onCommitEdit };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  resolveAttachment.mockReset();
  onFilesMapChange.mockClear();
  (globalThis.URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = vi.fn();
});

describe("PhotoCardContent", () => {
  it("ready면 img를 그리고 캡션이 있으면 사진 아래에 그린다", async () => {
    resolveAttachment.mockResolvedValue({ state: "ready", url: "blob:fake" });
    renderPhoto(photoCard({ content: "제주 바다" }));
    await flush();

    const img = document.querySelector("[data-photo-image] img") as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.src).toBe("blob:fake");
    expect(screen.getByText("제주 바다")).toBeTruthy();
  });

  it("pending이면 '사진 올리는 중' 자리표시자", async () => {
    resolveAttachment.mockResolvedValue({ state: "pending", url: null });
    renderPhoto(photoCard());
    await flush();
    expect(document.querySelector("[data-photo-placeholder='pending']")).toBeTruthy();
  });

  it("missing이면 '사진 없음' 자리표시자", async () => {
    resolveAttachment.mockResolvedValue({ state: "missing", url: null });
    renderPhoto(photoCard({ attachmentRef: undefined }));
    await flush();
    expect(document.querySelector("[data-photo-placeholder='missing']")).toBeTruthy();
  });

  it("편집 중 Enter/blur면 정규화한 캡션으로 onChange·onCommitEdit", async () => {
    resolveAttachment.mockResolvedValue({ state: "ready", url: "blob:fake" });
    const { onChange, onCommitEdit } = renderPhoto(photoCard(), true);
    await flush();

    const input = document.querySelector("[data-photo-caption-input]") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "  제주 바다  " } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith("제주 바다");
    expect(onCommitEdit).toHaveBeenCalled();
  });

  it("편집 중 Esc면 원래 캡션으로 되돌리고 저장하지 않는다", async () => {
    resolveAttachment.mockResolvedValue({ state: "ready", url: "blob:fake" });
    const { onChange } = renderPhoto(photoCard({ content: "원래" }), true);
    await flush();

    const input = document.querySelector("[data-photo-caption-input]") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "바뀜" } });
    fireEvent.keyDown(input, { key: "Escape" });

    // 원복 후 blur — 원래 값과 같아 onChange가 불리지 않는다.
    expect(input.value).toBe("원래");
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("normalizeCaption", () => {
  it("줄바꿈 제거·trim·200자 절단", () => {
    expect(normalizeCaption("  a\nb  ")).toBe("a b");
    expect(normalizeCaption("가".repeat(250)).length).toBe(200);
  });
});
