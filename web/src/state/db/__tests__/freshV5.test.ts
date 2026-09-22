/**
 * FEAT-sticky-redesign n3 — 이관 대신 새 DB로 시작. v4→v5 upgrade는 notes·boards·
 * connections·embeddings를 전부 비우고, settings는 남긴다. OPFS 첨부 비우기는
 * upgrade 밖(DB open 성공 후)에서 대기 플래그로 한 번 실행된다.
 */
import Dexie from "dexie";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDB, type Board, type Note } from "@/state/db/schema";
import {
  clearAttachmentsDir,
  clearOpfsPurgePending,
  isOpfsPurgePending,
} from "@/state/db/opfs";

let counter = 0;
const dbs: { close: () => void; delete: () => Promise<unknown> }[] = [];

function nextName() {
  return `moss-freshv5-test-${Date.now()}-${counter++}`;
}

afterEach(async () => {
  while (dbs.length) {
    const db = dbs.pop()!;
    db.close();
    try {
      await db.delete();
    } catch {
      /* noop */
    }
  }
  clearOpfsPurgePending();
});

function makeNote(overrides: Partial<Note> = {}): Note {
  const now = Date.now();
  return {
    id: `n-${Math.random().toString(36).slice(2)}`,
    boardId: null,
    kind: "text",
    x: 0,
    y: 0,
    width: 240,
    rotation: 0,
    content: "hello",
    aiOptOut: false,
    createdAt: now,
    updatedAt: now,
    lastVisitedAt: now,
    ...overrides,
  };
}

function makeBoard(overrides: Partial<Board> = {}): Board {
  const now = Date.now();
  return {
    id: `b-${Math.random().toString(36).slice(2)}`,
    name: "board",
    isSystem: false,
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    ...overrides,
  };
}

/** 실제 MossDB의 v4 stores 스키마를 그대로 복제한 임시 DB — v4까지만 연다. */
function openV4Only(name: string): Dexie {
  const stores = {
    notes: "id, boardId, kind, createdAt, lastVisitedAt, aiOptOut",
    boards: "id, isSystem, lastOpenedAt",
    connections: "id, sourceNoteId, targetNoteId, status",
    embeddings: "noteId, updatedAt",
    settings: "id",
  };
  const db = new Dexie(name);
  db.version(1).stores(stores);
  db.version(4).stores({
    ...stores,
    boards: "id, isSystem, lastOpenedAt, parentBoardId",
  });
  return db;
}

describe("v5 새 DB로 시작 (FEAT-sticky-redesign n3)", () => {
  it("clears notes/boards/connections/embeddings on upgrade, keeps settings", async () => {
    const name = nextName();
    const v4db = openV4Only(name);
    await v4db.open();
    await v4db.table("notes").bulkPut([
      makeNote({ id: "text-1", kind: "text" }),
      makeNote({ id: "image-1", kind: "image", attachmentRef: "opfs:a.png" }),
      makeNote({ id: "link-1", kind: "link", content: "https://example.com" }),
    ]);
    await v4db.table("boards").bulkPut([makeBoard({ id: "board-1" })]);
    await v4db.table("connections").bulkPut([
      {
        id: "c-1",
        sourceNoteId: "text-1",
        targetNoteId: "image-1",
        source: "manual",
        status: "active",
        createdAt: Date.now(),
      },
    ]);
    await v4db.table("embeddings").bulkPut([
      { noteId: "text-1", contentHash: "h", vector: new Float32Array([1]), updatedAt: Date.now() },
    ]);
    await v4db.table("settings").put({
      id: "singleton",
      aiOptOutGlobal: true,
      persistGranted: true,
      storageQuotaShown: { at80: false, at95: false },
      uiLocale: "ko",
      installPromptShown: true,
    });
    v4db.close();

    const v5db = createDB(name);
    dbs.push(v5db);
    await v5db.open();

    expect(v5db.verno).toBe(6);
    expect(await v5db.notes.count()).toBe(0);
    expect(await v5db.boards.count()).toBe(0);
    expect(await v5db.connections.count()).toBe(0);
    expect(await v5db.embeddings.count()).toBe(0);
    // settings는 사용자 설정이라 유지된다.
    const settings = await v5db.settings.get("singleton");
    expect(settings?.aiOptOutGlobal).toBe(true);
    expect(settings?.uiLocale).toBe("ko");

    // upgrade가 OPFS 첨부 비우기 대기 플래그를 남긴다(실제 삭제는 storage.ts init이 실행).
    expect(isOpfsPurgePending()).toBe(true);
  });

  it("new rows survive reopen, parentBoardId index exists", async () => {
    const name = nextName();
    const db = createDB(name);
    dbs.push(db);
    await db.open();
    expect(db.verno).toBe(6);

    await db.notes.put(makeNote({ id: "fresh-1", content: "새 메모" }));
    await db.boards.put(makeBoard({ id: "board-a", parentBoardId: "board-root" }));
    db.close();

    const reopened = createDB(name);
    dbs.push(reopened);
    await reopened.open();

    const note = await reopened.notes.get("fresh-1");
    expect(note?.content).toBe("새 메모");

    const children = await reopened.boards.where("parentBoardId").equals("board-root").toArray();
    expect(children.map((b) => b.id)).toEqual(["board-a"]);
  });

  it("실경로 갭: opfs 어댑터를 fake로 둔 첨부 비우기 실행(clearAttachmentsDir 호출)", async () => {
    // 실제 브라우저 OPFS 없이는 storage.ts init() 전체 경로(useStorage)까지 실행하지
    // 않는다 — 여기서는 opfs 모듈의 clearAttachmentsDir/플래그 API만 fake로 검증한다.
    // 실제 브라우저에서 v5 upgrade 직후 새로고침 없이 파일이 지워지는지는 수동 확인 갭.
    const removeEntry = vi.fn(async () => {});
    const getDirectory = vi.fn(async () => ({ removeEntry }));
    const originalStorage = Object.getOwnPropertyDescriptor(navigator, "storage");
    Object.defineProperty(navigator, "storage", {
      value: { getDirectory },
      configurable: true,
      writable: true,
    });

    try {
      await clearAttachmentsDir();
      expect(getDirectory).toHaveBeenCalledTimes(1);
      expect(removeEntry).toHaveBeenCalledWith("moss-attachments", { recursive: true });
    } finally {
      if (originalStorage) Object.defineProperty(navigator, "storage", originalStorage);
    }
  });
});
