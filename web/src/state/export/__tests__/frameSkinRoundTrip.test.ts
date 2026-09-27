import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDB, resetDB } from "@/state/db/schema";
import { decodeFrameConfig, encodeFrameContent } from "@/state/frameContent";
import { exportMossBundle } from "../mossBundleExport";
import { importMossBundle } from "../mossBundleImport";

beforeEach(async () => {
  await resetDB();
});

afterEach(async () => {
  await resetDB();
});

describe("AC-12: 세로 칸 판 번들 왕복", () => {
  it("스킨·칸 이름·칸 순서가 그대로 돌아온다", async () => {
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
    const cfg = decodeFrameConfig(note!.content);
    expect(cfg.skin).toBe("columns");
    expect(cfg.name).toBe("생각 칸");
    expect(cfg.columns.map((c) => c.name)).toEqual(["씨앗", "", "묵힘"]);
    expect(cfg.columns.map((c) => c.id)).toEqual(["c0", "c1", "c2"]);
  });
});
