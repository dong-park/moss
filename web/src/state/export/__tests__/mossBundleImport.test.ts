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
import { SYSTEM_BOARD_ID } from "@/state/workspace";

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

function makeBoardRow(id: unknown) {
  return {
    id,
    name: "Board",
    isSystem: false,
    createdAt: 1,
    updatedAt: 1,
    lastOpenedAt: 1,
  };
}

async function makeBundle(opts: {
  notes?: unknown[];
  boards?: unknown[];
  settings?: unknown;
}): Promise<Blob> {
  const zip = new JSZip();
  zip.file(
    "manifest.json",
    JSON.stringify({
      version: "1.1",
      exportedAt: 1,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      counts: {
        notes: opts.notes?.length ?? 0,
        frames: 0,
        boards: opts.boards?.length ?? 0,
        connections: 0,
        embeddings: 0,
      },
      scope: "all",
    }),
  );
  zip.file("notes.json", JSON.stringify(opts.notes ?? []));
  zip.file("boards.json", JSON.stringify(opts.boards ?? []));
  if (opts.settings !== undefined) {
    zip.file("settings.json", JSON.stringify(opts.settings));
  }
  return zip.generateAsync({ type: "blob" });
}

async function expectRejected(blob: Blob): Promise<ImportRejectedError> {
  const err = await importMossBundle(blob, "overwrite").catch((e) => e);
  expect(err).toBeInstanceOf(ImportRejectedError);
  return err as ImportRejectedError;
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

  it("P1-6 · boards.json 의 시스템 보드 id·중복 id·비문자열 id 를 거부한다", async () => {
    const system = await expectRejected(
      await makeBundle({ boards: [makeBoardRow(SYSTEM_BOARD_ID)] }),
    );
    expect(system.reason).toBe("invalid_structure");

    const dup = await expectRejected(
      await makeBundle({ boards: [makeBoardRow("b1"), makeBoardRow("b1")] }),
    );
    expect(dup.reason).toBe("invalid_structure");

    const badType = await expectRejected(
      await makeBundle({ boards: [makeBoardRow(1)] }),
    );
    expect(badType.reason).toBe("invalid_structure");
  });

  it("P2-7 · 가져온 settings.json 의 이전 이력은 버리고 사용자 설정만 반영한다", async () => {
    const blob = await makeBundle({
      settings: {
        id: "singleton",
        aiOptOutGlobal: true,
        persistGranted: null,
        storageQuotaShown: { at80: false, at95: false },
        uiLocale: "ko",
        installPromptShown: true,
        migratedDocs: ["leak"],
        migrationFailures: { leak: 3 },
        dexieMigrationVersion: 1,
      },
    });

    await importMossBundle(blob, "overwrite");

    const s = await getDB().settings.get("singleton");
    expect(s?.aiOptOutGlobal).toBe(true);
    expect(s?.installPromptShown).toBe(true);
    expect(s?.migratedDocs).toBeUndefined();
    expect(s?.migrationFailures).toBeUndefined();
    expect(s?.dexieMigrationVersion).toBeUndefined();
  });

  // 다른 테스트의 settings 단언과 섞이지 않게 파일 마지막에 둔다 — overwrite 가져오기가
  // 백그라운드 로드(loadFromStorage)를 깨워 settings를 늦게 덮을 수 있다.
  it("P0 · 시스템 보드 행이 있어도 all 내보내기→가져오기 왕복이 성공한다", async () => {
    await seedRoundTripData();
    // 시스템 보드 행 + 시스템 메모가 든 DB를 만든다 — 가져오기 경계가 이 행을 거부했다.
    const db = getDB();
    await db.boards.put({
      id: SYSTEM_BOARD_ID,
      name: "",
      isSystem: true,
      createdAt: 1,
      updatedAt: 1,
      lastOpenedAt: 100,
    });
    await db.notes.put({
      id: "sys1",
      boardId: SYSTEM_BOARD_ID,
      kind: "text",
      x: 0,
      y: 0,
      width: 240,
      rotation: 0,
      content: "시스템 메모",
      aiOptOut: false,
      createdAt: 1,
      updatedAt: 1,
      lastVisitedAt: 1,
    });

    const exported = await exportMossBundle({ scope: "all" });
    expect(exported).not.toBeNull();

    const zip = await JSZip.loadAsync(exported!.blob);
    const boardsJson = JSON.parse(
      await zip.file("boards.json")!.async("string"),
    ) as { id: string }[];
    expect(boardsJson.some((b) => b.id === SYSTEM_BOARD_ID)).toBe(false);

    await resetDB();
    const report = await importMossBundle(exported!.blob, "overwrite");
    expect(report.imported.notes).toBeGreaterThan(0);
    expect(await getDB().notes.get("sys1")).toBeTruthy();
  });
});
