import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetMemoTableForTest,
  applyFilters,
  applySearch,
  applySort,
  boardPathLabel,
  buildMemoRows,
  defaultFilters,
  deriveRows,
  descendantBoardKeys,
  matchInPreview,
  previewOf,
  PREVIEW_LIMIT,
  useMemoTable,
} from "@/state/memoTable";
import { useStorage } from "@/state/storage";
import { useWorkspace, SYSTEM_BOARD_ID } from "@/state/workspace";
import { getDB, resetDB, type Board, type Note } from "@/state/db/schema";
import { handleIncoming, __resetLiveSyncForTest } from "@/state/db/liveSync";

let originalStorage: PropertyDescriptor | undefined;

function mkNote(over: Partial<Note> & { id: string }): Note {
  return {
    boardId: null,
    kind: "text",
    x: 0,
    y: 0,
    width: 240,
    rotation: 0,
    content: "",
    aiOptOut: false,
    createdAt: 1000,
    updatedAt: 1000,
    lastVisitedAt: 1000,
    ...over,
  };
}

function mkBoard(over: Partial<Board> & { id: string }): Board {
  return {
    name: over.id,
    isSystem: false,
    createdAt: 0,
    updatedAt: 0,
    lastOpenedAt: 0,
    ...over,
  };
}

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
  __resetMemoTableForTest();
});

afterEach(async () => {
  __resetMemoTableForTest();
  __resetLiveSyncForTest();
  await resetDB();
  useStorage.setState({ initialized: false, settings: null, quota: null });
  useWorkspace.setState({
    cards: [],
    selectedIds: [],
    currentBoardId: SYSTEM_BOARD_ID,
    view: "canvas",
  });
  if (originalStorage) {
    Object.defineProperty(navigator, "storage", originalStorage);
  }
});

async function setup() {
  await useStorage.getState().init();
  return useStorage.getState();
}

describe("memoTable 파생 — boardPath", () => {
  const boards = [
    mkBoard({ id: "root", name: "루트" }),
    mkBoard({ id: "sub", name: "함", parentBoardId: "root" }),
    mkBoard({ id: "sysSub", name: "시스템함", parentBoardId: "system" }),
  ];

  it("시스템 보드(null)는 시스템 라벨", () => {
    expect(boardPathLabel(boards, null, "머무는 생각")).toBe("머무는 생각");
  });

  it("루트 보드는 이름, 서브보드는 '루트 › 함'", () => {
    expect(boardPathLabel(boards, "root", "머무는 생각")).toBe("루트");
    expect(boardPathLabel(boards, "sub", "머무는 생각")).toBe("루트 › 함");
  });

  it("시스템 보드에 매달린 함은 '시스템 › 함'", () => {
    expect(boardPathLabel(boards, "sysSub", "머무는 생각")).toBe(
      "머무는 생각 › 시스템함",
    );
  });

  it("descendantBoardKeys는 자신+후손을 담고 사이클을 견딘다", () => {
    const cyc = [
      mkBoard({ id: "a", parentBoardId: "b" }),
      mkBoard({ id: "b", parentBoardId: "a" }),
    ];
    expect([...descendantBoardKeys(boards, "root")].sort()).toEqual([
      "root",
      "sub",
    ]);
    expect(descendantBoardKeys(cyc, "a").has("b")).toBe(true);
  });
});

describe("memoTable 파생 — 행 생성(대상 필터)", () => {
  const boards = [mkBoard({ id: "root", name: "루트" })];

  it("kind!=='text'인 함·메모판은 제외한다", () => {
    const notes = [
      mkNote({ id: "t", content: "본문" }),
      mkNote({ id: "b", kind: "board", content: "{}" }),
      mkNote({ id: "f", kind: "frame", content: '{"name":"판"}' }),
    ];
    const rows = buildMemoRows(notes, boards, "머무는 생각");
    expect(rows.map((r) => r.id)).toEqual(["t"]);
  });

  it("frameId → 메모판 이름을 붙인다", () => {
    const notes = [
      mkNote({ id: "f", kind: "frame", content: '{"name":"판A"}' }),
      mkNote({ id: "t", frameId: "f", content: "본문" }),
    ];
    const rows = buildMemoRows(notes, boards, "머무는 생각");
    expect(rows[0]!.frameName).toBe("판A");
  });

  it("미리보기는 평문 1줄, 상한을 넘으면 말줄임", () => {
    expect(previewOf("# 제목\n**본문** 회고")).toBe("제목 본문 회고");
    const long = "가".repeat(PREVIEW_LIMIT + 20);
    expect(previewOf(long).endsWith("…")).toBe(true);
    expect(previewOf(long).length).toBe(PREVIEW_LIMIT + 1);
  });
});

describe("memoTable 파생 — 필터", () => {
  const boards = [
    mkBoard({ id: "root", name: "루트" }),
    mkBoard({ id: "sub", name: "함", parentBoardId: "root" }),
    mkBoard({ id: "other", name: "딴보드" }),
  ];
  const notes = [
    mkNote({ id: "n-root", boardId: "root", content: "루트 메모" }),
    mkNote({ id: "n-sub", boardId: "sub", content: "함 메모" }),
    mkNote({ id: "n-other", boardId: "other", content: "딴 메모" }),
    mkNote({ id: "n-sys", boardId: null, content: "시스템 메모" }),
  ];
  const rows = buildMemoRows(notes, boards, "머무는 생각");

  it("기본 필터는 현재 보드만(하위 함 포함 여부를 따른다)", () => {
    const withSub = applyFilters(
      rows,
      defaultFilters("root"),
      boards,
    ).map((r) => r.id);
    expect(withSub.sort()).toEqual(["n-root", "n-sub"]);

    const noSub = applyFilters(
      rows,
      { ...defaultFilters("root"), includeSubboards: false },
      boards,
    ).map((r) => r.id);
    expect(noSub).toEqual(["n-root"]);
  });

  it("'모든 보드'는 전부 통과", () => {
    const all = applyFilters(
      rows,
      { ...defaultFilters("root"), boardFilter: "all" },
      boards,
    );
    expect(all).toHaveLength(4);
  });

  it("시스템 보드 키로 무소속 메모를 고른다", () => {
    const sys = applyFilters(
      rows,
      { ...defaultFilters("root"), boardFilter: ["system"] },
      boards,
    ).map((r) => r.id);
    expect(sys).toEqual(["n-sys"]);
  });

  it("첨부 유무 필터", () => {
    const withAttach = [
      ...rows,
      {
        ...rows[0]!,
        id: "n-attach",
        badgeCounts: { image: 1, link: 0, audio: 0, file: 0 },
      },
    ];
    const has = applyFilters(
      withAttach,
      { ...defaultFilters("root"), boardFilter: "all", hasAttachment: true },
      boards,
    ).map((r) => r.id);
    expect(has).toEqual(["n-attach"]);
  });
});

describe("memoTable 파생 — 검색·정렬", () => {
  const boards = [mkBoard({ id: "root", name: "루트" })];

  it("검색은 미리보기 잘림과 무관하게 전체 본문에서 매칭한다", () => {
    const long = `${"가".repeat(PREVIEW_LIMIT + 10)} 회고`;
    const notes = [
      mkNote({ id: "long", content: long }),
      mkNote({ id: "short", content: "회고 정리" }),
    ];
    const rows = buildMemoRows(notes, boards, "머무는 생각");
    expect(rows[0]!.preview.includes("회고")).toBe(false); // 잘려서 미리보기엔 없음
    const found = applySearch(rows, "회고");
    expect(found.map((r) => r.id).sort()).toEqual(["long", "short"]);
  });

  it("AC-3: 일치 부분의 위치를 계산한다(대소문자 무시)", () => {
    expect(matchInPreview("오늘의 회고 노트", "회고")).toEqual({
      start: 4,
      length: 2,
    });
    expect(matchInPreview("no match", "회고")).toBeNull();
  });

  it("AC-4: 만든 날 정렬을 토글하면 asc→desc", () => {
    const setSort = useMemoTable.getState().setSort;
    setSort("createdAt");
    expect(useMemoTable.getState().sort).toEqual({
      key: "createdAt",
      dir: "asc",
    });
    setSort("createdAt");
    expect(useMemoTable.getState().sort).toEqual({
      key: "createdAt",
      dir: "desc",
    });
  });

  it("applySort는 방향대로 정렬하고 빈 제목은 뒤로", () => {
    const notes = [
      mkNote({ id: "a", createdAt: 3, title: "가" }),
      mkNote({ id: "b", createdAt: 1, title: "" }),
      mkNote({ id: "c", createdAt: 2, title: "나" }),
    ];
    const rows = buildMemoRows(notes, boards, "머무는 생각");
    expect(
      applySort(rows, { key: "createdAt", dir: "asc" }).map((r) => r.id),
    ).toEqual(["b", "c", "a"]);
    expect(
      applySort(rows, { key: "title", dir: "asc" }).map((r) => r.id),
    ).toEqual(["a", "c", "b"]);
  });

  it("deriveRows는 필터→검색→정렬을 합성한다", () => {
    const notes = [
      mkNote({ id: "a", boardId: "root", content: "회고", updatedAt: 1 }),
      mkNote({ id: "b", boardId: "root", content: "회고", updatedAt: 2 }),
      mkNote({ id: "c", boardId: "root", content: "기타", updatedAt: 3 }),
    ];
    const out = deriveRows(
      notes,
      boards,
      { ...defaultFilters("root"), query: "회고" },
      { key: "updatedAt", dir: "desc" },
      "머무는 생각",
    );
    expect(out.map((r) => r.id)).toEqual(["b", "a"]);
  });
});

describe("memoTable store — 로드·편집·휴지통·실시간", () => {
  it("ensureLoaded는 기본 보드 필터를 현재 보드로 잡는다", async () => {
    await setup();
    useWorkspace.setState({ currentBoardId: "root" });
    await useMemoTable.getState().ensureLoaded();
    expect(useMemoTable.getState().boardFilter).toEqual(["root"]);
    expect(useMemoTable.getState().loaded).toBe(true);
  });

  it("AC-5: 다른 보드 메모 제목도 확정 시 영속된다", async () => {
    const s = await setup();
    await s.saveBoard({ id: "b1", name: "보드" });
    await s.saveNote({ id: "n1", boardId: "b1", content: "본문" });
    useWorkspace.setState({ currentBoardId: SYSTEM_BOARD_ID, cards: [] });
    await useMemoTable.getState().ensureLoaded();

    useMemoTable.getState().beginTitleEdit("n1", "");
    useMemoTable.getState().setTitle("n1", "  새 제목  ");
    await useMemoTable.getState().commitTitle("n1", "  새 제목  ");

    expect((await getDB().notes.get("n1"))?.title).toBe("새 제목");
    expect(useMemoTable.getState().notes.find((n) => n.id === "n1")?.title).toBe(
      "새 제목",
    );
  });

  it("P1-1: 편집 중 reload가 타이핑 입력을 덮지 않고, draft로 확정한다", async () => {
    const s = await setup();
    await s.saveNote({ id: "n1", boardId: null, title: "원래", content: "본문" });
    await useMemoTable.getState().ensureLoaded();

    useMemoTable.getState().beginTitleEdit("n1", "원래");
    useMemoTable.getState().setTitle("n1", "편집중");
    // 다른 탭 변경처럼 reload가 DB값(원래)을 다시 읽어도 편집 입력은 보존된다.
    await useMemoTable.getState().reload();
    expect(useMemoTable.getState().notes.find((n) => n.id === "n1")?.title).toBe(
      "편집중",
    );

    await useMemoTable.getState().commitTitle("n1", "편집중");
    expect((await getDB().notes.get("n1"))?.title).toBe("편집중");
  });

  it("P1-2: 무변경 확정은 updatedAt을 건드리지 않는다", async () => {
    const s = await setup();
    await getDB().notes.put(
      mkNote({ id: "n1", title: "제목", content: "본문", updatedAt: 1000 }),
    );
    await useMemoTable.getState().ensureLoaded();

    useMemoTable.getState().beginTitleEdit("n1", "제목");
    useMemoTable.getState().setTitle("n1", "제목  ");
    await useMemoTable.getState().commitTitle("n1", "제목  ");

    const stored = await getDB().notes.get("n1");
    expect(stored?.title).toBe("제목");
    expect(stored?.updatedAt).toBe(1000);
  });

  it("P1-2: Esc는 원값만 복원하고 영속하지 않는다", async () => {
    const s = await setup();
    await getDB().notes.put(
      mkNote({ id: "n1", title: "원래", content: "본문", updatedAt: 1000 }),
    );
    await useMemoTable.getState().ensureLoaded();

    useMemoTable.getState().beginTitleEdit("n1", "원래");
    useMemoTable.getState().setTitle("n1", "바뀜");
    useMemoTable.getState().cancelTitleEdit("n1");

    expect(useMemoTable.getState().notes.find((n) => n.id === "n1")?.title).toBe(
      "원래",
    );
    const stored = await getDB().notes.get("n1");
    expect(stored?.title).toBe("원래");
    expect(stored?.updatedAt).toBe(1000);
  });

  it("P1-2: 없는 노트 제목 쓰기는 새 노트를 만들지 않는다", async () => {
    const s = await setup();
    await s.updateNoteTitle("ghost", "새 제목");
    expect(await getDB().notes.get("ghost")).toBeUndefined();
  });

  it("AC-7: 선택 행 휴지통 + 연결선 스냅샷", async () => {
    const s = await setup();
    await s.saveBoard({ id: "b1", name: "B" });
    await s.saveNote({ id: "n1", boardId: "b1", content: "A" });
    await s.saveNote({ id: "n2", boardId: "b1", content: "B" });
    await s.saveConnection({ id: "c1", sourceNoteId: "n1", targetNoteId: "n2" });
    await useMemoTable.getState().ensureLoaded();

    useMemoTable.getState().setSelectedIds(new Set(["n1", "n2"]));
    await useMemoTable.getState().trashSelected();

    expect(await getDB().notes.get("n1")).toBeUndefined();
    expect(await getDB().notes.get("n2")).toBeUndefined();
    expect((await getDB().trash.toArray()).map((e) => e.id).sort()).toEqual([
      "n1",
      "n2",
    ]);
    expect((await getDB().trashConnections.toArray()).map((c) => c.id)).toEqual([
      "c1",
    ]);
    expect(useMemoTable.getState().selectedIds.size).toBe(0);
    expect(useMemoTable.getState().notes).toHaveLength(0);
  });

  it("AC-8: 다른 탭(liveSync) 변경이 표에 반영된다", async () => {
    const s = await setup();
    await s.saveNote({ id: "n1", boardId: null, content: "새 메모" });
    await useMemoTable.getState().ensureLoaded();
    expect(useMemoTable.getState().notes.some((n) => n.id === "n1")).toBe(true);

    // 다른 탭이 만든 새 메모를, 이 탭 표는 아직 모른다.
    await s.saveNote({ id: "n2", boardId: null, content: "다른 탭 메모" });
    expect(useMemoTable.getState().notes.some((n) => n.id === "n2")).toBe(false);

    await handleIncoming({
      type: "card-upsert",
      id: "n2",
      boardId: null,
      updatedAt: Date.now() + 10,
      origin: "other-tab",
    });

    expect(useMemoTable.getState().notes.some((n) => n.id === "n2")).toBe(true);
  });
});
