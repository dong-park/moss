"use client";

/**
 * FEAT-collab-auth n7 — 공유 보드 연결과 Awareness 상태.
 *
 * shared 보드의 Y.Doc에 HocuspocusProvider를 붙이고, 커서·선택·드래그를
 * Awareness로만 흘린다(D4). Y.Doc 쓰기는 스토어(commitMove)가 놓을 때 한 번 한다.
 *
 * provider·보드 토큰·문서 접근은 deps로 주입받는다 — 테스트는 가짜 provider로
 * 네트워크 없이 상태 전이를 검증하고, 실경로는 기본 deps가 실제 구현을 탄다.
 */
import { create } from "zustand";
import type * as Y from "yjs";
import { t } from "@/i18n";
import { useAuth } from "@/state/auth";
import { useToasts } from "@/state/notifications";
import {
  closeBoardDoc,
  getActiveBoardDoc,
  getOrOpenBoardDoc,
  isActiveBoard,
} from "@/state/ydoc/activeDoc";
import { realShareApi } from "@/state/share/api";
import type { BoardToken } from "@/state/share/types";
import { createThrottle, type Throttled } from "@/state/presence/throttle";
import type {
  DraggingState,
  PresenceParticipant,
  SelectionRect,
} from "@/state/presence/types";
import { participantsFromStates } from "./awareness";
import { syncUrl } from "./config";
import {
  CLOSE_DOCUMENT_TOO_LARGE,
  CLOSE_FORBIDDEN,
  realProviderFactory,
  type CollabProviderFactory,
  type CollabProviderHandle,
  type CollabStatus,
} from "./provider";

export type CollabConnectionStatus = "idle" | CollabStatus;

export interface CollabDeps {
  providerFactory: CollabProviderFactory;
  /** Ktor `POST /boards/{id}/token`. accessToken은 n6가 보장한다. */
  fetchBoardToken: (
    boardId: string,
    accessToken: string,
  ) => Promise<BoardToken>;
  /** 연결할 보드의 Y.Doc. 활성 보드 문서가 아니면 null. */
  getBoardDoc: (boardId: string) => Y.Doc | null;
  syncUrl: () => string;
  now: () => number;
}

const defaultDeps: CollabDeps = {
  providerFactory: realProviderFactory,
  fetchBoardToken: (boardId, accessToken) =>
    realShareApi.boardToken(boardId, accessToken),
  getBoardDoc: (boardId) => {
    const handle = getActiveBoardDoc();
    return handle && handle.boardId === boardId ? handle.doc : null;
  },
  syncUrl,
  now: () => Date.now(),
};

/** 보드 토큰 만료 전 이 시간 안이면 새로 받는다 (AC-11). */
const BOARD_TOKEN_SKEW_MS = 30_000;

let deps: CollabDeps = defaultDeps;

export function configureCollab(next: Partial<CollabDeps>): void {
  deps = { ...deps, ...next };
}

export interface CollabState {
  /** 연결 중인 보드 id. null이면 공유 세션 없음. */
  boardId: string | null;
  status: CollabConnectionStatus;
  /** 원격 참여자만. 자기 자신은 제외한다. */
  participants: PresenceParticipant[];
  error: string | null;
  /**
   * n9: 해제·내보내기(close 4403)로 끊긴 보드 id. 재연결을 멈춘 뒤 호출자
   * (CollabSession)가 로컬 사본 삭제를 잇는다. 새 connect가 시작되면 비운다.
   */
  revokedBoardId: string | null;

  connect(boardId: string): Promise<void>;
  disconnect(): void;
  setUserName(name: string): void;
  publishCursor(x: number, y: number): void;
  publishSelection(rects: SelectionRect[]): void;
  publishDragging(state: DraggingState | null): void;
}

interface ActiveSession {
  boardId: string;
  provider: CollabProviderHandle;
  offAwareness: () => void;
}

let active: ActiveSession | null = null;
/** 토큰·문서 로딩 중인 보드. 같은 보드에 대한 중복 connect를 합친다. */
let pendingBoardId: string | null = null;
/** connect/disconnect 경쟁 가드. 늦게 도착한 connect 결과를 버린다. */
let epoch = 0;
let userName = "";

function setField(field: string, value: unknown): void {
  active?.provider.awareness?.setLocalStateField(field, value);
}

/** 커서·드래그·선택은 초당 25회로 제한한다(n7 작업 2). */
const cursorThrottle: Throttled<[number, number]> = createThrottle((x, y) =>
  setField("cursor", { x, y }),
);
const draggingThrottle: Throttled<[DraggingState | null]> = createThrottle(
  (state) => setField("dragging", state),
);
const selectionThrottle: Throttled<[SelectionRect[]]> = createThrottle(
  (rects) => setField("selection", rects.length > 0 ? rects : null),
);

/**
 * 직전에 발행한 선택의 지문. mousemove처럼 같은 값을 반복 발행하는 호출을
 * 스로틀 이전에 걸러 네트워크로 나가는 중복을 없앤다(P1).
 */
let lastSelectionKey: string | null = null;

function selectionKey(rects: SelectionRect[]): string {
  return JSON.stringify(rects.length > 0 ? rects : null);
}

function teardown(): void {
  cursorThrottle.cancel();
  draggingThrottle.cancel();
  selectionThrottle.cancel();
  lastSelectionKey = null;
  if (!active) return;
  const session = active;
  active = null;
  try {
    session.offAwareness();
  } catch {
    /* 해제 실패는 무시 — provider destroy가 정리한다 */
  }
  try {
    session.provider.destroy();
  } catch {
    /* 이미 닫힌 provider */
  }
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : "연결하지 못했어요";
}

export const useCollab = create<CollabState>((set) => ({
  boardId: null,
  status: "idle",
  participants: [],
  error: null,
  revokedBoardId: null,

  connect: async (boardId) => {
    if (active?.boardId === boardId || pendingBoardId === boardId) return;
    teardown();
    const myEpoch = ++epoch;
    pendingBoardId = boardId;
    set({
      boardId,
      status: "connecting",
      participants: [],
      error: null,
      revokedBoardId: null,
    });

    // 첫 연결 토큰은 미리 받아 실패를 조기에 드러낸다. token()은 만료 임박이면
    // 새로 받는다 — 보드 토큰 만료 뒤 사용자 개입 없이 재연결된다(AC-11).
    let cached: { value: string; expiresAt: number } | null = null;
    try {
      const session = await useAuth.getState().ensureSession();
      const doc = deps.getBoardDoc(boardId);
      if (!doc) throw new Error("보드 문서를 열 수 없어요");
      const initial = await deps.fetchBoardToken(boardId, session.accessToken);
      cached = {
        value: initial.boardToken,
        expiresAt: deps.now() + initial.expiresInSeconds * 1000,
      };
      if (myEpoch !== epoch) return;

      const provider = deps.providerFactory.create({
        url: deps.syncUrl(),
        name: boardId,
        document: doc,
        token: async () => {
          if (cached && cached.expiresAt - deps.now() > BOARD_TOKEN_SKEW_MS) {
            return cached.value;
          }
          const next = await useAuth.getState().ensureSession();
          const token = await deps.fetchBoardToken(boardId, next.accessToken);
          cached = {
            value: token.boardToken,
            expiresAt: deps.now() + token.expiresInSeconds * 1000,
          };
          return token.boardToken;
        },
        onStatus: (status) => {
          if (myEpoch !== epoch) return;
          set({ status });
        },
        onAuthenticationFailed: (reason) => {
          if (myEpoch !== epoch) return;
          set({ error: reason });
        },
        onClose: (code) => {
          if (myEpoch !== epoch) return;
          // 4403: 해제·내보내기로 서버가 끊었다 (n5). error만 세우면 provider가
          // 자동 재연결을 반복한다 — 여기서 끊고(shouldConnect=false, destroy)
          // boardId를 비운 뒤, 호출자가 사본 삭제를 잇는다 (n9).
          if (code === CLOSE_FORBIDDEN) {
            epoch++;
            pendingBoardId = null;
            teardown();
            set({
              boardId: null,
              status: "idle",
              participants: [],
              error: "revoked",
              revokedBoardId: boardId,
            });
            return;
          }
          // 4413: 문서가 10MB 한도를 넘어 동기화 서버가 끊었다 (spec §7).
          if (code === CLOSE_DOCUMENT_TOO_LARGE) {
            set({ error: "boardTooLarge" });
            useToasts
              .getState()
              .push({ tone: "warn", title: t("collab.tooLarge") });
          }
        },
      });

      if (myEpoch !== epoch) {
        provider.destroy();
        return;
      }

      const awareness = provider.awareness;
      let offAwareness = () => {};
      if (awareness) {
        awareness.setLocalStateField("user", { name: userName });
        const handler = () =>
          set({
            participants: participantsFromStates(
              awareness.getStates(),
              awareness.clientID,
            ),
          });
        awareness.on("change", handler);
        offAwareness = () => awareness.off("change", handler);
        handler();
      }

      active = { boardId, provider, offAwareness };
      pendingBoardId = null;
      provider.connect();
    } catch (err) {
      if (myEpoch !== epoch) return;
      pendingBoardId = null;
      teardown();
      set({ boardId: null, status: "idle", error: messageOf(err) });
    }
  },

  disconnect: () => {
    epoch++;
    pendingBoardId = null;
    teardown();
    set({
      boardId: null,
      status: "idle",
      participants: [],
      error: null,
      revokedBoardId: null,
    });
  },

  setUserName: (name) => {
    userName = name;
    if (active) setField("user", { name });
  },

  publishCursor: (x, y) => cursorThrottle(x, y),

  publishSelection: (rects) => {
    const key = selectionKey(rects);
    if (key === lastSelectionKey) return;
    lastSelectionKey = key;
    selectionThrottle(rects);
  },

  publishDragging: (state) => draggingThrottle(state),
}));

/** 업로드용 일회 연결이 sync를 기다리는 상한. 넘으면 그냥 끊는다. */
export const UPLOAD_SYNC_TIMEOUT_MS = 10_000;

/**
 * spec/share-subboards.md — 사용자가 열지 않은 보드의 로컬 Y.Doc을 서버에 한 번
 * 올린다. 활성 문서가 아닌 파일함은 provider를 임시로 붙여 첫 sync에서 로컬
 * 업데이트를 밀어 넣고, synced(또는 실패·시간 초과) 뒤 바로 끊는다.
 *
 * 활성 보드는 건드리지 않는다 — 이미 화면이 붙였거나 붙일 예정이고(CollabSession),
 * 여기서 두 번째 provider를 만들면 그 연결을 깨뜨린다.
 */
export async function uploadBoardDoc(boardId: string, accessToken: string): Promise<void> {
  if (active?.boardId === boardId || isActiveBoard(boardId)) return;
  const handle = getOrOpenBoardDoc(boardId);
  try {
    await handle.whenLoaded;
    const initial = await deps.fetchBoardToken(boardId, accessToken);
    const cached = {
      value: initial.boardToken,
      expiresAt: deps.now() + initial.expiresInSeconds * 1000,
    };
    await new Promise<void>((resolve) => {
      let done = false;
      let provider: CollabProviderHandle | null = null;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const finish = () => {
        if (done) return;
        done = true;
        if (timer !== null) clearTimeout(timer);
        try {
          provider?.destroy();
        } catch {
          /* 이미 닫힌 provider */
        }
        resolve();
      };
      provider = deps.providerFactory.create({
        url: deps.syncUrl(),
        name: boardId,
        document: handle.doc,
        token: async () => cached.value,
        onStatus: () => {},
        onAuthenticationFailed: finish,
        onClose: finish,
        onSynced: finish,
      });
      timer = setTimeout(finish, UPLOAD_SYNC_TIMEOUT_MS);
      provider.connect();
    });
  } finally {
    closeBoardDoc(boardId);
  }
}

/** 테스트 격리용 — deps·모듈 상태·스토어를 초기화한다. */
export function resetCollabStore(): void {
  epoch++;
  pendingBoardId = null;
  teardown();
  deps = defaultDeps;
  userName = "";
  useCollab.setState({
    boardId: null,
    status: "idle",
    participants: [],
    error: null,
    revokedBoardId: null,
  });
}
