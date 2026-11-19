# n4-wall-layer — 벽 획 레이어: 빈 벽에 쓰고, 지우고, 동기화한다

> 자기완결 브리프. runner는 상위 spec + 이 파일만 본다. 진행 메모는 이 파일에만 쓴다 — 상위 spec은 호출자가 고친다. `**상태**:` 줄은 손으로 고치지 않는다 — graph-run이 `진행`·`끝남`을 쓰고, 멈추면 `node_state.py block`, 사람 확인이 필요하면 `node_state.py review`만 쓴다.

**agent**: runner
**id**: WM-4
**상위**: spec/glass-wall/wall-marker/spec.md
**deps**: n2-held-tool, n3-drawing-engine
**상태**: 아직 안 함
**담당 행**: T3, T5, T8, T11, T12, T13, T14

## 문제

캔버스에 획 레이어가 없어서 카드 밖 빈 벽에는 아무것도 쓸 수 없다.

## 목표

마카를 들고 포스트잇 밖에서 시작해 그으면 벽 획이 보드 좌표로 남는다. 팬·줌에도 같은 자리, 새로고침에도 남고, 공유 보드에서는 상대에게도 보인다. 담당 행: T3, T5, T8의 벽 부분, T11, T12의 연결, T13, T14의 획 보기.

## 확정된 결정 (그대로 따른다)

- D4=A + marker-meets-sticky D1=A: 시작점이 주인. 벽 획은 포스트잇 아래에 깔린다.
- marker-meets-sticky D5=A: 아래부터 벽 획, 연결선, 포스트잇 순서다.
- D12=A: 포스트잇이 아닌 것(메모판·사진) 위에서 시작한 획은 벽 획이다. 단 marker-meets-sticky D4=B와 충돌한다 — 호출자 결론이 오기 전에는 D12=A로 구현하고 구현 메모에 남긴다.
- D5=A: 태블릿 펜 입력은 아무것도 안 들어도 마지막 마카로 그린다.
- D9=A: 내가 그은 획과 지운 획만 n2 기록에 넣는다.
- 저장 실패 시 기존 저장 실패 알림을 띄우고, 화면의 획은 바로 지우지 않는다.

## 작업

1. `WallStrokeLayer`를 `Canvas.tsx` 월드 변환 안, 카드와 연결선보다 아래에 마운트한다. n3 엔진에 화면→보드 좌표 변환을 넘긴다.
2. 포인터다운 대상 판정: 포스트잇이면 n5 몫으로 넘기고, 그 밖이면 벽 획을 시작한다.
3. 획 확정 시 n1 `addWallStroke`와 n2 기록 항목을 남긴다. 천이면 n3 `eraseArea` 결과를 `replaceWallStrokes`로 쓴다.
4. 두 손가락 취소를 기존 핀치 줌과 잇는다.
5. 휴대폰에서도 레이어는 그린다. 입력만 받지 않는다.
6. 포스트잇 이동은 벽 획 저장값을 건드리지 않는다는 테스트를 둔다 (T5. 손맛 확인은 marker-meets-sticky).

## 완료 기준

- [ ] spec 공통 완료 기준 전부
- [ ] `cd web && bunx vitest run src/components/workspace/__tests__/WallStrokeLayer.test.tsx` 통과. 테스트: 빈 벽 끌기 → strokes 1행 (T3), 줌 2배에서 그어도 보드 좌표가 줌 1배 기준과 같다, 포스트잇 이동 전후 strokes 스냅샷 동일 (T5), 천 문지르기 → 조각 교체 (T8), 저장 실패 흉내 → 알림 + 획 유지 (T13), 휴대폰 크기 → 획 보이고 입력 무시 (T14)
- [ ] 공유 테스트: Y.Doc 두 개를 이어 각자 획 하나씩 → 양쪽 strokes 2행, 한쪽 ⌘Z → 자기 획만 사라짐 (T11)
- [ ] 실경로: 포인터 이벤트 → 스토어 → Dexie까지 관통하는 테스트

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/components/workspace/Canvas.tsx` | 마운트, 포인터 라우팅, 핀치 |
| `web/src/components/workspace/WallStrokeLayer.tsx` | 새로 만든다 |
| `web/src/components/workspace/cards/_shared/useDrawing.ts` | n3 산출물 |
| `web/src/state/workspace.ts` | n1 액션, n2 기록 |

## 구현 메모
