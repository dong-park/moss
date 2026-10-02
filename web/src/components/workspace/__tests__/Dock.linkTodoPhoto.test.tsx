import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import { Dock } from "@/components/workspace/Dock";
import { countTasks } from "@/components/workspace/cards/_shared/MemoFrontBadges";
import { useWorkspace } from "@/state/workspace";
import { useStorage } from "@/state/storage";
import { resetDB } from "@/state/db/schema";

/* spec/dock-link-todo-photo.md — 도크 할 일·링크·사진 버튼. */

let originalStorage: PropertyDescriptor | undefined;

beforeEach(async () => {
  originalStorage = Object.getOwnPropertyDescriptor(navigator, "storage");
  Object.defineProperty(navigator, "storage", {
    value: {
      persist: vi.fn(async () => true),
      persisted: vi.fn(async () => false),
      estimate: vi.fn(async () => ({ usage: 0, quota: 1000 })),
      getDirectory: vi.fn(),
    },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
  await useStorage.getState().init();
  await useWorkspace.getState().loadFromStorage();
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await new Promise((r) => setTimeout(r, 20));
  await resetDB();
  useStorage.setState({ initialized: false, settings: null, quota: null });
  useWorkspace.setState({ cards: [], selectedIds: [], editingId: null, expandedCardId: null });
  if (originalStorage) Object.defineProperty(navigator, "storage", originalStorage);
});

function renderDock() {
  return render(
    <I18nProvider locale="ko">
      <Dock />
    </I18nProvider>,
  );
}
const lastCard = () => useWorkspace.getState().cards.at(-1);

describe("도크 할 일·링크·사진", () => {
  it("할 일: 메모를 만들고 메모 창을 연다 — 체크박스는 창의 편집기가 만든다", () => {
    renderDock();
    fireEvent.click(screen.getByLabelText("할 일"));
    const card = lastCard();
    expect(card?.kind).toBe("text");
    expect(useWorkspace.getState().expandedCardId).toBe(card?.id);
    expect(useWorkspace.getState().editingId).toBeNull();
  });

  it("링크: 입력칸에 주소를 넣고 Enter면 링크 블록 메모, 아니면 안내만", async () => {
    renderDock();
    const before = useWorkspace.getState().cards.length;
    fireEvent.click(screen.getByLabelText("링크"));
    const input = await screen.findByRole("textbox", { name: "링크" });

    fireEvent.change(input, { target: { value: "javascript:alert(1)" } });
    fireEvent.submit(input.closest("form")!);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(useWorkspace.getState().cards.length).toBe(before);

    fireEvent.change(input, { target: { value: "  https://example.com  " } });
    fireEvent.submit(input.closest("form")!);
    await waitFor(() => expect(useWorkspace.getState().cards.length).toBe(before + 1));
    expect(lastCard()?.kind).toBe("text");
    expect(lastCard()?.content).toContain("https://example.com");
    expect(screen.queryByRole("textbox", { name: "링크" })).toBeNull();
  });

  it("사진: 파일 창을 열고, 취소하면 아무것도 만들지 않는다", () => {
    renderDock();
    const input = document.querySelector<HTMLInputElement>("[data-dock-photo-input]")!;
    const click = vi.spyOn(input, "click").mockImplementation(() => undefined);
    const before = useWorkspace.getState().cards.length;
    fireEvent.click(screen.getByLabelText("사진"));
    expect(click).toHaveBeenCalledTimes(1);
    fireEvent.change(input, { target: { files: [] } });
    expect(useWorkspace.getState().cards.length).toBe(before);
  });
});

describe("countTasks — 할 일 앞면 배지", () => {
  it("체크한 항목과 전체 항목을 센다", () => {
    expect(countTasks("- [ ] 장보기\n- [x] 빨래\n* [X] 청소\n일반 줄")).toEqual({ done: 2, total: 3 });
    expect(countTasks("")).toEqual({ done: 0, total: 0 });
  });
});
