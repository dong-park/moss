import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDB, resetDB } from "@/state/db/schema";
import { decodeFrameConfig, encodeFrameContent, readFrameContent } from "@/state/frameContent";
import { exportMossBundle } from "../mossBundleExport";
import { importMossBundle } from "../mossBundleImport";

beforeEach(async () => {
  await resetDB();
});

afterEach(async () => {
  await resetDB();
});

describe("옛 세로 칸 판 번들 왕복 (T6)", () => {
  it("skin·칸 이름·칸 순서가 그대로 돌아온다", async () => {
    const db = getDB();
    await db.open();
    await db.boards.put({
      id: "b1",
      name: "B",
      isSystem: false,
      createdAt: 1,
      updatedAt: 1,
      lastOpenedAt: 1,
    });
    const content = encodeFrameContent({
      name: "생각 칸",
      skin: "columns",
      columns: [
        { id: "c0", name: "씨앗" },
        { id: "c1", name: "" },
        { id: "c2", name: "묵힘" },
      ],
    });
    await db.notes.put({
      id: "frame-1",
      boardId: "b1",
      kind: "frame",
      x: 10,
      y: 20,
      width: 720,
      height: 220,
      rotation: 0,
      content,
      aiOptOut: false,
      createdAt: 1,
      updatedAt: 1,
      lastVisitedAt: 1,
    });

    const exported = await exportMossBundle({ scope: "all" });
    await resetDB();
    await importMossBundle(exported!.blob, "overwrite");

    const note = await getDB().notes.get("frame-1");
    expect(decodeFrameConfig(note!.content)).toEqual({ name: "생각 칸" });
    const raw = readFrameContent(note!.content);
    expect(raw.skin).toBe("columns");
    expect(raw.columns).toEqual([
      { id: "c0", name: "씨앗" },
      { id: "c1", name: "" },
      { id: "c2", name: "묵힘" },
    ]);
  });
});
