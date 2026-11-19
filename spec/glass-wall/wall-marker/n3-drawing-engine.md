# n3-drawing-engine — 그리기 엔진을 좌표 변환·획별 색·면적 지우기로 넓히기

> 자기완결 브리프. runner는 상위 spec + 이 파일만 본다. 진행 메모는 이 파일에만 쓴다 — 상위 spec은 호출자가 고친다. `**상태**:` 줄은 손으로 고치지 않는다 — graph-run이 `진행`·`끝남`을 쓰고, 멈추면 `node_state.py block`, 사람 확인이 필요하면 `node_state.py review`만 쓴다.

**agent**: runner
**id**: WM-3
**상위**: spec/glass-wall/wall-marker/spec.md
**deps**: n1-stroke-store
**상태**: 아직 안 함
**담당 행**: T8, T12

## 문제

지금 엔진은 카드 안 1:1 좌표만 알고, 레이어 하나에 색·굵기 하나뿐이며, 지우개가 획을 통째로 지운다.

## 목표

같은 엔진을 벽(보드 좌표)과 기운 포스트잇(자기 좌표)이 함께 쓴다. 획마다 색과 굵기를 그린다. 천은 문지른 부분만 지운다. 두 손가락이 닿으면 그리던 획을 버린다. 담당 행: T8의 지우기 규칙, T12.

## 확정된 결정 (그대로 따른다)

- D8=A: 문지른 부분만 지운다. 획을 잘라 남은 조각을 새 획으로 낸다. 닦은 자국 질감은 marker-feel 몫이다.
- D14=A: 굵기는 보드 단위다.
- 엔진은 하나다. `useDrawing`을 갈래로 복제하지 않는다.

## 작업

1. `useDrawing`이 좌표 변환 함수 `toLocal(clientX, clientY)`를 밖에서 받게 한다. 기본값은 지금 동작이다.
2. 확정 획에 `color`·`width` 이름을 싣고, `DrawingLayer`가 path마다 n1 토큰으로 색과 굵기를 그린다.
3. 순수 함수 `eraseArea(strokes, wipePath, radius)`를 만든다. 결과는 `{removedIds, added}`이고, 잘린 조각은 새 id를 받는다. 조각이 점 1개 이하면 버린다.
4. 두 번째 포인터가 들어오면 그리던 draft를 버리고 `onCancel`을 부른다.
5. 지금 엔진 테스트를 새 시그니처로 옮긴다. 탭=점 저장은 유지한다.

## 완료 기준

- [ ] spec 공통 완료 기준 전부
- [ ] `cd web && bunx vitest run src/components/workspace/cards/_shared` 통과
- [ ] `eraseArea` 테스트: 가로 직선 가운데만 문지르면 양쪽 두 조각이 남는다. 닿지 않은 획은 그대로다. 끝만 문지르면 한 조각이 남는다
- [ ] 두 포인터 테스트: 그리는 중 두 번째 pointerdown이 오면 확정 획이 늘지 않는다 (T12)
- [ ] 획별 렌더 테스트: 색이 다른 두 path가 서로 다른 stroke 색으로 그려진다
- [ ] `grep -c "function pathsIntersect\|function eraseArea" -r web/src` 정의가 각각 1개

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/components/workspace/cards/_shared/useDrawing.ts` | 엔진 |
| `web/src/components/workspace/cards/_shared/DrawingLayer.tsx` | 렌더 |
| `web/src/state/marker/tokens.ts` | n1 산출물 |
| `web/src/state/cardContent.ts` | n1이 넓힌 path 형식 |

## 구현 메모
