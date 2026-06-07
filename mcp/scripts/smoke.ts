#!/usr/bin/env bun
/* 브라우저 e2e 스모크 — 외부 에이전트 역할.
 * MossBridge(WS 릴레이)를 띄우고 moss 탭 접속을 기다린 뒤 데이터/AI(브리지) op를
 * 실제로 왕복한다. moss-mcp의 viaBridge가 호출하는 그 bridge.call 경로.
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

const call = async (op: string, params?: Record<string, unknown>): Promise<unknown> => {
  const r = await bridge.call(op, params);
  console.error(`[smoke] ${op} →`, JSON.stringify(r).slice(0, 160));
  return r;
};

try {
  await call("ping");

  // T5 boards: 새 보드 생성(→ 전환됨) → 그 위에 카드 2장
  const board = (await call("boards.create", { name: `MCP 보드 ${Date.now()}` })) as { id: string };
  const n1 = (await call("notes.create", { content: "연결 출발 카드" })) as { id: string };
  const n2 = (await call("notes.create", { content: "연결 도착 카드" })) as { id: string };
  // text 외 카드 종류: link / mindmap
  const link = (await call("notes.create", {
    content: "https://example.com",
    kind: "link",
  })) as { id: string; kind: string };
  const mind = (await call("notes.create", {
    content: "중심 생각",
    kind: "mindmap",
  })) as { id: string; kind: string };
  const kindsOk = link.kind === "link" && mind.kind === "mindmap";
  await call("boards.list");

  // 현재-보드 외 직접 타겟: system으로 전환한 뒤 boardId로 보드 A에 직접 생성
  await call("boards.switch", { id: "system" });
  const remote = (await call("notes.create", {
    content: "현재 보드 아닌 곳에 직접 생성",
    boardId: board.id,
  })) as { id: string; boardId: string | null };
  const boardAList = (await call("notes.list", { boardId: board.id })) as unknown[];
  const sysList = (await call("notes.list")) as unknown[]; // 현재=system
  const crossBoardOk =
    remote.boardId === board.id &&
    Array.isArray(boardAList) &&
    boardAList.length === 5 && // 텍스트2 + link + mindmap + 원격1
    Array.isArray(sysList) &&
    !sysList.some((n) => (n as { id: string }).id === remote.id);
  console.error(`[smoke] cross-board: boardA=${boardAList.length} sys=${sysList.length} ok=${crossBoardOk}`);

  // T5 connections: 두 카드 연결 → 조회
  const conn = (await call("connections.create", {
    sourceNoteId: n1.id,
    targetNoteId: n2.id,
    label: "MCP 연결",
  })) as { id: string };
  const list = (await call("connections.list", { noteId: n1.id })) as unknown[];

  // T6 ai_preview (브리지 경유 — same-origin 통과)
  const preview = (await call("ai.preview", { url: "https://example.com" })) as Record<string, unknown>;

  // 화면 확인을 위해 보드 A로 되돌려 끝낸다(스크린샷에 link/mindmap 렌더 노출).
  await call("boards.switch", { id: board.id });

  const ok =
    !!board.id &&
    !!n1.id &&
    !!n2.id &&
    kindsOk &&
    crossBoardOk &&
    !!conn.id &&
    Array.isArray(list) &&
    list.length > 0 &&
    !!preview;
  console.error(ok ? "[smoke] PASS ✅" : "[smoke] FAIL ❌");
  console.log(
    JSON.stringify({ ok, boardId: board.id, notes: [n1.id, n2.id], connId: conn.id, connCount: list.length }),
  );
  await bridge.close();
  process.exit(ok ? 0 : 1);
} catch (err) {
  console.error("[smoke] FAIL ❌", err instanceof Error ? err.message : err);
  await bridge.close();
  process.exit(1);
}
