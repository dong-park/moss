import Dexie, { type Table } from "dexie";
import { migratedContent } from "../markdownMigration";
import { blocksToMarkdown } from "../cardContent";
import { markOpfsPurgePending } from "./opfs";
import { encodeFrameContent } from "../frameContent";

/**
 * 카드 종류. spec FEAT-storage §5 정의.
 * - text: 일반 텍스트 카드 (기본). comment(작성자+시간 메타 포함)도 text로 보관.
 * - checklist: todo 입력칸이 있는 카드.
 * - handwriting/mindmap/highlight/code: 본문 텍스트
 * - image/audio/file: attachmentRef + 메타. preview UI는 image|file로 매핑.
 * - link: URL 본문 + OG 메타
 */
export type NoteKind =
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
  // FEAT-subcanvas: "함" 카드 — content에 {boardRef}를 담아 서브 보드(캔버스)를 가리킨다.
  | "board"
  // FEAT-sticky-redesign: 메모판 틀. content = JSON.stringify({name}). width/height 필수, rotation 0.
  | "frame";

export interface Note {
  id: string;
  boardId: string | null;
  kind: NoteKind;
  x: number;
  y: number;
  width: number;
  /** 사용자가 모서리 리사이즈로 지정한 카드 높이. 미정의면 콘텐츠 자동 높이. */
  height?: number;
  rotation: number;
  content: string;
  attachmentRef?: string;
  /** FEAT-capture: image/audio/file 카드의 첨부 MIME (예: "image/png", "audio/webm"). */
  mediaType?: string;
  color?: string;
  /**
   * FEAT-markdown-memo-pen: 펜 모드로 카드 위에 덧그린 손글씨 레이어.
   * JSON `{paths:[[{x,y}...]...]}` (좌표는 카드 content box 기준 상대좌표).
   * 비인덱스 optional — 없으면 그림 없음. Dexie stores() 변경 불필요.
   */
  overlay?: string;
  /**
   * FEAT-sticky-redesign: 메모판 소속. 같은 boardId의 kind="frame" 행 id.
   * frame 행 자신은 항상 undefined.
   */
  frameId?: string;
  aiOptOut: boolean;
  createdAt: number;
  updatedAt: number;
  lastVisitedAt: number;
}

/**
 * FEAT-sticky-redesign: 메모판(frame) 행 생성 헬퍼.
 * content 규약: JSON.stringify({name}). rotation 항상 0. 최소 240×160.
 */
export function makeFrameNote(
  boardId: string | null,
  x: number,
  y: number,
  width: number,
  height: number,
  name?: string,
): Note {
  const now = Date.now();
  return {
    id: `frame-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    boardId,
    kind: "frame",
    x,
    y,
    width: Math.max(240, width),
    height: Math.max(160, height),
    rotation: 0,
    content: encodeFrameContent(name),
    aiOptOut: false,
    createdAt: now,
    updatedAt: now,
    lastVisitedAt: now,
  };
}

export interface Board {
  id: string;
  name: string;
  isSystem: boolean;
  templateId?: string;
  /**
   * FEAT-subcanvas: 이 보드가 다른 보드 안의 "함"에 연결된 서브 캔버스이면
   * 부모 보드 id. 루트/시스템 보드는 null|undefined. parentBoardId 체인으로
   * 브레드크럼·사이클 검사를 수행한다.
   */
  parentBoardId?: string | null;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt: number;
}

export interface Connection {
  id: string;
  sourceNoteId: string;
  targetNoteId: string;
  source: "manual" | "ai-suggested";
  status: "active" | "rejected" | "pending";
  label?: string;
  createdAt: number;
}

export interface EmbeddingCacheEntry {
  noteId: string;
  contentHash: string;
  vector: Float32Array;
  updatedAt: number;
}

export interface Settings {
  id: "singleton";
  aiOptOutGlobal: boolean;
  persistGranted: boolean | null;
  storageQuotaShown: { at80: boolean; at95: boolean };
  uiLocale: "ko";
  installPromptShown: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  id: "singleton",
  aiOptOutGlobal: false,
  persistGranted: null,
  storageQuotaShown: { at80: false, at95: false },
  uiLocale: "ko",
  installPromptShown: false,
};

export class MossDB extends Dexie {
  notes!: Table<Note, string>;
  boards!: Table<Board, string>;
  connections!: Table<Connection, string>;
  embeddings!: Table<EmbeddingCacheEntry, string>;
  settings!: Table<Settings, "singleton">;

  constructor(name = "moss") {
    super(name);
    const stores = {
      notes: "id, boardId, kind, createdAt, lastVisitedAt, aiOptOut",
      boards: "id, isSystem, lastOpenedAt",
      connections: "id, sourceNoteId, targetNoteId, status",
      embeddings: "noteId, updatedAt",
      settings: "id",
    };
    this.version(1).stores(stores);
    // FEAT-markdown-memo-pen: code/checklist/highlight 카드를 text(마크다운)로 전환.
    // 인덱스 스키마는 동일 — overlay는 비인덱스라 stores() 변경 없음.
    this.version(2)
      .stores(stores)
      .upgrade(async (tx) => {
        await tx
          .table<Note, string>("notes")
          .toCollection()
          .modify((note) => {
            const md = migratedContent(note.kind, note.content);
            if (md !== null) {
              note.kind = "text";
              note.content = md;
            }
          });
      });
    // v3: CardBlock[] JSON content를 markdown 문자열로 통일 — 카드와 모달이
    // 같은 Milkdown 렌더러로 렌더해 펜 overlay 좌표 정렬 회복(heading/list 등).
    // text 카드만 영향. JSON 배열이 아니면 no-op(원문 보존).
    this.version(3)
      .stores(stores)
      .upgrade(async (tx) => {
        await tx
          .table<Note, string>("notes")
          .where("kind")
          .equals("text")
          .modify((note) => {
            const md = blocksToMarkdown(note.content);
            if (md !== note.content) note.content = md;
          });
      });
    // v4 (FEAT-subcanvas): boards에 parentBoardId 인덱스 추가 — 서브 캔버스 트리 조회용.
    // 기존 보드는 parentBoardId가 undefined(=루트)로 남는다. 데이터 modify 불필요.
    const storesV4 = {
      ...stores,
      boards: "id, isSystem, lastOpenedAt, parentBoardId",
    };
    this.version(4).stores(storesV4);
    // v5 (FEAT-sticky-redesign n3): 이관 대신 새 DB로 시작 — 2단계 리뷰에서 이관
    // 경로의 XSS·깊은 마인드맵 무한실패·되돌리기 미연결이 드러나 사용자가 뒤집음
    // (2026-09-13). notes/boards/connections/embeddings를 전부 비운다. settings는
    // 사용자 설정(언어·AI 옵트아웃 등)이라 남긴다. stores 인덱스는 v4와 동일 —
    // storesV4를 그대로 써야 한다(되돌리면 parentBoardId 인덱스 소실로 SchemaError).
    // OPFS 첨부 비우기는 여기서 하지 않는다 — upgrade 트랜잭션 안에서 비동기 OPFS
    // 호출을 하면 안 되므로, 대기 플래그만 남기고 실제 삭제는 DB open 성공 후
    // storage.ts의 init()이 한 번 실행한다.
    this.version(5)
      .stores(storesV4)
      .upgrade(async (tx) => {
        await Promise.all([
          tx.table("notes").clear(),
          tx.table("boards").clear(),
          tx.table("connections").clear(),
          tx.table("embeddings").clear(),
        ]);
        markOpfsPurgePending();
      });
  }
}

let _db: MossDB | null = null;

export function getDB(): MossDB {
  if (!_db) _db = new MossDB();
  return _db;
}

/** 테스트에서 격리된 DB 인스턴스를 만들 때 사용. */
export function createDB(name: string): MossDB {
  return new MossDB(name);
}

/** 테스트 격리용 — 현재 싱글톤을 닫고 다음 getDB()가 새로 만들도록 한다. */
export async function resetDB(): Promise<void> {
  if (!_db) return;
  const db = _db;
  _db = null;
  db.close();
  try {
    await db.delete();
  } catch {
    /* noop */
  }
}
