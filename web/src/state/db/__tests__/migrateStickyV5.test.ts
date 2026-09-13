import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { createDB, type Note } from "@/state/db/schema";
import { rollbackStickyMigration } from "@/state/db/migrateStickyV5";

let counter = 0;
const dbs: { close: () => void; delete: () => Promise<unknown> }[] = [];

function nextName() {
  return `moss-migrate-test-${Date.now()}-${counter++}`;
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
});

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

function makeV4Note(overrides: Partial<Note> = {}): Note {
  const now = Date.now();
  return {
    id: `n-${Math.random().toString(36).slice(2)}`,
    boardId: "board-1",
    kind: "text",
    x: 0,
    y: 0,
    width: 240,
    rotation: 0,
    content: "",
    aiOptOut: false,
    createdAt: now,
    updatedAt: now,
    lastVisitedAt: now,
    ...overrides,
  };
}

describe("migrateStickyV5 — 옛 카드 이관 (FEAT-sticky-redesign n3, AC-14)", () => {
  it("v4의 다섯 종류 + 이미 text인 행 + 망가진 mindmap을 실제 upgrade로 이관한다", async () => {
    const name = nextName();
    const v4db = openV4Only(name);
    await v4db.open();

    const rows: Note[] = [
      makeV4Note({
        id: "img",
        kind: "image",
        content: "",
        attachmentRef: "opfs:abc.png",
        mediaType: "image/png",
        width: 200,
      }),
      makeV4Note({
        id: "lnk",
        kind: "link",
        content: JSON.stringify({ url: "https://example.com", title: "예시" }),
        width: 260,
      }),
      makeV4Note({
        id: "aud",
        kind: "audio",
        content: "",
        attachmentRef: "opfs:rec.webm",
        mediaType: "audio/webm",
        width: 220,
      }),
      makeV4Note({
        id: "file",
        kind: "file",
        content: "report.pdf",
        attachmentRef: "opfs:doc.pdf",
        mediaType: "application/pdf",
        width: 220,
      }),
      makeV4Note({
        id: "mm",
        kind: "mindmap",
        content: JSON.stringify({
          root: {
            id: "root",
            text: "",
            children: [
              {
                id: "a",
                text: "A",
                children: [{ id: "a1", text: "A1", children: [] }],
              },
              { id: "b", text: "B", children: [] },
            ],
          },
        }),
        width: 320,
      }),
      makeV4Note({
        id: "mm-broken",
        kind: "mindmap",
        content: "not json{{{",
        width: 320,
      }),
      makeV4Note({ id: "already-text", kind: "text", content: "이미 메모", width: 240 }),
    ];
    await v4db.table("notes").bulkPut(rows);
    v4db.close();

    const v5db = createDB(name);
    dbs.push(v5db);
    await v5db.open();
    expect(v5db.verno).toBe(5);

    const all = await v5db.notes.toArray();
    const byId = new Map(all.map((n) => [n.id, n]));

    // image
    const img = byId.get("img")!;
    expect(img.kind).toBe("text");
    expect(img.content).toBe("![](opfs://abc.png)");
    expect(img.width).toBe(240);
    expect(img.height).toBeUndefined();
    expect(img.legacy?.kind).toBe("image");
    expect(img.legacy?.attachmentRef).toBe("opfs:abc.png");
    expect(img.legacy?.width).toBe(200);
    expect(img.legacy?.migratedContent).toBe(img.content);
    expect(img.attachmentRef).toBe("opfs:abc.png"); // 첨부 참조 필드는 지우지 않는다

    // link
    const lnk = byId.get("lnk")!;
    expect(lnk.kind).toBe("text");
    expect(lnk.content).toBe('[예시](https://example.com "moss-link")');
    expect(lnk.legacy?.kind).toBe("link");
    expect(lnk.legacy?.content).toBe(rows[1].content);

    // audio
    const aud = byId.get("aud")!;
    expect(aud.kind).toBe("text");
    expect(aud.content).toBe('[녹음](opfs://rec.webm "moss-audio")');
    expect(aud.legacy?.kind).toBe("audio");

    // file
    const file = byId.get("file")!;
    expect(file.kind).toBe("text");
    expect(file.content).toBe('[report.pdf](opfs://doc.pdf "moss-file")');
    expect(file.legacy?.kind).toBe("file");
    expect(file.legacy?.content).toBe("report.pdf");

    // mindmap — 형제 순서·깊이 보존
    const mm = byId.get("mm")!;
    expect(mm.kind).toBe("text");
    expect(mm.content).toBe("- A\n  - A1\n- B");
    expect(mm.legacy?.kind).toBe("mindmap");
    expect(mm.legacy?.content).toBe(rows[4].content);

    // 망가진 mindmap → 빈 목록 + 백업 보존
    const mmBroken = byId.get("mm-broken")!;
    expect(mmBroken.kind).toBe("text");
    expect(mmBroken.content).toBe("");
    expect(mmBroken.legacy?.kind).toBe("mindmap");
    expect(mmBroken.legacy?.content).toBe("not json{{{");

    // 이미 text인 행은 손대지 않는다 — legacy 없음(§5 불가능 조합: text인데 백업 원래종류도 text)
    const already = byId.get("already-text")!;
    expect(already.kind).toBe("text");
    expect(already.content).toBe("이미 메모");
    expect(already.legacy).toBeUndefined();
  });

  it("첨부 OPFS 파일은 지우지 않는다 — attachmentRef 값 보존", async () => {
    const name = nextName();
    const v4db = openV4Only(name);
    await v4db.open();
    await v4db.table("notes").bulkPut([
      makeV4Note({ id: "img", kind: "image", attachmentRef: "opfs:keep.png", content: "" }),
    ]);
    v4db.close();

    const v5db = createDB(name);
    dbs.push(v5db);
    await v5db.open();
    const row = await v5db.notes.get("img");
    expect(row?.attachmentRef).toBe("opfs:keep.png");
  });

  it("1,000장 이관이 2초 이내 끝난다", async () => {
    const name = nextName();
    const v4db = openV4Only(name);
    await v4db.open();
    const rows: Note[] = Array.from({ length: 1000 }, (_, i) =>
      makeV4Note({
        id: `bulk-${i}`,
        kind: "image",
        content: "",
        attachmentRef: `opfs:bulk-${i}.png`,
        width: 200,
      }),
    );
    await v4db.table("notes").bulkPut(rows);
    v4db.close();

    const start = Date.now();
    const v5db = createDB(name);
    dbs.push(v5db);
    await v5db.open();
    const elapsed = Date.now() - start;

    const count = await v5db.notes.count();
    expect(count).toBe(1000);
    expect(elapsed).toBeLessThan(2000);
  }, 10000);
});

describe("rollbackStickyMigration — 되돌리기 (AC-15)", () => {
  async function migratedDB(name: string) {
    const v4db = openV4Only(name);
    await v4db.open();
    await v4db.table("notes").bulkPut([
      makeV4Note({ id: "img", kind: "image", attachmentRef: "opfs:a.png", content: "", width: 200 }),
      makeV4Note({
        id: "lnk",
        kind: "link",
        content: JSON.stringify({ url: "https://example.com" }),
        width: 260,
      }),
    ]);
    v4db.close();
    const db = createDB(name);
    await db.open();
    return db;
  }

  it("편집 안 한 행은 원래 종류·본문으로 되돌리고 legacy를 비운다", async () => {
    const name = nextName();
    const db = await migratedDB(name);
    dbs.push(db);

    const { restored, skipped } = await rollbackStickyMigration(db);
    expect(restored).toBe(2);
    expect(skipped).toBe(0);

    const img = await db.notes.get("img");
    expect(img?.kind).toBe("image");
    expect(img?.content).toBe("");
    expect(img?.width).toBe(200);
    expect(img?.legacy).toBeUndefined();

    const lnk = await db.notes.get("lnk");
    expect(lnk?.kind).toBe("link");
    expect(lnk?.content).toBe(JSON.stringify({ url: "https://example.com" }));
    expect(lnk?.legacy).toBeUndefined();
  });

  it("이관 뒤 편집한 행은 건너뛴다(skipped 카운트)", async () => {
    const name = nextName();
    const db = await migratedDB(name);
    dbs.push(db);

    const img = await db.notes.get("img");
    await db.notes.update("img", { content: `${img!.content}\n사용자가 덧붙인 글` });

    const { restored, skipped } = await rollbackStickyMigration(db);
    expect(restored).toBe(1); // lnk만
    expect(skipped).toBe(1); // img는 편집됐으니 건너뜀

    const imgAfter = await db.notes.get("img");
    expect(imgAfter?.kind).toBe("text"); // 되돌리지 않음 — 이관된 상태 그대로
    expect(imgAfter?.legacy).toBeDefined(); // legacy도 그대로 남음
  });
});
