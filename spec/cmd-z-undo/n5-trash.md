# n5-trash — 되돌리기와 휴지통·미러·공유 보드를 맞춘다

> 자기완결 브리프. runner는 상위 spec + 이 파일만 본다. 진행 메모는 이 파일에만 쓴다. `**상태**:` 줄은 손으로 고치지 않는다. spec.md는 고치지 않는다.

**agent**: runner
**id**: CZ-5
**상위**: spec/cmd-z-undo/spec.md
**deps**: n4
**상태**: 아직 안 함
**담당 행**: T12, T13, T14, T21, T24, T25, T20 6-5의 "연결선이 P 문서에서 사라짐" 칸
**사람 확인**: 불필요

## 문제

- 생성을 되돌리면 관찰자가 메모를 휴지통에 넣는다.
- 삭제를 되돌리면 메모가 보드와 휴지통에 함께 남는다.
- 빠른 연속 cmd+z가 0.3초 예약 미러 쓰기와 엇갈린다.

## 목표

spec.md 「상태 모델」의 합법 전이만 일어난다. 되돌리기·다시 실행 뒤 메모는 보드, 휴지통, 기록 보관 가운데 한 곳에만 있다. 공유 보드의 다른 기기에서도 같다.

## 작업

1. undo.ts 단계 meta에 휴지통 동작(넣음, 뺌, 새로 만듦)과 그때의 메모 내용, 그 메모에 닿은 연결선 내용을 적는다. 되돌리기는 반대로, 다시 실행은 그대로 휴지통을 맞춘다. 휴지통 넣기는 미러 대신 meta 내용으로 휴지통 행과 연결선 휴지통 행(trashConnections)을 함께 만든다. 연결선 휴지통 빼기 규칙: 되돌리기·다시 실행 뒤 보드 문서 connections에 있는 연결선은 trashConnections에서 빼고 미러 connections에 둔다. 문서에 없는 연결선은 trashConnections에 남긴다. 미러는 0.3초 늦으므로 판정에 쓰지 않는다. 반대편을 캔버스 remove나 removeSelected로 지웠으면 그 연결선은 그때 이미 문서에서 빠졌으므로 되돌리기가 살리지 않는다. 그래서 이 경우 이 규칙이 "반대편이 휴지통이면 남긴다"를 저절로 지킨다. 카드를 휴지통에 넣으면서 연결선을 문서에서 지우는 경로는 캔버스 remove·removeSelected(지운 카드의 보드 문서에 있는 연결선만, 작업 5)뿐이다. 휴지통에 넣는 다른 경로(예: 표 보기 휴지통 보내기, 브리지가 다른 보드 카드를 지우는 notes.delete)와 다른 보드 문서가 소유한 연결선은 문서에 남기는 기존 동작이고 스펙은 이를 받아들인다. 이렇게 문서에 남은 연결선은 반대편이 휴지통인 채 미러로 올라갈 수 있고, 한 끝이 그 보드에 없어 그려지지 않는다. 휴지통을 거치지 않는 두 경로는 따로다: 영구 삭제 hardDeleteNotes(storage.ts:353-357)와 연결선 자체 삭제 removeConnection(storage.ts:674, 문서 삭제는 writeThrough.ts:122-132의 deleteConnectionRecord)은 원래 문서에서 지운다. 사용자의 휴지통 살리기(restoreNote, 미러 기준)는 그대로 둔다.
2. 건너뛴 단계: n3이 만든 "빠진 단계 모두 넘기는 훅"으로 되돌리기와 다시 실행 둘 다에서 찾는다. 건너뛴 단계는 휴지통 동작을 적용하지 않는다. 그 단계가 쥔 파일은 놓는다. 파일 청소는 n6이 붙인다.
3. workspace.ts 관찰자 reflect :1575-1620: 되돌리기·다시 실행에서는 휴지통을 만지지 않는다. 메모 삭제를 반영할 때 예약 미러 쓰기 처리는 둘로 나눈다. 이 탭의 되돌리기·다시 실행이 지운 메모는 예약 쓰기를 취소한다. 휴지통은 단계 meta가 맞춘다. 원격에서 지운 메모는 예약 쓰기를 먼저 내보내고(flushCard) 휴지통에 넣는다. 취소하면 0.3초 안에 쓴 글이 휴지통에 안 남는다(T21 넷째). 원격에서 다시 나타난 메모의 휴지통 행을 빼고, 원격에서 문서에 다시 나타난 연결선의 휴지통 행은 작업 1의 같은 규칙으로 뺀다. 되돌린 뒤 reflectConnections :1666-1697을 다시 돌려, 양 끝 카드가 늦게 반영된 연결선도 그린다.
4. restoreFromTrash :3561-3585: 같은 id 카드가 이미 있으면 덧붙이지 않는다. 휴지통 살리기가 되돌린 연결선을 보드 문서에 쓰는 일은 이미 있다(storage.ts:477-478 restoreNote 끝의 writeConnectionRecord). 연결선이 1개 이하면 V 문서 쓰기 사이에 await가 없어 기본 0.5초 묶음이 1단계로 묶는다. 기록하는 origin으로 notes·connections를 바꾼 V 쓰기 가운데 연달은 둘 사이에 흐른 시간이 0.5초 이상이면 2단계가 되고(사이에 await가 여럿이면 그 합), 스펙은 이를 받아들인다. 따로 묶는 장치는 두지 않는다(스펙 기술 결정 「단계」의 받아들인 대가, 실패 모드 24). U8·W2(메인 결정): restoreNote(storage.ts:428-479)가 origin 인자를 받아 writeConnectionRecord(:478)까지 넘긴다. 연결선 쓰기는 반환 전에 나가므로 판정은 restoreNote 안에서 한다. restoreFromTrash(workspace.ts:3561-3585)는 지금 보드 id를 함께 넘기고, restoreNote 안에서 살릴 보드(restored.boardId)가 지금 보드면 LOCAL_ORIGIN, 아니면 기록 안 하는 origin을 쓴다. 표 보기 호출(memoTable.ts:638, fallback boardId null)은 늘 기록 안 하는 origin을 넘긴다. 그래서 다른 보드로 살리면 지금 보드에 단계가 안 생긴다. T12 넷째와 T15 셋째·넷째·다섯째(표 보기 살리기)가 이 동작을 본다. 다섯째는 G와 V의 메모를 잇는 연결선이 있어야 문서 쓰기가 생긴다. T15 행 판정은 n6이 한다.
5. remove·removeSelected: 이 연결선 문서 삭제는 바깥 동작의 origin을 따른다. 브리지가 지금 보드 카드를 notes.delete로 지우면 ws.remove(mossBridge.ts:463-465)를 거치므로 이 쓰기도 기록 안 하는 origin이다. T20 6-5(연결선이 붙은 메모를 브리지로 지움)가 이를 본다. 닿은 연결선 가운데 지운 카드의 보드 문서에 있는 연결선만 같은 트랜잭션으로 문서에서 지운다. 다른 보드 문서가 소유한 연결선은 지우지 않는다(기존 동작, 스펙 비목표 「다른 보드 문서가 소유한 연결선」). 닿은 연결선은 스토어 connections가 아니라 보드 문서 connections를 훑어 찾는다. 스토어는 양 끝이 현재 카드인 선만 들고 있어(workspace.ts:2035-2050) 다른 보드로 옮긴 반대편과 이어진 선을 놓친다. 근거 줄은 n1 1번.
6. 생성 되돌리기는 미러 행만 지운다. storage.removeNote :336은 쓰지 않는다. 휴지통에서 살린 메모를 되돌리면 휴지통으로 돌려보낸다. 닿은 연결선도 연결선 휴지통 행으로 돌려보낸다. 이 경우는 T15 첫째 경우와 같은 시나리오로 이 노드 테스트에 넣는다. T15 행 전체 판정은 n6이 한다.
7. 되돌린 뒤 바뀐 카드의 문서 쓰기 기준값(sharedSnapshot)을 문서 값으로 맞춘다. updatedAt을 지금 시각으로 기록 안 하는 origin으로 쓴다. 근거 줄은 n1 4번.
8. 행마다 vitest. 새 파일 `web/src/state/__tests__/undo.trash.test.ts`. T21은 두 Doc을 잇고, 같은 기기 두 탭 경우는 n3의 방송 테스트 방식을 쓴다.

## 완료 기준

- [ ] 시험 준비 규칙(스펙 리뷰 16·17바퀴): 이 규칙은 행이 "시험 코드가 직접 만든다"고 적은 준비에만 쓴다. T20 다섯째·여섯째, T15 넷째·다섯째가 그렇다. 다른 행의 given 동작(만들었다·지웠다·고쳤다·살렸다)은 cmd+z가 되돌릴 동작이므로 스토어 액션으로 실제로 하고 기록한다. 순서: 먼저 보드를 연다(loadFromStorage나 activateBoard). UndoManager가 여기서 생기고, 보드 열기는 아래 금지에 들지 않는다. 그다음 스토어 상태는 useWorkspace.setState로, 문서는 model.ts 헬퍼(putNote·putConnection·deleteConnection)로, Dexie 행(미러 notes·connections, boards, trash, trashConnections)은 db 테이블에 직접 쓰고 await한다. 준비에 그 밖의 스토어 액션과 브리지를 쓰지 않는다. 예외는 T15 다섯째의 trashSelected 하나다. 문서에 쓰지 않으므로 늦은 기록 쓰기가 없다(memoTable.ts:598-625). 관찰자는 LOCAL_ORIGIN 쓰기를 스토어에 반영하지 않으므로(origin.ts:23-25) 스토어 상태도 직접 넣는다. 다 쓴 뒤 n3가 내보내는 지금 보드 UndoManager getter로 clear하고 시험 동작을 시작한다. 본보기: web/src/state/__tests__/connectors.test.ts:73·:211-224. 동작 뒤 조건 대기가 2초 안에 서지 않으면 그 경우는 실패다
- [ ] T12, T13, T14, T21, T24, T25 then 칸의 「확인」이 통과한다. 확인: `cd web && bunx vitest run src/state/__tests__/undo.trash.test.ts`
- [ ] 같은 명령에서 T15 첫째와 셋째 경우가 통과한다. 첫째: 휴지통에서 살린 A를 되돌리면 A가 보드에 없고 휴지통에 A 행 1개. 셋째: 연결선으로 B와 이어진 C를 살린 뒤 되돌리면 C가 보드에 없고 휴지통에 C 행 1개와 연결선 휴지통 행 1개, B는 보드에 남는다. T15 둘째와 행 전체 판정은 n6이 한다
- [ ] T24는 기준값 보정 줄을 빼면 실패한다. 구현 메모에 뺐을 때 실패 출력 한 줄을 남긴다
- [ ] n4가 만든 `web/src/state/__tests__/undo.steps.test.ts`의 T20 6-5 테스트에 "그 연결선이 P 문서 connections에서 사라짐" 판정을 이 노드가 더한다. 6-5가 통과한다: P undoStack 길이 그대로, 연결선 사라짐. remove 안에서 연결선을 문서에서 지우는 줄을 빼면 6-5가 실패함을 구현 메모에 실패 출력 한 줄로 남긴다. 확인: `cd web && bunx vitest run src/state/__tests__/undo.steps.test.ts`
- [ ] 기존 회귀: `cd web && bunx vitest run src/state/__tests__/trash.test.ts src/state/__tests__/connectors.test.ts src/state/__tests__/storeOnYjs.test.ts src/state/__tests__/undo.core.test.ts src/state/__tests__/undo.steps.test.ts src/state/__tests__/memoSearch.test.ts src/state/__tests__/memoTable.test.ts` 통과
- [ ] `cd web && npx tsc --noEmit` 통과
- [ ] 실경로: 테스트가 실제 remove, restoreFromTrash, reflect 경로를 탄다. 우회했으면 구현 메모에 갭을 적는다

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/state/ydoc/undo.ts` | 단계 meta |
| `web/src/state/workspace.ts` | reflect :1575-1620, remove :3421-3473, removeSelected :3475-3547, restoreFromTrash :3561-3585, writeCardToDocHandle :1498-1529 |
| `web/src/state/storage.ts` | restoreNote :428-479(연결선 문서 쓰기 :477-478), trashNotes :380, 연결선 휴지통 넣기 :395-418, restoreNote :428, 연결선 휴지통 복귀 :459-473, removeNote :336 |
| `web/src/state/ydoc/sharedSnapshot.ts` | 쓰기 기준값 |
| `web/src/state/memoTable.ts` | 표 보기 살리기 호출 :638 |
| `web/src/state/__tests__/undo.steps.test.ts` | n4가 만든 시험. T20 6-5에 연결선 사라짐 판정을 더한다 |
| `web/src/state/cardPersist.ts` | 예약 미러 쓰기, cancelPersist |

## 구현 메모
