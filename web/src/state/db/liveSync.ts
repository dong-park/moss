"use client";

/* ─────────────────────────────────────────────────────────────
 * FEAT-collab-auth n3 — 탭 간 동기화를 Yjs 업데이트 브로드캐스트로 전환.
 *
 * 기존 FEAT-memo-multitab-sync의 카드 단위 충돌 처리(updatedAt 비교·편집 보호·
 * 충돌 배너)는 걷어낸다(spec §7). 같은 기기의 탭 2개가 같은 보드를 열면
 * Yjs 업데이트를 BroadcastChannel로 그대로 주고받아 문서가 수렴한다.
 *
 *  - 발신: 활성 보드 Y.Doc의 `update` 이벤트 중 로컬 origin(LOCAL_ORIGIN)만
 *    방송한다. y-indexeddb 복원·원격 적용은 재방송하지 않는다(origin이 다르다).
 *  - 수신: 같은 보드 키의 업데이트를 채널 origin으로 적용한다. 그 origin은
 *    LOCAL_ORIGIN이 아니라서 스토어 반영 observer(n3의 bindActiveDocReflection)가
 *    정상적으로 통과시킨다.
 *
 * 단일 탭에서는 BroadcastChannel이 자기 발신을 자기에게 돌려주지 않아 수신 0.
 * ───────────────────────────────────────────────────────────── */

import * as Y from "yjs";
import { LOCAL_ORIGIN } from "../ydoc/origin";

const CHANNEL_NAME = "moss-ydoc-sync";

/** 수신 업데이트 크기 상한(spec 한도: 문서 10MB). 넘으면 신뢰 경계 밖으로 보고 버린다. */
export const MAX_UPDATE_BYTES = 10 * 1024 * 1024;

/** 채널로 적용한 업데이트의 origin — 로컬이 아님을 표시(재방송·반영 구분). */
const CHANNEL_ORIGIN: unique symbol = Symbol("moss-channel-origin");

export type YDocSyncMsg = {
  type: "ydoc-update";
  /** 보드 문서 키(`moss-board-<key>`의 key). */
  key: string;
  update: Uint8Array;
  /** 발신 탭 id — 자기 발신 무시용. */
  origin: string;
};

/** 탭별 고유 id — 자기 발신 메시지 식별. 탭(문서) 수명 동안 불변. */
const tabId = makeTabId();

function makeTabId(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
  } catch {
    /* noop */
  }
  return `tab-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

let channel: BroadcastChannel | null = null;

/** 현재 활성 문서 — attachLiveDoc이 교체한다. */
let currentDoc: Y.Doc | null = null;
let currentKey: string | null = null;
let detachDoc: (() => void) | null = null;

/** 로컬 쓰기만 방송한다. */
function postUpdate(key: string, update: Uint8Array): void {
  if (!channel) return;
  try {
    channel.postMessage({ type: "ydoc-update", key, update, origin: tabId } satisfies YDocSyncMsg);
  } catch {
    /* 직렬화/전송 실패는 동기화 best-effort라 무시 */
  }
}

/**
 * 활성 문서에 발신 리스너를 건다. 보드 전환마다 새 문서로 교체한다.
 * 이전 문서 리스너는 해제한다.
 */
export function attachLiveDoc(doc: Y.Doc, key: string): void {
  detachDoc?.();
  currentDoc = doc;
  currentKey = key;
  const onUpdate = (update: Uint8Array, origin: unknown) => {
    // 로컬 origin만 방송 — y-indexeddb 복원·채널 적용은 재방송하지 않는다.
    if (origin !== LOCAL_ORIGIN) return;
    postUpdate(key, update);
  };
  doc.on("update", onUpdate);
  detachDoc = () => {
    doc.off("update", onUpdate);
    detachDoc = null;
    if (currentDoc === doc) {
      currentDoc = null;
      currentKey = null;
    }
  };
}

/** 다른 탭에서 온 업데이트를 적용한다. 테스트에서도 직접 호출한다. */
export function applyIncoming(msg: YDocSyncMsg): void {
  if (!msg || msg.origin === tabId) return; // 자기 발신
  if (!currentDoc || !currentKey || msg.key !== currentKey) return; // 다른 보드/문서 없음
  // (n3 리뷰 P1) wire 입력은 타입·크기를 신뢰하지 않는다. 임의 값·거대 payload가
  // applyUpdate로 들어가면 문서가 오염되거나 메모리·쿼터가 소진된다.
  if (!(msg.update instanceof Uint8Array) || msg.update.byteLength > MAX_UPDATE_BYTES) return;
  try {
    Y.applyUpdate(currentDoc, msg.update, CHANNEL_ORIGIN);
  } catch {
    /* 잘린/손상 바이트 — 부분 적용을 막기 위해 조용히 버린다. */
  }
}

/**
 * 활성 문서가 아닌 문서의 로컬 변경을 그 문서 키로 방송한다(6(a)).
 * `write`가 만든 변경분만 계산해 보낸다 — y-indexeddb 저장·원격 적용은 origin이
 * 달라 이 경로로 새지 않는다.
 */
export function broadcastDocWrite(key: string, doc: Y.Doc, write: () => void): void {
  if (!channel) {
    write();
    return;
  }
  const before = Y.encodeStateVector(doc);
  write();
  try {
    const update = Y.encodeStateAsUpdate(doc, before);
    if (update.byteLength > 2) postUpdate(key, update);
  } catch {
    /* 상태 벡터 계산 실패는 방송만 포기 — 로컬 쓰기는 이미 끝났다. */
  }
}

/* ── 수명 ──────────────────────────────────────────────────────── */

let started = false;
let dispose: (() => void) | null = null;

/**
 * 다중 탭 동기화 시작. store init 1곳에서 호출한다(멱등 — 한 번만 시작).
 * BroadcastChannel 미지원 환경에서는 수신 없이 발신만 no-op.
 */
export function initLiveSync(): () => void {
  if (started) return dispose ?? (() => {});
  started = true;

  let onMessage: ((ev: MessageEvent) => void) | null = null;
  if (typeof BroadcastChannel !== "undefined") {
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      // Node(테스트)에서 핸들이 프로세스 종료를 막지 않도록.
      (channel as unknown as { unref?: () => void }).unref?.();
      onMessage = (ev: MessageEvent) => {
        try {
          applyIncoming(ev.data as YDocSyncMsg);
        } catch {
          /* 신뢰 경계 밖 메시지 — 수신 루프를 죽이지 않게 삼킨다. */
        }
      };
      channel.addEventListener("message", onMessage);
    } catch {
      channel = null;
    }
  }

  dispose = () => {
    detachDoc?.();
    if (channel && onMessage) channel.removeEventListener("message", onMessage);
    try {
      channel?.close();
    } catch {
      /* noop */
    }
    channel = null;
    started = false;
    dispose = null;
  };
  return dispose;
}

/* ── 노트 변경 알림 (FEAT-memo-table-view AC-8) ─────────────────
 * 표 뷰(state/memoTable)가 다른 탭·다른 사람의 변경을 반영할 수 있게 알린다.
 * 원격 반영은 workspace의 문서 observer가 하므로 거기서 notifyNoteChanges를 부른다.
 * 이 모듈은 표 스토어를 import 하지 않는다 — 역방향 구독만.
 */
const noteChangeListeners = new Set<() => void>();

/** 노트 변경 구독. 해제 함수를 반환한다. */
export function subscribeNoteChanges(cb: () => void): () => void {
  noteChangeListeners.add(cb);
  return () => {
    noteChangeListeners.delete(cb);
  };
}

/** 구독자에게 알린다. 구독자가 자체 디바운스로 병합하고, 오류는 삼킨다. */
export function notifyNoteChanges(): void {
  for (const cb of [...noteChangeListeners]) {
    try {
      cb();
    } catch {
      /* 구독자 오류는 동기화 자체를 막지 않는다. */
    }
  }
}

/* ── 테스트 헬퍼 ───────────────────────────────────────────────── */

/** 테스트용 — 모듈 상태를 초기화한다(채널/문서/리스너). */
export function __resetLiveSyncForTest(): void {
  dispose?.();
  detachDoc?.();
  detachDoc = null;
  currentDoc = null;
  currentKey = null;
  channel = null;
  started = false;
  dispose = null;
  noteChangeListeners.clear();
}

/** 테스트용 — 이 탭의 id. 자기 발신 무시 검증에 쓴다. */
export function __getTabId(): string {
  return tabId;
}
