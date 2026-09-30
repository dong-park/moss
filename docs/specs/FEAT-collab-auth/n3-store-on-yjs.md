# n3-store-on-yjs — 스토어를 Yjs 위로 옮기기

> 자기완결 브리프. runner는 `docs/specs/FEAT-collab-auth.md`와 이 파일만 본다. 진행·상태는 이 파일에만 쓴다.

**deps**: n1
**상태**: done (2026-09-28)

## 문제

workspace 스토어는 지금 Dexie를 직접 읽고 쓴다. 원본이 Yjs로 바뀌면 스토어의 읽기·쓰기가 Y.Doc을 거쳐야 한다.

## 목표

workspace 액션 시그니처는 그대로이고 저장은 Y.Doc으로 간다. Dexie는 검색 같은 파생 인덱스만 받는다. 기존 vitest가 전부 통과한다.

## 작업

0. **급소 실험 먼저 (hate 2026-09-28)**: `updateText` 하나만 Y.Doc 쓰기 + `observeDeep` 반영으로 바꾼다. 키 입력 1회에 스토어 갱신이 1번인지, 한글 IME 조합이 안 깨지는지 확인한다. n1의 로컬 origin 규칙으로 막히는지 보고, 막히지 않으면 멈추고 리포트한다.
1. `workspace.ts`의 보드·메모·연결선 쓰기를 n1의 Y.Doc 함수로 바꾼다. 휴지통은 Dexie 로컬 그대로 둔다.
2. Y.Doc `observeDeep`으로 스토어 상태와 Dexie 파생 인덱스(`memoSearch` 등)를 갱신한다.
3. `liveSync.ts`의 탭 간 동기화를 Yjs 업데이트 BroadcastChannel 방식으로 바꾼다. 카드 단위 충돌 처리는 걷어낸다.
4. 드래그 중에는 문서에 쓰지 않고 놓을 때 한 번 쓰는지 확인한다. D4.

## 완료 기준

- [x] spec 공통 완료 기준 전부 — `bunx tsc --noEmit` 0. lint는 기존 기준선 2건(`ExportModal` set-state-in-effect, `exportStore` unused)만 남고 새 파일 0. 전체 suite는 기준선 실패 1건(`Canvas.virtualization`) 외 회귀 0 (916 passed / 3 skipped / 1 failed). unhandled `DatabaseClosedError` 3건은 기준선(HEAD)에도 있는 기존 현상
- [x] `cd web && bun run test` 전부 통과. 혼자 쓰는 경로의 기존 테스트 지우거나 skip 안 함 — liveSync 테스트는 새 동작 기준으로 재작성(삭제 아님)
- [x] AC-1: `storeOnYjs.test.ts` "새로고침에도 남는다" — 보드 생성→메모 작성→부팅 재실행→카드·Y.Doc 보존, `fetch` 0건 spy
- [x] 급소 실험: `storeOnYjs.test.ts` — setContent 1회에 스토어 set 1회, 로컬 origin 트랜잭션은 observer가 무시(Y.Doc에는 반영), 원격 origin은 1회 반영
- [x] 드래그 한 번에 Y.Doc 업데이트 0→1건: moveCard×3 후에도 doc update 0, `commitMove`에서 1
- [x] 실경로: 테스트가 `loadFromStorage`·`setCurrentBoard`·`addCardAt`·`setContent`·`moveCard`·`commitMove` 등 프로덕션 스토어 경로를 관통한다. 갭은 아래 참고

## 구현 결과

- `web/src/state/ydoc/activeDoc.ts` — 보드별 Y.Doc 수명(문서 키 정규화, 활성화 시 `whenLoaded` 대기, 정리). n7이 provider를 붙일 자리.
- `web/src/state/workspace.ts` — 보드·메모 쓰기를 n1의 `putNote`/`updateNoteField`/`deleteNote`/`putBoard`로 라우팅. `bindActiveDocReflection`이 `notesMap`·`connectionsMap`·`metaMap`의 원격 트랜잭션만 스토어·Dexie 미러에 반영. `commitMove`가 D4의 드롭 1회 쓰기를 맡는다.
- `web/src/state/storage.ts` — 연결선 save/remove를 활성 문서에도 쓴다.
- `web/src/state/db/liveSync.ts` — Dexie 훅·충돌 처리를 걷어내고 Y.Doc `update`(로컬 origin) 방송 + 채널 origin 적용.
- `MultitabConflictBanner` 삭제 — spec §7대로 카드 단위 충돌 처리가 사라짐.

## 읽기 경로 갭 (중요)

- **읽기(loadCards/loadBoards/loadConnections)는 아직 Dexie 미러를 본다.** n2(마이그레이션)가 붙기 전에는 보드 Y.Doc이 비어 있어, 읽기를 문서로 바꾸면 Dexie 시드 기반 기존 테스트 14개 파일이 전부 깨진다. n3는 쓰기 원본만 Y.Doc으로 옮기고 Dexie를 파생 미러로 유지했다. 읽기 원본 전환은 n2 이후 노드에서 해야 한다.
- **n2 미적용 보드의 공유 원본은 빈 문서다.** 새 카드/새 보드는 문서에 직접 쓰이지만, 기존 Dexie 보드는 n2 변환 전까지 Y.Doc에 없다. n7 이전에 n2가 반드시 필요하다.
- **보드 삭제(removeBoard)·서브캔버스 cascade·동기화 해제(revoke)는 문서 파일/행을 지우지 않는다.** n9가 맡는다.
- **연결선 원격 반영**은 스토어에 연결선 상태가 없어 Dexie 미러로만 흘린다(bridge/export가 Dexie를 읽는다).
- moveCard/moveSelectedBy/moveFrame의 좌표는 드롭 시 `commitMove`로만 문서에 쓴다. 키보드 이동(단축키)은 commitMove를 부르지 않아 공유 세션에는 안 실린다 — 후속 노드에서 단축키에 커밋을 붙여야 한다.

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/state/workspace.ts` | 스토어 본체 |
| `web/src/state/db/liveSync.ts` | 현재 탭 간 동기화 |
| `web/src/state/memoSearch.ts` | 파생 인덱스 |
| `web/src/components/workspace/DraggableCard.tsx` | 드래그 종료 지점 |
| `web/src/state/bridge/mossBridge.ts` | MCP 브리지. 응답 형식 유지 |

## 구현 메모

- n1 계약 (2026-09-28 리뷰 반영): `readNote/readNotes/readBoard`는 `SharedNote`·`SharedBoard`를 돌려준다. `lastVisitedAt`·`lastOpenedAt`은 기기 로컬이라 문서에 없다. 스토어는 Dexie의 로컬 값과 합쳐 `Note`를 만든다.
- `openBoardDoc(...).whenLoaded`를 기다린 뒤에만 쓴다. IndexedDB가 막히면 reject한다 — 보드를 열 수 없다는 화면을 띄운다.
- 원격 반영 observer에서 `readNotes` 전체 재구성을 하지 않는다. `observeDeep` 이벤트의 `keysChanged`·변경된 id만 `readNote`로 다시 읽는다. 리뷰 성능 지적: 메모 500장 × 원격 드래그 30회/초면 초당 28만 조회.
- `updateNoteField`는 없는 메모에 no-op이다. 생성은 `putNote`.

