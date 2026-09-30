import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AWARENESS_INTERVAL_MS, createThrottle } from "@/state/presence/throttle";

describe("createThrottle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("첫 호출은 즉시 지나간다", () => {
    const fn = vi.fn();
    const throttled = createThrottle(fn);
    throttled(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(1);
  });

  it("간격 안의 연속 호출은 마지막 값만 trailing으로 보낸다", () => {
    const fn = vi.fn();
    const throttled = createThrottle(fn, { intervalMs: 40 });
    throttled("a");
    vi.advanceTimersByTime(10);
    throttled("b");
    vi.advanceTimersByTime(10);
    throttled("c");
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(30);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith("c");
  });

  it("초당 25회를 넘지 않는다", () => {
    const fn = vi.fn();
    const throttled = createThrottle(fn, { intervalMs: AWARENESS_INTERVAL_MS });
    for (let i = 0; i < 100; i++) {
      throttled(i);
      vi.advanceTimersByTime(10);
    }
    expect(fn.mock.calls.length).toBeLessThanOrEqual(26);
  });

  it("flush는 대기 중인 마지막 값을 즉시 보낸다", () => {
    const fn = vi.fn();
    const throttled = createThrottle(fn, { intervalMs: 40 });
    throttled("first");
    throttled("last");
    expect(fn).toHaveBeenCalledTimes(1);
    throttled.flush();
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith("last");
  });

  it("cancel은 대기 값을 버린다", () => {
    const fn = vi.fn();
    const throttled = createThrottle(fn, { intervalMs: 40 });
    throttled("first");
    throttled("dropped");
    throttled.cancel();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
