import { afterEach, expect, it, vi } from "vitest";
import { useWorkspace, flushAll } from "@/state/workspace";
import { useStorage } from "@/state/storage";
import { getDB, resetDB } from "@/state/db/schema";
import { destroyBoardDocs, getActiveBoardDoc } from "@/state/ydoc/activeDoc";
import { readNote } from "@/state/ydoc/model";

afterEach(async () => {
  await flushAll();
  await destroyBoardDocs();
  await resetDB();
  vi.restoreAllMocks();
  useStorage.setState({ initialized: false });
  useWorkspace.setState({ cards: [], currentBoardId: undefined, bootstrapComplete: false });
});
it("read/select/open/close, unchanged editor callbacks and measured dimensions preserve content and updatedAt", async () => {
  await useStorage.getState().init();
  await useWorkspace.getState().loadFromStorage();
  const ws = () => useWorkspace.getState();
  const id = ws().addCardAt("textbox", 0, 0);
  ws().setContent(id, "original");
  await flushAll();
  const before = readNote(getActiveBoardDoc()!.doc, id)!;
  const mirrorBefore = await getDB().notes.get(id);
  await new Promise((r) => setTimeout(r, 10));
  ws().selectOne(id);
  ws().setExpandedCard(id, "read");
  ws().setExpandedCard(null);
  ws().setContent(id, "original");
  ws().setTitle(id, before.title ?? "");
  ws().setTextMeasuredWidth(id, 377);
  ws().setFaceHeight(id, 99);
  await flushAll();
  const after = readNote(getActiveBoardDoc()!.doc, id)!;
  const mirror = await getDB().notes.get(id);
  expect(after.content).toBe(before.content);
  expect(after.title).toBe(before.title);
  expect(after.updatedAt).toBe(before.updatedAt);
  expect(mirror?.updatedAt).toBe(mirrorBefore?.updatedAt);
  expect(ws().cards.find((c) => c.id === id)?.width).toBe(377);
  ws().setContent(id, "actual edit");
  await flushAll();
  expect(readNote(getActiveBoardDoc()!.doc, id)?.updatedAt).toBeGreaterThan(before.updatedAt);
  expect((await getDB().notes.get(id))?.content).toBe("actual edit");
});

it("closing a general memo before debounce keeps the latest edit and restores it from the source document", async () => {
  await useStorage.getState().init();
  await useWorkspace.getState().loadFromStorage();
  const ws = () => useWorkspace.getState();
  const id = ws().addCardAt("text", 0, 0);
  ws().setExpandedCard(id, "edit");
  ws().setContent(id, "latest text before close");
  ws().setExpandedCard(null);
  expect(ws().cards.find((c) => c.id === id)?.content).toBe("latest text before close");
  await flushAll();
  expect((await getDB().notes.get(id))?.content).toBe("latest text before close");
  const { openBoardDoc } = await import("@/state/ydoc/doc");
  const boardId = getActiveBoardDoc()!.boardId;
  await destroyBoardDocs();
  const reloaded = openBoardDoc(boardId);
  try {
    await reloaded.whenLoaded;
    expect(readNote(reloaded.doc, id)?.content).toBe("latest text before close");
  } finally { await reloaded.destroy(); }
});
