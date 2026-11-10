/**
 * cmd-z-undo n5 — 되돌리기·다시 실행·원격 반영이 휴지통을 맞추는 Dexie 쪽 일.
 *
 * 메모는 보드, 휴지통, 기록 보관 가운데 한 곳에만 있다(스펙 「상태 모델」).
 * - 판정은 실행할 때의 보드 문서로 한다. 미러는 0.3초 늦어 판정에 쓰지 않는다.
 * - 휴지통 쓰기는 한 줄로 차례를 지킨다. 빠르게 연달아 누른 cmd+z가 남긴 쓰기가 서로
 *   엇갈려 미러 행을 되살리거나 휴지통 행을 빠뜨리지 않게 한다(실패 모드 5).
 */
import type * as Y from "yjs";
import { getDB, type Connection, type Note } from "./db/schema";
import { readConnection, readNote } from "./ydoc/model";

let chain: Promise<void> = Promise.resolve();

/** 휴지통 쓰기를 차례에 넣는다. 앞 쓰기가 끝난 뒤 시작한다. */
export function enqueueTrashJob(job: () => Promise<void>): Promise<void> {
  // 실패한 쓰기가 줄을 멈추지 않게 한다(테스트 teardown·새로고침 경계에서 DB가 닫힌다).
  const run = chain.then(job).catch(() => undefined);
  chain = run;
  return run;
}

/** 결과와 오류를 돌려주는 휴지통 쓰기(휴지통 살리기). 차례는 enqueueTrashJob과 같다. */
export function runTrashJob<T>(job: () => Promise<T>): Promise<T> {
  const run = chain.then(job);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** 이미 시작한 휴지통 쓰기를 차례에 넣는다 — 뒤에 오는 쓰기가 이 쓰기를 기다린다. */
export function trackTrashWrite<T>(p: Promise<T>): Promise<T> {
  const prev = chain;
  chain = Promise.all([prev, p.catch(() => undefined)]).then(() => undefined);
  return p;
}

/** 지금까지 넣은 휴지통 쓰기가 모두 끝나면 풀린다. */
export function trashIdle(): Promise<void> {
  return chain;
}

/**
 * 메모를 단계에 적은 내용으로 휴지통에 넣는다(되돌리기·다시 실행의 휴지통 넣기).
 * 닿은 연결선 가운데 보드 문서에 없는 것만 연결선 휴지통에 넣는다. 메모가 문서에 다시
 * 있으면 아무것도 안 한다.
 */
export async function trashFromStep(
  doc: Y.Doc,
  note: Note,
  connections: Connection[],
): Promise<void> {
  if (readNote(doc, note.id)) return;
  const db = getDB();
  const parked = connections.filter((c) => !readConnection(doc, c.id));
  await db.transaction(
    "rw",
    [db.notes, db.connections, db.embeddings, db.trash, db.trashConnections, db.boards],
    async () => {
      const board = note.boardId === null ? undefined : await db.boards.get(note.boardId);
      await db.trash.put({
        id: note.id,
        note,
        boardName: board?.name ?? null,
        deletedAt: Date.now(),
      });
      await db.trashConnections.bulkPut(parked);
      await db.connections.bulkDelete(parked.map((c) => c.id));
      await db.embeddings.delete(note.id);
      await db.notes.delete(note.id);
    },
  );
}

/**
 * 기록 보관 — 생성 되돌리기. 미러 행만 지운다. 휴지통에 넣지 않고 첨부 파일도 남긴다
 * (storage.removeNote는 첨부를 지워서 쓰지 않는다). 메모가 문서에 다시 있으면 안 지운다.
 */
export async function archiveMirror(doc: Y.Doc, id: string): Promise<void> {
  if (readNote(doc, id)) return;
  const db = getDB();
  await db.transaction("rw", [db.notes, db.embeddings], async () => {
    await db.embeddings.delete(id);
    await db.notes.delete(id);
  });
}

/**
 * 보드 문서에 있는 메모의 휴지통 행을 뺀다. 닿은 연결선 휴지통 행 가운데 보드 문서
 * connections에 있는 것은 빼서 미러 connections에 두고, 문서에 없는 것은 남긴다.
 * 되돌리기·다시 실행 뒤와 원격에서 다시 나타난 메모에 같은 규칙을 쓴다.
 */
export async function untrashOnBoard(doc: Y.Doc, ids: string[]): Promise<void> {
  const present = ids.filter((id) => readNote(doc, id));
  if (present.length === 0) return;
  const db = getDB();
  await db.transaction("rw", [db.trash, db.trashConnections, db.connections], async () => {
    await db.trash.bulkDelete(present);
    const parked = await db.trashConnections
      .where("sourceNoteId")
      .anyOf(present)
      .or("targetNoteId")
      .anyOf(present)
      .toArray();
    const back = parked.flatMap((c) => {
      const live = readConnection(doc, c.id);
      return live ? [live] : [];
    });
    await db.connections.bulkPut(back);
    await db.trashConnections.bulkDelete(back.map((c) => c.id));
  });
}

/** 보드 문서에 다시 나타난 연결선의 휴지통 행을 빼서 미러 connections에 둔다. */
export async function untrashConnections(doc: Y.Doc, ids: string[]): Promise<void> {
  const back = ids.flatMap((id) => {
    const live = readConnection(doc, id);
    return live ? [live] : [];
  });
  if (back.length === 0) return;
  const db = getDB();
  await db.transaction("rw", [db.trashConnections, db.connections], async () => {
    const parked = (await db.trashConnections.bulkGet(back.map((c) => c.id))).filter(
      (c): c is Connection => !!c,
    );
    if (parked.length === 0) return;
    const parkedIds = new Set(parked.map((c) => c.id));
    await db.connections.bulkPut(back.filter((c) => parkedIds.has(c.id)));
    await db.trashConnections.bulkDelete([...parkedIds]);
  });
}
