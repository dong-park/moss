import { afterEach, expect, it, vi } from "vitest";
import { openBoardDoc, boardDocName, type BoardDocHandle } from "@/state/ydoc/doc";
import { clearDocument } from "y-indexeddb";
import { useSaveFeedback, boardSavePhase, retryBoardSave } from "@/state/saveFeedback";

const handles: BoardDocHandle[] = [];
const ids: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const h of handles.splice(0)) await h.destroy();
  for (const id of ids.splice(0)) await clearDocument(boardDocName(id));
  useSaveFeedback.setState({ boards: {} });
});
function open() {
  const id = `save-${crypto.randomUUID()}`;
  ids.push(id);
  const h = openBoardDoc(id);
  handles.push(h);
  return h;
}
function phase(id: string) { return boardSavePhase(useSaveFeedback.getState().boards[id]); }

it("reports saved only after the actual update transaction commits, then reloads the latest edit", async () => {
  const h = open();
  expect(phase(h.boardId)).toBe("saving");
  await h.whenLoaded;
  await vi.waitFor(() => expect(phase(h.boardId)).toBe("saved"));
  h.doc.getMap("test").set("text", "latest edit");
  expect(phase(h.boardId)).toBe("saving");
  await vi.waitFor(() => expect(phase(h.boardId)).toBe("saved"));
  const reloaded = openBoardDoc(h.boardId);
  handles.push(reloaded);
  await reloaded.whenLoaded;
  expect(reloaded.doc.getMap("test").get("text")).toBe("latest edit");
});

it("an aborted real IDB write stays failed after later delta commits; retry persists the current full snapshot", async () => {
  const h = open();
  await h.whenLoaded;
  await vi.waitFor(() => expect(phase(h.boardId)).toBe("saved"));
  const db = h.persistence.db!;
  const transaction = db.transaction.bind(db);
  const spy = vi.spyOn(db, "transaction").mockImplementationOnce((...args: Parameters<typeof db.transaction>) => {
    const tx = transaction(...args);
    queueMicrotask(() => tx.abort());
    return tx;
  });
  h.doc.getMap("test").set("first", "preserve me");
  await vi.waitFor(() => expect(phase(h.boardId)).toBe("error"));
  spy.mockRestore();
  h.doc.getMap("test").set("second", "newer edit");
  await new Promise((r) => setTimeout(r, 30));
  expect(phase(h.boardId)).toBe("error");
  await retryBoardSave(h.boardId);
  expect(phase(h.boardId)).toBe("saved");
  const reloaded = openBoardDoc(h.boardId);
  handles.push(reloaded);
  await reloaded.whenLoaded;
  expect(reloaded.doc.getMap("test").toJSON()).toEqual({ first: "preserve me", second: "newer edit" });
});

it("compaction preserves other open clients' updates and reloadability", async () => {
  const h = open();
  await h.whenLoaded;
  const other = openBoardDoc(h.boardId);
  handles.push(other);
  await other.whenLoaded;
  other.doc.getMap("test").set("other", "other tab");
  h.persistence._dbsize = 500;
  h.doc.getMap("test").set("mine", "this tab");
  await vi.waitFor(() => expect(phase(h.boardId)).toBe("saved"));
  const reloaded = openBoardDoc(h.boardId);
  handles.push(reloaded);
  await reloaded.whenLoaded;
  expect(reloaded.doc.getMap("test").toJSON()).toEqual({ other: "other tab", mine: "this tab" });
});

it("leaving a board after failure retains its live snapshot for re-entry and retry", async () => {
  const h = open();
  await h.whenLoaded;
  await vi.waitFor(() => expect(phase(h.boardId)).toBe("saved"));
  const db = h.persistence.db!;
  const transaction = db.transaction.bind(db);
  const spy = vi.spyOn(db, "transaction").mockImplementationOnce((...args: Parameters<typeof db.transaction>) => {
    const tx = transaction(...args);
    queueMicrotask(() => tx.abort());
    return tx;
  });
  h.doc.getMap("test").set("text", "unsaved at navigation");
  await vi.waitFor(() => expect(phase(h.boardId)).toBe("error"));
  spy.mockRestore();
  await h.destroy();
  expect(h.doc.isDestroyed).toBe(false);
  const returned = openBoardDoc(h.boardId);
  expect(returned).toBe(h);
  expect(returned.doc.getMap("test").get("text")).toBe("unsaved at navigation");
  await retryBoardSave(h.boardId);
  expect(phase(h.boardId)).toBe("saved");
});

it("explicit deletion discards a failed navigation snapshot instead of keeping its database open", async () => {
  const h = open();
  await h.whenLoaded;
  await vi.waitFor(() => expect(phase(h.boardId)).toBe("saved"));
  const db = h.persistence.db!;
  const transaction = db.transaction.bind(db);
  const spy = vi.spyOn(db, "transaction").mockImplementationOnce((...args: Parameters<typeof db.transaction>) => {
    const tx = transaction(...args);
    queueMicrotask(() => tx.abort());
    return tx;
  });
  h.doc.getMap("test").set("text", "not to restore after revocation");
  await vi.waitFor(() => expect(phase(h.boardId)).toBe("error"));
  spy.mockRestore();
  await h.destroy();
  const { discardBoardDocRecovery } = await import("@/state/ydoc/doc");
  await discardBoardDocRecovery(h.boardId);
  expect(h.doc.isDestroyed).toBe(true);
  expect(phase(h.boardId)).toBe("unknown");
  await clearDocument(boardDocName(h.boardId));
  await retryBoardSave(h.boardId);
  expect(phase(h.boardId)).toBe("unknown");
});
