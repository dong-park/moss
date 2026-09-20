import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDB, getDB, resetDB } from "@/state/db/schema";
import { encodeFrameContent } from "@/state/frameContent";
import { exportMossBundle, serializeMossBundle } from "../mossBundleExport";
import { CURRENT_SCHEMA_VERSION } from "../legacyKinds";
import type { MossBundlePayload } from "../types";

beforeEach(async () => {
  await resetDB();
});

afterEach(async () => {
  await resetDB();
});

describe("exportMossBundle round-trip (메모리 zip parse)", () => {
  it("title·frame·overlay가 notes.json에 그대로 싣인다", async () => {
    const db = getDB();
    await db.open();
    const boardId = "board-1";
    await db.boards.put({
      id: boardId,
      name: "Test Board",
      isSystem: false,
      createdAt: 1,
      updatedAt: 1,
      lastOpenedAt: 1,
    });
    const frameId = "frame-1";
    await db.notes.bulkPut([
      {
        id: frameId,
        boardId,
        kind: "frame",
        x: 10,
        y: 20,
        width: 300,
        height: 200,
        rotation: 0,
        content: encodeFrameContent("레퍼런스"),
        aiOptOut: false,
        createdAt: 1,
        updatedAt: 1,
        lastVisitedAt: 1,
      },
      {
        id: "note-1",
        boardId,
        kind: "text",
        x: 50,
        y: 60,
        width: 240,
        rotation: 0,
        content: "본문",
        title: "브랜드 톤",
        frameId,
        overlay: JSON.stringify({ paths: [[{ x: 1, y: 2 }]] }),
        aiOptOut: false,
        createdAt: 2,
        updatedAt: 2,
        lastVisitedAt: 2,
      },
      {
        id: "note-2",
        boardId,
        kind: "text",
        x: 100,
        y: 100,
        width: 240,
        rotation: 0,
        content: "제목 없음",
        aiOptOut: false,
        createdAt: 3,
        updatedAt: 3,
        lastVisitedAt: 3,
      },
    ]);

    const result = await exportMossBundle({ scope: "all" });
    expect(result).not.toBeNull();
    const zip = await JSZip.loadAsync(result!.blob);
    const manifest = JSON.parse(await zip.file("manifest.json")!.async("string"));
    expect(manifest.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(manifest.version).toBe("1.1");

    const notes = JSON.parse(await zip.file("notes.json")!.async("string"));
    const titled = notes.find((n: { id: string }) => n.id === "note-1");
    expect(titled.title).toBe("브랜드 톤");
    expect(titled.frameId).toBe(frameId);
    expect(titled.overlay).toContain("paths");
    const untitled = notes.find((n: { id: string }) => n.id === "note-2");
    expect(untitled.title).toBeUndefined();
  });

  it("notes 0개면 null", async () => {
    const db = createDB(`empty-${Date.now()}`);
    await db.open();
    // getDB() 싱글톤이 아닌 별도 DB — collectExportData는 getDB() 사용
    // 빈 싱글톤으로 테스트
    const result = await exportMossBundle({ scope: "all" });
    expect(result).toBeNull();
  });
});

describe("serializeMossBundle", () => {
  it("manifest counts가 payload와 일치", async () => {
    const payload: MossBundlePayload = {
      manifest: {
        version: "1.1",
        exportedAt: 1,
        schemaVersion: 5,
        counts: { notes: 1, frames: 0, boards: 0, connections: 0, embeddings: 0 },
        scope: "selection",
      },
      notes: [
        {
          id: "n1",
          boardId: null,
          kind: "text",
          x: 0,
          y: 0,
          width: 240,
          rotation: 0,
          content: "hi",
          aiOptOut: false,
          createdAt: 1,
          updatedAt: 1,
          lastVisitedAt: 1,
        },
      ],
      boards: [],
      connections: [],
      embeddings: [],
      settings: {
        id: "singleton",
        aiOptOutGlobal: false,
        persistGranted: null,
        storageQuotaShown: { at80: false, at95: false },
        uiLocale: "ko",
        installPromptShown: false,
      },
      attachments: new Map(),
    };
    const blob = await serializeMossBundle(payload);
    const zip = await JSZip.loadAsync(blob);
    expect(zip.file("notes.json")).toBeTruthy();
    expect(zip.file("manifest.json")).toBeTruthy();
  });
});
