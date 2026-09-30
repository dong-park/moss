# n1-yjs-doc-model — 보드를 Yjs 문서로 표현

> 자기완결 브리프. runner는 `docs/specs/FEAT-collab-auth.md`와 이 파일만 본다. 진행·상태는 이 파일에만 쓴다.

**deps**: 없음
**상태**: done (2026-09-28)

## 문제

D3에 따라 모든 보드의 원본을 보드당 Yjs 문서 1개로 바꿔야 한다. 그 첫 단추로 문서 구조와 로컬 저장이 필요하다.

## 목표

보드 1개가 `Y.Doc` 1개로 표현되고 y-indexeddb에 저장·복원된다. 메모·연결선·보드 메타를 읽고 쓰는 순수 함수가 있다.

## 작업

1. `web/`에 `yjs`, `y-indexeddb`를 추가한다.
2. `web/src/state/ydoc/` 아래에 문서 구조를 정의한다. 최상위 `Y.Map` 3개: `notes`(id→메모 필드 Y.Map), `connections`, `meta`(제목·색·손글씨 레이어 등 보드 필드).
3. Dexie 행 타입 ↔ Y.Map 변환 함수와 `openBoardDoc(boardId)`를 만든다. y-indexeddb 이름은 `moss-board-<id>`.
4. **로컬 origin 규칙**: 모든 로컬 쓰기는 `doc.transact(fn, LOCAL_ORIGIN)`으로 감싼다. 스토어 반영 observer는 `transaction.origin === LOCAL_ORIGIN`이면 건너뛴다. 원격·다른 탭 변경만 스토어로 들어오게 한다. 이 상수와 헬퍼를 export한다.
5. 메모 필드 하나를 바꾸면 그 메모의 Y.Map 키 하나만 바뀌게 한다. 드래그 좌표 쓰기는 여기서 다루지 않는다.

## 완료 기준

- [x] spec 공통 완료 기준 전부 — 단 tsc·새 파일 lint 0, 전체 suite는 기준선 실패 1건(Canvas.virtualization) 제외 회귀 0, lint는 기존 ExportModal·exportStore 2건이 기준선 실패 (아래 참고)
- [x] `web/src/state/db/schema.ts` 의 Note·Board·Connection 타입과 필드가 Y.Map으로 손실 없이 왕복한다는 vitest
- [x] LOCAL_ORIGIN 트랜잭션은 observer 콜백에서 걸러지고 다른 origin은 통과한다는 vitest
- [x] `openBoardDoc`으로 쓰고 닫고 다시 열면 같은 값이 나오는 vitest (fake-indexeddb)
- [x] 실경로: 관통이 프로덕션 경로를 탐. `doc.test.ts`가 y-indexeddb를 stub 없이 실제 `IndexeddbPersistence`로 돈다

## 구현 결과

- `web/src/state/ydoc/origin.ts` — `LOCAL_ORIGIN`, `transactLocal`, `isRemoteTransaction`, `observeRemote`. n3가 스토어 반영에 쓴다.
- `web/src/state/ydoc/model.ts` — 최상위 `notes`·`connections`·`meta` Y.Map. `noteToYMap`/`yMapToNote`, `connectionToYMap`/`yMapToConnection`, `boardToYMap`/`yMapToBoard`, `put*`/`updateNoteField`/`delete*`/`read*`. 모든 쓰기는 `transactLocal`.
- `web/src/state/ydoc/doc.ts` — `openBoardDoc(boardId)` → `{doc, persistence, whenLoaded, destroy}`. y-indexeddb 이름 `moss-board-<id>`.
- `web/src/state/ydoc/index.ts` — 재export.

주의: y-indexeddb는 DB가 열린 뒤(`whenLoaded`)의 update만 저장한다. 호출자는 쓰기 전에 `whenLoaded`를 기다려야 한다. 또 Yjs는 문서에 통합되지 않은 Y.Map을 읽지 못하므로 변환 함수가 만든 map은 읽기 전에 문서에 붙인다.

## 실경로·기준선 갭

- 전체 vitest: 913 passed / 3 skipped / 1 failed. 실패 1건은 `Canvas.virtualization.test.tsx` "viewport 밖 카드는 DOM에 마운트되지 않는다" — HEAD(`c1fef61`)에서도 동일하게 실패하는 기존 기준선 실패(내 변경과 무관, stash 후 재현 확인).
- `bun run lint`: 기존 `components/export/ExportModal.tsx`(set-state-in-effect error)·`state/exportStore.ts`(unused warning) 2건이 HEAD 기준선 실패. 새 `src/state/ydoc/`는 eslint 0.
- `bunx tsc --noEmit`: 0.

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/state/db/schema.ts` | 현재 Dexie v6 스키마와 행 타입 |
| `web/src/state/workspace.ts` | 스토어. 이 노드에서는 안 고친다 |

## 구현 메모

- 확인된 사실 2026-09-28: 브랜치 `feat/collab-auth`, 작업 위치 `/Users/donghwan/poc/moss`. `web/` 테스트는 `bun run test`(vitest). yjs 미설치. 병렬로 n4가 `server/`를 다른 워크트리에서 만든다.

