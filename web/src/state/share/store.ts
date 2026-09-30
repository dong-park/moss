"use client";

/**
 * FEAT-collab-auth n8/n9 — 공유 UI 상태.
 *
 * 토큰은 n6 `useAuth.ensureSession()`이 보장한다 — 만료 임박이면 조용히 갱신된다.
 * 보드의 Y.Doc 업로드(n7)와 로컬 사본 정리(n9)는 콜백으로 주입받는다.
 *
 * n9: busy·error 를 보드별 맵으로 둔다(다른 보드의 요청이 이 보드 버튼을 잠그지 않게).
 * startShare 는 보드별 in-flight 가드로 더블클릭 시 초대 토큰 경쟁을 막는다(AC-6).
 */
import { create } from "zustand";
import { useAuth } from "@/state/auth";
import { realShareApi, type ShareApi } from "./api";
import type { BoardMember, MemberRole, ShareStatus } from "./types";

/** 이름 없는 보드 기본값 — 서버 UNNAMED_BOARD와 같다 (AC-4). */
export const UNNAMED_BOARD = "이름 없는 보드";

export interface ShareDeps {
  api: ShareApi;
  /**
   * n10w P1-4/A: 공유가 시작된 직후 그 보드의 기존 로컬 첨부를 소급 업로드한다.
   * 순환 import를 피하려 동적 import로 attachments를 부른다.
   */
  onBoardShared?: (boardId: string) => void;
}

const defaultDeps: ShareDeps = {
  api: realShareApi,
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

export interface BoardShareInfo {
  status: ShareStatus;
  inviteToken: string | null;
  /** Ktor `/me/boards`·공유 시작이 아는 현재 사용자 역할. 모르면 undefined(fail-closed). */
  role?: MemberRole;
  /** 서버 `GET /boards/{id}/members` 목록. 아직 안 불렀으면 undefined. */
  members?: BoardMember[];
}

export interface ShareState {
  byBoard: Record<string, BoardShareInfo>;
  busyByBoard: Record<string, boolean>;
  errorByBoard: Record<string, string | null>;

  startShare(boardId: string, boardName: string): Promise<void>;
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

/** 보드별 진행 중 표시 — 더블클릭이 같은 요청을 두 번 보내지 않게. */
const startingBoards = new Set<string>();
const reissuingBoards = new Set<string>();

export const useShare = create<ShareState>((set) => ({
  byBoard: {},
  busyByBoard: {},
  errorByBoard: {},

  startShare: async (boardId, boardName) => {
    if (startingBoards.has(boardId)) return;
    startingBoards.add(boardId);
    set((s) => ({
      busyByBoard: { ...s.busyByBoard, [boardId]: true },
      errorByBoard: { ...s.errorByBoard, [boardId]: null },
    }));
    try {
      const session = await useAuth.getState().ensureSession();
      await deps.api.share(boardId, boardName.trim() || UNNAMED_BOARD, session.accessToken);
      const inviteToken = await deps.api.reissueInvite(boardId, session.accessToken);
      set((s) => ({
        busyByBoard: { ...s.busyByBoard, [boardId]: false },
        byBoard: {
          ...s.byBoard,
          [boardId]: { status: "shared", inviteToken, role: "owner" },
        },
      }));
      // n10w P1-4/A: 공유 성공 뒤 기존 로컬 첨부를 백필한다(실패해도 공유는 유지).
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
        return {
          byBoard: { ...s.byBoard, [boardId]: { ...prev, role: role ?? prev.role } },
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
      return { byBoard: next, busyByBoard: busy, errorByBoard: error };
    }),

  setBoardBusy: (boardId, busy) =>
    set((s) => ({ busyByBoard: { ...s.busyByBoard, [boardId]: busy } })),

  setBoardError: (boardId, message) =>
    set((s) => ({ errorByBoard: { ...s.errorByBoard, [boardId]: message } })),

  reset: () => {
    startingBoards.clear();
    reissuingBoards.clear();
    set({ byBoard: {}, busyByBoard: {}, errorByBoard: {} });
  },
}));

/** 테스트 격리용 — deps와 상태를 초기화한다. */
export function resetShareStore(): void {
  resetShareDeps();
  useShare.getState().reset();
}
