/** 리뷰 반영: IndexedDB 열기 실패가 whenLoaded의 reject로 전파된다. */
import { describe, expect, it, vi } from "vitest";

vi.mock("y-indexeddb", () => ({
  IndexeddbPersistence: class {
    whenSynced = new Promise(() => {});
    _db = Promise.reject(new Error("idb blocked"));
    destroy = () => this._db.then(() => {});
  },
}));

describe("openBoardDoc 실패 경로", () => {
  it("IndexedDB가 막히면 whenLoaded가 reject한다", async () => {
    // n3: workspace가 doc을 정적 import하면서 모듈 캐시에 실제 구현이 먼저 올 수 있다.
    // 모듈 레지스트리를 비워 이 테스트의 y-indexeddb mock이 doc에 적용되게 한다.
    vi.resetModules();
    const { openBoardDoc } = await import("@/state/ydoc/doc");
    await expect(openBoardDoc("b").whenLoaded).rejects.toThrow("idb blocked");
  });

  it("열기에 실패해도 destroy가 문서를 정리한다", async () => {
    vi.resetModules();
    const { openBoardDoc } = await import("@/state/ydoc/doc");
    const handle = openBoardDoc("b2");
    await handle.whenLoaded.catch(() => {});
    await expect(handle.destroy()).resolves.toBeUndefined();
    expect(handle.doc.isDestroyed).toBe(true);
  });
});
