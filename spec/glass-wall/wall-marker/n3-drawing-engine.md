# n3-drawing-engine — 그리기 엔진을 좌표 변환·획별 색·면적 지우기로 넓히기

> 자기완결 브리프. runner는 상위 spec + 이 파일만 본다. 진행·상태는 이 파일에만 쓴다 — 상위 spec은 호출자가 고친다.

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

### 2026-10-12 n3 구현 메모 (runner)

**만든 것** — 커밋 `dd299b3`.
- `useDrawing`: `{strokes, active, tool, color, width, eraserRadius, toLocal, onCommit, onErase, onCancel, svgRef}`를 받고 `{draft, onPointerDown/Move/Up/Cancel}`을 돌려준다.
  - `toLocal`을 안 주면 SVG 박스 기준 1:1 (지금 동작). 벽은 보드 좌표 변환을, 기운 포스트잇은 자기 좌표 변환을 주입한다.
  - 지우기는 손을 뗄 때 한 번에 적용한다. 문지르는 동안 실시간으로 잘라 보이는 일은 하지 않는다(필기감은 marker-feel 몫).
  - 두 번째 포인터는 `stopPropagation`/`preventDefault`를 하지 않는다 — 위의 줌·팬이 이어받는다.
- `eraseArea(strokes, wipePath, radius, newId?)` → `{removedIds, added}`.
  - 획을 `radius/2` 간격으로 잘게 나눠 판정하고 조각 양 끝에만 판정용 점을 남긴다. 자르는 위치 오차는 `radius/2` 이내다.
  - `added`는 `DrawingStroke[]`(id 포함)이라 `replaceWallStrokes(removedIds, added)`에 그대로 넘긴다(`NewWallStroke`와 호환).
  - 조각이 점 1개 이하면 버린다. 닿지 않은 획은 결과에 들지 않는다.
- `DrawingLayer`: `parseStrokes`/`serializeStrokes`로 읽고 쓴다 → 지우개·덧그리기를 거쳐도 색·굵기가 유지된다(테스트로 덮음).
  - 새 optional props: `color`, `width`, `toLocal`, `eraserRadius`, `onCancel`. `penWidth`는 optional이 됐다.
  - 렌더: 검정은 `stroke` prop(기본 본문색), 그 밖의 색 이름은 토큰 표. `thin` 획은 `penWidth`가 있으면 그 값(옛 펜 "원래 굵기"), 없으면 토큰 표. `mid`·`thick`은 항상 토큰 표.

**n4·n5가 알아야 할 것**
- 벽은 `DrawingLayer`를 쓰지 않고 `useDrawing`을 직접 부르는 편이 맞다 — 벽 획은 `value` JSON이 아니라 스토어 행이고, `strokes`에 `WallStroke`를 그대로 넘기면 된다(`id`·`points`·`color`·`width`만 읽는다). `onCommit` → `addWallStroke`, `onErase` → `replaceWallStrokes`, `onCancel` → 기록에 아무것도 넣지 않는다.
- 포스트잇은 `DrawingLayer`에 `toLocal`을 주입해 쓴다. 이 경우 `penWidth`를 넘기지 않아야 `thin`이 토큰 굵기로 그려진다.
- `eraserRadius`는 호출측 좌표 단위다. 벽은 보드 단위로 줘야 줌과 무관하게 같은 면적을 닦는다(화면 px 반경을 쓰려면 `/ scale`).
- `useDrawing`은 SVG 이벤트 핸들러 형태다. 벽 레이어가 SVG가 아니면 어댑터가 필요하다 — n4가 정한다.

**호출자가 정할 것**
- 지금 `MemoExpandDialog`는 여전히 `penWidth`를 넘기고 `color`/`width`를 안 넘긴다 → 모든 획이 검정·가는 선(=옛 동작)이다. 마카 색을 고르는 UI는 n2/n5 몫이라 이 노드에서 건드리지 않았다.
- 지우기 조각은 원본 자리가 아니라 맨 뒤(위)에 쌓인다. 벽은 `createdAt` 정렬이라 같은 규칙이다. 겹친 획의 위아래를 지킬지는 정하지 않았다.

**실경로 갭** — 포인터는 jsdom에서 `pointerId`·`pointerType`을 직접 실어 보냈다. 실제 터치 두 손가락, 펜 압력, 손바닥 입력 걸러짐은 n7(실기기·CDP) 몫이다.

**게이트** — 내 3파일은 `tsc` 오류 0, `eslint` 0, `check-i18n` exit 0. `cards` 단위 테스트는 내 테스트 포함 통과.
- 워크트리 전체 `tsc`에는 오류가 남아 있다 — 모두 n2가 진행 중인 `penMode` → `heldTool` 교체와 `memoVariety` 시그니처 변경 때문이고, 내 파일에는 없다.
- `MemoExpand.test.tsx`의 "펜 모드에선 …" 2건이 같은 이유로 실패한다(n2가 테스트를 옮길 몫).
