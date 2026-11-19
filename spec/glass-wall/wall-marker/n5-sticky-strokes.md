# n5-sticky-strokes — 포스트잇 위 마카 획

> 자기완결 브리프. runner는 상위 spec + 이 파일만 본다. 진행 메모는 이 파일에만 쓴다 — 상위 spec은 호출자가 고친다. `**상태**:` 줄은 손으로 고치지 않는다 — graph-run이 `진행`·`끝남`을 쓰고, 멈추면 `node_state.py block`, 사람 확인이 필요하면 `node_state.py review`만 쓴다.

**agent**: runner
**id**: WM-5
**상위**: spec/glass-wall/wall-marker/spec.md
**deps**: n2-held-tool, n3-drawing-engine
**상태**: 아직 안 함
**담당 행**: T4, T7, T8, T15

## 문제

포스트잇 획은 검정 한 색에 레이어 굵기 하나뿐이고, 펜 모드에서만 기울기를 펴고 그려진다.

## 목표

마카를 들고 포스트잇 위에서 시작해 그으면, 그 포스트잇의 획이 그 마카 색·굵기로 남고 포스트잇과 함께 움직인다. 옛 메모 펜 획도 그대로 보인다. 담당 행: T4, T7의 획 생성, T8의 포스트잇 부분, T15의 렌더.

## 확정된 결정 (그대로 따른다)

- D2=A: 획은 노트 `overlay`에 path마다 색·굵기를 실어 저장한다.
- D4=A: 포스트잇에서 시작한 획은 포스트잇 가장자리에서 잘린다.
- D7=A: 기운 포스트잇 그대로 그린다. 좌표는 포스트잇 자기 좌표로, 회전을 거꾸로 풀어 저장한다.
- D5=A: 태블릿 펜 입력은 아무것도 안 들어도 마지막 마카로 그린다.
- 내가 그리는 중에 다른 사람이 그 포스트잇을 지우면, 그리던 획은 버린다.

## 작업

1. `DraggableCard.tsx`·`cards/text/Content.tsx`의 `DrawingLayer`를 `heldTool`로 켠다. 회전을 푸는 `toLocal`을 n3 엔진에 넘긴다.
2. 확정 시 overlay를 쓰고 n2 기록에 `sticky` 항목을 남긴다. 천이면 n3 `eraseArea` 결과로 overlay를 고친다.
3. 획을 포스트잇 박스로 잘라 그린다.
4. `MemoExpandDialog.tsx`는 펼친 메모에서도 같은 색·굵기로 보이게만 맞춘다.
5. 그리는 중 노트가 사라지면 draft를 버린다.

## 완료 기준

- [ ] spec 공통 완료 기준 전부
- [ ] `cd web && bunx vitest run src/components/workspace/cards` 통과. 새 테스트: 빨강 마카로 포스트잇 위 끌기 → overlay path `color: "red"` (T4), 5도 기운 포스트잇에서 화면 수평선이 자기 좌표에서 기운 선으로 저장된다, 노트 x,y를 바꿔도 overlay가 같다 (T4 따라감), 색·굵기 없는 옛 overlay가 검정·thin으로 그려진다 (T15), 천 문지르기 → overlay에서 조각 교체 (T8)
- [ ] 실경로: 포인터 이벤트 → `setOverlay` → Dexie 노트 행까지

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/components/workspace/DraggableCard.tsx` | 포스트잇 껍데기 |
| `web/src/components/workspace/cards/text/Content.tsx` | overlay 렌더 |
| `web/src/components/workspace/cards/MemoExpandDialog.tsx` | 펼친 메모 렌더 |
| `web/src/components/workspace/cards/_shared/DrawingLayer.tsx` | n3 산출물 |

## 구현 메모
