/* ─────────────────────────────────────────────────────────────
 * wall-marker 리뷰 W5 — 벽 획 입력 차단.
 *
 * 첫 벽 공유가 벽의 내용(메모·연결선·획)을 새 벽으로 옮기는 동안 새 획·되돌리기가 들어오면
 * 옮기는 쪽이 이미 읽어 간 목록과 어긋난다(획이 첫 벽에 남거나, 새 벽에서 사라진다). 그 동안
 * 벽 획 쓰기를 받지 않는다. 겹쳐 걸 수 있다(세는 방식) — 각 호출은 자기 해제 함수를 돌려받는다.
 * 보드 전환 중의 쓰기는 문서가 활성인지로 따로 막는다(workspace.commitWallStrokes).
 * ───────────────────────────────────────────────────────────── */

let blocks = 0;

/** 벽 획 입력을 막는다. 돌려받은 함수를 부르면 풀린다(두 번 불러도 한 번만 푼다). */
export function blockWallInput(): () => void {
  blocks += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    blocks -= 1;
  };
}

export function isWallInputBlocked(): boolean {
  return blocks > 0;
}
