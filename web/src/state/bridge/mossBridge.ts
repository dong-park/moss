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

import { useWorkspace, type Card } from "@/state/workspace";

/** 외부로 노출하는 카드 표현 — 내부 Card에서 렌더·영속에 필요한 필드만 추린다. */
export interface BridgeNote {
  id: string;
  kind: string;
  content: string;
  x: number;
  y: number;
  width: number;
  height?: number;
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

    case "notes.list":
      return ws.cards.map(toBridgeNote);

    case "notes.get": {
      const id = String(params.id ?? "");
      const card = ws.cards.find((c) => c.id === id);
      if (!card) throw new Error(`카드를 찾을 수 없습니다: ${id}`);
      return toBridgeNote(card);
    }

    case "notes.create": {
      const content = typeof params.content === "string" ? params.content : "";
      const x = typeof params.x === "number" ? params.x : 40;
      const y = typeof params.y === "number" ? params.y : 40;
      // MVP: 본문 카드(text). kind 인자는 후속 확장용으로만 받아둔다.
      const id = ws.addCardAt("text", x, y);
      if (content) ws.setContent(id, content);
      // 프로그래매틱 생성은 편집 모드/선택을 남기지 않는다.
      ws.setEditing(null);
      ws.clearSelection();
      return { id };
    }

    case "notes.update": {
      const id = String(params.id ?? "");
      const content = typeof params.content === "string" ? params.content : "";
      if (!ws.cards.some((c) => c.id === id)) {
        throw new Error(`카드를 찾을 수 없습니다: ${id}`);
      }
      ws.setContent(id, content);
      return { id };
    }

    case "notes.delete": {
      const id = String(params.id ?? "");
      if (!ws.cards.some((c) => c.id === id)) {
        throw new Error(`카드를 찾을 수 없습니다: ${id}`);
      }
      ws.remove(id);
      return { id };
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
