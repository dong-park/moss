/* ─────────────────────────────────────────────────────────────
 * moss-mcp 데이터 브리지 (경로 A — 인-페이지 데이터 브리지)
 *
 * moss 데이터는 브라우저 IndexedDB(Dexie)에만 산다 → Node MCP 프로세스가
 * 직접 못 읽는다. 브라우저는 서버가 될 수 없으므로(아웃바운드만 가능),
 * **MCP가 WS 서버를 호스팅**하고 실행 중인 moss 탭이 클라이언트로 접속한다.
 *
 * 프로토콜 (JSON):
 *   mcp → moss : { type:"op", id, op, params }
 *   moss → mcp : { type:"result", id, ok:true, result }  |  { type:"result", id, ok:false, error }
 *
 * UI/DOM을 건드리지 않는 순수 데이터 RPC. moss 측이 op를 useWorkspace 액션으로
 * 디스패치해 화면 반영 + Dexie 영속을 함께 수행한다(web/src/state/bridge/mossBridge.ts).
 *
 * 설계: 상관(correlation)·타임아웃 로직([[BridgeCore]])을 WS 전송 계층([[MossBridge]])과
 * 분리한다. core는 소켓 없이 단위 테스트하고, 실제 소켓 왕복은 브라우저 스모크로 검증한다.
 * ───────────────────────────────────────────────────────────── */

import { WebSocketServer, WebSocket, type RawData } from "ws";

/** 접속한 moss로 프레임을 내보내는 함수. 미접속이면 null. */
export type Sender = ((frame: string) => void) | null;

interface Pending {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** moss 탭이 한 곳도 접속하지 않은 상태에서 데이터 op를 호출하면 던지는 에러. */
export class MossNotConnectedError extends Error {
  constructor() {
    super(
      "실행 중인 moss 탭이 브리지에 접속하지 않았습니다. moss를 NEXT_PUBLIC_MOSS_BRIDGE=1 로 띄우고 같은 포트를 가리키는지 확인하세요.",
    );
    this.name = "MossNotConnectedError";
  }
}

/**
 * 전송 계층과 무관한 op 상관/타임아웃 코어. sender 함수만 주입받으므로
 * 실제 소켓 없이 결정적으로 테스트할 수 있다.
 */
export class BridgeCore {
  private sender: Sender = null;
  private readonly pending = new Map<string, Pending>();
  private seq = 0;

  constructor(private readonly timeoutMs: number = 10_000) {}

  /** 활성 송신자를 설정/해제한다(접속/끊김). 해제 시 대기 중 호출을 모두 reject. */
  setSender(sender: Sender): void {
    this.sender = sender;
    if (sender === null) {
      for (const [, entry] of this.pending) {
        clearTimeout(entry.timer);
        entry.reject(new MossNotConnectedError());
      }
      this.pending.clear();
    }
  }

  isConnected(): boolean {
    return this.sender !== null;
  }

  /** moss가 보낸 result 프레임을 받아 대기 중 호출을 resolve/reject 한다. */
  handleResult(raw: string): void {
    let msg: unknown;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (
      typeof msg !== "object" ||
      msg === null ||
      (msg as { type?: unknown }).type !== "result"
    ) {
      return;
    }
    const { id, ok, result, error } = msg as {
      id?: string;
      ok?: boolean;
      result?: unknown;
      error?: string;
    };
    if (typeof id !== "string") return;
    const entry = this.pending.get(id);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.pending.delete(id);
    if (ok) entry.resolve(result);
    else entry.reject(new Error(error ?? "moss 브리지가 op를 거부했습니다."));
  }

  /** op를 보내고 result를 기다린다. 미접속이면 MossNotConnectedError, 무응답이면 타임아웃. */
  call(op: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const sender = this.sender;
    if (!sender) return Promise.reject(new MossNotConnectedError());
    const id = `${++this.seq}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`moss op "${op}" 응답 타임아웃 (${this.timeoutMs}ms)`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      sender(JSON.stringify({ type: "op", id, op, params }));
    });
  }
}

export interface BridgeOptions {
  port: number;
  host?: string;
  /** op 응답 대기 타임아웃(ms). 기본 10초. */
  timeoutMs?: number;
}

/**
 * BridgeCore를 WebSocket 서버에 연결한다. 가장 최근 접속한 moss 소켓 하나에만
 * op를 보낸다(단일 사용자 가정).
 */
export class MossBridge {
  private wss: WebSocketServer | null = null;
  private client: WebSocket | null = null;
  private readonly core: BridgeCore;

  constructor(private readonly opts: BridgeOptions) {
    this.core = new BridgeCore(opts.timeoutMs);
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const wss = new WebSocketServer({
        port: this.opts.port,
        host: this.opts.host ?? "127.0.0.1",
      });
      this.wss = wss;
      wss.on("listening", () => resolve());
      wss.on("error", (err) => reject(err));
      wss.on("connection", (socket) => this.attach(socket));
    });
  }

  private attach(socket: WebSocket): void {
    this.client = socket;
    this.core.setSender((frame) => socket.send(frame));
    socket.on("message", (data: RawData) => this.core.handleResult(data.toString()));
    const drop = () => {
      if (this.client === socket) {
        this.client = null;
        this.core.setSender(null);
      }
    };
    socket.on("close", drop);
    socket.on("error", drop);
  }

  isConnected(): boolean {
    return this.client !== null && this.client.readyState === WebSocket.OPEN;
  }

  /** 실제로 바인딩된 포트(opts.port가 0이면 OS가 할당한 포트). 미기동 시 null. */
  boundPort(): number | null {
    const addr = this.wss?.address();
    return addr && typeof addr === "object" ? addr.port : null;
  }

  call(op: string, params: Record<string, unknown> = {}): Promise<unknown> {
    return this.core.call(op, params);
  }

  async close(): Promise<void> {
    this.core.setSender(null);
    const wss = this.wss;
    this.wss = null;
    this.client = null;
    if (!wss) return;
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, 500);
      wss.close(() => {
        clearTimeout(t);
        resolve();
      });
    });
  }
}
