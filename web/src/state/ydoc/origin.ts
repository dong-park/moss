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
 * 로컬 쓰기를 LOCAL_ORIGIN 트랜잭션으로 감싼다. n1의 모든 쓰기 헬퍼가
 * 내부에서 이 함수를 쓴다.
 */
export function transactLocal<T>(doc: Y.Doc, fn: () => T): T {
  return doc.transact(fn, LOCAL_ORIGIN);
}

/** observer 반영 대상인가 — 로컬 origin이 아닌 변경만 통과한다. */
export function isRemoteTransaction(transaction: Y.Transaction): boolean {
  return transaction.origin !== LOCAL_ORIGIN;
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
