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
import { aiEmbed, aiSummarize, aiConnectionLabel, type SummarizeKind } from "./ai.ts";
import { resolveImageInput, resolveMediaInput } from "./image.ts";
import {
  devTest,
  devLint,
  devTypecheck,
  devBuild,
  devReadDoc,
  devListDocs,
  type CommandResult,
} from "./dev.ts";

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

/** 임의 async 작업(HTTP 등)을 MCP 텍스트 결과로 직렬화. 실패는 isError. */
async function attempt(fn: () => Promise<unknown>) {
  try {
    const result = await fn();
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    return {
      content: [{ type: "text" as const, text: err instanceof Error ? err.message : String(err) }],
      isError: true,
    };
  }
}

/** CommandResult를 사람이 읽을 텍스트로. exit≠0/타임아웃이면 isError로 표시. */
function commandResult(r: CommandResult) {
  const status = r.timedOut ? "TIMEOUT" : `exit ${r.code}`;
  const text =
    `$ ${r.command}\n[${status}]\n` +
    (r.stdout ? `\n--- stdout ---\n${r.stdout}` : "") +
    (r.stderr ? `\n--- stderr ---\n${r.stderr}` : "");
  return { content: [{ type: "text" as const, text }], isError: r.timedOut || r.code !== 0 };
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
      '카드(노트) 목록을 반환한다. boardId를 주면 그 보드를(현재 보드가 아니어도) 조회한다. 생략 시 현재 보드. 시스템 보드는 "system".',
    inputSchema: {
      boardId: z.string().optional().describe('대상 보드 id 또는 "system"(생략 시 현재 보드)'),
    },
  },
  async ({ boardId }) => viaBridge("notes.list", { boardId }),
);

server.registerTool(
  "notes_get",
  {
    description: "id로 카드 하나를 조회한다(보드 무관).",
    inputSchema: { id: z.string().describe("카드 id") },
  },
  async ({ id }) => viaBridge("notes.get", { id }),
);

server.registerTool(
  "notes_create",
  {
    description:
      "새 카드를 만들고 id를 반환한다. boardId를 주면 그 보드에 직접 생성한다(현재 보드면 화면 즉시 렌더, 다른 보드면 전환 시 보임). 생략 시 현재 보드.",
    inputSchema: {
      content: z
        .string()
        .describe('본문. kind에 따라 해석: text=마크다운, link=URL, mindmap=중심 토픽.'),
      boardId: z.string().optional().describe('대상 보드 id 또는 "system"(생략 시 현재 보드)'),
      kind: z
        .enum(["text", "link", "mindmap"])
        .optional()
        .describe(
          '카드 종류(기본 "text"). 코드/체크리스트/인용은 text 카드에 마크다운으로 넣는다. image/audio/file은 첨부가 필요해 미지원.',
        ),
      x: z.number().optional().describe("월드 좌표 x (기본 40)"),
      y: z.number().optional().describe("월드 좌표 y (기본 40)"),
    },
  },
  async ({ content, boardId, kind, x, y }) =>
    viaBridge("notes.create", { content, boardId, kind, x, y }),
);

server.registerTool(
  "notes_update",
  {
    description: "기존 카드의 본문을 교체한다(보드 무관, id로). 현재 보드면 화면 반영.",
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
    description: "카드를 삭제한다(보드 무관, id로). 현재 보드면 화면 반영.",
    inputSchema: { id: z.string().describe("카드 id") },
  },
  async ({ id }) => viaBridge("notes.delete", { id }),
);

server.registerTool(
  "notes_create_image",
  {
    description:
      "이미지 카드를 만든다. path(로컬 파일) 또는 dataBase64+mimeType로 이미지를 주면 OPFS에 저장하고 image 카드를 생성한다. 현재 보드면 화면 즉시 렌더, boardId로 타 보드 지정 가능.",
    inputSchema: {
      path: z.string().optional().describe("로컬 이미지 파일 경로(MCP가 읽음)"),
      dataBase64: z.string().optional().describe("base64 이미지 데이터(path 미지정 시)"),
      mimeType: z
        .string()
        .optional()
        .describe("예: image/png. dataBase64면 필수, path면 확장자로 추론"),
      content: z.string().optional().describe("캡션/대체 텍스트(선택)"),
      boardId: z.string().optional().describe('대상 보드 id 또는 "system"(생략 시 현재 보드)'),
      x: z.number().optional().describe("월드 좌표 x (기본 40)"),
      y: z.number().optional().describe("월드 좌표 y (기본 40)"),
    },
  },
  async ({ path, dataBase64, mimeType, content, boardId, x, y }) =>
    attempt(async () => {
      const img = await resolveImageInput({ path, dataBase64, mimeType });
      return await bridge.call("notes.createImage", {
        dataBase64: img.dataBase64,
        mimeType: img.mimeType,
        content,
        boardId,
        x,
        y,
      });
    }),
);

server.registerTool(
  "notes_create_audio",
  {
    description:
      "오디오 카드를 만든다. path(로컬 파일) 또는 dataBase64+mimeType(audio/*)로 오디오를 주면 OPFS에 저장한다. boardId로 타 보드 지정 가능.",
    inputSchema: {
      path: z.string().optional().describe("로컬 오디오 파일 경로(MCP가 읽음)"),
      dataBase64: z.string().optional().describe("base64 오디오 데이터(path 미지정 시)"),
      mimeType: z.string().optional().describe("예: audio/mpeg. dataBase64면 필수, path면 추론"),
      content: z.string().optional().describe("캡션(선택)"),
      boardId: z.string().optional().describe('대상 보드 id 또는 "system"(생략 시 현재 보드)'),
      x: z.number().optional().describe("월드 좌표 x (기본 40)"),
      y: z.number().optional().describe("월드 좌표 y (기본 40)"),
    },
  },
  async ({ path, dataBase64, mimeType, content, boardId, x, y }) =>
    attempt(async () => {
      const m = await resolveMediaInput({ path, dataBase64, mimeType }, "audio");
      return await bridge.call("notes.createAudio", {
        dataBase64: m.dataBase64,
        mimeType: m.mimeType,
        content,
        boardId,
        x,
        y,
      });
    }),
);

server.registerTool(
  "notes_create_file",
  {
    description:
      "파일 카드를 만든다. path(로컬 파일) 또는 dataBase64(+mimeType)로 임의 파일을 주면 OPFS에 저장한다. mimeType 미상이면 application/octet-stream. boardId로 타 보드 지정 가능.",
    inputSchema: {
      path: z.string().optional().describe("로컬 파일 경로(MCP가 읽음)"),
      dataBase64: z.string().optional().describe("base64 파일 데이터(path 미지정 시)"),
      mimeType: z.string().optional().describe("미상이면 application/octet-stream"),
      content: z.string().optional().describe("캡션/파일명(선택)"),
      boardId: z.string().optional().describe('대상 보드 id 또는 "system"(생략 시 현재 보드)'),
      x: z.number().optional().describe("월드 좌표 x (기본 40)"),
      y: z.number().optional().describe("월드 좌표 y (기본 40)"),
    },
  },
  async ({ path, dataBase64, mimeType, content, boardId, x, y }) =>
    attempt(async () => {
      const m = await resolveMediaInput({ path, dataBase64, mimeType }, "any");
      return await bridge.call("notes.createFile", {
        dataBase64: m.dataBase64,
        mimeType: m.mimeType,
        content,
        boardId,
        x,
        y,
      });
    }),
);

server.registerTool(
  "notes_create_mindmap",
  {
    description:
      "가지(children)가 있는 마인드맵 카드를 만든다. tree = {text, children?:[{text, children?}, ...]} 중첩 구조. 현재 보드면 화면 즉시 렌더, boardId로 타 보드 지정 가능.",
    inputSchema: {
      tree: z
        .record(z.unknown())
        .describe("중심 노드 {text, children?:[...]} (children도 같은 구조로 중첩)"),
      boardId: z.string().optional().describe('대상 보드 id 또는 "system"(생략 시 현재 보드)'),
      x: z.number().optional().describe("월드 좌표 x (기본 40)"),
      y: z.number().optional().describe("월드 좌표 y (기본 40)"),
    },
  },
  async ({ tree, boardId, x, y }) => viaBridge("notes.createMindmap", { tree, boardId, x, y }),
);

server.registerTool(
  "notes_create_comment",
  {
    description:
      "코멘트(주석) 카드를 만든다. 작성자(author)·시간(time) 메타가 붙는다. 현재 보드면 화면 즉시 렌더, boardId로 타 보드 지정 가능.",
    inputSchema: {
      content: z.string().describe("코멘트 본문"),
      author: z.string().optional().describe('작성자(기본 "MCP")'),
      time: z.string().optional().describe('표시용 시간 문자열(예: "방금", "2일 전")'),
      boardId: z.string().optional().describe('대상 보드 id 또는 "system"(생략 시 현재 보드)'),
      x: z.number().optional().describe("월드 좌표 x (기본 40)"),
      y: z.number().optional().describe("월드 좌표 y (기본 40)"),
    },
  },
  async ({ content, author, time, boardId, x, y }) =>
    viaBridge("notes.createComment", { content, author, time, boardId, x, y }),
);

/* ── T5: boards (브리지 — 보드 목록/UI 라이브) ──────────────── */

server.registerTool(
  "boards_list",
  { description: "사용자 보드 목록과 현재 보드 id를 반환한다.", inputSchema: {} },
  async () => viaBridge("boards.list"),
);

server.registerTool(
  "boards_create",
  {
    description: "새 보드를 만들고 그 보드로 전환한다. 생성된 보드 id를 반환한다.",
    inputSchema: { name: z.string().optional().describe("보드 이름(선택)") },
  },
  async ({ name }) => viaBridge("boards.create", { name }),
);

server.registerTool(
  "boards_rename",
  {
    description: "보드 이름을 변경한다(시스템 보드 불가).",
    inputSchema: { id: z.string().describe("보드 id"), name: z.string().describe("새 이름") },
  },
  async ({ id, name }) => viaBridge("boards.rename", { id, name }),
);

server.registerTool(
  "boards_delete",
  {
    description: "보드를 삭제한다(시스템 보드 불가). 현재 보드였으면 시스템 보드로 복귀.",
    inputSchema: { id: z.string().describe("보드 id") },
  },
  async ({ id }) => viaBridge("boards.delete", { id }),
);

server.registerTool(
  "boards_switch",
  {
    description:
      '현재 보드를 전환한다. 이후 notes_* 는 이 보드 기준으로 동작한다. 시스템 보드는 "system".',
    inputSchema: { id: z.string().describe('보드 id 또는 "system"') },
  },
  async ({ id }) => viaBridge("boards.switch", { id }),
);

/* ── T5: connections (브리지 — Dexie 데이터, 캔버스 렌더 대상 아님) ── */

server.registerTool(
  "connections_list",
  {
    description: "연결 목록을 반환한다. noteId를 주면 그 노트가 끝점인 연결만.",
    inputSchema: { noteId: z.string().optional().describe("필터할 노트 id(선택)") },
  },
  async ({ noteId }) => viaBridge("connections.list", { noteId }),
);

server.registerTool(
  "connections_create",
  {
    description: "두 노트 사이에 수동 연결을 만든다(status=active). 생성된 연결 id를 반환한다.",
    inputSchema: {
      sourceNoteId: z.string().describe("출발 노트 id"),
      targetNoteId: z.string().describe("도착 노트 id"),
      label: z.string().optional().describe("연결 라벨(선택)"),
    },
  },
  async ({ sourceNoteId, targetNoteId, label }) =>
    viaBridge("connections.create", { sourceNoteId, targetNoteId, label }),
);

server.registerTool(
  "connections_delete",
  {
    description: "연결을 삭제한다.",
    inputSchema: { id: z.string().describe("연결 id") },
  },
  async ({ id }) => viaBridge("connections.delete", { id }),
);

/* ── T6: AI 도구 (HTTP → 실행 중 moss dev 서버) ──────────────── */

server.registerTool(
  "ai_embed",
  {
    description: "텍스트 배치를 임베딩 벡터로 변환한다(POST /api/ai/embed). 1~50개.",
    inputSchema: { texts: z.array(z.string().min(1)).min(1).max(50).describe("임베딩할 텍스트들") },
  },
  async ({ texts }) => attempt(() => aiEmbed(texts)),
);

server.registerTool(
  "ai_summarize",
  {
    description: "텍스트들을 흐름/군집/리듬 관점으로 요약한다(POST /api/ai/summarize).",
    inputSchema: {
      texts: z.array(z.string().min(1)).min(1).max(50).describe("요약할 텍스트들"),
      kind: z.enum(["flow", "cluster", "rhythm"]).describe("요약 종류"),
    },
  },
  async ({ texts, kind }) => attempt(() => aiSummarize(texts, kind as SummarizeKind)),
);

server.registerTool(
  "ai_connection_label",
  {
    description: "두 텍스트 사이 연결의 라벨을 생성한다(POST /api/ai/connection-label).",
    inputSchema: {
      textA: z.string().min(1).max(4000).describe("첫 번째 텍스트"),
      textB: z.string().min(1).max(4000).describe("두 번째 텍스트"),
    },
  },
  async ({ textA, textB }) => attempt(() => aiConnectionLabel(textA, textB)),
);

server.registerTool(
  "ai_preview",
  {
    description:
      "URL의 Open Graph 미리보기 메타를 가져온다. /api/preview는 same-origin 가드가 있어 실행 중 moss 탭(브리지)을 통해 호출한다.",
    inputSchema: { url: z.string().url().describe("미리보기할 URL") },
  },
  async ({ url }) => viaBridge("ai.preview", { url }),
);

/* ── T7: dev/프로젝트 관리 도구 (fs + child_process) ──────────── */

server.registerTool(
  "dev_test",
  {
    description: "web 테스트를 실행한다(vitest run). pattern으로 파일/테스트를 좁힐 수 있다.",
    inputSchema: { pattern: z.string().optional().describe("파일 경로/이름 패턴(선택)") },
  },
  async ({ pattern }) => commandResult(await devTest(pattern)),
);

server.registerTool(
  "dev_lint",
  { description: "web에 ESLint를 실행한다.", inputSchema: {} },
  async () => commandResult(await devLint()),
);

server.registerTool(
  "dev_typecheck",
  { description: "web에 tsc --noEmit 타입체크를 실행한다.", inputSchema: {} },
  async () => commandResult(await devTypecheck()),
);

server.registerTool(
  "dev_build",
  { description: "web 프로덕션 빌드(next build)를 실행한다. 느리다(수분).", inputSchema: {} },
  async () => commandResult(await devBuild()),
);

server.registerTool(
  "dev_read_doc",
  {
    description: "레포 내 텍스트 문서를 읽는다(예: PRD.md, docs/moss.blueprint.json). 레포 밖 경로는 거부.",
    inputSchema: { path: z.string().describe("레포 루트 기준 상대 경로") },
  },
  async ({ path }) => attempt(() => devReadDoc(path)),
);

server.registerTool(
  "dev_list_docs",
  { description: "주요 문서/스펙 목록(root, docs/, docs/specs/)을 반환한다.", inputSchema: {} },
  async () => attempt(() => devListDocs()),
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
