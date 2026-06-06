import { describe, test, expect } from "bun:test";
import { BridgeCore, MossNotConnectedError } from "./bridge.ts";

/** core가 내보낸 op 프레임을 캡처하는 fake sender. */
function harness(timeoutMs = 10_000) {
  const sent: { id: string; op: string; params: Record<string, unknown> }[] = [];
  const core = new BridgeCore(timeoutMs);
  const connect = () =>
    core.setSender((frame) => sent.push(JSON.parse(frame)));
  /** 가장 최근 op에 결과를 응답한다(moss 역할). */
  const reply = (result: unknown) => {
    const last = sent.at(-1)!;
    core.handleResult(JSON.stringify({ type: "result", id: last.id, ok: true, result }));
  };
  const replyError = (error: string) => {
    const last = sent.at(-1)!;
    core.handleResult(JSON.stringify({ type: "result", id: last.id, ok: false, error }));
  };
  return { core, sent, connect, reply, replyError };
}

describe("BridgeCore", () => {
  test("미접속 상태에서 call → MossNotConnectedError", async () => {
    const { core } = harness();
    expect(core.isConnected()).toBe(false);
    await expect(core.call("notes.list")).rejects.toBeInstanceOf(MossNotConnectedError);
  });

  test("op 라운드트립 — params 전달 + result 수신", async () => {
    const { core, sent, connect, reply } = harness();
    connect();
    expect(core.isConnected()).toBe(true);
    const p = core.call("notes.create", { content: "hi" });
    expect(sent.at(-1)).toMatchObject({ op: "notes.create", params: { content: "hi" } });
    reply({ id: "n1" });
    await expect(p).resolves.toEqual({ id: "n1" });
  });

  test("동시 op는 id로 정확히 상관된다", async () => {
    const { core, sent, connect } = harness();
    connect();
    const p1 = core.call("notes.get", { id: "a" });
    const p2 = core.call("notes.get", { id: "b" });
    // 2번째 op에 먼저 응답해도 올바른 promise가 resolve.
    core.handleResult(JSON.stringify({ type: "result", id: sent[1]!.id, ok: true, result: "B" }));
    core.handleResult(JSON.stringify({ type: "result", id: sent[0]!.id, ok: true, result: "A" }));
    await expect(p1).resolves.toBe("A");
    await expect(p2).resolves.toBe("B");
  });

  test("moss 측 에러 응답 → call reject", async () => {
    const { core, connect, replyError } = harness();
    connect();
    const p = core.call("notes.get", { id: "x" });
    replyError("카드를 찾을 수 없습니다: x");
    await expect(p).rejects.toThrow("찾을 수 없습니다");
  });

  test("응답 없으면 타임아웃", async () => {
    const { core, connect } = harness(40);
    connect();
    await expect(core.call("notes.list")).rejects.toThrow("타임아웃");
  });

  test("접속 끊기면 대기 중 호출이 모두 reject", async () => {
    const { core, connect } = harness();
    connect();
    const p = core.call("notes.list");
    core.setSender(null); // moss 탭 닫힘
    await expect(p).rejects.toBeInstanceOf(MossNotConnectedError);
    expect(core.isConnected()).toBe(false);
  });

  test("알 수 없는/중복 result는 무시(no-op)", () => {
    const { core, connect } = harness();
    connect();
    // 매칭되는 pending 없음 — 던지지 않아야 한다.
    expect(() =>
      core.handleResult(JSON.stringify({ type: "result", id: "ghost", ok: true })),
    ).not.toThrow();
    expect(() => core.handleResult("not json")).not.toThrow();
  });
});
