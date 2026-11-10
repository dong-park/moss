# n6-files — 판과 사진 파일을 되돌리고, 전체 검사를 돌린다

> 자기완결 브리프. runner는 상위 spec + 이 파일만 본다. 진행 메모는 이 파일에만 쓴다. `**상태**:` 줄은 손으로 고치지 않는다. spec.md는 고치지 않는다.

**agent**: runner
**id**: CZ-6
**상위**: spec/cmd-z-undo/spec.md
**deps**: n5
**상태**: 아직 안 함
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
4. T19 행 전체를 판정한다. 첫째: 함 카드 삭제가 단계가 아니고, 함 삭제 직후 cmd+z는 그 전 동작을 되돌린다. 둘째: Dock 경로(Dock.tsx:384·:437)의 createSubcanvas로 함 H2를 만드는 것도 단계가 아니다. createSubcanvas는 await 뒤 persistCard(workspace.ts:3775)로 쓰므로 H2가 문서에 보일 때까지 실제 시간 최대 2초 조건 대기하고 0.1초 더 기다린 뒤 잰다. 그 뒤 cmd+z는 H2를 남기고 그 전 동작을 되돌린다. createSubcanvas의 기록 안 하는 origin을 LOCAL_ORIGIN으로 바꾸면 둘째가 실패함을 구현 메모에 실패 출력 한 줄로 남긴다.
5. 행마다 vitest. 새 파일 `web/src/state/__tests__/undo.files.test.ts`. 기존 frameBackground.test.ts 방식으로 파일 삭제 호출을 센다.
6. 마지막에 web 검사 5개를 돌린다. 실패하면 이 브랜치가 만든 원인만 고친다. 플래키 테스트는 같은 명령으로 2번 더 돌려 결과를 구현 메모에 남긴다.

## 완료 기준

- [ ] 준비 확인 규칙(spec.md 「준비 확인」 공통 규칙, 스펙 리뷰 19바퀴 AN0): 이 노드의 캔버스 cmd+z 시험에 쓴다. 순서: 준비를 하고, n3가 내보내는 지금 보드 UndoManager getter로 clear하고, 실제 시간 0.6초 기다리고, 준비 확인을 한다. 준비 확인은 둘이다: 지금 보드가 그 행의 보드다. undoStack 길이가 0이다. 준비 확인이 실패하면 그 시험은 실패다. 행 given의 동작 가운데 then이 그 결과를 보는 동작은 준비가 아니다. then이 되돌아가는지 보든 그대로인지 보든 같다. 예: 만들었다·지웠다·고쳤다·살렸다·옮겼다·바꿨다·그었다. 이 정의는 내 탭의 동작에만 쓴다. 다른 탭·다른 기기의 동작은 그쪽 Y.Doc에서 하고 update로 이어 붙인다. 내 기록에 들어가지 않는다(스펙 AP3). 부정형 판정 앞에는 긍정 단언을 둔다(스펙 :461). 없음을 보는 판정이면 동작 직전에 그 대상이 있다고 단언한다. 그대로·0을 보는 판정이면 cmd+z 직전에 undoStack이, cmd+shift+z 직전에 redoStack이 1 이상이라고 단언한다. 행이 단계가 아니라고 적은 동작은 빼고 센다. 드래그로 옮기기는 moveCard 뒤 commitMove다. moveCard만으로는 문서에 쓰지 않는다(workspace.ts:2633-2643). 준비 확인 뒤에 스토어 액션으로 실제로 하고 기록한다. 준비 방법은 구현자가 고른다. 스토어 액션도, model.ts 헬퍼와 Dexie 직접 쓰기도 된다. 보드 열기는 loadFromStorage나 setCurrentBoard로 한다. connectCards처럼 await 뒤 문서에 쓰는 준비 동작은 그 쓰기가 문서에 보인 뒤 clear한다. 행이 가짜 타이머나 가짜 시계를 쓰면 준비와 준비 확인은 실제 시간으로 하고, 가짜 타이머는 그 뒤에 켠다. setImmediate는 가짜로 바꾸지 않는다. 예: vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] }). 기본 설정은 setImmediate까지 바꿔 Dexie 읽기·쓰기가 멈춘다. 동작 뒤 조건 대기가 2초 안에 서지 않으면 그 경우도 실패다. 준비할 때 걸리는 곳: 관찰자는 LOCAL_ORIGIN 쓰기를 스토어에 반영하지 않는다(origin.ts:23-25). 연결선 문서 쓰기·지우기는 source 메모의 미러 행과 연결선 미러 행을 읽는다(writeThrough.ts:94-98, storage.ts:674-679). 연결선 살리기는 trashConnections 행과, 되살린 메모 반대편 메모의 미러 행을 읽는다(storage.ts:460-471). 비시스템 보드는 db.boards 행이 있어야 열린다(workspace.ts:2161-2170)
- [ ] T15 넷째·다섯째는 준비에서 그 연결선을 V 문서에서 빼고 trashConnections에만 둔다(스펙 T15 given). 넷째·다섯째 준비는 「준비 확인 규칙」을 따른다. 살리기 직전에 그 연결선이 V 문서 connections에 없고 trashConnections에 있다고 단언한다(행의 then 넷째 앞). 연결선을 V 문서에 남긴 준비는 변이 시험을 거짓 통과시키기 때문이다. 다섯째는 행대로 trashSelected를 시험 동작으로 await해 토스트를 만든다. 연결선을 V 문서에서 빼고 기록을 비운 뒤 0.6초 뒤 준비 확인을 한다. 그다음 마지막 토스트의 action.onClick을 await한다(스펙 AK2·AM0, 본보기 memoTable.test.ts:444-468). 넷째는 restoreNote 안의 보드 비교가 늘 LOCAL_ORIGIN을 고르게 바꾸면, 다섯째는 memoTable.ts:638 호출이 넘기는 기록 안 하는 origin을 LOCAL_ORIGIN으로 바꾸면 실패한다. 실패 출력 한 줄씩을 구현 메모에 남긴다
- [ ] T19 둘째(함 만들기)의 "LOCAL_ORIGIN으로 바꾸면 실패" 출력 한 줄이 구현 메모에 있다
- [ ] T15, T16, T17, T18, T19 then 칸의 「확인」이 통과한다. 확인: `cd web && bunx vitest run src/state/__tests__/undo.files.test.ts`
- [ ] 기존 회귀: `cd web && bunx vitest run src/state/__tests__/frameBackground.test.ts src/state/__tests__/frames.test.ts src/state/__tests__/subcanvas.test.ts src/state/__tests__/trash.test.ts src/state/__tests__/undo.trash.test.ts` 통과
- [ ] T26: `cd web && npx tsc --noEmit && bun run lint && bun run test && bun run check:i18n && bun run build` 통과
- [ ] 실경로: 테스트가 실제 deleteFrame, setFrameBackground, purgeTrash 경로를 탄다. 우회했으면 구현 메모에 갭을 적는다

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
