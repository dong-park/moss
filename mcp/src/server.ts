#!/usr/bin/env bun
/* ─────────────────────────────────────────────────────────────
 * moss-mcp — 외부 에이전트용 MCP(stdio) 서버.
 *
 * MVP 슬라이스(T1~T4): 데이터 브리지 + notes CRUD.
 *   - 데이터 도구는 실행 중 moss 탭으로 WS 브리지를 통해 전달된다([[bridge.ts]]).
 *   - moss가 접속하지 않았으면 명확한 에러를 반환한다(앱을 자동 기동하지 않음).
 *
 * 후속(T5~): boards/connections, ai.* (HTTP), dev.* (fs/child_process).
 * ───────────────────────────────────────────────────────────── */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { MossBridge, MossNotConnectedError } from "./bridge.ts";

const BRIDGE_PORT = Number(process.env.MOSS_BRIDGE_PORT ?? 7333);
const BRIDGE_HOST = process.env.MOSS_BRIDGE_HOST ?? "127.0.0.1";

const bridge = new MossBridge({ port: BRIDGE_PORT, host: BRIDGE_HOST });

/** bridge.call 결과를 MCP 텍스트 콘텐츠로 직렬화. 에러는 isError로 표면화. */
async function viaBridge(op: string, params: Record<string, unknown> = {}) {
  try {
    const result = await bridge.call(op, params);
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const message =
      err instanceof MossNotConnectedError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    return { content: [{ type: "text" as const, text: message }], isError: true };
  }
}

const server = new McpServer({ name: "moss-mcp", version: "0.1.0" });

server.registerTool(
  "ping",
  {
    description: "moss 브리지 연결 상태를 확인하고, 접속해 있으면 현재 보드 id를 반환한다.",
    inputSchema: {},
  },
  async () => {
    if (!bridge.isConnected()) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ connected: false, port: BRIDGE_PORT }, null, 2),
          },
        ],
      };
    }
    return viaBridge("ping");
  },
);

server.registerTool(
  "notes_list",
  {
    description:
      "현재 보드에 있는 카드(노트) 목록을 반환한다. {id, kind, content, x, y, width, height}.",
    inputSchema: {},
  },
  async () => viaBridge("notes.list"),
);

server.registerTool(
  "notes_get",
  {
    description: "id로 카드 하나를 조회한다.",
    inputSchema: { id: z.string().describe("카드 id") },
  },
  async ({ id }) => viaBridge("notes.get", { id }),
);

server.registerTool(
  "notes_create",
  {
    description:
      "현재 보드에 새 카드를 만든다. 화면에 즉시 렌더되고 IndexedDB에 영속된다. 생성된 카드 id를 반환한다.",
    inputSchema: {
      content: z.string().describe("카드 본문(마크다운). text 카드 기준."),
      kind: z
        .string()
        .optional()
        .describe('카드 종류. 기본 "text". (text|checklist|code|highlight 등)'),
      x: z.number().optional().describe("월드 좌표 x (기본 40)"),
      y: z.number().optional().describe("월드 좌표 y (기본 40)"),
    },
  },
  async ({ content, kind, x, y }) => viaBridge("notes.create", { content, kind, x, y }),
);

server.registerTool(
  "notes_update",
  {
    description: "기존 카드의 본문을 교체한다. 화면 반영 + 영속.",
    inputSchema: {
      id: z.string().describe("카드 id"),
      content: z.string().describe("새 본문(마크다운)"),
    },
  },
  async ({ id, content }) => viaBridge("notes.update", { id, content }),
);

server.registerTool(
  "notes_delete",
  {
    description: "카드를 삭제한다. 화면 반영 + 영속.",
    inputSchema: { id: z.string().describe("카드 id") },
  },
  async ({ id }) => viaBridge("notes.delete", { id }),
);

async function main(): Promise<void> {
  await bridge.start();
  // stderr로만 로깅 — stdout은 MCP 프로토콜(JSON-RPC) 전용이라 오염 금지.
  process.stderr.write(
    `[moss-mcp] 브리지 리스닝 ws://${BRIDGE_HOST}:${BRIDGE_PORT} — moss 탭 접속 대기\n`,
  );
  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  process.stderr.write(`[moss-mcp] 기동 실패: ${err}\n`);
  process.exit(1);
});
