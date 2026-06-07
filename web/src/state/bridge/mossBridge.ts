"use client";

/* ─────────────────────────────────────────────────────────────
 * moss 측 데이터 브리지 클라이언트 (경로 A).
 *
 * 실행 중 moss 탭이 moss-mcp 서버가 호스팅하는 WS 릴레이에 *클라이언트로* 접속해,
 * 외부 에이전트가 보낸 데이터 op를 받아 처리하고 결과를 돌려준다.
 *
 *   mcp → moss : { type:"op", id, op, params }
 *   moss → mcp : { type:"result", id, ok, result|error }
 *
 * **UI/DOM을 시뮬레이션하지 않는다.** op를 useWorkspace 액션으로 디스패치해
 * 화면 반영(in-memory cards)과 Dexie 영속을 함께 일으킨다 — 단일 탭에서도
 * 즉시 렌더되도록(BroadcastChannel self-echo 없음) 반드시 store 경로를 탄다.
 *
 * 보안 게이트: NEXT_PUBLIC_MOSS_BRIDGE === "1" 일 때만 동작. 프로덕션 빌드에서
 * 이 환경변수 없이 빌드하면 Next가 상수 폴딩으로 본문을 죽은 코드로 제거한다.
 *
 * MVP 범위(T4): notes CRUD. 모든 op는 "현재 보드" 기준으로 동작한다.
 * ───────────────────────────────────────────────────────────── */

import {
  useWorkspace,
  type Card,
  type ToolId,
  SYSTEM_BOARD_ID,
  encodeComment,
  encodeSubcanvas,
  __internal,
} from "@/state/workspace";
import { useStorage } from "@/state/storage";
import { getDB, type NoteKind } from "@/state/db/schema";
import {
  serializeLink,
  serializeMindmap,
  makeMindmapNodeId,
  type MindmapNode,
} from "@/state/cardContent";
import { putBlob, makeAttachmentFilename } from "@/state/db/opfs";

/** 외부로 노출하는 카드 표현 — 내부 Card에서 렌더·영속에 필요한 필드만 추린다. */
export interface BridgeNote {
  id: string;
  kind: string;
  content: string;
  x: number;
  y: number;
  width: number;
  height?: number;
  attachmentRef?: string;
  mediaType?: string;
  boardRef?: string;
}

/**
 * boardId 파라미터를 storage용 boardId(null=시스템)와 "현재 보드인가"로 해석한다.
 * raw가 없으면 현재 보드를 대상으로 본다.
 */
function resolveBoard(raw: unknown): {
  storageId: string | null;
  isCurrent: boolean;
  target: string;
} {
  const current = useWorkspace.getState().currentBoardId;
  const target = typeof raw === "string" && raw ? raw : current;
  return {
    storageId: target === SYSTEM_BOARD_ID ? null : target,
    isCurrent: target === current,
    target,
  };
}

function newNoteId(): string {
  return `c-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`;
}

/**
 * 생성 가능한 카드 종류 → 저장 content 인코딩.
 * - text: 마크다운 그대로(코드/체크리스트/인용도 moss는 text 카드의 마크다운으로 다룬다).
 * - link: content=URL → LinkContent JSON.
 * - mindmap: content=중심 토픽 → 루트 노드 1개.
 * image/audio/file(첨부 필요), comment/board(특수 인코딩), handwriting(획)은 미지원.
 */
function buildNoteContent(
  kind: string,
  raw: string,
): { noteKind: NoteKind; toolId: ToolId; stored: string } {
  switch (kind) {
    case "text":
      return { noteKind: "text", toolId: "text", stored: raw };
    case "link":
      return { noteKind: "link", toolId: "link", stored: serializeLink({ url: raw }) };
    case "mindmap":
      return {
        noteKind: "mindmap",
        toolId: "mindmap",
        stored: serializeMindmap({ root: { id: "root", text: raw, children: [] } }),
      };
    default:
      throw new Error(
        `지원하지 않는 kind: ${kind}. (text|link|mindmap) — 코드/체크리스트/인용은 text 카드에 마크다운으로, image/audio/file은 첨부가 필요해 미지원.`,
      );
  }
}

function toBridgeNote(card: Card): BridgeNote {
  return {
    id: card.id,
    kind: card.kind,
    content: card.content,
    x: card.x,
    y: card.y,
    width: card.width,
    height: card.height,
    attachmentRef: card.attachmentRef,
    mediaType: card.mediaType,
    boardRef: card.boardRef,
  };
}

/** base64 → Blob (브라우저). 첨부를 OPFS에 넣기 위한 디코딩. */
function base64ToBlob(dataBase64: string, mimeType: string): Blob {
  const bin = atob(dataBase64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

/**
 * 첨부(image/audio/file) 카드 공통 생성. base64 → OPFS blob(putBlob) → attachmentRef.
 * OPFS는 브라우저 전용이라 blob 저장이 여기(moss 탭)서 일어난다. kind는 곧 ToolId.
 */
async function createAttachmentCard(
  kind: "image" | "audio" | "file",
  params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const dataBase64 = typeof params.dataBase64 === "string" ? params.dataBase64 : "";
  const mimeType = typeof params.mimeType === "string" ? params.mimeType : "";
  if (!dataBase64 || !mimeType) throw new Error("dataBase64와 mimeType이 필요합니다");
  const caption = typeof params.content === "string" ? params.content : "";
  const x = typeof params.x === "number" ? params.x : 40;
  const y = typeof params.y === "number" ? params.y : 40;
  const ref = await putBlob(makeAttachmentFilename(mimeType), base64ToBlob(dataBase64, mimeType));
  const { storageId, isCurrent } = resolveBoard(params.boardId);
  if (isCurrent) {
    const ws = useWorkspace.getState();
    const id = ws.addCardAt(kind, x, y);
    ws.setAttachment(id, ref, { mediaType: mimeType, content: caption });
    ws.setEditing(null);
    ws.clearSelection();
    return { id, kind, attachmentRef: ref, mediaType: mimeType };
  }
  const id = newNoteId();
  await useStorage.getState().saveNote({
    id,
    boardId: storageId,
    kind,
    attachmentRef: ref,
    mediaType: mimeType,
    content: caption,
    x,
    y,
    aiOptOut: false,
    rotation: 0,
  });
  return { id, kind, attachmentRef: ref, mediaType: mimeType, boardId: storageId };
}

/**
 * params.images(base64)를 OPFS에 올려 markdown 본문에 인라인 이미지로 박는다(text 메모용).
 * 마크다운 URL 스킴은 `opfs://<filename>`(opfsImagePlugin이 blob URL로 렌더).
 * placeholder가 있으면 본문의 `{{placeholder}}`를 치환, 없으면 본문 끝에 덧붙인다.
 */
async function embedInlineImages(content: string, images: unknown): Promise<string> {
  if (!Array.isArray(images) || images.length === 0) return content;
  let out = content;
  for (const img of images) {
    const o = (img && typeof img === "object" ? img : {}) as {
      dataBase64?: unknown;
      mimeType?: unknown;
      alt?: unknown;
      placeholder?: unknown;
    };
    if (typeof o.dataBase64 !== "string" || typeof o.mimeType !== "string") continue;
    const filename = makeAttachmentFilename(o.mimeType);
    await putBlob(filename, base64ToBlob(o.dataBase64, o.mimeType));
    const md = `![${typeof o.alt === "string" ? o.alt : ""}](opfs://${filename})`;
    const ph = typeof o.placeholder === "string" ? o.placeholder : "";
    if (ph && out.includes(`{{${ph}}}`)) out = out.split(`{{${ph}}}`).join(md);
    else out += (out ? "\n\n" : "") + md;
  }
  return out;
}

/** {text, children?} 트리를 MindmapNode로 재귀 변환. 루트 id는 "root". */
function buildMindmapNode(raw: unknown, isRoot: boolean): MindmapNode {
  const o = (raw && typeof raw === "object" ? raw : {}) as {
    text?: unknown;
    children?: unknown;
  };
  const children = Array.isArray(o.children)
    ? o.children.map((c) => buildMindmapNode(c, false))
    : [];
  return {
    id: isRoot ? "root" : makeMindmapNodeId(),
    text: typeof o.text === "string" ? o.text : "",
    children,
  };
}

/**
 * 데이터 op를 useWorkspace 액션으로 디스패치한다. 순수하게 store만 만지므로
 * 테스트에서 store를 갈아끼워 단위 검증할 수 있다(WS 전송 계층과 분리).
 */
export async function dispatchOp(
  op: string,
  params: Record<string, unknown> = {},
): Promise<unknown> {
  const ws = useWorkspace.getState();
  switch (op) {
    case "ping":
      return { connected: true, boardId: ws.currentBoardId, cards: ws.cards.length };

    // boardId를 주면 현재 보드가 아니어도 그 보드를 직접 타겟한다.
    // - 현재 보드: store 경유(즉시 렌더 + 영속)
    // - 다른 보드: storage(Dexie) 직접(화면 밖이라 렌더 불필요, 전환 시 로드됨)
    case "notes.list": {
      const { storageId, isCurrent } = resolveBoard(params.boardId);
      if (isCurrent) return ws.cards.map(toBridgeNote);
      const notes = await useStorage.getState().loadCards(storageId);
      return notes.map((n) => toBridgeNote(__internal.decodeNoteToCard(n)));
    }

    // get/update/delete는 id로 보드 무관하게 동작한다(현재 보드면 store 경유로 렌더).
    case "notes.get": {
      const id = String(params.id ?? "");
      if (!id) throw new Error("id가 필요합니다");
      const inStore = ws.cards.find((c) => c.id === id);
      if (inStore) return toBridgeNote(inStore);
      const note = await getDB().notes.get(id);
      if (!note) throw new Error(`카드를 찾을 수 없습니다: ${id}`);
      return toBridgeNote(__internal.decodeNoteToCard(note));
    }

    case "notes.create": {
      const raw = typeof params.content === "string" ? params.content : "";
      const x = typeof params.x === "number" ? params.x : 40;
      const y = typeof params.y === "number" ? params.y : 40;
      // 메모 본문은 고정 폭(MEMO_CONTENT_WIDTH=720) 컬럼이라, 카드가 그보다 좁으면
      // 우측이 잘린다. 긴 텍스트는 width로 넓혀야 보인다.
      const width = typeof params.width === "number" ? params.width : undefined;
      const height = typeof params.height === "number" ? params.height : undefined;
      const kind = typeof params.kind === "string" && params.kind ? params.kind : "text";
      const { noteKind, toolId, stored } = buildNoteContent(kind, raw);
      // 인라인 이미지(text 메모만): OPFS 업로드 후 ![](opfs://..)로 본문에 박는다.
      const hasImages = Array.isArray(params.images) && params.images.length > 0;
      const finalContent =
        noteKind === "text" ? await embedInlineImages(stored, params.images) : stored;
      // 이미지/긴 글은 720 컬럼이 필요 — width 미지정이면 이미지 있을 때 720 기본.
      const effWidth = width !== undefined ? width : hasImages ? 720 : undefined;
      const { storageId, isCurrent } = resolveBoard(params.boardId);
      if (isCurrent) {
        const id = ws.addCardAt(toolId, x, y);
        if (effWidth !== undefined || height !== undefined) {
          useWorkspace.setState((s) => ({
            cards: s.cards.map((c) =>
              c.id === id
                ? {
                    ...c,
                    ...(effWidth !== undefined ? { width: effWidth } : {}),
                    ...(height !== undefined ? { height } : {}),
                  }
                : c,
            ),
          }));
        }
        // width/height 패치 후 영속되도록 setContent를 항상 호출(빈 본문도 OK).
        ws.setContent(id, finalContent);
        ws.setEditing(null);
        ws.clearSelection();
        return { id, kind: noteKind };
      }
      const id = newNoteId();
      await useStorage.getState().saveNote({
        id,
        boardId: storageId,
        kind: noteKind,
        x,
        y,
        ...(effWidth !== undefined ? { width: effWidth } : {}),
        ...(height !== undefined ? { height } : {}),
        content: finalContent,
        aiOptOut: false,
        rotation: 0,
      });
      return { id, kind: noteKind, boardId: storageId };
    }

    case "notes.update": {
      const id = String(params.id ?? "");
      const content = typeof params.content === "string" ? params.content : "";
      if (!id) throw new Error("id가 필요합니다");
      if (ws.cards.some((c) => c.id === id)) {
        ws.setContent(id, content);
        return { id };
      }
      // 다른 보드 카드 — 존재 확인 후 content만 병합 저장(없으면 junk 생성 방지).
      const note = await getDB().notes.get(id);
      if (!note) throw new Error(`카드를 찾을 수 없습니다: ${id}`);
      await useStorage.getState().saveNote({ id, content });
      return { id };
    }

    case "notes.delete": {
      const id = String(params.id ?? "");
      if (!id) throw new Error("id가 필요합니다");
      if (ws.cards.some((c) => c.id === id)) {
        ws.remove(id);
        return { id };
      }
      const note = await getDB().notes.get(id);
      if (!note) throw new Error(`카드를 찾을 수 없습니다: ${id}`);
      await useStorage.getState().removeNote(id);
      return { id };
    }

    // 첨부 카드(image/audio/file): base64 → OPFS blob → attachmentRef.
    case "notes.createImage":
      return createAttachmentCard("image", params);
    case "notes.createAudio":
      return createAttachmentCard("audio", params);
    case "notes.createFile":
      return createAttachmentCard("file", params);

    // 가지 있는 마인드맵: {text, children?} 트리 → MindmapNode → mindmap 카드.
    case "notes.createMindmap": {
      if (!params.tree || typeof params.tree !== "object") {
        throw new Error("tree가 필요합니다");
      }
      const stored = serializeMindmap({ root: buildMindmapNode(params.tree, true) });
      const x = typeof params.x === "number" ? params.x : 40;
      const y = typeof params.y === "number" ? params.y : 40;
      const { storageId, isCurrent } = resolveBoard(params.boardId);
      if (isCurrent) {
        const id = ws.addCardAt("mindmap", x, y);
        ws.setContent(id, stored);
        ws.setEditing(null);
        ws.clearSelection();
        return { id, kind: "mindmap" };
      }
      const id = newNoteId();
      await useStorage.getState().saveNote({
        id,
        boardId: storageId,
        kind: "mindmap",
        content: stored,
        x,
        y,
        aiOptOut: false,
        rotation: 0,
      });
      return { id, kind: "mindmap", boardId: storageId };
    }

    // comment 카드: author/time 메타 + 본문. moss는 kind="text" + 마커 JSON으로 저장하고
    // decode 시 comment로 환원한다. 현재 보드면 store(comment 카드)로 즉시 렌더.
    case "notes.createComment": {
      const body = typeof params.content === "string" ? params.content : "";
      const author = typeof params.author === "string" ? params.author : "MCP";
      const time = typeof params.time === "string" ? params.time : "";
      const x = typeof params.x === "number" ? params.x : 40;
      const y = typeof params.y === "number" ? params.y : 40;
      const { storageId, isCurrent } = resolveBoard(params.boardId);
      if (isCurrent) {
        const id = ws.addCardAt("comment", x, y);
        // author/time을 카드에 먼저 심고(setContent의 persist가 함께 인코딩하도록), 본문 설정.
        useWorkspace.setState((s) => ({
          cards: s.cards.map((c) => (c.id === id ? { ...c, author, time } : c)),
        }));
        ws.setContent(id, body);
        ws.setEditing(null);
        ws.clearSelection();
        return { id, kind: "comment" };
      }
      const id = newNoteId();
      await useStorage.getState().saveNote({
        id,
        boardId: storageId,
        kind: "text", // comment는 text + 마커로 저장(decode가 comment로 환원)
        content: encodeComment(body, author, time),
        x,
        y,
        aiOptOut: false,
        rotation: 0,
      });
      return { id, kind: "comment", boardId: storageId };
    }

    // 함(board) 카드: 서브 캔버스를 가리키는 funnel + 빈 서브 보드 생성.
    // 현재 보드면 createSubcanvas(즉시 렌더), 타 보드면 saveBoard+saveNote.
    // 서브 보드 이름은 비움 — 필요하면 boards_rename(boardRef, name)으로.
    case "notes.createBoard": {
      const x = typeof params.x === "number" ? params.x : 40;
      const y = typeof params.y === "number" ? params.y : 40;
      const { storageId, isCurrent, target } = resolveBoard(params.boardId);
      if (isCurrent) {
        const id = ws.createSubcanvas(x, y);
        const card = useWorkspace.getState().cards.find((c) => c.id === id);
        ws.clearSelection();
        return { id, kind: "board", boardRef: card?.boardRef };
      }
      const childBoardId = `b-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`;
      const storage = useStorage.getState();
      await storage.saveBoard({
        id: childBoardId,
        name: "",
        isSystem: false,
        parentBoardId: target,
      });
      const id = newNoteId();
      await storage.saveNote({
        id,
        boardId: storageId,
        kind: "board",
        content: encodeSubcanvas(childBoardId),
        x,
        y,
        aiOptOut: false,
        rotation: 0,
      });
      return { id, kind: "board", boardRef: childBoardId, boardId: storageId };
    }

    case "ai.preview": {
      // /api/preview는 same-origin만 허용한다(SSRF 가드). in-page fetch는 정당하게 통과.
      const url = String(params.url ?? "");
      if (!url) throw new Error("url이 필요합니다");
      const res = await fetch(`/api/preview?url=${encodeURIComponent(url)}`);
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`/api/preview 실패 ${res.status}: ${detail}`);
      }
      return res.json();
    }

    /* ── boards: useWorkspace 액션 경유(보드 목록·UI 라이브 반영) ── */
    case "boards.list":
      return {
        boards: ws.boards.map((b) => ({ id: b.id, name: b.name })),
        current: ws.currentBoardId,
      };

    case "boards.create": {
      const name = typeof params.name === "string" ? params.name : "";
      const id = await ws.createBoard(name); // 새 보드로 전환됨
      return { id };
    }

    case "boards.rename": {
      const id = String(params.id ?? "");
      const name = String(params.name ?? "");
      if (!id || !name) throw new Error("id와 name이 필요합니다");
      await ws.renameBoard(id, name);
      return { id, name };
    }

    case "boards.delete": {
      const id = String(params.id ?? "");
      if (!id) throw new Error("id가 필요합니다");
      await ws.removeBoard(id);
      return { id };
    }

    case "boards.switch": {
      const id = String(params.id ?? "");
      if (!id) throw new Error("id가 필요합니다");
      await ws.setCurrentBoard(id);
      return { currentBoardId: useWorkspace.getState().currentBoardId };
    }

    /* ── connections: 캔버스 렌더 대상 아님 → storage(Dexie) 데이터 경로 ── */
    case "connections.list": {
      const storage = useStorage.getState();
      const noteId = typeof params.noteId === "string" ? params.noteId : undefined;
      return storage.loadConnections(noteId ? [noteId] : undefined);
    }

    case "connections.create": {
      const sourceNoteId = String(params.sourceNoteId ?? "");
      const targetNoteId = String(params.targetNoteId ?? "");
      if (!sourceNoteId || !targetNoteId) {
        throw new Error("sourceNoteId와 targetNoteId가 필요합니다");
      }
      const label = typeof params.label === "string" ? params.label : undefined;
      const id = `cx-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`;
      // mergeConnection이 source="manual"/status="active"/createdAt을 채운다.
      await useStorage.getState().saveConnection({ id, sourceNoteId, targetNoteId, label });
      return { id };
    }

    case "connections.delete": {
      const id = String(params.id ?? "");
      if (!id) throw new Error("id가 필요합니다");
      await useStorage.getState().removeConnection(id);
      return { id };
    }

    default:
      throw new Error(`알 수 없는 op: ${op}`);
  }
}

const DEFAULT_URL = "ws://127.0.0.1:7333";
const RECONNECT_MS = 3000;

let started = false;
let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

/** 브리지 활성 여부 — 빌드 타임 상수 게이트. */
function bridgeEnabled(): boolean {
  return process.env.NEXT_PUBLIC_MOSS_BRIDGE === "1";
}

function connect(url: string): void {
  socket = new WebSocket(url);

  socket.onmessage = (ev: MessageEvent) => {
    let msg: { type?: string; id?: string; op?: string; params?: Record<string, unknown> };
    try {
      msg = JSON.parse(String(ev.data));
    } catch {
      return;
    }
    if (msg.type !== "op" || typeof msg.id !== "string" || typeof msg.op !== "string") {
      return;
    }
    const { id, op, params } = msg;
    void dispatchOp(op, params ?? {})
      .then((result) => send({ type: "result", id, ok: true, result }))
      .catch((err: unknown) =>
        send({
          type: "result",
          id,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
  };

  socket.onclose = () => {
    socket = null;
    scheduleReconnect(url);
  };

  // onerror 직후 보통 onclose가 따라오지만, 안전하게 명시적으로 닫는다.
  socket.onerror = () => socket?.close();
}

function send(payload: Record<string, unknown>): void {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function scheduleReconnect(url: string): void {
  if (reconnectTimer !== null) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect(url);
  }, RECONNECT_MS);
}

/**
 * 브리지 클라이언트를 시작한다(멱등). 게이트가 꺼져 있거나 SSR이면 no-op.
 * 앱 부팅 시 [[StorageBootstrap]]에서 한 번 호출한다.
 */
export function startMossBridge(): void {
  if (started) return;
  if (!bridgeEnabled()) return;
  if (typeof window === "undefined" || typeof WebSocket === "undefined") return;
  started = true;
  const url = process.env.NEXT_PUBLIC_MOSS_BRIDGE_URL ?? DEFAULT_URL;
  connect(url);
}
