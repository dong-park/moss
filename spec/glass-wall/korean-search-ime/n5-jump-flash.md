# n5-jump-flash — T5 그 벽으로 날아가 포스트잇이 반짝이기

> 자기완결 브리프. `spec/glass-wall/korean-search-ime/` 밑에 산다. runner는 상위 spec + 이 파일만 본다. 진행 메모는 이 파일에만 쓴다 — 상위 spec은 호출자가 고친다. `**상태**:` 줄은 손으로 고치지 않는다 — graph-run이 `진행`·`끝남`을 쓰고, 멈추면 `node_state.py block`, 사람 확인이 필요하면 `node_state.py review`만 쓴다.

**agent**: runner
**id**: KS-5
**상위**: spec/glass-wall/korean-search-ime/spec.md
**deps**: 없음
**상태**: 아직 안 함
**담당 행**: T5

## 문제

결과를 골라도 다른 벽 포스트잇으로 가는 길이 검색에 없고, 도착한 포스트잇을 눈으로 알아볼 표시도 없다.

## 목표

카드 id 하나를 받아 그 벽으로 바꾸고, 포스트잇을 화면 가운데로 옮기고, 둘레를 반짝이는 store 액션이 있다. 검색 창(n4)이 이것을 부른다.

## 작업

1. 기존 `openCardOnCanvas(noteId)`를 쓴다. Dexie에서 소속 벽을 읽고 `setCurrentBoard` 후 `panToCard` 한다. 검색용 액션은 이것을 감싸고 반짝임 상태를 켠다.
2. **D5 확정 = A.** 파란 테두리 빛이 두 번 깜빡이고 1.2초 뒤 사라진다. 그 포스트잇은 골라진 상태로 남는다. 색은 기존 검색 강조 `rgba(79,124,243,…)`를 쓴다.
3. 반짝임 상태는 store에 `flashCardId`와 시작 시각으로 둔다. 카드 렌더 쪽에서 CSS 애니메이션으로 그린다. 1.2초 뒤 상태를 지운다. `prefers-reduced-motion`이면 깜빡이지 않고 테두리만 1.2초 보인다.
4. 경계: 고르는 사이 포스트잇이 지워졌으면 벽을 바꾸지 않고 아무것도 하지 않는다.
5. 축소한 벽에서의 반짝임 모양은 wall-zoom과의 경계다. 지금 LOD에서도 테두리가 보이게만 한다.

## 완료 기준

- [ ] spec 공통 완료 기준 전부
- [ ] `cd web && npx vitest run src/state/__tests__/searchJump.test.ts` 통과. 아래가 테스트로 있다.
  - 다른 벽 카드 id로 부르면 `currentBoardId`가 그 벽, 그 카드가 선택됨, `flashCardId`가 그 id (T5)
  - 가짜 타이머 1.2초 뒤 `flashCardId`가 비고 선택은 남는다 (D5)
  - 지워진 카드 id면 `currentBoardId`가 그대로다
- [ ] 반짝임 렌더 테스트: `flashCardId`인 카드 DOM에 반짝임 클래스가 붙는다
- [ ] `cd web && npx tsc --noEmit` 0
- [ ] 실경로: 실제 `openCardOnCanvas`를 탄다. 목으로 갈아 green이면 갭으로 기록

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/state/workspace.ts` | `openCardOnCanvas`(2422행 근방), `panToCard`(4169행 근방) |
| `web/src/components/workspace/DraggableCard.tsx` | 카드 렌더 — 반짝임 클래스 |
| `web/src/components/workspace/cards/_shared/zoomLod.ts` | LOD 경계 확인만 |
| `web/src/state/__tests__/searchJump.test.ts` | 새로 만든다 |
