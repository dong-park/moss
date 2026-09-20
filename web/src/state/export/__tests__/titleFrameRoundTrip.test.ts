import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDB, resetDB } from "@/state/db/schema";
import { encodeFrameContent } from "@/state/frameContent";
import { exportMossBundle } from "../mossBundleExport";
import { importMossBundle } from "../mossBundleImport";

beforeEach(async () => {
  await resetDB();
});

afterEach(async () => {
  await resetDB();
});

describe("제목·소속 왕복 (spec §10)", () => {
  it("판 있음·판 없음·지워진 판 frameId", async () => {
    const db = getDB();
    await db.open();
    const boardId = "b1";
    await db.boards.put({
      id: boardId,
      name: "B",
      isSystem: false,
      createdAt: 1,
      updatedAt: 1,
      lastOpenedAt: 1,
    });
    await db.notes.bulkPut([
      {
        id: "with-frame",
        boardId,
        kind: "text",
        x: 0,
        y: 0,
        width: 240,
        rotation: 0,
        content: "a",
        frameId: "missing-frame",
        aiOptOut: false,
        createdAt: 1,
        updatedAt: 1,
        lastVisitedAt: 1,
      },
      {
        id: "no-frame",
        boardId,
        kind: "text",
        x: 0,
        y: 0,
        width: 240,
        rotation: 0,
        content: "b",
        aiOptOut: false,
        createdAt: 2,
        updatedAt: 2,
        lastVisitedAt: 2,
      },
      {
        id: "real-frame",
        boardId,
        kind: "frame",
        x: 0,
        y: 0,
        width: 300,
        height: 200,
        rotation: 0,
        content: encodeFrameContent("Real"),
        aiOptOut: false,
        createdAt: 3,
        updatedAt: 3,
        lastVisitedAt: 3,
      },
      {
        id: "in-frame",
        boardId,
        kind: "text",
        x: 0,
        y: 0,
        width: 240,
        rotation: 0,
        content: "c",
        frameId: "real-frame",
        aiOptOut: false,
        createdAt: 4,
        updatedAt: 4,
        lastVisitedAt: 4,
      },
    ]);

    const exported = await exportMossBundle({ scope: "all" });
    await resetDB();
    const report = await importMossBundle(exported!.blob, "overwrite");

    expect(report.unlinkedFrameRefs).toBe(1);
    const withFrame = await getDB().notes.get("with-frame");
    const inFrame = await getDB().notes.get("in-frame");
    const noFrame = await getDB().notes.get("no-frame");

    expect(withFrame?.frameId).toBeUndefined();
    expect(inFrame?.frameId).toBe("real-frame");
    expect(noFrame?.frameId).toBeUndefined();
  });
});
