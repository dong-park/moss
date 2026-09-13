"use client";

import { create } from "zustand";
import type { AINoteRef } from "./aiGate";
import { useStorage } from "./storage";
import {
  getDB,
  makeFrameNote,
  type Board,
  type Connection,
  type EmbeddingCacheEntry,
  type Note,
  type NoteKind,
} from "./db/schema";
import { migratedContent } from "./markdownMigration";
import { enqueueEmbed as enqueueEmbedRaw } from "./ai/embeddingQueue";
import {
  schedulePersist,
  cancelPersist,
  flushCard,
  flushAll,
} from "./cardPersist";
import { initLiveSync } from "./db/liveSync"; // W8: 다중 탭 동기화
import {
  parseCode,
  parseHandwriting,
  serializeBlocks,
  type CardBlock,
} from "./cardContent";
import { encodeFrameContent } from "./frameContent";
// FEAT-memo-fulltext-search (W4): 본문 평문 검색 — 셀렉터/액션이 위임.
import { searchMemos as searchMemosImpl } from "./memoSearch";
import { getTemplate } from "@/templates";
import type { Translator } from "@/i18n";
// FEAT-memo-empty-cleanup (W7): 빈 메모 자동 정리 — never-filled 추적 + undo 토스트.
import { useToasts } from "@/state/notifications";
import {
  isMemoEmpty,
  wasNeverFilled,
  markFilled,
  forgetCard,
  startEmptyTracking,
} from "@/state/emptyCleanup";
import {
  PEN_MIN_WIDTH,
  PEN_MAX_WIDTH,
  PEN_DEFAULT_WIDTH,
} from "@/components/workspace/cards/_shared/useDrawing";

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
   * FEAT-subcanvas: kind="board" 함 카드가 가리키는 서브 보드(캔버스) id.
   * 영속 시 content JSON(`__moss_subcanvas_v1__`)에 인코딩된다.
   */
  boardRef?: string;
  /**
   * FEAT-markdown-memo-pen: 펜 모드로 이 카드 위에 덧그린 손글씨 레이어(JSON `{paths}`).
   * content와 독립 — 마크다운 본문 위에 겹쳐 그린다. 없으면 그림 없음.
   */
  overlay?: string;
  /**
   * FEAT-sticky-redesign: 메모판 소속. 같은 보드의 kind="frame" 카드 id.
   * frame 카드 자신은 항상 undefined. [[resolveMembership]]이 갱신한다.
   */
  frameId?: string;
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

/**
 * FEAT-subcanvas: 함 카드(서브 보드 트리) 삭제를 5초간 되돌릴 수 있도록 보관하는 스냅샷.
 * cascade로 지운 board/note/connection/embedding row 전부와, 화면에서 제거된 함 카드,
 * 삭제 시점의 보드를 담는다. 만료 시 OPFS blob까지 영구 삭제한다.
 */
export interface PendingSubcanvasUndo {
  /** 화면에서 제거된 함 카드들 (같은 보드면 복원 시 다시 cards에 추가). */
  funnelCards: Card[];
  /** 삭제 시점 currentBoardId — 복원 시 같은 보드일 때만 함 카드를 뷰에 되살린다. */
  boardAtDeletion: string;
  /** 함 카드 자체의 note row (re-put 대상). */
  funnelNotes: Note[];
  boards: Board[];
  notes: Note[];
  connections: Connection[];
  embeddings: EmbeddingCacheEntry[];
  expiresAt: number;
}

export const MIN_SCALE = 0.25;
export const MAX_SCALE = 3;

/** 카드 리사이즈 한계. SPEC AC-3. */
export const CARD_MIN_WIDTH = 120;
export const CARD_MIN_HEIGHT = 60;
export const CARD_MAX_WIDTH = 1200;
export const CARD_MAX_HEIGHT = 1200;

/**
 * FEAT-sticky-redesign §4: 메모판 최소/기본 크기. 최소는 schema.makeFrameNote의
 * 클램프 값과 같은 소스여야 한다(240×160) — 여기서도 리사이즈 하한으로 재사용.
 */
export const FRAME_MIN_WIDTH = 240;
export const FRAME_MIN_HEIGHT = 160;
export const FRAME_DEFAULT_WIDTH = 320;
export const FRAME_DEFAULT_HEIGHT = 220;

/**
 * FEAT-pen-drawing-engine: 펜 굵기 한계·기본값. 단일 소스는 [[useDrawing]]
 * (handwriting 카드와 메모 overlay 공통). 기존 import 경로 호환을 위해 재노출한다.
 */
export { PEN_MIN_WIDTH, PEN_MAX_WIDTH, PEN_DEFAULT_WIDTH };

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
  // FEAT-subcanvas: 함 카드는 PNG 없이 폴더 스타일로 렌더 — 정사각 비율.
  board: 1,
  // FEAT-sticky-redesign: 메모판 틀 — PNG 없음, 정사각 비율로 폴백.
  frame: 1,
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
  /* ─────────── FEAT-sticky-redesign: 메모판(frame) ─────────── */
  /** 지정 좌표에 메모판(기본 320×220, 최소 240×160)을 만든다. n8 독이 부른다. */
  addFrameAt: (x: number, y: number) => string;
  /**
   * cardIds 각각의 중심점으로 소속 판을 다시 정한다(spec §4 "소속 판정" 전 규칙).
   * 겹친 판은 나중에 만든 판(= cards 배열에서 더 뒤, loadCards가 createdAt 오름차순
   * 정렬을 보장) 우선. frame 카드 자신은 대상에서 제외.
   * 드롭 종료·판 드롭·판 리사이즈 시점에만 호출한다.
   */
  resolveMembership: (cardIds: string[]) => void;
  /**
   * 판과 그 판에 속한 메모 전부를 같은 델타로 옮긴다. 로컬 state는 즉시 갱신하고,
   * DB 반영은 한 Dexie 트랜잭션으로 디바운스 예약한다(동시성 §: 일부만 저장 금지).
   */
  moveFrame: (frameId: string, dx: number, dy: number) => void;
  /** 판 리사이즈. [[FRAME_MIN_WIDTH]]~[[CARD_MAX_WIDTH]], [[FRAME_MIN_HEIGHT]]~[[CARD_MAX_HEIGHT]]로 클램프. */
  resizeFrame: (
    id: string,
    next: { width: number; height: number; x?: number; y?: number },
  ) => void;
  /** 판 이름 변경. 1~40자, trim 후 빈 문자열이면 "새 메모판"으로 되돌린다. */
  renameFrame: (id: string, name: string) => void;
  /** 판을 지운다. 속한 메모는 제자리에 남고 frameId만 해제한다(메모 자체는 안 지운다). */
  deleteFrame: (id: string) => void;

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
  /**
   * FEAT-pen-drawing-engine D3: 펜 모드 그리기 undo/redo 스냅샷.
   * 전역 cross-card 스택 — "내 마지막 획"을 카드 불문 되돌린다. 각 항목은 변경
   * "직전"의 overlay 값. 펜 모드 종료 시 비운다(undo는 현재 펜 세션 한정).
   */
  penUndoStack: { cardId: string; overlay: string }[];
  penRedoStack: { cardId: string; overlay: string }[];
  /** 마지막으로 그린 카드 — Cmd+Backspace(전체지움) 대상. */
  lastPenCardId: string | null;
  setPenMode: (on: boolean) => void;
  togglePenMode: () => void;
  setPenTool: (tool: "pen" | "eraser") => void;
  setPenWidth: (width: number) => void;
  /** overlay(손글씨) 레이어만 갱신 — content는 건드리지 않는다. 디바운스 영속. */
  setOverlay: (id: string, overlay: string) => void;
  /** 펜 모드 그리기 되돌리기 — 직전 overlay 스냅샷 복원(전역 cross-card). */
  penUndo: () => void;
  /** 펜 모드 그리기 다시하기. */
  penRedo: () => void;
  /** 마지막으로 그린 카드의 overlay 전체 지움(되돌리기 가능). */
  penClear: () => void;

  remove: (id: string) => void;
  removeSelected: () => void;

  /**
   * FEAT-memo-empty-cleanup (W7): 본문·overlay가 모두 비었고 "한 번도 채워진 적이
   * 없는"(never-filled) 메모 카드만 삭제한다. text 카드 blur 훅에서 호출.
   * 보수적 — 내용을 지운 카드(AC-3)나 펜 overlay가 있는 카드(AC-2)는 보존한다.
   * 삭제는 undo 토스트로 복원 가능(AC-4).
   */
  deleteCardIfEmpty: (id: string) => void;

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

  /**
   * 현재 들어올린(드래그 중) 카드 id — lift 시각효과(scale/shadow/z)용. transient.
   * draggingMulti=true면 묶음 드래그라 selectedIds 전체가 함께 떠오른다.
   */
  draggingId: string | null;
  draggingMulti: boolean;
  setDragging: (id: string | null, multi?: boolean) => void;

  /* ─────────── FEAT-subcanvas: 캔버스 안의 "함" ─────────── */
  /** 함 카드(boardRef)별 서브 보드의 카드 수 — "카드 N개" 표시용. 보드 로드 시 갱신. */
  subcanvasCounts: Record<string, number>;
  /** 카드 드래그 중 위에 올라온 함 카드 id — 드롭 하이라이트용. transient. */
  dropTargetFunnelId: string | null;
  setDropTargetFunnel: (id: string | null) => void;
  /**
   * 카드 드래그 중 위에 올라온 브레드크럼 조상 조각의 boardId — 밖으로 내보내기
   * 드롭 하이라이트용. transient. dropTargetFunnelId(안으로)와 대칭.
   */
  dropTargetCrumbId: string | null;
  setDropTargetCrumb: (id: string | null) => void;
  /** 현재 보드의 함 카드들에 대한 카드 수를 다시 집계해 subcanvasCounts 갱신. */
  refreshSubcanvasCounts: () => Promise<void>;
  /**
   * 현재 보드 (x,y)에 함 카드 + 연결된 빈 서브 보드(parentBoardId=현재)를 생성한다.
   * @returns 생성된 함 카드 id.
   */
  createSubcanvas: (x: number, y: number) => string;
  /** 함 카드의 boardRef 서브 보드로 진입(setCurrentBoard). */
  enterSubcanvas: (cardId: string) => Promise<void>;
  /** 현재 보드의 부모 보드로 이동. 부모 없으면(루트/시스템) no-op. */
  goToParent: () => Promise<void>;
  /** currentBoardId에서 parentBoardId 체인을 거슬러 루트→현재 순 경로. 시스템 보드면 []. */
  getBreadcrumb: () => { id: string; name: string }[];
  /**
   * 카드를 함 카드의 서브 보드로 이동한다. boardId만 바꾸고 현재 뷰에서 제거.
   * 자기 자신/사이클(함을 자기 자손 보드로) 이동은 no-op.
   */
  moveCardToSubcanvas: (cardId: string, funnelCardId: string) => Promise<void>;
  /**
   * FEAT-eject: 카드를 현재(서브) 보드에서 상위/조상 보드(targetBoardId)로 내보낸다.
   * moveCardToSubcanvas의 정확한 역방향 — boardId만 바꾸고 현재 뷰에서 제거.
   * targetBoardId가 시스템 보드면 boardId=null로 저장(storageBoardId). 함 카드면
   * 그 서브 보드의 parentBoardId를 targetBoardId로 reparent한다.
   */
  moveCardToBoard: (cardId: string, targetBoardId: CurrentBoardId) => Promise<void>;
  /** 함 카드 cascade 삭제를 5초간 되돌릴 스냅샷 (없으면 null). UI 토스트가 구독. */
  pendingSubcanvasUndo: PendingSubcanvasUndo | null;
  /** 스냅샷의 모든 row를 re-put하고 함 카드를 뷰에 되살린다. */
  undoSubcanvasRemove: () => Promise<void>;
  /** undo 포기(×/만료) — 보류 중 blob을 영구 삭제하고 스냅샷 비움. */
  clearSubcanvasUndo: () => void;

  /* ─────────── FEAT-memo-fulltext-search (W4) ─────────── */
  /** 현재 검색어. 빈 문자열이면 검색 비활성(전체 표시). UI/캔버스가 구독. */
  memoSearchQuery: string;
  /** 검색 매칭 카드 id(점수 내림차순). 검색 비활성 시 []. 캔버스 강조/dim·결과목록이 구독. */
  memoSearchMatchIds: string[];
  /**
   * 본문 검색 셀렉터 — 현재 카드들의 text 본문 평문에서 query 매칭(점수순 id+score).
   * 부수효과 없는 순수 조회. 캔버스 필터를 거는 것은 [[filterByKeyword]].
   */
  searchMemos: (query: string) => { id: string; score: number }[];
  /**
   * 검색어로 캔버스 필터(강조/dim) 설정. 빈 문자열이면 원상복귀(AC-2).
   * memoSearchQuery/memoSearchMatchIds를 갱신한다.
   */
  filterByKeyword: (word: string) => void;
  /** 검색 결과 카드로 캔버스를 팬하고 선택한다(AC-3). 카드가 없으면 no-op. */
  panToCard: (
    id: string,
    viewportSize?: { width: number; height: number },
  ) => void;
  /** 메모(text)들이 화면에 꽉 차도록 viewport scale·위치를 맞춘다(새로고침 직후 포커싱용). */
  fitToCards: (viewportSize?: { width: number; height: number }) => void;
}

function isCaptureKind(kind: CardKind): boolean {
  // comment·board·frame은 텍스트 입력 카드가 아니다 — drop/더블클릭 시 편집 모드로 들어가지 않는다.
  return kind !== "comment" && kind !== "board" && kind !== "frame";
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
    // FEAT-sticky-redesign: frame은 캡처 카드가 아니라 next-card 흐름에 오지 않지만
    // (isCaptureKind가 걸러낸다), 방어적으로 명시.
    case "frame":
      return "text";
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
    // FEAT-subcanvas: board 도구 → 함 카드.
    case "board":
      return "board";
    // 비-capture (column/line/more/trash): 사이드바 정리 도구이지 카드 생성 도구가 아니다.
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
    // FEAT-subcanvas: 함 카드 — 폴더 카드 느낌의 작은 정사각.
    case "board":
      return 200;
    // FEAT-sticky-redesign: 메모판 기본 폭. addFrameAt은 실제로 이 값을 직접 쓴다.
    case "frame":
      return FRAME_DEFAULT_WIDTH;
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

/** FEAT-subcanvas: 함 카드 content에 박는 마커. boardRef와 함께 JSON 인코딩. */
const SUBCANVAS_MARKER = "__moss_subcanvas_v1__";

/**
 * comment 카드 content 인코딩(저장은 kind="text" + 이 마커 JSON, decode 시 comment로 환원).
 * 외부 브리지(mossBridge)가 현재 보드 아닌 곳에 comment를 만들 때 쓴다 — encodeCardContent와 단일 소스.
 */
export function encodeComment(body: string, author = "", time = ""): string {
  return JSON.stringify({ [COMMENT_MARKER]: true, author, time, body });
}

/**
 * 함(board) 카드 content 인코딩(boardRef를 가리킨다). 외부 브리지가 현재 보드 아닌 곳에
 * funnel 카드를 만들 때 쓴다 — encodeCardContent board 분기와 단일 소스.
 */
export function encodeSubcanvas(boardRef: string): string {
  return JSON.stringify({ [SUBCANVAS_MARKER]: true, boardRef });
}

function encodeCardContent(card: Card): string {
  if (card.kind === "comment") {
    return JSON.stringify({
      [COMMENT_MARKER]: true,
      author: card.author ?? "",
      time: card.time ?? "",
      body: card.content,
    });
  }
  if (card.kind === "board") {
    return JSON.stringify({
      [SUBCANVAS_MARKER]: true,
      boardRef: card.boardRef ?? "",
    });
  }
  return card.content;
}

function decodeNoteToCard(note: Note): Card {
  // FEAT-subcanvas: 함 카드 — content JSON에서 boardRef 복원. comment/migration 경로 전에 처리.
  if (note.kind === "board") {
    let boardRef: string | undefined;
    try {
      const parsed = JSON.parse(note.content) as {
        [SUBCANVAS_MARKER]?: boolean;
        boardRef?: string;
      };
      if (parsed[SUBCANVAS_MARKER]) boardRef = parsed.boardRef || undefined;
    } catch {
      /* 손상된 content — boardRef 없음(렌더 시 빈 함으로 표시) */
    }
    return {
      id: note.id,
      kind: "board",
      x: note.x,
      y: note.y,
      width: note.width,
      height: note.height,
      content: "",
      boardRef,
      // FEAT-sticky-redesign §4: 파일함 카드도 메모판에 속할 수 있다.
      frameId: note.frameId,
      lastVisitedAt: note.lastVisitedAt,
    };
  }

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
    // FEAT-sticky-redesign: 메모판 소속 — frame 행 자신은 항상 undefined로 저장돼 있다.
    frameId: note.frameId,
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

/**
 * FEAT-sticky-redesign §4 "소속 판정": 카드 높이 미지정 시 사용할 보수적 기본값.
 * fitToCards의 DEFAULT_H(160)와 같은 값 — 실측 높이를 모르는 상태에서의 중심점 근사.
 */
const FRAME_MEMBERSHIP_DEFAULT_HEIGHT = 160;

/** 카드의 중심점(world 좌표). height 미지정이면 보수적 기본값으로 근사. */
function cardCenter(card: Card): { x: number; y: number } {
  const h = card.height ?? FRAME_MEMBERSHIP_DEFAULT_HEIGHT;
  return { x: card.x + card.width / 2, y: card.y + h / 2 };
}

/** 점이 판 경계 안(경계선 포함)에 있는지. */
function frameContainsPoint(
  frame: Card,
  pt: { x: number; y: number },
): boolean {
  // frame 행은 항상 height를 가진다(makeFrameNote가 필수로 채움) — 방어적 폴백만 둔다.
  const h = frame.height ?? FRAME_MIN_HEIGHT;
  return (
    pt.x >= frame.x &&
    pt.x <= frame.x + frame.width &&
    pt.y >= frame.y &&
    pt.y <= frame.y + h
  );
}

/**
 * 후보 판들 중 점을 포함하는 판을 찾는다. 여러 판이 겹치면 배열에서 더 뒤(=나중에
 * 만든 판 — loadCards가 createdAt 오름차순 정렬을 보장하고, addFrameAt은 배열
 * 끝에 append하므로 순서가 곧 생성 순서다) 판이 이긴다.
 */
function findOwningFrame(
  frames: Card[],
  pt: { x: number; y: number },
): Card | undefined {
  let winner: Card | undefined;
  for (const f of frames) {
    if (frameContainsPoint(f, pt)) winner = f;
  }
  return winner;
}

/**
 * FEAT-subcanvas: candidateId 보드가 ancestorId 보드의 자손(또는 동일)인지.
 * parentBoardId 체인을 거슬러 올라가며 검사. 함을 자기 자손으로 이동(사이클) 차단용.
 */
function isDescendantBoard(
  boards: Board[],
  candidateId: string,
  ancestorId: string,
): boolean {
  let id: string | null | undefined = candidateId;
  const guard = new Set<string>();
  while (id && !guard.has(id)) {
    if (id === ancestorId) return true;
    guard.add(id);
    id = boards.find((b) => b.id === id)?.parentBoardId ?? null;
  }
  return false;
}

/**
 * FEAT-subcanvas: currentBoardId에서 parentBoardId 체인을 거슬러 루트→현재 경로.
 * store.getBreadcrumb()와 Breadcrumb 컴포넌트가 공유하는 단일 소스.
 * 시스템 보드 직하의 함이면 시스템 보드를 루트 크럼(name="")으로 포함해
 * "머무는 생각 › …"으로 보이게 한다. 시스템 보드 자체에 있을 땐 [].
 */
export function computeBreadcrumb(
  boards: Board[],
  currentBoardId: string,
): { id: string; name: string }[] {
  if (currentBoardId === SYSTEM_BOARD_ID) return [];
  const chain: { id: string; name: string }[] = [];
  let id: string | null | undefined = currentBoardId;
  const guard = new Set<string>();
  while (id && id !== SYSTEM_BOARD_ID && !guard.has(id)) {
    guard.add(id);
    const b = boards.find((x) => x.id === id);
    if (!b) break;
    chain.unshift({ id: b.id, name: b.name });
    const parent = b.parentBoardId ?? null;
    if (parent === SYSTEM_BOARD_ID) {
      chain.unshift({ id: SYSTEM_BOARD_ID, name: "" });
      break;
    }
    id = parent;
  }
  return chain;
}

function persistCard(card: Card, boardId: string | null): Promise<void> {
  const storage = useStorage.getState();
  if (!storage.initialized) return Promise.resolve();
  const content = encodeCardContent(card);
  // FEAT-ai-pipeline §2: 메모 저장 시 임베딩 큐로 enqueue.
  // moveCard처럼 본문 변경 없이 호출되는 경로에서도 큐 안에서 콘텐츠 해시
  // 비교로 cache hit이면 skip하므로 안전(AC-4).
  // FEAT-subcanvas: 함 카드 content는 boardRef JSON일 뿐이라 임베딩 대상 아님 — skip.
  // FEAT-sticky-redesign: 메모판(frame) content는 {name} JSON이라 역시 skip.
  if (card.kind !== "board" && card.kind !== "frame") {
    enqueueEmbedRaw(card.id, content, !!card.aiOptOut);
  }
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
    // FEAT-sticky-redesign: 메모판 소속. resolveMembership/moveFrame이 별도 트랜잭션으로
    // 갱신하는 경로도 있지만, 일반 persist 경로(setContent 등)에서도 값이 실려야 유실이 없다.
    frameId: card.frameId,
    aiOptOut: !!card.aiOptOut,
    rotation: 0,
  });
}

/** moveCard / setContent 같은 빈번한 변경은 300ms 디바운스 후 영속.
 * 타이머·flush 기계는 cardPersist.ts(seam)로 분리 — 동작 불변, persist 본문만 주입.
 * flushCard/flushAll은 언마운트·beforeunload 유실 가드(W1)용으로 재노출. */
export { flushCard, flushAll };

function persistCardDebounced(card: Card, boardId: string | null) {
  schedulePersist(card.id, () => persistCard(card, boardId));
}

/**
 * FEAT-sticky-redesign 2단계 리뷰 P1: frameId를 바꾸는 다중 행 경로
 * (resolveMembership·deleteFrame의 멤버 해제)가 이 함수 하나로 DB에 쓴다.
 * 행별 순차 `await db.notes.update`(리뷰에서 지적된 성능 이슈) 대신 Promise.all로
 * 병렬 실행한다. 이미 진행 중인 "rw" db.notes 트랜잭션 안에서 불리면(예: deleteFrame이
 * 프레임 행 삭제와 같은 트랜잭션으로 묶을 때) Dexie가 그 트랜잭션을 그대로 재사용한다
 * (같은 테이블의 부분집합 트랜잭션 전파) — 아니면 새로 연다.
 */
async function setFrameMembership(
  updates: { id: string; frameId: string | undefined }[],
): Promise<void> {
  if (updates.length === 0) return;
  const storage = useStorage.getState();
  if (!storage.initialized) return;
  const db = getDB();
  await db.transaction("rw", db.notes, async () => {
    await Promise.all(
      updates.map((u) => db.notes.update(u.id, { frameId: u.frameId })),
    );
  });
}

/** 보드 전환 페이드 시간 — spec §3 AC-4. */
export const BOARD_FADE_MS = 200;

type WsSet = (
  partial:
    | Partial<WorkspaceState>
    | ((s: WorkspaceState) => Partial<WorkspaceState>),
) => void;
type WsGet = () => WorkspaceState;

/**
 * FEAT-subcanvas: 함 카드들을 cascade 삭제하고 5초 undo 스냅샷을 건다.
 * DB row(board/note/connection/embedding)는 즉시 지우되 OPFS blob은 보존하고,
 * undo 만료(또는 ×) 시에만 purge한다 — 만료 전 undo면 미디어까지 복원되도록.
 */
async function cascadeDeleteFunnels(
  funnelCards: Card[],
  boardAtDeletion: string,
  set: WsSet,
  get: WsGet,
): Promise<void> {
  const storage = useStorage.getState();
  if (!storage.initialized) return;
  const db = getDB();

  const funnelNotes: Note[] = [];
  const boards: Board[] = [];
  const notes: Note[] = [];
  const connections: Connection[] = [];
  const embeddings: EmbeddingCacheEntry[] = [];

  for (const fc of funnelCards) {
    if (!fc.boardRef) continue;
    const fnote = await db.notes.get(fc.id);
    if (fnote) funnelNotes.push(fnote);
    await db.notes.delete(fc.id);
    const snap = await storage.removeBoardCascade(fc.boardRef);
    boards.push(...snap.boards);
    notes.push(...snap.notes);
    connections.push(...snap.connections);
    embeddings.push(...snap.embeddings);
  }

  const freshBoards = await storage.loadBoards();
  const counts = { ...get().subcanvasCounts };
  for (const fc of funnelCards) if (fc.boardRef) delete counts[fc.boardRef];
  set({ boards: freshBoards, subcanvasCounts: counts });

  // 직전 undo가 남아 있으면 그건 즉시 확정(blob purge) — undo 스택은 1개만 유지.
  const prev = get().pendingSubcanvasUndo;
  if (prev) void storage.purgeAttachments([...prev.funnelNotes, ...prev.notes]);

  const expiresAt = Date.now() + BOARD_UNDO_MS;
  set({
    pendingSubcanvasUndo: {
      funnelCards,
      boardAtDeletion,
      funnelNotes,
      boards,
      notes,
      connections,
      embeddings,
      expiresAt,
    },
  });
  setTimeout(() => {
    const cur = get().pendingSubcanvasUndo;
    if (cur && cur.expiresAt === expiresAt) {
      void storage.purgeAttachments([...cur.funnelNotes, ...cur.notes]);
      set({ pendingSubcanvasUndo: null });
    }
  }, BOARD_UNDO_MS);
}

export const useWorkspace = create<WorkspaceState>((set, get) => ({
  cards: [],
  selectedIds: [],
  editingId: null,
  expandedCardId: null,
  penMode: false,
  penTool: "pen",
  penWidth: PEN_DEFAULT_WIDTH,
  penUndoStack: [],
  penRedoStack: [],
  lastPenCardId: null,
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
  subcanvasCounts: {},
  dropTargetFunnelId: null,
  dropTargetCrumbId: null,
  pendingSubcanvasUndo: null,
  draggingId: null,
  draggingMulti: false,
  // FEAT-memo-fulltext-search (W4): 검색 상태 초기값 — 비활성.
  memoSearchQuery: "",
  memoSearchMatchIds: [],

  setSidebarDrag: (s) => set({ sidebarDrag: s }),
  setDragging: (id, multi = false) =>
    set({ draggingId: id, draggingMulti: id ? multi : false }),

  setTemplatePickerOpen: (open) => set({ templatePickerOpen: open }),
  openDeleteDialog: (boardId) => set({ deleteDialogBoardId: boardId }),
  requestRenameBoard: async (boardId) => {
    if (boardId === SYSTEM_BOARD_ID) return;
    await get().setCurrentBoard(boardId);
    set({ pendingRenameBoardId: boardId });
  },
  clearRenameRequest: () => set({ pendingRenameBoardId: null }),

  loadFromStorage: async () => {
    initLiveSync(); // W8: 다중 탭 동기화 구독 시작(멱등)
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
    void get().refreshSubcanvasCounts();
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

    // 7) FEAT-subcanvas: 새 보드의 함 카드들 카드 수 집계
    void get().refreshSubcanvasCounts();
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
    // 2단계 리뷰 P1: 선택에 판이 있으면 그 판의 비선택 멤버도 같이 옮긴다
    // (§4 "판을 옮기면 속한 메모가 같이 옮겨진다"). 이미 선택돼 `ids`에 있는
    // 멤버는 다시 추가하지 않아 한 번만 옮겨진다(§4 "메모는 한 번만").
    const state = get();
    const selectedFrameIds = state.cards
      .filter((c) => ids.has(c.id) && c.kind === "frame")
      .map((c) => c.id);
    if (selectedFrameIds.length > 0) {
      const frameIdSet = new Set(selectedFrameIds);
      for (const c of state.cards) {
        if (c.frameId !== undefined && frameIdSet.has(c.frameId)) ids.add(c.id);
      }
    }
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

  /* ─────────── FEAT-sticky-redesign: 메모판(frame) ─────────── */

  addFrameAt: (x, y) => {
    const boardId = storageBoardId(get().currentBoardId);
    const note = makeFrameNote(boardId, x, y, FRAME_DEFAULT_WIDTH, FRAME_DEFAULT_HEIGHT);
    const card = decodeNoteToCard(note);
    set((s) => ({
      cards: [...s.cards, card],
      selectedIds: [card.id],
      editingId: null,
    }));
    void (async () => {
      const storage = useStorage.getState();
      if (!storage.initialized) await storage.init();
      await storage.saveNote(note);
    })();
    return card.id;
  },

  resolveMembership: (cardIds) => {
    const state = get();
    // cards 배열 순서 = createdAt 오름차순(loadCards 보장 + addFrameAt append) → 나중 판이 뒤.
    const frames = state.cards.filter((c) => c.kind === "frame");
    const idSet = new Set(cardIds);
    const updates: { id: string; frameId: string | undefined }[] = [];
    for (const card of state.cards) {
      if (!idSet.has(card.id) || card.kind === "frame") continue;
      const winner = findOwningFrame(frames, cardCenter(card));
      const nextFrameId = winner?.id;
      if (card.frameId !== nextFrameId) {
        updates.push({ id: card.id, frameId: nextFrameId });
      }
    }
    if (updates.length === 0) return;
    const byId = new Map(updates.map((u) => [u.id, u.frameId]));
    set((s) => ({
      cards: s.cards.map((c) =>
        byId.has(c.id) ? { ...c, frameId: byId.get(c.id) } : c,
      ),
    }));
    void setFrameMembership(updates);
  },

  moveFrame: (frameId, dx, dy) => {
    if (dx === 0 && dy === 0) return;
    const before = get();
    const frame = before.cards.find(
      (c) => c.id === frameId && c.kind === "frame",
    );
    if (!frame) return;
    const memberIds = new Set(
      before.cards.filter((c) => c.frameId === frameId).map((c) => c.id),
    );
    set((s) => ({
      cards: s.cards.map((c) => {
        if (c.id === frameId || memberIds.has(c.id)) {
          return { ...c, x: c.x + dx, y: c.y + dy };
        }
        return c;
      }),
    }));
    // 2단계 리뷰 P1: 이동한 각 행(판+멤버)을 자기 card.id 키로 예약한다. 이전엔
    // `frame-move:${frameId}`라는 별도 키를 써서, persistCardDebounced(card.id 키)가
    // 예약한 renameFrame/setContent 등의 "이동 전 좌표 스냅샷" 쓰기와 순서가 섞여
    // 옛 좌표 전체 put이 이동을 덮어쓰는 경쟁이 있었다(리뷰에서 발견). 같은 키를 쓰면
    // schedulePersist의 최신 예약 우선 규칙이 그대로 이 경쟁을 없앤다. 콜백은 예약
    // 시점이 아니라 실행(fire) 시점의 최신 카드 상태를 읽어 저장한다.
    const boardId = storageBoardId(get().currentBoardId);
    for (const id of [frameId, ...memberIds]) {
      schedulePersist(id, () => {
        const card = get().cards.find((c) => c.id === id);
        if (!card) return Promise.resolve();
        return persistCard(card, boardId);
      });
    }
  },

  resizeFrame: (id, next) => {
    if (!Number.isFinite(next.width) || !Number.isFinite(next.height)) return;
    if (next.x !== undefined && !Number.isFinite(next.x)) return;
    if (next.y !== undefined && !Number.isFinite(next.y)) return;
    let updated: Card | undefined;
    set((s) => ({
      cards: s.cards.map((c) => {
        if (c.id !== id || c.kind !== "frame") return c;
        const w = clamp(next.width, FRAME_MIN_WIDTH, CARD_MAX_WIDTH);
        const h = clamp(next.height, FRAME_MIN_HEIGHT, CARD_MAX_HEIGHT);
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

  renameFrame: (id, name) => {
    // "새 메모판" 기본값·trim·40자 규약은 frameContent.ts(encodeFrameContent) 단일 소스.
    let updated: Card | undefined;
    set((s) => ({
      cards: s.cards.map((c) => {
        if (c.id !== id || c.kind !== "frame") return c;
        updated = { ...c, content: encodeFrameContent(name) };
        return updated;
      }),
    }));
    if (updated) persistCardDebounced(updated, storageBoardId(get().currentBoardId));
  },

  deleteFrame: (id) => {
    const card = get().cards.find((c) => c.id === id);
    if (!card || card.kind !== "frame") return;
    const memberIds = get()
      .cards.filter((c) => c.frameId === id)
      .map((c) => c.id);
    set((s) => ({
      cards: s.cards
        .filter((c) => c.id !== id)
        .map((c) => (c.frameId === id ? { ...c, frameId: undefined } : c)),
      selectedIds: s.selectedIds.filter((x) => x !== id),
      editingId: s.editingId === id ? null : s.editingId,
      expandedCardId: s.expandedCardId === id ? null : s.expandedCardId,
    }));
    cancelPersist(id);
    const storage = useStorage.getState();
    if (!storage.initialized) return;
    const db = getDB();
    // deleteFrame과 멤버 frameId 해제를 한 트랜잭션으로 — setFrameMembership이 여는
    // "rw" db.notes 트랜잭션은 이미 진행 중인 이 트랜잭션(같은 테이블 부분집합)을
    // Dexie가 재사용해 그대로 원자적이다.
    void db.transaction("rw", db.notes, async () => {
      await setFrameMembership(
        memberIds.map((mid) => ({ id: mid, frameId: undefined })),
      );
      await db.notes.delete(id);
    });
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
    set(
      on
        ? { penMode: true, editingId: null }
        : // 펜 모드 종료 = 그리기 세션 종료 → undo/redo 히스토리 비움.
          {
            penMode: false,
            penUndoStack: [],
            penRedoStack: [],
            lastPenCardId: null,
          },
    ),
  togglePenMode: () => get().setPenMode(!get().penMode),
  setPenTool: (tool) => set({ penTool: tool }),
  setPenWidth: (width) =>
    set({ penWidth: clamp(width, PEN_MIN_WIDTH, PEN_MAX_WIDTH) }),
  setOverlay: (id, overlay) => {
    // D3: 변경 "직전" overlay를 undo 스택에 적재(새 입력이므로 redo 무효화).
    const prev = get().cards.find((c) => c.id === id)?.overlay ?? "";
    let updated: Card | undefined;
    set((s) => ({
      cards: s.cards.map((c) => {
        if (c.id !== id) return c;
        updated = { ...c, overlay };
        return updated;
      }),
      penUndoStack: [...s.penUndoStack, { cardId: id, overlay: prev }],
      penRedoStack: [],
      lastPenCardId: id,
    }));
    if (updated)
      persistCardDebounced(updated, storageBoardId(get().currentBoardId));
  },
  penUndo: () => {
    const { penUndoStack, cards } = get();
    if (penUndoStack.length === 0) return;
    const entry = penUndoStack[penUndoStack.length - 1];
    const cur = cards.find((c) => c.id === entry.cardId)?.overlay ?? "";
    let updated: Card | undefined;
    set((s) => ({
      cards: s.cards.map((c) => {
        if (c.id !== entry.cardId) return c;
        updated = { ...c, overlay: entry.overlay };
        return updated;
      }),
      penUndoStack: s.penUndoStack.slice(0, -1),
      penRedoStack: [...s.penRedoStack, { cardId: entry.cardId, overlay: cur }],
      lastPenCardId: entry.cardId,
    }));
    if (updated)
      persistCardDebounced(updated, storageBoardId(get().currentBoardId));
  },
  penRedo: () => {
    const { penRedoStack, cards } = get();
    if (penRedoStack.length === 0) return;
    const entry = penRedoStack[penRedoStack.length - 1];
    const cur = cards.find((c) => c.id === entry.cardId)?.overlay ?? "";
    let updated: Card | undefined;
    set((s) => ({
      cards: s.cards.map((c) => {
        if (c.id !== entry.cardId) return c;
        updated = { ...c, overlay: entry.overlay };
        return updated;
      }),
      penRedoStack: s.penRedoStack.slice(0, -1),
      penUndoStack: [...s.penUndoStack, { cardId: entry.cardId, overlay: cur }],
      lastPenCardId: entry.cardId,
    }));
    if (updated)
      persistCardDebounced(updated, storageBoardId(get().currentBoardId));
  },
  penClear: () => {
    const id = get().lastPenCardId;
    if (!id) return;
    const cur = get().cards.find((c) => c.id === id)?.overlay ?? "";
    if (!cur) return; // 지울 게 없으면 no-op (스택 오염 방지).
    let updated: Card | undefined;
    set((s) => ({
      cards: s.cards.map((c) => {
        if (c.id !== id) return c;
        updated = { ...c, overlay: "" };
        return updated;
      }),
      penUndoStack: [...s.penUndoStack, { cardId: id, overlay: cur }],
      penRedoStack: [],
    }));
    if (updated)
      persistCardDebounced(updated, storageBoardId(get().currentBoardId));
  },

  remove: (id) => {
    // FEAT-sticky-redesign: 판은 삭제 경로가 다르다(메모는 제자리, frameId만 해제).
    const target = get().cards.find((c) => c.id === id);
    if (target && target.kind === "frame") {
      get().deleteFrame(id);
      return;
    }
    // FEAT-subcanvas: 함 카드면 연결된 서브 보드 트리까지 cascade 삭제(5초 undo).
    const card = target;
    const funnel =
      card && card.kind === "board" && card.boardRef ? card : null;
    const boardAtDeletion = get().currentBoardId;
    set((s) => ({
      cards: s.cards.filter((c) => c.id !== id),
      selectedIds: s.selectedIds.filter((x) => x !== id),
      editingId: s.editingId === id ? null : s.editingId,
      expandedCardId: s.expandedCardId === id ? null : s.expandedCardId,
    }));
    cancelPersist(id);
    const storage = useStorage.getState();
    if (!storage.initialized) return;
    if (funnel) {
      void cascadeDeleteFunnels([funnel], boardAtDeletion, set, get);
    } else {
      void storage.removeNote(id);
    }
  },

  removeSelected: () => {
    const ids = get().selectedIds;
    if (ids.length === 0) return;
    // FEAT-sticky-redesign: 선택 중 판은 별도 경로(메모는 제자리, frameId만 해제)로
    // 먼저 처리하고, 나머지 선택에서 제외해 아래 일반 삭제 경로로 removeNote 되지 않게 한다.
    const frameIds = get()
      .cards.filter((c) => ids.includes(c.id) && c.kind === "frame")
      .map((c) => c.id);
    for (const fid of frameIds) get().deleteFrame(fid);
    const remainingIds = ids.filter((id) => !frameIds.includes(id));
    if (remainingIds.length === 0) return;
    const idSet = new Set(remainingIds);
    // FEAT-subcanvas: 선택 중 함 카드 → cascade + 5초 undo. 일반 카드는 즉시 삭제.
    const funnelCards = get().cards.filter(
      (c) => idSet.has(c.id) && c.kind === "board" && c.boardRef,
    );
    const funnelIdSet = new Set(funnelCards.map((c) => c.id));
    const boardAtDeletion = get().currentBoardId;
    set((s) => ({
      cards: s.cards.filter((c) => !idSet.has(c.id)),
      selectedIds: [],
      editingId: s.editingId && idSet.has(s.editingId) ? null : s.editingId,
      expandedCardId:
        s.expandedCardId && idSet.has(s.expandedCardId)
          ? null
          : s.expandedCardId,
    }));
    for (const id of remainingIds) cancelPersist(id);
    const storage = useStorage.getState();
    if (!storage.initialized) return;
    // 함이 아닌 일반 카드는 기존대로 즉시 삭제(blob 해제 포함, undo 없음).
    // frameIds는 위에서 deleteFrame이 이미 처리했으므로 여기서 다시 지우지 않는다.
    for (const id of remainingIds)
      if (!funnelIdSet.has(id)) void storage.removeNote(id);
    // 함 카드는 cascade + 5초 undo.
    if (funnelCards.length > 0) {
      void cascadeDeleteFunnels(funnelCards, boardAtDeletion, set, get);
    }
  },

  deleteCardIfEmpty: (id) => {
    const card = get().cards.find((c) => c.id === id);
    // text(포스트잇) 카드만 대상 — 다른 종류는 스펙 범위 밖(§2 제외).
    if (!card || card.kind !== "text") return;
    // 보수적 3중 가드(AC-1~3): 본문·overlay 비었고 + 한 번도 채워진 적 없을 때만.
    // overlay가 있으면 isMemoEmpty=false → 보존(AC-2). 내용을 지운 카드는
    // everFilled에 남아 wasNeverFilled=false → 보존(AC-3, 데이터 보호 우선).
    if (!isMemoEmpty(card) || !wasNeverFilled(id)) return;

    const boardId = storageBoardId(get().currentBoardId);
    // 삭제 전 스냅샷 — undo 복원 대상. 대기 중 persist는 취소(지운 카드 재기록 방지).
    const snapshot: Card = { ...card };
    set((s) => ({
      cards: s.cards.filter((c) => c.id !== id),
      selectedIds: s.selectedIds.filter((x) => x !== id),
      editingId: s.editingId === id ? null : s.editingId,
      expandedCardId: s.expandedCardId === id ? null : s.expandedCardId,
    }));
    cancelPersist(id);
    forgetCard(id);
    const storage = useStorage.getState();
    if (storage.initialized) void storage.removeNote(id);

    // AC-4: undo 토스트. 복원 시 카드를 되살리고 다시 영속, 채워졌음으로 표시해
    // (markFilled) 같은 카드가 즉시 재삭제되는 루프를 막는다.
    useToasts.getState().push({
      tone: "calm",
      title: "빈 메모 삭제됨",
      duration: 5000,
      action: {
        label: "실행취소",
        onClick: () => {
          markFilled(snapshot.id);
          set((s) =>
            s.cards.some((c) => c.id === snapshot.id)
              ? {}
              : { cards: [...s.cards, snapshot] },
          );
          void persistCard(snapshot, boardId);
        },
      },
    });
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

  /* ─────────── FEAT-subcanvas ─────────── */

  setDropTargetFunnel: (id) => set({ dropTargetFunnelId: id }),
  setDropTargetCrumb: (id) => set({ dropTargetCrumbId: id }),

  refreshSubcanvasCounts: async () => {
    const refs = get()
      .cards.filter((c) => c.kind === "board" && c.boardRef)
      .map((c) => c.boardRef as string);
    if (refs.length === 0) {
      set({ subcanvasCounts: {} });
      return;
    }
    const storage = useStorage.getState();
    if (!storage.initialized) await storage.init();
    const counts = await storage.countCardsByBoard(refs);
    set({ subcanvasCounts: counts });
  },

  createSubcanvas: (x, y) => {
    // 시스템 보드("머무는 생각")를 포함해 어느 보드에서든 함을 만들 수 있다.
    // 함 카드는 현재 보드(시스템이면 boardId=null)에 저장하고, 새 서브 보드의
    // parentBoardId는 현재 보드 id(시스템이면 "system" sentinel)로 둔다.
    const parentBoardId = get().currentBoardId;
    const childBoardId = `b-${Date.now().toString(36)}-${counter++}`;
    const id = nextId();
    const width = widthForKind("board");
    const height = clamp(
      width / aspectForKind("board"),
      CARD_MIN_HEIGHT,
      CARD_MAX_HEIGHT,
    );
    const card: Card = {
      id,
      kind: "board",
      x,
      y,
      width,
      height,
      content: "",
      boardRef: childBoardId,
      lastVisitedAt: Date.now(),
    };
    set((s) => ({
      cards: [...s.cards, card],
      selectedIds: [id],
      editingId: null,
      subcanvasCounts: { ...s.subcanvasCounts, [childBoardId]: 0 },
    }));

    void (async () => {
      const storage = useStorage.getState();
      if (!storage.initialized) await storage.init();
      await storage.saveBoard({
        id: childBoardId,
        name: "",
        isSystem: false,
        parentBoardId,
      });
      await persistCard(card, storageBoardId(parentBoardId));
      const boards = await storage.loadBoards();
      set({ boards });
    })();

    return id;
  },

  enterSubcanvas: async (cardId) => {
    const card = get().cards.find((c) => c.id === cardId);
    if (!card || card.kind !== "board" || !card.boardRef) return;
    await get().setCurrentBoard(card.boardRef);
  },

  goToParent: async () => {
    const cur = get().currentBoardId;
    if (cur === SYSTEM_BOARD_ID) return;
    const board = get().boards.find((b) => b.id === cur);
    // 루트 사용자 보드(부모 없음)는 함을 통해 들어온 게 아니므로 no-op.
    if (!board || board.parentBoardId == null) return;
    await get().setCurrentBoard(board.parentBoardId);
  },

  getBreadcrumb: () => computeBreadcrumb(get().boards, get().currentBoardId),

  moveCardToSubcanvas: async (cardId, funnelCardId) => {
    if (cardId === funnelCardId) return;
    const cards = get().cards;
    const card = cards.find((c) => c.id === cardId);
    const funnel = cards.find((c) => c.id === funnelCardId);
    if (!card || !funnel || funnel.kind !== "board" || !funnel.boardRef) return;
    const targetBoardId = funnel.boardRef;

    // 사이클 가드: 함 카드를 자기 자손(또는 자기 자신) 서브 보드로 넣으면 트리가 깨진다.
    if (
      card.kind === "board" &&
      card.boardRef &&
      isDescendantBoard(get().boards, targetBoardId, card.boardRef)
    ) {
      return;
    }

    const storage = useStorage.getState();
    if (!storage.initialized) await storage.init();
    // FEAT-sticky-redesign §4: 파일함(다른 캔버스)으로 이동하면 판 소속은 풀린다.
    await storage.saveNote({ id: cardId, boardId: targetBoardId, frameId: undefined });

    set((s) => ({
      cards: s.cards.filter((c) => c.id !== cardId),
      selectedIds: s.selectedIds.filter((x) => x !== cardId),
      editingId: s.editingId === cardId ? null : s.editingId,
      dropTargetFunnelId: null,
      subcanvasCounts: {
        ...s.subcanvasCounts,
        [targetBoardId]: (s.subcanvasCounts[targetBoardId] ?? 0) + 1,
      },
    }));

    // 함 카드를 옮기면 그 서브 보드의 부모도 새 보드로 따라간다(트리 일관성).
    if (card.kind === "board" && card.boardRef) {
      await storage.saveBoard({
        id: card.boardRef,
        parentBoardId: targetBoardId,
      });
      const boards = await storage.loadBoards();
      set({ boards });
    }
  },

  moveCardToBoard: async (cardId, targetBoardId) => {
    // moveCardToSubcanvas의 역방향: 현재(서브) 보드 → 상위/조상 보드로 꺼낸다.
    const currentBoardId = get().currentBoardId;
    if (targetBoardId === currentBoardId) return;
    const card = get().cards.find((c) => c.id === cardId);
    if (!card) return;

    // 위(조상)로 올리는 건 항상 안전(사이클 불가). 방어적으로, target이 이 함의
    // 자손이면(있을 수 없는 호출) 트리가 깨지므로 차단 — moveCardToSubcanvas와 대칭.
    if (
      card.kind === "board" &&
      card.boardRef &&
      isDescendantBoard(get().boards, targetBoardId, card.boardRef)
    ) {
      return;
    }

    const storage = useStorage.getState();
    if (!storage.initialized) await storage.init();
    // 시스템 보드 대상이면 boardId=null로 저장(시스템 카드 규약).
    // FEAT-sticky-redesign §4: 다른 캔버스로 나가면 판 소속은 풀린다.
    await storage.saveNote({
      id: cardId,
      boardId: storageBoardId(targetBoardId),
      frameId: undefined,
    });

    set((s) => {
      // count 정합성: 떠나는 현재 보드는 -1(0 미만 가드), 대상이 추적 대상(시스템
      // 아님)이면 +1. 다음 보드 전환 시 refreshSubcanvasCounts가 재집계한다.
      const counts = { ...s.subcanvasCounts };
      if (counts[currentBoardId] !== undefined) {
        counts[currentBoardId] = Math.max(0, counts[currentBoardId] - 1);
      }
      if (targetBoardId !== SYSTEM_BOARD_ID) {
        counts[targetBoardId] = (counts[targetBoardId] ?? 0) + 1;
      }
      return {
        cards: s.cards.filter((c) => c.id !== cardId),
        selectedIds: s.selectedIds.filter((x) => x !== cardId),
        editingId: s.editingId === cardId ? null : s.editingId,
        dropTargetCrumbId: null,
        subcanvasCounts: counts,
      };
    });

    // 함 카드를 꺼내면 그 서브 보드의 부모도 대상 보드로 reparent(트리 일관성).
    // parentBoardId는 보드 row의 리터럴 id(시스템이면 "system" sentinel)를 그대로 쓴다.
    if (card.kind === "board" && card.boardRef) {
      await storage.saveBoard({
        id: card.boardRef,
        parentBoardId: targetBoardId,
      });
      const boards = await storage.loadBoards();
      set({ boards });
    }
  },

  undoSubcanvasRemove: async () => {
    const pending = get().pendingSubcanvasUndo;
    if (!pending) return;
    set({ pendingSubcanvasUndo: null });
    const db = getDB();
    // blob은 아직 안 지웠으므로(만료 전) row만 되돌리면 미디어까지 복원된다.
    await db.boards.bulkPut(pending.boards);
    await db.notes.bulkPut([...pending.funnelNotes, ...pending.notes]);
    if (pending.connections.length)
      await db.connections.bulkPut(pending.connections);
    if (pending.embeddings.length)
      await db.embeddings.bulkPut(pending.embeddings);
    const storage = useStorage.getState();
    const boards = await storage.loadBoards();
    set({ boards });
    // 삭제 시점과 같은 보드를 보고 있으면 함 카드를 화면에 되살린다.
    if (get().currentBoardId === pending.boardAtDeletion) {
      set((s) => ({ cards: [...s.cards, ...pending.funnelCards] }));
    }
    await get().refreshSubcanvasCounts();
  },

  clearSubcanvasUndo: () => {
    const pending = get().pendingSubcanvasUndo;
    if (!pending) return;
    // undo 포기 = 삭제 확정 → 보류했던 OPFS blob 영구 정리.
    void useStorage
      .getState()
      .purgeAttachments([...pending.funnelNotes, ...pending.notes]);
    set({ pendingSubcanvasUndo: null });
  },

  /* ─────────── FEAT-memo-fulltext-search (W4) ─────────── */
  searchMemos: (query) => searchMemosImpl(get().cards, query),

  filterByKeyword: (word) => {
    const q = word.trim();
    if (!q) {
      // 검색 비우면 원상복귀(AC-2).
      set({ memoSearchQuery: "", memoSearchMatchIds: [] });
      return;
    }
    const matches = searchMemosImpl(get().cards, q);
    set({
      memoSearchQuery: word,
      memoSearchMatchIds: matches.map((m) => m.id),
    });
  },

  panToCard: (id, viewportSize) => {
    const card = get().cards.find((c) => c.id === id);
    if (!card) return;
    const v = get().viewport;
    // addCardAtViewportCenter와 동일한 화면 크기 폴백 규약.
    const sidebarW = 148;
    const fallbackW =
      typeof window !== "undefined" ? window.innerWidth - sidebarW : 1100;
    const fallbackH = typeof window !== "undefined" ? window.innerHeight : 700;
    const w = viewportSize?.width ?? fallbackW;
    const h = viewportSize?.height ?? fallbackH;
    // 카드 중심이 화면 중앙에 오도록 viewport 평행이동(scale 유지).
    const cardCx = card.x + card.width / 2;
    const cardCy = card.y + (card.height ?? 80) / 2;
    set({
      viewport: {
        ...v,
        x: w / 2 - cardCx * v.scale,
        y: h / 2 - cardCy * v.scale,
      },
      selectedIds: [id],
    });
  },

  fitToCards: (viewportSize) => {
    // 캔버스의 모든 카드(이미지·링크 포함)를 화면에 담아 포커싱한다.
    // funnel(board)은 서브캔버스 진입점이라 bbox 왜곡 방지 차원에서 제외.
    const targets = get().cards.filter((c) => c.kind !== "board");
    if (targets.length === 0) return;

    // panToCard와 동일한 화면 크기 폴백 규약.
    const sidebarW = 148;
    const fallbackW =
      typeof window !== "undefined" ? window.innerWidth - sidebarW : 1100;
    const fallbackH = typeof window !== "undefined" ? window.innerHeight : 700;
    const w = viewportSize?.width ?? fallbackW;
    const h = viewportSize?.height ?? fallbackH;
    if (w <= 0 || h <= 0) return;

    // 대상 카드들의 bounding box — height 미지정 카드는 보수적 기본값.
    const DEFAULT_H = 160;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const c of targets) {
      minX = Math.min(minX, c.x);
      minY = Math.min(minY, c.y);
      maxX = Math.max(maxX, c.x + c.width);
      maxY = Math.max(maxY, c.y + (c.height ?? DEFAULT_H));
    }

    // 둘레 여백을 포함해 꽉 차게 맞추되, 100% 이상 확대는 막아 단일 메모 과확대를 방지.
    const PAD = 80;
    const boxW = maxX - minX + PAD * 2;
    const boxH = maxY - minY + PAD * 2;
    const scale = clamp(Math.min(w / boxW, h / boxH), MIN_SCALE, 1);

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    set({
      viewport: {
        x: w / 2 - cx * scale,
        y: h / 2 - cy * scale,
        scale,
      },
    });
  },
}));

// FEAT-memo-empty-cleanup (W7): never-filled 추적 구독 시작(멱등). store 생성 직후
// 자기 store를 주입 — 순환 의존 없이 deleteCardIfEmpty가 보존 판정에 쓸 기록을 쌓는다.
startEmptyTracking(useWorkspace);

/* 테스트·디버깅용 export — 프로덕션 코드는 직접 호출 금지. */
export const __internal = {
  decodeNoteToCard,
  encodeCardContent,
  cardKindToNoteKind,
  kindForTool,
  widthForKind,
  isCaptureKind,
  isDescendantBoard,
  SUBCANVAS_MARKER,
  SEED_CARDS,
};
