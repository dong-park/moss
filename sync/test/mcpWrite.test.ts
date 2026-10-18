import { afterEach, describe, expect, test } from "bun:test";
import * as Y from "yjs";
import { PROVENANCE_FIELDS } from "@moss/doc-model";
import { McpToolError } from "../src/mcp.ts";
import { MAX_ATTACHMENT_BYTES, findFreeSpot, writeTools } from "../src/mcpWriteTools.ts";
import { waitFor } from "./helpers.ts";
import { idIn, noteOf, putConnection, putNote, startMcp, USER, type McpHarness } from "./mcpHarness.ts";

const BOARD = "b-write001";
const FOREIGN = "b-foreign2";
const [CLIENT_FIELD, AT_FIELD] = PROVENANCE_FIELDS;

function boardDoc(): Y.Doc {
  const doc = new Y.Doc();
  doc.getMap("meta").set("name", "쓰기 보드");
  putNote(doc, { id: "frame-1", kind: "frame", x: 0, y: 0, width: 600, height: 400, content: '{"name":"틀"}', createdAt: 1 });
  putNote(doc, { id: "n-1", kind: "text", x: 320, y: 140, width: 240, height: 240, content: "첫 메모", createdAt: 2 });
  putNote(doc, { id: "n-2", kind: "text", x: 600, y: 140, width: 240, height: 240, content: "둘째 메모", createdAt: 3 });
  return doc;
}

let harness: McpHarness | undefined;
afterEach(async () => {
  await harness?.stop();
  harness = undefined;
});

const start = (extra: Partial<Parameters<typeof startMcp>[0]> = {}) =>
  startMcp({ tools: writeTools, docs: { [BOARD]: boardDoc(), [FOREIGN]: boardDoc() }, members: [BOARD], ...extra });

describe("findFreeSpot", () => {
  test("uses the seed area on an empty board and keeps clear of every note", () => {
    expect(findFreeSpot([], 240, 240)).toEqual({ x: 320, y: 140 });
    const boxes = [{ x: 320, y: 140, width: 240, height: 240 }, { x: 600, y: 140, width: 240, height: 240 }];
    const spot = findFreeSpot(boxes, 240, 240);
    for (const box of boxes) {
      const apart = spot.x + 240 <= box.x || box.x + box.width <= spot.x || spot.y + 240 <= box.y || box.y + box.height <= spot.y;
      expect(apart).toBe(true);
    }
  });

  test("a note that fits nowhere in the band goes under everything", () => {
    const boxes = Array.from({ length: 20 }, (_, i) => ({ x: i * 100, y: 0, width: 100, height: 100 }));
    expect(findFreeSpot(boxes, 2000, 100).y).toBeGreaterThanOrEqual(100);
  });
});

describe("mcp write tools", () => {
  test("create_note shows up in an open browser, away from other notes, and survives a reload with its color, size and title", async () => {
    harness = await start();
    const browser = await harness.openAsBrowser(BOARD);
    try {
      const ids: string[] = [];
      for (let i = 0; i < 4; i += 1) {
        const reply = await harness.call("create_note", {
          board: BOARD, content: "에이전트 메모 " + i, title: "제목 " + i, kind: "textbox", color: "#b91c1c", textSize: "xl",
        });
        expect(reply.isError).toBe(false);
        ids.push(idIn(reply.text));
      }
      await waitFor(() => ids.every((id) => noteOf(browser.doc, id) !== undefined), { label: "browser sees the notes" });

      // No two non-frame notes overlap.
      const boxes = [...browser.doc.getMap<Y.Map<unknown>>("notes").values()]
        .map((map) => map.toJSON() as Record<string, number | string>)
        .filter((note) => note.kind !== "frame")
        .map((note) => ({ x: Number(note.x), y: Number(note.y), w: Number(note.width), h: Number(note.height ?? 48) }));
      expect(boxes).toHaveLength(6);
      for (let a = 0; a < boxes.length; a += 1) {
        for (let b = a + 1; b < boxes.length; b += 1) {
          const A = boxes[a]!;
          const B = boxes[b]!;
          expect(A.x < B.x + B.w && B.x < A.x + A.w && A.y < B.y + B.h && B.y < A.y + A.h).toBe(false);
        }
      }
    } finally {
      browser.close();
    }

    // Reload: the saved snapshot carries every field the web reads.
    await waitFor(() => harness!.store.stores > 0, { label: "snapshot stored" });
    const saved = await harness.saved(BOARD);
    const note = [...saved.getMap<Y.Map<unknown>>("notes").values()]
      .map((map) => map.toJSON() as Record<string, unknown>)
      .find((fields) => fields.content === "에이전트 메모 0");
    expect(note).toMatchObject({
      boardId: BOARD, kind: "textbox", color: "#b91c1c", textSize: "xl", title: "제목 0", autoWidth: false, rotation: 0, aiOptOut: true,
    });
    expect(typeof note?.x).toBe("number");
    expect(typeof note?.createdAt).toBe("number");
    // D6 → A: who wrote it is recorded and the web fields are untouched.
    expect(note?.[CLIENT_FIELD]).toBe("claude-test");
    expect(typeof note?.[AT_FIELD]).toBe("number");
  });

  test("a text memo takes a memo color name and refuses a hex value; bad input writes nothing", async () => {
    harness = await start();
    expect((await harness.call("create_note", { board: BOARD, content: "x", color: "#ff0000" })).isError).toBe(true);
    expect((await harness.call("create_note", { board: BOARD, content: "", title: "  " })).isError).toBe(true);
    const ok = await harness.call("create_note", { board: BOARD, content: "분홍", color: "pink" });
    expect(ok.isError).toBe(false);
    await waitFor(() => harness!.store.stores > 0, { label: "stored" });
    expect((await harness.saved(BOARD)).getMap("notes").size).toBe(4); // 3 seeded + the pink memo
  });

  test("update_note changes only the given fields, clears a title, and refuses frames and unknown ids", async () => {
    harness = await start();
    const created = await harness.call("create_note", { board: BOARD, content: "원본", title: "옛 제목", color: "blue" });
    const id = idIn(created.text);

    expect((await harness.call("update_note", { board: BOARD, id, content: "고친 본문", textSize: "l" })).isError).toBe(false);
    expect((await harness.call("update_note", { board: BOARD, id, title: "" })).isError).toBe(false);
    await waitFor(() => harness!.store.stores > 0, { label: "stored" });
    const note = noteOf(await harness.saved(BOARD), id);
    expect(note).toMatchObject({ content: "고친 본문", textSize: "l", color: "blue" });
    expect(note?.title).toBeUndefined();
    expect(Number(note?.updatedAt)).toBeGreaterThanOrEqual(Number(note?.createdAt));

    expect((await harness.call("update_note", { board: BOARD, id: "frame-1", content: "x" })).text).toContain("메모판");
    expect((await harness.call("update_note", { board: BOARD, id: "nope", content: "x" })).isError).toBe(true);
    expect((await harness.call("update_note", { board: BOARD, id })).isError).toBe(true);
  });

  test("delete_note removes the notes and their connection lines but never frames", async () => {
    const doc = boardDoc();
    putConnection(doc, { id: "c-1", sourceNoteId: "n-1", targetNoteId: "n-2", status: "active", source: "manual", createdAt: 5 });
    harness = await start({ docs: { [BOARD]: doc } });
    const reply = await harness.call("delete_note", { board: BOARD, ids: ["n-1", "frame-1", "ghost"] });
    expect(reply.isError).toBe(false);
    expect(reply.text).toContain("메모 1개");
    expect(reply.text).toContain("연결선 1개");
    expect(reply.text).toContain("[frame-1]");
    await waitFor(() => harness!.store.stores > 0, { label: "stored" });
    const saved = await harness.saved(BOARD);
    expect(noteOf(saved, "n-1")).toBeUndefined();
    expect(noteOf(saved, "n-2")).toBeDefined();
    expect(noteOf(saved, "frame-1")).toBeDefined();
    expect(saved.getMap("connections").size).toBe(0);
  });

  test("a request over the change limit applies the first part, leaves the rest, and says so", async () => {
    const doc = boardDoc();
    for (let i = 0; i < 5; i += 1) putNote(doc, { id: "x-" + i, kind: "text", x: i * 300, y: 900, width: 240, height: 240, content: "t", createdAt: 10 + i });
    harness = await start({ docs: { [BOARD]: doc }, limits: { maxChangesPerRequest: 3 } });
    const reply = await harness.call("delete_note", { board: BOARD, ids: ["x-0", "x-1", "x-2", "x-3", "x-4"] });
    expect(reply.isError).toBe(true);
    expect(reply.text).toContain("3개까지만");
    expect(reply.text).toContain("[x-3]");
    await waitFor(() => harness!.store.stores > 0, { label: "stored" });
    const saved = await harness.saved(BOARD);
    for (const id of ["x-0", "x-1", "x-2"]) expect(noteOf(saved, id)).toBeUndefined();
    for (const id of ["x-3", "x-4"]) expect(noteOf(saved, id)).toBeDefined();
  });

  test("over the per-minute write limit a call is refused with the reason and a retry time, and nothing is applied", async () => {
    harness = await start({ limits: { writesPerMinute: 2 } });
    expect((await harness.call("create_note", { board: BOARD, content: "하나" })).isError).toBe(false);
    expect((await harness.call("create_note", { board: BOARD, content: "둘" })).isError).toBe(false);
    const refused = await harness.call("create_note", { board: BOARD, content: "셋" });
    expect(refused.isError).toBe(true);
    expect(refused.text).toContain("분당 2회");
    expect(refused.text).toMatch(/\d+초 뒤\(\d{4}-\d{2}-\d{2}T[\d:.]+Z 이후\)/);
    await waitFor(() => harness!.store.stores > 0, { label: "stored" });
    expect((await harness.saved(BOARD)).getMap("notes").size).toBe(5);
  });

  test("a second concurrent request from the same user gets 429 and the slot frees afterwards", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { z } = await import("zod");
    const { defineTool } = await import("../src/mcp.ts");
    const slow = defineTool({
      name: "slow", description: "waits", inputSchema: { n: z.number().optional() },
      async call() {
        await gate;
        return "done";
      },
    });
    harness = await start({ tools: [slow], limits: { maxConcurrentPerUser: 1 } });
    const call = (id: number, token = "good") =>
      harness!.post({ jsonrpc: "2.0", id, method: "tools/call", params: { name: "slow", arguments: {} } }, token);
    const first = call(1);
    await Bun.sleep(100);
    const second = await call(2);
    expect(second.status).toBe(429);
    expect(second.headers.get("retry-after")).toBe("1");
    const otherUser = call(3, "other"); // another user has a slot of their own
    await Bun.sleep(100);
    release();
    expect((await first).status).toBe(200);
    expect((await otherUser).status).toBe(200);
    expect((await call(4)).status).toBe(200);
  });

  test("create_connection joins two notes once, and delete_connection removes it", async () => {
    harness = await start();
    const made = await harness.call("create_connection", { board: BOARD, sourceNoteId: "n-1", targetNoteId: "n-2", label: " 참고  자료 " });
    expect(made.isError).toBe(false);
    const id = idIn(made.text);
    const again = await harness.call("create_connection", { board: BOARD, sourceNoteId: "n-1", targetNoteId: "n-2" });
    expect(again.text).toContain("이미 이어져 있어요");
    expect(idIn(again.text)).toBe(id);
    expect((await harness.call("create_connection", { board: BOARD, sourceNoteId: "n-1", targetNoteId: "n-1" })).isError).toBe(true);
    expect((await harness.call("create_connection", { board: BOARD, sourceNoteId: "n-1", targetNoteId: "ghost" })).isError).toBe(true);

    await waitFor(() => harness!.store.stores > 0, { label: "stored" });
    const connection = (await harness.saved(BOARD)).getMap<Y.Map<unknown>>("connections").get(id)?.toJSON();
    expect(connection).toMatchObject({ sourceNoteId: "n-1", targetNoteId: "n-2", source: "manual", status: "active", label: "참고 자료" });
    expect(connection?.[CLIENT_FIELD]).toBe("claude-test");

    expect((await harness.call("delete_connection", { board: BOARD, id })).isError).toBe(false);
    expect((await harness.call("delete_connection", { board: BOARD, id })).isError).toBe(true);
    await waitFor(() => (harness!.store.stores > 1), { label: "stored again" });
    expect((await harness.saved(BOARD)).getMap("connections").size).toBe(0);
  });

  test("a board the caller is not in is refused and left untouched", async () => {
    harness = await start();
    const before = harness.store.stores;
    for (const [name, args] of [
      ["create_note", { board: FOREIGN, content: "침입" }],
      ["update_note", { board: FOREIGN, id: "n-1", content: "침입" }],
      ["delete_note", { board: FOREIGN, ids: ["n-1"] }],
      ["create_connection", { board: FOREIGN, sourceNoteId: "n-1", targetNoteId: "n-2" }],
      ["delete_connection", { board: FOREIGN, id: "c" }],
      ["upload_attachment", { board: FOREIGN, filename: "a.txt", dataBase64: "aGk=" }],
    ] as const) {
      const reply = await harness.call(name, args);
      expect(reply).toEqual({ isError: true, text: "board not found or not accessible" });
    }
    expect(harness.store.stores).toBe(before);
    expect(noteOf(await harness.saved(FOREIGN), "n-1")?.content).toBe("첫 메모");
  });

  test("a change that would push the board past the size limit is refused up front", async () => {
    harness = await start({ maxDocumentBytes: 600 });
    const reply = await harness.call("create_note", { board: BOARD, content: "작은 메모" });
    expect(reply.isError).toBe(true);
    expect(reply.text).toContain("보드가 가득 차서");
  });
});

describe("upload_attachment", () => {
  const png = Buffer.from("fake-png-bytes").toString("base64");

  test("stores the file on the server and adds a memo whose block resolves through the files map", async () => {
    const uploads: Array<{ userId: string; boardId: string; name: string; type: string; size: number }> = [];
    harness = await start({
      uploadFile: async (userId, boardId, file) => {
        uploads.push({ userId, boardId, name: file.name, type: file.type, size: file.bytes.byteLength });
        return { id: "server-file-1", name: file.name, size: file.bytes.byteLength, contentType: file.type };
      },
    });
    const image = await harness.call("upload_attachment", { board: BOARD, filename: "../고양이 [1].png", dataBase64: png, mimeType: "image/png", caption: "우리 고양이" });
    expect(image.isError).toBe(false);
    const doc = await harness.call("upload_attachment", { board: BOARD, filename: "보고서.pdf", dataBase64: png, mimeType: "application/pdf" });
    expect(doc.isError).toBe(false);
    expect(uploads).toEqual([
      { userId: USER, boardId: BOARD, name: "고양이 [1].png", type: "image/png", size: 14 },
      { userId: USER, boardId: BOARD, name: "보고서.pdf", type: "application/pdf", size: 14 },
    ]);

    await waitFor(() => harness!.store.stores > 0, { label: "stored" });
    const saved = await harness.saved(BOARD);
    const files = saved.getMap<string>("files").toJSON();
    const refs = Object.keys(files);
    expect(refs).toHaveLength(2);
    expect(Object.values(files)).toEqual(["server-file-1", "server-file-1"]);
    expect(refs.every((ref) => ref.startsWith("opfs:mcp-"))).toBe(true);

    // Every block points at a ref the files map resolves.
    const contents = [...saved.getMap<Y.Map<unknown>>("notes").values()].map((map) => String(map.get("content")));
    const imageBlock = contents.find((content) => content.startsWith("![]("))!;
    const imageRef = "opfs:" + /opfs:\/\/([^)]+)\)/.exec(imageBlock)![1];
    expect(refs).toContain(imageRef);
    expect(imageBlock).toEndWith("우리 고양이");
    const fileBlock = contents.find((content) => content.includes('"moss-file"'))!;
    const match = /^\[보고서\.pdf\]\(opfs:\/\/([^)]+) "moss-file"\)$/.exec(fileBlock);
    expect(match).not.toBeNull();
    expect(refs).toContain("opfs:" + match![1]);
  });

  test("refuses bad base64, empty and oversized files before any upload", async () => {
    let uploads = 0;
    harness = await start({
      uploadFile: async () => {
        uploads += 1;
        return { id: "x", name: "x", size: 1, contentType: "x" };
      },
    });
    expect((await harness.call("upload_attachment", { board: BOARD, filename: "a.txt", dataBase64: "not base64!!" })).isError).toBe(true);
    expect((await harness.call("upload_attachment", { board: BOARD, filename: "a.txt", dataBase64: "=" })).isError).toBe(true);
    const tooBig = Buffer.alloc(MAX_ATTACHMENT_BYTES + 1).toString("base64");
    expect((await harness.call("upload_attachment", { board: BOARD, filename: "big.bin", dataBase64: tooBig })).isError).toBe(true);
    expect(uploads).toBe(0);
  });

  test("a quota refusal from the server reaches the agent and no memo is added", async () => {
    harness = await start({
      uploadFile: async () => {
        throw new McpToolError("저장 용량(1GB)을 다 썼어요");
      },
    });
    const reply = await harness.call("upload_attachment", { board: BOARD, filename: "a.png", dataBase64: png, mimeType: "image/png" });
    expect(reply).toEqual({ isError: true, text: "저장 용량(1GB)을 다 썼어요" });
    expect((await harness.saved(BOARD)).getMap("notes").size).toBe(3);
  });

  test("without an uploader the tool says uploads are unavailable", async () => {
    harness = await start();
    const reply = await harness.call("upload_attachment", { board: BOARD, filename: "a.png", dataBase64: png });
    expect(reply.isError).toBe(true);
    expect(reply.text).toContain("not available");
  });
});
