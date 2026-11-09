# n5-trash — 되돌리기와 휴지통·미러·공유 보드를 맞춘다

> 자기완결 브리프. runner는 상위 spec + 이 파일만 본다. 진행 메모는 이 파일에만 쓴다. `**상태**:` 줄은 손으로 고치지 않는다. spec.md는 고치지 않는다.

**agent**: runner
**id**: CZ-5
**상위**: spec/cmd-z-undo/spec.md
**deps**: n4
**상태**: 아직 안 함
**담당 행**: T12, T13, T14, T21, T24, T25
**사람 확인**: 불필요

## 문제

- 생성을 되돌리면 관찰자가 메모를 휴지통에 넣는다.
- 삭제를 되돌리면 메모가 보드와 휴지통에 함께 남는다.
- 빠른 연속 cmd+z가 0.3초 예약 미러 쓰기와 엇갈린다.

## 목표

spec.md 「상태 모델」의 합법 전이만 일어난다. 되돌리기·다시 실행 뒤 메모는 보드, 휴지통, 기록 보관 가운데 한 곳에만 있다. 공유 보드의 다른 기기에서도 같다.

## 작업

1. undo.ts 단계 meta에 휴지통 동작(넣음, 뺌, 새로 만듦)과 그때의 메모 내용, 그 메모에 닿은 연결선 내용을 적는다. 되돌리기는 반대로, 다시 실행은 그대로 휴지통을 맞춘다. 휴지통 넣기는 미러 대신 meta 내용으로 휴지통 행과 연결선 휴지통 행(trashConnections)을 함께 만든다. 연결선 휴지통 빼기 규칙: 되돌리기·다시 실행 뒤 보드 문서 connections에 있는 연결선은 trashConnections에서 빼고 미러 connections에 둔다. 문서에 없는 연결선은 trashConnections에 남긴다. 반대편이 휴지통인 연결선은 반대편을 지울 때 이미 문서에서 빠졌으므로 되돌리기가 살리지 않는다. 그래서 이 규칙이 "반대편이 휴지통이면 남긴다"를 저절로 지킨다. 다른 보드로 옮긴 반대편(moveCardToBoard는 연결선을 안 건드림)도 같은 규칙으로 판정한다. 미러는 0.3초 늦으므로 판정에 쓰지 않는다. 사용자의 휴지통 살리기(restoreNote, 미러 기준)는 그대로 둔다.
2. 건너뛴 단계: n3이 만든 "빠진 단계 모두 넘기는 훅"으로 되돌리기와 다시 실행 둘 다에서 찾는다. 건너뛴 단계는 휴지통 동작을 적용하지 않는다. 그 단계가 쥔 파일은 놓는다. 파일 청소는 n6이 붙인다.
3. workspace.ts 관찰자 reflect :1575-1620: 되돌리기·다시 실행에서는 휴지통을 만지지 않는다. 메모 삭제를 반영할 때 예약 미러 쓰기 처리는 둘로 나눈다. 이 탭의 되돌리기·다시 실행이 지운 메모는 예약 쓰기를 취소한다. 휴지통은 단계 meta가 맞춘다. 원격에서 지운 메모는 예약 쓰기를 먼저 내보내고(flushCard) 휴지통에 넣는다. 취소하면 0.3초 안에 쓴 글이 휴지통에 안 남는다(T21 넷째). 원격에서 다시 나타난 메모의 휴지통 행을 빼고, 원격에서 문서에 다시 나타난 연결선의 휴지통 행은 작업 1의 같은 규칙으로 뺀다. 되돌린 뒤 reflectConnections :1666-1697을 다시 돌려, 양 끝 카드가 늦게 반영된 연결선도 그린다.
4. restoreFromTrash :3561-3585: 같은 id 카드가 이미 있으면 덧붙이지 않는다. 휴지통 살리기가 되돌린 연결선을 보드 문서에 쓰는 일은 이미 있다(storage.ts:477-478 restoreNote 끝의 writeConnectionRecord). 연결선이 1개 이하면 V 문서 쓰기 사이에 await가 없어 기본 0.5초 묶음이 1단계로 묶는다. 그 밖에 V 문서의 첫 쓰기와 마지막 쓰기 사이 await가 0.5초를 넘으면 2단계가 되고, 스펙은 이를 받아들인다. 따로 묶는 장치는 두지 않는다(스펙 U1·AA4). U8·W2(메인 결정): restoreNote(storage.ts:428-479)가 origin 인자를 받아 writeConnectionRecord(:478)까지 넘긴다. 연결선 쓰기는 반환 전에 나가므로 판정은 restoreNote 안에서 한다. restoreFromTrash(workspace.ts:3561-3585)는 지금 보드 id를 함께 넘기고, restoreNote 안에서 살릴 보드(restored.boardId)가 지금 보드면 LOCAL_ORIGIN, 아니면 기록 안 하는 origin을 쓴다. 표 보기 호출(memoTable.ts:638, fallback boardId null)은 늘 기록 안 하는 origin을 넘긴다. 그래서 다른 보드로 살리면 지금 보드에 단계가 안 생긴다. T12 넷째와 T15 셋째·넷째·다섯째(표 보기 살리기)가 이 동작을 본다. 다섯째는 G와 V의 메모를 잇는 연결선이 있어야 문서 쓰기가 생긴다. T15 행 판정은 n6이 한다.
5. remove·removeSelected: 닿은 연결선 가운데 지운 카드의 보드 문서에 있는 연결선만 같은 트랜잭션으로 문서에서 지운다. 다른 보드 문서가 소유한 연결선은 지우지 않는다(기존 동작, 스펙 AA1 비목표). 닿은 연결선은 스토어 connections가 아니라 보드 문서 connections를 훑어 찾는다. 스토어는 양 끝이 현재 카드인 선만 들고 있어(workspace.ts:2035-2050) 다른 보드로 옮긴 반대편과 이어진 선을 놓친다. 근거 줄은 n1 1번.
6. 생성 되돌리기는 미러 행만 지운다. storage.removeNote :336은 쓰지 않는다. 휴지통에서 살린 메모를 되돌리면 휴지통으로 돌려보낸다. 닿은 연결선도 연결선 휴지통 행으로 돌려보낸다. 이 경우는 T15 첫째 경우와 같은 시나리오로 이 노드 테스트에 넣는다. T15 행 전체 판정은 n6이 한다.
7. 되돌린 뒤 바뀐 카드의 문서 쓰기 기준값(sharedSnapshot)을 문서 값으로 맞춘다. updatedAt을 지금 시각으로 기록 안 하는 origin으로 쓴다. 근거 줄은 n1 4번.
8. 행마다 vitest. 새 파일 `web/src/state/__tests__/undo.trash.test.ts`. T21은 두 Doc을 잇고, 같은 기기 두 탭 경우는 n3의 방송 테스트 방식을 쓴다.

## 완료 기준

- [ ] T12, T13, T14, T21, T24, T25 then 칸의 「확인」이 통과한다. 확인: `cd web && bunx vitest run src/state/__tests__/undo.trash.test.ts`
- [ ] 같은 명령에서 T15 첫째와 셋째 경우가 통과한다. 첫째: 휴지통에서 살린 A를 되돌리면 A가 보드에 없고 휴지통에 A 행 1개. 셋째: 연결선으로 B와 이어진 C를 살린 뒤 되돌리면 C가 보드에 없고 휴지통에 C 행 1개와 연결선 휴지통 행 1개, B는 보드에 남는다. T15 둘째와 행 전체 판정은 n6이 한다
- [ ] T24는 기준값 보정 줄을 빼면 실패한다. 구현 메모에 뺐을 때 실패 출력 한 줄을 남긴다
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
| `web/src/state/cardPersist.ts` | 예약 미러 쓰기, cancelPersist |

## 구현 메모
