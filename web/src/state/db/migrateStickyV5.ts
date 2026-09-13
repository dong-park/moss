/**
 * FEAT-sticky-redesign n3 — 옛 카드(image·link·audio·file·mindmap) → 블록 든
 * text 메모 이관, 되돌리기.
 *
 * `migrateStickyV5`는 schema.ts의 Dexie `version(5).upgrade()` 트랜잭션 안에서만
 * 호출된다 — 이관은 그 트랜잭션 밖에서 다시 실행하지 않는다(spec §4 동시성:
 * 중단되면 Dexie가 전체를 되돌리고 다음 실행에 다시 돈다).
 *
 * `rollbackStickyMigration`은 독립 함수 — 이관 뒤 사용자가 부르는 되돌리기다.
 * `legacy.migratedContent`와 현재 content가 같은 행(=편집 안 한 행)만 복원한다.
 */

import type { Transaction } from "dexie";
import { serializeBlock } from "../blocks";
import { parseLink, parseMindmap, type MindmapNode } from "../cardContent";
import { getDB, type MossDB, type Note, type NoteKind } from "./schema";

/** 이관 뒤 모든 메모가 갖는 기본 폭(spec: "메모 기본 폭"). workspace.widthForKind("text")와 같은 값. */
const DEFAULT_TEXT_WIDTH = 240;

const MIGRATABLE_KINDS: ReadonlySet<NoteKind> = new Set([
  "image",
  "link",
  "audio",
  "file",
  "mindmap",
]);

/**
 * 마인드맵 트리 → 들여쓴 마크다운 목록.
 * 루트 자신은 줄로 안 나온다 — mindmap 카드 UI(Content.tsx flatten)와 같은 규약:
 * root.children이 depth 0, 그 자식이 depth 1... 빈 text 노드도 빈 항목("- ")으로 남겨
 * 형제 순서·자식 깊이를 보존한다.
 */
function mindmapToList(root: MindmapNode): string {
  const lines: string[] = [];
  function dfs(node: MindmapNode, depth: number) {
    lines.push("  ".repeat(depth) + "- " + node.text);
    for (const child of node.children) dfs(child, depth + 1);
  }
  for (const child of root.children) dfs(child, 0);
  return lines.join("\n");
}

/** 옛 종류 하나를 이관 후 본문(마크다운)으로 바꾼다. */
function migratedBody(note: Note): string {
  switch (note.kind) {
    case "image":
      return note.attachmentRef ? serializeBlock({ type: "image", ref: note.attachmentRef }) : "";
    case "audio":
      return note.attachmentRef ? serializeBlock({ type: "audio", ref: note.attachmentRef }) : "";
    case "file":
      return note.attachmentRef
        ? serializeBlock({
            type: "file",
            ref: note.attachmentRef,
            filename: note.content || note.attachmentRef,
          })
        : (note.content ?? "");
    case "link": {
      const { url, title } = parseLink(note.content);
      // 허용 스킴(http/https/mailto) 밖이면 null — 링크 URL을 일반 텍스트로 남긴다.
      return serializeBlock({ type: "link", url, title }) ?? url;
    }
    case "mindmap":
      return mindmapToList(parseMindmap(note.content).root);
    default:
      return note.content;
  }
}

/** 이관 대상 행 하나를 새 text 행(legacy 포함)으로 바꾼다. 원본은 변경하지 않는다. */
function migrateRow(note: Note): Note {
  const migratedText = migratedBody(note);
  const next: Note = {
    ...note,
    kind: "text",
    content: migratedText,
    width: DEFAULT_TEXT_WIDTH,
    legacy: {
      kind: note.kind,
      content: note.content,
      ...(note.attachmentRef !== undefined ? { attachmentRef: note.attachmentRef } : {}),
      ...(note.mediaType !== undefined ? { mediaType: note.mediaType } : {}),
      width: note.width,
      ...(note.height !== undefined ? { height: note.height } : {}),
      migratedAt: Date.now(),
      migratedContent: migratedText,
    },
  };
  delete next.height;
  return next;
}

/**
 * v4→v5 upgrade 본체. Dexie `version(5).upgrade()` 트랜잭션 콜백에서만 부른다.
 * 다섯 옛 종류를 text로 바꾸고 원본을 legacy에 백업한다. 첨부(OPFS)는 지우지 않는다.
 *
 * `.modify()`(행마다 커서 update) 대신 `toArray()` + `bulkPut()`을 쓴다 — 대상 행만
 * 모아 한 번에 쓰는 편이 카드 1,000장 기준(spec §8) 아래서 훨씬 빠르다.
 */
export async function migrateStickyV5(tx: Transaction): Promise<void> {
  const table = tx.table<Note, string>("notes");
  const rows = await table.toArray();
  const updates = rows.filter((note) => MIGRATABLE_KINDS.has(note.kind)).map(migrateRow);
  if (updates.length > 0) await table.bulkPut(updates);
}

/**
 * 이관 되돌리기. `legacy`가 있고 현재 content가 `legacy.migratedContent`와 같은
 * (=이관 뒤 편집 안 한) 행만 원래 종류·본문으로 되돌리고 `legacy`를 비운다.
 * 편집한 행은 건너뛴다. 반환값으로 되돌린 개수/건너뛴 개수를 알려준다.
 */
export async function rollbackStickyMigration(
  db: MossDB = getDB(),
): Promise<{ restored: number; skipped: number }> {
  let restored = 0;
  let skipped = 0;

  await db.transaction("rw", db.notes, async () => {
    const rows = await db.notes.toCollection().toArray();
    for (const note of rows) {
      const legacy = note.legacy;
      if (!legacy) continue;
      if (note.content !== legacy.migratedContent) {
        skipped += 1;
        continue;
      }

      const restoredNote: Note = {
        ...note,
        kind: legacy.kind,
        content: legacy.content,
        width: legacy.width,
      };
      if (legacy.attachmentRef !== undefined) {
        restoredNote.attachmentRef = legacy.attachmentRef;
      } else {
        delete restoredNote.attachmentRef;
      }
      if (legacy.mediaType !== undefined) {
        restoredNote.mediaType = legacy.mediaType;
      } else {
        delete restoredNote.mediaType;
      }
      if (legacy.height !== undefined) {
        restoredNote.height = legacy.height;
      } else {
        delete restoredNote.height;
      }
      delete restoredNote.legacy;

      await db.notes.put(restoredNote);
      restored += 1;
    }
  });

  return { restored, skipped };
}
