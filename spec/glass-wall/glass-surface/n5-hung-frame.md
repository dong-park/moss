# n5-hung-frame — 벽에 걸린 메모판과 메모판 재질 고르기

> 자기완결 브리프. `spec/glass-wall/glass-surface/` 밑에 산다. runner는 상위 spec + 이 파일만 본다. 진행 메모는 이 파일에만 쓴다 — 상위 spec은 호출자가 고친다. `**상태**:` 줄은 손으로 고치지 않는다 — graph-run이 `진행`·`끝남`을 쓰고, 멈추면 `node_state.py block`, 사람 확인이 필요하면 `node_state.py review`만 쓴다.

**agent**: runner
**id**: GS-5
**상위**: spec/glass-wall/glass-surface/spec.md
**deps**: n1-material-model, n3-wall-surface
**상태**: 아직 안 함
**담당 행**: T10, T14

## 문제

메모판이 유리벽 위에서 벽에 걸린 판으로 보이지 않고, 안쪽 재질도 고를 수 없다.

## 목표

메모판은 나무색 테두리와 그림자가 있는 걸린 판이다. 안쪽 재질은 기본 코르크이고, 판 우클릭 메뉴에서 유리·화이트보드·코르크로 따로 고른다. 벽 재질과 메모판 재질과 메모판 스킨은 서로 바꾸지 않는다.

## 확정된 결정

- D6 = C. 메모판 재질을 벽과 따로 고른다. 기본은 코르크, 고르는 자리는 판 우클릭 메뉴의 '판 모양' 옆 '판 재질'이다 — 둘 다 시안에서 추정, spec `확인 안 된 것` 참고.
- 세로 칸 스킨의 칸 선과 이름표는 메모판 재질 위에 그대로 그린다. 스킨 로직은 FEAT-frame-skins 몫이라 바꾸지 않는다.
- 시안 값: 테두리 10px #8b6a44, 그림자 `0 12px 24px -8px rgba(0,0,0,.35)`, 핀 #ff8a80→#c62828.
- 메모판 안 포스트잇의 빨간 핀은 그림 장식이다. 핀을 끌거나 누르는 동작은 만들지 않는다. 붙고 떼는 손맛은 sticky-handfeel 몫이다.

## 작업

1. `web/src/components/workspace/cards/frame/Content.tsx`에서 판 바탕을 n3 `WallMaterialSwatch`로 그리고, 테두리·그림자를 더한다. 재질은 n1 `frameMaterialFor`로 읽는다.
2. 메모판 소속 포스트잇 위쪽 가운데에 핀을 그린다. 소속 판정은 기존 규칙(메모 중심점이 판 안)을 그대로 쓴다.
3. `web/src/components/workspace/DraggableCard.tsx`의 판 우클릭 메뉴에 '판 재질 → 유리 / 화이트보드 / 코르크'를 더한다. 고르면 n1 `setFrameMaterial`을 부른다.
4. 문구는 `ko.json`에 `frame.material.*` 키로 넣는다.
5. 테스트: 새 파일 `web/src/components/workspace/cards/frame/__tests__/HungFrame.test.tsx`.
   - 재질 값 없는 예전 판은 코르크로 그려지고 테두리가 있다.
   - 메뉴로 화이트보드를 고르면 그 판만 바뀌고 다른 판·벽 재질은 그대로다. 안 포스트잇 x·y·소속도 그대로다 (T10).
   - 판 스킨을 세로 칸으로 바꿔도 판 재질이 그대로고, 그 반대도 같다 (T14).

## 완료 기준

- [ ] spec 공통 완료 기준 전부
- [ ] `cd web && bun run test -- src/components/workspace/cards/frame/__tests__/HungFrame.test.tsx src/components/workspace/cards/frame/__tests__/ColumnsSkin.test.tsx src/components/workspace/__tests__/DraggableCard.frameSkinMenu.test.tsx` 통과
- [ ] `cd web && bun run check:i18n` 통과
- [ ] `cd web && bunx tsc --noEmit` 통과
- [ ] 실경로: 테스트가 실제 판 우클릭 메뉴 경로를 탄다

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/components/workspace/cards/frame/Content.tsx` | 판 그리기 |
| `web/src/components/workspace/cards/frame/skins/ColumnsSkin.tsx` | 칸 선, 재질 위에 그대로 |
| `web/src/components/workspace/DraggableCard.tsx` | 판 우클릭 메뉴 |
| `web/src/components/workspace/__tests__/DraggableCard.frameSkinMenu.test.tsx` | 기존 메뉴 회귀 |
| `web/src/i18n/messages/ko.json` | 문구 |

## 담당 행 메모

- T10, T14(UI 쪽)
