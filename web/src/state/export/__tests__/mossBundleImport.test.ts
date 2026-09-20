import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDB, resetDB } from "@/state/db/schema";
import { encodeFrameContent } from "@/state/frameContent";
import { exportMossBundle } from "../mossBundleExport";
import {
  ImportRejectedError,
  importMossBundle,
  peekMossManifest,
} from "../mossBundleImport";
import { CURRENT_SCHEMA_VERSION } from "../legacyKinds";

beforeEach(async () => {
  await resetDB();
});

afterEach(async () => {
  await resetDB();
});

async function seedRoundTripData() {
  const db = getDB();
  await db.open();
  const boardId = "b1";
  await db.boards.put({
    id: boardId,
    name: "Board",
    isSystem: false,
    createdAt: 1,
    updatedAt: 1,
    lastOpenedAt: 1,
  });
  const frameId = "f1";
  await db.notes.bulkPut([
    {
      id: frameId,
      boardId,
      kind: "frame",
      x: 0,
      y: 0,
      width: 300,
      height: 200,
      rotation: 0,
      content: encodeFrameContent("판A"),
      aiOptOut: false,
      createdAt: 1,
      updatedAt: 1,
      lastVisitedAt: 1,
    },
    {
      id: "titled",
      boardId,
      kind: "text",
      x: 10,
      y: 10,
      width: 240,
      rotation: 0,
      content: "본문",
      title: "제목있음",
      frameId,
      overlay: JSON.stringify({ paths: [[{ x: 5, y: 6 }]] }),
      aiOptOut: false,
      createdAt: 2,
      updatedAt: 2,
      lastVisitedAt: 2,
    },
    {
      id: "untitled",
      boardId,
      kind: "text",
      x: 20,
      y: 20,
      width: 240,
      rotation: 0,
      content: "본문2",
      aiOptOut: false,
      createdAt: 3,
      updatedAt: 3,
      lastVisitedAt: 3,
    },
  ]);
}

describe("importMossBundle", () => {
  it("v4 번들 거부 — DB 변경 없음", async () => {
    const db = getDB();
    await db.open();
    await db.notes.put({
      id: "keep",
      boardId: null,
      kind: "text",
      x: 0,
      y: 0,
      width: 240,
      rotation: 0,
      content: "stay",
      aiOptOut: false,
      createdAt: 1,
      updatedAt: 1,
      lastVisitedAt: 1,
    });

    const zip = new JSZip();
    zip.file(
      "manifest.json",
      JSON.stringify({
        version: "1.1",
        exportedAt: 1,
        schemaVersion: 4,
        counts: { notes: 0, frames: 0, boards: 0, connections: 0, embeddings: 0 },
        scope: "all",
      }),
    );
    zip.file("notes.json", "[]");
    const blob = await zip.generateAsync({ type: "blob" });

    const peek = await peekMossManifest(blob);
    expect(peek.ok).toBe(false);

    await expect(importMossBundle(blob, "overwrite")).rejects.toBeInstanceOf(
      ImportRejectedError,
    );
    expect(await db.notes.get("keep")).toBeTruthy();
  });

  it("옛 종류 섞인 번들 — DB에 legacy kind 0개", async () => {
    const zip = new JSZip();
    zip.file(
      "manifest.json",
      JSON.stringify({
        version: "1.1",
        exportedAt: 1,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        counts: { notes: 3, frames: 0, boards: 0, connections: 0, embeddings: 0 },
        scope: "all",
      }),
    );
    const now = Date.now();
    zip.file(
      "notes.json",
      JSON.stringify([
        {
          id: "ok",
          boardId: null,
          kind: "text",
          x: 0,
          y: 0,
          width: 240,
          rotation: 0,
          content: "good",
          aiOptOut: false,
          createdAt: now,
          updatedAt: now,
          lastVisitedAt: now,
        },
        {
          id: "img",
          boardId: null,
          kind: "image",
          x: 0,
          y: 0,
          width: 240,
          rotation: 0,
          content: "",
          aiOptOut: false,
          createdAt: now,
          updatedAt: now,
          lastVisitedAt: now,
        },
        {
          id: "mm",
          boardId: null,
          kind: "mindmap",
          x: 0,
          y: 0,
          width: 240,
          rotation: 0,
          content: "",
          aiOptOut: false,
          createdAt: now,
          updatedAt: now,
          lastVisitedAt: now,
        },
      ]),
    );
    zip.file("boards.json", "[]");
    const blob = await zip.generateAsync({ type: "blob" });

    const report = await importMossBundle(blob, "overwrite");
    expect(report.imported.notes).toBe(1);
    expect(report.skippedLegacyKind).toEqual(
      expect.arrayContaining([
        { kind: "image", count: 1 },
        { kind: "mindmap", count: 1 },
      ]),
    );

    const db = getDB();
    const kinds = (await db.notes.toArray()).map((n) => n.kind);
    expect(kinds).not.toContain("image");
    expect(kinds).not.toContain("mindmap");
  });

  it("overwrite round-trip — 제목·frame·overlay 보존 (AC-8/9)", async () => {
    await seedRoundTripData();
    const exported = await exportMossBundle({ scope: "all" });
    expect(exported).not.toBeNull();
    await resetDB();
    await importMossBundle(exported!.blob, "overwrite");

    const db = getDB();
    const titled = await db.notes.get("titled");
    const untitled = await db.notes.get("untitled");
    const frame = await db.notes.get("f1");

    expect(titled?.title).toBe("제목있음");
    expect(untitled?.title).toBeUndefined();
    expect(titled?.frameId).toBe("f1");
    expect(titled?.overlay).toContain("paths");
    expect(frame?.content).toBe(encodeFrameContent("판A"));
  });

  it("제목 normalize — 80자 초과·줄바꿈", async () => {
    const zip = new JSZip();
    zip.file(
      "manifest.json",
      JSON.stringify({
        version: "1.1",
        exportedAt: 1,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        counts: { notes: 1, frames: 0, boards: 0, connections: 0, embeddings: 0 },
        scope: "all",
      }),
    );
    const now = Date.now();
    zip.file(
      "notes.json",
      JSON.stringify([
        {
          id: "long",
          boardId: null,
          kind: "text",
          x: 0,
          y: 0,
          width: 240,
          rotation: 0,
          content: "x",
          title: "  " + "가".repeat(90) + "\n줄",
          aiOptOut: false,
          createdAt: now,
          updatedAt: now,
          lastVisitedAt: now,
        },
      ]),
    );
    const blob = await zip.generateAsync({ type: "blob" });
    await importMossBundle(blob, "overwrite");
    const note = await getDB().notes.get("long");
    expect(note?.title!.length).toBeLessThanOrEqual(80);
    expect(note?.title).not.toContain("\n");
    expect(note?.title?.startsWith("가")).toBe(true);
  });
});
