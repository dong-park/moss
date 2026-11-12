import { afterEach, expect, it, vi } from "vitest";
import { beginSave, boardSavePhase, retryBoardSave, forgetSaveResource, useSaveFeedback } from "../saveFeedback";
import { cancelPersist, flushAll, schedulePersist } from "../cardPersist";
import { useStorage } from "../storage";
import { getDB, resetDB } from "../db/schema";
const phase = (board = "a") => boardSavePhase(useSaveFeedback.getState().boards[board]);
afterEach(async () => {
  await flushAll();
  vi.restoreAllMocks();
  await resetDB();
  useSaveFeedback.setState({ boards: {} });
});
it("mirror success alone is not source-document durability; board state is isolated", () => {
  beginSave("a", "mirror:n", async () => {}).success();
  expect(phase()).toBe("unknown");
  beginSave("a", "document", async () => {}).success();
  expect(phase()).toBe("saved");
  beginSave("b", "document", async () => {});
  expect(phase("b")).toBe("saving");
  expect(phase()).toBe("saved");
});
it("older completion cannot mark a newer pending revision saved; stale failure cannot undo a committed snapshot", () => {
  const older = beginSave("a", "document", async () => {});
  const newer = beginSave("a", "document", async () => {});
  older.success();
  expect(phase()).toBe("saving");
  newer.success();
  expect(phase()).toBe("saved");
  const first = beginSave("a", "document", async () => {});
  const second = beginSave("a", "document", async () => {});
  second.success();
  first.failure();
  expect(phase()).toBe("saved");
});
it("debounce is pending immediately; replacement/cancel clear only their own reservation; retry uses latest content", async () => {
  beginSave("a", "document", async () => {}).success();
  const old = vi.fn(async () => {});
  schedulePersist("n", old, "a");
  expect(phase()).toBe("saving");
  const latest = vi.fn().mockRejectedValueOnce(new Error("quota")).mockResolvedValueOnce(undefined);
  schedulePersist("n", latest, "a");
  await expect(flushAll()).rejects.toThrow("quota");
  expect(phase()).toBe("error");
  await retryBoardSave("a");
  expect(latest).toHaveBeenCalledTimes(2);
  expect(old).not.toHaveBeenCalled();
  expect(phase()).toBe("saved");
  schedulePersist("n", old, "a");
  cancelPersist("n");
  expect(phase()).toBe("saved");
});
it("real Dexie abort preserves the failed snapshot, and retry writes the newest queued edit", async () => {
  const db = getDB();
  await db.open();
  const put = vi.spyOn(db.notes, "put").mockImplementationOnce(() => { throw new Error("quota"); });
  await expect(useStorage.getState().saveNote({ id: "n", boardId: "a", content: "failed content" })).rejects.toThrow("quota");
  expect(phase()).toBe("error");
  put.mockRestore();
  // Latest patch is partial. The failed content must still survive this commit.
  await useStorage.getState().saveNote({ id: "n", boardId: "a", title: "new title" });
  await retryBoardSave("a");
  const note = await db.notes.get("n");
  expect(note?.content).toBe("failed content");
  expect(note?.title).toBe("new title");
});

it("a cancelled resource ignores a stale failure even after its key is reused", () => {
  const old = beginSave("a", "document", async () => {});
  forgetSaveResource("document");
  const current = beginSave("a", "document", async () => {});
  old.failure();
  expect(phase()).toBe("saving");
  current.success();
  expect(phase()).toBe("saved");
});
