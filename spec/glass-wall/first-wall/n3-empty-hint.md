# n3-empty-hint — 빈 벽에는 힌트 한 줄만 있다

> 자기완결 브리프. runner는 상위 spec + 이 파일만 본다. 진행·상태는 이 파일에만 쓴다.

**agent**: runner
**id**: FW-3
**상위**: spec/glass-wall/first-wall/spec.md
**deps**: 없음
**상태**: 아직 안 함
**담당 행**: T1, T2, T3
**확정 결정**: D5=A, D8=A

## 문제

빈 벽 앞에서 무엇부터 할지 알려 주는 것이 없고, 지금 뜨는 안내 상자 문구는 AI 재노출을 전제한 말이다.

## 목표

벽에 메모도 마카 획도 없으면 "마카를 집거나, 아무 데나 두 번 눌러 포스트잇" 한 줄이 아래 가운데에 보인다. 하나라도 생기면 사라지고, 다시 비면 다시 보인다. 힌트는 누름을 가로채지 않는다.

## 확정 결정

- **D5=A** — 벽이 비어 있으면 보이고, 획이나 포스트잇이 하나라도 있으면 숨긴다. "봤음" 상태를 저장하지 않는다. 모든 벽에 같은 규칙이다.
- **D8=A** — `SystemBoardEmpty` 자리에 힌트 한 줄을 그리고 옛 문구 키 `workspace.system.empty.*`를 지운다.

## 작업

1. 순수 함수 `isWallEmpty(cards, wallStrokeCount)`를 만든다. 지금 보드의 카드 0장이고 벽 획 0개면 참이다.
2. 벽 획 개수: 선행 — wall-marker의 벽 획 저장 노드(`strokes` 테이블·Y.Map). 이미 머지돼 있으면 그 셀렉터를 쓴다. 없으면 0으로 넘기고, 구현 메모에 "wall-marker 머지 뒤 연결 필요"를 남긴다.
3. `SystemBoardEmpty.tsx`를 힌트 컴포넌트로 바꾼다. 상자·그림자·버튼 없이 글자 한 줄, `pointer-events: none`, 화면 아래 가운데. 마카 트레이가 있으면 트레이 바로 위다 — 트레이 위치는 wall-marker 몫이니 지금은 아래 가운데 고정값으로 둔다.
4. `Canvas.tsx` 712~717행 렌더 조건을 `SYSTEM_BOARD_ID` 한정에서 `isWallEmpty`로 바꾼다.
5. `ko.json`에 힌트 키를 더하고 `workspace.system.empty` 블록을 지운다.

## 완료 기준

- [ ] spec 공통 완료 기준 전부
- [ ] 카드 0장 벽을 렌더하면 "마카를 집거나, 아무 데나 두 번 눌러 포스트잇" 글자가 정확히 1번 보이고 role=dialog·button이 힌트 안에 0개 — T2
- [ ] 카드를 하나 더하면 힌트가 사라지고, 그 카드를 지우면 다시 보인다 — D5
- [ ] `isWallEmpty([], 1) === false` 단위 테스트 — T3 조건
- [ ] 힌트 요소의 계산된 `pointer-events`가 `none` — T2
- [ ] `grep -rn "workspace.system.empty" web/src` 결과 0줄
- [ ] `cd web && bunx vitest run <새로 쓴 테스트 파일>` 통과
- [ ] 실경로: 테스트가 실제 `Canvas` 렌더 조건을 탄다. wall-marker 없이 획 수를 0으로 넘겼으면 갭으로 기록

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/components/workspace/cards/SystemBoardEmpty.tsx` | 힌트로 바꿀 컴포넌트 |
| `web/src/components/workspace/Canvas.tsx` | 712~717행 렌더 조건. n4도 이 파일을 고친다 — 다른 영역이니 Edit 충돌이 나면 다시 읽고 고친다 |
| `web/src/i18n/messages/ko.json` | 104~108행 `workspace.system.empty` |

## 구현 메모

## 담당 행 메모

- T2 · T3(힌트가 사라지는 조건) · T1(빈 벽 화면 부분)
