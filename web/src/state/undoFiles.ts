/**
 * cmd-z-undo n6 — 사진 파일 규칙(스펙 기술 결정 「휴지통과 사진 파일」).
 *
 * 넷 가운데 하나라도 가리키는 파일은 지우지 않는다.
 * 1. 모든 보드의 미러 행 — db.notes의 attachmentRef(메모 첨부와 판 배경 ref). 닫힌 보드 문서는
 *    열지 않고 미러로 본다.
 * 2. 지금 열린 보드 문서.
 * 3. 휴지통 행.
 * 4. 이 탭의 남은 기록 단계(되돌리기와 다시 실행 둘 다).
 * 미러는 0.3초 늦다. 청소하는 쪽이 이 함수를 부르기 전에 예약 미러 쓰기를 내보낸다.
 */
import { getDB } from "./db/schema";
import { getActiveBoardDoc } from "./ydoc/activeDoc";
import { readNotes } from "./ydoc/model";
import { heldFileRefs } from "./ydoc/undo";

/** refs 가운데 아직 누가 가리키는 ref. */
export async function liveFileRefs(refs: readonly string[]): Promise<Set<string>> {
  const want = new Set(refs.filter((r) => !!r));
  const live = new Set<string>();
  if (want.size === 0) return live;
  const mark = (ref: string | undefined) => {
    if (ref && want.has(ref)) live.add(ref);
  };
  for (const ref of heldFileRefs()) mark(ref);
  const doc = getActiveBoardDoc()?.doc;
  if (doc) for (const n of readNotes(doc)) mark(n.attachmentRef);
  const db = getDB();
  await db.transaction("r", db.notes, db.trash, async () => {
    await db.notes
      .filter((n) => !!n.attachmentRef && want.has(n.attachmentRef))
      .each((n) => mark(n.attachmentRef));
    await db.trash.each((e) => mark(e.note.attachmentRef));
  });
  return live;
}
