/**
 * cmd-z-undo n4 — 편집기 flush 훅.
 *
 * 편집기는 마지막 입력을 0.2초 디바운스 뒤에 문서에 쓴다. 편집 묶음을 닫기 직전에
 * 스토어가 runEditFlush를 불러 남은 본문을 먼저 내보낸다. 그래야 마지막 0.2초 안의
 * 글이 묶음 밖 새 단계가 되거나, 창을 닫으며 버려지지 않는다.
 * 편집 가능한 편집기가 마운트될 때 registerEditFlush로 등록하고 언마운트 때 푼다.
 */

type Flush = () => void;

const flushers = new Set<Flush>();

/** flush 훅 등록. 해제 함수를 돌려준다. */
export function registerEditFlush(fn: Flush): () => void {
  flushers.add(fn);
  return () => {
    flushers.delete(fn);
  };
}

/** 등록된 편집기의 남은 본문을 모두 내보낸다. 훅 오류는 삼킨다. */
export function runEditFlush(): void {
  for (const fn of [...flushers]) {
    try {
      fn();
    } catch {
      /* 편집기가 이미 destroy됐으면 내보낼 것이 없다 */
    }
  }
}
