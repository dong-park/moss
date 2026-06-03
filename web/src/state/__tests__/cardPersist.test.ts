import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  schedulePersist,
  flushCard,
  flushAll,
  cancelPersist,
  __pendingCount,
} from "@/state/cardPersist";

/* FEAT-memo-editor-seams (P0) — persist seam: 디바운스·flush·cancel (AC-5). */

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("cardPersist — 디바운스", () => {
  it("300ms 후 1회 실행, 그 전 재예약은 직전 것을 대체(last-write)", () => {
    const run = vi.fn(() => Promise.resolve());
    schedulePersist("a", run);
    schedulePersist("a", run); // 직전 타이머 취소
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(run).toHaveBeenCalledTimes(1);
    expect(__pendingCount()).toBe(0);
  });
});

describe("flushCard — 디바운스 무시 즉시 실행", () => {
  it("대기 중이면 즉시 run하고 타이머 제거", async () => {
    const run = vi.fn(() => Promise.resolve());
    schedulePersist("a", run);
    expect(__pendingCount()).toBe(1);
    await flushCard("a");
    expect(run).toHaveBeenCalledTimes(1);
    expect(__pendingCount()).toBe(0);
    // 이후 타이머가 다시 실행하지 않음
    vi.advanceTimersByTime(300);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("대기 없으면 no-op", async () => {
    await expect(flushCard("none")).resolves.toBeUndefined();
  });
});

describe("cancelPersist — 실행 없이 취소(삭제 경로)", () => {
  it("취소하면 run이 절대 호출되지 않음", () => {
    const run = vi.fn(() => Promise.resolve());
    schedulePersist("a", run);
    cancelPersist("a");
    expect(__pendingCount()).toBe(0);
    vi.advanceTimersByTime(300);
    expect(run).not.toHaveBeenCalled();
  });
});

describe("flushAll — 대기 중 전부 flush", () => {
  it("여러 카드를 모두 즉시 실행", async () => {
    const a = vi.fn(() => Promise.resolve());
    const b = vi.fn(() => Promise.resolve());
    schedulePersist("a", a);
    schedulePersist("b", b);
    expect(__pendingCount()).toBe(2);
    await flushAll();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(__pendingCount()).toBe(0);
  });
});
