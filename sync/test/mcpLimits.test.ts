import { describe, expect, test } from "bun:test";
import { McpLimiter, McpRateLimitError, Semaphore } from "../src/mcpLimits.ts";

describe("McpLimiter", () => {
  test("concurrent slots are per user and come back on release", () => {
    const limiter = new McpLimiter({ maxConcurrentPerUser: 2 });
    const a1 = limiter.enter("a");
    const a2 = limiter.enter("a");
    expect(a1).not.toBeNull();
    expect(a2).not.toBeNull();
    expect(limiter.enter("a")).toBeNull();
    expect(limiter.enter("b")).not.toBeNull();
    a1!();
    a1!(); // a second release must not hand out an extra slot
    expect(limiter.enter("a")).not.toBeNull();
    expect(limiter.enter("a")).toBeNull();
  });

  test("calls and writes are counted in a sliding minute, and the retry time is when the oldest call leaves", () => {
    let now = 1_000_000;
    const limiter = new McpLimiter({ callsPerMinute: 5, writesPerMinute: 2 }, () => now);
    limiter.consume("u", true);
    now += 10_000;
    limiter.consume("u", true);
    limiter.consume("u", false); // reads do not count as writes
    now += 5_000;
    let error: unknown;
    try {
      limiter.consume("u", true);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(McpRateLimitError);
    const limit = error as McpRateLimitError;
    expect(limit.message).toContain("쓰기 호출");
    expect(limit.retryAt.getTime()).toBe(1_000_000 + 60_000);
    expect(limit.retryAfterSeconds).toBe(45);

    now = 1_000_000 + 60_000; // the first write has left the window
    limiter.consume("u", true);
    expect(() => limiter.consume("u", true)).toThrow(McpRateLimitError);
    // A refused call is not counted: the other user is unaffected.
    limiter.consume("v", true);
  });

  test("the total call limit covers reads too", () => {
    const limiter = new McpLimiter({ callsPerMinute: 3, writesPerMinute: 10 });
    for (let i = 0; i < 3; i += 1) limiter.consume("u", false);
    expect(() => limiter.consume("u", false)).toThrow("호출이 너무 잦아요");
  });
});

describe("Semaphore", () => {
  test("never runs more than its size at once and finishes every task", async () => {
    const gate = new Semaphore(2);
    let running = 0;
    let peak = 0;
    const results = await Promise.all(
      Array.from({ length: 7 }, (_, i) =>
        gate.run(async () => {
          running += 1;
          peak = Math.max(peak, running);
          await Bun.sleep(5);
          running -= 1;
          return i;
        }),
      ),
    );
    expect(peak).toBe(2);
    expect(results).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  test("a failing task still gives its slot back", async () => {
    const gate = new Semaphore(1);
    await expect(gate.run(async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(await gate.run(async () => "ok")).toBe("ok");
  });
});
