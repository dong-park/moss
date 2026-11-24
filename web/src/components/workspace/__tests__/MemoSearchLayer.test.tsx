import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import { MemoSearchLayer } from "@/components/workspace/MemoSearchLayer";
import { useStorage } from "@/state/storage";
import { resetDB } from "@/state/db/schema";
import type { Note } from "@/state/db/schema";
import { flushAll } from "@/state/cardPersist";
import { destroyBoardDocs } from "@/state/ydoc/activeDoc";
import { __clearPlainCache } from "@/state/memoSearch";
import { SYSTEM_BOARD_ID, useWorkspace, type Card } from "@/state/workspace";

/**
 * KS-4 — ⌘K 검색 창. 모든 벽 색인은 실제 로더(`loadAllWallsIndex`)가 fake-indexeddb 의
 * 실제 Dexie 스키마에서 읽는다. 점프 액션만 호출 여부를 보려고 spy 로 바꾼다.
 */

const HINT = "초성·부분 일치 · 마카 글씨는 검색하지 않아요";
const EMPTY = "찾는 포스트잇이 없어요";

let originalStorage: PropertyDescriptor | undefined;
let jump: Mock<(noteId: string) => Promise<void>>;
const realJump = useWorkspace.getState().jumpToCardWithFlash;

beforeEach(() => {
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
  __clearPlainCache();
  jump = vi.fn<(noteId: string) => Promise<void>>(async () => {});
  useWorkspace.setState({ jumpToCardWithFlash: jump });
});

afterEach(async () => {
  await new Promise((r) => setTimeout(r, 10));
  await flushAll();
  await destroyBoardDocs();
  await resetDB();
  useStorage.setState({ initialized: false, settings: null, quota: null });
  useWorkspace.setState({
    jumpToCardWithFlash: realJump,
    cards: [],
    selectedIds: [],
    boards: [],
    memoSearchQuery: "",
    memoSearchMatchIds: [],
    currentBoardId: SYSTEM_BOARD_ID,
    viewport: { x: 0, y: 0, scale: 1 },
  });
  if (originalStorage) Object.defineProperty(navigator, "storage", originalStorage);
});

async function putBoard(id: string, name: string) {
  await useStorage.getState().saveBoard({ id, name, isSystem: false });
}

async function putNote(patch: Partial<Note> & { id: string }) {
  await useStorage.getState().saveNote({ kind: "text", ...patch });
}

/** 시안 09-search 의 세 벽 — 이직 고민 벽·일상 벽·리서치 벽. */
async function seedThreeWalls() {
  await useStorage.getState().init();
  await putBoard("w-job", "이직 고민 벽");
  await putBoard("w-life", "일상 벽");
  await putBoard("w-research", "리서치 벽");
  await putNote({ id: "n-job", boardId: "w-job", content: "이직 고민 중", color: "yellow" });
  await putNote({ id: "n-life", boardId: "w-life", content: "연주회 표 예매", color: "pink" });
  await putNote({ id: "n-research", boardId: "w-research", content: "인재 채용 캡처", color: "blue" });
  await putNote({ id: "n-noise", boardId: "w-life", content: "장보기 목록" });
}

function mount() {
  return render(
    <I18nProvider locale="ko">
      <MemoSearchLayer />
    </I18nProvider>,
  );
}

function openWith(init: KeyboardEventInit) {
  fireEvent.keyDown(window, init);
}

function input(): HTMLInputElement {
  return screen.getByRole("combobox") as HTMLInputElement;
}

function type(value: string) {
  fireEvent.change(input(), { target: { value } });
}

/** 열고 `query`를 친 뒤 결과 줄이 뜰 때까지 기다린다. */
async function openAndSearch(query: string) {
  openWith({ key: "k", metaKey: true });
  type(query);
  return screen.findAllByRole("option");
}

describe("KS-4 · 검색 창 열기 (T1·D1)", () => {
  it("⌘K 와 ⌘F(Ctrl 포함) 모두 같은 창을 열고 입력에 포커스가 간다", () => {
    mount();
    expect(screen.queryByRole("dialog")).toBeNull();

    openWith({ key: "k", metaKey: true });
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(document.activeElement).toBe(input());

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();

    openWith({ key: "f", metaKey: true });
    expect(document.activeElement).toBe(input());
    fireEvent.keyDown(window, { key: "Escape" });

    openWith({ key: "k", ctrlKey: true });
    expect(document.activeElement).toBe(input());
    fireEvent.keyDown(window, { key: "Escape" });

    openWith({ key: "f", ctrlKey: true });
    expect(document.activeElement).toBe(input());
  });

  it("시안 값: 입력 22px · 커서 #2457b8 · 폭 560px 시트", () => {
    mount();
    openWith({ key: "k", metaKey: true });
    const el = input();
    expect(el.className).toContain("text-[22px]");
    expect(el.style.caretColor).toBe("rgb(36, 87, 184)");
    const sheet = el.closest("div.w-\\[560px\\]");
    expect(sheet).not.toBeNull();
  });

  it("벽 어두운 바탕을 누르면 창이 닫힌다", () => {
    mount();
    openWith({ key: "k", metaKey: true });
    fireEvent.mouseDown(screen.getByTestId("memo-search-dim"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("KS-4 · 모든 벽 결과 줄 (T4)", () => {
  it("ㅇㅈ → 세 벽의 세 줄, 줄마다 벽 이름과 칠한 구간이 있다", async () => {
    await seedThreeWalls();
    mount();
    const rows = await openAndSearch("ㅇㅈ");

    expect(rows).toHaveLength(3);
    const text = rows.map((r) => r.textContent ?? "").join("|");
    expect(text).toContain("이직 고민 벽");
    expect(text).toContain("일상 벽");
    expect(text).toContain("리서치 벽");

    const marks = [...document.querySelectorAll("mark")].map((m) => m.textContent);
    expect(marks.sort()).toEqual(["연주", "이직", "인재"].sort());

    // 각 칠한 구간은 자기 줄 안에 있고, 줄마다 벽 이름이 그 줄에 붙어 있다.
    for (const row of rows) {
      const mark = row.querySelector("mark")?.textContent;
      const wall = { 이직: "이직 고민 벽", 연주: "일상 벽", 인재: "리서치 벽" }[
        mark as "이직" | "연주" | "인재"
      ];
      expect(row.textContent).toContain(wall);
    }
  });

  it("줄 왼쪽 네모는 포스트잇 색이다", async () => {
    await seedThreeWalls();
    mount();
    const rows = await openAndSearch("이직");
    expect(rows).toHaveLength(1);
    const swatch = rows[0].querySelector<HTMLElement>('span[aria-hidden="true"]');
    expect(swatch).not.toBeNull();
    // yellow 는 이름이 아니라 hex 로 칠한다 — 이름 문자열이 스타일에 새면 안 된다.
    expect(swatch!.style.background).toMatch(/^rgb\(/);
  });

  it("지금 벽의 글상자(P2-3)도 결과 줄에 뜬다 — 저장 전 store 카드로 찾는다", async () => {
    await useStorage.getState().init();
    const tb: Card = {
      id: "tb",
      kind: "textbox",
      x: 0,
      y: 0,
      width: 120,
      content: "구역 제목",
    };
    useWorkspace.setState({ cards: [tb] });
    mount();
    const rows = await openAndSearch("구역");
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("구역 제목");
    expect(rows[0].querySelector("mark")?.textContent).toBe("구역");
  });
});

describe("KS-4 · 안내 줄·빈 결과 (T6·T7)", () => {
  it("안내 줄은 결과가 없을 때도 있을 때도 보인다", async () => {
    await seedThreeWalls();
    mount();
    openWith({ key: "k", metaKey: true });
    expect(screen.getByText(HINT)).toBeTruthy();

    type("ㅇㅈ");
    await screen.findAllByRole("option");
    expect(screen.getByText(HINT)).toBeTruthy();

    type("ㅋㅋㅋㅋㅋ");
    await screen.findByText(EMPTY);
    expect(screen.getByText(HINT)).toBeTruthy();
  });

  it("마카 글씨뿐이라 포스트잇에 없는 검색어면 '찾는 포스트잇이 없어요'", async () => {
    await seedThreeWalls();
    mount();
    // 마카로 쓴 글씨는 글자로 읽지 않는다 → 어느 포스트잇 글에도 없다.
    openWith({ key: "k", metaKey: true });
    type("마카");
    expect(await screen.findByText(EMPTY)).toBeTruthy();
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it("검색어가 비면 빈 결과 문구를 보이지 않고 안내 줄만 남는다", async () => {
    await seedThreeWalls();
    mount();
    openWith({ key: "k", metaKey: true });
    // 색인을 다 읽은 뒤에도 빈 검색어에서는 문구가 없다.
    await new Promise((r) => setTimeout(r, 200));
    expect(screen.queryByText(EMPTY)).toBeNull();
    expect(screen.getByText(HINT)).toBeTruthy();
  });

  it("50줄을 넘으면 맨 끝에 'N개 더 있어요, 더 쳐 보세요'", async () => {
    await useStorage.getState().init();
    await putBoard("w-big", "큰 벽");
    for (let i = 0; i < 60; i += 1) {
      await putNote({ id: `n-${i}`, boardId: "w-big", content: `아침 메모 ${i}` });
    }
    mount();
    const rows = await openAndSearch("ㅇㅊ");
    expect(rows).toHaveLength(50);
    expect(screen.getByText("10개 더 있어요, 더 쳐 보세요")).toBeTruthy();
  });
});

describe("KS-4 · 키보드 (T8)", () => {
  it("첫 줄이 기본으로 골라지고 ↓ 두 번에 셋째 줄이 골라진다", async () => {
    await seedThreeWalls();
    mount();
    await openAndSearch("ㅇㅈ");

    const selectedIdx = () =>
      screen.getAllByRole("option").findIndex((r) => r.getAttribute("aria-selected") === "true");
    expect(selectedIdx()).toBe(0);

    fireEvent.keyDown(input(), { key: "ArrowDown" });
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    expect(selectedIdx()).toBe(2);

    // 끝에서 더 내려도 넘치지 않는다. 위로는 다시 올라온다.
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    expect(selectedIdx()).toBe(2);
    fireEvent.keyDown(input(), { key: "ArrowUp" });
    expect(selectedIdx()).toBe(1);
  });

  it("Esc 는 창을 닫고 지금 벽과 화면 위치를 그대로 둔다", async () => {
    await seedThreeWalls();
    useWorkspace.setState({
      currentBoardId: "w-life",
      viewport: { x: 120, y: -40, scale: 0.8 },
    });
    mount();
    await openAndSearch("ㅇㅈ");

    fireEvent.keyDown(input(), { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
    const s = useWorkspace.getState();
    expect(s.currentBoardId).toBe("w-life");
    expect(s.viewport).toEqual({ x: 120, y: -40, scale: 0.8 });
    expect(s.memoSearchQuery).toBe("");
    expect(jump).not.toHaveBeenCalled();
  });

  it("창이 열려 있을 때 Esc 가 Canvas 의 Esc 까지 퍼지지 않는다", async () => {
    mount();
    openWith({ key: "k", metaKey: true });
    const bubble = vi.fn();
    window.addEventListener("keydown", bubble);
    fireEvent.keyDown(input(), { key: "Escape" });
    window.removeEventListener("keydown", bubble);
    expect(bubble).not.toHaveBeenCalled();
  });
});

describe("KS-4 · 고르기와 한글 Enter (T9)", () => {
  it("조합 중 Enter 는 점프하지 않고 창이 열려 있다. 다음 평소 Enter 는 점프한다", async () => {
    await seedThreeWalls();
    mount();
    const rows = await openAndSearch("ㅇㅈ");
    const firstText = rows[0].textContent ?? "";

    fireEvent.keyDown(input(), { key: "Enter", isComposing: true });
    expect(jump).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();

    // 조합 처리 중 키(keyCode 229)로 오는 Enter 도 같다.
    fireEvent.keyDown(input(), { key: "Enter", keyCode: 229 });
    expect(jump).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();

    fireEvent.keyDown(input(), { key: "Enter" });
    expect(jump).toHaveBeenCalledTimes(1);
    const expectedId = firstText.includes("이직")
      ? "n-job"
      : firstText.includes("연주")
        ? "n-life"
        : "n-research";
    expect(jump).toHaveBeenCalledWith(expectedId);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("조합이 막 끝난 직후의 Enter(Safari)도 확정용이라 점프하지 않는다", async () => {
    await seedThreeWalls();
    mount();
    await openAndSearch("ㅇㅈ");

    fireEvent.compositionEnd(input());
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(jump).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();

    await new Promise((r) => setTimeout(r, 120));
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(jump).toHaveBeenCalledTimes(1);
  });

  it("조합 중 ↓ 는 입력기 후보 고르기라 줄을 옮기지 않는다", async () => {
    await seedThreeWalls();
    mount();
    await openAndSearch("ㅇㅈ");
    fireEvent.keyDown(input(), { key: "ArrowDown", isComposing: true });
    const rows = screen.getAllByRole("option");
    expect(rows[0].getAttribute("aria-selected")).toBe("true");
  });

  it("Enter 는 골라진 줄의 카드 id 로 점프한다", async () => {
    await seedThreeWalls();
    mount();
    const rows = await openAndSearch("ㅇㅈ");
    const second = rows[1];
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    fireEvent.keyDown(input(), { key: "Enter" });

    const text = second.textContent ?? "";
    const id = text.includes("이직") ? "n-job" : text.includes("연주") ? "n-life" : "n-research";
    expect(jump).toHaveBeenCalledWith(id);
  });

  it("줄 클릭도 그 카드 id 로 점프하고 창을 닫는다", async () => {
    await seedThreeWalls();
    mount();
    const rows = await openAndSearch("ㅇㅈ");
    const target = rows.find((r) => (r.textContent ?? "").includes("연주"))!;
    fireEvent.click(target);

    expect(jump).toHaveBeenCalledWith("n-life");
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(useWorkspace.getState().memoSearchQuery).toBe(""));
  });

  it("디바운스 안에 친 Enter 도 지금 입력값의 첫 줄로 점프한다", async () => {
    await seedThreeWalls();
    mount();
    openWith({ key: "k", metaKey: true });
    // 색인이 읽힐 때까지만 기다린다 — 검색어 디바운스는 치고 나서부터 센다.
    await new Promise((r) => setTimeout(r, 200));
    type("연주");
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(jump).toHaveBeenCalledWith("n-life");
  });
});
