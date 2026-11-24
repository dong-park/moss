import { beforeEach, expect, it, vi } from "vitest";
import { serializeBlock } from "@/state/blocks";
import { useWorkspace, type Card } from "@/state/workspace";
import { commitMobileLink, finishMobileConnection, reconcileMobileOperation, useMobileCanvas } from "../mobileCanvas";
const card = (id: string, x: number): Card => ({ id, kind: "text", x, y: 0, width: 240, content: serializeBlock({ type: "link", url: "https://example.com/" + id })! });
beforeEach(() => {
  useMobileCanvas.getState().close();
  useWorkspace.setState({ cards: [card("a", 0), card("b", 400), { ...card("photo", 800), kind: "photo" }], connections: [], currentBoardId: "test-mobile", selectedIds: [], penMode: false, editingId: null, view: "canvas" });
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
});
it("a completed two-tap connection adds exactly one directed line and does not move cards", () => {
  useMobileCanvas.getState().connect("a");
  const before = useWorkspace.getState().cards;
  expect(finishMobileConnection("b")).toBe(true);
  expect(useWorkspace.getState().connections).toHaveLength(1);
  expect(useWorkspace.getState().connections[0]).toMatchObject({ sourceNoteId: "a", targetNoteId: "b", sourceSide: "right", targetSide: "left" });
  expect(useWorkspace.getState().cards).toEqual(before);
  useMobileCanvas.getState().connect("a");
  finishMobileConnection("b");
  expect(useWorkspace.getState().connections).toHaveLength(1);
});
it("self, invalid target and cancellation create no line or memo", () => {
  useMobileCanvas.getState().connect("a");
  finishMobileConnection("a"); finishMobileConnection("photo"); finishMobileConnection("missing");
  expect(useWorkspace.getState().connections).toHaveLength(0);
  expect(useWorkspace.getState().cards).toHaveLength(3);
  useMobileCanvas.getState().close();
  expect(useMobileCanvas.getState().operation.kind).toBe("idle");
});
it.each(["delete", "board", "selection", "pen", "table"])("%s safely invalidates transient operation", reason => {
  useMobileCanvas.getState().connect("a");
  if (reason === "delete") useWorkspace.setState({ cards: [] });
  if (reason === "board") useWorkspace.setState({ currentBoardId: "other" });
  if (reason === "selection") useWorkspace.setState({ selectedIds: [] });
  if (reason === "pen") useWorkspace.setState({ penMode: true });
  if (reason === "table") useWorkspace.setState({ view: "table" });
  reconcileMobileOperation();
  expect(useMobileCanvas.getState().operation.kind).toBe("idle");
});
it("a missing edited card cannot be recreated on commit", () => {
  useMobileCanvas.getState().editLink("a");
  const op=useMobileCanvas.getState().operation;
  if(op.kind!=="link") throw Error("No link operation");
  useWorkspace.setState({cards:[]});
  expect(commitMobileLink(op,"https://example.com/new")).toBe("missing");
  expect(useWorkspace.getState().cards).toHaveLength(0);
});
