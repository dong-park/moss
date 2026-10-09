import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import { Dock } from "@/components/workspace/Dock";
import { countTasks } from "@/components/workspace/cards/_shared/MemoFrontBadges";
import { useWorkspace } from "@/state/workspace";
import { EMPTY_LINK_CONTENT } from "@/components/workspace/linkMemo";
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
  it("할 일: 빈 체크박스 하나인 메모를 만들고 창 없이 카드에서 바로 편집한다", () => {
    renderDock();
    fireEvent.click(screen.getByLabelText("할 일"));
    const card = lastCard();
    expect(card?.kind).toBe("text");
    expect(card?.content).toBe("- [ ] ");
    expect(useWorkspace.getState().expandedCardId).toBeNull();
    expect(useWorkspace.getState().editingId).toBe(card?.id);
  });

  it("링크: 빈 링크 카드를 만들고 편집 상태로 둔다 — 주소는 카드 입력칸에 넣는다", () => {
    renderDock();
    fireEvent.click(screen.getByLabelText("링크"));
    const card = lastCard();
    expect(card?.kind).toBe("text");
    expect(card?.content).toBe(EMPTY_LINK_CONTENT);
    expect(useWorkspace.getState().editingId).toBe(card?.id);
  });

  it("사진: 빈 사진 카드를 만든다 — 파일 창은 카드를 눌러 연다", () => {
    renderDock();
    const before = useWorkspace.getState().cards.length;
    fireEvent.click(screen.getByLabelText("사진"));
    expect(useWorkspace.getState().cards.length).toBe(before + 1);
    expect(lastCard()?.kind).toBe("photo");
    expect(lastCard()?.attachmentRef).toBeUndefined();
  });
});

describe("countTasks — 할 일 앞면 배지", () => {
  it("체크한 항목과 전체 항목을 센다", () => {
    expect(countTasks("- [ ] 장보기\n- [x] 빨래\n* [X] 청소\n일반 줄")).toEqual({ done: 2, total: 3 });
    expect(countTasks("")).toEqual({ done: 0, total: 0 });
  });
});
