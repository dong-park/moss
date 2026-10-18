import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDB, resetDB } from "@/state/db/schema";
import type { Note } from "@/state/db/schema";
import { encodeFrameContent } from "@/state/frameContent";

const store = new Map<string, Blob>();
vi.mock("@/state/db/opfs", async (orig) => {
  const actual = await orig<typeof import("@/state/db/opfs")>();
  const name = (r: string) => (r.startsWith("opfs:") ? r.slice(5) : r);
  return {
    ...actual,
    getBlob: async (ref: string) => store.get(name(ref)) ?? null,
    putBlob: async (f: string, b: Blob) => {
      store.set(f, b);
      return "opfs:" + f;
    },
  };
});

import { exportMossBundle } from "../mossBundleExport";
import { importMossBundle } from "../mossBundleImport";
import { exportJsonCanvasZip } from "../jsonCanvasExport";
import { exportMarkdownZip } from "../markdownExport";
import { collectAttachments } from "../attachments";

const REF = "opfs:bg1.png";

function frame(partial: Partial<Note> = {}): Note {
  return {
    id: "f1",
    boardId: "b1",
    kind: "frame",
    x: 0,
    y: 0,
    width: 400,
    height: 300,
    rotation: 0,
    content: encodeFrameContent({ name: "회고", bg: { w: 800, h: 600 } }),
    attachmentRef: REF,
    mediaType: "image/png",
    aiOptOut: false,
    createdAt: 1,
    updatedAt: 1,
    lastVisitedAt: 1,
    ...partial,
  };
}

const board = { id: "b1", name: "B", isSystem: false, createdAt: 1, updatedAt: 1, lastOpenedAt: 1 };

beforeEach(async () => {
  store.clear();
  await resetDB();
});
afterEach(async () => {
  await resetDB();
});

describe("판 배경 내보내기", () => {
  it("moss 번들 왕복 — ref·bg 크기·파일이 그대로", async () => {
    const db = getDB();
    await db.open();
    await db.boards.put(board);
    await db.notes.put(frame());
    store.set("bg1.png", new Blob(["img"], { type: "image/png" }));

    const out = await exportMossBundle({ scope: "all" });
    expect(out!.manifest.missingAttachments ?? []).toEqual([]);

    await db.notes.clear();
    store.clear();
    await importMossBundle(out!.blob, "overwrite");

    const back = (await db.notes.toArray()).find((n) => n.kind === "frame")!;
    expect(back.attachmentRef).toBe(REF);
    expect(JSON.parse(back.content).bg).toEqual({ w: 800, h: 600 });
    expect(store.has("bg1.png")).toBe(true);
  });

  it("배경 파일이 없으면 멈추지 않고 누락 목록에 오른다", async () => {
    const { attachments, missingAttachments } = await collectAttachments([frame()]);
    expect(attachments.size).toBe(0);
    expect(missingAttachments).toEqual([REF]);
    const blob = await exportJsonCanvasZip([frame()], [board], [], attachments);
    const zip = await JSZip.loadAsync(blob);
    const doc = JSON.parse(await zip.file(/\.canvas$/)[0]!.async("string"));
    expect(doc.nodes[0].background).toBeUndefined();
  });

  it("제이슨 캔버스 group에 background·backgroundStyle", async () => {
    const atts = new Map([[REF, new Blob(["img"])]]);
    const zip = await JSZip.loadAsync(await exportJsonCanvasZip([frame()], [board], [], atts));
    const doc = JSON.parse(await zip.file(/\.canvas$/)[0]!.async("string"));
    expect(doc.nodes[0]).toMatchObject({
      type: "group",
      label: "회고",
      background: "attachments/bg1.png",
      backgroundStyle: "ratio",
    });
    expect(zip.file("attachments/bg1.png")).toBeTruthy();
  });

  it("마크다운은 판 이름 폴더에 _background.png를 둔다", async () => {
    const atts = new Map([[REF, new Blob(["img"])]]);
    const zip = await JSZip.loadAsync(await exportMarkdownZip([frame()], [board], atts));
    expect(zip.file("B/회고/_background.png")).toBeTruthy();
  });

  it("이름이 같은 판 둘의 배경은 서로 덮어쓰지 않는다", async () => {
    const atts = new Map([
      ["opfs:bg1.png", new Blob(["one"])],
      ["opfs:bg2.png", new Blob(["two"])],
    ]);
    const a = frame({ id: "fa0001", attachmentRef: "opfs:bg1.png" });
    const b = frame({ id: "fb0002", attachmentRef: "opfs:bg2.png" });
    const zip = await JSZip.loadAsync(await exportMarkdownZip([a, b], [board], atts));
    const bgs = Object.keys(zip.files).filter((n) => n.includes("_background"));
    expect(bgs).toHaveLength(2);
    const bodies = await Promise.all(bgs.map((n) => zip.file(n)!.async("string")));
    expect(bodies.sort()).toEqual(["one", "two"]);
  });
});

