import { afterEach, describe, expect, test } from "bun:test";
import * as Y from "yjs";
import { SUPPORTED_PROTOCOL_VERSIONS } from "@modelcontextprotocol/sdk/types.js";
import { defineReadTool, type McpBoardInfo } from "../src/mcp.ts";
import { MAX_LISTED_BOARDS } from "../src/mcpBoards.ts";
import { MAX_READ_CHARS, readTools, renderBoard, viewBoard } from "../src/mcpReadTools.ts";
import { putNote, startMcp, type McpHarness } from "./mcpHarness.ts";
import pkg from "../package.json" with { type: "json" };

/** Read-path limits from the n5 review: search budget, no repeated membership questions, list cap, bounded rendering. */

const boardInfo = (id: string, name: string): McpBoardInfo => ({ id, name, parentId: null, role: "owner" });

function docWith(name: string, text: string, notes = 1): Y.Doc {
  const doc = new Y.Doc();
  doc.getMap("meta").set("name", name);
  for (let i = 0; i < notes; i += 1) {
    putNote(doc, { id: name + "-" + i, kind: "text", x: i * 10, y: 0, width: 100, content: text, createdAt: i });
  }
  return doc;
}

let harness: McpHarness | undefined;
afterEach(async () => {
  await harness?.stop();
  harness = undefined;
});

describe("search", () => {
  const ids = ["b-aaaa0001", "b-bbbb0002", "b-cccc0003"];
  const filler = "계란 ".repeat(400);

  test("stops reading snapshots once its byte budget is reached and says where it stopped", async () => {
    const docs = Object.fromEntries(ids.map((id, i) => [id, docWith("보드" + i, filler, 5)]));
    const oneSnapshot = Y.encodeStateAsUpdate(docs[ids[0]!]!).byteLength;
    harness = await startMcp({
      tools: readTools, docs, members: ids, boards: ids.map((id, i) => boardInfo(id, "보드" + i)),
      limits: { maxSearchSnapshotBytes: Math.floor(oneSnapshot * 1.5) },
    });
    const reply = await harness.call("search", { query: "계란" });
    expect(reply.isError).toBe(false);
    expect(reply.text).toContain("보드0");
    expect(reply.text).not.toContain("보드2");
    expect(reply.text).toContain("에 닿아 여기서 멈췄어요");
    // The board that did not fit was fetched once; the one after it never was.
    expect(harness.store.fetches).toBe(2);
  });

  test("boards that the list already proved are not checked for membership again", async () => {
    const docs = Object.fromEntries(ids.map((id, i) => [id, docWith("보드" + i, "계란")]));
    harness = await startMcp({ tools: readTools, docs, members: ids, boards: ids.map((id, i) => boardInfo(id, "보드" + i)) });
    const reply = await harness.call("search", { query: "계란" });
    expect(reply.text).toContain("찾은 곳 3건");
    expect(harness.memberChecks.count).toBe(0);
    expect(harness.listCalls.count).toBe(1);
  });

  test("a named board is judged by membership, not by the list", async () => {
    // The list is empty (as if the board were past the list cap), yet the member can search it.
    harness = await startMcp({ tools: readTools, docs: { [ids[0]!]: docWith("보드0", "계란") }, members: [ids[0]!], boards: [] });
    expect((await harness.call("search", { query: "계란", board: ids[0] })).text).toContain("찾은 곳 1건");
    expect(harness.listCalls.count).toBe(0);
    harness.members.delete(ids[0]!);
    expect((await harness.call("search", { query: "계란", board: ids[0] })).isError).toBe(true);
  });
});

describe("read_board", () => {
  test("takes the name from the board document and runs no board list query", async () => {
    harness = await startMcp({ tools: readTools, docs: { "b-named001": docWith("문서 안 이름", "내용") }, members: ["b-named001"], boards: [] });
    const reply = await harness.call("read_board", { board: "b-named001" });
    expect(reply.text).toContain("# 문서 안 이름 (b-named001)");
    expect(harness.listCalls.count).toBe(0);
  });

  test("stops adding notes once the reply is full, and keeps connections out of the cut", () => {
    const doc = new Y.Doc();
    for (let i = 0; i < 60; i += 1) putNote(doc, { id: "n" + i, kind: "text", x: 0, y: 0, width: 10, content: "가".repeat(5000), createdAt: i });
    const text = renderBoard("b-big00001", viewBoard(doc, "큰 보드"), new Map());
    expect(text.length).toBeLessThanOrEqual(MAX_READ_CHARS + 300);
    const shown = (text.match(/^### /gm) ?? []).length;
    expect(shown).toBeGreaterThan(10);
    expect(shown).toBeLessThan(60);
    expect(text).toContain("메모 " + shown + "개까지만 보여요");
    expect(text).not.toContain("[n" + (shown + 5) + "]");
  });

  test("one note longer than the whole reply is cut short, not dropped", () => {
    const doc = new Y.Doc();
    putNote(doc, { id: "huge", kind: "text", x: 0, y: 0, width: 10, content: "나".repeat(MAX_READ_CHARS * 2), createdAt: 1 });
    const text = renderBoard("b-huge0001", viewBoard(doc, "하나"), new Map());
    expect(text).toContain("### ");
    expect(text.length).toBeLessThanOrEqual(MAX_READ_CHARS + 300);
  });
});

describe("list_boards", () => {
  test("says so when the list was cut", async () => {
    const boards = Array.from({ length: MAX_LISTED_BOARDS + 1 }, (_, i) => boardInfo("b-many" + String(i).padStart(4, "0"), "보드 " + String(i).padStart(4, "0")));
    harness = await startMcp({ tools: readTools, members: boards.map((b) => b.id), boards });
    const reply = await harness.call("list_boards", {});
    expect(reply.text).toContain("보드 " + MAX_LISTED_BOARDS + "개 (이름순 앞쪽만)");
    expect(reply.text).toContain("더 있지만 앞 " + MAX_LISTED_BOARDS + "개만 보여요");
    expect(reply.text).not.toContain("b-many" + String(MAX_LISTED_BOARDS).padStart(4, "0"));
  });

  test("a short list carries no notice", async () => {
    harness = await startMcp({ tools: readTools, members: ["b-one00001"], boards: [boardInfo("b-one00001", "하나")] });
    const reply = await harness.call("list_boards", {});
    expect(reply.text).not.toContain("앞쪽만");
  });
});

describe("tool contexts", () => {
  test("a read tool cannot reach withBoard (checked by the compiler)", () => {
    defineReadTool({
      name: "typed", description: "d", inputSchema: {},
      async call(_args, context) {
        // @ts-expect-error read tools get no way to open a board for writing
        void context.withBoard;
        return "";
      },
    });
  });
});

describe("SDK pin", () => {
  test("the SDK version is exact and the protocol versions it speaks are the ones we tested", () => {
    expect(pkg.dependencies["@modelcontextprotocol/sdk"]).toMatch(/^\d+\.\d+\.\d+$/);
    expect([...SUPPORTED_PROTOCOL_VERSIONS]).toEqual(["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05", "2024-10-07"]);
  });
});
