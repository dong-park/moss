import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";

/* FEAT-memo-autosave-guard (W1) — 인디케이터 + 변경 보고 배선 (AC-3·AC-4).
 * 이 repo는 jest-dom 매처를 안 쓰므로 평문 DOM 단언으로 검증한다. */

const flushCard = vi.fn<(id: string) => Promise<void>>(() => Promise.resolve());
vi.mock("@/state/cardPersist", () => ({
  flushCard: (id: string) => flushCard(id),
  flushAll: () => Promise.resolve(),
}));

import { SaveIndicator } from "../SaveIndicator";
import { MemoSaveGuard } from "../MemoSaveGuard";
import { reportChange, __resetSaveState } from "../saveState";

beforeEach(() => {
  vi.useFakeTimers();
  flushCard.mockReset();
  flushCard.mockResolvedValue(undefined);
});

afterEach(() => {
  __resetSaveState();
  vi.useRealTimers();
});

describe("SaveIndicator", () => {
  it("role=status로 노출(스크린리더가 읽음, AC-3)", () => {
    render(<SaveIndicator cardId="c1" />);
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("idle → saving → saved 텍스트를 반영", async () => {
    render(<SaveIndicator cardId="c1" />);
    const status = screen.getByRole("status");
    expect(status.textContent).toBe(""); // idle

    act(() => reportChange("c1"));
    expect(status.textContent).toBe("저장 중…");
    expect(status.getAttribute("data-state")).toBe("saving");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(status.textContent).toBe("저장됨");
    expect(status.getAttribute("data-state")).toBe("saved");
  });

  it("flush 실패 시 '저장 실패' 노출(silent 금지, AC-4)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    flushCard.mockRejectedValueOnce(new Error("boom"));
    render(<SaveIndicator cardId="c1" />);

    act(() => reportChange("c1"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(screen.getByRole("status").textContent).toBe("저장 실패");
    warn.mockRestore();
  });
});

describe("MemoSaveGuard", () => {
  it("최초 마운트는 저장 보고하지 않는다(기준선만 잡음)", async () => {
    render(<MemoSaveGuard cardId="g1" content="hello" editing />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(flushCard).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("editing 중 content 변경 → 저장 중 → 저장됨 (AC-3)", async () => {
    const { rerender } = render(
      <MemoSaveGuard cardId="g1" content="hello" editing />,
    );
    rerender(<MemoSaveGuard cardId="g1" content="hello world" editing />);
    expect(screen.getByRole("status").textContent).toBe("저장 중…");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(flushCard).toHaveBeenCalledExactlyOnceWith("g1");
    expect(screen.getByRole("status").textContent).toBe("저장됨");
  });

  it("editing=false면 content가 바뀌어도 보고하지 않는다(외부 갱신 무시)", async () => {
    const { rerender } = render(
      <MemoSaveGuard cardId="g1" content="a" editing={false} />,
    );
    rerender(<MemoSaveGuard cardId="g1" content="b" editing={false} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(flushCard).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toBe("");
  });
});
