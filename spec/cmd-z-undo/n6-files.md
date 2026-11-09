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

- [ ] 시험 준비 규칙(스펙 리뷰 16바퀴 AJ1): 준비 상태는 시험 코드가 직접 만든다. 스토어 상태는 useWorkspace.setState로, 문서는 model.ts 헬퍼(putNote·putConnection·deleteConnection)로, Dexie 행(미러 notes·connections, trash, trashConnections)은 db 테이블에 직접 쓰고 await한다. 준비에 스토어 액션과 브리지를 쓰지 않는다. 관찰자는 LOCAL_ORIGIN 쓰기를 스토어에 반영하지 않으므로(origin.ts:23-25) 스토어 상태도 직접 넣는다. 다 쓴 뒤 undoManager.clear로 기록을 비우고 시험 동작을 시작한다. 본보기: web/src/state/__tests__/connectors.test.ts:73·:211-224. 동작 뒤 조건 대기가 2초 안에 서지 않으면 그 경우는 실패다
- [ ] T15 넷째·다섯째는 준비에서 그 연결선을 V 문서에서 빼고 trashConnections에만 둔다(스펙 T15 given). 준비는 시험 준비 규칙대로 deleteConnection 헬퍼와 db.trashConnections 직접 쓰기로 한다. 넷째는 restoreNote 안의 보드 비교가 늘 LOCAL_ORIGIN을 고르게 바꾸면, 다섯째는 memoTable.ts:638 호출이 넘기는 기록 안 하는 origin을 LOCAL_ORIGIN으로 바꾸면 실패한다. 실패 출력 한 줄씩을 구현 메모에 남긴다
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
