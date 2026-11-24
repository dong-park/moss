import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStorage } from "@/state/storage";
import { getDB, resetDB } from "@/state/db/schema";
import type { Note } from "@/state/db/schema";
import { SYSTEM_BOARD_ID, useWorkspace, type Card } from "@/state/workspace";
import { flushAll } from "@/state/cardPersist";
import { destroyBoardDocs } from "@/state/ydoc/activeDoc";
import { __clearPlainCache } from "@/state/memoSearch";
import {
  ALL_WALLS_RESULT_LIMIT,
  __clearAllWallsIndexCache,
  loadAllWallsIndex,
  searchAllWalls,
} from "@/state/memoSearchAllWalls";

/**
 * KS-3 T4·T13 — 모든 벽 검색. 실제 Dexie 스키마(fake-indexeddb)에서 읽는다.
 */

let originalStorage: PropertyDescriptor | undefined;

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
  __clearAllWallsIndexCache();
});

afterEach(async () => {
  await new Promise((r) => setTimeout(r, 10));
  await flushAll();
  await destroyBoardDocs();
  await resetDB();
  useStorage.setState({ initialized: false, settings: null, quota: null });
  useWorkspace.setState({
    cards: [],
    selectedIds: [],
    boards: [],
    currentBoardId: SYSTEM_BOARD_ID,
    lastNonSystemBoardId: null,
    viewportByBoard: {},
    viewport: { x: 0, y: 0, scale: 1 },
    view: "canvas",
    viewSettledBoardIds: [],
    tableReturnBoardId: null,
    flashCardId: null,
    flashStartedAt: null,
  });
  if (originalStorage) Object.defineProperty(navigator, "storage", originalStorage);
});

async function putBoard(id: string, name: string, extra: Record<string, unknown> = {}) {
  await useStorage.getState().saveBoard({ id, name, isSystem: false, ...extra });
}

async function putNote(patch: Partial<Note> & { id: string }) {
  await useStorage.getState().saveNote({ kind: "text", ...patch });
}

function card(id: string, content: string, extra: Partial<Card> = {}): Card {
  return { id, kind: "text", x: 0, y: 0, width: 240, content, ...extra };
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

describe("모든 벽 검색 (T4)", () => {
  it("세 벽에 흩어진 포스트잇을 ㅇㅈ 한 번으로 모두 찾고, 줄마다 벽 이름과 색이 있다", async () => {
    await useStorage.getState().init();
    await putBoard("w-job", "이직 고민 벽");
    await putBoard("w-life", "일상 벽");
    await putBoard("w-research", "리서치 벽");
    await putNote({ id: "n-job", boardId: "w-job", content: "이직 고민 중", color: "pink" });
    await putNote({ id: "n-life", boardId: "w-life", content: "연주회 표 예매" });
    await putNote({ id: "n-research", boardId: "w-research", content: "인재 채용 캡처" });
    await putNote({ id: "n-noise", boardId: "w-life", content: "장보기 목록" });

    const index = await loadAllWallsIndex();
    // 지금 벽은 세 벽 밖이라 세 줄 모두 색인(다른 벽)에서 온다.
    const { rows, more } = searchAllWalls(index, "ㅇㅈ", { boardId: "w-elsewhere", cards: [] });

    expect(more).toBe(0);
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect([...byId.keys()].sort()).toEqual(["n-job", "n-life", "n-research"]);

    expect(byId.get("n-job")).toMatchObject({
      boardId: "w-job",
      boardName: "이직 고민 벽",
      // 사용자가 고른 분홍 — 이름이 아니라 칠할 hex 다.
      color: "#f3e3e3",
      text: "이직 고민 중",
      ranges: [[0, 2]],
      current: false,
    });
    expect(byId.get("n-life")).toMatchObject({
      boardName: "일상 벽",
      text: "연주회 표 예매",
      ranges: [[0, 2]],
    });
    expect(byId.get("n-research")).toMatchObject({
      boardName: "리서치 벽",
      text: "인재 채용 캡처",
      ranges: [[0, 2]],
    });
    // 고른 색이 없으면 노랑 6단계 중 하나(id 해시)다.
    expect(byId.get("n-life")!.color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("시스템 벽은 '내 벽', 이름이 빈 벽은 '이름 없는 프로젝트'로 보이고 레거시 null 벽 글도 찾는다", async () => {
    await useStorage.getState().init();
    await putBoard("w-blank", "");
    await putNote({ id: "n-sys", boardId: SYSTEM_BOARD_ID, content: "시스템 메모" });
    await putNote({ id: "n-null", boardId: null, content: "레거시 메모" });
    await putNote({ id: "n-blank", boardId: "w-blank", content: "이름 없는 벽 메모" });

    const index = await loadAllWallsIndex();
    const { rows } = searchAllWalls(index, "메모", { boardId: "w-other", cards: [] });

    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get("n-sys")!.boardName).toBe("내 벽");
    expect(byId.get("n-null")).toMatchObject({ boardName: "내 벽", boardId: SYSTEM_BOARD_ID });
    expect(byId.get("n-blank")!.boardName).toBe("(이름 없는 프로젝트)");
  });

  it("시스템 벽 이름을 바꾸면 검색 결과 줄에도 바뀐 이름이 나온다", async () => {
    await useStorage.getState().init();
    await putBoard(SYSTEM_BOARD_ID, "이직 고민", { isSystem: true });
    await putNote({ id: "n-sys", boardId: SYSTEM_BOARD_ID, content: "시스템 메모" });
    await putNote({ id: "n-null", boardId: null, content: "레거시 메모" });

    const index = await loadAllWallsIndex();
    const { rows } = searchAllWalls(index, "메모", { boardId: "w-other", cards: [] });

    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get("n-sys")!.boardName).toBe("이직 고민");
    expect(byId.get("n-null")!.boardName).toBe("이직 고민");
  });

  it("공유 벽(remote)에 이 기기가 가진 포스트잇도 찾는다", async () => {
    await useStorage.getState().init();
    await putBoard("w-shared", "같이 쓰는 벽", { remote: true });
    await putNote({ id: "n-shared", boardId: "w-shared", content: "공유 일정" });

    const index = await loadAllWallsIndex();
    const { rows } = searchAllWalls(index, "ㄱㅇ", { boardId: "w-x", cards: [] });
    expect(rows.map((r) => r.id)).toEqual(["n-shared"]);
  });

  it("휴지통에 간 포스트잇은 찾지 않는다", async () => {
    await useStorage.getState().init();
    await putBoard("w1", "벽1");
    await putNote({ id: "n-live", boardId: "w1", content: "남은 이직 글" });
    await putNote({ id: "n-gone", boardId: "w1", content: "지운 이직 글" });
    await useStorage.getState().trashNotes(["n-gone"]);

    const index = await loadAllWallsIndex();
    const { rows } = searchAllWalls(index, "이직", { boardId: "w-x", cards: [] });
    expect(rows.map((r) => r.id)).toEqual(["n-live"]);
  });

  it("글이 없는 메모·다른 종류 카드는 색인에 넣지 않는다", async () => {
    await useStorage.getState().init();
    await putBoard("w1", "벽1");
    await putNote({ id: "n-empty", boardId: "w1", content: "" });
    await putNote({ id: "n-frame", boardId: "w1", kind: "frame", content: '{"name":"이직 틀"}' });
    await putNote({ id: "n-text", boardId: "w1", content: "이직" });

    const index = await loadAllWallsIndex();
    const { rows } = searchAllWalls(index, "이직", { boardId: "w-x", cards: [] });
    expect(rows.map((r) => r.id)).toEqual(["n-text"]);
  });

  it("제목에 맞으면 제목을, 길면 맞은 자리 둘레를 …로 줄여 보인다", async () => {
    await useStorage.getState().init();
    await putBoard("w1", "벽1");
    await putNote({ id: "n-title", boardId: "w1", title: "여행 계획", content: "본문은 다른 얘기" });
    const long = `${"가나다라마바사 ".repeat(20)}목표는 연주회`;
    await putNote({ id: "n-long", boardId: "w1", content: long });

    const index = await loadAllWallsIndex();
    const title = searchAllWalls(index, "여행", { boardId: "w-x", cards: [] }).rows[0];
    expect(title).toMatchObject({ id: "n-title", text: "여행 계획", ranges: [[0, 2]] });

    const snip = searchAllWalls(index, "연주회", { boardId: "w-x", cards: [] }).rows[0];
    expect(snip.text.startsWith("…")).toBe(true);
    expect(snip.text.length).toBeLessThan(long.length);
    expect(snip.ranges).toHaveLength(1);
    const [[s, e]] = snip.ranges;
    expect(snip.text.slice(s, e)).toBe("연주회");
  });

  it("빈 검색어는 빈 결과다", async () => {
    await useStorage.getState().init();
    await putNote({ id: "n1", boardId: "w1", content: "이직" });
    const index = await loadAllWallsIndex();
    expect(searchAllWalls(index, "   ", { boardId: "w-x", cards: [] })).toEqual({
      rows: [],
      more: 0,
    });
  });
});

describe("순서와 상한 (D2·D8)", () => {
  it("지금 벽 결과가 맞은 횟수가 더 많은 다른 벽 결과보다 앞선다", async () => {
    await useStorage.getState().init();
    await putBoard("w-here", "여기");
    await putBoard("w-there", "저기");
    await putNote({ id: "n-there", boardId: "w-there", content: "이직 이직 이직 이직" });
    const current: Card[] = [card("n-here", "이직 한 번")];

    const index = await loadAllWallsIndex();
    const { rows } = searchAllWalls(index, "이직", { boardId: "w-here", cards: current });

    expect(rows.map((r) => r.id)).toEqual(["n-here", "n-there"]);
    expect(rows.map((r) => r.current)).toEqual([true, false]);
    // 색인에 지금 벽 글이 하나도 없어도 이름은 벽 목록에서 얻는다.
    expect(rows[0].boardId).toBe("w-here");
  });

  it("각 묶음 안은 맞은 횟수 내림차순, 같으면 최근 고친 순이다", async () => {
    await useStorage.getState().init();
    await putBoard("w-a", "A");
    await putNote({ id: "old", boardId: "w-a", content: "이직 하나", updatedAt: 1000 });
    await putNote({ id: "twice", boardId: "w-a", content: "이직 이직", updatedAt: 500 });
    await putNote({ id: "new", boardId: "w-a", content: "이직 둘", updatedAt: 3000 });
    // saveNote 는 updatedAt 을 지금으로 덮으므로 Dexie 에 직접 맞춘다.
    const db = getDB();
    await db.notes.update("old", { updatedAt: 1000 });
    await db.notes.update("twice", { updatedAt: 500 });
    await db.notes.update("new", { updatedAt: 3000 });

    const index = await loadAllWallsIndex();
    const { rows } = searchAllWalls(index, "이직", { boardId: "w-x", cards: [] });
    expect(rows.map((r) => r.id)).toEqual(["twice", "new", "old"]);
  });

  it("60장이 맞으면 50줄과 10개 더를 돌려준다", async () => {
    await useStorage.getState().init();
    await putBoard("w-many", "많은 벽");
    const db = getDB();
    await db.notes.bulkPut(
      Array.from({ length: 60 }, (_, i): Note => ({
        id: `m-${i}`,
        boardId: "w-many",
        kind: "text",
        x: 0,
        y: 0,
        width: 240,
        rotation: 0,
        content: `이직 ${i}번째 생각`,
        aiOptOut: false,
        createdAt: i,
        updatedAt: i,
        lastVisitedAt: i,
      })),
    );

    const index = await loadAllWallsIndex();
    const result = searchAllWalls(index, "ㅇㅈ", { boardId: "w-x", cards: [] });
    expect(ALL_WALLS_RESULT_LIMIT).toBe(50);
    expect(result.rows).toHaveLength(50);
    expect(result.more).toBe(10);
    // 같은 점수라 최근 고친 순 — 가장 늦게 고친 m-59 가 맨 앞이다.
    expect(result.rows[0].id).toBe("m-59");
  });
});

describe("지금 벽의 저장 전 글 (store 카드가 저장소보다 새롭다)", () => {
  it("저장 전 글이 결과에 반영되고 저장소의 낡은 글은 겹쳐 나오지 않는다", async () => {
    await useStorage.getState().init();
    await putBoard("w-here", "여기");
    await putNote({ id: "n-edit", boardId: "w-here", content: "오래된 장보기" });
    await putNote({ id: "n-removed", boardId: "w-here", content: "지금은 없는 이직 글" });
    const current: Card[] = [
      card("n-edit", "방금 적은 이직 고민"), // 저장소엔 아직 낡은 글
      card("n-new", "아직 저장 안 된 이직 카드"), // 저장소에 없다
    ];

    const index = await loadAllWallsIndex();
    const { rows } = searchAllWalls(index, "이직", { boardId: "w-here", cards: current });

    expect(rows.map((r) => r.id).sort()).toEqual(["n-edit", "n-new"]);
    const edited = rows.find((r) => r.id === "n-edit")!;
    expect(edited.text).toBe("방금 적은 이직 고민");
    expect(edited.boardName).toBe("여기");
    // 저장소의 낡은 글로는 더 이상 맞지 않는다.
    expect(
      searchAllWalls(index, "장보기", { boardId: "w-here", cards: current }).rows,
    ).toEqual([]);
  });

  it("기본값은 workspace store 의 지금 벽을 읽는다", async () => {
    await useStorage.getState().init();
    await putBoard("w-here", "여기");
    useWorkspace.setState({
      currentBoardId: "w-here",
      cards: [card("n-live", "저장 전 이직")],
    });
    const index = await loadAllWallsIndex();
    const { rows } = searchAllWalls(index, "ㅇㅈ");
    expect(rows.map((r) => [r.id, r.current])).toEqual([["n-live", true]]);
  });
});

describe("실경로 — 앱이 쓰는 경로로 심은 포스트잇을 읽는다", () => {
  it("createBoard·addCardAt·setContent·flushAll 로 쓴 글이 다른 벽에서 찾아진다", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();
    const ws = useWorkspace.getState();
    const wallA = await ws.createBoard("이직 고민 벽");
    const wallB = await ws.createBoard("일상 벽");
    const id = useWorkspace.getState().addCardAt("text", 100, 200);
    useWorkspace.getState().setContent(id, "연주회 표 예매");
    await flushAll();
    await useWorkspace.getState().setCurrentBoard(wallA);

    const index = await loadAllWallsIndex();
    const { rows } = searchAllWalls(index, "ㅇㅈ");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id,
      boardId: wallB,
      boardName: "일상 벽",
      text: "연주회 표 예매",
      current: false,
    });
  });
});

describe("성능 (T13) — 벽 10장·포스트잇 2,000장", () => {
  const WORDS = [
    "이직", "고민", "연주회", "예매", "인재", "채용", "캡처", "일정", "장보기", "목록",
    "회의", "정리", "독서", "여행", "계획", "운동", "식단", "공부", "프로젝트", "아이디어",
  ];

  function synth(total: number, boards: number): Note[] {
    return Array.from({ length: total }, (_, i): Note => {
      const a = WORDS[i % WORDS.length];
      const b = WORDS[(i * 7 + 3) % WORDS.length];
      return {
        id: `p-${i}`,
        boardId: `wall-${i % boards}`,
        kind: i % 11 === 0 ? "textbox" : "text",
        x: 0,
        y: 0,
        width: 240,
        rotation: 0,
        // 내용이 서로 달라야 캐시가 한 항목으로 합쳐지지 않는다.
        content: `${a} ${b} 메모 ${i}번 — 오늘 적어 둔 생각 ${(i * 31) % 997}`,
        title: i % 5 === 0 ? `${b} ${i}` : undefined,
        aiOptOut: false,
        createdAt: i,
        updatedAt: i,
        lastVisitedAt: i,
      };
    });
  }

  it("처음 읽기 300ms 미만, 한 글자 검색 16ms 미만", async () => {
    await useStorage.getState().init();
    for (let b = 0; b < 10; b++) await putBoard(`wall-${b}`, `벽 ${b}`);
    await getDB().notes.bulkPut(synth(2000, 10));

    const loads: number[] = [];
    let index = await loadAllWallsIndex(); // 모듈·Dexie 첫 접근 비용은 재지 않는다.
    for (let r = 0; r < 5; r++) {
      // 읽을 때마다 색인·파생물 캐시를 차갑게 — 처음 열 때 비용을 그대로 잰다.
      __clearPlainCache();
      __clearAllWallsIndexCache();
      const t0 = performance.now();
      index = await loadAllWallsIndex();
      loads.push(performance.now() - t0);
    }
    expect(median(loads)).toBeLessThan(300);

    const cards = Array.from(index.buckets.values()).flatMap((b) => b.cards);
    expect(cards.length).toBeGreaterThanOrEqual(1990);

    // 한 글자씩 — 초성 하나, 완성 글자, 영문·숫자 섞어 서로 다른 질의 5개.
    const queries = ["ㅇ", "이", "ㄱ", "메", "1"];
    // 지금 벽을 store 카드로도 재 본다 — 그 벽 카드는 색인 대신 store 에서 매칭된다.
    const here = { boardId: "wall-0", cards: index.buckets.get("wall-0")!.cards };
    // 전체 스위트처럼 CPU 를 나눠 쓰는 중에는 한 번의 측정이 스케줄러 대기를 함께 잰다(같은 코드가
    // 단독에서 4~5ms, 부하에서 20~28ms 로 흔들렸다). 기준(16ms = 한 프레임)은 그대로 두고, 같은 질의
    // 묶음을 여러 번 돌려 가장 빠른 회차를 본다 — 대기는 시간을 더하기만 하므로 최소값이 이 코드의
    // 비용에 가깝다. 중앙값은 부하에서 대기에 끌려간다.
    const rounds = Array.from({ length: 7 }, () => {
      const times = queries.map((q) => {
        const t0 = performance.now();
        searchAllWalls(index, q, here);
        return performance.now() - t0;
      });
      return median(times);
    });
    expect(Math.min(...rounds)).toBeLessThan(16);
  });
});

describe("색인 재사용 (F7)", () => {
  it("노트와 벽이 그대로면 다시 열어도 같은 색인을 돌려준다", async () => {
    await useStorage.getState().init();
    await putBoard("w1", "벽 하나");
    await putNote({ id: "n1", boardId: "w1", content: "이직 고민" });

    const first = await loadAllWallsIndex();
    const second = await loadAllWallsIndex();

    expect(second).toBe(first);
  });

  it("노트가 바뀌면 다시 만든다 — 고친 글이 찾아진다", async () => {
    await useStorage.getState().init();
    await putBoard("w1", "벽 하나");
    await putNote({ id: "n1", boardId: "w1", content: "이직 고민", updatedAt: 1 });
    const first = await loadAllWallsIndex();

    await putNote({ id: "n1", boardId: "w1", content: "연주회 예매", updatedAt: 2 });
    const second = await loadAllWallsIndex();

    expect(second).not.toBe(first);
    expect(searchAllWalls(second, "연주회", { boardId: null, cards: [] }).rows).toHaveLength(1);
    expect(searchAllWalls(second, "이직", { boardId: null, cards: [] }).rows).toHaveLength(0);
  });

  it("벽 이름이 바뀌면 다시 만든다", async () => {
    await useStorage.getState().init();
    await putBoard("w1", "옛 이름");
    await putNote({ id: "n1", boardId: "w1", content: "이직 고민" });
    const first = await loadAllWallsIndex();

    await putBoard("w1", "새 이름");
    const second = await loadAllWallsIndex();

    expect(second).not.toBe(first);
    const rows = searchAllWalls(second, "이직", { boardId: null, cards: [] }).rows;
    expect(rows[0].boardName).toBe("새 이름");
  });

  it("검색 대상이 아닌 종류는 읽지 않는다 — 전체 노트를 훑지 않는다", async () => {
    await useStorage.getState().init();
    await putBoard("w1", "벽 하나");
    await putNote({ id: "n1", boardId: "w1", content: "이직 고민" });
    await putNote({ id: "img", boardId: "w1", kind: "image", content: "이직 사진" });
    const toArray = vi.spyOn(getDB().notes, "toArray");
    const loadAll = vi.spyOn(useStorage.getState(), "loadAllNotes");

    const index = await loadAllWallsIndex();

    expect(toArray).not.toHaveBeenCalled();
    expect(loadAll).not.toHaveBeenCalled();
    expect([...index.buckets.get("w1")!.byId.keys()]).toEqual(["n1"]);
  });
});
