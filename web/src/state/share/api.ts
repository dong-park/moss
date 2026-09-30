/**
 * FEAT-collab-auth n8 — Ktor 보드 공유 API 클라이언트 (n4 계약).
 *
 * 로그인 안 한 경로에서 이 모듈의 함수를 아무도 호출하지 않으면 네트워크는 0건이다 (AC-1).
 * 모듈 로드 시점에 fetch하지 않는다.
 */
import { apiBaseUrl, AuthRequestError, type BoardSummary } from "@/state/auth";
import type { BoardMember, BoardToken } from "./types";

export interface ShareApi {
  /** POST /boards/{id}/share — 이 보드만 서버에 올린다 (AC-4). */
  share(boardId: string, name: string, accessToken: string): Promise<BoardSummary>;
  /** POST /boards/{id}/token — Hocuspocus 접속용 보드 토큰 (AC-11). 멤버만. */
  boardToken(boardId: string, accessToken: string): Promise<BoardToken>;
  /** DELETE /boards/{id}/share — 소유자가 공유를 해제한다 (AC-13). */
  unshare(boardId: string, accessToken: string): Promise<void>;
  /** POST /boards/{id}/invites — 링크 재발급. 옛 토큰은 무효가 된다 (AC-6). */
  reissueInvite(boardId: string, accessToken: string): Promise<string>;
  /** DELETE /boards/{id}/members/{userId} — 편집자를 내보낸다 (AC-14). */
  removeMember(boardId: string, userId: string, accessToken: string): Promise<void>;
  /** GET /boards/{id}/members — 팝오버 멤버 목록. 멤버만 (n9). */
  members(boardId: string, accessToken: string): Promise<BoardMember[]>;
  /** GET /me/boards — 계정의 공유 보드 목록 (AC-17). */
  myBoards(accessToken: string): Promise<BoardSummary[]>;
}

interface RequestInit_ {
  method: "GET" | "POST" | "DELETE";
  path: string;
  accessToken: string;
  body?: unknown;
}

async function request<T>({ method, path, accessToken, body }: RequestInit_): Promise<T> {
  const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${apiBaseUrl()}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    throw new AuthRequestError(`${method} ${path} ${res.status}`, res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const realShareApi: ShareApi = {
  share: (boardId, name, accessToken) =>
    request<BoardSummary>({
      method: "POST",
      path: `/boards/${encodeURIComponent(boardId)}/share`,
      accessToken,
      body: { name },
    }),

  boardToken: (boardId, accessToken) =>
    request<BoardToken>({
      method: "POST",
      path: `/boards/${encodeURIComponent(boardId)}/token`,
      accessToken,
    }),

  unshare: (boardId, accessToken) =>
    request<void>({ method: "DELETE", path: `/boards/${encodeURIComponent(boardId)}/share`, accessToken }),

  reissueInvite: async (boardId, accessToken) => {
    const res = await request<{ inviteToken: string }>({
      method: "POST",
      path: `/boards/${encodeURIComponent(boardId)}/invites`,
      accessToken,
    });
    return res.inviteToken;
  },

  removeMember: (boardId, userId, accessToken) =>
    request<void>({
      method: "DELETE",
      path: `/boards/${encodeURIComponent(boardId)}/members/${encodeURIComponent(userId)}`,
      accessToken,
    }),

  members: (boardId, accessToken) =>
    request<BoardMember[]>({
      method: "GET",
      path: `/boards/${encodeURIComponent(boardId)}/members`,
      accessToken,
    }),

  myBoards: (accessToken) =>
    request<BoardSummary[]>({ method: "GET", path: "/me/boards", accessToken }),
};
