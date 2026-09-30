/** Ktor `/auth/*` 응답의 사용자 표현. */
export interface AuthUser {
  id: string;
  name: string;
  avatar: string | null;
}

/** IndexedDB에 보관하는 로그인 세션. */
export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

/** Ktor 보드 표현 (BoardDto). */
export interface BoardSummary {
  id: string;
  name: string;
  role: "owner" | "editor";
  ownerName: string;
}

/** 무인증 초대 미리보기 (POST /invites/preview) — 카드 표시용 이름만. */
export interface InvitePreview {
  boardName: string;
  ownerName: string;
}
