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
import { resolveImageInput, resolveMediaInput, fetchImageAsBase64, preparePhoto } from "./image.ts";
import { layoutMindmap } from "./mindmap.ts";
import { layoutGroups } from "./groups.ts";
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

/**
 * notes_create의 blocks[] 스키마. path 또는 dataBase64로 첨부를 주면 여기서
 * base64+mimeType로 정규화하고, link는 url/title 그대로 브리지에 넘긴다.
 * 브리지가 `serializeBlock`으로 본문 블록을 만든다(문법·이스케이프 단일 출처).
 */
/** 연결선이 카드에 붙는 변. */
const sideSchema = z.enum(["top", "right", "bottom", "left"]);

const bridgeBlockSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("image"),
    path: z.string().optional().describe("로컬 이미지 파일 경로(MCP가 읽음)"),
    dataBase64: z.string().optional().describe("base64 이미지(path 미지정 시)"),
    mimeType: z.string().optional().describe("dataBase64면 필수, path면 확장자로 추론"),
    placeholder: z.string().optional().describe('본문 내 {{이름}} 치환 위치'),
  }),
  z.object({
    type: z.literal("audio"),
    path: z.string().optional().describe("로컬 오디오 파일 경로(MCP가 읽음)"),
    dataBase64: z.string().optional().describe("base64 오디오(path 미지정 시)"),
    mimeType: z.string().optional().describe("dataBase64면 필수, path면 추론"),
    placeholder: z.string().optional().describe('본문 내 {{이름}} 치환 위치'),
  }),
  z.object({
    type: z.literal("file"),
    path: z.string().optional().describe("로컬 파일 경로(MCP가 읽음)"),
    dataBase64: z.string().optional().describe("base64 파일(path 미지정 시)"),
    mimeType: z.string().optional().describe("미상이면 application/octet-stream"),
    filename: z.string().optional().describe('블록 라벨(생략 시 기본 "파일")'),
    placeholder: z.string().optional().describe('본문 내 {{이름}} 치환 위치'),
  }),
  z.object({
    type: z.literal("link"),
    url: z.string().describe("http·https·mailto URL"),
    title: z.string().optional().describe("링크 라벨(생략 시 url)"),
    placeholder: z.string().optional().describe('본문 내 {{이름}} 치환 위치'),
  }),
]);

/** 브리지로 보낼 blocks[]를 정규화한다(첨부는 base64+mimeType로). */
async function resolveBridgeBlocks(
  blocks: z.infer<typeof bridgeBlockSchema>[],
): Promise<Record<string, unknown>[]> {
  return Promise.all(
    blocks.map(async (b) => {
      if (b.type === "link") {
        return { type: "link", url: b.url, title: b.title, placeholder: b.placeholder };
      }
      const allow = b.type === "image" ? "image" : b.type === "audio" ? "audio" : "any";
      const m = await resolveMediaInput(
        { path: b.path, dataBase64: b.dataBase64, mimeType: b.mimeType },
        allow,
      );
      return {
        type: b.type,
        dataBase64: m.dataBase64,
        mimeType: m.mimeType,
        ...(b.type === "file" ? { filename: b.filename } : {}),
        ...(b.placeholder ? { placeholder: b.placeholder } : {}),
      };
    }),
  );
}

server.registerTool(
  "notes_create",
  {
    description:
      "본문(text 메모)을 만들고 id를 반환한다. 이미지·녹음·파일·링크는 blocks[]로 넣으면 본문 블록이 된다. boardId를 주면 그 보드에 직접 생성한다(현재 보드면 화면 즉시 렌더, 다른 보드면 전환 시 보임). 생략 시 현재 보드.",
    inputSchema: {
      content: z.string().optional().describe("본문 마크다운(코드·체크리스트·인용 포함)."),
      title: z
        .string()
        .optional()
        .describe("제목 한 줄(80자까지). 메모지 앞면에는 제목만 보이고 본문은 메모 창에서 보인다."),
      boardId: z.string().optional().describe('대상 보드 id 또는 "system"(생략 시 현재 보드)'),
      x: z.number().optional().describe("월드 좌표 x (기본 40)"),
      y: z.number().optional().describe("월드 좌표 y (기본 40)"),
      width: z
        .number()
        .optional()
        .describe("카드 폭(px). 메모 본문은 720폭 고정 컬럼이라, 긴 글은 ~720으로 넓혀야 안 잘림."),
      height: z.number().optional().describe("카드 높이(px). 생략 시 콘텐츠 자동 높이."),
      blocks: z
        .array(bridgeBlockSchema)
        .optional()
        .describe(
          "본문에 박을 블록들(이미지·녹음·파일·링크). placeholder로 {{이름}} 자리에 넣고, 없으면 끝에 붙인다. 블록이 있으면 width 기본 720.",
        ),
      color: z.enum(["blue", "lime", "purple", "pink"]).optional().describe("메모 색(생략 시 기본 노랑)"),
    },
  },
  async ({ content, title, boardId, x, y, width, height, blocks, color }) =>
    attempt(async () => {
      const resolved = blocks ? await resolveBridgeBlocks(blocks) : undefined;
      return bridge.call("notes.create", {
        content,
        title,
        boardId,
        x,
        y,
        width,
        height,
        blocks: resolved,
        color,
      });
    }),
);

server.registerTool(
  "notes_create_link_preview",
  {
    description:
      "URL의 OG 미리보기(제목·요약·썸네일)를 가져와 '제목 링크 + 인라인 썸네일 + 요약' 메모를 만든다(ai_preview는 브리지 경유 — moss 탭 필요).",
    inputSchema: {
      url: z.string().url().describe("미리보기할 URL"),
      boardId: z.string().optional().describe('대상 보드 id 또는 "system"(생략 시 현재 보드)'),
      x: z.number().optional().describe("월드 좌표 x (기본 40)"),
      y: z.number().optional().describe("월드 좌표 y (기본 40)"),
    },
  },
  async ({ url, boardId, x, y }) =>
    attempt(async () => {
      const og = (await bridge.call("ai.preview", { url })) as {
        title?: string;
        summary?: string;
        thumbUrl?: string;
      };
      const title = og.title?.trim() || url;
      // 순서: 제목 링크 블록 → 썸네일 이미지 블록 → 요약 글(AC-8). placeholder로 자리를 잡아
      // 블록이 글 앞뒤에 정확히 놓이게 한다(브리지가 serializeBlock으로 직렬화).
      const blocks: Record<string, unknown>[] = [];
      const parts: string[] = [];
      parts.push("{{link}}");
      blocks.push({ type: "link", url, title, placeholder: "link" });
      if (og.thumbUrl) {
        try {
          const t = await fetchImageAsBase64(og.thumbUrl);
          parts.push("{{thumb}}");
          blocks.push({ type: "image", dataBase64: t.dataBase64, mimeType: t.mimeType, placeholder: "thumb" });
        } catch {
          /* 썸네일 실패는 무시 — 제목 링크 + 요약만으로 메모 생성 */
        }
      }
      if (og.summary?.trim()) parts.push(og.summary.trim());
      return bridge.call("notes.create", {
        content: parts.join("\n\n"),
        blocks,
        width: 720,
        boardId,
        x,
        y,
      });
    }),
);

server.registerTool(
  "notes_update",
  {
    description:
      "기존 카드의 본문·제목·위치·크기를 바꾼다(보드 무관, id로). 준 항목만 바뀐다. title을 빈 문자열로 주면 제목이 지워진다. 메모는 정사각형이라 width를 주면 height도 같이 맞는다. 현재 보드면 화면 반영.",
    inputSchema: {
      id: z.string().describe("카드 id"),
      content: z.string().optional().describe("새 본문(마크다운)"),
      title: z.string().optional().describe("새 제목 한 줄(80자까지). 빈 문자열이면 제목 지우기"),
      x: z.number().optional().describe("월드 좌표 x"),
      y: z.number().optional().describe("월드 좌표 y"),
      width: z.number().optional().describe("카드 폭(px)"),
      height: z.number().optional().describe("카드 높이(px). 메모는 무시하고 폭에 맞춘다"),
    },
  },
  async ({ id, content, title, x, y, width, height }) =>
    viaBridge("notes.update", { id, content, title, x, y, width, height }),
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
      "이미지를 본문 블록으로 넣은 text 메모를 만든다. path(로컬 파일) 또는 dataBase64+mimeType로 이미지를 주면 OPFS에 저장하고 ![](opfs://..) 블록을 본문에 넣는다(AC-2). 현재 보드면 화면 즉시 렌더, boardId로 타 보드 지정 가능.",
    inputSchema: {
      path: z.string().optional().describe("로컬 이미지 파일 경로(MCP가 읽음)"),
      dataBase64: z.string().optional().describe("base64 이미지 데이터(path 미지정 시)"),
      mimeType: z
        .string()
        .optional()
        .describe("예: image/png. dataBase64면 필수, path면 확장자로 추론"),
      content: z.string().optional().describe("본문 글(선택)"),
      placeholder: z.string().optional().describe("본문 내 {{이름}} 치환 위치"),
      boardId: z.string().optional().describe('대상 보드 id 또는 "system"(생략 시 현재 보드)'),
      x: z.number().optional().describe("월드 좌표 x (기본 40)"),
      y: z.number().optional().describe("월드 좌표 y (기본 40)"),
    },
  },
  async ({ path, dataBase64, mimeType, content, placeholder, boardId, x, y }) =>
    attempt(async () => {
      const img = await resolveImageInput({ path, dataBase64, mimeType });
      return await bridge.call("notes.create", {
        content,
        boardId,
        x,
        y,
        blocks: [
          { type: "image", dataBase64: img.dataBase64, mimeType: img.mimeType, placeholder },
        ],
      });
    }),
);

server.registerTool(
  "notes_create_audio",
  {
    description:
      "녹음을 본문 블록으로 넣은 text 메모를 만든다. path(로컬 파일) 또는 dataBase64+mimeType(audio/*)로 주면 OPFS에 저장하고 [녹음](opfs://.. \"moss-audio\") 블록을 넣는다(AC-3). boardId로 타 보드 지정 가능.",
    inputSchema: {
      path: z.string().optional().describe("로컬 오디오 파일 경로(MCP가 읽음)"),
      dataBase64: z.string().optional().describe("base64 오디오 데이터(path 미지정 시)"),
      mimeType: z.string().optional().describe("예: audio/mpeg. dataBase64면 필수, path면 추론"),
      content: z.string().optional().describe("본문 글(선택)"),
      placeholder: z.string().optional().describe("본문 내 {{이름}} 치환 위치"),
      boardId: z.string().optional().describe('대상 보드 id 또는 "system"(생략 시 현재 보드)'),
      x: z.number().optional().describe("월드 좌표 x (기본 40)"),
      y: z.number().optional().describe("월드 좌표 y (기본 40)"),
    },
  },
  async ({ path, dataBase64, mimeType, content, placeholder, boardId, x, y }) =>
    attempt(async () => {
      const m = await resolveMediaInput({ path, dataBase64, mimeType }, "audio");
      return await bridge.call("notes.create", {
        content,
        boardId,
        x,
        y,
        blocks: [
          { type: "audio", dataBase64: m.dataBase64, mimeType: m.mimeType, placeholder },
        ],
      });
    }),
);

server.registerTool(
  "notes_create_file",
  {
    description:
      "파일을 본문 블록으로 넣은 text 메모를 만든다. path(로컬 파일) 또는 dataBase64(+mimeType)로 주면 OPFS에 저장하고 [파일명](opfs://.. \"moss-file\") 블록을 넣는다(AC-3). mimeType 미상이면 application/octet-stream, filename 생략 시 기본 라벨. boardId로 타 보드 지정 가능.",
    inputSchema: {
      path: z.string().optional().describe("로컬 파일 경로(MCP가 읽음)"),
      dataBase64: z.string().optional().describe("base64 파일 데이터(path 미지정 시)"),
      mimeType: z.string().optional().describe("미상이면 application/octet-stream"),
      filename: z.string().optional().describe('블록 라벨(생략 시 기본 "파일")'),
      content: z.string().optional().describe("본문 글(선택)"),
      placeholder: z.string().optional().describe("본문 내 {{이름}} 치환 위치"),
      boardId: z.string().optional().describe('대상 보드 id 또는 "system"(생략 시 현재 보드)'),
      x: z.number().optional().describe("월드 좌표 x (기본 40)"),
      y: z.number().optional().describe("월드 좌표 y (기본 40)"),
    },
  },
  async ({ path, dataBase64, mimeType, filename, content, placeholder, boardId, x, y }) =>
    attempt(async () => {
      const m = await resolveMediaInput({ path, dataBase64, mimeType }, "any");
      return await bridge.call("notes.create", {
        content,
        boardId,
        x,
        y,
        blocks: [
          {
            type: "file",
            dataBase64: m.dataBase64,
            mimeType: m.mimeType,
            filename,
            placeholder,
          },
        ],
      });
    }),
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

server.registerTool(
  "notes_create_board",
  {
    description:
      "함(board) 카드를 만든다 — 서브 캔버스를 가리키는 funnel + 빈 서브 보드를 함께 생성한다. 반환의 boardRef가 새 서브 보드 id다(이름은 boards_rename으로). 현재 보드면 즉시 렌더, boardId로 타 보드 지정 가능.",
    inputSchema: {
      boardId: z
        .string()
        .optional()
        .describe('함 카드를 놓을 보드 id 또는 "system"(생략 시 현재 보드)'),
      x: z.number().optional().describe("월드 좌표 x (기본 40)"),
      y: z.number().optional().describe("월드 좌표 y (기본 40)"),
    },
  },
  async ({ boardId, x, y }) => viaBridge("notes.createBoard", { boardId, x, y }),
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
    description:
      "보드를 삭제한다(시스템 보드 불가). 보드에 있던 메모는 지워지지 않고 시스템 보드로 옮겨진다 — 다시 그리려고 지울 때는 메모를 먼저 notes_delete로 지운다. 현재 보드였으면 시스템 보드로 복귀.",
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
      sourceSide: sideSchema.optional().describe("출발 카드에서 선이 나가는 변(생략 시 상대 쪽 변)"),
      targetSide: sideSchema.optional().describe("도착 카드에서 선이 닿는 변(생략 시 상대 쪽 변)"),
    },
  },
  async ({ sourceNoteId, targetNoteId, label, sourceSide, targetSide }) =>
    viaBridge("connections.create", { sourceNoteId, targetNoteId, label, sourceSide, targetSide }),
);

/* ── 생각 지도: 중심-갈래-세부 나무 + 갈래 사이 연결을 한 번에 그린다 ── */

/** 상태 → 메모 색. 정보(info)는 기본 노랑. */
const STATUS_COLOR = { done: "lime", todo: "pink", check: "purple", info: undefined } as const;

/** 로컬 사진 파일 하나로 사진 카드를 만든다. fit이 있으면 그 정사각형 칸 안에 비율을 지켜 가운데 놓는다. */
async function createPhotoCard(
  path: string,
  at: { x: number; y: number },
  opts: { width?: number; fit?: number; caption?: string; boardId?: string } = {},
) {
  const p = await preparePhoto(path);
  const ratio = p.width > 0 && p.height > 0 ? p.height / p.width : 1;
  let { x, y } = at;
  let width = opts.width;
  if (opts.fit !== undefined) {
    width = ratio > 1 ? opts.fit / ratio : opts.fit;
    x += (opts.fit - width) / 2;
    y += (opts.fit - width * ratio) / 2;
  }
  return (await bridge.call("photos.create", {
    boardId: opts.boardId,
    dataBase64: p.dataBase64,
    mimeType: p.mimeType,
    naturalW: p.width,
    naturalH: p.height,
    x: Math.round(x),
    y: Math.round(y),
    width: width !== undefined ? Math.round(width) : undefined,
    caption: opts.caption,
  })) as { id: string };
}

server.registerTool(
  "photos_create",
  {
    description:
      "로컬 사진 파일로 사진 카드를 만든다. 메모 본문 속 이미지와 달리 사진 자체가 보드에 보인다(앞면이 사진). 큰 사진은 긴 변 1600px로 줄여 올린다. 현재 보드에만 만든다. 메모판 안에 놓으면 판에 들어간다.",
    inputSchema: {
      path: z.string().describe("로컬 이미지 파일 경로"),
      x: z.number().optional(),
      y: z.number().optional(),
      width: z.number().optional().describe("카드 폭(기본 240). 높이는 원본 비율"),
      caption: z.string().optional().describe("사진 아래 캡션 한 줄"),
      boardId: z.string().optional().describe("현재 보드여야 한다"),
    },
  },
  async ({ path, x, y, width, caption, boardId }) =>
    attempt(() => createPhotoCard(path, { x: x ?? 40, y: y ?? 40 }, { width, caption, boardId })),
);

server.registerTool(
  "map_groups",
  {
    description:
      "주제별로 묶어 정리한다. 주제(group)마다 메모판 하나를 만들고 그 안에 메모를 격자로 놓는다. photos를 주면 메모 뒤 칸에 사진 카드로 놓는다. 메모 색은 상태를 뜻한다(done=연두 확정, todo=분홍 할 일, check=보라 확인 필요, info=노랑). 선은 links로 준 관계만 긋는다 — 같은 판 안의 관계는 판이 이미 말하므로 판을 넘는 관계에만 쓴다. 대상 보드로 전환한 뒤 그린다. 반환은 key→id.",
    inputSchema: {
      boardId: z.string().optional().describe("대상 보드 id(생략 시 현재 보드). 다른 보드면 전환한다"),
      origin: z.object({ x: z.number(), y: z.number() }).optional(),
      center: z
        .object({ title: z.string(), content: z.string().optional() })
        .optional()
        .describe("맨 위 가운데 제목 메모(선택)"),
      groups: z
        .array(
          z.object({
            key: z.string(),
            name: z.string().describe("메모판 이름"),
            notes: z
              .array(
                z.object({
                  key: z.string(),
                  title: z.string().describe("앞면 제목 한 줄"),
                  content: z.string().optional().describe("본문 마크다운(창에서 보인다)"),
                  status: z.enum(["done", "todo", "check", "info"]).optional().describe("기본 info"),
                }),
              )
              .default([]),
            photos: z
              .array(z.object({ path: z.string(), caption: z.string().optional() }))
              .optional()
              .describe("판 안 메모 뒤에 놓을 사진(로컬 경로). 앞면에 사진이 보이는 사진 카드가 된다"),
          }),
        )
        .min(1),
      links: z
        .array(z.object({ from: z.string(), to: z.string(), label: z.string().optional() }))
        .optional()
        .describe("메모 key끼리의 관계선"),
      noteCols: z.number().int().min(1).max(5).optional().describe("판 안 한 줄 메모 수(기본 3)"),
      groupCols: z.number().int().min(1).max(6).optional().describe("한 줄 판 수(기본 3)"),
    },
  },
  async ({ boardId, origin, center, groups, links, noteCols, groupCols }) =>
    attempt(async () => {
      const L = layoutGroups(
        {
          hasCenter: center !== undefined,
          groups: groups.map((g) => ({
            key: g.key,
            notes: [...g.notes.map((n) => n.key), ...(g.photos ?? []).map((_, i) => `${g.key}#photo${i}`)],
          })),
        },
        { origin, noteCols, groupCols },
      );
      const noteKeys = new Set(groups.flatMap((g) => g.notes.map((n) => n.key)));
      for (const l of links ?? []) {
        if (!noteKeys.has(l.from) || !noteKeys.has(l.to)) throw new Error(`links에 없는 key: ${l.from}→${l.to}`);
      }
      // 판은 현재 보드에만 만들 수 있다 — 대상 보드로 먼저 전환한다.
      if (boardId) await bridge.call("boards.switch", { id: boardId });
      const ids: Record<string, string> = {};
      if (center && L.center) {
        const r = (await bridge.call("notes.create", {
          title: center.title, content: center.content ?? "", ...L.center,
        })) as { id: string };
        ids.center = r.id;
      }
      for (const g of groups) {
        const f = L.frames[g.key]!;
        const r = (await bridge.call("frames.create", { name: g.name, ...f })) as { id: string };
        ids[g.key] = r.id;
        // 판을 먼저 만들어야 그 안에 놓인 메모가 판 소속이 된다.
        for (const n of g.notes) {
          const p = L.notes[n.key]!;
          const m = (await bridge.call("notes.create", {
            title: n.title,
            content: n.content ?? "",
            color: STATUS_COLOR[n.status ?? "info"],
            x: p.x, y: p.y, width: p.width,
          })) as { id: string };
          ids[n.key] = m.id;
        }
        for (const [i, ph] of (g.photos ?? []).entries()) {
          const cell = L.notes[`${g.key}#photo${i}`]!;
          const r = await createPhotoCard(ph.path, cell, { fit: cell.width, caption: ph.caption });
          ids[`${g.key}#photo${i}`] = r.id;
        }
      }
      for (const l of links ?? []) {
        await bridge.call("connections.create", { sourceNoteId: ids[l.from], targetNoteId: ids[l.to], label: l.label });
      }
      const photos = groups.reduce((s, g) => s + (g.photos?.length ?? 0), 0);
      return { ids, frames: groups.length, notes: noteKeys.size, photos, connections: links?.length ?? 0 };
    }),
);

server.registerTool(
  "map_create",
  {
    description:
      "생각을 지도로 정리한다. 중심 노드 하나(parent 없음)에서 갈래와 세부를 parent로 잇는 나무를 주면, 마인드맵처럼 좌우로 펼쳐 메모와 연결선을 함께 만든다. 나무 밖의 관계(근거·기한·영향 등)는 links로 이어 라벨을 단다. 메모 앞면에는 title만 보이고 content는 메모 창에서 보인다. 반환은 key→메모 id.",
    inputSchema: {
      boardId: z.string().optional().describe('대상 보드 id 또는 "system"(생략 시 현재 보드)'),
      layout: z.enum(["mindmap", "tree"]).optional().describe("mindmap=좌우로 펼침(기본), tree=오른쪽으로만"),
      origin: z.object({ x: z.number(), y: z.number() }).optional().describe("중심 메모 좌상단 월드 좌표(기본 40,40)"),
      size: z.number().optional().describe("메모 한 변(기본 240, 중심은 320)"),
      nodes: z
        .array(
          z.object({
            key: z.string().describe("이 호출 안에서 쓰는 노드 이름(links·parent가 가리킨다)"),
            title: z.string().describe("메모 앞면 제목 한 줄"),
            content: z.string().optional().describe("메모 본문 마크다운(창에서 보인다)"),
            parent: z.string().optional().describe("부모 노드 key. 중심 노드만 생략"),
            edgeLabel: z.string().optional().describe("부모→이 노드 선의 라벨"),
            blocks: z.array(bridgeBlockSchema).optional().describe("본문 블록(이미지 등), notes_create와 같다"),
          }),
        )
        .min(1),
      links: z
        .array(z.object({ from: z.string(), to: z.string(), label: z.string().optional() }))
        .optional()
        .describe("나무 밖의 관계선(노드 key끼리)"),
    },
  },
  async ({ boardId, layout, origin, size, nodes, links }) =>
    attempt(async () => {
      const { nodes: placed, edges } = layoutMindmap(nodes, {
        layout,
        origin,
        size,
        rootSize: size !== undefined ? Math.round(size * 4 / 3) : undefined,
      });
      const byKey = new Map(nodes.map((n) => [n.key, n]));
      for (const l of links ?? []) {
        if (!byKey.has(l.from) || !byKey.has(l.to)) throw new Error(`links에 없는 key: ${l.from}→${l.to}`);
      }
      const ids = new Map<string, string>();
      for (const p of placed) {
        const n = byKey.get(p.key)!;
        const blocks = n.blocks ? await resolveBridgeBlocks(n.blocks) : undefined;
        const r = (await bridge.call("notes.create", {
          content: n.content ?? "",
          title: n.title,
          boardId,
          x: p.x,
          y: p.y,
          width: p.size,
          blocks,
        })) as { id: string };
        ids.set(p.key, r.id);
      }
      let connections = 0;
      for (const e of edges) {
        await bridge.call("connections.create", {
          sourceNoteId: ids.get(e.from),
          targetNoteId: ids.get(e.to),
          sourceSide: e.sourceSide,
          targetSide: e.targetSide,
          label: byKey.get(e.to)!.edgeLabel,
        });
        connections++;
      }
      for (const l of links ?? []) {
        await bridge.call("connections.create", {
          sourceNoteId: ids.get(l.from),
          targetNoteId: ids.get(l.to),
          label: l.label,
        });
        connections++;
      }
      return { nodes: Object.fromEntries(ids), connections };
    }),
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
