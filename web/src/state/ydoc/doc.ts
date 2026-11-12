import * as Y from "yjs";
import { IndexeddbPersistence, PREFERRED_TRIM_SIZE } from "y-indexeddb";
import { beginSave, forgetBoardSave } from "../saveFeedback";

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
  /** IndexedDB 쓰기를 기다린 뒤 닫는다. 실패한 문서는 재시도/재진입까지 메모리에 보존한다. */
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

// If navigation closes a failed write, retain that exact live document until
// retry succeeds (or it is reopened). Never discard the only unsaved snapshot.
const recoverable = new Map<string, { handle: BoardDocHandle; resume: () => void; discard: () => Promise<void> }>();

/** Explicit document deletion/revocation must also discard a retained failed snapshot. */
export async function discardBoardDocRecovery(boardId: string): Promise<void> {
  await recoverable.get(boardId)?.discard();
  forgetBoardSave(boardId);
}

export function openBoardDoc(boardId: string): BoardDocHandle {
  const pending = recoverable.get(boardId);
  if (pending) {
    recoverable.delete(boardId);
    pending.resume();
    return pending.handle;
  }
  const doc = new Y.Doc();
  const persistence = new IndexeddbPersistence(boardDocName(boardId), doc);
  // y-indexeddb 9.0.12's update listener discards the add request's promise.
  // Replace just that listener: same DB/stores/update format, but IDB transaction
  // complete (not request success or initial sync) is the durability boundary.
  // Recheck this adapter when upgrading y-indexeddb. Its loader remains unchanged.
  doc.off("update", persistence._storeUpdate);
  let closing = false;
  let closeRequested = false;
  let failed = false;
  let loaded = false;
  const writes = new Set<Promise<void>>();
  const append = (update: Uint8Array, compact: boolean): Promise<void> => new Promise((resolve, reject) => {
    const db = persistence.db;
    if (!db || closing) { reject(new Error("Board document storage is not open")); return; }
    let tx: IDBTransaction;
    try {
      tx = db.transaction("updates", "readwrite");
      const store = tx.objectStore("updates");
      store.add(update);
      // Merge every stored update in this same transaction before trimming. This
      // preserves unseen writes from other tabs, including their delete sets.
      if (compact) {
        const all = store.getAll();
        all.onsuccess = () => {
          try {
            const merged = Y.mergeUpdates(all.result as Uint8Array[]);
            store.clear();
            store.add(merged);
          } catch (error) { reject(error); tx.abort(); }
        };
      }
      tx.oncomplete = () => { if (compact) persistence._dbsize = 1; resolve(); };
      tx.onabort = () => reject(tx.error ?? new Error("Board document transaction aborted"));
      tx.onerror = () => { /* abort is the final failure boundary */ };
    } catch (error) { reject(error); }
  });
  const retry = async () => {
    const ticket = beginSave(boardId, "document", retry);
    try {
      if (!loaded) {
        // Initial open failed before an editable document was restored. Reopen
        // through the same loader rather than reusing its rejected promise.
        const reopened = openBoardDoc(boardId);
        await reopened.whenLoaded;
        await reopened.destroy();
        ticket.success();
        return;
      }
      // Capture at retry time: never replay a failed, stale delta or close editor.
      await append(Y.encodeStateAsUpdate(doc), true);
      failed = false;
      ticket.success();
      if (closeRequested) await finishClose();
    } catch (error) { failed = true; ticket.failure(); throw error; }
  };
  const rememberWrite = (write: Promise<void>) => {
    writes.add(write);
    void write.then(() => writes.delete(write), () => writes.delete(write));
  };
  persistence._storeUpdate = (update, origin) => {
    if (origin === persistence || closing) return;
    const ticket = beginSave(boardId, "document", retry, false);
    // Delta success cannot clear an earlier failure: it may depend on that delta.
    const write = append(update, ++persistence._dbsize >= PREFERRED_TRIM_SIZE);
    rememberWrite(write);
    void write.then(ticket.success, () => { failed = true; ticket.failure(); });
  };
  doc.on("update", persistence._storeUpdate);
  const loading = beginSave(boardId, "document", retry);
  const whenLoaded = Promise.race([persistence.whenSynced, rejectWhenDbOpenFails(persistence)]).then(
    () => { loaded = true; },
  );
  // The loader's synced event precedes its transaction commit. A checkpoint
  // queued after loading confirms that transaction and the current full state.
  const initialSave = whenLoaded.then(() => append(Y.encodeStateAsUpdate(doc), false));
  rememberWrite(initialSave);
  void initialSave.then(loading.success, () => { failed = true; loading.failure(); });
  const finishClose = async () => {
    recoverable.delete(boardId);
    closing = true;
    try { await persistence.destroy(); }
    catch { /* Failed opens have no database to close. */ }
    finally { doc.destroy(); }
  };
  // Retain this live handle so a re-entrant open during close returns the same
  // document. If a write was still settling (or had failed) when it reopened,
  // checkpoint the current full state once it settles so the reopened document
  // ends durably saved rather than stuck in error.
  // flushOnReopen is true only when the close interrupted an in-flight write:
  // reopening must then checkpoint the current full state once those writes
  // settle, so the reopened document ends durably saved rather than silently
  // error. A close after an already-settled failure just retains the snapshot
  // and waits for an explicit retry — it must not auto-save behind the caller.
  const retain = (flushOnReopen: boolean) => {
    if (recoverable.has(boardId)) return;
    recoverable.set(boardId, {
      handle,
      resume: () => {
        closeRequested = false;
        if (!flushOnReopen) return;
        const settling = [...writes];
        void Promise.allSettled(settling).then(() => {
          if (failed && loaded) void retry().catch(() => {});
        });
      },
      discard: finishClose,
    });
  };
  const handle: BoardDocHandle = {
    boardId,
    doc,
    persistence,
    whenLoaded,
    destroy: async () => {
      closeRequested = true;
      // Register synchronously, before awaiting outstanding writes: a navigation
      // that reopens this board during the settling window must reuse THIS
      // document and its exact unsaved/failed state, never a fresh loader that
      // reads stale disk content and checkpoints over the former failure. One
      // handle per board id, so generations never race.
      retain(writes.size > 0);
      await Promise.allSettled([...writes]);
      if (!closeRequested) return; // reopened during the wait — keep it live
      if (failed && loaded) return; // keep retained for explicit retry/reopen
      await finishClose();
    },
  };
  return handle;
}
