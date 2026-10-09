"use client";

import { create } from "zustand";
import type { AINoteRef } from "./aiGate";
import { useStorage } from "./storage";
import { SYSTEM_BOARD_ID, isSystemBoardNote, newBoardId } from "./boardIds";
import {
  getDB,
  makeFrameNote,
  type Board,
  type Connection,
  type ConnectionSide,
  type EmbeddingCacheEntry,
  type Note,
  type NoteKind,
  type TextSize,
} from "./db/schema";
import { migratedContent } from "./markdownMigration";
import { enqueueEmbed as enqueueEmbedRaw } from "./ai/embeddingQueue";
import {
  schedulePersist,
  cancelPersist,
  flushCard,
  flushAll,
} from "./cardPersist";
import { initLiveSync, attachLiveDoc, broadcastDocWrite, notifyNoteChanges } from "./db/liveSync"; // W8/n3: 다중 탭 동기화
import {
  activateBoardDoc,
  getActiveBoardDoc,
  getOrOpenBoardDoc,
  closeBoardDoc,
  discardBoardDocByKey,
  isActiveBoard,
  docKeyForBoard,
  destroyBoardDocs,
} from "./ydoc/activeDoc";
import {
  putNote as putNoteDoc,
  updateNoteField,
  updateNoteFields,
  deleteNote as deleteNoteDoc,
  putBoard as putBoardDoc,
  notesMap,
  connectionsMap,
  metaMap,
  readNote,
  readNotes,
  readConnection,
  readConnections,
  readBoard,
  toSharedNote,
  type SharedNote,
} from "./ydoc/model";
import { isRemoteTransaction, transactLocal } from "./ydoc/origin";
import type { MemoColor } from "@/components/workspace/memoVariety";
import {
  clearSharedSnapshots,
  forgetSharedSnapshot,
  getSharedSnapshot,
  setSharedSnapshot,
} from "./ydoc/sharedSnapshot";
import { writeToBoardDoc } from "./ydoc/writeThrough";
import type * as Y from "yjs";
import {
  parseCode,
  parseHandwriting,
  serializeBlocks,
  type CardBlock,
} from "./cardContent";
import {
  defaultFrameColumns,
  encodeFrameContent,
  FRAME_COLUMN_COUNT_MAX,
  FRAME_COLUMN_COUNT_MIN,
  newFrameColumnId,
  normalizeFrameColumns,
  readFrameContent,
  type FrameContentJson,
  type FrameSkinId,
} from "./frameContent";
import { clampFrameWidth } from "./frameSkins";
// FEAT-memo-fulltext-search (W4): 본문 평문 검색 — 셀렉터/액션이 위임.
import { searchMemos as searchMemosImpl } from "./memoSearch";
import { normalizeTitle, normalizeTitleTyping } from "./memoTitle";
import { getTemplate } from "@/templates";
import type { Translator } from "@/i18n";
import {
  PEN_MIN_WIDTH,
  PEN_MAX_WIDTH,
  PEN_DEFAULT_WIDTH,
} from "@/components/workspace/cards/_shared/useDrawing";
import {
  anchorPoint,
  nearestSide,
} from "@/components/workspace/connectors/geometry";
import { useShare } from "./share/store";

/**
 * 시스템 보드 "머무는 생각"의 가상 id. DB에는 row를 두지 않고
 * 실제 노트는 boardId=null로 저장한다 (FEAT-boards 결정 1).
 * 단일 출처는 leaf 모듈 boardIds.ts — ydoc 문서 키도 여기서 파생한다.
 */
export { SYSTEM_BOARD_ID };
export type CurrentBoardId = string;

/**
 * FEAT-memo-table-view: 워크스페이스 표시 모드. 캔버스 ↔ 전체 메모 표 전환(spec §5).
 * 표 모드에서는 Canvas·Dock·캔버스 단축키를 숨긴다(spec §4 영향).
 */
export type WorkspaceView = "canvas" | "table";

/**
 * 캔버스 카드 종류.
 * 10종은 [[NoteKind]]와 동일 (FEAT-capture). storage 저장 시 그대로 매핑.
 */
export type CardKind = NoteKind;

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
  // FEAT-text-tool: 평문 텍스트 도구 — 카드 생성이지만 capture 10종과 별개(독 항목).
  | "textbox"
  // non-capture (다른 FEAT)
  | "line"
  | "board"
  | "column"
  // FEAT-markdown-memo-pen: 펜 모드 토글 (드롭-캡처 아님).
  | "pen"
  | "more"
  | "trash"
  // FEAT-sticky-redesign n7/n8: 메모판 — 독에서 끌어 addFrameAt으로 생성.
  | "frame";

/**
 * 캡처 도구 — Cmd+1~ 단축키 매핑 순서이자 독 노출 순서.
 * spec FEAT-capture §3 AC-1 의존.
 *
 * FEAT-sticky-redesign: 메모는 한 종류(text)로 통합 — image·link·audio·mindmap·file은
 * 메모 안 블록이 되어 독립 캡처 도구에서 제외(6→1종). CardKind/NoteKind에는
 * 호환·마이그레이션 타겟으로 남는다. 기존 Cmd+2~ 단축키는 대상이 사라져 no-op —
 * 재매핑은 후속(brief §9).
 */
export const CAPTURE_TOOLS = [
  "text",
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
  /**
   * FEAT-text-tool: textbox 사용자 색. 미지정이면 기본 잉크 톤.
   * 메모(text)는 해시 색조(memoVariety)를 쓰므로 이 칸을 쓰지 않는다.
   */
  color?: string;
  /** FEAT-text-tool: textbox 글자 크기. 없으면 "m". */
  textSize?: TextSize;
  /**
   * FEAT-text-tool: textbox 폭 모드. true(기본)면 width는 측정값 캐시,
   * false면 사용자 고정 폭. 다른 kind에는 의미 없다.
   */
  autoWidth?: boolean;
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
  /** FEAT-memo-title: 메모 제목. 평문 한 줄(최대 80자). 비면 undefined. */
  title?: string;
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
 * FEAT-connectors: 연결점에서 끌어 선을 잇는 동안의 휘발 상태.
 * pointer는 월드 좌표 — 미리보기 곡선이 포인터를 따라간다.
 */
export interface ConnectionDraft {
  sourceId: string;
  sourceSide: ConnectionSide;
  pointer: { x: number; y: number };
  /** 포인터 아래 연결 대상 카드(자기 자신 제외). */
  targetId: string | null;
  /** 대상 위에 놓이면 강조할 변. */
  targetSide: ConnectionSide | null;
}

/**
 * 사이드바 도구를 마우스로 끌고 있는 동안의 상태.
 * 마우스 클라이언트 좌표는 DockDragPreview가 따라가는 데 쓰인다.
 */
export interface DockDrag {
  toolId: ToolId;
  /** 도크 전용 버튼의 프리뷰 모양 — 할 일·링크는 흰 카드, 사진은 빈 사진 카드(spec/card-faces.md). */
  face?: "todo" | "link" | "photo";
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

export const MIN_SCALE = 0.5;
export const MAX_SCALE = 1.1;

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
 * FEAT-text-tool §5: textbox 글자 크기 4단의 px. spec의 14/18/28/44.
 * Content·TextStyleToolbar·자동 폭 측정이 공유하는 단일 소스.
 */
export const TEXT_SIZE_PX: Record<TextSize, number> = {
  s: 14,
  m: 18,
  l: 28,
  xl: 44,
};

/** textbox 기본 글자 크기. */
export const TEXT_DEFAULT_SIZE: TextSize = "m";

/**
 * FEAT-text-tool: textbox 생성 시 자동 폭의 시작 폭. 내용이 없을 때 커서가 설
 * 최소 자리 — 편집하며 측정 폭으로 늘어난다. 고정 폭 핸들의 하한은 CARD_MIN_WIDTH.
 */
export const TEXTBOX_DEFAULT_WIDTH = 60;

/**
 * textbox 자동 폭의 하한(px) — 한 글자만 있어도 담기는 작은 값. 짧은 라벨을
 * CARD_MIN_WIDTH(120)로 부풀리지 않기 위해 고정 폭 리사이즈 하한과 분리한다(§0).
 */
export const TEXTBOX_MIN_AUTO_WIDTH = 16;

/** textbox 자동 폭 좌우 여백(px) — 측정 글자 폭에 더한다(Content와 동일 값). */
export const TEXTBOX_PADDING_X = 14;

/** FEAT-photo-card: 새 사진 카드의 폭(px). 높이는 원본 비율로 계산한다(spec 성공 기준 3). */
export const PHOTO_DEFAULT_WIDTH = 240;

/** FEAT-photo-card: 캡션 최대 길이(자). 한 줄만 저장한다(spec 경계 조건). */
export const PHOTO_CAPTION_MAX = 200;

/**
 * FEAT-text-tool §7: 독 "텍스트" 아이콘 — "T" 글리프. 별도 PNG 에셋 대신 데이터 URI
 * SVG를 쓴다(독 Image·드래그 프리뷰 배경 공용). 색은 기본 잉크 톤과 맞춘다.
 */
const TEXT_GLYPH_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96' viewBox='0 0 96 96'>" +
  "<text x='48' y='70' font-family='Pretendard, sans-serif' font-size='64' " +
  "font-weight='700' text-anchor='middle' fill='#334155'>T</text></svg>";
export const TEXT_GLYPH_ICON = `data:image/svg+xml,${encodeURIComponent(TEXT_GLYPH_SVG)}`;

/**
 * FEAT-pen-drawing-engine: 펜 굵기 한계·기본값. 단일 소스는 [[useDrawing]]
 * (handwriting 카드와 메모 overlay 공통). 기존 import 경로 호환을 위해 재노출한다.
 */
export { PEN_MIN_WIDTH, PEN_MAX_WIDTH, PEN_DEFAULT_WIDTH };

/** 카드 PNG (/cards/v2/{kind}.png)의 trim된 종이 가로/세로 비율. resize는 이 비율을 강제한다. */
const CARD_ASPECT_BY_KIND: Record<CardKind, number> = {
  // 메모(text)는 정사각형이 아이덴티티 — 리사이즈·생성이 항상 정사각을 유지한다.
  text: 1,
  checklist: 836 / 1169,
  code: 1114 / 811,
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
  // FEAT-text-tool: 텍스트는 종이가 없다 — 비율 강제하지 않음(정사각 폴백은 미사용).
  textbox: 1,
  // FEAT-photo-card: 사진은 원본 비율을 height에 저장한다. addPhotoAt이 실제 비율을
  // 쓰고, 리사이즈는 card.width÷card.height를 쓴다 — 이 표의 값은 미사용 폴백.
  photo: 1,
};

export function aspectForKind(kind: CardKind): number {
  return CARD_ASPECT_BY_KIND[kind] ?? 1;
}

/**
 * 메모 높이 보장 — 앞면은 제목만 absolute로 겹쳐 그려 내용 높이가 0이다. 높이 없는
 * 메모는 띠처럼 납작해지므로 폭과 종이 비율로 채운다. 불러오기·저장·시드가 모두
 * 이 함수를 지나 DB에도 화면에도 높이 없는 메모가 남지 않는다.
 */
function memoHeight(kind: CardKind, width: number, height: number | undefined) {
  if (kind !== "text" || height !== undefined) return height;
  return clamp(width / aspectForKind(kind), CARD_MIN_HEIGHT, CARD_MAX_HEIGHT);
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
  /**
   * FEAT-connectors: 현재 보드 카드에 닿은 active 연결선. 보드 로드 시
   * `storage.loadConnections(cardIds)`로 채운다.
   */
  connections: Connection[];
  /**
   * FEAT-connectors: 선택된 연결선 id. 카드 선택(selectedIds)과 상호 배타 —
   * 한쪽을 고르면 다른 쪽은 비운다.
   */
  selectedConnectionId: string | null;
  /** FEAT-connectors: hover 중인 연결 가능 카드 — 연결점을 띄울 대상. transient. */
  hoveredCardId: string | null;
  /** FEAT-connectors: 연결 드래그 세션 중 미리보기 상태. null이면 드래그 아님. */
  connectionDraft: ConnectionDraft | null;
  viewport: Viewport;
  pendingAIGate: PendingAIGate | null;
  /** FEAT-capture T-6: Cmd+Shift+N에서 사용할 마지막 도구. addCardAt마다 갱신. */
  lastToolId: CaptureToolId;

  /** 사용자 보드 목록 (시스템 보드는 포함하지 않음). 최근 수정 순. */
  boards: Board[];
  /** 현재 표시 중인 보드 id — 시스템 보드도 예외 없는 UUID id다(n1, "system" 센티널 없음). */
  currentBoardId: CurrentBoardId;
  /** Cmd+B 토글용 — 가장 최근에 머물렀던 사용자 보드 id. */
  lastNonSystemBoardId: string | null;
  /** 보드별 viewport memory — 보드 전환 시 줌·팬 복원용. in-memory only. */
  viewportByBoard: Record<string, Viewport>;
  /** 보드 전환 페이드 (200ms ease-out) 진행 중 표시. UI 레이어가 구독. */
  boardTransitioning: boolean;
  /**
   * n23 작업 4: 부팅 예산(3초)을 넘긴 Dexie→Yjs 이전이 백그라운드에서 계속되는 동안
   * true. UI가 로딩 표시를 띄운다. 이전이 끝나면 스토어를 다시 읽고 false.
   */
  migrationPending: boolean;
  /**
   * n3: 부팅(마이그레이션 + loadFromStorage)이 끝났는가. `/b/[boardId]` 동기화가
   * 이전이 끝난 뒤에만 보드를 열도록 하는 신호 — 이전 중 열면 빈/낡은 문서를 읽는다.
   */
  bootstrapComplete: boolean;
  /** FEAT-memo-table-view: 현재 표시 모드. 기본 캔버스. */
  view: WorkspaceView;
  /**
   * FEAT-memo-table-view D1: 표 진입 시점의 보드. 행 클릭이 보드를 바꾼 뒤
   * 메모창을 닫거나 캔버스로 돌아갈 때 이 보드로 복원한다(뷰포트는
   * viewportByBoard가 이미 복원). "캔버스에서 보기"는 의도적 이동이라 비운다.
   */
  tableReturnBoardId: CurrentBoardId | null;
  /**
   * FEAT-memo-table-view P2-4: 캔버스가 한 번이라도 자리 잡았는지(최초 fit 또는
   * programmatic panToCard). 표↔캔버스 재마운트에서 최초 fit이 사용자가 보던/
   * panToCard가 잡은 뷰포트를 덮지 않게 한다. 기존엔 Canvas 모듈 전역 플래그라
   * panToCard와 경쟁했다.
   */
  canvasHasFitted: boolean;
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
  /**
   * 보드 전환. opts.touchLastOpened=false면 lastOpenedAt을 갱신하지 않는다 —
   * 표 행 열기처럼 맥락 점프일 때 "최근 연 보드" 순서를 흔들지 않기 위함(D1).
   */
  setCurrentBoard: (
    id: CurrentBoardId,
    opts?: { touchLastOpened?: boolean },
  ) => Promise<void>;
  /**
   * n3 D8: 보드 전환 "요청". URL이 원본이라 스토어는 라우터 sink로 push만 하고,
   * 실제 상태 반영은 `/b/[boardId]` 페이지의 effect가 setCurrentBoard로 한다.
   * sink가 없으면(라우터 없는 테스트 환경) setCurrentBoard로 폴백한다.
   */
  navigateToBoard: (id: CurrentBoardId) => Promise<void>;
  createBoard: (name?: string) => Promise<string>;
  /**
   * FEAT-onboarding-routes n4: "예제로 시작" — 예제 메모 3장이 든 새 보드를 만들고 이동한다.
   * 첫 보드 고르기 화면(AC-5)에서 부른다.
   */
  createExampleBoard: (name?: string) => Promise<string>;
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

  /* ─────────── FEAT-memo-table-view: 전체 메모 표 ─────────── */
  /** 캔버스 ↔ 표 전환. 표 진입 시 보드를 기억하고, 캔버스 복귀 시 복원한다(D1). */
  setView: (view: WorkspaceView) => void;
  /** 표 진입 시점 보드로 복원(메모창 닫힘·캔버스 복귀). 없으면 no-op. */
  restoreTableReturn: () => Promise<void>;
  /** P2-4: 캔버스가 자리 잡았음을 표시 — 재마운트 시 최초 fit을 건너뛰게 한다. */
  markCanvasFitted: () => void;
  /**
   * 표에서 메모로 점프(AC-6) — 메모가 속한 보드로 전환하고 그 카드를 화면 중앙에
   * 선택 상태로 놓은 뒤 캔버스 뷰로 돌아간다. 메모가 없으면 no-op.
   */
  openCardOnCanvas: (noteId: string) => Promise<void>;

  addCardAt: (toolId: ToolId, x: number, y: number) => string;
  /**
   * FEAT-photo-card: 지정 좌표에 사진 카드를 만든다(기존 addCardAt과 분리한 이유는
   * 첨부 참조·원본 비율이 필요하고 인라인 편집 모드로 들어가면 안 되기 때문).
   * 폭은 [[PHOTO_DEFAULT_WIDTH]], 높이는 `240 × naturalH ÷ naturalW`로 저장한다.
   * 원본 크기를 못 읽으면 정사각형.
   */
  addPhotoAt: (
    x: number,
    y: number,
    /** ref가 없으면 빈 사진 카드 — 카드를 눌러 사진을 고른다(spec/card-faces.md). */
    opts?: { ref: string; mediaType?: string; naturalW?: number; naturalH?: number },
  ) => string;
  /** 화면 중앙의 world 좌표에 카드 생성 (단축키 진입). viewport 크기는 인자로 주입. */
  addCardAtViewportCenter: (
    toolId: ToolId,
    viewportSize?: { width: number; height: number },
  ) => string;
  moveCard: (id: string, x: number, y: number) => void;
  moveSelectedBy: (dx: number, dy: number) => void;
  /**
   * FEAT-collab-auth n3 D4: 드래그 종료 시 좌표를 Y.Doc에 한 번 쓴다.
   * ids 생략 시 현재 선택. 드래그 중에는 문서를 쓰지 않는다.
   */
  commitMove: (ids?: string[]) => void;
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
   * 화면 중앙의 world 좌표에 메모판을 만든다(독 Enter/클릭 생성 — 2단계 리뷰 P1-4:
   * 중심 좌표 계산을 addCardAtViewportCenter와 같은 자리(store)에 모은다).
   * viewport 크기는 인자로 주입, 생략 시 window 폴백.
   */
  addFrameAtViewportCenter: (viewportSize?: { width: number; height: number }) => string;
  /**
   * cardIds 각각의 중심점으로 소속 판을 다시 정한다(spec §4 "소속 판정" 전 규칙).
   * 겹친 판은 나중에 만든 판(= cards 배열에서 더 뒤, loadCards가 createdAt 오름차순
   * 정렬을 보장) 우선. frame 카드 자신은 대상에서 제외.
   * 드롭 종료·판 드롭·판 리사이즈 시점에만 호출한다.
   */
  resolveMembership: (cardIds: string[]) => void;
  /**
   * 판과 그 판에 속한 메모 전부를 같은 델타로 옮긴다. 로컬 state는 즉시 갱신하고,
   * DB 반영은 판+멤버를 한 Dexie 트랜잭션으로 쓰는 그룹 쓰기를 각 카드 키로 디바운스 예약한다(동시성 §: 일부만 저장 금지).
   */
  moveFrame: (frameId: string, dx: number, dy: number) => void;
  /** 판 리사이즈. 폭은 스킨 규칙([[clampFrameWidth]]), 높이는 [[FRAME_MIN_HEIGHT]]~[[CARD_MAX_HEIGHT]]로 클램프. */
  resizeFrame: (
    id: string,
    /**
     * baseWidth: 자유 판 상한 계산에 쓸 기준 폭. 핸들 드래그는 시작 폭을 넘긴다 —
     * 드래그 중 바뀌는 현재 폭을 쓰면 좁혔다 넓힐 때 상한이 내려가 반대편 모서리가 튄다.
     */
    next: { width: number; height: number; x?: number; y?: number; baseWidth?: number },
  ) => void;
  /** 판 이름 변경. 1~40자, trim 후 빈 문자열이면 "새 메모판"으로 되돌린다. */
  renameFrame: (id: string, name: string) => void;
  /* ─────────── FEAT-frame-skins: 스킨·세로 칸 ─────────── */
  /**
   * 판 스킨을 바꾼다. 세로 칸으로 바뀌면 칸 목록이 없을 때 기본 3칸을 만들고,
   * 폭이 칸 수 × 240보다 좁으면 그만큼 오른쪽으로 넓힌 뒤 소속 판을 다시 판정한다(AC-4).
   * 자유로 바꿔도 칸 목록은 지우지 않는다(AC-3).
   */
  setFrameSkin: (id: string, skin: FrameSkinId) => void;
  /** 오른쪽 끝에 이름 빈 칸을 더한다. 최대 8개. 폭이 좁으면 (N+1)×240까지 넓힌다(AC-6). */
  addFrameColumn: (id: string) => void;
  /** 칸 이름을 바꾼다. trim 후 최대 20자, 빈 이름 허용(AC-7). */
  renameFrameColumn: (id: string, columnId: string, name: string) => void;
  /** 칸을 지운다. 최소 2개. 판 폭·메모 좌표·소속은 그대로다(AC-8). */
  removeFrameColumn: (id: string, columnId: string) => void;
  /** 판을 지운다. 속한 메모는 제자리에 남고 frameId만 해제한다(메모 자체는 안 지운다). */
  deleteFrame: (id: string) => void;

  setContent: (id: string, content: string) => void;
  /** FEAT-memo-title: 제목 타이핑. normalizeTitleTyping만 적용 — 앞뒤 공백은 살려 둔다(AC-7). */
  setTitle: (id: string, title: string) => void;
  /** FEAT-memo-title-front-edit AC-7: 편집 종료 시 제목 확정 — 앞뒤 공백을 자르고 즉시 영속. */
  commitTitle: (id: string) => void;

  /* ─────────── FEAT-text-tool: 평문 텍스트(textbox) ─────────── */
  /** textbox 글자 크기·색 변경. 지정한 항목만 갱신한다(AC-5). */
  setTextStyle: (id: string, style: { textSize?: TextSize; color?: string }) => void;
  /**
   * 메모(kind "text") 색을 바꾼다 (spec/memo-color.md). null이면 기본 노랑으로 되돌린다.
   * 메모가 아닌 카드와 이미 그 색인 메모는 건드리지 않는다.
   */
  setMemoColor: (ids: string[], color: MemoColor | null) => void;
  /**
   * textbox 폭 변경. number면 autoWidth=false(고정 폭, 줄바꿈), "auto"면 자동 폭.
   * 고정 폭은 CARD_MIN_WIDTH~CARD_MAX_WIDTH로 클램프한다(AC-4).
   */
  setTextWidth: (id: string, width: number | "auto") => void;
  /**
   * 자동 폭 textbox가 내용 측정값으로 width 캐시를 갱신한다 — autoWidth는 유지한다
   * (§5 "true면 width는 측정값 캐시"). 사용자 리사이즈([[setTextWidth]])와 구분된다.
   */
  setTextMeasuredWidth: (id: string, width: number) => void;
  /**
   * spec/card-faces.md: 흰 카드 앞면(링크·할 일 메모, T)의 실제 높이. 화면이 잴 때마다 메모리에만 쓴다 —
   * 연결선·선택 상자 계산용이고 저장하지 않는다(로드 뒤 다시 잰다).
   */
  setFaceHeight: (id: string, height: number) => void;
  /**
   * 메모판 위에 새로 만들어져 바로 판에 속한 카드 — 그 카드가 화면에 뜨면 "착" 모션을 한 번 튼다
   * (끌어 넣을 때와 같은 효과). DraggableCard가 재생하고 비운다. 저장하지 않는다.
   */
  snapCardId: string | null;
  clearSnapCard: () => void;
  /**
   * FEAT-text-tool AC-2: T 키 텍스트 배치 모드. 켜지면 캔버스 커서가 바뀌고
   * 다음 캔버스 클릭에서 textbox를 만든 뒤 한 번만 풀린다(1회성).
   */
  textPlacementArmed: boolean;
  armTextPlacement: () => void;
  disarmTextPlacement: () => void;
  /**
   * FEAT-text-tool AC-6: 편집 종료 시 비어 있는 textbox를 휴지통 없이 즉시 삭제.
   * 휴지통·되돌리기를 우회한다(스펙 §2 "되돌리기 대상 아님").
   */
  hardDeleteNote: (id: string) => void;

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

  /* ─────────── FEAT-connectors: 카드 연결선 ─────────── */
  /** 연결선 새로 만들기. 같은 방향 중복이면 이미 있는 id를 반환하고 그 선을 선택. */
  connectCards: (
    sourceId: string,
    sourceSide: ConnectionSide,
    targetId: string,
    targetSide: ConnectionSide,
  ) => string | null;
  /** 빈 곳 드롭 — (x,y) 중심에 새 메모를 만들고 sourceSide↔마주보는 변으로 잇는다. */
  connectToNewMemo: (
    sourceId: string,
    sourceSide: ConnectionSide,
    x: number,
    y: number,
  ) => string;
  removeConnection: (id: string) => void;
  /** 라벨 갱신. trim 후 빈 문자열이면 label 제거. */
  setConnectionLabel: (id: string, label: string) => void;
  /** 선 선택. 카드 선택은 해제한다. null이면 선택 해제. */
  selectConnection: (id: string | null) => void;
  /** 연결점 노출 대상 카드 hover 갱신(카드 본체·연결점 공용). */
  setHoveredCard: (id: string | null) => void;
  /** 연결 드래그 세션 갱신/종료(null). */
  setConnectionDraft: (draft: ConnectionDraft | null) => void;

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
  /** ids를 주면 그 카드들을, 생략하면 지금 선택을 지운다. */
  removeSelected: (ids?: string[]) => void;

  /* ─────────── FEAT-trash: 휴지통 ─────────── */
  /** 휴지통 패널 열림 상태. */
  trashOpen: boolean;
  /** 휴지통 항목 수 — Dock의 점 배지가 구독. */
  trashCount: number;
  setTrashOpen: (open: boolean) => void;
  /** 휴지통 항목 수를 다시 센다(삭제·복구·영구삭제 뒤). */
  refreshTrashCount: () => Promise<void>;
  /**
   * 휴지통에서 복구. fallback으로 현재 보드와 뷰포트 중심을 넘긴다. 복구된 메모의
   * boardId가 현재 보드이면 cards에 넣는다. 아니면 cards는 그대로(AC-5).
   */
  restoreFromTrash: (id: string) => Promise<void>;

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
  dockDrag: DockDrag | null;
  setDockDrag: (s: DockDrag | null) => void;

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
  /**
   * FEAT-trash-drag: 카드 드래그 중 커서가 독의 휴지통 버튼 위에 있는가 — 드롭
   * 하이라이트용. transient. dropTargetFunnelId·dropTargetCrumbId와 같은 성격이다.
   */
  dropTargetTrash: boolean;
  setDropTargetTrash: (v: boolean) => void;
  /**
   * FEAT-frame-feel T2: 메모 한 장 드래그 중 "놓으면 속하게 될 판" id — 판 테두리
   * 강조용. transient. 소속 판정과 같은 [[findOwningFrame]]·[[cardCenter]]로 계산한다.
   * 묶음·판 드래그에서는 켜지 않는다(D2).
   */
  dropTargetFrameId: string | null;
  setDropTargetFrame: (id: string | null) => void;
  /**
   * FEAT-frame-feel T4: 판 단독 드래그 중인 판 id — 그 판 멤버들이 흔들림용
   * transform(`--tilt` 기반)을 쓸지 정한다. transient. 드래그 시작·끝에 한 번씩만
   * 쓰고, 각도 갱신은 멤버 DOM의 CSS 변수에 직접 쓴다(스토어 카드 배열 불변, AC-10).
   */
  wobbleFrameId: string | null;
  setWobbleFrame: (id: string | null) => void;
  /** 현재 보드의 함 카드들에 대한 카드 수를 다시 집계해 subcanvasCounts 갱신. */
  refreshSubcanvasCounts: () => Promise<void>;
  /**
   * 현재 보드 (x,y)에 함 카드 + 연결된 빈 서브 보드(parentBoardId=현재)를 생성한다.
   * @returns 생성된 함 카드 id.
   */
  createSubcanvas: (x: number, y: number) => string;
  /**
   * 화면 중앙의 world 좌표에 함 카드 + 빈 서브 보드를 만든다(독 Enter/클릭 생성 —
   * addCardAtViewportCenter·addFrameAtViewportCenter와 같은 규약).
   */
  createSubcanvasAtViewportCenter: (viewportSize?: { width: number; height: number }) => string;
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
  // board·frame은 텍스트 입력 카드가 아니다 — drop/더블클릭 시 편집 모드로 들어가지 않는다.
  // FEAT-photo-card: 사진도 인라인 편집(editingId)으로 들어가지 않는다 — 캡션은 우클릭
  // 메뉴로만 열고, 더블클릭은 크게 보기다. next-card 양산 흐름(Enter)에서도 제외된다.
  return kind !== "board" && kind !== "frame" && kind !== "photo";
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
    // FEAT-text-tool: 독 "텍스트" 도구 → textbox.
    case "textbox":
      return "textbox";
    // FEAT-subcanvas: board 도구 → 함 카드.
    case "board":
      return "board";
    // FEAT-sticky-redesign n8: 독 드래그 프리뷰 크기 계산용 — 실제 생성은 addFrameAt.
    case "frame":
      return "frame";
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
    // FEAT-text-tool: 자동 폭 시작 폭 — 내용이 없을 때의 최소 자리.
    case "textbox":
      return TEXTBOX_DEFAULT_WIDTH;
    // FEAT-photo-card: 새 사진 카드 폭(spec 성공 기준 3). 높이는 원본 비율로 계산.
    case "photo":
      return PHOTO_DEFAULT_WIDTH;
    case "text":
    default:
      return 240;
  }
}

/**
 * 화면 중앙의 client 좌표(sx,sy) — addCardAtViewportCenter·addFrameAtViewportCenter·
 * createSubcanvasAtViewportCenter가 공유하는 계산(2단계 리뷰 P1-4: 좌표 계산 단일화).
 * 사이드바가 걷혀 캔버스가 화면 왼쪽 끝부터 시작하므로 fallback도 window 전체 폭.
 */
function viewportCenterScreenPoint(viewportSize?: { width: number; height: number }): {
  sx: number;
  sy: number;
} {
  const fallbackW = typeof window !== "undefined" ? window.innerWidth : 1100;
  const fallbackH = typeof window !== "undefined" ? window.innerHeight : 700;
  const w = viewportSize?.width ?? fallbackW;
  const h = viewportSize?.height ?? fallbackH;
  return { sx: w / 2, sy: h / 2 };
}

/** n10 브라우저 결함4: 화면 중앙 생성이 겹칠 때 비켜 쌓는 간격(px) — spec §4 드롭 규칙과 동일값. */
const CENTER_STACK_OFFSET_PX = 24;

function rectsOverlapWorld(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

/**
 * n10 브라우저 결함4: 독 Enter(또는 화면 가운데 생성)는 매번 같은 화면 중앙
 * 월드 좌표를 계산한다 — 메모판·메모·파일함을 연달아 만들면 정확히 같은 자리에
 * 겹쳐 쌓였다(하나를 살짝 끌면 바로 밑 카드에 흡수됐다). addCardAtViewportCenter·
 * addFrameAtViewportCenter·createSubcanvasAtViewportCenter가 공유하는 보정 —
 * 그 자리에 이미(비-frame) 카드가 있으면 spec §4 드롭 규칙과 같은 24px 간격으로
 * 대각선으로 비켜 놓는다. frame은 배경 레이어라 충돌 판정에서 뺀다.
 */
function avoidCenterOverlap(
  x: number,
  y: number,
  width: number,
  height: number,
  cards: Card[],
  visible?: { x: number; y: number; width: number; height: number },
): { x: number; y: number } {
  const free = (ox: number, oy: number) =>
    !cards.some((c) => {
      if (c.kind === "frame") return false;
      const ch = c.height ?? c.width;
      return rectsOverlapWorld(ox, oy, width, height, c.x, c.y, c.width, ch);
    });
  if (free(x, y)) return { x, y };

  // 화면 안에서 가운데와 가장 가까운 빈자리를 찾는다. 대각선으로만 밀면 큰 카드가
  // 가운데 있을 때 새 카드가 화면 밖에 생겨 안 보였다.
  // ponytail: 40px 격자 전수 — 화면 하나에 후보 ~800개라 충분히 싸다. 느려지면 나선 탐색으로.
  if (visible) {
    const STEP = 40;
    const candidates: { x: number; y: number; d: number }[] = [];
    for (let gx = visible.x; gx + width <= visible.x + visible.width; gx += STEP) {
      for (let gy = visible.y; gy + height <= visible.y + visible.height; gy += STEP) {
        candidates.push({ x: gx, y: gy, d: (gx - x) ** 2 + (gy - y) ** 2 });
      }
    }
    candidates.sort((a, b) => a.d - b.d);
    const hit = candidates.find((c) => free(c.x, c.y));
    if (hit) return { x: hit.x, y: hit.y };
  }

  // 화면에 빈자리가 없으면 예전처럼 대각선으로 비켜 쌓는다.
  let ox = x;
  let oy = y;
  const MAX_TRIES = 40;
  for (let i = 0; i < MAX_TRIES && !free(ox, oy); i++) {
    ox += CENTER_STACK_OFFSET_PX;
    oy += CENTER_STACK_OFFSET_PX;
  }
  return { x: ox, y: oy };
}

/** 화면에 보이는 월드 영역 — 가운데 생성이 빈자리를 찾는 범위. */
function visibleWorldRect(
  v: { x: number; y: number; scale: number },
  sx: number,
  sy: number,
): { x: number; y: number; width: number; height: number } {
  return { x: -v.x / v.scale, y: -v.y / v.scale, width: (sx * 2) / v.scale, height: (sy * 2) / v.scale };
}

const SEED_CARDS: Card[] = [
  {
    id: "seed-todo",
    kind: "text",
    x: 320,
    y: 140,
    width: 460,
    height: 460,
    content: "- [ ] 첫구매 전환",
  },
  {
    // FEAT-sticky-redesign n10: 메모는 한 종류(text) — 옛 image 시드를 유지하지 않는다.
    id: "seed-preview",
    kind: "text",
    x: 320,
    y: 500,
    width: 130,
    height: 130,
    content: "",
  },
  {
    id: "seed-empty",
    kind: "text",
    x: 380,
    y: 620,
    width: 280,
    height: 280,
    content: "",
  },
];

/** 예제 시드 카드 id — 시스템 보드에 자동 주입된 "예제"일 뿐 사용자 콘텐츠가 아니다. */
const SEED_CARD_IDS = new Set(SEED_CARDS.map((c) => c.id));

/**
 * FEAT-onboarding-routes n4 — 첫 보드 고르기 화면을 띄울지 (AC-5·AC-7).
 *
 * 사용자 보드가 하나도 없고, 시스템 보드에 사용자가 만든 카드가 없을 때만 true다.
 * 즉 방금 로그인한 새 사용자(시스템 보드에는 자동 주입된 예제 메모 3장뿐)에는
 * 뜨고, 예전부터 시스템 보드에 메모를 쌓아 둔 기존 사용자에는 뜨지 않는다(AC-7).
 */
export function needsFirstBoard(boards: Board[], cards: Card[]): boolean {
  if (boards.some((b) => !b.isSystem)) return false;
  return cards.every((c) => SEED_CARD_IDS.has(c.id));
}

let counter = 1;
const nextId = () => `c-${Date.now().toString(36)}-${counter++}`;
let connCounter = 1;

const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));

/* ─────────── 영속 매핑 ─────────── */

/** FEAT-subcanvas: 함 카드 content에 박는 마커. boardRef와 함께 JSON 인코딩. */
const SUBCANVAS_MARKER = "__moss_subcanvas_v1__";

/**
 * 함(board) 카드 content 인코딩(boardRef를 가리킨다). 외부 브리지가 현재 보드 아닌 곳에
 * funnel 카드를 만들 때 쓴다 — encodeCardContent board 분기와 단일 소스.
 */
export function encodeSubcanvas(boardRef: string): string {
  return JSON.stringify({ [SUBCANVAS_MARKER]: true, boardRef });
}

function encodeCardContent(card: Card): string {
  if (card.kind === "board") {
    return JSON.stringify({
      [SUBCANVAS_MARKER]: true,
      boardRef: card.boardRef ?? "",
    });
  }
  return card.content;
}

function decodeNoteToCard(note: Note): Card {
  // FEAT-subcanvas: 함 카드 — content JSON에서 boardRef 복원. migration 경로 전에 처리.
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

  // 옛 comment 마커 JSON(__moss_comment_v1__/$comment)이 담긴 text 행도 그대로
  // 평문 text로 렌더한다 — comment kind는 삭제됐다(크래시 없이 열화 렌더).

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
    // 메모(text)는 항상 정사각형 — 옛 데이터의 직사각 height와 높이 없는 행(납작 메모)을
    // width로 정규화한다.
    height: kind === "text" ? note.width : note.height,
    content,
    // FEAT-text-tool: textbox 색·크기·폭 모드. 다른 kind는 이 칸을 쓰지 않는다.
    color: note.color,
    textSize: note.textSize,
    autoWidth: note.autoWidth,
    attachmentRef: note.attachmentRef,
    mediaType: note.mediaType,
    overlay: note.overlay,
    // FEAT-sticky-redesign: 메모판 소속 — frame 행 자신은 항상 undefined로 저장돼 있다.
    frameId: note.frameId,
    // FEAT-memo-title: 제목. 옛 행은 필드가 없다 — undefined = 제목 없음.
    title: note.title,
    aiOptOut: note.aiOptOut || undefined,
    lastVisitedAt: note.lastVisitedAt,
  };
}

/**
 * FEAT-sticky-redesign §4 "소속 판정": 카드 높이 미지정 시 사용할 보수적 기본값.
 * fitToCards의 DEFAULT_H(160)와 같은 값 — 실측 높이를 모르는 상태에서의 중심점 근사.
 */
const FRAME_MEMBERSHIP_DEFAULT_HEIGHT = 160;

/**
 * FEAT-text-tool P2-2: 보드 로드 시 빈(trim) textbox 행을 걷어낸다. 생성 즉시
 * persist되고 빈 삭제가 onBlur에만 있어 새로고침·탭 닫기에서 빈 행이 남는 문제를 막는다.
 * 제거 대상 id는 호출자가 DB에서 영구 삭제(hardDeleteNotes)한다.
 */
export function pruneEmptyTextboxes(cards: Card[]): {
  cards: Card[];
  removedIds: string[];
} {
  const removedIds: string[] = [];
  const kept = cards.filter((c) => {
    if (c.kind === "textbox" && c.content.trim() === "") {
      removedIds.push(c.id);
      return false;
    }
    return true;
  });
  return { cards: kept, removedIds };
}

/** 카드의 중심점(world 좌표). height 미지정이면 보수적 기본값으로 근사. */
export function cardCenter(card: Card): { x: number; y: number } {
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
export function findOwningFrame(
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

function persistCardDexie(card: Card, boardId: string | null): Promise<Note> {
  const storage = useStorage.getState();
  if (!storage.initialized) return Promise.resolve(initialNoteFromCard(card, boardId));
  const content = encodeCardContent(card);
  // FEAT-ai-pipeline §2: 메모 저장 시 임베딩 큐로 enqueue.
  // moveCard처럼 본문 변경 없이 호출되는 경로에서도 큐 안에서 콘텐츠 해시
  // 비교로 cache hit이면 skip하므로 안전(AC-4).
  // FEAT-subcanvas: 함 카드 content는 boardRef JSON일 뿐이라 임베딩 대상 아님 — skip.
  // FEAT-sticky-redesign: 메모판(frame) content는 {name} JSON이라 역시 skip.
  // FEAT-text-tool: textbox는 AI 파이프라인 대상 아님(spec §2) — enqueue하지 않는다.
  if (card.kind !== "board" && card.kind !== "frame" && card.kind !== "textbox") {
    // FEAT-memo-title: 임베딩 입력은 "제목 + 빈 줄 + 본문". 해시가 입력 전체로 계산되므로
    // 제목만 바뀌어도 다시 임베딩된다(AC-9). 제목 없으면 본문만.
    const embedInput = card.title ? `${card.title}\n\n${content}` : content;
    enqueueEmbedRaw(card.id, embedInput, !!card.aiOptOut);
  }
  return storage.saveNote({
    id: card.id,
    boardId,
    kind: card.kind,
    x: card.x,
    y: card.y,
    width: card.width,
    height: memoHeight(card.kind, card.width, card.height),
    content,
    // FEAT-text-tool: textbox 색·크기·폭 모드 영속. undefined를 patch에 실으면
    // mergeNote 스프레드가 기존 값을 지우므로 정의된 항목만 싣는다.
    ...(card.color !== undefined ? { color: card.color } : {}),
    ...(card.textSize !== undefined ? { textSize: card.textSize } : {}),
    ...(card.autoWidth !== undefined ? { autoWidth: card.autoWidth } : {}),
    attachmentRef: card.attachmentRef,
    mediaType: card.mediaType,
    overlay: card.overlay,
    // FEAT-sticky-redesign: 메모판 소속. resolveMembership/moveFrame이 별도 트랜잭션으로
    // 갱신하는 경로도 있지만, 일반 persist 경로(setContent 등)에서도 값이 실려야 유실이 없다.
    frameId: card.frameId,
    title: card.title,
    aiOptOut: !!card.aiOptOut,
    rotation: 0,
  });
}

/* ─────────── n23 작업 2: 공유 문서 쓰기의 단일 통로 ───────────
 *
 * 카드→문서 Note 변환과 "어떤 필드가 공유인가" 결정을 이 한 곳에 모은다.
 * 호출부는 persistCard/persistCardDebounced만 부르고, 이들이 문서 쓰기를 포함한다.
 * 드래그 중 쓰기 금지(D4)는 `{doc:false}`로 명시한다 — 좌표는 commitMove가 한 번 쓴다.
 */

/** 카드의 공유 필드를 활성 문서에 반영한다(없으면 생성). 문서에 안 실리는 기기 로컬
 * 필드(lastVisitedAt)는 쓰지 않는다. 생성 시각은 불변이라 기존 메모에는 갱신하지 않는다. */
function writeCardToDoc(card: Card, boardId: string | null): void {
  withActiveDoc(boardId, (doc) => writeCardToDocHandle(doc, card, boardId));
}

function persistCard(
  card: Card,
  boardId: string | null,
  opts?: { doc?: boolean },
): Promise<Note> {
  if (opts?.doc !== false) writeCardToDoc(card, boardId);
  return persistCardDexie(card, boardId);
}

/** moveCard / setContent 같은 빈번한 변경은 300ms 디바운스 후 영속.
 * 문서 반영은 즉시(원격 피어가 곧 본다), Dexie 미러만 디바운스한다.
 * 타이머·flush 기계는 cardPersist.ts(seam)로 분리 — 동작 불변, persist 본문만 주입.
 * flushCard/flushAll은 언마운트·beforeunload 유실 가드(W1)용으로 재노출. */
export { flushCard, flushAll };

function persistCardDebounced(
  card: Card,
  boardId: string | null,
  opts?: { doc?: boolean },
) {
  if (opts?.doc !== false) writeCardToDoc(card, boardId);
  schedulePersist(card.id, async () => {
    await persistCardDexie(card, boardId);
  });
}

/* ─────────── FEAT-collab-auth n3: Y.Doc 쓰기·반영 ───────────
 *
 * 원본은 보드 Y.Doc. Dexie `notes`는 검색·휴지통·서브캔버스 집계가 읽는
 * 파생 인덱스로 계속 미러링한다(마이그레이션 n2가 붙기 전까지 읽기 경로를
 * 바꾸면 기존 Dexie 시드 테스트가 전부 깨진다 — 갭은 결산에 기록).
 */

/** Card를 문서에 처음 넣을 때의 전체 Note. */
function initialNoteFromCard(card: Card, boardId: string | null): Note {
  const now = Date.now();
  return {
    id: card.id,
    boardId,
    kind: card.kind,
    x: card.x,
    y: card.y,
    width: card.width,
    height: memoHeight(card.kind, card.width, card.height),
    rotation: 0,
    content: encodeCardContent(card),
    // FEAT-text-tool: textbox 색·크기·폭 모드도 공유 필드다. 없으면 싣지 않는다.
    ...(card.color !== undefined ? { color: card.color } : {}),
    ...(card.textSize !== undefined ? { textSize: card.textSize } : {}),
    ...(card.autoWidth !== undefined ? { autoWidth: card.autoWidth } : {}),
    attachmentRef: card.attachmentRef,
    mediaType: card.mediaType,
    overlay: card.overlay,
    frameId: card.frameId,
    title: card.title,
    aiOptOut: !!card.aiOptOut,
    createdAt: now,
    updatedAt: now,
    lastVisitedAt: now,
  };
}

/** 활성 보드 문서가 있으면 그 안에서 fn을 실행한다(없으면 no-op). */
function withActiveDoc(
  boardId: string | null,
  fn: (doc: Y.Doc) => void,
): void {
  if (!isActiveBoard(boardId)) return;
  const doc = getActiveBoardDoc()?.doc;
  if (!doc) return;
  fn(doc);
}

/** n23 P2-11: 마지막으로 문서에 쓴 공유 필드 스냅샷. 로컬이 실제로 바꾼 필드만
 * 문서에 쓰기 위한 기준이다 — 원격이 바꾼 필드를 낡은 로컬 값으로 덮지 않는다.
 * n23 재심사 2R-2: 문서 쓰기 단일 출구가 갱신하고 삭제 경로가 버린다. */

/** 문서 하나에 카드 공유 필드를 쓴다(없으면 생성). 활성/비활성 보드 공통 경로. */
function writeCardToDocHandle(doc: Y.Doc, card: Card, boardId: string | null): void {
  const full = initialNoteFromCard(card, boardId);
  const shared = toSharedNote(full);
  if (notesMap(doc).get(card.id) === undefined) {
    putNoteDoc(doc, full);
    setSharedSnapshot(card.id, shared);
    return;
  }
  const prev = getSharedSnapshot(card.id);
  if (prev === undefined) {
    // 스냅샷이 없으면(재로드 뒤 첫 갱신) 전체를 갱신한다 — 생성 시각은 보존.
    const fields: Partial<SharedNote> = { ...shared };
    delete fields.createdAt;
    updateNoteFields(doc, card.id, fields);
    setSharedSnapshot(card.id, shared);
    return;
  }
  // n23 P2-11: 스냅샷과 달라진 필드만 쓴다. updateNoteFields가 이미 문서와 같은
  // 값은 건너뛰므로, 원격이 바꾼 width 등을 로컬 낡은 값으로 덮지 않는다.
  const diff: Partial<SharedNote> = {};
  const prevRec = prev as Record<string, unknown>;
  for (const [field, value] of Object.entries(shared)) {
    if (field === "createdAt") continue;
    if (prevRec[field] !== value) (diff as Record<string, unknown>)[field] = value;
  }
  for (const field of Object.keys(prevRec)) {
    if (!(field in shared) && prevRec[field] !== undefined) {
      (diff as Record<string, unknown>)[field] = undefined;
    }
  }
  if (Object.keys(diff).length > 0) updateNoteFields(doc, card.id, diff);
  setSharedSnapshot(card.id, shared);
}

/** 보드 전환·로드 시 활성 문서에 원격 반영 observer를 건다. 이전 것을 해제한다. */
let unbindDocReflection: (() => void) | null = null;

/** 원격 연결선 반영의 Dexie 파생 쓰기 디바운스(6(d)). */
const CONNECTION_MIRROR_DEBOUNCE_MS = 300;

/**
 * n23 작업 1: 앱 읽기 경로 — 카드는 활성 보드 문서가 원본이다. 기기 로컬 필드
 * (lastVisitedAt)만 Dexie 미러에서 합친다. Dexie notes가 비어도 문서만으로 열린다.
 * 정렬은 createdAt 오름차순(loadCards와 같은 규약 — 겹친 판 판정이 순서에 의존).
 */
async function loadBoardCards(storageBid: string | null): Promise<Card[]> {
  const doc = getActiveBoardDoc()?.doc;
  if (!doc || !isActiveBoard(storageBid)) return [];
  const shared = readNotes(doc).sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  const storage = useStorage.getState();
  // n23 P2-12: 본문·좌표는 문서가 원본이라 기기 로컬 필드(lastVisitedAt)만 합친다.
  const locals = storage.initialized ? await storage.loadLastVisitedAt(storageBid) : {};
  return shared.map((n) => {
    const base = n as Note;
    const local = locals[n.id];
    return decodeNoteToCard(
      local === undefined ? base : { ...base, lastVisitedAt: local },
    );
  });
}

/**
 * n23 작업 6(f): 활성 보드 전환의 단일 진입점. activeKey(activeDoc)·원격 반영
 * observer·liveSync attach 세 배선을 함께 소유한다 — 보드 전환 지점은 이 함수만 부른다.
 */
async function activateBoard(storageBid: string | null) {
  const handle = await activateBoardDoc(storageBid);
  bindActiveDocReflection(handle.doc, storageBid);
  attachLiveDoc(handle.doc, docKeyForBoard(storageBid));
  return handle;
}

function bindActiveDocReflection(doc: Y.Doc, storageBoardId: string | null): void {
  unbindDocReflection?.();
  unbindDocReflection = null;

  const reflect = (events: Y.YEvent<Y.AbstractType<unknown>>[], transaction: Y.Transaction): void => {
    if (!isRemoteTransaction(transaction)) return;
    if (!isActiveBoard(storageBoardId)) return;
    const changed = new Set<string>();
    for (const ev of events) {
      if (ev.path.length >= 1) {
        changed.add(String(ev.path[0]));
      } else {
        for (const key of (ev as Y.YMapEvent<unknown>).keysChanged) {
          changed.add(key);
        }
      }
    }
    if (changed.size === 0) return;
    const state = useWorkspace.getState();
    const nextCards = [...state.cards];
    let dirty = false;
    for (const id of changed) {
      const shared = readNote(doc, id);
      const idx = nextCards.findIndex((c) => c.id === id);
      if (!shared) {
        if (idx !== -1) {
          nextCards.splice(idx, 1);
          dirty = true;
          // 원격·다른 탭 삭제는 휴지통으로만 옮긴다. removeNote는 purge까지 해서
          // 삭제한 탭이 만든 휴지통 행을 지워 버린다(n3 리뷰 P0).
          void useStorage.getState().trashNote(id).then(notifyNoteChanges);
        }
        continue;
      }
      // 기기 로컬 필드(lastVisitedAt)는 문서에 없다 — 기존 카드 값으로 합친다.
      const lastVisitedAt =
        idx !== -1 ? (nextCards[idx].lastVisitedAt ?? Date.now()) : Date.now();
      const card = decodeNoteToCard({ ...shared, lastVisitedAt });
      if (idx !== -1) nextCards[idx] = card;
      else nextCards.push(card);
      dirty = true;
      // 6(d): 원격 반영의 Dexie 파생 쓰기는 디바운스로 합친다 — 키 입력 1자마다
      // 전행 get+put 하던 비용을 제거. 문서는 원격이 이미 원본이라 쓰지 않는다.
      // FEAT-memo-table-view: 표는 미러를 읽으므로 미러 쓰기가 끝난 뒤에 알린다.
      schedulePersist(card.id, async () => {
        await persistCardDexie(card, storageBoardId);
        notifyNoteChanges();
      });
    }
    if (dirty) useWorkspace.setState({ cards: nextCards });
  };

  notesMap(doc).observeDeep(reflect);

  const reflectMeta = (_e: Y.YMapEvent<unknown>, transaction: Y.Transaction): void => {
    if (!isRemoteTransaction(transaction)) return;
    if (!isActiveBoard(storageBoardId)) return;
    // 시스템 보드는 이제 boards 목록에 있지만, meta 반영으로 이름을 덮지 않는다.
    if (!storageBoardId || storageBoardId === SYSTEM_BOARD_ID) return;
    const board = readBoard(doc);
    void (async () => {
      const storage = useStorage.getState();
      if (!storage.initialized) return;
      await storage.saveBoard({ id: storageBoardId, name: board.name });
      const boards = await storage.loadBoards();
      useWorkspace.setState({ boards });
    })();
  };
  metaMap(doc).observe(reflectMeta);

  // 6(c): 변경된 연결선 id만 읽고 삭제도 반영한다. 6(d): Dexie 미러 쓰기는 디바운스.
  const pendingConnIds = new Set<string>();
  let connTimer: ReturnType<typeof setTimeout> | null = null;
  const flushConnections = () => {
    connTimer = null;
    const ids = [...pendingConnIds];
    pendingConnIds.clear();
    if (ids.length === 0) return;
    const storage = useStorage.getState();
    if (!storage.initialized) return;
    void (async () => {
      const db = getDB();
      // n23 P2-13: id마다 한 건씩 쓰지 않고 bulk로 합친다.
      const puts: Connection[] = [];
      const deletes: string[] = [];
      for (const id of ids) {
        const conn = readConnection(doc, id);
        // 원격에서 사라진 연결선은 미러에서도 지운다 — 남으면 새로고침 후 부활한다.
        if (conn) puts.push(conn);
        else deletes.push(id);
      }
      if (puts.length > 0) await db.connections.bulkPut(puts);
      if (deletes.length > 0) await db.connections.bulkDelete(deletes);
    })();
  };

  const reflectConnections = (events: Y.YEvent<Y.AbstractType<unknown>>[], transaction: Y.Transaction): void => {
    if (!isRemoteTransaction(transaction)) return;
    if (!isActiveBoard(storageBoardId)) return;
    const changed = new Set<string>();
    for (const ev of events) {
      if (ev.path.length >= 1) changed.add(String(ev.path[0]));
      else for (const key of (ev as Y.YMapEvent<unknown>).keysChanged) changed.add(key);
    }
    if (changed.size === 0) return;
    for (const id of changed) pendingConnIds.add(id);
    if (connTimer === null) connTimer = setTimeout(flushConnections, CONNECTION_MIRROR_DEBOUNCE_MS);
    // FEAT-connectors: 화면의 연결선도 바로 맞춘다. 양 끝이 현재 카드인 active 선만 그린다.
    const state = useWorkspace.getState();
    const cardIds = new Set(state.cards.map((c) => c.id));
    const next = state.connections.filter((c) => !changed.has(c.id));
    for (const id of changed) {
      const conn = readConnection(doc, id);
      if (
        conn &&
        conn.status === "active" &&
        cardIds.has(conn.sourceNoteId) &&
        cardIds.has(conn.targetNoteId)
      ) {
        next.push(conn);
      }
    }
    const selected = state.selectedConnectionId;
    useWorkspace.setState({
      connections: next,
      selectedConnectionId: selected && next.some((c) => c.id === selected) ? selected : null,
    });
  };
  connectionsMap(doc).observeDeep(reflectConnections);

  unbindDocReflection = () => {
    notesMap(doc).unobserveDeep(reflect);
    metaMap(doc).unobserve(reflectMeta);
    connectionsMap(doc).unobserveDeep(reflectConnections);
    if (connTimer !== null) {
      clearTimeout(connTimer);
      connTimer = null;
    }
    pendingConnIds.clear();
  };
}

/** 보드 메타를 그 보드 문서에 쓴다. Dexie boards에서 최신 값을 읽어 채운다. */
async function writeBoardToDoc(id: string): Promise<void> {
  const storage = useStorage.getState();
  if (!storage.initialized) return;
  const board = (await storage.loadBoards()).find((b) => b.id === id);
  if (!board) return;
  // n23: writeThrough 단일 경로 — 활성은 직접, 비활성은 열고 방송하고 TTL 후 닫는다.
  await writeToBoardDoc(id, (doc) => putBoardDoc(doc, board));
}

/**
 * 카드를 보드 사이에서 옮긴다 — 원본 문서에서 지우고 대상 문서에 만든다.
 *
 * 6(a): 대상 문서 내용을 Dexie 미러가 아니라 원본 Y.Doc에서 읽는다(미러 지연·실패에
 * 유실되지 않게). 대상 문서 변경은 그 문서 키로 탭 간 방송한다 — 대상 보드를 보고
 * 있는 다른 탭이 새로고침 없이 본다. 잠깐 연 비활성 문서는 쓰고 닫는다(6(h)).
 */
async function moveCardBetweenDocs(
  cardId: string,
  fromBoardId: string | null,
  toBoardId: string | null,
): Promise<void> {
  const fromHandle = getOrOpenBoardDoc(fromBoardId);
  // n23 재심사 2R-3: 소스 문서 로드가 실패하면 캐시에서 버리고 그대로 실패시킨다.
  // 남겨 두면 재시도가 rejected 핸들을 받아 영영 열지 못한다.
  try {
    await fromHandle.whenLoaded;
  } catch (err) {
    discardBoardDocByKey(docKeyForBoard(fromBoardId));
    throw err;
  }
  const shared = readNote(fromHandle.doc, cardId);
  const fromIsActive = isActiveBoard(fromBoardId);

  // n23 P1-8: 대상 문서를 먼저 열고 로드까지 성공해야 원본에서 지운다. 순서를
  // 뒤집으면 대상 열기가 실패했을 때 원본에서만 사라져 메모가 영구 유실된다.
  const toHandle = getOrOpenBoardDoc(toBoardId);
  try {
    await toHandle.whenLoaded;
  } catch (err) {
    discardBoardDocByKey(docKeyForBoard(toBoardId));
    throw err;
  }

  const toIsActive = isActiveBoard(toBoardId);
  // 원본 문서에 없으면(이전 안 된 옛 행) Dexie 미러로 폴백한다.
  const source = shared ?? ((await getDB().notes.get(cardId)) as Note | undefined);

  if (fromIsActive) {
    withActiveDoc(fromBoardId, (doc) => deleteNoteDoc(doc, cardId));
  } else {
    broadcastDocWrite(docKeyForBoard(fromBoardId), fromHandle.doc, () =>
      deleteNoteDoc(fromHandle.doc, cardId),
    );
  }
  forgetSharedSnapshot(cardId);

  if (source) {
    const moved: Note = {
      ...source,
      boardId: toBoardId,
      frameId: undefined, // 다른 캔버스로 나가면 판 소속은 풀린다.
      updatedAt: Date.now(),
      lastVisitedAt: Date.now(),
    };
    if (toIsActive) {
      withActiveDoc(toBoardId, (doc) => putNoteDoc(doc, moved));
    } else {
      broadcastDocWrite(docKeyForBoard(toBoardId), toHandle.doc, () =>
        putNoteDoc(toHandle.doc, moved),
      );
    }
    setSharedSnapshot(cardId, toSharedNote(moved));
  }

  if (!fromIsActive) closeBoardDoc(fromBoardId);
  if (!toIsActive) closeBoardDoc(toBoardId);
}

/**
 * FEAT-sticky-redesign 2단계 리뷰 P1: frameId를 바꾸는 다중 행 경로
 * (resolveMembership·deleteFrame의 멤버 해제)가 이 함수로 DB에 쓴다. 단일 카드를
 * 다른 캔버스로 보내는 moveCardToSubcanvas·moveCardToBoard는 보드 이동과 한 번에
 * 저장해야 해서 saveNote에 `frameId: undefined`를 직접 싣는다(아직 flush 안 된 새
 * 카드는 update가 no-op이라 이 함수로는 유실된다).
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
 * undo 만료·포기로 삭제가 확정된 보드들. 공유된 파일함이면 서버 행도 지운다
 * (spec/share-subboards.md "미룬 것" — 파일함을 지울 때 서버 행 정리).
 * 되살릴 수 있는 동안에는 부르지 않는다 — undo로 되살려도 서버 사본이 먼저 사라진다.
 */
function unshareFinalizedBoards(boards: Board[]): void {
  if (boards.length === 0) return;
  void import("./membership")
    .then((m) => m.unshareRemovedSubBoards(boards))
    .catch(() => {
      /* 오프라인 — 다음 syncMyBoards가 다시 시도한다 */
    });
}

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
    // FEAT-connectors: 함 카드에 닿은 선(현재 보드)은 고아로 남기지 않고 지운다.
    // 5초 undo는 서브 보드 안쪽 연결만 복원한다 — 함 카드 자체의 선은 복원 대상 아님.
    const incident = await db.connections
      .where("sourceNoteId")
      .equals(fc.id)
      .or("targetNoteId")
      .equals(fc.id)
      .toArray();
    if (incident.length > 0) {
      await db.connections.bulkDelete(incident.map((c) => c.id));
      // undo 스냅샷에도 넣어야 5초 undo 시 선이 영구 유실되지 않는다.
      connections.push(...incident);
    }
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
      unshareFinalizedBoards(cur.boards);
      set({ pendingSubcanvasUndo: null });
    }
  }, BOARD_UNDO_MS);
}

/**
 * n3 D8: URL이 보드 전환의 원본이다. 스토어 액션은 setCurrentBoard를 직접 부르지 않고
 * 이 sink로 "이 보드로 가라"만 요청한다. 라우터가 있는 브라우저에서는 WorkspaceShell이
 * `router.push('/b/'+id)`를 등록하고, 라우터가 없는 테스트 환경은 sink가 없어
 * setCurrentBoard로 폴백한다 — URL 없는 유닛 테스트에서도 전환 의미를 유지한다.
 */
type BoardNavigator = (boardId: string) => void;
let boardNavigator: BoardNavigator | null = null;

export function setBoardNavigator(fn: BoardNavigator | null): void {
  boardNavigator = fn;
}

/** 테스트 격리 — 등록된 라우터 sink를 지운다. */
export function __resetBoardNavigatorForTest(): void {
  boardNavigator = null;
}

/**
 * FEAT-connectors: 현재 보드 카드에 닿은 active 연결만 골라 온다. loadConnections는
 * 한쪽 끝만 닿아도 돌려주므로, 보드 밖 카드가 낀 연결은 화면에 못 그린다 —
 * 양 끝이 모두 현재 카드일 때만 남긴다.
 */
async function loadBoardConnections(cardIds: string[]): Promise<Connection[]> {
  const storage = useStorage.getState();
  if (!storage.initialized) return [];
  const ids = new Set(cardIds);
  if (ids.size === 0) return [];
  // 원본은 보드 문서다. 양 끝이 현재 보드면 source도 현재 보드라 활성 문서가 그 선을 가진다.
  const doc = getActiveBoardDoc()?.doc;
  const all = doc ? readConnections(doc) : await storage.loadConnections(cardIds);
  return all.filter(
    (c) =>
      c.status === "active" &&
      ids.has(c.sourceNoteId) &&
      ids.has(c.targetNoteId),
  );
}

export const useWorkspace = create<WorkspaceState>((set, get) => ({
  cards: [],
  selectedIds: [],
  editingId: null,
  expandedCardId: null,
  connections: [],
  selectedConnectionId: null,
  hoveredCardId: null,
  connectionDraft: null,
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
  migrationPending: false,
  bootstrapComplete: false,
  view: "canvas",
  tableReturnBoardId: null,
  canvasHasFitted: false,
  templatePickerOpen: false,
  pendingBoardUndo: null,
  deleteDialogBoardId: null,
  pendingRenameBoardId: null,
  dockDrag: null,
  subcanvasCounts: {},
  dropTargetFunnelId: null,
  dropTargetCrumbId: null,
  dropTargetTrash: false,
  dropTargetFrameId: null,
  wobbleFrameId: null,
  pendingSubcanvasUndo: null,
  draggingId: null,
  draggingMulti: false,
  // FEAT-memo-fulltext-search (W4): 검색 상태 초기값 — 비활성.
  memoSearchQuery: "",
  memoSearchMatchIds: [],
  // FEAT-trash: 휴지통 패널 닫힘·빈 상태.
  trashOpen: false,
  trashCount: 0,

  setDockDrag: (s) => set({ dockDrag: s }),
  setDragging: (id, multi = false) =>
    set({ draggingId: id, draggingMulti: id ? multi : false }),

  setTemplatePickerOpen: (open) => set({ templatePickerOpen: open }),
  openDeleteDialog: (boardId) => set({ deleteDialogBoardId: boardId }),
  requestRenameBoard: async (boardId) => {
    if (boardId === SYSTEM_BOARD_ID) return;
    await get().navigateToBoard(boardId);
    set({ pendingRenameBoardId: boardId });
  },
  clearRenameRequest: () => set({ pendingRenameBoardId: null }),

  loadFromStorage: async () => {
    initLiveSync(); // n3: 탭 간 Yjs 업데이트 동기화 구독 시작(멱등)
    const storage = useStorage.getState();
    if (!storage.initialized) await storage.init();
    const boards = await storage.loadBoards();

    // n23 P1-6: 재로드는 지금 보고 있는 보드를 재활성화한다. activateBoard(null)로
    // 되돌리면 currentBoardId와 activeKey가 어긋나 이후 편집이 시스템 문서로 샌다.
    const storageBid = get().currentBoardId;
    const activeDoc = await activateBoard(storageBid);

    if (
      storageBid === SYSTEM_BOARD_ID &&
      readNotes(activeDoc.doc).length === 0 &&
      !storage.settings?.installPromptShown &&
      // 작업 4: 이전이 아직 백그라운드면 시스템 문서가 비어 보일 수 있다 — 시드를
      // 끼워 넣으면 이전이 끝난 뒤 실제 메모와 섞인다. 이전 완료 뒤에만 시드한다.
      !get().migrationPending
    ) {
      // 첫 실행 — 디자인 시드를 문서·미러에 함께 영속하고 마킹.
      const seeds = SEED_CARDS.map((c) => ({
        ...c,
        height: memoHeight(c.kind, c.width, c.height),
      }));
      await Promise.all(seeds.map((card) => persistCard(card, SYSTEM_BOARD_ID)));
      await storage.updateSettings({ installPromptShown: true });
      set({ cards: seeds, boards, connections: [] });
      return;
    }

    // FEAT-text-tool: 빈 textbox는 불러올 때 지운다. 원본 문서와 미러 모두에서.
    const pruned = pruneEmptyTextboxes(await loadBoardCards(storageBid));
    if (pruned.removedIds.length > 0) {
      await storage.hardDeleteNotes(pruned.removedIds, storageBid);
    }
    const cards = pruned.cards;
    const connections = await loadBoardConnections(cards.map((c) => c.id));
    set({ cards, boards, connections, selectedConnectionId: null });
    void get().refreshSubcanvasCounts();
    void get().refreshTrashCount();
  },

  setCurrentBoard: async (id, opts) => {
    // n23 재심사 2R-1: 이전이 백그라운드면 보드를 바꾸지 않는다. 전환 대상과 이전
    // 완료 뒤 재로드 대상이 어긋나 편집이 유실된다. 오버레이는 이제 표시 전용이라
    // 단축키·함수 호출 모두 이 가드 하나로 막힌다.
    if (get().migrationPending) return;
    const current = get().currentBoardId;
    if (current === id) return;

    // n5 AC-8: 로컬에 없는 보드는 열지 않는다 — 빈 보드 행·문서를 만들지 않는다.
    // URL 판정(RouteBoardSync)이 먼저 막지만, 직접 호출 경로도 여기서 방어한다.
    if (id !== SYSTEM_BOARD_ID) {
      const storage0 = useStorage.getState();
      if (!storage0.initialized) await storage0.init();
      const known = (await storage0.loadBoards()).some((b) => b.id === id);
      if (!known) return;
    }

    // 1) 현재 보드의 viewport 기억
    const prevViewport = get().viewport;
    const viewportByBoard = { ...get().viewportByBoard, [current]: prevViewport };

    // 2) 페이드아웃 시작
    set({ boardTransitioning: true, viewportByBoard });

    // 3) 문서에서 카드 로드 (시스템 보드는 boardId=null). 문서가 원본, Dexie는 미러.
    const storage = useStorage.getState();
    if (!storage.initialized) await storage.init();
    const storageBid = id;
    const docHandle = await activateBoard(storageBid);
    // FEAT-text-tool: 빈 textbox는 불러올 때 지운다. 원본 문서와 미러 모두에서.
    const pruned = pruneEmptyTextboxes(await loadBoardCards(storageBid));
    if (pruned.removedIds.length > 0) {
      await storage.hardDeleteNotes(pruned.removedIds, storageBid);
    }
    const cards = pruned.cards;
    const connections = await loadBoardConnections(cards.map((c) => c.id));

    // 3-1) 보드 메타도 문서가 원본 — 목록의 이 보드 이름을 문서 값으로 맞춘다.
    if (storageBid !== null) {
      const meta = readBoard(docHandle.doc);
      if (typeof meta.name === "string") {
        set((s) => ({
          boards: s.boards.map((b) => (b.id === id ? { ...b, name: meta.name } : b)),
        }));
      }
    }

    // 4) state 교체 — viewport 복원 (없으면 reset). AC-5: 저장된 scale이 한계 밖일 수
    // 있으므로 복원 시점에 범위로 자른다.
    const saved = get().viewportByBoard[id] ?? { x: 0, y: 0, scale: 1 };
    const restored = {
      ...saved,
      scale: clamp(saved.scale, MIN_SCALE, MAX_SCALE),
    };
    const lastNonSystem = id === SYSTEM_BOARD_ID ? get().lastNonSystemBoardId : id;
    set({
      cards,
      connections,
      selectedIds: [],
      selectedConnectionId: null,
      editingId: null,
      expandedCardId: null,
      currentBoardId: id,
      lastNonSystemBoardId: lastNonSystem,
      viewport: restored,
    });
    // 표 행 열기·표 복귀처럼 URL을 거치지 않은 전환도 주소를 따라오게 한다.
    // URL에서 온 전환이면 경로가 이미 같아 navigator가 아무것도 안 한다.
    boardNavigator?.(id);

    // 5) lastOpenedAt 업데이트 — `/`(RootBoardRedirect)가 "마지막 연 보드"로 돌아가려면
    // 시스템 보드도 평범한 행인 지금 방문 시각을 남겨야 한다(n1 이후).
    // 표 맥락 점프는 opts로 끈다(FEAT-memo-table-view D1).
    if (opts?.touchLastOpened !== false) {
      await storage.saveBoard({ id, lastOpenedAt: Date.now() });
      const fresh = await storage.loadBoards();
      set({ boards: fresh });
    }

    // 6) 페이드인 — BOARD_FADE_MS 후 transitioning 해제
    setTimeout(() => set({ boardTransitioning: false }), BOARD_FADE_MS);

    // 7) FEAT-subcanvas: 새 보드의 함 카드들 카드 수 집계
    void get().refreshSubcanvasCounts();
  },

  navigateToBoard: async (id) => {
    // n23: 이전 중에는 이동하지 않는다(setCurrentBoard와 같은 가드). 이전이 끝나면
    // `/b/[boardId]` 동기화가 URL을 보고 다시 연다.
    if (get().migrationPending) return;
    // 같은 보드로 push하면 history를 쌓지 않는다(spec §6).
    if (get().currentBoardId === id) return;
    if (boardNavigator) {
      boardNavigator(id);
      return;
    }
    await get().setCurrentBoard(id);
  },

  createBoard: async (name = "") => {
    // n23 재심사 2R-1: 이전 중에는 새 보드를 만들지 않는다. 만들면 setCurrentBoard가
    // 막혀 전환되지 않는 고아 보드가 남는다.
    if (get().migrationPending) return get().currentBoardId;
    const storage = useStorage.getState();
    if (!storage.initialized) await storage.init();
    const id = newBoardId();
    await storage.saveBoard({ id, name, isSystem: false });
    await writeBoardToDoc(id);
    const boards = await storage.loadBoards();
    set({ boards });
    await get().navigateToBoard(id);
    return id;
  },

  createExampleBoard: async (name = "") => {
    // n23 재심사 2R-1: 이전 중 새 보드 생성 차단 — createBoard와 같은 가드.
    if (get().migrationPending) return get().currentBoardId;
    const storage = useStorage.getState();
    if (!storage.initialized) await storage.init();

    const boardId = newBoardId();
    await storage.saveBoard({ id: boardId, name, isSystem: false });
    await writeBoardToDoc(boardId);

    // 예제 메모 3장 — 시스템 보드 시드와 같은 내용을 새 id로 복제한다(AC-5).
    const handle = getOrOpenBoardDoc(boardId);
    await handle.whenLoaded;
    for (const seed of SEED_CARDS) {
      const card: Card = { ...seed, id: nextId() };
      await storage.saveNote({
        id: card.id,
        boardId,
        kind: card.kind,
        x: card.x,
        y: card.y,
        width: card.width,
        content: card.content,
        aiOptOut: false,
        rotation: 0,
      });
      writeCardToDocHandle(handle.doc, card, boardId);
    }
    closeBoardDoc(boardId);

    const boards = await storage.loadBoards();
    set({ boards });
    await get().navigateToBoard(boardId);
    return boardId;
  },

  createBoardFromTemplate: async (templateId, name, t, now) => {
    // n23 재심사 2R-1: 이전 중 새 보드 생성 차단(고아 보드·전환 불일치 방지).
    if (get().migrationPending) return get().currentBoardId;
    const template = getTemplate(templateId);
    if (!template) throw new Error(`Unknown templateId: ${templateId}`);
    const storage = useStorage.getState();
    if (!storage.initialized) await storage.init();

    const boardId = newBoardId();
    const trimmedName = name.trim() || t("templates.picker.defaultBoardName");
    await storage.saveBoard({
      id: boardId,
      name: trimmedName,
      isSystem: false,
      templateId: template.id,
    });

    await writeBoardToDoc(boardId);

    // 초기 카드 일괄 저장 — boardId 부여, AI 임베딩 큐는 skip(placeholder 텍스트).
    // n23: 카드→문서 Note 정의는 writeCardToDocHandle 하나를 재사용한다(정의 이원화 제거).
    const initialCards = template.buildInitialCards(t, now);
    const handle = getOrOpenBoardDoc(boardId);
    await handle.whenLoaded;
    for (const init of initialCards) {
      const card: Card = {
        id: nextId(),
        kind: init.kind,
        x: init.x,
        y: init.y,
        width: init.width,
        content: init.content,
      };
      await storage.saveNote({
        id: card.id,
        boardId,
        kind: init.kind,
        x: init.x,
        y: init.y,
        width: init.width,
        content: init.content,
        aiOptOut: false,
        rotation: 0,
      });
      writeCardToDocHandle(handle.doc, card, boardId);
    }
    // 새 보드는 아직 활성이 아니다 — 쓰기 끝나면 문서를 닫아 둔다(6(h)).
    closeBoardDoc(boardId);

    const boards = await storage.loadBoards();
    set({ boards });
    await get().navigateToBoard(boardId);
    return boardId;
  },

  renameBoard: async (id, name) => {
    if (id === SYSTEM_BOARD_ID) {
      throw new Error("시스템 보드는 이름을 변경할 수 없습니다.");
    }
    const storage = useStorage.getState();
    if (!storage.initialized) await storage.init();
    await storage.saveBoard({ id, name });
    await writeBoardToDoc(id);
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
      await get().navigateToBoard(SYSTEM_BOARD_ID);
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
      if (cur && cur.board.id === id) {
        unshareFinalizedBoards([cur.board]);
        set({ pendingBoardUndo: null });
      }
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
    // P1 AC-8: 복원된 보드는 "지운 보드" 목록에서 뺀다.
    await storage.forgetDeletedBoards([pending.board.id]);
    // 그 보드에 있던 메모 boardId 복원 (그 사이 사용자가 이동시킨 메모는 건드리지 않음 — id 기반)
    await db.notes
      .where("id")
      .anyOf(pending.affectedNoteIds)
      .modify((n) => {
        if (isSystemBoardNote(n)) {
          n.boardId = pending.board.id;
        }
      });
    const boards = await storage.loadBoards();
    set({ boards });
  },

  clearBoardUndo: () => {
    const pending = get().pendingBoardUndo;
    if (pending) unshareFinalizedBoards([pending.board]);
    set({ pendingBoardUndo: null });
  },

  toggleSystemBoard: async () => {
    const current = get().currentBoardId;
    if (current === SYSTEM_BOARD_ID) {
      const last = get().lastNonSystemBoardId;
      if (!last) return;
      await get().navigateToBoard(last);
    } else {
      await get().navigateToBoard(SYSTEM_BOARD_ID);
    }
  },

  setView: (view) => {
    if (view === "table") {
      // 표 진입 시점의 보드를 기억한다(D1). 이미 표면(=행 클릭으로 보드가 바뀐
      // 상태) 덮어쓰지 않는다.
      set((s) =>
        s.view === "table"
          ? { view }
          : { view, tableReturnBoardId: s.currentBoardId },
      );
      return;
    }
    set({ view });
    // 캔버스 복귀 — 표 행 클릭으로 보드가 바뀌었으면 진입 시점 보드로 되돌린다(D1).
    void get().restoreTableReturn();
  },

  restoreTableReturn: async () => {
    const ret = get().tableReturnBoardId;
    set({ tableReturnBoardId: null });
    if (ret && get().currentBoardId !== ret) {
      // 맥락 점프 복원이므로 lastOpenedAt은 갱신하지 않는다(D1).
      await get().setCurrentBoard(ret, { touchLastOpened: false });
    }
  },

  openCardOnCanvas: async (noteId) => {
    // 표에 없는(다른 보드) 메모도 열 수 있어야 한다 — DB에서 소속 보드를 읽는다.
    const note = await getDB().notes.get(noteId);
    if (!note) return;
    const boardId = note.boardId ?? SYSTEM_BOARD_ID;
    // 의도적 이동 — 표 복귀 대상이 아니다(D1).
    set({ view: "canvas", tableReturnBoardId: null });
    await get().setCurrentBoard(boardId);
    get().panToCard(noteId);
  },

  markCanvasFitted: () => set({ canvasHasFitted: true }),

  addCardAt: (toolId, x, y) => {
    const kind = kindForTool(toolId);
    const width = widthForKind(kind);
    const isTextbox = kind === "textbox";
    // FEAT-text-tool §5: textbox는 높이를 저장하지 않는다(항상 내용 높이). 다른 kind는
    // 종이 비율로 기본 높이를 채운다.
    const height = isTextbox
      ? undefined
      : clamp(width / aspectForKind(kind), CARD_MIN_HEIGHT, CARD_MAX_HEIGHT);
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
      // FEAT-text-tool §6: AI 파이프라인 대상 제외(주석이라서) + 자동 폭 + 기본 크기.
      ...(isTextbox
        ? { aiOptOut: true, autoWidth: true, textSize: TEXT_DEFAULT_SIZE }
        : {}),
    };
    // 메모판 안에 생성하면 소속(frameId)을 바로 잡는다 — 드래그로 넣은 것과 같은 판정(resolveMembership).
    if (kind !== "frame") {
      const owner = findOwningFrame(
        get().cards.filter((c) => c.kind === "frame"),
        cardCenter(card),
      );
      if (owner) card.frameId = owner.id;
    }
    const isCapture = isCaptureKind(kind);
    const isCaptureTool = (CAPTURE_TOOLS as readonly ToolId[]).includes(toolId);
    set((s) => ({
      cards: [...s.cards, card],
      selectedIds: [id],
      snapCardId: card.frameId ? id : s.snapCardId,
      editingId: isCapture ? id : null,
      lastToolId: isCaptureTool ? (toolId as CaptureToolId) : s.lastToolId,
    }));
    const boardId = get().currentBoardId;
    void persistCard(card, boardId);
    return id;
  },

  addPhotoAt: (x, y, opts) => {
    const naturalW = opts?.naturalW ?? 0;
    const naturalH = opts?.naturalH ?? 0;
    const ratio = naturalW > 0 && naturalH > 0 ? naturalH / naturalW : 1;
    const height = clamp(PHOTO_DEFAULT_WIDTH * ratio, CARD_MIN_HEIGHT, CARD_MAX_HEIGHT);
    const id = nextId();
    const card: Card = {
      id,
      kind: "photo",
      x,
      y,
      width: PHOTO_DEFAULT_WIDTH,
      height,
      content: "",
      attachmentRef: opts?.ref,
      mediaType: opts?.mediaType,
      aiOptOut: false,
      lastVisitedAt: Date.now(),
    };
    const owner = findOwningFrame(
      get().cards.filter((c) => c.kind === "frame"),
      cardCenter(card),
    );
    if (owner) card.frameId = owner.id;
    set((s) => ({
      cards: [...s.cards, card],
      selectedIds: [id],
      snapCardId: card.frameId ? id : s.snapCardId,
      // 사진은 인라인 편집에 들어가지 않는다 — 캡션은 우클릭으로 연다.
      editingId: null,
    }));
    void persistCard(card, get().currentBoardId);
    return id;
  },

  addCardAtViewportCenter: (toolId, viewportSize) => {
    const v = get().viewport;
    const { sx, sy } = viewportCenterScreenPoint(viewportSize);
    const kind = kindForTool(toolId);
    const cardW = widthForKind(kind);
    const cardH = clamp(cardW / aspectForKind(kind), CARD_MIN_HEIGHT, CARD_MAX_HEIGHT);
    const wx = (sx - v.x) / v.scale - cardW / 2;
    const wy = (sy - v.y) / v.scale - 20;
    const { x, y } = avoidCenterOverlap(wx, wy, cardW, cardH, get().cards, visibleWorldRect(v, sx, sy));
    return get().addCardAt(toolId, x, y);
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
    if (updated) persistCardDebounced(updated, get().currentBoardId, { doc: false });
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
    const boardId = get().currentBoardId;
    for (const card of moved) persistCardDebounced(card, boardId);
  },

  /**
   * n3 D4: 드래그가 끝났을 때 좌표를 문서에 한 번 쓴다. 드래그 중(moveCard/
   * moveSelectedBy)에는 문서를 건드리지 않는다 — Awareness가 그 역할(n7).
   * 여러 장이면 한 트랜잭션에 모아 Yjs 업데이트 1건으로 만든다.
   */
  commitMove: (ids) => {
    const boardId = get().currentBoardId;
    withActiveDoc(boardId, (doc) => {
      const requested =
        ids && ids.length > 0
          ? new Set(ids)
          : new Set(get().selectedIds);
      // 판이 옮겨졌으면 속한 멤버도 같이 문서에 쓴다(moveFrame과 동일 이동).
      const frameIds = new Set(
        get()
          .cards.filter((c) => requested.has(c.id) && c.kind === "frame")
          .map((c) => c.id),
      );
      const targets = get().cards.filter(
        (c) =>
          requested.has(c.id) ||
          (c.frameId !== undefined && frameIds.has(c.frameId)),
      );
      if (targets.length === 0) return;
      transactLocal(doc, () => {
        for (const card of targets) {
          updateNoteField(doc, card.id, "x", card.x);
          updateNoteField(doc, card.id, "y", card.y);
        }
      });
      // n23 재심사 2R-2: 좌표를 문서에 쓴 만큼 스냅샷도 갱신한다. 안 하면 다음
      // 카드 영속의 diff가 낡은 스냅샷 기준으로 원격 좌표를 되돌려 쓴다.
      for (const card of targets) {
        setSharedSnapshot(card.id, toSharedNote(initialNoteFromCard(card, boardId)));
      }
    });
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
        const clamped = clamp(next.height, CARD_MIN_HEIGHT, CARD_MAX_HEIGHT);
        // 메모(text)는 정사각형 아이덴티티 — 어떤 경로로 리사이즈돼도 height = width.
        const h = c.kind === "text" ? w : clamped;
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
    if (updated) {
      persistCardDebounced(updated, get().currentBoardId);
    }
  },

  /* ─────────── FEAT-sticky-redesign: 메모판(frame) ─────────── */

  addFrameAt: (x, y) => {
    const boardId = get().currentBoardId;
    const note = makeFrameNote(boardId, x, y, FRAME_DEFAULT_WIDTH, FRAME_DEFAULT_HEIGHT);
    const card = decodeNoteToCard(note);
    set((s) => ({
      cards: [...s.cards, card],
      selectedIds: [card.id],
      editingId: null,
    }));
    void persistCard(card, boardId);
    return card.id;
  },

  addFrameAtViewportCenter: (viewportSize) => {
    const { sx, sy } = viewportCenterScreenPoint(viewportSize);
    const v = get().viewport;
    const wx = (sx - v.x) / v.scale - FRAME_DEFAULT_WIDTH / 2;
    const wy = (sy - v.y) / v.scale - 20;
    const { x, y } = avoidCenterOverlap(wx, wy, FRAME_DEFAULT_WIDTH, FRAME_DEFAULT_HEIGHT, get().cards, visibleWorldRect(v, sx, sy));
    return get().addFrameAt(x, y);
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
    const boardId = get().currentBoardId;
    const updatedById = new Map(get().cards.map((c) => [c.id, c]));
    withActiveDoc(boardId, (doc) => {
      for (const u of updates) {
        const c = updatedById.get(u.id);
        if (c) writeCardToDocHandle(doc, c, boardId);
      }
    });
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
    //
    // 재심사 P1: 카드별 독립 쓰기면 탭 종료 시 판·멤버 좌표가 일부만 저장될 수 있다.
    // 모든 키가 같은 그룹 쓰기를 예약한다 — 먼저 fire한 쪽이 판+멤버 최신 상태를 한
    // 트랜잭션으로 쓰고, 나중 fire는 같은 값을 다시 쓸 뿐(멱등)이다.
    const boardId = get().currentBoardId;
    const groupIds = [frameId, ...memberIds];
    const persistGroup = async () => {
      const storage = useStorage.getState();
      if (!storage.initialized) return;
      const cards = get().cards.filter((c) => groupIds.includes(c.id));
      const db = getDB();
      await db
        .transaction("rw", db.notes, () =>
          // n23 P1-7: 드래그 중(D4)에는 좌표를 문서에 쓰지 않는다 — 좌표는 드롭 때
          // commitMove가 한 번 쓴다. 여기서는 Dexie 미러만 갱신한다.
          Promise.all(cards.map((card) => persistCard(card, boardId, { doc: false }))),
        )
        .catch((err) => console.warn("[moss] 메모판 이동 저장 실패", err));
    };
    for (const id of groupIds) schedulePersist(id, persistGroup);
    // n3 D4: 좌표는 드롭 시점(commitMove)에만 문서에 쓴다 — 드래그 중 쓰기 없음.
  },

  resizeFrame: (id, next) => {
    if (!Number.isFinite(next.width) || !Number.isFinite(next.height)) return;
    if (next.x !== undefined && !Number.isFinite(next.x)) return;
    if (next.y !== undefined && !Number.isFinite(next.y)) return;
    let updated: Card | undefined;
    set((s) => ({
      cards: s.cards.map((c) => {
        if (c.id !== id || c.kind !== "frame") return c;
        // FEAT-frame-skins: 폭 한계는 스킨이 정한다(AC-9·AC-10). 자유 판 상한은
        // "지금 폭까지" — 세로 칸(1920)을 자유로 바꿔도 튀지 않고 더 넓히지 못한다.
        const w = clampFrameWidth(readFrameContent(c.content), next.baseWidth ?? c.width, next.width);
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
    if (updated) {
      persistCardDebounced(updated, get().currentBoardId);
    }
  },

  renameFrame: (id, name) => {
    // AC-11: renameFrame이 내용을 통째로 덮어쓰면 스킨·칸이 사라진다 — 원래 설정을
    // 읽어 이름만 갈아 끼운다. "새 메모판" 기본값·trim·40자 규약은 frameContent.ts 단일 소스.
    let updated: Card | undefined;
    set((s) => ({
      cards: s.cards.map((c) => {
        if (c.id !== id || c.kind !== "frame") return c;
        const cfg = readFrameContent(c.content);
        updated = { ...c, content: encodeFrameContent({ ...cfg, name }) };
        return updated;
      }),
    }));
    if (updated) persistCardDebounced(updated, get().currentBoardId);
  },

  setFrameSkin: (id, skin) => {
    let updated: Card | undefined;
    set((s) => ({
      cards: s.cards.map((c) => {
        if (c.id !== id || c.kind !== "frame") return c;
        const cfg = readFrameContent(c.content);
        // 칸 목록이 있으면 스킨과 무관하게 보관한다. 세로 칸으로 처음 바뀔 때만 기본 3칸.
        const columns =
          cfg.columns !== undefined
            ? normalizeFrameColumns(cfg.columns)
            : skin === "columns"
              ? defaultFrameColumns()
              : undefined;
        const nextCfg: FrameContentJson = { ...cfg, skin };
        if (columns !== undefined) nextCfg.columns = columns;
        // AC-4: 폭이 칸 수 × 240보다 좁으면 그만큼 오른쪽으로 넓힌다. 왼쪽 위 모서리는 그대로.
        // 자유로 바꿀 때는 지금 폭이 상한이 되므로 폭이 그대로다(AC-10).
        const width = clampFrameWidth(nextCfg, c.width, c.width);
        updated = { ...c, width, content: encodeFrameContent(nextCfg) };
        return updated;
      }),
    }));
    if (!updated) return;
    persistCardDebounced(updated, get().currentBoardId);
    if (skin === "columns") {
      // AC-4: 넓힌 뒤 소속 판을 다시 판정한다. 결과는 손으로 같은 크기로 늘렸을 때와 같다.
      get().resolveMembership(
        get()
          .cards.filter((c) => c.kind !== "frame")
          .map((c) => c.id),
      );
    }
  },

  addFrameColumn: (id) => {
    let updated: Card | undefined;
    let widened = false;
    set((s) => ({
      cards: s.cards.map((c) => {
        if (c.id !== id || c.kind !== "frame") return c;
        const cfg = readFrameContent(c.content);
        const cols = normalizeFrameColumns(cfg.columns);
        if (cols.length >= FRAME_COLUMN_COUNT_MAX) return c;
        const next = [...cols, { id: newFrameColumnId(), name: "" }];
        // AC-6: 폭이 (N+1) × 240보다 좁으면 그만큼 오른쪽으로 넓어진다. 메모는 움직이지 않는다.
        const width = clampFrameWidth({ ...cfg, columns: next }, c.width, c.width);
        widened = widened || width > c.width;
        updated = { ...c, width, content: encodeFrameContent({ ...cfg, columns: next }) };
        return updated;
      }),
    }));
    if (!updated) return;
    persistCardDebounced(updated, get().currentBoardId);
    if (widened) {
      get().resolveMembership(
        get()
          .cards.filter((c) => c.kind !== "frame")
          .map((c) => c.id),
      );
    }
  },

  renameFrameColumn: (id, columnId, name) => {
    let updated: Card | undefined;
    set((s) => ({
      cards: s.cards.map((c) => {
        if (c.id !== id || c.kind !== "frame") return c;
        const cfg = readFrameContent(c.content);
        const cols = normalizeFrameColumns(cfg.columns);
        if (!cols.some((col) => col.id === columnId)) return c;
        const next = normalizeFrameColumns(
          cols.map((col) => (col.id === columnId ? { ...col, name } : col)),
        );
        updated = { ...c, content: encodeFrameContent({ ...cfg, columns: next }) };
        return updated;
      }),
    }));
    if (updated) persistCardDebounced(updated, get().currentBoardId);
  },

  removeFrameColumn: (id, columnId) => {
    let updated: Card | undefined;
    set((s) => ({
      cards: s.cards.map((c) => {
        if (c.id !== id || c.kind !== "frame") return c;
        const cfg = readFrameContent(c.content);
        const cols = normalizeFrameColumns(cfg.columns);
        if (cols.length <= FRAME_COLUMN_COUNT_MIN) return c;
        if (!cols.some((col) => col.id === columnId)) return c;
        // AC-8: 칸만 줄고 판 폭은 그대로다. 메모 좌표·소속도 건드리지 않는다.
        const next = cols.filter((col) => col.id !== columnId);
        updated = { ...c, content: encodeFrameContent({ ...cfg, columns: next }) };
        return updated;
      }),
    }));
    if (updated) {
      persistCardDebounced(updated, get().currentBoardId);
    }
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
    const boardId = get().currentBoardId;
    const afterDelete = new Map(get().cards.map((c) => [c.id, c]));
    withActiveDoc(boardId, (doc) => {
      for (const mid of memberIds) {
        const member = afterDelete.get(mid);
        if (member) writeCardToDocHandle(doc, member, boardId);
      }
      deleteNoteDoc(doc, id);
    });
    // n23 재심사 2R-2: 삭제한 판의 스냅샷을 버린다(누수 방지).
    forgetSharedSnapshot(id);
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
    const boardId = get().currentBoardId;
    // n3 급소: 본문은 Y.Doc에 곧바로 쓴다(persistCardDebounced가 문서 반영을 포함).
    if (updated) {
      persistCardDebounced(updated, boardId);
    }
  },

  setTitle: (id, title) => {
    const normalized = normalizeTitleTyping(title);
    let updated: Card | undefined;
    set((s) => ({
      cards: s.cards.map((c) => {
        if (c.id !== id) return c;
        updated = { ...c, title: normalized || undefined };
        return updated;
      }),
    }));
    if (updated) {
      persistCardDebounced(updated, get().currentBoardId);
    }
  },

  commitTitle: (id) => {
    const card = get().cards.find((c) => c.id === id);
    if (!card) return;
    const normalized = normalizeTitle(card.title ?? "");
    // 타이핑 값이 이미 확정형이면 대기 중인 디바운스 영속이 그대로 처리한다.
    if ((card.title ?? "") === normalized) return;
    let updated: Card | undefined;
    set((s) => ({
      cards: s.cards.map((c) => {
        if (c.id !== id) return c;
        updated = { ...c, title: normalized || undefined };
        return updated;
      }),
    }));
    if (updated) {
      // 대기 중인 타이핑 영속(잘리지 않은 값)을 버리고 확정 값을 즉시 내보낸다(§4).
      cancelPersist(id);
      void persistCard(updated, get().currentBoardId);
    }
  },

  setMemoColor: (ids, color) => {
    const want = color ?? undefined;
    const targets = new Set(ids);
    const changed: Card[] = [];
    set((s) => ({
      cards: s.cards.map((c) => {
        if (!targets.has(c.id) || c.kind !== "text" || c.color === want) return c;
        const next: Card = { ...c, color: want };
        if (want === undefined) delete next.color;
        changed.push(next);
        return next;
      }),
    }));
    // ponytail: 카드마다 디바운스 영속 — 여러 장이어도 상태 갱신은 한 번이다. 수백 장이 느리면 일괄 쓰기로.
    const boardId = get().currentBoardId;
    for (const card of changed) persistCardDebounced(card, boardId);
  },

  /* ─────────── FEAT-text-tool: 평문 텍스트(textbox) ─────────── */

  setTextStyle: (id, style) => {
    let updated: Card | undefined;
    set((s) => ({
      cards: s.cards.map((c) => {
        if (c.id !== id || c.kind !== "textbox") return c;
        updated = {
          ...c,
          textSize: style.textSize ?? c.textSize,
          color: style.color ?? c.color,
        };
        return updated;
      }),
    }));
    // AC-5: 새로고침 후에도 유지 — 디바운스가 아니라 즉시 영속(툴바 클릭은 드묾).
    if (updated) {
      cancelPersist(id);
      void persistCard(updated, get().currentBoardId);
    }
  },

  setTextWidth: (id, width) => {
    let updated: Card | undefined;
    set((s) => ({
      cards: s.cards.map((c) => {
        if (c.id !== id || c.kind !== "textbox") return c;
        if (width === "auto") {
          updated = { ...c, autoWidth: true };
        } else {
          updated = {
            ...c,
            autoWidth: false,
            width: clamp(width, CARD_MIN_WIDTH, CARD_MAX_WIDTH),
          };
        }
        return updated;
      }),
    }));
    if (updated) persistCardDebounced(updated, get().currentBoardId);
  },

  setTextMeasuredWidth: (id, width) => {
    if (!Number.isFinite(width)) return;
    // 고정 폭 하한(CARD_MIN_WIDTH)과 달리 자동 폭은 작은 라벨을 허용한다(§0).
    const next = Math.max(TEXTBOX_MIN_AUTO_WIDTH, Math.round(width));
    let updated: Card | undefined;
    set((s) => ({
      cards: s.cards.map((c) => {
        // autoWidth가 아닌 카드는 측정값을 무시한다(고정 폭 우선).
        if (c.id !== id || c.kind !== "textbox" || c.autoWidth === false) return c;
        if (c.width === next) return c;
        updated = { ...c, width: next };
        return updated;
      }),
    }));
    if (updated) persistCardDebounced(updated, get().currentBoardId);
  },

  setFaceHeight: (id, height) => {
    if (!Number.isFinite(height) || height <= 0) return;
    const h = Math.round(height);
    // 잰 높이를 저장한다 — 새로고침 뒤 화면 밖 카드도 연결선·판 판정이 실제 높이를 쓴다.
    const prev = get().cards.find((c) => c.id === id);
    if (!prev || prev.height === h) return;
    const updated = { ...prev, height: h };
    set((s) => ({ cards: s.cards.map((c) => (c.id === id ? updated : c)) }));
    persistCardDebounced(updated, get().currentBoardId);
    // 만들 땐 정사각 높이로 판 소속을 쟀다 — 실제 높이로 중심이 바뀌었으니 판 밖이던 카드만 다시 잰다.
    if (!get().cards.find((c) => c.id === id)?.frameId) {
      get().resolveMembership([id]);
      if (get().cards.find((c) => c.id === id)?.frameId) set({ snapCardId: id });
    }
  },

  snapCardId: null,
  clearSnapCard: () => set({ snapCardId: null }),

  textPlacementArmed: false,
  armTextPlacement: () => {
    // 펜 모드와 상호배타 — 배치 모드 진입 시 펜 모드를 끈다.
    set({ textPlacementArmed: true, penMode: false, editingId: null });
  },
  disarmTextPlacement: () => set({ textPlacementArmed: false }),

  hardDeleteNote: (id) => {
    // FEAT-text-tool AC-6: 휴지통·되돌리기 우회 삭제. 빈 textbox 전용이라
    // 다른 kind가 이 경로로 들어오면 지우지 않는다(휴지통 경로를 써야 한다).
    const card = get().cards.find((c) => c.id === id);
    if (!card || card.kind !== "textbox") return;
    set((s) => ({
      cards: s.cards.filter((c) => c.id !== id),
      selectedIds: s.selectedIds.filter((x) => x !== id),
      editingId: s.editingId === id ? null : s.editingId,
      expandedCardId: s.expandedCardId === id ? null : s.expandedCardId,
    }));
    cancelPersist(id);
    forgetSharedSnapshot(id);
    const storage = useStorage.getState();
    if (!storage.initialized) return;
    // 원본 문서와 미러에서 연결선·임베딩까지 정리한다. 막 만든 상자는 미러에 없을
    // 수 있어 보드를 넘긴다.
    void storage
      .hardDeleteNotes([id], get().currentBoardId)
      .catch(() => undefined);
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
    if (updated) {
      void persistCard(updated, get().currentBoardId);
    }
  },

  selectOne: (id) => set({ selectedIds: id ? [id] : [], selectedConnectionId: null }),
  toggleSelect: (id) =>
    set((s) => {
      const has = s.selectedIds.includes(id);
      return {
        selectedConnectionId: null,
        selectedIds: has
          ? s.selectedIds.filter((x) => x !== id)
          : [...s.selectedIds, id],
      };
    }),
  selectMany: (ids, additive = false) =>
    set((s) => {
      if (!additive) return { selectedIds: ids, selectedConnectionId: null };
      const seen = new Set(s.selectedIds);
      const merged = [...s.selectedIds];
      for (const id of ids) {
        if (!seen.has(id)) {
          seen.add(id);
          merged.push(id);
        }
      }
      return { selectedIds: merged, selectedConnectionId: null };
    }),
  clearSelection: () => set({ selectedIds: [], selectedConnectionId: null }),
  setEditing: (id) => set({ editingId: id }),
  // FEAT-memo-expand: 모달 진입 시 inline 편집을 닫아 같은 카드 이중 에디터를 막는다.
  setExpandedCard: (id) => {
    set(id ? { expandedCardId: id, editingId: null } : { expandedCardId: null });
    // 표에서 행을 열어 보드가 바뀌었던 경우, 메모창을 닫으면 진입 시점 보드로
    // 복원한다(D1). 캔버스 뷰에서는 no-op(tableReturnBoardId 없음).
    if (!id && get().view === "table") void get().restoreTableReturn();
  },

  /* ─────────── FEAT-connectors: 카드 연결선 ─────────── */
  connectCards: (sourceId, sourceSide, targetId, targetSide) => {
    if (sourceId === targetId) return null;
    const existing = get().connections.find(
      (c) =>
        c.sourceNoteId === sourceId &&
        c.targetNoteId === targetId &&
        c.status === "active",
    );
    if (existing) {
      // AC-8: 같은 방향 중복은 새 행 없이 기존 선을 선택.
      set({ selectedConnectionId: existing.id, selectedIds: [] });
      return existing.id;
    }
    const connection: Connection = {
      id: `conn-${Date.now().toString(36)}-${connCounter++}`,
      sourceNoteId: sourceId,
      targetNoteId: targetId,
      source: "manual",
      status: "active",
      sourceSide,
      targetSide,
      createdAt: Date.now(),
    };
    set((s) => ({
      connections: [...s.connections, connection],
      selectedConnectionId: connection.id,
      selectedIds: [],
    }));
    const storage = useStorage.getState();
    if (storage.initialized) void storage.saveConnection(connection);
    return connection.id;
  },

  connectToNewMemo: (sourceId, sourceSide, x, y) => {
    const source = get().cards.find((c) => c.id === sourceId);
    const w = widthForKind("text");
    // 놓은 지점이 새 메모 중심이 되도록 좌상단을 되돌린다.
    const id = get().addCardAt("text", x - w / 2, y - w / 2);
    const card = get().cards.find((c) => c.id === id);
    const targetSide: ConnectionSide =
      source && card
        ? nearestSide(card, anchorPoint(source, sourceSide))
        : "top";
    get().connectCards(sourceId, sourceSide, id, targetSide);
    // connectCards가 선택을 비우므로 새 메모 선택·편집 진입(addCardAt이 켠 editingId)을
    // 유지하도록 카드 선택을 되돌린다(AC-3: 제목 입력 포커스).
    set({ selectedIds: [id], selectedConnectionId: null });
    return id;
  },

  removeConnection: (id) => {
    set((s) => ({
      connections: s.connections.filter((c) => c.id !== id),
      selectedConnectionId:
        s.selectedConnectionId === id ? null : s.selectedConnectionId,
    }));
    const storage = useStorage.getState();
    if (storage.initialized) void storage.removeConnection(id);
  },

  setConnectionLabel: (id, label) => {
    const trimmed = label.trim();
    let updated: Connection | undefined;
    set((s) => ({
      connections: s.connections.map((c) => {
        if (c.id !== id) return c;
        const next = { ...c };
        if (trimmed) next.label = trimmed;
        else delete next.label;
        updated = next;
        return next;
      }),
    }));
    if (!updated) return;
    const storage = useStorage.getState();
    if (storage.initialized)
      // label 없는 객체를 patch로 보내면 mergeConnection이 옛 값을 남긴다 —
      // undefined를 명시해 지운다(AC-6: 빈 문자열이면 label 제거).
      void storage.saveConnection(trimmed ? updated : { ...updated, label: undefined });
  },

  selectConnection: (id) => set({ selectedConnectionId: id, selectedIds: [] }),

  setHoveredCard: (id) => {
    if (id === get().hoveredCardId) return;
    set({ hoveredCardId: id });
  },
  setConnectionDraft: (draft) => set({ connectionDraft: draft }),

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
    if (updated) {
      persistCardDebounced(updated, get().currentBoardId);
    }
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
    if (updated) {
      persistCardDebounced(updated, get().currentBoardId);
    }
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
    if (updated) {
      persistCardDebounced(updated, get().currentBoardId);
    }
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
    if (updated) {
      persistCardDebounced(updated, get().currentBoardId);
    }
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
      // AC-7: 카드를 지우면 닿은 선도 화면에서 사라진다(DB는 trashConnections로 이동).
      connections: s.connections.filter(
        (c) => c.sourceNoteId !== id && c.targetNoteId !== id,
      ),
      selectedConnectionId: s.connections.some(
        (c) =>
          c.id === s.selectedConnectionId &&
          (c.sourceNoteId === id || c.targetNoteId === id),
      )
        ? null
        : s.selectedConnectionId,
    }));
    cancelPersist(id);
    // n3: 카드를 문서에서도 지운다(휴지통 스냅샷은 Dexie 미러에서 읽는다).
    withActiveDoc(boardAtDeletion, (doc) => deleteNoteDoc(doc, id));
    // n23 재심사 2R-2: 삭제한 메모의 스냅샷을 버린다(다른 id 재사용 시 누수 방지).
    forgetSharedSnapshot(id);
    const storage = useStorage.getState();
    if (!storage.initialized) return;
    if (funnel) {
      void cascadeDeleteFunnels([funnel], boardAtDeletion, set, get);
    } else {
      // FEAT-trash: 메모는 영구 삭제 대신 휴지통으로.
      void storage.trashNote(id).then(() => get().refreshTrashCount());
    }
  },

  removeSelected: (ids = get().selectedIds) => {
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
      selectedIds: s.selectedIds.filter((x) => !ids.includes(x)),
      editingId: s.editingId && idSet.has(s.editingId) ? null : s.editingId,
      expandedCardId:
        s.expandedCardId && idSet.has(s.expandedCardId)
          ? null
          : s.expandedCardId,
      // AC-7: 지운 카드에 닿은 선도 화면에서 사라진다.
      connections: s.connections.filter(
        (c) => !idSet.has(c.sourceNoteId) && !idSet.has(c.targetNoteId),
      ),
      selectedConnectionId: s.connections.some(
        (c) =>
          c.id === s.selectedConnectionId &&
          (idSet.has(c.sourceNoteId) || idSet.has(c.targetNoteId)),
      )
        ? null
        : s.selectedConnectionId,
    }));
    for (const id of remainingIds) cancelPersist(id);
    // n23 재심사 2R-2: 삭제한 메모의 스냅샷을 버린다(누수 방지).
    for (const id of remainingIds) forgetSharedSnapshot(id);
    // n3: 문서에서도 지운다(휴지통 스냅샷은 Dexie 미러에서).
    withActiveDoc(boardAtDeletion, (doc) =>
      transactLocal(doc, () => {
        for (const id of remainingIds) deleteNoteDoc(doc, id);
      }),
    );
    const storage = useStorage.getState();
    if (!storage.initialized) return;
    // 함이 아닌 일반 메모는 휴지통으로(AC-2). frameIds는 위에서 deleteFrame이 이미
    // 처리했으므로 여기서 다시 지우지 않는다.
    const generalIds = remainingIds.filter((id) => !funnelIdSet.has(id));
    void storage.trashNotes(generalIds).then(() =>
      get().refreshTrashCount(),
    );
    // 함 카드는 cascade + 5초 undo.
    if (funnelCards.length > 0) {
      void cascadeDeleteFunnels(funnelCards, boardAtDeletion, set, get);
    }
  },

  setTrashOpen: (open) => set({ trashOpen: open }),

  refreshTrashCount: async () => {
    const storage = useStorage.getState();
    if (!storage.initialized) return;
    try {
      set({ trashCount: await getDB().trash.count() });
    } catch {
      /* DB가 닫히는 중(테스트 teardown·새로고침 경계) — 배지는 다음 기회에 갱신. */
    }
  },

  restoreFromTrash: async (id) => {
    const storage = useStorage.getState();
    if (!storage.initialized) await storage.init();
    const v = get().viewport;
    const { sx, sy } = viewportCenterScreenPoint();
    // 화면 가운데 정렬 — 카드 폭 절반을 빼고 상단 여백 20px(중앙 생성과 같은 규약).
    const entry = await getDB().trash.get(id);
    const w = entry?.note.width ?? 0;
    const boardId = get().currentBoardId;
    const note = await storage.restoreNote(id, {
      boardId,
      x: (sx - v.x) / v.scale - w / 2,
      y: (sy - v.y) / v.scale - 20,
    });
    if (note.boardId === boardId) {
      set((s) => ({ cards: [...s.cards, decodeNoteToCard(note)] }));
      // n3: 복구한 메모를 문서에도 되돌린다.
      withActiveDoc(boardId, (doc) => putNoteDoc(doc, note));
      // n23 재심사 2R-2: 복구도 문서 쓰기 — 스냅샷을 맞춘다.
      setSharedSnapshot(note.id, toSharedNote(note));
    }
    // AC-7: 복원으로 양 끝이 다시 살아난 선(trashConnections → connections)을 화면에 반영.
    set({ connections: await loadBoardConnections(get().cards.map((c) => c.id)) });
    void get().refreshTrashCount();
  },

  commitAndAddNext: (currentCardId) => {
    const current = get().cards.find((c) => c.id === currentCardId);
    if (!current) {
      // 카드가 사라졌으면 편집 상태만 정리.
      if (get().editingId === currentCardId) set({ editingId: null });
      return null;
    }
    // 캡처 카드가 아니면 next-card 흐름 자체가 의미 없음 — 편집만 종료.
    // FEAT-text-tool: textbox도 양산 의미가 없어 편집만 종료한다.
    if (!isCaptureKind(current.kind) || current.kind === "textbox") {
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
    // n23 재심사 2R-1: 이전 중 새 보드로 카드를 옮기지 않는다 — 전환이 막혀
    // 카드만 사라진 것처럼 보인다.
    if (get().migrationPending) return get().currentBoardId;
    // 1) 새 보드 생성 (자동 전환 발생 — 카드 목록이 새 보드 기준으로 리로드됨)
    //    그 직전에 카드의 boardId를 새 보드로 옮겨두어야 한다.
    const storage = useStorage.getState();
    if (!storage.initialized) await storage.init();

    const id = newBoardId();
    await storage.saveBoard({ id, name: boardName, isSystem: false });
    await writeBoardToDoc(id);

    // 2) 카드의 boardId 변경 — 본문/위치는 그대로.
    const card = get().cards.find((c) => c.id === cardId);
    if (card) {
      await storage.saveNote({ id: card.id, boardId: id });
      await moveCardBetweenDocs(
        card.id,
        get().currentBoardId,
        id,
      );
    }

    // 3) 보드 목록 갱신 + 새 보드로 전환
    const boards = await storage.loadBoards();
    set({ boards });
    await get().navigateToBoard(id);
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
    if (updated) {
      persistCard(updated, get().currentBoardId);
    }
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
  setDropTargetTrash: (v) => set({ dropTargetTrash: v }),
  setDropTargetFrame: (id) => set({ dropTargetFrameId: id }),
  setWobbleFrame: (id) => set({ wobbleFrameId: id }),

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
    const childBoardId = newBoardId();
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
      await persistCard(card, parentBoardId);
      await writeBoardToDoc(childBoardId);
      const boards = await storage.loadBoards();
      set({ boards });
      // 공유 보드 안 파일함은 같은 멤버에게 열린다 — 서버에 등록한다.
      if (useShare.getState().byBoard[parentBoardId]?.status === "shared") {
        await (await import("./membership")).shareSubBoards();
      }
    })().catch((err) => {
      // 테스트 teardown·새로고침 경계에서 DB가 닫히면 저장이 실패할 수 있다.
      console.warn("[moss] 함 생성 저장 실패", err);
    });

    return id;
  },

  createSubcanvasAtViewportCenter: (viewportSize) => {
    const { sx, sy } = viewportCenterScreenPoint(viewportSize);
    const v = get().viewport;
    const boardW = widthForKind("board");
    const boardH = clamp(boardW / aspectForKind("board"), CARD_MIN_HEIGHT, CARD_MAX_HEIGHT);
    const wx = (sx - v.x) / v.scale - boardW / 2;
    const wy = (sy - v.y) / v.scale - 20;
    const { x, y } = avoidCenterOverlap(wx, wy, boardW, boardH, get().cards, visibleWorldRect(v, sx, sy));
    return get().createSubcanvas(x, y);
  },

  enterSubcanvas: async (cardId) => {
    const card = get().cards.find((c) => c.id === cardId);
    if (!card || card.kind !== "board" || !card.boardRef) return;
    await get().navigateToBoard(card.boardRef);
  },

  goToParent: async () => {
    const cur = get().currentBoardId;
    if (cur === SYSTEM_BOARD_ID) return;
    const board = get().boards.find((b) => b.id === cur);
    // 루트 사용자 보드(부모 없음)는 함을 통해 들어온 게 아니므로 no-op.
    if (!board || board.parentBoardId == null) return;
    await get().navigateToBoard(board.parentBoardId);
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
    await moveCardBetweenDocs(
      cardId,
      get().currentBoardId,
      targetBoardId,
    );

    set((s) => ({
      cards: s.cards.filter((c) => c.id !== cardId),
      selectedIds: s.selectedIds.filter((x) => x !== cardId),
      editingId: s.editingId === cardId ? null : s.editingId,
      dropTargetFunnelId: null,
      dropTargetTrash: false,
      subcanvasCounts: {
        ...s.subcanvasCounts,
        [targetBoardId]: (s.subcanvasCounts[targetBoardId] ?? 0) + 1,
      },
    }));

    // 함 카드를 옮기면 그 서브 보드의 부모도 새 보드로 따라간다(트리 일관성).
    if (card.kind === "board" && card.boardRef) {
      const movedRef = card.boardRef;
      await storage.saveBoard({
        id: movedRef,
        parentBoardId: targetBoardId,
      });
      const boards = await storage.loadBoards();
      set({ boards });
      // 새 부모가 공유 중이면 서버 parent_id를 따라 옮기고, 공유 밖이면 해제한다.
      void import("./membership")
        .then((m) => m.syncMovedBoard(movedRef, targetBoardId))
        .catch(() => {
          /* 다음 동기화가 다시 시도한다 */
        });
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
    // 보드 id가 곧 문서 키다 — 시스템 보드도 예외 없는 UUID id를 쓴다(n1).
    // FEAT-sticky-redesign §4: 다른 캔버스로 나가면 판 소속은 풀린다.
    await storage.saveNote({
      id: cardId,
      boardId: targetBoardId,
      frameId: undefined,
    });
    await moveCardBetweenDocs(cardId, currentBoardId, targetBoardId);

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
        dropTargetTrash: false,
        subcanvasCounts: counts,
      };
    });

    // 함 카드를 꺼내면 그 서브 보드의 부모도 대상 보드로 reparent(트리 일관성).
    // parentBoardId는 보드 row의 리터럴 id(시스템이면 "system" sentinel)를 그대로 쓴다.
    if (card.kind === "board" && card.boardRef) {
      const movedRef = card.boardRef;
      await storage.saveBoard({
        id: movedRef,
        parentBoardId: targetBoardId,
      });
      const boards = await storage.loadBoards();
      set({ boards });
      // 새 부모가 공유 중이면 서버 parent_id를 따라 옮기고, 공유 밖이면 해제한다.
      void import("./membership")
        .then((m) => m.syncMovedBoard(movedRef, targetBoardId))
        .catch(() => {
          /* 다음 동기화가 다시 시도한다 */
        });
    }
  },

  undoSubcanvasRemove: async () => {
    const pending = get().pendingSubcanvasUndo;
    if (!pending) return;
    set({ pendingSubcanvasUndo: null });
    const db = getDB();
    // blob은 아직 안 지웠으므로(만료 전) row만 되돌리면 미디어까지 복원된다.
    await db.boards.bulkPut(pending.boards);
    // P1 AC-8: 되살아난 보드들은 "지운 보드" 목록에서 뺀다.
    await useStorage
      .getState()
      .forgetDeletedBoards(pending.boards.map((b) => b.id));
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
    // DB에서 되돌린 선(서브 보드 안쪽 + 함 카드에 닿은 incident)을 스토어에 다시 싣는다.
    set({ connections: await loadBoardConnections(get().cards.map((c) => c.id)) });
    await get().refreshSubcanvasCounts();
  },

  clearSubcanvasUndo: () => {
    const pending = get().pendingSubcanvasUndo;
    if (!pending) return;
    // undo 포기 = 삭제 확정 → 보류했던 OPFS blob 영구 정리.
    void useStorage
      .getState()
      .purgeAttachments([...pending.funnelNotes, ...pending.notes]);
    unshareFinalizedBoards(pending.boards);
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
    // programmatic 이동도 "자리 잡음"으로 본다 — 재마운트 fit이 이 위치를 덮지 않게(P2-4).
    set({ canvasHasFitted: true });
    const v = get().viewport;
    // addCardAtViewportCenter와 동일한 화면 크기 폴백 규약(FEAT-sticky-redesign n8:
    // 사이드바가 걷혀 캔버스가 window 전체 폭이라 폭 차감 없음).
    const fallbackW = typeof window !== "undefined" ? window.innerWidth : 1100;
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
    const fallbackW = typeof window !== "undefined" ? window.innerWidth : 1100;
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
      canvasHasFitted: true,
      viewport: {
        x: w / 2 - cx * scale,
        y: h / 2 - cy * scale,
        scale,
      },
    });
  },
}));

/* 테스트·디버깅용 export — 프로덕션 코드는 직접 호출 금지. */
export const __internal = {
  decodeNoteToCard,
  encodeCardContent,
  kindForTool,
  widthForKind,
  isCaptureKind,
  isDescendantBoard,
  SUBCANVAS_MARKER,
  SEED_CARDS,
};

/** n3 테스트·재개 경계 — 열린 보드 문서를 모두 닫는다(멱등). */
export async function __resetBoardDocsForTest(): Promise<void> {
  unbindDocReflection?.();
  unbindDocReflection = null;
  clearSharedSnapshots();
  await destroyBoardDocs();
}
