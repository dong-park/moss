/**
 * 보드 Yjs 문서의 공용 모델 — web과 sync가 같은 정의를 가져온다.
 * 맵 이름과 필드 목록은 여기에만 둔다(color·textSize·autoWidth 누락 사고 방지).
 * Dexie 행 타입(Note 등)과의 일치는 web의 컴파일 검사가 맡는다.
 */
export const NOTES_MAP = "notes";
export const CONNECTIONS_MAP = "connections";
export const META_MAP = "meta";
export const FILES_MAP = "files";

/**
 * `files` 맵 키 규칙 — 쓰는 쪽(web 업로더)과 읽는 쪽(sync MCP)이 같은 정의를 가져온다.
 * 첨부 참조 키는 `opfs:<파일>`, 값은 서버 fileId다. `!`로 시작하는 키는 첨부가 아니라 표시다.
 */
export const LOCAL_REF_PREFIX = "opfs:";

/** 저장 용량 상한에 막혀 올리지 못한 첨부의 실패 표시 값. `uploadFailedKey(ref)` 키에만 쓴다. */
export const UPLOAD_FAILED_QUOTA = "!quota_exceeded";

const UPLOAD_FAILED_PREFIX = "!failed:";

/** 실패 표시 키. 참조 키(`opfs:…`)와 겹치지 않는다. */
export function uploadFailedKey(localRef: string): string {
  return UPLOAD_FAILED_PREFIX + localRef;
}

/** `files` 맵을 훑는 쪽이 첨부 참조와 표시를 가르는 데 쓴다. */
export function isUploadFailedKey(key: string): boolean {
  return key.startsWith(UPLOAD_FAILED_PREFIX);
}

/** 참조에서 로컬 파일 이름만 꺼낸다. 접두사가 없으면 그대로 돌려준다. */
export function localRefName(localRef: string): string {
  return localRef.startsWith(LOCAL_REF_PREFIX) ? localRef.slice(LOCAL_REF_PREFIX.length) : localRef;
}

/**
 * 메모 본문(마크다운) 안의 첨부 블록 형식 — web 블록 모듈과 sync MCP가 같은 정의로 쓰고 읽는다.
 * 본문의 URL은 `opfs://<파일>`(콜론+슬래시 2개)이고, files 맵의 참조 키는 `opfs:<파일>`(콜론 1개)이다.
 *  - 이미지: `![](opfs://<파일>)`
 *  - 파일:   `[<원본 파일명>](opfs://<파일> "moss-file")`
 */
export const OPFS_URL_PREFIX = "opfs://";
export const FILE_BLOCK_TITLE = "moss-file";

/** `opfs://abc.png` → `opfs:abc.png` (참조 키). */
export function toLocalRef(markdownUrl: string): string {
  return LOCAL_REF_PREFIX + markdownUrl.slice(OPFS_URL_PREFIX.length);
}

/** `opfs:abc.png` → `opfs://abc.png` (본문 URL). */
export function toMarkdownUrl(localRef: string): string {
  return OPFS_URL_PREFIX + localRef.slice(LOCAL_REF_PREFIX.length);
}

/**
 * 블록 라벨(파일명·링크 제목) 이스케이프. `]`·`"`·`(`·`)`·역슬래시는 링크 문법이나 제목 표식을 깨므로
 * 역슬래시 하나를 붙이고, 개행·제어문자는 블록을 두 줄로 쪼개므로 공백으로 바꾼다.
 */
export function escapeBlockLabel(label: string): string {
  return label.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/[\\\]"()]/g, (m) => "\\" + m);
}

export function unescapeBlockLabel(label: string): string {
  return label.replace(/\\(.)/g, "$1");
}

/** 참조 키(`opfs:<파일>`)로 이미지 블록 한 줄을 만든다. */
export function imageBlockMarkdown(localRef: string): string {
  return "![](" + toMarkdownUrl(localRef) + ")";
}

/** 참조 키와 원본 파일명으로 파일 블록 한 줄을 만든다. */
export function fileBlockMarkdown(localRef: string, filename: string): string {
  return "[" + escapeBlockLabel(filename) + "](" + toMarkdownUrl(localRef) + ' "' + FILE_BLOCK_TITLE + '")';
}

/**
 * 원격 MCP(에이전트)가 메모·연결을 쓸 때 남기는 변경 출처 칸(D6 → A). 값은 마지막으로 쓴 커넥터 이름과 시각이다.
 * NOTE_FIELDS·CONNECTION_FIELDS 밖에 둬서 web의 읽기·쓰기가 건드리지 않는다 — web이 메모를 고쳐도 칸이 남으므로
 * 읽는 쪽은 `updatedAt`이 `mcpAt`보다 크면 그 뒤에 다른 곳에서 고쳐졌다고 본다.
 */
export const PROVENANCE_FIELDS = ["mcpClient", "mcpAt"] as const;

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
