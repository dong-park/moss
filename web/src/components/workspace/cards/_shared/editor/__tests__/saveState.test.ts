import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* FEAT-memo-autosave-guard (W1) — 저장 상태 전이 (AC-3·AC-4). */

const flushCard = vi.fn<(id: string) => Promise<void>>(() => Promise.resolve());
vi.mock("@/state/cardPersist", () => ({
  flushCard: (id: string) => flushCard(id),
}));

import {
  getSaveState,
  reportChange,
  __resetSaveState,
} from "../saveState";

beforeEach(() => {
  vi.useFakeTimers();
  flushCard.mockReset();
  flushCard.mockResolvedValue(undefined);
});

afterEach(() => {
  __resetSaveState();
  vi.useRealTimers();
});

describe("saveState", () => {
  it("기본 상태는 idle", () => {
    expect(getSaveState("x")).toBe("idle");
  });

  it("reportChange → 즉시 saving (AC-3)", () => {
    reportChange("c1");
    expect(getSaveState("c1")).toBe("saving");
    expect(flushCard).not.toHaveBeenCalled(); // 디바운스 전이라 아직 flush 안 함
  });

  it("디바운스 경과 → flushCard → saved → 1.5s 후 idle (AC-3)", async () => {
    reportChange("c1");
    await vi.advanceTimersByTimeAsync(250); // FLUSH_DEBOUNCE_MS
    expect(flushCard).toHaveBeenCalledExactlyOnceWith("c1");
    expect(getSaveState("c1")).toBe("saved");

    await vi.advanceTimersByTimeAsync(1500); // SAVED_FADE_MS
    expect(getSaveState("c1")).toBe("idle");
  });

  it("연속 타이핑은 flush를 디바운스(마지막 1회만)", async () => {
    reportChange("c1");
    await vi.advanceTimersByTimeAsync(100);
    reportChange("c1"); // 재타이핑 → 타이머 리셋
    await vi.advanceTimersByTimeAsync(100);
    reportChange("c1");
    expect(flushCard).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(250);
    expect(flushCard).toHaveBeenCalledTimes(1);
  });

  it("flush 실패 → console.warn + error 유지 (AC-4, silent 금지)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    flushCard.mockRejectedValueOnce(new Error("quota"));

    reportChange("c1");
    await vi.advanceTimersByTimeAsync(250);

    expect(getSaveState("c1")).toBe("error");
    expect(warn).toHaveBeenCalledOnce();

    // error는 페이드하지 않고 유지된다.
    await vi.advanceTimersByTimeAsync(5000);
    expect(getSaveState("c1")).toBe("error");
    warn.mockRestore();
  });

  it("카드별로 독립적인 상태", () => {
    reportChange("a");
    expect(getSaveState("a")).toBe("saving");
    expect(getSaveState("b")).toBe("idle");
  });
});
