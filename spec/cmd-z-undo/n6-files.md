# n6-files — 판과 사진 파일을 되돌리고, 전체 검사를 돌린다

> 자기완결 브리프. runner는 상위 spec + 이 파일만 본다. 진행 메모는 이 파일에만 쓴다. `**상태**:` 줄은 손으로 고치지 않는다. spec.md는 고치지 않는다.

**agent**: runner
**id**: CZ-6
**상위**: spec/cmd-z-undo/spec.md
**deps**: n5
**상태**: 끝남
**담당 행**: T15, T16, T17, T18, T19, T26
**사람 확인**: 불필요

## 문제

- 판을 지우면 휴지통에도 안 가고 배경 사진 파일까지 바로 지워진다.
- 판 배경을 바꾸면 옛 파일이 저장 직후 지워져 되돌릴 수 없다.

## 목표

판 삭제와 배경 교체를 되돌리면 판과 사진이 돌아온다. 사진 파일은 spec.md 「기술 결정 — 휴지통과 사진 파일」의 파일 규칙 넷 가운데 하나라도 가리키면 지우지 않는다. 넷은 모든 보드의 미러 행(db.notes의 attachmentRef와 판 배경 ref), 지금 열린 보드 문서, 휴지통 행, 이 탭의 남은 기록 단계(되돌리기와 다시 실행 둘 다)다. 함 카드 삭제는 단계가 아니다. web 검사 5개가 통과한다.

## 작업

1. undo.ts 단계 meta에 그 단계가 되살릴 수 있는 사진 파일 ref를 적는다. 위 파일 규칙 넷을 검사하는 함수 하나를 둔다. 닫힌 보드 문서는 열지 않고 미러로 본다.
2. workspace.ts deleteFrame :2951-2980, setFrameBackground :2894-2927, clearFrameBackground :2929-2949: 옛 파일을 바로 지우지 않는다. 멤버 쓰기와 문서 삭제를 한 트랜잭션으로 묶는다.
3. 청소는 깊이 상한으로 빠짐, 다시 실행 버림, 건너뛴 단계, 보드를 떠날 때, 보드 삭제, 로그아웃에서 돈다. 보드를 떠날 때는 기록을 비운 뒤 청소하고 그다음 UndoManager를 destroy한다. 청소는 파일 규칙을 검사하기 전에 예약 미러 쓰기를 먼저 내보낸다(flushAll 또는 대상 카드 flushCard). 기존 dropFrameBackgroundFileAfterSave(workspace.ts:328-332)가 같은 이유로 flushCard를 쓴다. storage.ts purgeTrash :482도 파일 규칙을 쓴다.
3a. T15 행 전체를 이 노드 테스트로 판정한다. 행 파일 `spec/cmd-z-undo/rows/T15.json`의 경우 번호를 그대로 따른다. 연결선·다른 보드 경우는 n5가 만든 동작이다. 사진 메모를 살린 뒤 되돌리고 휴지통을 비운 뒤 다시 실행하는 경우는 이 노드의 purgeTrash 파일 규칙이 있어야 통과한다. 행의 지금 보드 이름은 V다(P는 사진 카드). 넷째(다른 보드 메모를 V에서 살림)와 다섯째(표 보기 살리기)는 연결선 source가 V에 있을 때 V의 undoStack이 그대로인지 본다. 다섯째는 memoTable.ts:638 호출이 넘기는 기록 안 하는 origin을 LOCAL_ORIGIN으로 바꾸면 실패함을 구현 메모에 실패 출력 한 줄로 남긴다(스펙 기술 결정 「단계」의 휴지통 살리기 origin 규칙). 비동기 묶음·지연 주입·거부 경우는 스펙 버린 대안 「비동기 동작 단계 묶음」에 따라 없다.
4. T19 행 전체를 판정한다. 첫째: 함 카드 삭제가 단계가 아니고, 함 삭제 직후 cmd+z는 그 전 동작을 되돌린다. 함 삭제 직전에 H가 지금 보드 문서에 있다고 단언한다(spec.md 「준비 확인」 공통 규칙의 닫힌 목록 첫째). H가 처음부터 없으면 remove가 아무것도 쓰지 않아 틀린 구현도 통과하기 때문이다. 둘째: Dock 경로(Dock.tsx:384·:437)의 createSubcanvas로 함 H2를 만드는 것도 단계가 아니다. createSubcanvas는 await 뒤 persistCard(workspace.ts:3775)로 쓰므로 H2가 문서에 보일 때까지 실제 시간 최대 2초 조건 대기하고 0.1초 더 기다린 뒤 잰다. 그 뒤 cmd+z는 H2를 남기고 그 전 동작을 되돌린다. createSubcanvas의 기록 안 하는 origin을 LOCAL_ORIGIN으로 바꾸면 둘째가 실패함을 구현 메모에 실패 출력 한 줄로 남긴다.
5. 행마다 vitest. 새 파일 `web/src/state/__tests__/undo.files.test.ts`. 기존 frameBackground.test.ts 방식으로 파일 삭제 호출을 센다.
6. 마지막에 web 검사 5개를 돌린다. 실패하면 이 브랜치가 만든 원인만 고친다. 플래키 테스트는 같은 명령으로 2번 더 돌려 결과를 구현 메모에 남긴다.

## 완료 기준

- [x] 준비 확인 규칙(spec.md 「준비 확인」 공통 규칙, 스펙 리뷰 19바퀴 AN0): 이 노드의 캔버스 cmd+z 시험에 쓴다. 순서: 준비를 하고, n3가 내보내는 지금 보드 UndoManager getter로 clear하고, 실제 시간 0.6초 기다리고, 준비 확인을 한다. 준비 확인은 둘이다: 지금 보드가 그 행의 보드다. undoStack 길이가 0이다. 준비 확인이 실패하면 그 시험은 실패다. 행 given의 동작 가운데 then이 그 결과를 보는 동작은 준비가 아니다. then이 되돌아가는지 보든 그대로인지 보든 같다. 예: 만들었다·지웠다·고쳤다·살렸다·옮겼다·바꿨다·그었다. 준비 확인 뒤에 스토어 액션으로 실제로 하고 기록한다. 이 정의는 내 탭의 동작에만 쓴다. 다른 탭·다른 기기의 동작은 그쪽 Y.Doc에서 하고 update로 이어 붙인다. 내 기록에 들어가지 않는다. 부정형 판정 앞의 긍정 단언은 spec.md 「준비 확인」 공통 규칙의 닫힌 목록에 있는 판정에만 둔다. 목록 밖의 "없음·그대로·0" 판정에는 두지 않는다. 행이 따로 둔 단언은 이 목록과 별개로 지킨다. T5 드롭 직후 frameId, T20 첫째 칸 바뀜, T23 둘째 연 뒤 사라짐, T23 셋째 연 뒤 시드 카드가 그렇다. 화면 컴포넌트가 여러 호출을 한 단계로 묶는 동작은 드래그(DraggableCard)와 크기 조절(ResizeHandles)이다. 스토어 수준 시험은 드래그 시작부터 끝까지의 호출을 n3의 묶음 시작·끝 API로 감싼다. 드래그는 이동 호출(moveCard 또는 여러 장이면 moveSelectedBy) 여러 번, commitMove, resolveMembership을 조건 없이 이 순서로, 크기 조절은 resizeCard 여러 번이다. 여러 장 드래그는 이동 중에도 문서에 쓴다(workspace.ts:2672). 감싸지 않으면 n4 뒤에는 진입점마다 단계가 끊긴다. 그와 별도로 n4가 화면 수준 시험을 하나씩 둔다(spec.md 「준비 확인」 공통 규칙). moveCard만으로는 문서에 쓰지 않는다(workspace.ts:2633-2643). 준비 방법은 구현자가 고른다. 스토어 액션도, model.ts 헬퍼와 Dexie 직접 쓰기도 된다. 보드 열기는 loadFromStorage나 setCurrentBoard로 한다. connectCards처럼 await 뒤 문서에 쓰는 준비 동작은 그 쓰기가 문서에 보인 뒤 clear한다. 행이 가짜 타이머나 가짜 시계를 쓰면 준비와 준비 확인은 실제 시간으로 하고, 가짜 타이머는 그 뒤에 켠다. setImmediate는 가짜로 바꾸지 않는다. 예: vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] }). 기본 설정은 setImmediate까지 바꿔 Dexie 읽기·쓰기가 멈춘다. 동작 뒤 조건 대기가 2초 안에 서지 않으면 그 경우도 실패다. 준비할 때 걸리는 곳: 관찰자는 LOCAL_ORIGIN 쓰기를 스토어에 반영하지 않는다(origin.ts:23-25). 연결선 문서 쓰기·지우기는 source 메모의 미러 행과 연결선 미러 행을 읽는다(writeThrough.ts:94-98, storage.ts:674-679). 연결선 살리기는 trashConnections 행과, 되살린 메모 반대편 메모의 미러 행을 읽는다(storage.ts:460-471). 비시스템 보드는 db.boards 행이 있어야 열린다(workspace.ts:2161-2170)
- [x] T15 넷째·다섯째는 준비에서 그 연결선을 V 문서에서 빼고 trashConnections에만 둔다(스펙 T15 given). 넷째·다섯째 준비는 「준비 확인 규칙」을 따른다. 살리기 직전에 그 연결선이 V 문서 connections에 없고 trashConnections에 있다고 단언한다(행의 then 넷째 앞). 연결선을 V 문서에 남긴 준비는 변이 시험을 거짓 통과시키기 때문이다. 다섯째는 행대로 trashSelected를 시험 동작으로 await해 토스트를 만든다. 연결선을 V 문서에서 빼고 기록을 비운 뒤 0.6초 뒤 준비 확인을 한다. 그다음 마지막 토스트의 action.onClick을 await한다(rows/T15.json 다섯째의 흐름, 본보기 memoTable.test.ts:444-468). 넷째는 restoreNote 안의 보드 비교가 늘 LOCAL_ORIGIN을 고르게 바꾸면, 다섯째는 memoTable.ts:638 호출이 넘기는 기록 안 하는 origin을 LOCAL_ORIGIN으로 바꾸면 실패한다. 실패 출력 한 줄씩을 구현 메모에 남긴다
- [x] T19 둘째(함 만들기)의 "LOCAL_ORIGIN으로 바꾸면 실패" 출력 한 줄이 구현 메모에 있다
- [x] T15, T16, T17, T18, T19 then 칸의 「확인」이 통과한다. 확인: `cd web && bunx vitest run src/state/__tests__/undo.files.test.ts`
- [x] 기존 회귀: `cd web && bunx vitest run src/state/__tests__/frameBackground.test.ts src/state/__tests__/frames.test.ts src/state/__tests__/subcanvas.test.ts src/state/__tests__/trash.test.ts src/state/__tests__/undo.trash.test.ts` 통과
- [x] T26: `cd web && npx tsc --noEmit && bun run lint && bun run test && bun run check:i18n && bun run build` 통과
- [x] 실경로: 테스트가 실제 deleteFrame, setFrameBackground, purgeTrash 경로를 탄다. 우회했으면 구현 메모에 갭을 적는다

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/state/ydoc/undo.ts` | 단계 meta, 청소 |
| `web/src/state/workspace.ts` | 파일 삭제 함수 :320-332, setFrameBackground :2894-2927, clearFrameBackground :2929-2949, deleteFrame :2951-2980 |
| `web/src/state/storage.ts` | purgeTrash :482-516, purgeAttachments |
| `web/src/state/db/opfs.ts` | deleteBlob |
| `web/src/state/__tests__/frameBackground.test.ts` | 파일 테스트 방식 |
| `.github/workflows/ci.yml` | 검사 5개 |

## 구현 메모

메인 사실, 2026-11-10 웨이브 5 시작 전, HEAD c7489e4 위 문서 커밋.
- 줄 번호가 밀렸다. 함수 이름으로 찾는다. 지금 줄: workspace.ts setFrameBackground :3291, clearFrameBackground :3326, deleteFrame :3348, 단계 훅 등록 :1901.
- n5가 단계 meta를 만들었다. undo.ts `captureUndoStep`·`addTrashStep`·`readTrashStep`·`dropTrashStep`·`TrashStepEntry` :252-303이다. 파일 ref meta도 같은 방식으로 StackItem에 붙인다.
- n5의 휴지통 작업 줄 세우기는 `web/src/state/undoTrash.ts`의 `enqueueTrashJob`·`runTrashJob`·`trashIdle`이다. 청소가 휴지통 작업과 겹치면 이 줄을 쓴다.
- 동작 감싸기는 `recorded`·`untracked`·`runAsUserAction`·`continueUserAction`이다. await 뒤 쓰기는 origin 인자를 넘긴다.
- 웨이브 4 코드 리뷰가 지금 n5를 보고 있다. 리뷰 수정은 이 runner가 끝난 뒤 메인이 올린다. undoTrash.ts의 n5 동작은 고치지 않는다. 고쳐야 하면 구현 메모에 적고 돌아온다.
- T26 빌드 전 확인: web/node_modules의 next는 16.4.5이고 bun.lock과 같다. bun install은 하지 않는다.
- 알려진 상존 실패: Canvas.virtualization.test.tsx 1건, useShortcuts.test.tsx의 Dexie 테어다운 레이스. 단독으로 다시 돌려 구분한다.
- 루트 package.json 수정은 사용자 것이다. 건드리지 않는다.

runner 메모, 2026-11-10. 구현 커밋 3aa08b0, 시험 고침 f16a837.
- T26: tsc, lint, check:i18n, build는 종료 코드 0이다. lint 경고 3개는 이 노드 파일 밖이다.
- bun run test는 6번 돌려 4번 0, 2번 1이었다. 198파일 1,780개는 매번 모두 통과했다. 1은 모두 처리 안 된 DatabaseClosedError다.
- 그 오류 하나는 undo.steps.test.ts의 함 삭제 시험이었다. cascade가 시험 뒤 닫힌 DB에서 거부됐다. 기준 커밋 f6a35d1에서도 2번 중 1번 났다. f16a837에서 cascade 끝을 기다리게 고쳤다. 고친 뒤 3번 돌려 이 오류는 0번이다.
- 남은 하나는 ac-capture.test.ts가 5ms만 기다리고 DB를 닫아 생긴다. 메모 5장의 미러 쓰기가 거부됐다. 이 브랜치가 안 고친 파일과 길이다. 단독 3번은 모두 통과했다. 고치지 않았다.
- 단계 meta: undo.ts `addFileStep`·`readFileStep`·`heldFileRefs`. readFileStep은 휴지통 meta의 메모 첨부도 함께 본다. 휴지통 단계는 ref를 따로 적지 않는다.
- 파일 규칙 함수는 `web/src/state/undoFiles.ts`의 `liveFileRefs`다. undo.ts에 Dexie를 넣지 않으려고 따로 뒀다. storage.purgeTrash와 workspace 청소가 함께 쓴다.
- 청소 `sweepFiles`는 휴지통 작업 차례(enqueueTrashJob)에서 flushAll, liveFileRefs, purgeAttachments 순으로 돈다. undoTrash.ts는 고치지 않았다.
- 다시 실행 버림과 보드 떠나기는 yjs clear로 단계를 버린다. createBoardUndo가 um.clear를 감싸 onDropped로 알린다. disposeAllBoardUndo는 새로고침 같은 재개 경계라 청소하지 않는다.
- 보드 삭제: 보던 보드를 지우면 removeBoard가 시스템 보드로 옮겨 가 떠나기 길을 탄다. 다른 보드에는 기록이 없다.
- 로그아웃: useAuth 구독이 세션이 있다가 사라질 때 기록을 비우고 청소한다. 그 뒤 빈 기록을 새로 만든다. 보드에 남은 사용자의 cmd+z가 멈추지 않게 한 가정이다.
- 단계가 ref를 쥐는 동작은 여섯이다: 배경 교체, 배경 지우기, 판 삭제, 사진 카드 만들기, 첨부 붙이기, 휴지통 넣기·빼기. 기록에 안 든 배경 교체·지우기·판 삭제는 놓은 파일을 바로 파일 규칙으로 청소한다.
- 첨부 붙이기(setAttachment, 빈 사진 카드 Content.tsx:141)는 예전엔 파일을 안 지웠다. 이제 그 단계가 빠질 때 아무도 안 가리키면 지운다.
- purgeTrash는 deleteBlob 대신 purgeAttachments를 부른다. 시험이 한 곳에서 센다.
- frameBackground.test.ts 3개를 새 동작으로 고쳤다. 옛 파일은 기록에서 빠질 때 지운다. afterEach에 __resetBoardDocsForTest를 더했다. 앞 시험 기록의 청소가 다음 시험 스파이에 잡히지 않게 한다.
- T15 넷째, restoreNote 보드 비교가 늘 LOCAL_ORIGIN: `AssertionError: expected 2 to be 1 // Object.is equality`.
- T15 다섯째, memoTable.ts:638 origin을 LOCAL_ORIGIN으로: `AssertionError: expected 1 to be +0 // Object.is equality`.
- T19 둘째, createSubcanvas origin을 LOCAL_ORIGIN으로: `AssertionError: expected 2 to be 1 // Object.is equality`. 두 Dock 경로 모두 실패했다.
- 그 밖 변이 3개도 실패했다. purgeTrash 파일 규칙을 빼면 T15 둘째, T18 셋째·일곱째가 실패한다. 청소의 flushAll을 빼면 T18 첫째·넷째가 실패한다. 휴지통 행 규칙을 빼면 T18 다섯째가 실패한다.
- T18은 여덟 경우 모두 준비 확인 뒤 가짜 타이머를 켰다. 첫째·넷째는 청소 직전 미러가 아직 옛 ref임을 단언한다.
- T18 여덟째는 B도 지운다. 이 탭에서는 아무도 B를 안 가리킨다. 다른 탭 기록이 쥔 파일은 나누지 않는다(실패 모드 9).
- 범위 밖 발견: 사진 카드를 만든 직후 moveCardToBoard하면 미러 행이 id·boardId·frameId만 남는다. saveNote의 get·merge·put이 생성 미러 쓰기와 엇갈린다. 그러면 파일 규칙이 미러로 그 파일을 못 봐 지울 수 있다. T18 여섯째는 생성 미러 쓰기가 끝난 뒤 옮긴다.
- 실경로: 시험은 실제 deleteFrame, setFrameBackground, clearFrameBackground, purgeTrash, setCurrentBoard, removeBoard, restoreFromTrash를 탄다. purgeAttachments만 스파이로 바꿨다. 실제 OPFS 삭제는 확인 안 됨.
- 로그아웃 시험은 useAuth.setState로 세션을 비웠다. 서버를 부르는 실제 logout() 길은 확인 안 됨.
- 테스트 명령은 브리프의 bunx vitest를 썼다. run-node.mjs test는 node로 파일을 돌려 vitest에 맞지 않는다.
