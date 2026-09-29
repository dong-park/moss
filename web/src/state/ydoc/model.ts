import * as Y from "yjs";
import type { Board, Connection, Note } from "@/state/db/schema";
import { transactLocal } from "./origin";

/**
 * FEAT-collab-auth n1 — 보드 Yjs 문서 구조 (D3).
 *
 * 보드 1개 = Y.Doc 1개. 최상위 Y.Map 3개:
 * - `notes`: note.id → 메모 필드 Y.Map
 * - `connections`: connection.id → 연결선 필드 Y.Map
 * - `meta`: 보드 필드 (제목·색·손글씨 레이어 등)
 *
 * 필드 값은 schema.ts의 Dexie 행 타입과 1:1로 왕복한다. 다만 메모 본문은
 * Y.Text가 아니라 문자열 필드다 — 문자 단위 병합은 Milkdown 연동이 필요해
 * 이번 범위 밖(spec §14).
 */
export const NOTES_MAP = "notes";
export const CONNECTIONS_MAP = "connections";
export const META_MAP = "meta";
/**
 * FEAT-collab-auth n10 — 첨부 로컬 참조 → 서버 fileId 매핑.
 *
 * 블록 본문의 `opfs://<file>`은 업로더 기기의 로컬 이름이라 다른 참여자에겐
 * 존재하지 않는다. 업로드가 끝나면 이 맵에 `opfs:<file>` → fileId를 적어 동기화하고,
 * 받는 쪽은 맵에 fileId가 생기면 서버에서 내려받아 OPFS에 같은 이름으로 캐시한다.
 * 값이 아직 없으면 '올리는 중' 자리표시자다.
 */
export const FILES_MAP = "files";

/**
 * 기기 로컬 필드는 문서에 쓰지 않는다 — 보드를 여는 사람마다 값이 달라서
 * 공유하면 서로 덮어쓴다. Dexie에 그대로 남고 n2·n3가 합친다.
 */
export type SharedNote = Omit<Note, "lastVisitedAt">;
/** n9: `remote`(이 기기가 서버에서 받아온 공유 보드인지)도 기기 로컬 — 문서에 쓰지 않는다. */
export type SharedBoard = Omit<Board, "lastOpenedAt" | "remote">;

// Record<keyof T, true>라서 스키마에 필드가 늘면 여기서 컴파일 에러가 난다.
const NOTE_KEYS: Record<keyof SharedNote, true> = {
  id: true, boardId: true, kind: true, x: true, y: true, width: true, height: true,
  rotation: true, content: true, attachmentRef: true, mediaType: true, color: true,
  overlay: true, frameId: true, title: true, aiOptOut: true, createdAt: true, updatedAt: true,
};
const CONNECTION_KEYS: Record<keyof Connection, true> = {
  id: true, sourceNoteId: true, targetNoteId: true, source: true, status: true, label: true,
  createdAt: true,
};
const BOARD_KEYS: Record<keyof SharedBoard, true> = {
  id: true, name: true, isSystem: true, templateId: true, parentBoardId: true, createdAt: true,
  updatedAt: true,
};
const NOTE_FIELDS = Object.keys(NOTE_KEYS);
const CONNECTION_FIELDS = Object.keys(CONNECTION_KEYS);
const BOARD_FIELDS = Object.keys(BOARD_KEYS);

export function toSharedNote(note: Note): SharedNote {
  const shared: Partial<Note> = { ...note };
  delete shared.lastVisitedAt;
  return shared as SharedNote;
}

export function toSharedBoard(board: Board): SharedBoard {
  const shared: Partial<Board> = { ...board };
  delete shared.lastOpenedAt;
  delete shared.remote;
  return shared as SharedBoard;
}

/** undefined 필드는 키를 만들지 않는다 — 왕복 시 없는 키가 undefined로 돌아온다. */
function writeFields(map: Y.Map<unknown>, source: object, fields: readonly string[]): void {
  const record = source as Record<string, unknown>;
  for (const field of fields) {
    const value = record[field];
    if (value === undefined) {
      if (map.has(field)) map.delete(field);
    } else if (map.get(field) !== value) {
      // 같은 값을 다시 set하면 Yjs는 새 Item을 쌓는다 — 저장량·동기화량이 는다.
      map.set(field, value);
    }
  }
}

function readFields<T>(map: Y.Map<unknown>, fields: readonly string[]): T {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    const value = map.get(field);
    // 원격 peer가 비원시 값(Y 타입·객체)을 넣어도 스토어로 흘리지 않는다. 스키마 필드는 전부 원시값이다.
    if (isPrimitive(value)) out[field] = value;
  }
  return out as T;
}

const PRIMITIVE_TYPES = new Set(["string", "number", "boolean"]);

// null은 통과한다 — boardId 같은 스키마 필드가 null을 쓴다.
function isPrimitive(value: unknown): boolean {
  return value === null || PRIMITIVE_TYPES.has(typeof value);
}

/** id가 문자열이 아니면 불완전한 항목이다 — 읽기에서 건너뛴다. */
function hasId(map: unknown): map is Y.Map<unknown> {
  // 원격이 notes 값 자체를 숫자 따위로 덮어도 읽기 전체가 터지지 않게.
  return map instanceof Y.Map && typeof map.get("id") === "string";
}

/** 메모는 위치·종류까지 있어야 그릴 수 있다 — 빠지면 부분 메모로 흘리지 않고 건너뛴다. */
function isRenderableNote(map: unknown): map is Y.Map<unknown> {
  return (
    hasId(map) &&
    typeof map.get("kind") === "string" &&
    typeof map.get("x") === "number" &&
    typeof map.get("y") === "number"
  );
}

export function notesMap(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return doc.getMap<Y.Map<unknown>>(NOTES_MAP);
}

export function connectionsMap(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return doc.getMap<Y.Map<unknown>>(CONNECTIONS_MAP);
}

export function metaMap(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap<unknown>(META_MAP);
}

export function filesMap(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap<unknown>(FILES_MAP);
}

/* ── 변환 (순수 함수) ───────────────────────────────────────────── */

export function noteToYMap(note: Note): Y.Map<unknown> {
  const map = new Y.Map<unknown>();
  writeFields(map, note, NOTE_FIELDS);
  return map;
}

export function yMapToNote(map: Y.Map<unknown>): SharedNote {
  return readFields<SharedNote>(map, NOTE_FIELDS);
}

export function connectionToYMap(connection: Connection): Y.Map<unknown> {
  const map = new Y.Map<unknown>();
  writeFields(map, connection, CONNECTION_FIELDS);
  return map;
}

export function yMapToConnection(map: Y.Map<unknown>): Connection {
  return readFields<Connection>(map, CONNECTION_FIELDS);
}

export function boardToYMap(board: Board): Y.Map<unknown> {
  const map = new Y.Map<unknown>();
  writeFields(map, board, BOARD_FIELDS);
  return map;
}

export function yMapToBoard(map: Y.Map<unknown>): SharedBoard {
  return readFields<SharedBoard>(map, BOARD_FIELDS);
}

/* ── 메모 ──────────────────────────────────────────────────────── */

/** 메모 하나를 전부 쓴다(생성·일괄 갱신). 로컬 origin 트랜잭션.
 * SharedNote도 받는다 — 문서는 lastVisitedAt(기기 로컬)을 쓰지 않는다. */
export function putNote(doc: Y.Doc, note: Note | SharedNote): void {
  transactLocal(doc, () => {
    const notes = notesMap(doc);
    const existing = notes.get(note.id);
    const map = existing ?? new Y.Map<unknown>();
    writeFields(map, note, NOTE_FIELDS);
    if (!existing) notes.set(note.id, map);
  });
}

/**
 * 메모 필드 하나만 바꾼다 — 그 메모의 Y.Map 키 하나만 변경된다(작업 5).
 * 드래그 좌표처럼 잦은 쓰기는 이 경로로 키를 좁게 연다.
 */
export function updateNoteField<K extends keyof SharedNote>(
  doc: Y.Doc,
  noteId: string,
  field: K,
  value: SharedNote[K],
): void {
  transactLocal(doc, () => {
    const notes = notesMap(doc);
    const map = notes.get(noteId);
    // 없는 메모는 만들지 않는다 — 원격 삭제 뒤 드래그가 유령 메모를 되살리지 않게. 생성은 putNote.
    if (!map) return;
    if (value === undefined) map.delete(field);
    else if (map.get(field) !== value) map.set(field, value);
  });
}

/**
 * 여러 공유 필드를 한 트랜잭션에 쓴다(n23 작업 2 — 단일 쓰기 헬퍼의 기반).
 * 주어진 키만 건드린다 — 제공되지 않은 필드는 지우지 않는다. 값이 undefined면
 * 그 키를 지운다(선택 필드 해제). 없는 메모는 만들지 않는다(생성은 putNote).
 */
export function updateNoteFields(
  doc: Y.Doc,
  noteId: string,
  fields: Partial<SharedNote>,
): void {
  transactLocal(doc, () => {
    const map = notesMap(doc).get(noteId);
    if (!map) return;
    for (const [field, value] of Object.entries(fields)) {
      if (value === undefined) {
        if (map.has(field)) map.delete(field);
      } else if (map.get(field) !== value) {
        map.set(field, value);
      }
    }
  });
}

export function deleteNote(doc: Y.Doc, noteId: string): void {
  transactLocal(doc, () => {
    notesMap(doc).delete(noteId);
  });
}

export function readNote(doc: Y.Doc, noteId: string): SharedNote | undefined {
  const map = notesMap(doc).get(noteId);
  return isRenderableNote(map) ? yMapToNote(map) : undefined;
}

export function readNotes(doc: Y.Doc): SharedNote[] {
  const notes = notesMap(doc);
  return [...notes.values()].filter(isRenderableNote).map(yMapToNote);
}

/* ── 연결선 ────────────────────────────────────────────────────── */

export function putConnection(doc: Y.Doc, connection: Connection): void {
  transactLocal(doc, () => {
    const connections = connectionsMap(doc);
    const existing = connections.get(connection.id);
    const map = existing ?? new Y.Map<unknown>();
    writeFields(map, connection, CONNECTION_FIELDS);
    if (!existing) connections.set(connection.id, map);
  });
}

export function deleteConnection(doc: Y.Doc, connectionId: string): void {
  transactLocal(doc, () => {
    connectionsMap(doc).delete(connectionId);
  });
}

export function readConnections(doc: Y.Doc): Connection[] {
  const connections = connectionsMap(doc);
  return [...connections.values()].filter(hasId).map(yMapToConnection);
}

export function readConnection(doc: Y.Doc, connectionId: string): Connection | undefined {
  const map = connectionsMap(doc).get(connectionId);
  return hasId(map) ? yMapToConnection(map) : undefined;
}

/* ── 보드 메타 ─────────────────────────────────────────────────── */

/** 보드 필드를 전부 쓴다. 보드당 문서 1개라 meta Y.Map 하나를 채운다. */
export function putBoard(doc: Y.Doc, board: Board): void {
  transactLocal(doc, () => {
    writeFields(metaMap(doc), board, BOARD_FIELDS);
  });
}

export function updateMetaField<K extends keyof SharedBoard>(
  doc: Y.Doc,
  field: K,
  value: SharedBoard[K],
): void {
  transactLocal(doc, () => {
    const meta = metaMap(doc);
    if (value === undefined) meta.delete(field);
    else meta.set(field, value);
  });
}

export function readBoard(doc: Y.Doc): SharedBoard {
  return yMapToBoard(metaMap(doc));
}

/* ── 첨부 파일 매핑 (n10) ──────────────────────────────────────── */

/** 로컬 참조(`opfs:<file>`)에 서버 fileId를 적는다. 업로드 성공 때만 부른다. */
export function setDocFile(doc: Y.Doc, localRef: string, fileId: string): void {
  transactLocal(doc, () => {
    const files = filesMap(doc);
    if (files.get(localRef) !== fileId) files.set(localRef, fileId);
  });
}

/** 로컬 참조에 매인 서버 fileId. 아직 업로드 전이거나 실패면 undefined. */
export function readDocFile(doc: Y.Doc, localRef: string): string | undefined {
  const value = filesMap(doc).get(localRef);
  return typeof value === "string" && value ? value : undefined;
}
