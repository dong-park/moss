"use client";

import { create } from "zustand";
import type { Board, Note } from "./db/schema";
import { useStorage } from "./storage";
import { countBlocks, type BlockCounts } from "./blocks";
import { plainTextRaw, searchMemos } from "./memoSearch";
import { normalizeTitle, normalizeTitleTyping } from "./memoTitle";
import { useWorkspace, SYSTEM_BOARD_ID } from "./workspace";
import { subscribeNoteChanges } from "./db/liveSync";
import { cancelPersist } from "./cardPersist";
import { t } from "@/i18n";

/* ─────────────────────────────────────────────────────────────
 * FEAT-memo-table-view — 전체 메모 표 뷰 상태·셀렉터.
 *
 * 표는 현재 보드 스토어(`workspace.cards`)가 아니라 모든 보드의 노트를 별도로
 * 조회한다(spec §4: 카드 스토어는 현재 보드만 들고 있다). 파생(보드 경로·미리보기·
 * 배지)은 순수 함수로 분리해 단위 테스트한다(spec §10 단위: 필터·정렬·검색 셀렉터 ·
 * boardPath 계산 · 텍스트/함/메모판 제외).
 *
 * 뷰 상태(정렬·필터·검색·선택)는 세션 메모리만 — 영속하지 않는다(spec §2 제외).
 * ───────────────────────────────────────────────────────────── */

/** 시스템 보드(무소속) 메모를 필터에서 가리키는 키. boardId=null의 표기. */
export const SYSTEM_BOARD_KEY = SYSTEM_BOARD_ID;

export type MemoSortKey = "title" | "createdAt" | "updatedAt";

export interface MemoSort {
  key: MemoSortKey;
  dir: "asc" | "desc";
}

export interface MemoFilters {
  /** "all" 또는 보드 키(시스템은 "system", 사용자 보드는 id) 목록. */
  boardFilter: "all" | string[];
  /** 선택한 보드의 하위 함(서브보드)까지 포함할지. */
  includeSubboards: boolean;
  /** 메모판(frame) id 필터. null이면 전체. */
  frameFilter: string[] | null;
  /** true=첨부 있는 행만, false=첨부 없는 행만, null=전체. */
  hasAttachment: boolean | null;
  query: string;
}

export interface MemoRow {
  id: string;
  title: string;
  /** 본문 평문 1줄(대소문자 보존, 최대 [[PREVIEW_LIMIT]]자). */
  preview: string;
  /** 검색 전용 본문 평문(전체 길이 — 미리보기 잘림에 영향받지 않게). */
  searchText: string;
  /** storage 기준 boardId(null=시스템 보드). */
  boardId: string | null;
  /** 보드 경로 라벨 — "루트 › 함이름" (시스템 보드는 시스템 라벨). */
  boardPath: string;
  frameId?: string;
  frameName?: string;
  createdAt: number;
  updatedAt: number;
  badgeCounts: BlockCounts;
  /** 검색어가 미리보기에서 처음 매칭된 위치(없으면 null). AC-3 강조용. */
  match: { start: number; length: number } | null;
}

export const PREVIEW_LIMIT = 160;

export const DEFAULT_SORT: MemoSort = { key: "updatedAt", dir: "desc" };

export function defaultFilters(currentBoardId: string): MemoFilters {
  return {
    boardFilter: [currentBoardId],
    includeSubboards: true,
    frameFilter: null,
    hasAttachment: null,
    query: "",
  };
}

/** 노트가 속한 필터 키(시스템 보드는 "system"). */
export function boardKeyOf(noteBoardId: string | null): string {
  return noteBoardId ?? SYSTEM_BOARD_KEY;
}

/**
 * rootKey의 자손까지 포함한 보드 키 집합(자신 포함). 사이클 방어.
 * 시스템 보드의 자손은 parentBoardId==="system"인 보드들과 그 후손이다.
 */
export function descendantBoardKeys(
  boards: Board[],
  rootKey: string,
): Set<string> {
  const out = new Set<string>([rootKey]);
  let frontier = [rootKey];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const b of boards) {
      const parent = b.parentBoardId ?? null;
      if (parent && frontier.includes(parent) && !out.has(b.id)) {
        out.add(b.id);
        next.push(b.id);
      }
    }
    frontier = next;
  }
  return out;
}

/**
 * 보드 경로 라벨. boardId=null이면 시스템 라벨. 루트→현재 순 이름을 " › "로 잇는다.
 * 시스템 보드에 직접 매달린 함은 "시스템 › 함이름"으로 표기한다. 사이클 방어.
 */
export function boardPathLabel(
  boards: Board[],
  boardId: string | null,
  systemLabel: string,
): string {
  return boardPathLabelFromMap(
    new Map(boards.map((b) => [b.id, b])),
    boardId,
    systemLabel,
  );
}

/** boardPathLabel의 Map 조회 버전 — 행마다 boards.find(O(n))를 피한다(P1-6). */
function boardPathLabelFromMap(
  map: Map<string, Board>,
  boardId: string | null,
  systemLabel: string,
): string {
  if (boardId === null) return systemLabel;
  const chain: string[] = [];
  const guard = new Set<string>();
  let id: string | null | undefined = boardId;
  while (id && !guard.has(id)) {
    guard.add(id);
    const board = map.get(id);
    if (!board) break;
    chain.unshift(board.name);
    const parent = board.parentBoardId ?? null;
    if (parent === SYSTEM_BOARD_ID) {
      chain.unshift(systemLabel);
      break;
    }
    id = parent;
  }
  return chain.length > 0 ? chain.join(" › ") : systemLabel;
}

/** 본문 평문(전체) → 평문 1줄 미리보기(대소문자 보존). 이중 파싱 방지(P1-6). */
export function previewFromRaw(raw: string): string {
  if (raw.length <= PREVIEW_LIMIT) return raw;
  return `${raw.slice(0, PREVIEW_LIMIT)}…`;
}

/** 본문 → 평문 1줄 미리보기(대소문자 보존). */
export function previewOf(content: string): string {
  return previewFromRaw(plainTextRaw(content));
}

/** 검색어(또는 첫 토큰)가 미리보기에서 처음 매칭되는 위치. 없으면 null. */
export function matchInPreview(
  preview: string,
  query: string,
): { start: number; length: number } | null {
  const q = query.trim();
  if (!q) return null;
  const lower = preview.toLowerCase();
  const candidates = [q, ...q.split(/\s+/).filter(Boolean)];
  for (const c of candidates) {
    const idx = lower.indexOf(c.toLowerCase());
    if (idx >= 0) return { start: idx, length: c.length };
  }
  return null;
}

/** 프레임(frame) 노트 id → 표시 이름. */
export function frameNameMap(notes: Note[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const n of notes) {
    if (n.kind !== "frame") continue;
    map.set(n.id, decodeFrameName(n.content));
  }
  return map;
}

function decodeFrameName(content: string): string {
  try {
    const parsed = JSON.parse(content) as { name?: string };
    const name = parsed.name?.trim();
    return name ? name : "새 메모판";
  } catch {
    return "새 메모판";
  }
}

/** 노트 목록 → 표 행(파생). 대상은 kind==="text"만 — 텍스트·함·메모판 제외(spec §2). */
export function buildMemoRows(
  notes: Note[],
  boards: Board[],
  systemLabel: string,
): MemoRow[] {
  const frames = frameNameMap(notes);
  const boardMap = new Map(boards.map((b) => [b.id, b]));
  const rows: MemoRow[] = [];
  for (const note of notes) {
    if (note.kind !== "text") continue;
    // plainTextRaw를 한 번만 파싱해 preview·searchText에 함께 쓴다(P1-6).
    const raw = plainTextRaw(note.content);
    rows.push({
      id: note.id,
      title: note.title ?? "",
      preview: previewFromRaw(raw),
      searchText: raw,
      boardId: note.boardId,
      boardPath: boardPathLabelFromMap(boardMap, note.boardId, systemLabel),
      frameId: note.frameId,
      frameName: note.frameId ? frames.get(note.frameId) : undefined,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      badgeCounts: countBlocks(note.content),
      match: null,
    });
  }
  return rows;
}

function badgeTotal(counts: BlockCounts): number {
  return counts.image + counts.link + counts.audio + counts.file;
}

function selectedBoardKeys(filters: MemoFilters, boards: Board[]): Set<string> | null {
  if (filters.boardFilter === "all") return null;
  const out = new Set<string>();
  for (const key of filters.boardFilter) {
    if (filters.includeSubboards) {
      for (const k of descendantBoardKeys(boards, key)) out.add(k);
    } else {
      out.add(key);
    }
  }
  return out;
}

/** 보드·메모판·첨부 필터 적용. 검색은 별도(applySearch). */
export function applyFilters(
  rows: MemoRow[],
  filters: MemoFilters,
  boards: Board[],
): MemoRow[] {
  const boardKeys = selectedBoardKeys(filters, boards);
  const frameSet = filters.frameFilter ? new Set(filters.frameFilter) : null;
  return rows.filter((r) => {
    if (boardKeys && !boardKeys.has(boardKeyOf(r.boardId))) return false;
    if (frameSet && (!r.frameId || !frameSet.has(r.frameId))) return false;
    if (filters.hasAttachment !== null) {
      const has = badgeTotal(r.badgeCounts) > 0;
      if (has !== filters.hasAttachment) return false;
    }
    return true;
  });
}

/**
 * 검색 적용. 기존 [[searchMemos]]를 재사용한다(spec §2) — 매칭 카드 id 집합으로
 * 행을 거르고, 미리보기 매칭 위치를 계산해 AC-3 강조에 쓴다. query가 비면 원본 유지.
 */
export function applySearch(rows: MemoRow[], query: string): MemoRow[] {
  const q = query.trim();
  if (!q) return rows;
  const asCards = rows.map((r) => ({
    id: r.id,
    kind: "text" as const,
    x: 0,
    y: 0,
    width: 0,
    content: r.searchText,
    title: r.title || undefined,
  }));
  const matched = searchMemos(asCards, q).map((m) => m.id);
  const rank = new Map(matched.map((id, i) => [id, i]));
  const out: MemoRow[] = [];
  for (const r of rows) {
    if (!rank.has(r.id)) continue;
    out.push({ ...r, match: matchInPreview(r.preview, q) });
  }
  // 매칭 점수 순서를 안정 정렬의 1차 키로 남긴다(이후 정렬이 재정렬).
  out.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  return out;
}

/** 정렬. 제목은 빈 제목을 항상 뒤로 보낸다. */
export function applySort(rows: MemoRow[], sort: MemoSort): MemoRow[] {
  const dir = sort.dir === "asc" ? 1 : -1;
  const sorted = [...rows];
  sorted.sort((a, b) => {
    if (sort.key === "title") {
      const at = a.title.trim();
      const bt = b.title.trim();
      if (!at && !bt) return 0;
      if (!at) return 1; // 빈 제목은 방향과 무관하게 뒤로.
      if (!bt) return -1;
      return at.localeCompare(bt, "ko") * dir;
    }
    const av = sort.key === "createdAt" ? a.createdAt : a.updatedAt;
    const bv = sort.key === "createdAt" ? b.createdAt : b.updatedAt;
    if (av === bv) return 0;
    return (av - bv) * dir;
  });
  return sorted;
}

/**
 * 필터 → 검색 → 정렬 합성. 표가 실제로 렌더할 행 목록. 보통 검색 매칭이 적으므로
 * 먼저 필터로 줄이고 검색을 건다.
 */
export function deriveRows(
  notes: Note[],
  boards: Board[],
  filters: MemoFilters,
  sort: MemoSort,
  systemLabel: string = t("workspace.boardPicker.system"),
): MemoRow[] {
  return deriveFromBase(
    buildMemoRows(notes, boards, systemLabel),
    boards,
    filters,
    sort,
  );
}

/**
 * 이미 만든 기본 행(notes/boards에만 의존) 위에서 필터·검색·정렬만 다시 적용한다.
 * 표는 baseRows를 notes·boards 변화에만 메모이즈하고, 검색 키 입력마다 5,000행을
 * 재생성하지 않는다(P1-6).
 */
export function deriveFromBase(
  baseRows: MemoRow[],
  boards: Board[],
  filters: MemoFilters,
  sort: MemoSort,
): MemoRow[] {
  const filtered = applyFilters(baseRows, filters, boards);
  const searched = applySearch(filtered, filters.query);
  return applySort(searched, sort);
}

/* ───────────────────────── store ───────────────────────── */

interface MemoTableStore {
  /** 모든 보드의 노트(표 소스). */
  notes: Note[];
  /** 보드 목록 — 보드 경로·필터 옵션. */
  boards: Board[];
  loaded: boolean;
  loading: boolean;

  sort: MemoSort;
  boardFilter: "all" | string[];
  includeSubboards: boolean;
  frameFilter: string[] | null;
  hasAttachment: boolean | null;
  query: string;
  selectedIds: Set<string>;
  /**
   * 인라인 제목 편집 중인 노트와 편집 시작 시점의 원값(P1-1·P1-2). reload가
   * notes를 DB값으로 덮어도 이 id의 입력은 보존하고, commit 시 draft(인자)를
   * 확정한다. 값이 같으면 DB·updatedAt을 건드리지 않는다.
   */
  titleEdit: { id: string; original: string } | null;

  /** 표 진입 시 1회 로드 + 기본 보드 필터(현재 보드) 설정 + 변경 구독. */
  ensureLoaded: () => Promise<void>;
  /** 모든 노트·보드를 다시 읽는다(AC-8 실시간 반영). */
  reload: () => Promise<void>;

  setSort: (key: MemoSortKey) => void;
  setBoardFilter: (filter: "all" | string[]) => void;
  setIncludeSubboards: (include: boolean) => void;
  setFrameFilter: (frames: string[] | null) => void;
  setHasAttachment: (v: boolean | null) => void;
  setQuery: (q: string) => void;

  toggleSelected: (id: string) => void;
  setSelectedIds: (ids: Set<string>) => void;
  clearSelection: () => void;

  /** 인라인 제목 편집 시작 — 원값을 기억한다(취소·무변경 판정용). */
  beginTitleEdit: (id: string, original: string) => void;
  /** 타이핑(로컬 반영, 앞뒤 공백 보존). */
  setTitle: (id: string, title: string) => void;
  /** 편집 종료 — draft를 normalizeTitle 규칙으로 확정·영속(AC-5). 무변경이면 no-op. */
  commitTitle: (id: string, draft: string) => Promise<void>;
  /** 편집 취소 — 원값 복원만(영속 없음). */
  cancelTitleEdit: (id: string) => void;

  /** 선택 행을 휴지통으로(AC-7). 기존 [[workspace.removeSelected]] 경로 재사용. */
  trashSelected: () => Promise<void>;
  /** 표에서 메모창을 연다 — 소속 보드로 전환해 카드 스토어에 올린 뒤 펼치기(AC-2). */
  openMemo: (id: string) => Promise<void>;
}

let unsubscribed = false;

export const useMemoTable = create<MemoTableStore>((set, get) => ({
  notes: [],
  boards: [],
  loaded: false,
  loading: false,

  sort: DEFAULT_SORT,
  boardFilter: [SYSTEM_BOARD_ID],
  includeSubboards: true,
  frameFilter: null,
  hasAttachment: null,
  query: "",
  selectedIds: new Set<string>(),
  titleEdit: null,

  ensureLoaded: async () => {
    if (get().loading) return;
    set({ loading: true });
    // 기본 보드 필터 = 현재 보드(spec §0). 표에 들어올 때마다(재마운트 포함) 현재
    // 보드 맥락으로 잡는다 — AC-1 "표가 뜨고 보드 필터가 X로 잡혀 있다".
    set({ boardFilter: [useWorkspace.getState().currentBoardId] });
    const storage = useStorage.getState();
    if (!storage.initialized) await storage.init();
    const [notes, boards] = await Promise.all([
      storage.loadAllNotes(),
      storage.loadBoards(),
    ]);
    set({ notes, boards, loaded: true, loading: false });
    if (!unsubscribed) {
      unsubscribed = true;
      // AC-8: 다른 탭(liveSync)의 변경을 표에 반영한다. 반드시 Promise를
      // 돌려줘야 handleIncoming이 reload 완료까지 기다린다(테스트 결정성).
      subscribeNoteChanges(() => get().reload());
    }
  },

  reload: async () => {
    const storage = useStorage.getState();
    if (!storage.initialized) return;
    const [notes, boards] = await Promise.all([
      storage.loadAllNotes(),
      storage.loadBoards(),
    ]);
    set((s) => {
      const alive = new Set(notes.map((n) => n.id));
      const selectedIds = new Set(
        [...s.selectedIds].filter((id) => alive.has(id)),
      );
      // 편집 중인 제목은 DB값으로 덮지 않는다(P1-1) — 타이핑 입력 유실 방지.
      const editingId = s.titleEdit?.id;
      const existing = s.notes.find((n) => n.id === editingId);
      const merged =
        editingId && existing
          ? notes.map((n) => (n.id === editingId ? existing : n))
          : notes;
      return { notes: merged, boards, loaded: true, selectedIds };
    });
  },

  setSort: (key) =>
    set((s) => {
      if (s.sort.key === key) {
        return { sort: { key, dir: s.sort.dir === "asc" ? "desc" : "asc" } };
      }
      return { sort: { key, dir: "asc" } };
    }),

  setBoardFilter: (boardFilter) => set({ boardFilter }),
  setIncludeSubboards: (includeSubboards) => set({ includeSubboards }),
  setFrameFilter: (frameFilter) => set({ frameFilter }),
  setHasAttachment: (hasAttachment) => set({ hasAttachment }),
  setQuery: (query) => set({ query }),

  toggleSelected: (id) =>
    set((s) => {
      const next = new Set(s.selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedIds: next };
    }),
  setSelectedIds: (selectedIds) => set({ selectedIds }),
  clearSelection: () => set({ selectedIds: new Set() }),

  beginTitleEdit: (id, original) => set({ titleEdit: { id, original } }),

  setTitle: (id, title) => {
    const typed = normalizeTitleTyping(title);
    set((s) => ({
      notes: s.notes.map((n) =>
        n.id === id ? { ...n, title: typed || undefined } : n,
      ),
    }));
    // 현재 보드에 로드된 카드면 카드 스토어에도 반영(캔버스 앞면 일관성, AC-5).
    const ws = useWorkspace.getState();
    if (ws.cards.some((c) => c.id === id)) ws.setTitle(id, typed);
    // 다른 보드 메모는 편집 확정 시에만 영속한다(타이핑마다 DB 쓰기 방지).
  },

  commitTitle: async (id, draft) => {
    const edit = get().titleEdit;
    const note = get().notes.find((n) => n.id === id);
    if (!note) {
      set({ titleEdit: null });
      return;
    }
    // 확정값은 인자 draft에서 계산한다 — reload가 store title을 DB값으로 덮어도
    // 편집 입력이 유실되지 않는다(P1-1).
    const normalized = normalizeTitle(draft);
    const original =
      edit && edit.id === id ? edit.original : (note.title ?? "");
    if (normalized === original) {
      // 무변경 — Esc와 같다. 원값 복원만, DB·updatedAt 무변경(P1-2).
      get().cancelTitleEdit(id);
      return;
    }
    // 타이핑 중 예약된 영속이 있으면 버리고 확정값으로 대체한다.
    cancelPersist(id);
    set((s) => ({
      titleEdit: null,
      notes: s.notes.map((n) =>
        n.id === id ? { ...n, title: normalized || undefined } : n,
      ),
    }));
    useWorkspace.setState((s) => ({
      cards: s.cards.map((c) =>
        c.id === id ? { ...c, title: normalized || undefined } : c,
      ),
    }));
    // 현재 보드 카드든 다른 보드 메모든 DB에 직접 쓴다(P1-2). 없는 노트는 no-op.
    await useStorage.getState().updateNoteTitle(id, normalized || undefined);
  },

  cancelTitleEdit: (id) => {
    const edit = get().titleEdit;
    if (!edit || edit.id !== id) {
      set({ titleEdit: null });
      return;
    }
    cancelPersist(id); // 타이핑 중 예약된 영속 취소 — 원값이 DB에 남는다.
    const original = edit.original;
    set((s) => ({
      titleEdit: null,
      notes: s.notes.map((n) =>
        n.id === id ? { ...n, title: original || undefined } : n,
      ),
    }));
    useWorkspace.setState((s) => ({
      cards: s.cards.map((c) =>
        c.id === id ? { ...c, title: original || undefined } : c,
      ),
    }));
  },

  trashSelected: async () => {
    // 표는 text 메모만 보여준다 — 함·메모판이 섞여 들어와도 안전하게 걸러낸다.
    const targetIds = new Set(
      get()
        .notes.filter((n) => n.kind === "text")
        .map((n) => n.id),
    );
    const ids = [...get().selectedIds].filter((id) => targetIds.has(id));
    if (ids.length === 0) return;
    set({ selectedIds: new Set() });
    const storage = useStorage.getState();
    if (!storage.initialized) await storage.init();
    // 캔버스 스토어에서도 제거(현재 보드에 로드돼 있으면) — 일관성 유지.
    useWorkspace.setState((s) => ({
      cards: s.cards.filter((c) => !ids.includes(c.id)),
      selectedIds: s.selectedIds.filter((x) => !ids.includes(x)),
      editingId: s.editingId && ids.includes(s.editingId) ? null : s.editingId,
      expandedCardId:
        s.expandedCardId && ids.includes(s.expandedCardId)
          ? null
          : s.expandedCardId,
    }));
    // 기존 경로 재사용 — 연결선 스냅샷(trashConnections)·되돌리기 복구 동일(AC-7).
    await storage.trashNotes(ids);
    void useWorkspace.getState().refreshTrashCount();
    await get().reload();
  },

  openMemo: async (id) => {
    const note = get().notes.find((n) => n.id === id);
    if (!note) return;
    const boardId = note.boardId ?? SYSTEM_BOARD_ID;
    await useWorkspace.getState().setCurrentBoard(boardId);
    useWorkspace.getState().setExpandedCard(id);
  },
}));

/** 테스트 격리 — 구독 플래그·상태 초기화. */
export function __resetMemoTableForTest(): void {
  unsubscribed = false;
  useMemoTable.setState({
    notes: [],
    boards: [],
    loaded: false,
    loading: false,
    sort: DEFAULT_SORT,
    boardFilter: [SYSTEM_BOARD_ID],
    includeSubboards: true,
    frameFilter: null,
    hasAttachment: null,
    query: "",
    selectedIds: new Set<string>(),
    titleEdit: null,
  });
}
