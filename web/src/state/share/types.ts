/**
 * FEAT-collab-auth n8 — 공유 UI가 쓰는 타입. Ktor n4 계약을 그대로 옮긴다.
 */
import type { BoardSummary } from "@/state/auth/types";

export type MemberRole = "owner" | "editor";

/** 공유 팝오버에 보이는 사람. awareness(이름·색)와 계정 정보를 합친 표현. */
export interface BoardMember {
  id: string;
  name: string;
  avatar: string | null;
  role: MemberRole;
}

/** §8 상태 모델. n8은 local↔shared만 다룬다(revoked는 n9). */
export type ShareStatus = "local" | "shared" | "revoked";

/** 보드당 멤버 한도. 서버가 최종 판정하고 팝오버는 자리를 안내한다. */
export const MEMBER_LIMIT = 20;

export interface BoardToken {
  boardToken: string;
  expiresInSeconds: number;
}

export type { BoardSummary };
