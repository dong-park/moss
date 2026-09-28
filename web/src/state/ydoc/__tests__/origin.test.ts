/**
 * FEAT-collab-auth n1 — 로컬 origin 규칙.
 * 로컬 트랜잭션은 observer가 걸러지고, 다른 origin은 통과한다.
 */
import * as Y from "yjs";
import { describe, expect, it, vi } from "vitest";
import {
  LOCAL_ORIGIN,
  isRemoteTransaction,
  observeRemote,
  transactLocal,
} from "@/state/ydoc/origin";
import { putNote } from "@/state/ydoc/model";

function scratch(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap<unknown>("scratch");
}

describe("LOCAL_ORIGIN 규칙", () => {
  it("transactLocal은 LOCAL_ORIGIN 트랜잭션을 연다", () => {
    const doc = new Y.Doc();
    let origin: unknown;
    doc.on("afterTransaction", (tr) => {
      origin = tr.origin;
    });
    transactLocal(doc, () => scratch(doc).set("a", 1));
    expect(origin).toBe(LOCAL_ORIGIN);
    expect(isRemoteTransaction({ origin: LOCAL_ORIGIN } as Y.Transaction)).toBe(false);
  });

  it("observeRemote는 로컬 변경을 건너뛰고 다른 origin을 통과시킨다", () => {
    const doc = new Y.Doc();
    const cb = vi.fn();
    const off = observeRemote(doc, cb);

    transactLocal(doc, () => scratch(doc).set("local", 1));
    expect(cb).not.toHaveBeenCalled();

    doc.transact(() => scratch(doc).set("remote", 2), { kind: "hocuspocus" });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0].origin).toEqual({ kind: "hocuspocus" });

    off();
    doc.transact(() => scratch(doc).set("after-off", 3), { kind: "remote" });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("n1 쓰기 헬퍼(putNote)도 로컬 origin이라 observer가 무시한다", () => {
    const doc = new Y.Doc();
    const cb = vi.fn();
    observeRemote(doc, cb);
    putNote(doc, {
      id: "n-1",
      boardId: null,
      kind: "text",
      x: 0,
      y: 0,
      width: 240,
      rotation: 0,
      content: "본문",
      aiOptOut: false,
      createdAt: 1,
      updatedAt: 1,
      lastVisitedAt: 1,
    });
    expect(cb).not.toHaveBeenCalled();
  });
});
