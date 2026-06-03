import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

/* FEAT-memo-autosave-guard (W1) — 종료 경로 flush 배선 (AC-1·AC-2).
 * cardPersist는 seam이므로 모킹해 호출만 검증한다(실제 IndexedDB 불필요). */

const flushCard = vi.fn<(id: string) => Promise<void>>(() => Promise.resolve());
const flushAll = vi.fn<() => Promise<void>>(() => Promise.resolve());
vi.mock("@/state/cardPersist", () => ({
  flushCard: (id: string) => flushCard(id),
  flushAll: () => flushAll(),
}));

import { useFlushOnExit, __listenerRefCount } from "../useFlushOnExit";

beforeEach(() => {
  flushCard.mockClear();
  flushAll.mockClear();
});

afterEach(() => {
  // 누수 검출: 모든 훅이 언마운트되면 참조 카운트 0이어야 한다.
  expect(__listenerRefCount()).toBe(0);
});

describe("useFlushOnExit", () => {
  it("언마운트 시 해당 카드를 flushCard 한다 (AC-1)", () => {
    const { unmount } = renderHook(() => useFlushOnExit("card-1"));
    expect(flushCard).not.toHaveBeenCalled();
    unmount();
    expect(flushCard).toHaveBeenCalledExactlyOnceWith("card-1");
  });

  it("beforeunload에서 flushAll 한다 (AC-2)", () => {
    const { unmount } = renderHook(() => useFlushOnExit("card-1"));
    window.dispatchEvent(new Event("beforeunload"));
    expect(flushAll).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("visibilitychange:hidden에서 flushAll 한다", () => {
    const { unmount } = renderHook(() => useFlushOnExit("card-1"));
    const spy = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(flushAll).toHaveBeenCalledTimes(1);
    spy.mockRestore();
    unmount();
  });

  it("visibilitychange:visible에서는 flushAll 하지 않는다", () => {
    const { unmount } = renderHook(() => useFlushOnExit("card-1"));
    const spy = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(flushAll).not.toHaveBeenCalled();
    spy.mockRestore();
    unmount();
  });

  it("여러 카드가 동시에 열려도 리스너는 한 벌만(중복 금지, spec §6)", () => {
    const a = renderHook(() => useFlushOnExit("a"));
    const b = renderHook(() => useFlushOnExit("b"));
    const c = renderHook(() => useFlushOnExit("c"));
    expect(__listenerRefCount()).toBe(3);

    // 핸들러가 하나뿐이라 beforeunload 1회 발화 → flushAll 1회.
    window.dispatchEvent(new Event("beforeunload"));
    expect(flushAll).toHaveBeenCalledTimes(1);

    a.unmount();
    b.unmount();
    c.unmount();
    // 마지막 언마운트 후 리스너 제거 → 더는 발화 안 됨.
    flushAll.mockClear();
    window.dispatchEvent(new Event("beforeunload"));
    expect(flushAll).not.toHaveBeenCalled();
  });
});
