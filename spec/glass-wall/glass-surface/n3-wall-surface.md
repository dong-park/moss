# n3-wall-surface — 캔버스 바탕 레이어 — 유리·화이트보드·코르크와 배지 자리

> 자기완결 브리프. `spec/glass-wall/glass-surface/` 밑에 산다. runner는 상위 spec + 이 파일만 본다. 진행·상태는 이 파일에만 쓴다 — 상위 spec은 호출자가 고친다.

**agent**: runner
**id**: GS-3
**상위**: spec/glass-wall/glass-surface/spec.md
**deps**: n1-material-model
**상태**: 아직 안 함
**담당 행**: T1, T2, T8, T11, T12, T13

## 문제

캔버스 바탕이 회색 단색이라 벽 앞에 서 있다는 감각이 없다.

## 목표

캔버스 맨 아래에 재질 바탕 레이어 하나가 깔린다. 유리면 뒤 방이 흐리게 비치고 사선 반사광 두 줄이 있다. 화이트보드·코르크는 그 면을 그린다. 오른쪽 위에 배지 자리가 비어 있다.

## 확정된 결정

- D3 = A. 뒤 방은 시안처럼 그라데이션으로 그린 흐린 방 하나다. 그림 파일을 싣지 않고, 사용자가 바꾸지 않는다.
- D4 = A. 뒤 방과 반사광은 화면에 고정한다. 화이트보드 광택과 코르크 점무늬는 내용과 함께 팬한다. 줌에 따라 무늬를 확대하지 않는다.
- D5 = A. 처음부터 흐린 그림으로 그린 뒤 방 레이어를 쓴다. 카드 아래에 `backdrop-filter`를 걸지 않는다. wall-scale D5와 같은 결정이다.
- D7 = C. 코르크는 시안색 #c79a62 그대로다. 대비 판정에서 코르크를 뺀다.
- D8 = A. 투명도 줄이기가 켜졌거나 블러를 못 그리면 뒤 방 없이 젖빛 단색 면과 반사광 띠를 그린다.
- 시안 값은 상위 spec `구현 메모`의 `gen.py` 줄을 그대로 쓴다. 뒤 방에 쓰던 CSS `filter: blur()`는 고정 레이어에 한 번 그리고 합성만 하므로 허용한다.

## 작업

1. 새 파일 `web/src/components/workspace/wall/WallSurface.tsx`. 재질 id와 뷰포트 오프셋을 받아 바탕을 그린다. 뒤 방·반사광은 `position: fixed` 계층, 무늬는 팬 오프셋만큼 `background-position`을 옮긴다. 레이어에 `data-wall-material` 속성을 단다.
2. 새 파일 `web/src/components/workspace/wall/WallMaterialSwatch.tsx`. 같은 바탕을 작은 카드 크기로 그린다. n4 재질 카드와 n5 메모판 안쪽이 쓴다.
3. `web/src/components/workspace/Canvas.tsx` 680행 `bg-bg`를 걷어 내고 `WallSurface`를 맨 아래에 깐다. 현재 보드의 `wallMaterial`을 n1 `wallMaterialFor`로 읽는다. 첫 렌더부터 저장된 재질을 그려 유리가 잠깐 비치지 않게 한다 (T6 깜빡임).
4. 포스트잇 그림자는 시안 `.p` 값으로 맞춘다. 마카 획에는 그림자를 넣지 않는다 (T2). 포스트잇 카드 컴포넌트를 크게 고치지 말고 그림자 토큰만 바꾼다. 손맛은 sticky-handfeel 몫이다.
5. 오른쪽 위 위 16px·오른쪽 18px에 빈 배지 자리 `WallBadgeSlot`을 둔다. 반투명 흰 알약 바탕이다. 안에는 children만 받는다 — 문구와 동작은 local-promise 몫. 줌 막대·Dock이 이 자리를 덮지 않게 한다 (T11).
6. `@media (prefers-reduced-transparency: reduce)`와 `@supports not (backdrop-filter: blur(1px))`에서 D8 물러선 화면을 그린다 (T12). 배지 자리의 블러도 같은 규칙을 따른다.
7. 테스트: 새 파일 `web/src/components/workspace/wall/__tests__/WallSurface.test.tsx`.
   - 재질 셋마다 `data-wall-material`이 맞고, 값 없음은 `glass`다.
   - 바탕 레이어 어디에도 `backdrop-filter` 스타일이 없다 (D5).
   - 대비: n1 레지스트리의 유리·화이트보드 대표 바탕색마다 마카 4색 #1f2430 #2457b8 #d0453c #2f8a57 대비가 3:1 이상이다. 코르크는 검사하지 않는다 (T8 자동 쪽). 실제 렌더 지점 측정은 n6 몫.

## 완료 기준

- [ ] spec 공통 완료 기준 전부
- [ ] `cd web && bun run test -- src/components/workspace/wall/__tests__/WallSurface.test.tsx` 통과
- [ ] `cd /Users/dongpark/moss && grep -rn "backdrop-filter\|backdropFilter" web/src/components/workspace/wall/WallSurface.tsx | wc -l` 결과 0
- [ ] `cd web && bunx tsc --noEmit` 통과
- [ ] 실경로: `Canvas.tsx`가 실제로 `WallSurface`를 그린다. 시각·성능 확인은 n6 몫

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/components/workspace/Canvas.tsx` | 680행 바탕 `bg-bg` 교체 |
| `web/src/components/workspace/ZoomBar.tsx` | 배지 자리와 겹치지 않는지 확인 |
| `web/src/app/globals.css` | `--color-bg` 등 토큰 |
| `spec/glass-wall/mockups/gen.py` | 11~23행 바탕 CSS, 24행 포스트잇 그림자, 36행 배지 |
| `web/src/state/wallMaterials.ts` | n1 산출물 |
| `web/src/components/workspace/wall/` | 새 폴더 |

## 담당 행 메모

- T1, T2, T8(자동 판정 쪽), T11, T12, T13(구조 쪽)
