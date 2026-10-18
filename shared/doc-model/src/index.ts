/**
 * 보드 Yjs 문서의 공용 모델 — web과 sync가 같은 정의를 가져온다.
 * 맵 이름과 필드 목록은 여기에만 둔다(color·textSize·autoWidth 누락 사고 방지).
 * Dexie 행 타입(Note 등)과의 일치는 web의 컴파일 검사가 맡는다.
 */
export const NOTES_MAP = "notes";
export const CONNECTIONS_MAP = "connections";
export const META_MAP = "meta";
export const FILES_MAP = "files";

/** 기기 로컬 필드(lastVisitedAt, lastOpenedAt, remote)는 문서에 쓰지 않는다. */
export const NOTE_FIELDS = [
  "id", "boardId", "kind", "x", "y", "width", "height",
  "rotation", "content", "attachmentRef", "mediaType", "color",
  "overlay", "frameId", "title", "aiOptOut", "createdAt", "updatedAt",
  "textSize", "autoWidth",
] as const;

export const CONNECTION_FIELDS = [
  "id", "sourceNoteId", "targetNoteId", "source", "status", "label",
  "createdAt", "sourceSide", "targetSide",
] as const;

export const BOARD_FIELDS = [
  "id", "name", "isSystem", "templateId", "parentBoardId", "createdAt", "updatedAt",
] as const;

/** Y.Map 중 이 모듈이 쓰는 부분만. yjs에 의존하지 않으려고 구조 타입으로 받는다. */
export interface FieldMap {
  get(key: string): unknown;
  set(key: string, value: unknown): unknown;
  has(key: string): boolean;
  delete(key: string): unknown;
}

/** undefined 필드는 키를 만들지 않는다 — 왕복 시 없는 키가 undefined로 돌아온다. */
export function writeFields(map: FieldMap, source: object, fields: readonly string[]): void {
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

const PRIMITIVE_TYPES = new Set(["string", "number", "boolean"]);

// null은 통과한다 — boardId 같은 스키마 필드가 null을 쓴다.
export function isPrimitive(value: unknown): boolean {
  return value === null || PRIMITIVE_TYPES.has(typeof value);
}

export function readFields<T>(map: FieldMap, fields: readonly string[]): T {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    const value = map.get(field);
    // 원격 peer가 비원시 값(Y 타입·객체)을 넣어도 흘리지 않는다. 스키마 필드는 전부 원시값이다.
    if (isPrimitive(value)) out[field] = value;
  }
  return out as T;
}
