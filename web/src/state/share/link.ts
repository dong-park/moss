/**
 * FEAT-collab-auth n8 — 초대 링크 조립.
 *
 * n6 계약: `/j/{token}?name={보드명}&owner={소유자명}`.
 * 이름은 쿼리에 실어 보내되 서버 `/invites/preview`가 우선한다(스푸핑 방어).
 */
export function buildInvitePath(
  token: string,
  boardName: string,
  ownerName: string,
): string {
  const params = new URLSearchParams({ name: boardName, owner: ownerName });
  return `/j/${encodeURIComponent(token)}?${params.toString()}`;
}

/** 복사용 절대 URL. SSR에는 origin이 없으므로 경로만 돌려준다. */
export function absoluteInviteUrl(path: string): string {
  if (typeof window === "undefined") return path;
  return new URL(path, window.location.origin).toString();
}
