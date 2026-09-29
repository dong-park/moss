import { describe, expect, it, vi } from "vitest";
import { resolveBoardAccess, type BoardAccessDeps } from "@/state/boardAccess";
import { SYSTEM_BOARD_ID } from "@/state/boardIds";
import { SessionExpiredError } from "@/state/auth";

/**
 * FEAT-onboarding-routes n5 — `/b/[boardId]` 판정 (AC-8·9·10·13).
 * 순수 판정 로직은 deps 주입으로 확인한다.
 */
function deps(over: Partial<BoardAccessDeps> = {}): BoardAccessDeps {
  return {
    isLocalBoard: vi.fn(async () => false),
    isGoneLocalBoard: vi.fn(async () => false),
    hasSession: () => true,
    isOnline: () => true,
    openShared: vi.fn(async () => true),
    ...over,
  };
}

describe("resolveBoardAccess", () => {
  it("시스템 보드는 판정 없이 연다", async () => {
    const d = deps({ isLocalBoard: vi.fn(async () => false) });
    expect(await resolveBoardAccess(SYSTEM_BOARD_ID, d)).toEqual({ kind: "open" });
  });

  it("로컬 보드는 그대로 연다", async () => {
    const d = deps({ isLocalBoard: vi.fn(async () => true) });
    expect(await resolveBoardAccess("b1", d)).toEqual({ kind: "open" });
    expect(d.openShared).not.toHaveBeenCalled();
  });

  it("로컬에 있었지만 사라진 보드는 찾을 수 없음 (AC-8)", async () => {
    const d = deps({ isGoneLocalBoard: vi.fn(async () => true) });
    expect(await resolveBoardAccess("gone", d)).toEqual({ kind: "not-found" });
    expect(d.openShared).not.toHaveBeenCalled();
  });

  it("세션이 없으면 볼 수 없음 (AC-10)", async () => {
    const d = deps({ hasSession: () => false });
    expect(await resolveBoardAccess("b1", d)).toEqual({ kind: "no-access" });
    expect(d.openShared).not.toHaveBeenCalled();
  });

  it("오프라인이면 연결 대기 카드 (AC-13)", async () => {
    const d = deps({ isOnline: () => false });
    expect(await resolveBoardAccess("b1", d)).toEqual({ kind: "offline" });
    expect(d.openShared).not.toHaveBeenCalled();
  });

  it("서버에 멤버면 공유 보드로 연다 (AC-9)", async () => {
    const d = deps({ openShared: vi.fn(async () => true) });
    expect(await resolveBoardAccess("shared", d)).toEqual({ kind: "shared" });
  });

  it("멤버가 아니거나 서버에도 없으면 볼 수 없음 (AC-10)", async () => {
    const d = deps({ openShared: vi.fn(async () => false) });
    expect(await resolveBoardAccess("shared", d)).toEqual({ kind: "no-access" });
  });

  it("멤버십 확인 중 세션이 만료되면 볼 수 없음 (AC-10)", async () => {
    const d = deps({
      openShared: vi.fn(async () => {
        throw new SessionExpiredError();
      }),
    });
    expect(await resolveBoardAccess("shared", d)).toEqual({ kind: "no-access" });
  });

  it("멤버십 확인 중 네트워크 실패는 오프라인 (AC-13)", async () => {
    const d = deps({
      openShared: vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    });
    expect(await resolveBoardAccess("shared", d)).toEqual({ kind: "offline" });
  });
});
