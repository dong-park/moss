import { HocuspocusProvider, WebSocketStatus } from "@hocuspocus/provider";
import type * as Y from "yjs";

/**
 * FEAT-collab-auth n7 — Hocuspocus provider 얇은 래퍼.
 *
 * 스토어는 이 인터페이스만 알고, 테스트는 가짜 팩토리를 주입한다. 실제
 * `@hocuspocus/provider` import는 이 파일에만 있다 — 나머지 코드는 provider
 * 없이도 로드된다.
 */

/** provider 연결 상태. store의 status와 같은 어휘를 쓴다. */
export type CollabStatus = "connecting" | "connected" | "disconnected";

/**
 * Awareness 최소 인터페이스(y-protocols Awareness). 스토어가 쓰는 것만 노출한다.
 * 직접 y-protocols에 의존하지 않으려고 여기서 좁게 선언한다.
 */
export interface CollabAwareness {
  /** 이 클라이언트의 Yjs clientID. 자기 자신을 원격 목록에서 걸러내는 데 쓴다. */
  clientID: number;
  getStates(): Map<number, Record<string, unknown>>;
  setLocalStateField(field: string, value: unknown): void;
  on(event: "change", handler: () => void): void;
  off(event: "change", handler: () => void): void;
}

export interface CollabProviderConfig {
  url: string;
  /** 문서 이름 = boardId (n5 계약). */
  name: string;
  document: Y.Doc;
  /**
   * (재)연결 때마다 불린다. 액세스 토큰이 만료 임박이면 조용히 갱신하고
   * 보드 토큰을 새로 받는다 — AC-11에서 사용자 개입 없이 재연결되는 근거.
   */
  token: () => Promise<string>;
  onStatus(status: CollabStatus): void;
  onAuthenticationFailed(reason: string): void;
  /** 서버가 연결을 끊은 close code. 4403이면 해제·내보내기. */
  onClose(code: number): void;
  /**
   * 첫 핸드셰이크가 끝났을 때. 업로드용 일회 연결이 이 신호로 끝을 잡는다.
   * 활성 세션은 쓰지 않는다.
   */
  onSynced?(): void;
}

export interface CollabProviderHandle {
  awareness: CollabAwareness | null;
  connect(): void;
  disconnect(): void;
  destroy(): void;
}

export interface CollabProviderFactory {
  create(config: CollabProviderConfig): CollabProviderHandle;
}

function mapStatus(status: WebSocketStatus): CollabStatus {
  if (status === WebSocketStatus.Connected) return "connected";
  if (status === WebSocketStatus.Connecting) return "connecting";
  return "disconnected";
}

/** 서버가 내보내기·해제로 끊을 때 쓰는 close code (n5 server.ts). */
export const CLOSE_FORBIDDEN = 4403;
/** 동기화 문서가 한도(10MB)를 넘어 서버가 끊을 때 쓰는 close code (sync/server.ts). */
export const CLOSE_DOCUMENT_TOO_LARGE = 4413;

export const realProviderFactory: CollabProviderFactory = {
  create(config) {
    const provider = new HocuspocusProvider({
      url: config.url,
      name: config.name,
      document: config.document,
      token: config.token,
      onStatus: ({ status }) => config.onStatus(mapStatus(status)),
      onAuthenticationFailed: ({ reason }) => config.onAuthenticationFailed(reason),
      onClose: ({ event }) => config.onClose(event.code),
      onSynced: () => config.onSynced?.(),
    });
    return {
      awareness: (provider.awareness as unknown as CollabAwareness | null) ?? null,
      connect: () => {
        void provider.connect();
      },
      disconnect: () => provider.disconnect(),
      destroy: () => provider.destroy(),
    };
  },
};
