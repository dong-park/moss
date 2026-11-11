import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createMemoHistory } from "../memoHistory";

let cardId: string | null;
let boardId: string;
let exists: boolean;
let enabled: boolean;
const nextState = { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: ["next-tree"], other: "preserve" };
let controller: ReturnType<typeof createMemoHistory>;
let disconnect: () => void;
let flush = vi.fn<() => void>();
let close = vi.fn<(restoreBoard: boolean) => void>();

beforeEach(() => {
  history.replaceState(nextState, "", "/b/history-test");
  cardId = "a"; boardId = "history-test"; exists = true; enabled = true;
  flush = vi.fn();
  close = vi.fn(() => { cardId = null; });
  controller = createMemoHistory({ read: () => ({ cardId, boardId, enabled, exists: () => exists }),
    open: (id) => { cardId = id; }, close, flush });
  disconnect = controller.connect();
  vi.spyOn(history, "back").mockImplementation(() => {});
});
afterEach(() => { disconnect(); vi.restoreAllMocks(); history.replaceState(null, "", "/"); });

function pop(state: unknown = nextState, url = "/b/history-test") {
  history.replaceState(state, "", url);
  window.dispatchEvent(new PopStateEvent("popstate", { state }));
}

it("adds one same-URL detail entry, preserves Next state, and Back closes without another traversal", () => {
  const push = vi.spyOn(history, "pushState");
  controller.sync(); controller.sync();
  expect(push).toHaveBeenCalledTimes(1);
  expect(history.state).toMatchObject(nextState);
  expect(location.pathname).toBe("/b/history-test");
  pop();
  expect(cardId).toBeNull();
  expect(flush).toHaveBeenCalled();
  expect(history.back).not.toHaveBeenCalled();
});

it("deduplicates Done and waits for traversal before closing, then Forward restores the note", () => {
  controller.sync();
  const detail = history.state;
  controller.close(); controller.close();
  expect(history.back).toHaveBeenCalledTimes(1);
  expect(cardId).toBe("a");
  pop();
  expect(cardId).toBeNull();
  pop(detail);
  expect(cardId).toBe("a");
  expect(history.state).toMatchObject(nextState);
});

it("keeps an immediate newer open request when the old close arrives", () => {
  controller.sync(); controller.close();
  cardId = "b"; controller.sync();
  pop();
  expect(cardId).toBe("b");
  expect(history.state.__mossMemoV1.cardId).toBe("b");
  expect(history.back).toHaveBeenCalledTimes(1);
});

it("serializes board navigation after the detail traversal", () => {
  controller.sync();
  const navigate = vi.fn(() => { history.pushState(nextState, "", "/b/other"); boardId = "other"; });
  controller.close(); controller.navigate(navigate);
  expect(navigate).not.toHaveBeenCalled();
  pop();
  expect(navigate).toHaveBeenCalledTimes(1);
  expect(location.pathname).toBe("/b/other");
  expect(cardId).toBeNull();
});

it("does not traverse or add another entry during StrictMode disconnect/reconnect", () => {
  const push = vi.spyOn(history, "pushState");
  controller.sync(); disconnect(); disconnect = controller.connect(); controller.sync();
  expect(push).toHaveBeenCalledTimes(1);
  expect(history.back).not.toHaveBeenCalled();
});

it("ignores deleted, foreign, and wrong-board markers without dropping unrelated history state", () => {
  controller.sync(); const detail = history.state;
  pop(); exists = false; pop(detail);
  expect(cardId).toBeNull(); expect(history.state).toEqual(nextState);
  exists = true;
  pop({ ...detail, __mossMemoV1: { ...detail.__mossMemoV1, owner: "other-session" } });
  expect(cardId).toBeNull(); expect(history.state).toEqual(nextState);
  boardId = "other"; pop(detail, "/b/other");
  expect(cardId).toBeNull(); expect(history.state).toEqual(nextState);
});

it("does not restore the table board when Back navigated to a different URL", () => {
  controller.sync(); pop(nextState, "/b/previous");
  expect(close).toHaveBeenCalledWith(false);
  expect(history.back).not.toHaveBeenCalled();
});

it("keeps an open detail and its entry when resizing out of compact layout", () => {
  controller.sync(); const detail = history.state;
  enabled = false; controller.sync();
  expect(cardId).toBe("a");
  expect(history.state).toEqual(detail);
  expect(history.back).not.toHaveBeenCalled();
  pop();
  expect(cardId).toBeNull();
});
