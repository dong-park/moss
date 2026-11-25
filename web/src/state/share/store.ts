"use client";

/**
 * FEAT-collab-auth n8/n9 — 공유 UI 상태.
 *
 * 토큰은 n6 `useAuth.ensureSession()`이 보장한다 — 만료 임박이면 조용히 갱신된다.
 * 보드의 Y.Doc 업로드(n7)와 로컬 사본 정리(n9)는 콜백으로 주입받는다.
 *
 * n9: busy·error 를 보드별 맵으로 둔다(다른 보드의 요청이 이 보드 버튼을 잠그지 않게).
 * startShare 는 보드별 in-flight 가드로 더블클릭 시 초대 토큰 경쟁을 막는다(AC-6).
 *
 * local-promise n2: "공유 중"은 서버가 벽 내용을 받았다고 확인한 뒤에만 된다.
 * 순서는 로그인 확인 → 내 서버 보드 목록 확인 → 서버 행 → 벽 업로드 확인 → 초대 토큰 → shared 이고,
 * 업로드나 초대가 실패하면 이번 호출이 방금 만든 서버 행만 지우고 local 로 남는다.
 * 서버 공유는 같은 소유자에게 멱등이라 응답만으로는 새 행인지 알 수 없다 — 이미 있던 행(예: 새로고침
 * 뒤 공유 상태를 잃은 벽)을 지우면 다른 멤버의 내용·파일까지 사라지므로 목록으로 먼저 가른다.
 */
import { create } from "zustand";
import { AuthRequestError, SessionExpiredError, useAuth, type AuthSession } from "@/state/auth";
import { resolveLocalOwner } from "@/state/auth/localOwner";
import { useStorage } from "@/state/storage";
import { realShareApi, type ShareApi } from "./api";
import { acquireShareStartLock, type ShareStartLock } from "./startLock";
import {
  applyPersistedSharedChange,
  clearPersistedShared,
  onPersistedSharedChange,
  readPersistedShared,
  type PersistedShared,
} from "./persist";
import type { BoardMember, BoardSummary, MemberRole, ShareStatus } from "./types";

/** 이름 없는 보드 기본값 — 서버 UNNAMED_BOARD와 같다 (AC-4). */
export const UNNAMED_BOARD = "이름 없는 보드";

export interface ShareDeps {
  api: ShareApi;
  /**
   * n10w P1-4/A: 공유가 시작된 직후 그 보드의 기존 로컬 첨부를 소급 업로드한다.
   * 순환 import를 피하려 동적 import로 attachments를 부른다.
   */
  onBoardShared?: (boardId: string) => void;
  /**
   * 벽 내용을 서버로 올리고 서버가 받았다는 확인까지 기다린다. 확인하지 못하면 던진다.
   * 활성 보드도 건너뛰지 않는다 — 기본은 `uploadBoardDocConfirmed`.
   */
  uploadDoc: (boardId: string, accessToken: string) => Promise<void>;
  /** 공유가 해제된 직후 그 보드의 동기화 연결을 닫는다. */
  onBoardUnshared?: (boardId: string) => void;
  /** 이 기기 로컬 데이터의 주인 계정 id. 기록이 없으면 null. */
  localOwnerId: () => Promise<string | null | undefined>;
}

const defaultDeps: ShareDeps = {
  api: realShareApi,
  localOwnerId: async () => {
    const storage = useStorage.getState();
    if (!storage.initialized) await storage.init();
    return useStorage.getState().settings?.ownerUserId ?? null;
  },
  // 동적 import — collab 이 share 를 import 하는 순환을 피하고 provider 를 늦게 싣는다.
  uploadDoc: async (boardId, accessToken) => {
    const m = await import("@/state/collab");
    await m.uploadBoardDocConfirmed(boardId, accessToken);
  },
  onBoardUnshared: (boardId) => {
    void import("@/state/collab")
      .then((m) => {
        const collab = m.useCollab.getState();
        if (collab.boardId === boardId) collab.disconnect();
      })
      .catch(() => {
        /* 연결이 이미 없다 */
      });
  },
  onBoardShared: (boardId) => {
    void import("./attachments")
      .then((m) => m.backfillBoardAttachments(boardId))
      .catch(() => {
        /* 소급 업로드 실패는 치명적이지 않다 — 다음 공유 세션에 재시도된다 */
      });
    // 이미 있던 파일함도 같은 멤버에게 열리게 서버에 올린다.
    void import("../membership")
      .then((m) => m.shareSubBoards())
      .catch(() => {
        /* 다음 syncMyBoards가 다시 시도한다 */
      });
  },
};
let deps: ShareDeps = defaultDeps;

/** 테스트 주입용. n6 `configureAuth`와 같은 패턴. */
export function configureShare(next: Partial<ShareDeps>): void {
  deps = { ...deps, ...next };
}

export function resetShareDeps(): void {
  deps = defaultDeps;
}

/** 공유를 시작하지 못한 이유 — 문구는 화면(n4)이 고른다. */
export type ShareFailureReason = "login" | "share" | "account" | "elsewhere";

/** 공유를 시작하는 중 어디까지 왔나. 로그인 중에는 서버 행도 연결도 없다. */
export type SharePhase = "login" | "uploading";

/**
 * 실패하고 나서 정리하지 못한 것. 둘은 뜻이 다르다 — 화면이 따로 말해야 한다.
 * - `serverRowLeft`: 이번 시도가 만든 서버 행을 지우지 못했다. 다음 시도가 먼저 정리한다.
 * - `contentNotRestored`: 옮겨 놓은 내용을 원래 벽에 되돌리지 못했다. 내용은 `contentBoardId`의 벽에 있다.
 * - `contentUnconfirmed`: 이미 서버에 있던 벽이라 공유는 그대로 유지되지만, 이번에 올린 내용을
 *   서버가 받았는지 확인하지 못했다.
 */
export interface ShareLeftover {
  serverRowLeft?: boolean;
  contentNotRestored?: boolean;
  contentBoardId?: string;
  contentUnconfirmed?: boolean;
}

/**
 * 확인형 업로드가 왜 끝나지 않았나. 응답이 늦은 것(`timeout`)과 서버가 연결을 끊거나 거절한 것
 * (`rejected`)은 사용자에게 할 말이 다르다. 업로드 오류가 아니면 null.
 */
export type UploadFailure = "timeout" | "rejected";

function uploadFailureOf(cause: unknown): UploadFailure | null {
  if (cause instanceof ShareStartError) return cause.uploadFailure;
  if (!(cause instanceof Error) || cause.name !== "UploadNotConfirmedError") return null;
  return (cause as { reason?: unknown }).reason === "timeout" ? "timeout" : "rejected";
}

/** `startShare`가 던지는 오류. `reason`으로 로그인 실패와 공유 실패를 가른다. */
export class ShareStartError extends Error {
  readonly reason: ShareFailureReason;
  /** 업로드가 실패해 지우려던 서버 행을 지우지 못했다. 다음 시도가 이 보드를 먼저 정리한다. */
  readonly serverRowLeft: boolean;
  /** 첫 벽 내용을 되돌리지 못했다. 내용은 `contentBoardId`(새 벽)에 있다. */
  readonly contentNotRestored: boolean;
  readonly contentBoardId: string | undefined;
  /** 이미 공유 중이던 벽의 내용 업로드를 확인하지 못했다. 공유는 유지된다. */
  readonly contentUnconfirmed: boolean;
  /** 서버가 벽 내용을 받았다고 확인하지 못한 이유. 그런 실패가 아니면 null. */
  readonly uploadFailure: UploadFailure | null;
  constructor(reason: ShareFailureReason, cause: unknown, leftover: ShareLeftover = {}) {
    super(messageOf(cause));
    this.name = "ShareStartError";
    this.reason = reason;
    this.serverRowLeft = leftover.serverRowLeft === true;
    this.contentNotRestored = leftover.contentNotRestored === true;
    this.contentBoardId = leftover.contentBoardId;
    this.contentUnconfirmed = leftover.contentUnconfirmed === true;
    this.uploadFailure = uploadFailureOf(cause);
    this.cause = cause;
  }
}

export interface StartShareOptions {
  /** 로그인한 세션이 없으면 Google 로그인을 이 안에서 받는다. 기본은 받지 않고 실패한다. */
  login?: boolean;
}

export interface BoardShareInfo {
  status: ShareStatus;
  inviteToken: string | null;
  /** Ktor `/me/boards`·공유 시작이 아는 현재 사용자 역할. 모르면 undefined(fail-closed). */
  role?: MemberRole;
  /** 서버 `GET /boards/{id}/members` 목록. 아직 안 불렀으면 undefined. */
  members?: BoardMember[];
  /**
   * 기기에 남은 기록에서 복원했고 지금 계정이 그 주인인지 아직 모른다. 이 항목은 서버 목록에서
   * 빠졌다고 사본을 지우거나 동기화 연결을 붙이는 데 쓰지 않는다. 계정을 확인하거나 서버 목록이
   * 확인하면 사라진다.
   */
  unconfirmed?: boolean;
}

export interface ShareState {
  byBoard: Record<string, BoardShareInfo>;
  busyByBoard: Record<string, boolean>;
  errorByBoard: Record<string, string | null>;
  /** 마지막 공유 시작이 왜 실패했나. 새 시작이나 성공에서 비운다. */
  failureByBoard: Record<string, ShareFailureReason | null>;
  /** 공유 시작이 진행 중인 보드의 단계. 없으면 시작 중이 아니다. */
  phaseByBoard: Record<string, SharePhase>;

  startShare(boardId: string, boardName: string, options?: StartShareOptions): Promise<void>;
  registerBoard(boardId: string, boardName: string): Promise<void>;
  reissueInvite(boardId: string): Promise<void>;
  removeMember(boardId: string, userId: string): Promise<void>;
  unshare(boardId: string): Promise<void>;
  loadMembers(boardId: string): Promise<void>;
  /** `/me/boards` 복원 — 이미 shared 면 토큰·멤버를 건드리지 않는다. */
  restoreShared(boardId: string, role?: MemberRole): void;
  setLocal(boardId: string): void;
  /** 보드 흔적을 상태에서 지운다 — 사본 삭제(해제·내보내기) 뒤. */
  forgetBoard(boardId: string): void;
  setBoardBusy(boardId: string, busy: boolean): void;
  setBoardError(boardId: string, message: string | null): void;
  reset(): void;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : "요청이 실패했어요";
}

/**
 * 공유를 시작할 세션. `login`이면 세션이 없을 때 Google 로그인을 받는다.
 * 첫 벽 공유(`firstWall.ts`)도 벽을 옮기기 전에 같은 로그인 확인을 먼저 한다.
 */
export async function ensureShareSession(login: boolean): Promise<AuthSession> {
  const auth = useAuth.getState();
  try {
    return await auth.ensureSession();
  } catch (err) {
    if (!login || !(err instanceof SessionExpiredError)) throw err;
  }
  const { signInWithGooglePrompt } = await import("@/state/auth/store");
  await signInWithGooglePrompt();
  return useAuth.getState().ensureSession();
}

/**
 * 이 기기의 벽이 지금 로그인한 계정의 것인지 확인한다. 다른 계정의 것이면 `account` 이유로 던진다.
 * 로그인 게이트를 없앴으므로 한 기기에 다른 계정으로 들어올 수 있고, 그 계정으로 올리면
 * 남의 벽이 내 서버 계정에 올라간다. 주인 기록이 없으면(익명으로 쓴 데이터) 통과시킨다 —
 * 그 경우의 확인은 시트가 따로 받는다.
 */
export async function assertDeviceOwner(session: AuthSession): Promise<void> {
  let ownerId: string | null | undefined;
  try {
    ownerId = await deps.localOwnerId();
  } catch {
    return; // 기록을 못 읽으면 막지 않는다 — 읽지 못한 것이 다른 계정이라는 뜻은 아니다
  }
  if (resolveLocalOwner(ownerId, session.user.id) === "mismatch") {
    throw new ShareStartError(
      "account",
      new Error("이 기기의 벽은 다른 계정의 것이라 공유할 수 없어요"),
    );
  }
}

/**
 * 이번 시도가 만들었는데 지우지 못한 서버 행. 다음 시도 전에 먼저 지운다 — 남겨 두면 다음 시도의
 * 존재 확인이 이미 있던 행으로 읽어 반쯤 올라간 벽을 정리하지 않는다. 새로고침하면 잊히고, 그때는
 * `syncMyBoards`가 서버 목록으로 맞춘다.
 */
const staleServerRows = new Map<string, string>(); // 보드 id → 그 행을 만든 계정 id

function isNotFound(err: unknown): boolean {
  return err instanceof AuthRequestError && err.status === 404;
}

/**
 * 남은 서버 행을 지운다. `only`가 있으면 그 보드만. 아직 남은 보드 id를 돌려준다.
 * 행은 만든 계정의 토큰으로만 지운다 — 다른 계정이 로그인해 있으면 건드리지 않고 남겨 두며,
 * 그 행은 이 계정의 시작을 막지도 않는다.
 */
export async function cleanupStaleServerRows(
  session: Pick<AuthSession, "accessToken"> & { user: Pick<AuthSession["user"], "id"> },
  only?: string,
): Promise<string[]> {
  const left: string[] = [];
  for (const [id, userId] of [...staleServerRows]) {
    if (only !== undefined && id !== only) continue;
    if (userId !== session.user.id) continue;
    try {
      await deps.api.unshare(id, session.accessToken);
      staleServerRows.delete(id);
    } catch (err) {
      if (isNotFound(err)) staleServerRows.delete(id);
      else left.push(id);
    }
  }
  return left;
}

/** 보드별 진행 중 표시 — 더블클릭이 같은 요청을 두 번 보내지 않게. */
const startingBoards = new Set<string>();
const reissuingBoards = new Set<string>();

/**
 * `unconfirmed` 항목의 주인 계정. 기기에서 복원했거나 로그아웃으로 주인이 떠난 공유 항목은
 * 지금 로그인한 계정이 이 계정과 같을 때만 쓴다. 다르면 남의 공유라 버린다.
 */
let unconfirmedOwnerId: string | null = null;

/** 계정을 정한 변경(복원·버림)이 기기 기록에 되쓰이지 않게 하는 표시. */
let suppressPersist = false;

/**
 * 기기에 남은 공유 중인 벽으로 시작 상태를 채운다. 토큰·멤버는 모른다 — 서버 동기화가 채운다.
 * 이 항목들은 누구의 것인지 계정이 정해지기 전까지 `unconfirmed`다.
 */
function initialByBoard(): Record<string, BoardShareInfo> {
  const byBoard: Record<string, BoardShareInfo> = {};
  const saved = readPersistedShared();
  if (!saved) return byBoard;
  for (const [id, role] of Object.entries(saved.boards)) {
    byBoard[id] = { status: "shared", inviteToken: null, role: role ?? undefined, unconfirmed: true };
  }
  unconfirmedOwnerId = Object.keys(byBoard).length > 0 ? saved.userId : null;
  return byBoard;
}

export const useShare = create<ShareState>((set) => ({
  byBoard: initialByBoard(),
  busyByBoard: {},
  errorByBoard: {},
  failureByBoard: {},
  phaseByBoard: {},

  startShare: async (boardId, boardName, options) => {
    if (startingBoards.has(boardId)) return;
    startingBoards.add(boardId);
    let startLock: ShareStartLock | null = null;
    const fail = (reason: ShareFailureReason, err: unknown, leftover: ShareLeftover = {}) => {
      const error = new ShareStartError(reason, err, leftover);
      set((s) => {
        const phase = { ...s.phaseByBoard };
        delete phase[boardId];
        return {
          busyByBoard: { ...s.busyByBoard, [boardId]: false },
          errorByBoard: { ...s.errorByBoard, [boardId]: error.message },
          failureByBoard: { ...s.failureByBoard, [boardId]: reason },
          phaseByBoard: phase,
        };
      });
      return error;
    };
    // 락을 얻는 것부터 try 안이다 — 얻은 뒤 어디서 던져도 finally 가 락과 진행 표시를 푼다.
    try {
      // 다른 탭이 같은 벽을 공유하는 중이면 시작하지 않는다 — 두 탭이 한 서버 행을 놓고 달리다
      // 늦게 실패한 쪽이 다른 탭의 행을 지우지 않게 한다.
      startLock = acquireShareStartLock(boardId);
      set((s) => ({
        busyByBoard: { ...s.busyByBoard, [boardId]: true },
        errorByBoard: { ...s.errorByBoard, [boardId]: null },
        failureByBoard: { ...s.failureByBoard, [boardId]: null },
        phaseByBoard: { ...s.phaseByBoard, [boardId]: "login" },
      }));
      if (!startLock) {
        throw fail("elsewhere", new Error("다른 창에서 이 벽을 공유하는 중이에요"));
      }

      // 1. 로그인 확인 — 여기서 실패하면 서버를 부르지 않는다.
      let session;
      try {
        session = await ensureShareSession(options?.login === true);
      } catch (err) {
        throw fail("login", err);
      }

      // 1-2. 이 기기의 벽이 이 계정의 것인지 — 다른 계정의 것이면 서버를 부르지 않는다.
      try {
        await assertDeviceOwner(session);
      } catch (err) {
        throw fail("account", err);
      }

      // 1-3. 지난 시도가 남긴 서버 행이 있으면 먼저 지운다. 못 지우면 새로 만들지 않는다.
      if ((await cleanupStaleServerRows(session, boardId)).length > 0) {
        throw fail("share", new Error("지난 시도가 남긴 서버 기록을 지우지 못했어요"), {
          serverRowLeft: true,
        });
      }

      // 2~3. 서버 행을 만들고 벽 내용을 올려 서버가 받았는지 확인한다.
      set((s) => ({ phaseByBoard: { ...s.phaseByBoard, [boardId]: "uploading" } }));
      let rowCreated = false;
      let uploaded = false;
      let existing: BoardSummary | undefined;
      let inviteToken: string;
      try {
        // 이미 서버에 있는 행인지 먼저 안다. 목록을 못 읽으면 아무것도 만들지 않고 멈춘다 —
        // 모르는 채로 만들면 실패했을 때 남의 행을 지울 수도 있다.
        const mine = await deps.api.myBoards(session.accessToken);
        existing = mine.find((b) => b.id === boardId);
        await deps.api.share(boardId, boardName.trim() || UNNAMED_BOARD, session.accessToken);
        rowCreated = existing === undefined;
        await deps.uploadDoc(boardId, session.accessToken);
        uploaded = true;
        // 4. 초대 토큰. 이것도 실패하면 공유가 반쯤 만들어진 것이라 되돌린다.
        inviteToken = await deps.api.reissueInvite(boardId, session.accessToken);
      } catch (err) {
        let serverRowLeft = false;
        if (rowCreated) {
          // 지우지 못하면 서버 행이 남는다 — 상태는 local 이고 다음 시도가 먼저 정리한다.
          try {
            await deps.api.unshare(boardId, session.accessToken);
          } catch {
            serverRowLeft = true;
            staleServerRows.set(boardId, session.user.id);
          }
        } else if (existing) {
          // 이전에 이미 서버에 올라간 벽이다 — 지우지 않고 공유 중으로 되돌려 둔다.
          useShare.getState().restoreShared(boardId, existing.role);
        }
        // 이미 있던 행이라 공유는 남는다 — 내용을 못 올렸다면 그 사실을 말해야 한다.
        throw fail("share", err, {
          serverRowLeft,
          contentUnconfirmed: existing !== undefined && !uploaded,
        });
      }

      // 5. 서버가 받은 뒤에만 공유 중이다.
      set((s) => {
        const phase = { ...s.phaseByBoard };
        delete phase[boardId];
        return {
          busyByBoard: { ...s.busyByBoard, [boardId]: false },
          phaseByBoard: phase,
          byBoard: {
            ...s.byBoard,
            [boardId]: { status: "shared", inviteToken, role: "owner" },
          },
        };
      });
      // n10w P1-4/A: 공유 성공 뒤 기존 로컬 첨부를 백필한다(실패해도 공유는 유지).
      deps.onBoardShared?.(boardId);
    } finally {
      startingBoards.delete(boardId);
      startLock?.release();
    }
  },

  registerBoard: async (boardId, boardName) => {
    if (startingBoards.has(boardId)) return;
    startingBoards.add(boardId);
    set((s) => ({
      busyByBoard: { ...s.busyByBoard, [boardId]: true },
      errorByBoard: { ...s.errorByBoard, [boardId]: null },
    }));
    try {
      const session = await useAuth.getState().ensureSession();
      const summary = await deps.api.share(boardId, boardName.trim() || UNNAMED_BOARD, session.accessToken);
      set((s) => {
        const prev = s.byBoard[boardId];
        return {
          busyByBoard: { ...s.busyByBoard, [boardId]: false },
          byBoard: {
            ...s.byBoard,
            [boardId]: { ...prev, inviteToken: prev?.inviteToken ?? null, status: "shared", role: summary.role },
          },
        };
      });
      deps.onBoardShared?.(boardId);
    } catch (err) {
      set((s) => ({
        busyByBoard: { ...s.busyByBoard, [boardId]: false },
        errorByBoard: { ...s.errorByBoard, [boardId]: messageOf(err) },
      }));
      throw err;
    } finally {
      startingBoards.delete(boardId);
    }
  },

  reissueInvite: async (boardId) => {
    if (reissuingBoards.has(boardId)) return;
    reissuingBoards.add(boardId);
    set((s) => ({
      busyByBoard: { ...s.busyByBoard, [boardId]: true },
      errorByBoard: { ...s.errorByBoard, [boardId]: null },
    }));
    try {
      const session = await useAuth.getState().ensureSession();
      const inviteToken = await deps.api.reissueInvite(boardId, session.accessToken);
      set((s) => ({
        busyByBoard: { ...s.busyByBoard, [boardId]: false },
        byBoard: {
          ...s.byBoard,
          [boardId]: {
            ...(s.byBoard[boardId] ?? { status: "shared", inviteToken: null }),
            status: "shared",
            inviteToken,
          },
        },
      }));
    } catch (err) {
      set((s) => ({
        busyByBoard: { ...s.busyByBoard, [boardId]: false },
        errorByBoard: { ...s.errorByBoard, [boardId]: messageOf(err) },
      }));
      throw err;
    } finally {
      reissuingBoards.delete(boardId);
    }
  },

  removeMember: async (boardId, userId) => {
    set((s) => ({
      busyByBoard: { ...s.busyByBoard, [boardId]: true },
      errorByBoard: { ...s.errorByBoard, [boardId]: null },
    }));
    try {
      const session = await useAuth.getState().ensureSession();
      await deps.api.removeMember(boardId, userId, session.accessToken);
      set((s) => ({ busyByBoard: { ...s.busyByBoard, [boardId]: false } }));
      // 내보내기 성공 — 멤버 목록을 즉시 서버 값으로 갱신한다.
      await useShare.getState().loadMembers(boardId);
    } catch (err) {
      set((s) => ({
        busyByBoard: { ...s.busyByBoard, [boardId]: false },
        errorByBoard: { ...s.errorByBoard, [boardId]: messageOf(err) },
      }));
      throw err;
    }
  },

  unshare: async (boardId) => {
    set((s) => ({
      busyByBoard: { ...s.busyByBoard, [boardId]: true },
      errorByBoard: { ...s.errorByBoard, [boardId]: null },
    }));
    try {
      const session = await useAuth.getState().ensureSession();
      await deps.api.unshare(boardId, session.accessToken);
      set((s) => ({
        busyByBoard: { ...s.busyByBoard, [boardId]: false },
        byBoard: { ...s.byBoard, [boardId]: { status: "local", inviteToken: null } },
      }));
      // local 인데 동기화 연결이 열려 있으면 안 된다 — 화면 배선과 상관없이 닫는다.
      deps.onBoardUnshared?.(boardId);
    } catch (err) {
      set((s) => ({
        busyByBoard: { ...s.busyByBoard, [boardId]: false },
        errorByBoard: { ...s.errorByBoard, [boardId]: messageOf(err) },
      }));
      throw err;
    }
  },

  loadMembers: async (boardId) => {
    try {
      const session = await useAuth.getState().ensureSession();
      const members = await deps.api.members(boardId, session.accessToken);
      set((s) => {
        const prev = s.byBoard[boardId] ?? { status: "shared" as ShareStatus, inviteToken: null };
        return { byBoard: { ...s.byBoard, [boardId]: { ...prev, members } } };
      });
    } catch (err) {
      // 목록 조회 실패는 치명적이지 않다 — 팝오버는 awareness/자기 자신으로 계속 그린다.
      set((s) => ({ errorByBoard: { ...s.errorByBoard, [boardId]: messageOf(err) } }));
    }
  },

  restoreShared: (boardId, role) =>
    set((s) => {
      const prev = s.byBoard[boardId];
      if (prev?.status === "shared") {
        // 서버 목록이 알려 준 것이다 — 기기에서 복원한 항목이었다면 이제 확인됐다.
        const { unconfirmed: _unconfirmed, ...rest } = prev;
        void _unconfirmed;
        return {
          byBoard: { ...s.byBoard, [boardId]: { ...rest, role: role ?? prev.role } },
        };
      }
      return {
        byBoard: {
          ...s.byBoard,
          [boardId]: { status: "shared", inviteToken: null, role: role ?? undefined },
        },
      };
    }),

  setLocal: (boardId) =>
    set((s) => ({
      byBoard: { ...s.byBoard, [boardId]: { status: "local", inviteToken: null } },
    })),

  forgetBoard: (boardId) =>
    set((s) => {
      const next = { ...s.byBoard };
      delete next[boardId];
      const busy = { ...s.busyByBoard };
      delete busy[boardId];
      const error = { ...s.errorByBoard };
      delete error[boardId];
      const failure = { ...s.failureByBoard };
      delete failure[boardId];
      const phase = { ...s.phaseByBoard };
      delete phase[boardId];
      return {
        byBoard: next,
        busyByBoard: busy,
        errorByBoard: error,
        failureByBoard: failure,
        phaseByBoard: phase,
      };
    }),

  setBoardBusy: (boardId, busy) =>
    set((s) => ({ busyByBoard: { ...s.busyByBoard, [boardId]: busy } })),

  setBoardError: (boardId, message) =>
    set((s) => ({ errorByBoard: { ...s.errorByBoard, [boardId]: message } })),

  reset: () => {
    startingBoards.clear();
    reissuingBoards.clear();
    staleServerRows.clear();
    unconfirmedOwnerId = null;
    set({ byBoard: {}, busyByBoard: {}, errorByBoard: {}, failureByBoard: {}, phaseByBoard: {} });
  },
}));

function sharedOf(byBoard: Record<string, BoardShareInfo>): PersistedShared {
  const out: PersistedShared = {};
  for (const [id, info] of Object.entries(byBoard)) {
    if (info.status === "shared") out[id] = info.role ?? null;
  }
  return out;
}

/** 공유 중인 것 가운데 계정이 확인된 것만. 기기에서 복원했을 뿐인 항목은 남의 것일 수 있다. */
function confirmedSharedOf(byBoard: Record<string, BoardShareInfo>): PersistedShared {
  const out: PersistedShared = {};
  for (const [id, info] of Object.entries(byBoard)) {
    if (info.status === "shared" && !info.unconfirmed) out[id] = info.role ?? null;
  }
  return out;
}

function currentUserId(): string | null {
  return useAuth.getState().user?.id ?? null;
}

/**
 * 지금 로그인한 계정을 알았다 — 확인되지 않은 공유 항목의 주인이 이 계정이면 확인하고,
 * 아니면 버린다. 다른 계정의 공유를 이 계정의 서버 목록에 없다고 정리하거나 이 계정의 토큰으로
 * 연결하지 않게 하는 자리다. 버린 항목은 이 기기의 사본을 건드리지 않는다.
 */
export function reconcileDeviceShared(userId: string): void {
  const { byBoard } = useShare.getState();
  const pending = Object.entries(byBoard).filter(([, info]) => info.unconfirmed);
  if (pending.length === 0) {
    unconfirmedOwnerId = null;
    return;
  }
  const owner = unconfirmedOwnerId;
  unconfirmedOwnerId = null;
  const next = { ...byBoard };
  suppressPersist = true;
  try {
    if (owner === userId) {
      for (const [id, info] of pending) {
        const { unconfirmed: _unconfirmed, ...rest } = info;
        void _unconfirmed;
        next[id] = rest;
      }
      useShare.setState({ byBoard: next });
      // 로그아웃 때 비운 기록을 되살린다. 같은 값이면 쓰지 않는다.
      applyPersistedSharedChange(userId, sharedOf(next), []);
    } else {
      for (const [id] of pending) delete next[id];
      useShare.setState({ byBoard: next });
      clearPersistedShared();
    }
  } finally {
    suppressPersist = false;
  }
}

/**
 * 계정이 떠났다(로그아웃·계정 전환). 기기 기록을 비우고, 이 탭에 남은 공유 항목은 그 계정의
 * 것이라고 표시해 둔다 — 다음에 로그인하는 계정이 같을 때만 다시 쓴다.
 */
function detachAccount(userId: string): void {
  clearPersistedShared();
  const { byBoard } = useShare.getState();
  let next: Record<string, BoardShareInfo> | null = null;
  for (const [id, info] of Object.entries(byBoard)) {
    if (info.status !== "shared" || info.unconfirmed) continue;
    next ??= { ...byBoard };
    next[id] = { ...info, unconfirmed: true };
  }
  if (next) {
    unconfirmedOwnerId = userId;
    useShare.setState({ byBoard: next });
  }
}

/** 기기에 남은 기록으로 공유 상태를 다시 채운다. 새로고침 직후와 같다 — 테스트와 복구용. */
export function restoreSharedFromDevice(): void {
  useShare.setState({ byBoard: initialByBoard() });
  const userId = currentUserId();
  if (userId) reconcileDeviceShared(userId);
}

useAuth.subscribe((state, prev) => {
  const next = state.user?.id ?? null;
  const before = prev.user?.id ?? null;
  if (next === before) return;
  if (before !== null) detachAccount(before);
  if (next !== null) reconcileDeviceShared(next);
});

// 공유 중인 벽을 기기에 남긴다(F2). 바뀐 것만 반영해서 다른 탭의 공유를 덮어쓰지 않는다.
// 누구의 공유인지 모르면(로그인 전·로그아웃) 쓰지 않는다 — 주인 없는 기록이 남지 않게.
useShare.subscribe((state, prev) => {
  if (state.byBoard === prev.byBoard || suppressPersist) return;
  const before = sharedOf(prev.byBoard);
  const after = sharedOf(state.byBoard);
  const added: PersistedShared = {};
  for (const [id, role] of Object.entries(after)) {
    if (!(id in before) || before[id] !== role) added[id] = role;
  }
  const removed = Object.keys(before).filter((id) => !(id in after));
  if (Object.keys(added).length === 0 && removed.length === 0) return;
  const userId = currentUserId();
  if (userId === null) return;
  applyPersistedSharedChange(userId, added, removed, confirmedSharedOf(state.byBoard));
});

// 다른 탭이 공유를 시작·해제하면 이 탭의 배지도 맞춘다. 다른 계정의 기록은 따르지 않는다.
onPersistedSharedChange((persisted) => {
  const userId = currentUserId();
  if (persisted.userId !== (userId ?? unconfirmedOwnerId)) return;
  const unconfirmed = userId === null;
  const { byBoard } = useShare.getState();
  let next: Record<string, BoardShareInfo> | null = null;
  for (const [id, role] of Object.entries(persisted.boards)) {
    if (byBoard[id]?.status === "shared") continue;
    next ??= { ...byBoard };
    next[id] = {
      status: "shared",
      inviteToken: null,
      role: role ?? undefined,
      ...(unconfirmed ? { unconfirmed: true } : {}),
    };
  }
  for (const [id, info] of Object.entries(byBoard)) {
    if (info.status !== "shared" || id in persisted.boards) continue;
    next ??= { ...byBoard };
    next[id] = { status: "local", inviteToken: null };
  }
  if (next) useShare.setState({ byBoard: next });
});

/** 테스트 격리용 — deps와 상태를 초기화한다. */
export function resetShareStore(): void {
  resetShareDeps();
  useShare.getState().reset();
}
