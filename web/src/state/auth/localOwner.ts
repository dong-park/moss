/**
 * 이 기기 로컬 데이터의 주인(`settings.ownerUserId`)을 판정한다 (D5-2).
 * - 기록이 없으면 지금 로그인한 계정으로 한 번 기록한다(claim).
 * - 기록이 있고 지금 계정과 다르면 다른 계정의 데이터다(mismatch).
 *
 * 안내 카드(`AccountOwnerGuard`)와 공유 시작(`startShare`·`shareFirstWall`)이 같은 판정을 쓴다.
 */
export type LocalOwnerVerdict = "claim" | "match" | "mismatch";

export function resolveLocalOwner(
  storedOwnerId: string | null | undefined,
  userId: string,
): LocalOwnerVerdict {
  if (storedOwnerId == null || storedOwnerId === "") return "claim";
  if (storedOwnerId === userId) return "match";
  return "mismatch";
}
