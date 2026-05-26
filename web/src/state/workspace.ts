"use client";

import { create } from "zustand";
import type { AINoteRef } from "./aiGate";
import { useStorage } from "./storage";
import { getDB, type Board, type Note, type NoteKind } from "./db/schema";
import { migratedContent } from "./markdownMigration";
import { enqueueEmbed as enqueueEmbedRaw } from "./ai/embeddingQueue";
import {
  parseCode,
  parseHandwriting,
  serializeBlocks,
  type CardBlock,
} from "./cardContent";
import { getTemplate } from "@/templates";
import type { Translator } from "@/i18n";

/**
 * 시스템 보드 "머무는 생각"의 가상 id. DB에는 row를 두지 않고
 * 실제 노트는 boardId=null로 저장한다 (FEAT-boards 결정 1).
 */
export const SYSTEM_BOARD_ID = "system" as const;
export type CurrentBoardId = string;

/**
 * 캔버스 카드 종류.
 * - 10종은 [[NoteKind]]와 동일 (FEAT-capture). storage 저장 시 그대로 매핑.
 * - "comment"는 system 카드 (FEAT-canvas) — author/time 메타를 JSON 인코딩해
 *   NoteKind="text"로 저장한다.
 */
export type CardKind = NoteKind | "comment";

/**
 * 사이드바 도구 식별자.
 * - 앞쪽 10종은 FEAT-capture 캡처 도구 — CardKind와 1:1.
 * - 나머지는 다른 FEAT(canvas/boards/AI) 담당.
 */
export type ToolId =
  // capture 10종
  | "text"
  | "handwriting"
  | "mindmap"
  | "highlight"
  | "checklist"
  | "image"
  | "link"
  | "audio"
  | "file"
  | "code"
  // non-capture (다른 FEAT)
  | "line"
  | "board"
  | "column"
  | "comment"
  // FEAT-markdown-memo-pen: 펜 모드 토글 (드롭-캡처 아님).
  | "pen"
  | "more"
  | "trash";

/**
 * 캡처 도구 8종 — Cmd+1~Cmd+8 단축키 매핑 순서이자 사이드바 노출 순서.
 * spec FEAT-capture §3 AC-1 의존.
 *
 * FEAT-card-allinone: code·handwriting은 글(text) 카드 블록으로 흡수되어
 * 단독 캡처 도구에서 제외(10→8종). CardKind/NoteKind에는 호환·마이그레이션
 * 타겟으로 남는다.
 */
export const CAPTURE_TOOLS = [
  "text",
  "image",
  "link",
  "audio",
  "mindmap",
  "file",
] as const satisfies readonly ToolId[];

export type CaptureToolId = (typeof CAPTURE_TOOLS)[number];

export interface Card {
  id: string;
  kind: CardKind;
  x: number;
  y: number;
  width: number;
  /** 사용자가 리사이즈한 높이. 미정의면 콘텐츠 자동 높이. */
  height?: number;
  content: string;
  attachmentRef?: string;
  mediaType?: string;
  /**
   * FEAT-markdown-memo-pen: 펜 모드로 이 카드 위에 덧그린 손글씨 레이어(JSON `{paths}`).
   * content와 독립 — 마크다운 본문 위에 겹쳐 그린다. 없으면 그림 없음.
   */
  overlay?: string;
  author?: string;
  time?: string;
  aiOptOut?: boolean;
  /**
   * FEAT-home: 재노출 가치 휴리스틱('지금 머무는 생각')의 기준 시각.
   * createdAt 또는 마지막 편집/뷰 시각. Note.lastVisitedAt에서 매핑된다.
   * 신규 카드는 생성 시각으로 초기화된다.
   */
  lastVisitedAt?: number;
}

/**
 * FEAT-privacy AC-3: AI 호출 직전 사용자 동의 대기 중인 요청.
 */
export interface PendingAIGate {
  reason: string;
  notes: AINoteRef[];
  resolve: (confirmed: boolean) => void;
}

export interface Viewport {
  x: number;
  y: number;
  scale: number;
}

/**
 * 사이드바 도구를 마우스로 끌고 있는 동안의 상태.
 * 마우스 클라이언트 좌표는 SidebarDragPreview가 따라가는 데 쓰인다.
 */
export interface SidebarDrag {
  toolId: ToolId;
  screenX: number;
  screenY: number;
}

/** FEAT-boards §8: 보드 삭제 5초 후 영구 폐기 전까지 보관하는 스냅샷. */
export interface PendingBoardUndo {
  board: Board;
  affectedNoteIds: string[];
  expiresAt: number;
}

export const BOARD_UNDO_MS = 5000;

export const MIN_SCALE = 0.25;
export const MAX_SCALE = 3;

/** 카드 리사이즈 한계. SPEC AC-3. */
export const CARD_MIN_WIDTH = 120;
export const CARD_MIN_HEIGHT = 60;
export const CARD_MAX_WIDTH = 1200;
export const CARD_MAX_HEIGHT = 1200;

/** FEAT-markdown-memo-pen: 펜 굵기 한계·기본값 (handwriting 카드와 동일 시맨틱). */
export const PEN_MIN_WIDTH = 1;
export const PEN_MAX_WIDTH = 12;
export const PEN_DEFAULT_WIDTH = 1.5;

/** 카드 PNG (/cards/v2/{kind}.png)의 trim된 종이 가로/세로 비율. resize는 이 비율을 강제한다. */
const CARD_ASPECT_BY_KIND: Record<CardKind, number> = {
  text: 957 / 1021,
  checklist: 836 / 1169,
  code: 1114 / 811,
  comment: 1007 / 984,
  file: 1062 / 1064,
  handwriting: 1148 / 1171,
  highlight: 1039 / 895,
  audio: 933 / 521,
  mindmap: 1150 / 1147,
  image: 941 / 1081,
  link: 806 / 1151,
};

export function aspectForKind(kind: CardKind): number {
  return CARD_ASPECT_BY_KIND[kind] ?? 1;
}

interface WorkspaceState {
  cards: Card[];
  selectedIds: string[];
  editingId: string | null;
  /**
   * FEAT-memo-expand: 펼치기 모달로 크게 편집 중인 카드 id (없으면 null).
   * inline 편집(editingId)과 상호배타 — 모달 진입 시 editingId를 닫는다.
   */
  expandedCardId: string | null;
  viewport: Viewport;
  pendingAIGate: PendingAIGate | null;
  /** FEAT-capture T-6: Cmd+Shift+N에서 사용할 마지막 도구. addCardAt마다 갱신. */
  lastToolId: CaptureToolId;

  /** 사용자 보드 목록 (시스템 보드는 포함하지 않음). 최근 수정 순. */
  boards: Board[];
  /** 현재 표시 중인 보드 id ("system" 또는 사용자 보드 id). */
  currentBoardId: CurrentBoardId;
  /** Cmd+B 토글용 — 가장 최근에 머물렀던 사용자 보드 id. */
  lastNonSystemBoardId: string | null;
  /** 보드별 viewport memory — 보드 전환 시 줌·팬 복원용. in-memory only. */
  viewportByBoard: Record<string, Viewport>;
  /** 보드 전환 페이드 (200ms ease-out) 진행 중 표시. UI 레이어가 구독. */
  boardTransitioning: boolean;
  /** TemplatePicker 모달 열림 상태 — Cmd+N / "+ 새 보드" 진입점이 공유. */
  templatePickerOpen: boolean;
  /**
   * 직전에 삭제된 보드를 5초간 복구할 수 있도록 보관하는 스냅샷.
   * UI(BoardUndoToast)가 구독하고, expiresAt 시점에 자동으로 null로 비워진다.
   */
  pendingBoardUndo: PendingBoardUndo | null;
  /** 삭제 확인 다이얼로그 대상 보드 id (null이면 닫힘). */
  deleteDialogBoardId: string | null;
  /** 우클릭 메뉴 → "이름 변경" 시 BoardPicker가 인플레이스 편집을 시작할 신호. */
  pendingRenameBoardId: string | null;

  loadFromStorage: () => Promise<void>;

  setTemplatePickerOpen: (open: boolean) => void;
  /** 삭제 확인 다이얼로그 열기/닫기. */
  openDeleteDialog: (boardId: string | null) => void;
  /** "이름 변경" 컨텍스트 액션 — 해당 보드로 전환 후 인플레이스 편집 시작 신호. */
  requestRenameBoard: (boardId: string) => Promise<void>;
  /** BoardPicker가 편집 모드 진입을 확인했음을 알리는 acknowledge. */
  clearRenameRequest: () => void;
  setCurrentBoard: (id: CurrentBoardId) => Promise<void>;
  createBoard: (name?: string) => Promise<string>;
  /**
   * FEAT-templates: 새 보드 생성 + 템플릿의 초기 카드 자동 배치 + 그 보드로 전환.
   * 빈 이름은 i18n 기본명("이름 없는 보드")으로 폴백.
   */
  createBoardFromTemplate: (
    templateId: string,
    name: string,
    t: Translator,
    now?: Date,
  ) => Promise<string>;
  renameBoard: (id: string, name: string) => Promise<void>;
  removeBoard: (id: string) => Promise<void>;
  /**
   * UI용 삭제 — 5초 동안 undo 가능. 메모는 boardId=null로 이미 보존된다(spec §8).
   * undo 시 보드 row + 그 보드에 있던 메모들의 boardId 복원.
   */
  removeBoardWithUndo: (id: string) => Promise<void>;
  undoBoardRemove: () => Promise<void>;
  clearBoardUndo: () => void;
  /** 시스템 보드 ↔ 마지막 사용자 보드 토글. 사용자 보드가 없으면 no-op. */
  toggleSystemBoard: () => Promise<void>;

  addCardAt: (toolId: ToolId, x: number, y: number) => string;
  /** 화면 중앙의 world 좌표에 카드 생성 (단축키 진입). viewport 크기는 인자로 주입. */
  addCardAtViewportCenter: (
    toolId: ToolId,
    viewportSize?: { width: number; height: number },
  ) => string;
  moveCard: (id: string, x: number, y: number) => void;
  moveSelectedBy: (dx: number, dy: number) => void;
  /**
   * 사용자 리사이즈. 코너 핸들에서 left/top 엣지를 잡으면 x/y도 함께 이동한다.
   * width/height는 [[CARD_MIN_WIDTH]] ~ [[CARD_MAX_WIDTH]], [[CARD_MIN_HEIGHT]] ~ [[CARD_MAX_HEIGHT]]로 클램프.
   */
  resizeCard: (
    id: string,
    next: { width: number; height: number; x?: number; y?: number },
  ) => void;
  setContent: (id: string, content: string) => void;
  setAttachment: (
    id: string,
    ref: string | undefined,
    meta?: { content?: string; mediaType?: string },
  ) => void;
  selectOne: (id: string | null) => void;
  toggleSelect: (id: string) => void;
  selectMany: (ids: string[], additive?: boolean) => void;
  clearSelection: () => void;
  setEditing: (id: string | null) => void;
  /** FEAT-memo-expand: 펼치기 모달을 연다(id) / 닫는다(null). */
  setExpandedCard: (id: string | null) => void;

  /**
   * FEAT-markdown-memo-pen: 펜 모드 — 사이드바 펜 도구로 켜는 전역 그리기 모드.
   * 켜지면 커서가 펜으로 바뀌고 메모 카드 위 드래그가 그리기가 된다.
   * 카드 편집(editingId)과 상호배타 — 펜 모드 진입 시 편집을 닫는다.
   */
  penMode: boolean;
  penTool: "pen" | "eraser";
  penWidth: number;
  setPenMode: (on: boolean) => void;
  togglePenMode: () => void;
  setPenTool: (tool: "pen" | "eraser") => void;
  setPenWidth: (width: number) => void;
  /** overlay(손글씨) 레이어만 갱신 — content는 건드리지 않는다. 디바운스 영속. */
  setOverlay: (id: string, overlay: string) => void;

  remove: (id: string) => void;
  removeSelected: () => void;

  /**
   * FEAT-card-flow REQ-flow-1/2: 현 카드 편집 종료. 콘텐츠가 비어있지 않으면
   * 같은 종류의 새 카드를 현 카드 아래 64px에 생성·편집 모드로 진입.
   * 빈 카드면 편집만 종료하고 null 반환.
   */
  commitAndAddNext: (currentCardId: string) => string | null;
  /**
   * FEAT-card-flow REQ-flow-3: selectedIds[0] 기준 위치(y, x 순) 정렬에서
   * 인접 카드로 선택 이동. 보드 경계 도달 시 wrap-around 안 함 (no-op).
   */
  focusNextCard: (direction: 1 | -1) => void;
  /**
   * FEAT-card-flow REQ-flow-4: selectedIds[0]을 editingId로 설정.
   * 선택이 정확히 1개·캡처 카드일 때만 동작 — 그 외 no-op.
   */
  enterEditOnSelected: () => void;

  /**
   * FEAT-home AC-3: 시스템 보드에 놓인 무소속 카드를 새 보드로 옮긴다.
   * 단일 액션 — 새 보드 생성 + 해당 카드의 boardId 갱신 + 그 보드로 전환.
   * @returns 새로 만들어진 보드 id
   */
  promoteCardToNewBoard: (cardId: string, boardName?: string) => Promise<string>;

  toggleAIOptOut: (id: string) => void;
  setPendingAIGate: (p: PendingAIGate | null) => void;

  panBy: (dx: number, dy: number) => void;
  zoomAt: (factor: number, screenX: number, screenY: number) => void;
  setScale: (scale: number) => void;
  resetViewport: () => void;

  /** 사이드바 도구 커스텀 드래그 상태. null = 드래그 중 아님. */
  sidebarDrag: SidebarDrag | null;
  setSidebarDrag: (s: SidebarDrag | null) => void;
}

function isCaptureKind(kind: CardKind): boolean {
  return kind !== "comment";
}

function kindToDefaultToolId(kind: CardKind): ToolId {
  switch (kind) {
    case "text":
    case "handwriting":
    case "mindmap":
    case "highlight":
    case "checklist":
    case "image":
    case "link":
    case "audio":
    case "file":
    case "code":
    case "comment":
      return kind;
    default:
      return "text";
  }
}

export function kindForTool(toolId: ToolId): CardKind {
  switch (toolId) {
    case "text":
    case "handwriting":
    case "mindmap":
    case "highlight":
    case "checklist":
    case "image":
    case "link":
    case "audio":
    case "file":
    case "code":
      return toolId;
    case "comment":
      return "comment";
    // 비-capture (board/column/line/more/trash): 사이드바 정리 도구이지 카드 생성 도구가 아니다.
    // 호출돼도 안전하게 text 카드로 떨어진다 (도구 자체 동작은 FEAT-canvas).
    default:
      return "text";
  }
}

export function widthForKind(kind: CardKind): number {
  switch (kind) {
    case "checklist":
      return 460;
    case "handwriting":
    case "mindmap":
      return 320;
    case "comment":
      return 280;
    case "code":
    case "link":
    case "highlight":
      return 260;
    case "audio":
    case "file":
      return 220;
    case "image":
      return 200;
    case "text":
    default:
      return 240;
  }
}

const SEED_CARDS: Card[] = [
  {
    id: "seed-todo",
    kind: "text",
    x: 320,
    y: 140,
    width: 460,
    content: "- [ ] 첫구매 전환",
  },
  {
    id: "seed-preview",
    kind: "image",
    x: 320,
    y: 500,
    width: 130,
    content: "",
  },
  {
    id: "seed-comment",
    kind: "comment",
    x: 720,
    y: 310,
    width: 280,
    content: "오호",
    author: "동박",
    time: "2 days ago",
  },
  {
    id: "seed-empty",
    kind: "text",
    x: 380,
    y: 620,
    width: 280,
    content: "",
  },
];

let counter = 1;
const nextId = () => `c-${Date.now().toString(36)}-${counter++}`;

const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));

/* ─────────── 영속 매핑 ─────────── */

function cardKindToNoteKind(kind: CardKind): NoteKind {
  // comment는 author/time 메타를 본문 JSON에 묻혀 text로 저장.
  if (kind === "comment") return "text";
  return kind;
}

const COMMENT_MARKER = "__moss_comment_v1__";
/** 마이그레이션 — 이전 v0 마커("$comment")로 저장된 카드도 인식. */
const COMMENT_MARKER_V0 = "$comment";

function encodeCardContent(card: Card): string {
  if (card.kind === "comment") {
    return JSON.stringify({
      [COMMENT_MARKER]: true,
      author: card.author ?? "",
      time: card.time ?? "",
      body: card.content,
    });
  }
  return card.content;
}

function decodeNoteToCard(note: Note): Card {
  let kind: CardKind = note.kind;
  let content = note.content;
  let author: string | undefined;
  let time: string | undefined;

  // comment 메타가 인코딩된 text는 comment로 환원 (현재 + 이전 v0 마커 둘 다).
  if (note.kind === "text" && content.startsWith("{")) {
    try {
      const parsed = JSON.parse(content) as {
        [COMMENT_MARKER]?: boolean;
        [COMMENT_MARKER_V0]?: boolean;
        author?: string;
        time?: string;
        body?: string;
      };
      if (parsed[COMMENT_MARKER] === true || parsed[COMMENT_MARKER_V0] === true) {
        kind = "comment";
        content = String(parsed.body ?? "");
        author = parsed.author ?? undefined;
        time = parsed.time ?? undefined;
      }
    } catch {
      /* plain text — keep as note */
    }
  }

  // FEAT-card-allinone + FEAT-markdown-memo-pen: 레거시 단독 카드를 글(text) 카드
  // 블록 모델로 무손실 환원한다. 단독 캡처 도구(code/checklist/highlight/handwriting)는
  // 제거됐고 데이터만 글 카드 블록으로 흡수한다.
  //  - code → code 블록(code/lang 보존), handwriting → handwriting 블록(획 보존)
  //  - checklist/highlight는 전용 블록이 없어 migratedContent로 마크다운화한 뒤
  //    text 블록 1개에 담는다(서식은 평문으로 남지만 내용은 보존).
  if (note.kind === "code") {
    const { code, lang } = parseCode(content);
    const block: CardBlock = lang ? { type: "code", code, lang } : { type: "code", code };
    kind = "text";
    content = serializeBlocks([block]);
  } else if (note.kind === "handwriting") {
    const { paths } = parseHandwriting(content);
    kind = "text";
    content = serializeBlocks([{ type: "handwriting", paths }]);
  } else {
    const md = migratedContent(note.kind, content);
    if (md !== null) {
      kind = "text";
      content = serializeBlocks([{ type: "text", text: md }]);
    }
  }

  return {
    id: note.id,
    kind,
    x: note.x,
    y: note.y,
    width: note.width,
    height: note.height,
    content,
    attachmentRef: note.attachmentRef,
    mediaType: note.mediaType,
    overlay: note.overlay,
    author,
    time,
    aiOptOut: note.aiOptOut || undefined,
    lastVisitedAt: note.lastVisitedAt,
  };
}

/** 시스템 보드는 boardId=null로 저장. 사용자 보드는 그대로. */
function storageBoardId(currentBoardId: CurrentBoardId): string | null {
  return currentBoardId === SYSTEM_BOARD_ID ? null : currentBoardId;
}

function persistCard(card: Card, boardId: string | null): Promise<void> {
  const storage = useStorage.getState();
  if (!storage.initialized) return Promise.resolve();
  const content = encodeCardContent(card);
  // FEAT-ai-pipeline §2: 메모 저장 시 임베딩 큐로 enqueue.
  // moveCard처럼 본문 변경 없이 호출되는 경로에서도 큐 안에서 콘텐츠 해시
  // 비교로 cache hit이면 skip하므로 안전(AC-4).
  enqueueEmbedRaw(card.id, content, !!card.aiOptOut);
  return storage.saveNote({
    id: card.id,
    boardId,
    kind: cardKindToNoteKind(card.kind),
    x: card.x,
    y: card.y,
    width: card.width,
    height: card.height,
    content,
    attachmentRef: card.attachmentRef,
    mediaType: card.mediaType,
    overlay: card.overlay,
    aiOptOut: !!card.aiOptOut,
    rotation: 0,
  });
}

/** moveCard / setContent 같은 빈번한 변경은 300ms 디바운스 후 영속. */
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
const DEBOUNCE_MS = 300;

function persistCardDebounced(card: Card, boardId: string | null) {
  const existing = debounceTimers.get(card.id);
  if (existing) clearTimeout(existing);
  const handle = setTimeout(() => {
    debounceTimers.delete(card.id);
    persistCard(card, boardId);
  }, DEBOUNCE_MS);
  debounceTimers.set(card.id, handle);
}

/** 보드 전환 페이드 시간 — spec §3 AC-4. */
export const BOARD_FADE_MS = 200;

export const useWorkspace = create<WorkspaceState>((set, get) => ({
  cards: [],
  selectedIds: [],
  editingId: null,
  expandedCardId: null,
  penMode: false,
  penTool: "pen",
  penWidth: PEN_DEFAULT_WIDTH,
  viewport: { x: 0, y: 0, scale: 1 },
  pendingAIGate: null,
  lastToolId: "text",
  boards: [],
  currentBoardId: SYSTEM_BOARD_ID,
  lastNonSystemBoardId: null,
  viewportByBoard: {},
  boardTransitioning: false,
  templatePickerOpen: false,
  pendingBoardUndo: null,
  deleteDialogBoardId: null,
  pendingRenameBoardId: null,
  sidebarDrag: null,

  setSidebarDrag: (s) => set({ sidebarDrag: s }),

  setTemplatePickerOpen: (open) => set({ templatePickerOpen: open }),
  openDeleteDialog: (boardId) => set({ deleteDialogBoardId: boardId }),
  requestRenameBoard: async (boardId) => {
    if (boardId === SYSTEM_BOARD_ID) return;
    await get().setCurrentBoard(boardId);
    set({ pendingRenameBoardId: boardId });
  },
  clearRenameRequest: () => set({ pendingRenameBoardId: null }),

  loadFromStorage: async () => {
    const storage = useStorage.getState();
    if (!storage.initialized) await storage.init();
    const boards = await storage.loadBoards();
    const notes = await storage.loadCards(null);

    if (notes.length === 0 && !storage.settings?.installPromptShown) {
      // 첫 실행 — 디자인 시드를 영속해두고 마킹.
      await Promise.all(SEED_CARDS.map((card) => persistCard(card, null)));
      await storage.updateSettings({ installPromptShown: true });
      set({ cards: SEED_CARDS, boards });
      return;
    }

    const cards = notes.map(decodeNoteToCard);
    set({ cards, boards });
  },

  setCurrentBoard: async (id) => {
    const current = get().currentBoardId;
    if (current === id) return;

    // 1) 현재 보드의 viewport 기억
    const prevViewport = get().viewport;
    const viewportByBoard = { ...get().viewportByBoard, [current]: prevViewport };

    // 2) 페이드아웃 시작
    set({ boardTransitioning: true, viewportByBoard });

    // 3) DB에서 카드 로드 (시스템 보드는 boardId=null)
    const storage = useStorage.getState();
    if (!storage.initialized) await storage.init();
    const notes = await storage.loadCards(storageBoardId(id));
    const cards = notes.map(decodeNoteToCard);

    // 4) state 교체 — viewport 복원 (없으면 reset)
    const restored = get().viewportByBoard[id] ?? { x: 0, y: 0, scale: 1 };
    const lastNonSystem = id === SYSTEM_BOARD_ID ? get().lastNonSystemBoardId : id;
    set({
      cards,
      selectedIds: [],
      editingId: null,
      expandedCardId: null,
      currentBoardId: id,
      lastNonSystemBoardId: lastNonSystem,
      viewport: restored,
    });

    // 5) lastOpenedAt 업데이트 (사용자 보드만)
    if (id !== SYSTEM_BOARD_ID) {
      await storage.saveBoard({ id, lastOpenedAt: Date.now() });
      const fresh = await storage.loadBoards();
      set({ boards: fresh });
    }

    // 6) 페이드인 — BOARD_FADE_MS 후 transitioning 해제
    setTimeout(() => set({ boardTransitioning: false }), BOARD_FADE_MS);
  },

  createBoard: async (name = "") => {
    const storage = useStorage.getState();
    if (!storage.initialized) await storage.init();
    const id = `b-${Date.now().toString(36)}-${counter++}`;
    await storage.saveBoard({ id, name, isSystem: false });
    const boards = await storage.loadBoards();
    set({ boards });
    await get().setCurrentBoard(id);
    return id;
  },

  createBoardFromTemplate: async (templateId, name, t, now) => {
    const template = getTemplate(templateId);
    if (!template) throw new Error(`Unknown templateId: ${templateId}`);
    const storage = useStorage.getState();
    if (!storage.initialized) await storage.init();

    const boardId = `b-${Date.now().toString(36)}-${counter++}`;
    const trimmedName = name.trim() || t("templates.picker.defaultBoardName");
    await storage.saveBoard({
      id: boardId,
      name: trimmedName,
      isSystem: false,
      templateId: template.id,
    });

    // 초기 카드 일괄 저장 — boardId 부여, AI 임베딩 큐는 skip(placeholder 텍스트).
    const initialCards = template.buildInitialCards(t, now);
    for (const init of initialCards) {
      const cardId = nextId();
      await storage.saveNote({
        id: cardId,
        boardId,
        kind: init.kind,
        x: init.x,
        y: init.y,
        width: init.width,
        content: init.content,
        aiOptOut: false,
        rotation: 0,
      });
    }

    const boards = await storage.loadBoards();
    set({ boards });
    await get().setCurrentBoard(boardId);
    return boardId;
  },

  renameBoard: async (id, name) => {
    if (id === SYSTEM_BOARD_ID) {
      throw new Error("시스템 보드는 이름을 변경할 수 없습니다.");
    }
    const storage = useStorage.getState();
    if (!storage.initialized) await storage.init();
    await storage.saveBoard({ id, name });
    const boards = await storage.loadBoards();
    set({ boards });
  },

  removeBoard: async (id) => {
    if (id === SYSTEM_BOARD_ID) {
      throw new Error("시스템 보드는 삭제할 수 없습니다.");
    }
    const storage = useStorage.getState();
    if (!storage.initialized) await storage.init();
    await storage.removeBoard(id);
    const boards = await storage.loadBoards();
    const next: Partial<WorkspaceState> = { boards };
    if (get().currentBoardId === id) {
      // 삭제된 보드를 보고 있었으면 시스템 보드로 복귀
      set(next as WorkspaceState);
      await get().setCurrentBoard(SYSTEM_BOARD_ID);
      return;
    }
    if (get().lastNonSystemBoardId === id) {
      next.lastNonSystemBoardId = null;
    }
    set(next as WorkspaceState);
  },

  removeBoardWithUndo: async (id) => {
    if (id === SYSTEM_BOARD_ID) {
      throw new Error("시스템 보드는 삭제할 수 없습니다.");
    }
    const storage = useStorage.getState();
    if (!storage.initialized) await storage.init();

    // 1) 영향받는 노트 id 수집 — 복원 시 boardId 재할당용
    const db = getDB();
    const affected = await db.notes
      .where("boardId")
      .equals(id)
      .primaryKeys();
    const board = await db.boards.get(id);
    if (!board) return; // 이미 삭제된 보드 — no-op

    // 2) 이전 undo가 있었으면 그건 영구 폐기 (스택 1개만 유지)
    set({ pendingBoardUndo: null });

    // 3) 실제 삭제 — removeBoard는 currentBoardId === id이면 시스템으로 복귀까지 처리
    await get().removeBoard(id);

    // 4) 스냅샷 저장 + 5초 자동 폐기
    set({
      pendingBoardUndo: {
        board,
        affectedNoteIds: affected as string[],
        expiresAt: Date.now() + BOARD_UNDO_MS,
      },
    });
    setTimeout(() => {
      // 만료 시 — 다른 undo로 덮어쓰여 있지 않다면만 비운다.
      const cur = get().pendingBoardUndo;
      if (cur && cur.board.id === id) set({ pendingBoardUndo: null });
    }, BOARD_UNDO_MS);
  },

  undoBoardRemove: async () => {
    const pending = get().pendingBoardUndo;
    if (!pending) return;
    set({ pendingBoardUndo: null });
    const storage = useStorage.getState();
    if (!storage.initialized) await storage.init();
    const db = getDB();
    // 보드 row 복원
    await db.boards.put(pending.board);
    // 그 보드에 있던 메모 boardId 복원 (그 사이 사용자가 이동시킨 메모는 건드리지 않음 — id 기반)
    await db.notes
      .where("id")
      .anyOf(pending.affectedNoteIds)
      .modify((n) => {
        if (n.boardId === null) n.boardId = pending.board.id;
      });
    const boards = await storage.loadBoards();
    set({ boards });
  },

  clearBoardUndo: () => set({ pendingBoardUndo: null }),

  toggleSystemBoard: async () => {
    const current = get().currentBoardId;
    if (current === SYSTEM_BOARD_ID) {
      const last = get().lastNonSystemBoardId;
      if (!last) return;
      await get().setCurrentBoard(last);
    } else {
      await get().setCurrentBoard(SYSTEM_BOARD_ID);
    }
  },

  addCardAt: (toolId, x, y) => {
    const kind = kindForTool(toolId);
    const width = widthForKind(kind);
    const height = clamp(width / aspectForKind(kind), CARD_MIN_HEIGHT, CARD_MAX_HEIGHT);
    const id = nextId();
    const card: Card = {
      id,
      kind,
      x,
      y,
      width,
      height,
      content: "",
      lastVisitedAt: Date.now(),
    };
    const isCapture = isCaptureKind(kind);
    const isCaptureTool = (CAPTURE_TOOLS as readonly ToolId[]).includes(toolId);
    set((s) => ({
      cards: [...s.cards, card],
      selectedIds: [id],
      editingId: isCapture ? id : null,
      lastToolId: isCaptureTool ? (toolId as CaptureToolId) : s.lastToolId,
    }));
    void persistCard(card, storageBoardId(get().currentBoardId));
    return id;
  },

  addCardAtViewportCenter: (toolId, viewportSize) => {
    const v = get().viewport;
    const sidebarW = 148; // tokens.layout.sidebar.expanded — 정확 매치는 page.tsx에서 보장
    const fallbackW =
      typeof window !== "undefined" ? window.innerWidth - sidebarW : 1100;
    const fallbackH =
      typeof window !== "undefined" ? window.innerHeight : 700;
    const w = viewportSize?.width ?? fallbackW;
    const h = viewportSize?.height ?? fallbackH;
    const sx = w / 2;
    const sy = h / 2;
    const kind = kindForTool(toolId);
    const cardW = widthForKind(kind);
    const wx = (sx - v.x) / v.scale - cardW / 2;
    const wy = (sy - v.y) / v.scale - 20;
    return get().addCardAt(toolId, wx, wy);
  },

  moveCard: (id, x, y) => {
    let updated: Card | undefined;
    set((s) => ({
      cards: s.cards.map((c) => {
        if (c.id !== id) return c;
        updated = { ...c, x, y };
        return updated;
      }),
    }));
    if (updated) persistCardDebounced(updated, storageBoardId(get().currentBoardId));
  },

  moveSelectedBy: (dx, dy) => {
    if (dx === 0 && dy === 0) return;
    const ids = new Set(get().selectedIds);
    if (ids.size === 0) return;
    const moved: Card[] = [];
    set((s) => ({
      cards: s.cards.map((c) => {
        if (!ids.has(c.id)) return c;
        const next = { ...c, x: c.x + dx, y: c.y + dy };
        moved.push(next);
        return next;
      }),
    }));
    const boardId = storageBoardId(get().currentBoardId);
    for (const card of moved) persistCardDebounced(card, boardId);
  },

  resizeCard: (id, next) => {
    // clamp는 NaN을 그대로 통과시키므로(Math.min/max 의미상) finite 가드 명시.
    if (!Number.isFinite(next.width) || !Number.isFinite(next.height)) return;
    if (next.x !== undefined && !Number.isFinite(next.x)) return;
    if (next.y !== undefined && !Number.isFinite(next.y)) return;
    let updated: Card | undefined;
    set((s) => ({
      cards: s.cards.map((c) => {
        if (c.id !== id) return c;
        const w = clamp(next.width, CARD_MIN_WIDTH, CARD_MAX_WIDTH);
        const h = clamp(next.height, CARD_MIN_HEIGHT, CARD_MAX_HEIGHT);
        updated = {
          ...c,
          width: w,
          height: h,
          x: next.x !== undefined ? next.x : c.x,
          y: next.y !== undefined ? next.y : c.y,
        };
        return updated;
      }),
    }));
    if (updated) persistCardDebounced(updated, storageBoardId(get().currentBoardId));
  },

  setContent: (id, content) => {
    let updated: Card | undefined;
    set((s) => ({
      cards: s.cards.map((c) => {
        if (c.id !== id) return c;
        updated = { ...c, content };
        return updated;
      }),
    }));
    if (updated) persistCardDebounced(updated, storageBoardId(get().currentBoardId));
  },

  setAttachment: (id, ref, meta) => {
    let updated: Card | undefined;
    set((s) => ({
      cards: s.cards.map((c) => {
        if (c.id !== id) return c;
        updated = {
          ...c,
          attachmentRef: ref,
          mediaType: meta?.mediaType ?? c.mediaType,
          content: meta?.content ?? c.content,
        };
        return updated;
      }),
    }));
    if (updated) void persistCard(updated, storageBoardId(get().currentBoardId));
  },

  selectOne: (id) => set({ selectedIds: id ? [id] : [] }),
  toggleSelect: (id) =>
    set((s) => {
      const has = s.selectedIds.includes(id);
      return {
        selectedIds: has
          ? s.selectedIds.filter((x) => x !== id)
          : [...s.selectedIds, id],
      };
    }),
  selectMany: (ids, additive = false) =>
    set((s) => {
      if (!additive) return { selectedIds: ids };
      const seen = new Set(s.selectedIds);
      const merged = [...s.selectedIds];
      for (const id of ids) {
        if (!seen.has(id)) {
          seen.add(id);
          merged.push(id);
        }
      }
      return { selectedIds: merged };
    }),
  clearSelection: () => set({ selectedIds: [] }),
  setEditing: (id) => set({ editingId: id }),
  // FEAT-memo-expand: 모달 진입 시 inline 편집을 닫아 같은 카드 이중 에디터를 막는다.
  setExpandedCard: (id) =>
    set(id ? { expandedCardId: id, editingId: null } : { expandedCardId: null }),

  // FEAT-markdown-memo-pen: 펜 모드. 진입 시 열린 편집을 닫아 상호배타 보장.
  setPenMode: (on) =>
    set(on ? { penMode: true, editingId: null } : { penMode: false }),
  togglePenMode: () => get().setPenMode(!get().penMode),
  setPenTool: (tool) => set({ penTool: tool }),
  setPenWidth: (width) =>
    set({ penWidth: clamp(width, PEN_MIN_WIDTH, PEN_MAX_WIDTH) }),
  setOverlay: (id, overlay) => {
    let updated: Card | undefined;
    set((s) => ({
      cards: s.cards.map((c) => {
        if (c.id !== id) return c;
        updated = { ...c, overlay };
        return updated;
      }),
    }));
    if (updated)
      persistCardDebounced(updated, storageBoardId(get().currentBoardId));
  },

  remove: (id) => {
    set((s) => ({
      cards: s.cards.filter((c) => c.id !== id),
      selectedIds: s.selectedIds.filter((x) => x !== id),
      editingId: s.editingId === id ? null : s.editingId,
      expandedCardId: s.expandedCardId === id ? null : s.expandedCardId,
    }));
    const pending = debounceTimers.get(id);
    if (pending) {
      clearTimeout(pending);
      debounceTimers.delete(id);
    }
    const storage = useStorage.getState();
    if (storage.initialized) void storage.removeNote(id);
  },

  removeSelected: () => {
    const ids = get().selectedIds;
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    set((s) => ({
      cards: s.cards.filter((c) => !idSet.has(c.id)),
      selectedIds: [],
      editingId: s.editingId && idSet.has(s.editingId) ? null : s.editingId,
      expandedCardId:
        s.expandedCardId && idSet.has(s.expandedCardId)
          ? null
          : s.expandedCardId,
    }));
    for (const id of ids) {
      const pending = debounceTimers.get(id);
      if (pending) {
        clearTimeout(pending);
        debounceTimers.delete(id);
      }
    }
    const storage = useStorage.getState();
    if (storage.initialized) {
      for (const id of ids) void storage.removeNote(id);
    }
  },

  commitAndAddNext: (currentCardId) => {
    const current = get().cards.find((c) => c.id === currentCardId);
    if (!current) {
      // 카드가 사라졌으면 편집 상태만 정리.
      if (get().editingId === currentCardId) set({ editingId: null });
      return null;
    }
    // 캡처 카드가 아니면 next-card 흐름 자체가 의미 없음 — 편집만 종료.
    if (!isCaptureKind(current.kind)) {
      if (get().editingId === currentCardId) set({ editingId: null });
      return null;
    }
    // 빈 카드 — 양산 방지. 편집만 종료, 새 카드 생성 안 함.
    if (current.content === "") {
      if (get().editingId === currentCardId) set({ editingId: null });
      return null;
    }
    // 1) 현 편집 해제. addCardAt가 새 카드 id로 editingId를 다시 잡는다.
    set({ editingId: null });
    // 2) 같은 종류의 새 카드 — 아래 64px, 같은 x.
    const toolId = kindToDefaultToolId(current.kind);
    const currentHeight = current.height ?? CARD_MIN_HEIGHT;
    const nextX = current.x;
    const nextY = current.y + currentHeight + 64;
    return get().addCardAt(toolId, nextX, nextY);
  },

  focusNextCard: (direction) => {
    const selected = get().selectedIds;
    if (selected.length !== 1) return;
    const currentId = selected[0];
    // 현재 보드 카드만 — workspace의 cards는 보드 전환 시 이미 갈아끼워지므로
    // cards 전체가 곧 현 보드 카드다. 별도 필터 불필요.
    const ordered = [...get().cards].sort((a, b) => {
      if (a.y !== b.y) return a.y - b.y;
      return a.x - b.x;
    });
    const idx = ordered.findIndex((c) => c.id === currentId);
    if (idx === -1) return;
    const nextIdx = idx + direction;
    if (nextIdx < 0 || nextIdx >= ordered.length) return; // 경계 — no-op (wrap 안 함).
    set({ selectedIds: [ordered[nextIdx].id] });
  },

  enterEditOnSelected: () => {
    const selected = get().selectedIds;
    if (selected.length !== 1) return;
    const id = selected[0];
    const card = get().cards.find((c) => c.id === id);
    if (!card) return;
    if (!isCaptureKind(card.kind)) return;
    set({ editingId: id });
  },

  promoteCardToNewBoard: async (cardId, boardName = "") => {
    // 1) 새 보드 생성 (자동 전환 발생 — 카드 목록이 새 보드 기준으로 리로드됨)
    //    그 직전에 카드의 boardId를 새 보드로 옮겨두어야 한다.
    const storage = useStorage.getState();
    if (!storage.initialized) await storage.init();

    const id = `b-${Date.now().toString(36)}-${counter++}`;
    await storage.saveBoard({ id, name: boardName, isSystem: false });

    // 2) 카드의 boardId 변경 — 본문/위치는 그대로.
    const card = get().cards.find((c) => c.id === cardId);
    if (card) {
      await storage.saveNote({ id: card.id, boardId: id });
    }

    // 3) 보드 목록 갱신 + 새 보드로 전환
    const boards = await storage.loadBoards();
    set({ boards });
    await get().setCurrentBoard(id);
    return id;
  },

  toggleAIOptOut: (id) => {
    let updated: Card | undefined;
    set((s) => ({
      cards: s.cards.map((c) => {
        if (c.id !== id) return c;
        updated = { ...c, aiOptOut: !c.aiOptOut };
        return updated;
      }),
    }));
    if (updated) persistCard(updated, storageBoardId(get().currentBoardId));
  },

  setPendingAIGate: (p) => set({ pendingAIGate: p }),

  panBy: (dx, dy) =>
    set((s) => ({
      viewport: { ...s.viewport, x: s.viewport.x + dx, y: s.viewport.y + dy },
    })),

  zoomAt: (factor, screenX, screenY) =>
    set((s) => {
      const next = clamp(s.viewport.scale * factor, MIN_SCALE, MAX_SCALE);
      if (next === s.viewport.scale) return s;
      const ratio = next / s.viewport.scale;
      const x = screenX * (1 - ratio) + s.viewport.x * ratio;
      const y = screenY * (1 - ratio) + s.viewport.y * ratio;
      return { viewport: { x, y, scale: next } };
    }),

  setScale: (scale) =>
    set((s) => ({
      viewport: { ...s.viewport, scale: clamp(scale, MIN_SCALE, MAX_SCALE) },
    })),

  resetViewport: () => set({ viewport: { x: 0, y: 0, scale: 1 } }),
}));

/* 테스트·디버깅용 export — 프로덕션 코드는 직접 호출 금지. */
export const __internal = {
  decodeNoteToCard,
  encodeCardContent,
  cardKindToNoteKind,
  kindForTool,
  widthForKind,
  isCaptureKind,
  SEED_CARDS,
};
