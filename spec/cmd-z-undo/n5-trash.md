# n5-trash — 되돌리기와 휴지통·미러·공유 보드를 맞춘다

> 자기완결 브리프. runner는 상위 spec + 이 파일만 본다. 진행 메모는 이 파일에만 쓴다. `**상태**:` 줄은 손으로 고치지 않는다. spec.md는 고치지 않는다.

**agent**: runner
**id**: CZ-5
**상위**: spec/cmd-z-undo/spec.md
**deps**: n4
**상태**: 아직 안 함
**담당 행**: T12, T13, T14, T15, T21, T24, T25
**사람 확인**: 불필요

## 문제

- 생성을 되돌리면 관찰자가 메모를 휴지통에 넣는다.
- 삭제를 되돌리면 메모가 보드와 휴지통에 함께 남는다.
- 빠른 연속 cmd+z가 0.3초 예약 미러 쓰기와 엇갈린다.

## 목표

spec.md 「상태 모델」의 합법 전이만 일어난다. 되돌리기·다시 실행 뒤 메모는 보드, 휴지통, 기록 보관 가운데 한 곳에만 있다. 공유 보드의 다른 기기에서도 같다.

## 작업

1. undo.ts 단계 meta에 휴지통 동작(넣음, 뺌, 새로 만듦)과 그때의 메모 내용을 적는다. 되돌리기는 반대로, 다시 실행은 그대로 휴지통을 맞춘다. 휴지통 넣기는 미러 대신 meta 내용으로 한다. n3이 만든 "빠진 단계 모두 넘기는 훅"으로 건너뛴 단계의 meta도 처리한다.
2. workspace.ts 관찰자 reflect :1575-1620: 되돌리기·다시 실행에서는 휴지통을 만지지 않는다. 메모 삭제를 반영할 때 그 카드의 예약 미러 쓰기를 취소한다. 원격에서 다시 나타난 메모의 휴지통 행을 뺀다.
3. restoreFromTrash :3561-3585: 같은 id 카드가 이미 있으면 덧붙이지 않는다.
4. remove·removeSelected: 닿은 연결선도 같은 트랜잭션으로 문서에서 지운다. 근거 줄은 n1 1번.
5. 생성 되돌리기는 미러 행만 지운다. storage.removeNote :336은 쓰지 않는다. 휴지통에서 살린 메모를 되돌리면 휴지통으로 돌려보낸다.
6. 되돌린 뒤 바뀐 카드의 문서 쓰기 기준값(sharedSnapshot)을 문서 값으로 맞춘다. updatedAt을 지금 시각으로 기록 안 하는 origin으로 쓴다. 근거 줄은 n1 4번.
7. 행마다 vitest. 새 파일 `web/src/state/__tests__/undo.trash.test.ts`. T21은 두 Doc을 잇고, 같은 기기 두 탭 경우는 n3의 방송 테스트 방식을 쓴다.

## 완료 기준

- [ ] T12, T13, T14, T15, T21, T24, T25 then 칸의 「확인」이 통과한다. 확인: `cd web && bunx vitest run src/state/__tests__/undo.trash.test.ts`
- [ ] T24는 기준값 보정 줄을 빼면 실패한다. 구현 메모에 뺐을 때 실패 출력 한 줄을 남긴다
- [ ] 기존 회귀: `cd web && bunx vitest run src/state/__tests__/trash.test.ts src/state/__tests__/connectors.test.ts src/state/__tests__/storeOnYjs.test.ts src/state/__tests__/undo.core.test.ts src/state/__tests__/undo.steps.test.ts src/state/__tests__/memoSearch.test.ts src/state/__tests__/memoTable.test.ts` 통과
- [ ] `cd web && npx tsc --noEmit` 통과
- [ ] 실경로: 테스트가 실제 remove, restoreFromTrash, reflect 경로를 탄다. 우회했으면 구현 메모에 갭을 적는다

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/state/ydoc/undo.ts` | 단계 meta |
| `web/src/state/workspace.ts` | reflect :1575-1620, remove :3421-3473, removeSelected :3475-3547, restoreFromTrash :3561-3585, writeCardToDocHandle :1498-1529 |
| `web/src/state/storage.ts` | trashNotes :380, restoreNote :428, :473, removeNote :336 |
| `web/src/state/ydoc/sharedSnapshot.ts` | 쓰기 기준값 |
| `web/src/state/cardPersist.ts` | 예약 미러 쓰기, cancelPersist |

## 구현 메모
