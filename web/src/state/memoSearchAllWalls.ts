/**
 * KS-3 (T4·T13) — 모든 벽의 포스트잇 검색.
 *
 * 지금 검색은 화면에 올라온 벽 카드만 본다. 이 모듈은 검색 창이 열릴 때 기기 저장소에서
 * 모든 벽의 글을 한 번 읽어 색인을 만들고(D7 = A), 창이 열린 동안 그 색인을 재사용해
 * 키 입력마다 매칭한다. 매칭은 [[searchMemos]]를 그대로 쓴다 — 초성·부분 일치 규칙을
 * 다시 만들지 않는다.
 *
 *  - 지금 보는 벽은 색인이 아니라 메모리 store 의 카드로 매칭한다 — 저장되기 전 글이 반영된다.
 *  - 지운 메모는 별도 `trash` 테이블이라 `notes` 만 읽으면 된다.
 *  - 공유 벽도 이 기기에 있는 것만 찾는다. 서버에 묻지 않는다.
 *
 * UI 는 모른다 — 결과 한 줄(AllWallsRow)을 그리는 일은 검색 창 몫이다.
 */
import { memoTint } from "@/components/workspace/memoVariety";
import { t } from "@/i18n";
import { normalizeBoardId, SYSTEM_BOARD_ID } from "./boardIds";
import { systemBoardName } from "./systemBoardName";
import { getDB, type Board, type Note } from "./db/schema";
import {
  bodyTextOf,
  isSearchableKind,
  searchMemos,
  warmMemoIndex,
  type MatchRange,
  type MemoSearchHit,
} from "./memoSearch";
import { useStorage } from "./storage";
import { useWorkspace, type Card } from "./workspace";

/** 한 번에 돌려주는 최대 줄 수(D8 = A). 넘친 개수는 `more` 로 함께 준다. */
export const ALL_WALLS_RESULT_LIMIT = 50;

/** 결과 줄에 보일 글의 최대 길이. 첫 맞은 자리가 보이도록 이 창을 맞은 자리에 맞춘다. */
const SNIPPET_LIMIT = 80;
/** 창이 잘릴 때 첫 맞은 자리 앞에 남기는 글자 수. */
const SNIPPET_LEAD = 10;
/** 제목과 본문에 모두 맞았을 때 둘을 잇는 구분자. */
const TITLE_BODY_SEP = " · ";

/** 결과 한 줄. */
export interface AllWallsRow {
  /** 카드 id — 고르면 `jumpToCardWithFlash(id)`. */
  id: string;
  /** 정규화한 벽 id(시스템 벽은 SYSTEM_BOARD_ID). */
  boardId: string;
  /** 벽 이름. 시스템 벽은 "홈", 이름이 비면 "(이름 없는 프로젝트)". */
  boardName: string;
  /** 포스트잇 색 — 줄 왼쪽 네모에 칠하는 hex. */
  color: string;
  kind: Card["kind"];
  /** 보일 글 — 한 줄. 길면 맞은 자리 둘레만 남기고 `…` 로 줄인다. */
  text: string;
  /** `text` 위에 칠할 구간 `[start, end)`. 시작 순, 겹치지 않는다. */
  ranges: MatchRange[];
  /** 지금 보는 벽의 포스트잇인가. */
  current: boolean;
}

export interface AllWallsResult {
  /** 최대 [[ALL_WALLS_RESULT_LIMIT]]줄 — 지금 벽 먼저, 그다음 다른 벽(D2). */
  rows: AllWallsRow[];
  /** 상한에 걸려 못 돌려준 줄 수. "N개 더 있어요, 더 쳐 보세요". */
  more: number;
}

interface WallBucket {
  boardId: string;
  boardName: string;
  /** 검색 대상(글이 있는 text·textbox·photo)만. */
  cards: Card[];
  byId: Map<string, Card>;
}

/** 창이 열린 동안 쓰는 색인. 저장소가 바뀌어도 닫을 때까지 그대로다. */
export interface AllWallsIndex {
  buckets: Map<string, WallBucket>;
  /** 카드 id → 저장된 마지막 고친 시각. 같은 점수끼리 최근 고친 순을 가른다. */
  updatedAt: Map<string, number>;
}

/** 지금 보는 벽 — 메모리 store 의 카드. */
export interface CurrentWall {
  boardId: string | null;
  cards: Card[];
}

const EMPTY_RESULT: AllWallsResult = { rows: [], more: 0 };

function boardNameOf(boardId: string, boards: Map<string, Board>): string {
  if (boardId === SYSTEM_BOARD_ID) return systemBoardName(boards);
  const name = boards.get(boardId)?.name?.trim();
  return name ? name : t("workspace.boardPicker.unnamed");
}

/**
 * 저장된 노트와 벽 목록 → 색인. 순수 함수다. 글이 없는 카드(빈 메모·캡션 없는 사진)와
 * 검색 대상이 아닌 종류는 처음부터 넣지 않는다.
 */
export function buildAllWallsIndex(notes: Note[], boards: Board[]): AllWallsIndex {
  const boardMap = new Map(boards.map((b) => [b.id, b]));
  const buckets = new Map<string, WallBucket>();
  const updatedAt = new Map<string, number>();
  for (const note of notes) {
    if (!isSearchableKind(note.kind)) continue;
    if (!note.content && !note.title) continue;
    const boardId = normalizeBoardId(note.boardId);
    let bucket = buckets.get(boardId);
    if (!bucket) {
      bucket = {
        boardId,
        boardName: boardNameOf(boardId, boardMap),
        cards: [],
        byId: new Map(),
      };
      buckets.set(boardId, bucket);
    }
    const card: Card = {
      id: note.id,
      kind: note.kind,
      x: 0,
      y: 0,
      width: 0,
      content: note.content,
      title: note.title,
      color: note.color,
    };
    bucket.cards.push(card);
    bucket.byId.set(card.id, card);
    updatedAt.set(card.id, note.updatedAt);
  }
  return { buckets, updatedAt };
}

/** 색인과 그것을 만든 저장소 상태의 서명. 서명이 같으면 색인을 그대로 쓴다. */
interface CachedIndex {
  db: unknown;
  signature: string;
  index: AllWallsIndex;
}

/** 창을 닫아도 남는다. 노트나 벽 이름이 바뀌어 서명이 달라질 때만 다시 만든다. */
let cachedIndex: CachedIndex | null = null;

/** 노트·벽 목록의 서명. 본문이 바뀌면 updatedAt(과 길이)이 바뀐다. */
function signatureOf(notes: Note[], boards: Board[]): string {
  const rows = notes.map(
    (n) =>
      `${n.id}:${n.boardId ?? ""}:${n.updatedAt}:${n.content?.length ?? 0}:${n.title?.length ?? 0}`,
  );
  const names = boards.map((b) => `${b.id}:${b.name ?? ""}`);
  return `${rows.join("\n")}\n--\n${names.join("\n")}`;
}

/**
 * 창을 열 때 부른다 — 모든 벽의 글을 기기 저장소에서 읽는다. 읽는 것은 본문 검색 대상
 * 종류(text·textbox·photo)뿐이다 — 펜 손글씨·함·이미지 행은 건드리지 않는다.
 * 읽은 것이 지난번과 같으면(노트·벽 이름이 안 바뀌었으면) 지난 색인을 그대로 돌려준다.
 * 결과를 창이 열린 동안 들고 있다가 키 입력마다 [[searchAllWalls]] 에 넘긴다.
 */
export async function loadAllWallsIndex(): Promise<AllWallsIndex> {
  const storage = useStorage.getState();
  if (!storage.initialized) await storage.init();
  const db = getDB();
  const [notes, boards] = await Promise.all([storage.loadSearchableNotes(), storage.loadBoards()]);
  const signature = signatureOf(notes, boards);
  if (cachedIndex && cachedIndex.db === db && cachedIndex.signature === signature) {
    return cachedIndex.index;
  }
  const index = buildAllWallsIndex(notes, boards);
  for (const bucket of index.buckets.values()) warmMemoIndex(bucket.cards);
  cachedIndex = { db, signature, index };
  return index;
}

/** 테스트용 — 색인 캐시를 비워 다음 읽기가 처음부터 만들게 한다. */
export function __clearAllWallsIndexCache(): void {
  cachedIndex = null;
}

function readCurrentWall(): CurrentWall {
  const { currentBoardId, cards } = useWorkspace.getState();
  return { boardId: currentBoardId, cards };
}

/** 글자 하나씩 1:1 로 공백으로 바꿔 한 줄로 만든다 — 칠할 구간 위치가 어긋나지 않는다. */
function oneLine(text: string): string {
  return text.replace(/\s/g, " ");
}

/** 본문 위 칠할 구간 → 줄에 보일 창. 첫 맞은 자리 둘레를 남기고 잘린 쪽에 `…` 를 붙인다. */
function snippet(body: string, ranges: MatchRange[]): { text: string; ranges: MatchRange[] } {
  const first = ranges[0][0];
  let start = Math.max(first - SNIPPET_LEAD, 0);
  // 맨 앞이면 앞쪽 공백(textbox 의 들머리 줄바꿈)은 건너뛴다.
  if (start === 0) start = Math.min(body.length - body.trimStart().length, first);
  const end = Math.min(start + SNIPPET_LIMIT, body.length);
  const head = start > 0 ? "…" : "";
  const tail = end < body.length ? "…" : "";
  const out: MatchRange[] = [];
  for (const [s, e] of ranges) {
    const from = Math.max(s, start);
    const to = Math.min(e, end);
    if (from < to) out.push([from - start + head.length, to - start + head.length]);
  }
  return { text: head + body.slice(start, end) + tail, ranges: out };
}

/**
 * 한 카드의 맞은 자리 → 줄에 보일 글. 제목에 맞았으면 제목을, 본문에 맞았으면 본문 창을
 * 보인다. 낱말이 제목과 본문에 나뉘어 맞았으면 둘을 이어 보여 모든 낱말이 칠해진다.
 */
function displayOf(card: Card, hit: MemoSearchHit): { text: string; ranges: MatchRange[] } {
  const title = card.title && hit.titleRanges.length > 0 ? oneLine(card.title) : null;
  let body: { text: string; ranges: MatchRange[] } | null = null;
  if (hit.bodyRanges.length > 0) {
    body = snippet(oneLine(bodyTextOf(card)), hit.bodyRanges);
  }
  if (title !== null && body) {
    const shift = title.length + TITLE_BODY_SEP.length;
    return {
      text: title + TITLE_BODY_SEP + body.text,
      ranges: [
        ...hit.titleRanges,
        ...body.ranges.map(([s, e]): MatchRange => [s + shift, e + shift]),
      ],
    };
  }
  if (title !== null) return { text: title, ranges: hit.titleRanges };
  if (body) return body;
  return { text: "", ranges: [] };
}

interface Candidate {
  hit: MemoSearchHit;
  card: Card;
  bucket: Pick<WallBucket, "boardId" | "boardName">;
  updatedAt: number;
  current: boolean;
}

/**
 * 모든 벽에서 검색한다. 순서는 지금 벽 → 다른 벽, 각 묶음 안은 맞은 횟수 내림차순, 같으면
 * 최근 고친 순(D2 = A). 최대 [[ALL_WALLS_RESULT_LIMIT]]줄만 줄로 만들고 넘친 수를 `more` 로 준다.
 * 빈 검색어는 빈 결과다.
 */
export function searchAllWalls(
  index: AllWallsIndex,
  query: string,
  current: CurrentWall = readCurrentWall(),
): AllWallsResult {
  if (!query.trim()) return EMPTY_RESULT;
  const currentId = normalizeBoardId(current.boardId);

  const candidates: Candidate[] = [];

  // 지금 벽 — store 카드. 저장 전 글과, 저장소에 아직 없는 새 카드도 잡힌다.
  const currentHits = searchMemos(current.cards, query);
  if (currentHits.length > 0) {
    const cardById = new Map(current.cards.map((c) => [c.id, c]));
    const bucket = index.buckets.get(currentId);
    const name = bucket?.boardName ?? boardNameFallback(currentId);
    for (const hit of currentHits) {
      const card = cardById.get(hit.id);
      if (!card) continue;
      candidates.push({
        hit,
        card,
        bucket: { boardId: currentId, boardName: name },
        updatedAt: Math.max(index.updatedAt.get(hit.id) ?? 0, card.lastVisitedAt ?? 0),
        current: true,
      });
    }
  }

  // 다른 벽 — 색인. 지금 벽의 색인은 store 보다 낡았을 수 있어 건너뛴다.
  for (const bucket of index.buckets.values()) {
    if (bucket.boardId === currentId) continue;
    for (const hit of searchMemos(bucket.cards, query)) {
      const card = bucket.byId.get(hit.id);
      if (!card) continue;
      candidates.push({
        hit,
        card,
        bucket,
        updatedAt: index.updatedAt.get(hit.id) ?? 0,
        current: false,
      });
    }
  }

  candidates.sort(
    (a, b) =>
      Number(b.current) - Number(a.current) ||
      b.hit.score - a.hit.score ||
      b.updatedAt - a.updatedAt,
  );

  const rows = candidates.slice(0, ALL_WALLS_RESULT_LIMIT).map((c): AllWallsRow => {
    const { text, ranges } = displayOf(c.card, c.hit);
    return {
      id: c.card.id,
      boardId: c.bucket.boardId,
      boardName: c.bucket.boardName,
      color: memoTint(c.card.id, c.card.color),
      kind: c.card.kind,
      text,
      ranges,
      current: c.current,
    };
  });
  return { rows, more: candidates.length - rows.length };
}

/** 지금 벽에 저장된 글이 하나도 없어 색인에 벽 이름이 없을 때의 이름. */
function boardNameFallback(boardId: string): string {
  const board = useWorkspace.getState().boards.find((b) => b.id === boardId);
  return boardNameOf(boardId, new Map(board ? [[board.id, board]] : []));
}
