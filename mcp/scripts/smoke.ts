#!/usr/bin/env bun
/* 브라우저 e2e 스모크 — 외부 에이전트 역할.
 * MossBridge(WS 릴레이)를 띄우고 moss 탭 접속을 기다린 뒤 ping → notes.create →
 * notes.list 를 실제로 왕복한다. moss-mcp의 viaBridge가 호출하는 그 bridge.call 경로.
 * 사용: NEXT_PUBLIC_MOSS_BRIDGE=1 로 띄운 moss 탭을 ws 포트로 향하게 한 뒤 실행. */

import { MossBridge } from "../src/bridge.ts";

const port = Number(process.env.MOSS_BRIDGE_PORT ?? 7333);
const bridge = new MossBridge({ port });
await bridge.start();
console.error(`[smoke] ws://127.0.0.1:${port} 리스닝 — moss 탭 접속 대기...`);

const deadline = Date.now() + 30_000;
while (!bridge.isConnected()) {
  if (Date.now() > deadline) {
    console.error("[smoke] FAIL: 30초 내 moss 접속 없음");
    await bridge.close();
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 200));
}
console.error("[smoke] moss 접속됨 ✅");

const ping = await bridge.call("ping");
console.error("[smoke] ping →", JSON.stringify(ping));

const created = (await bridge.call("notes.create", {
  content: `MCP가 만든 카드 ✅ ${new Date().toISOString()}`,
})) as { id: string };
console.error("[smoke] notes.create →", JSON.stringify(created));

const list = (await bridge.call("notes.list")) as unknown[];
console.error(`[smoke] notes.list → ${Array.isArray(list) ? list.length : "?"}개`);

const ok = !!created.id && Array.isArray(list) && list.length > 0;
console.error(ok ? "[smoke] PASS ✅" : "[smoke] FAIL ❌");
// 생성된 id를 stdout으로 — 호출자가 화면 확인에 쓴다.
console.log(JSON.stringify({ ok, createdId: created.id, count: list.length }));
await bridge.close();
process.exit(ok ? 0 : 1);
