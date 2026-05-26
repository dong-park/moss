import Dexie, { type Table } from "dexie";
import { migratedContent } from "../markdownMigration";

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
  | "code";

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
  aiOptOut: boolean;
  createdAt: number;
  updatedAt: number;
  lastVisitedAt: number;
}

export interface Board {
  id: string;
  name: string;
  isSystem: boolean;
  templateId?: string;
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
