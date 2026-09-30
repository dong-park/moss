import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";

/**
 * FEAT-collab-auth n1 — 보드 문서 로컬 저장.
 *
 * y-indexeddb 이름은 `moss-board-<boardId>`. 열자마자 `whenLoaded`를 기다려야
 * 로컬 업데이트가 복원되고, 그전에 쓴 업데이트는 IndexedDB에 저장되지 않는다
 * (y-indexeddb는 DB가 열린 뒤의 update만 저장한다).
 */
export function boardDocName(boardId: string): string {
  return `moss-board-${boardId}`;
}

export interface BoardDocHandle {
  boardId: string;
  doc: Y.Doc;
  persistence: IndexeddbPersistence;
  /** 로컬 업데이트 복원 완료. 쓰기 전에 기다린다. */
  whenLoaded: Promise<void>;
  /** 저장소 연결과 문서를 닫는다. IndexedDB 쓰기가 끝날 때까지 기다린다. */
  destroy: () => Promise<void>;
}

/**
 * y-indexeddb 9.0.12의 whenSynced는 IndexedDB open의 onerror·동기 throw 때 영원히 pending이다.
 * 내부 필드 `_db`의 reject만 골라 전파한다. 성공하면 영원히 pending이라 race에서 지지 않는다.
 * ponytail: blocked(다른 탭 업그레이드)·quota는 못 잡는다. 라이브러리가 whenSynced를 reject로 바꾸면 이 함수를 지운다.
 */
function rejectWhenDbOpenFails(persistence: IndexeddbPersistence): Promise<never> {
  return persistence._db.then(() => new Promise<never>(() => {}));
}

export function openBoardDoc(boardId: string): BoardDocHandle {
  const doc = new Y.Doc();
  const persistence = new IndexeddbPersistence(boardDocName(boardId), doc);
  const whenLoaded = Promise.race([persistence.whenSynced, rejectWhenDbOpenFails(persistence)]).then(
    () => undefined,
  );
  return {
    boardId,
    doc,
    persistence,
    whenLoaded,
    destroy: async () => {
      try {
        await persistence.destroy();
      } catch {
        // 열기에 실패한 저장소는 닫을 것이 없다. 문서 정리는 아래에서 반드시 한다.
      } finally {
        doc.destroy();
      }
    },
  };
}
