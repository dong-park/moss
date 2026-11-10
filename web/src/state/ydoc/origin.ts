import * as Y from "yjs";

/**
 * FEAT-collab-auth n1 — 로컬 origin 규칙 (D3, 구현 메모).
 *
 * 모든 로컬 쓰기는 이 origin으로 트랜잭션을 연다. 그러면 스토어 반영
 * observer가 `transaction.origin === LOCAL_ORIGIN`을 보고 건너뛸 수 있다.
 * 로컬 변경은 이미 스토어가 알고 있으므로 다시 반영하면 되돌림 루프가 된다.
 * 원격(Hocuspocus)·다른 탭(BroadcastChannel)·y-indexeddb 로드는 다른
 * origin이라 observer를 통과해 스토어로 들어온다.
 */
export const LOCAL_ORIGIN: unique symbol = Symbol("moss-local-origin");

/**
 * cmd-z-undo n3 — 기록하지 않는 로컬 origin.
 *
 * 보드 UndoManager의 trackedOrigins는 LOCAL_ORIGIN뿐이라 이 origin의 쓰기는
 * 캔버스 기록에 들어가지 않는다. 그래도 로컬 쓰기다 — 스토어 반영 observer는
 * 건너뛰고(스토어가 이미 안다), 탭 사이 방송은 보낸다.
 * 쓰는 곳: 불러오기 정리·시드, 빈 채로 마친 글상자 지우기, 자동 측정, 브리지 등.
 */
export const UNTRACKED_ORIGIN: unique symbol = Symbol("moss-untracked-origin");

/** 로컬 쓰기 origin — 기록하는 LOCAL_ORIGIN 또는 기록 안 하는 UNTRACKED_ORIGIN. */
export type WriteOrigin = typeof LOCAL_ORIGIN | typeof UNTRACKED_ORIGIN;

/**
 * 로컬 쓰기를 트랜잭션으로 감싼다. n1의 모든 쓰기 헬퍼가 내부에서 이 함수를 쓴다.
 * origin을 주지 않으면 LOCAL_ORIGIN(기록하는 쓰기)이다. 바깥에 이미 열린
 * 트랜잭션이 있으면 yjs가 바깥 origin을 쓴다.
 */
export function transactLocal<T>(doc: Y.Doc, fn: () => T, origin: WriteOrigin = LOCAL_ORIGIN): T {
  return doc.transact(fn, origin);
}


/** 이 탭의 로컬 쓰기 origin인가 — 기록 여부와 무관하다. */
export function isLocalOrigin(origin: unknown): origin is WriteOrigin {
  return origin === LOCAL_ORIGIN || origin === UNTRACKED_ORIGIN;
}

/** observer 반영 대상인가 — 로컬 origin(기록하는 것·안 하는 것 모두)이 아닌 변경만 통과한다. */
export function isRemoteTransaction(transaction: Y.Transaction): boolean {
  return !isLocalOrigin(transaction.origin);
}

/**
 * 원격·다른 탭·로드 변경만 콜백으로 넘기는 observer. 해제 함수를 반환한다.
 * n3의 스토어 반영이 이 헬퍼를 쓴다.
 */
export function observeRemote(
  doc: Y.Doc,
  cb: (transaction: Y.Transaction) => void,
): () => void {
  const handler = (transaction: Y.Transaction) => {
    if (isRemoteTransaction(transaction)) cb(transaction);
  };
  doc.on("afterTransaction", handler);
  return () => doc.off("afterTransaction", handler);
}
