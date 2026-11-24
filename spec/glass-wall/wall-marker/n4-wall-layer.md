# n4-wall-layer — 벽 획 레이어: 빈 벽에 쓰고, 지우고, 동기화한다

> 자기완결 브리프. runner는 상위 spec + 이 파일만 본다. 진행·상태는 이 파일에만 쓴다 — 상위 spec은 호출자가 고친다.

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

### 2026-10-12 n4 구현 메모 (runner)

**만든 것**
- `components/workspace/WallStrokeLayer.tsx` — 벽 획 레이어. `Canvas.tsx` 월드 변환 안, 카드·연결선 아래(`zIndex: 1`: 메모판(auto)보다 위, 연결선 5·카드 10보다 아래)에 `<svg>`로 깐다. 획은 보드 좌표 그대로라 팬·줌에 같은 자리에 같은 비율로 남는다. `createdAt` 순으로 그린다(원격에서 늦게 온 옛 획도 제 자리). 휴대폰에서도 그린다.
- 입력은 레이어가 `WallInput` 핸들(`onPointerDown/Move/Up/Cancel`, `lastDrawAt`)을 `useImperativeHandle`로 내주고 `Canvas` root의 포인터 이벤트를 그대로 건넨다. 그리기 코어는 n3 `useDrawing` 하나다(`toLocal`로 화면 → 보드 좌표 `(client − rect − viewport) / scale`, 소수 첫째 자리).
  - 시작 판정: `drawingToolFor`(D5) → 휴대폰이면 무시 → `startsOnWall`(root 바탕이거나 월드 안에서 포스트잇이 아닌 곳). 포스트잇(`isStickyCard`: `kind === "text"`)이면 받지 않는다 — n5 몫. 메모판·사진·함 위는 벽 획이다(D12=A).
  - 그리는 도중 경계를 넘어도 같은 벽 획이다(포인터 캡처 + 엔진이 끝까지 소유).
  - 엔진의 `stopPropagation`은 뺐다(바탕 위 누르기가 열린 메뉴의 바깥 클릭 닫기를 죽이지 않게). `preventDefault`는 그대로라 호환 mouse 이벤트(고르기 상자·카드 끌기)는 안 뜬다.
- 기록(D9=A): 새 획은 `recordMarkerEdit({kind:"wall", before:[], after:[획]})`, 천은 `{before:[지운 원본], after:[남은 조각]}`. 아무것도 안 닿은 문지르기·취소된 획은 기록에 안 쌓인다. 원격 획은 쌓이지 않는다.
- 천: 반경 `WALL_CLOTH_RADIUS_PX`(12 화면 px)를 `/ scale`로 보드 단위로 바꿔 엔진에 준다 — 포인터(천) 크기와 같은 손바닥 면적을 닦는다.
- 두 손가락(T12): 엔진이 두 번째 포인터에서 획을 버린다. 그 포인터는 어디에 닿았든(포스트잇 위여도) 엔진에 건넨다. 줌·팬은 레이어가 터치 두 개의 거리·중심으로 `zoomAt`·`panBy`를 부른다.
  - **기존 터치 핀치 줌은 없었다**(`Canvas.tsx`의 "pinch"는 트랙패드 `ctrlKey` 휠뿐). 그래서 든 동안만 켜지는 최소 핀치를 이 레이어에 넣었고, 든 동안 root `touch-action`을 `none`으로 끈다(안 들었을 땐 `manipulation` 그대로 — 브라우저 핀치·팬은 그대로 둔다, first-wall T4).
- `Canvas.tsx`: 든 동안 빈 벽 끌기는 고르기 상자(`onMouseDown`)로 안 간다. 스페이스 팬·글상자 배치 중이면 레이어가 `suspended`. 펜(D5)으로 방금 그린 뒤의 두 번 누르기(dblclick)는 포스트잇을 안 만든다(`WALL_DRAW_DBLCLICK_GUARD_MS` 500ms).
- 아무것도 안 든 펜은 글 고치는 중(`editingId`)에는 그리지 않는다 — 마카를 든 채 글 고치기 상태가 안 생기게.

**n5·n6이 알아야 할 것**
- `isStickyCard`·`WALL_CLOTH_RADIUS_PX`는 `WallStrokeLayer.tsx`에서 export한다. n5가 포스트잇 판정을 따로 두면 두 곳이 갈라질 수 있다 — 같은 규칙(`kind === "text"`)인지 확인.
- n6: 고르기 상자를 벽 획에 쓰려면 `Canvas`의 `onMouseDown` 마카 가드(`heldTool`이면 return) 뒤, 안 든 상태에서만 동작한다. 레이어는 `data-wall-stroke="<id>"` 폴리라인을 그린다(닿음 판정은 스토어 `wallStrokes` 점으로 하면 된다). 벽 획 옮기기(`moveWallStrokes`)는 아직 기록 항목이 없다 — n2 메모 그대로.

**갭 — 호출자 확인**
- **브라우저를 열지 않았다**(jsdom 합성 포인터까지). 못 본 것: 포인터 캡처(`pointer-events: none`인 SVG에 건다 — Safari에서 안 잡혀도 터치는 암묵 캡처라 이어지지만 마우스는 창 밖에서 놓치면 획이 열린 채 남을 수 있다 → 다음 누르기에서 정리된다), 실제 두 손가락 핀치·`touch-action` 동작, 펜 손바닥 걸러짐, 포인터 모양과 획의 어울림, 메모판 위·아래 겹침. n7 몫.
- **사진·함 위에서 시작한 획은 가려진다.** D12=A + D5(벽 획은 카드 아래)를 그대로 따르면, 카드(z 10)인 사진·함 위에 그은 획은 그 카드 밑에 깔려 안 보이고 카드를 옮기면 드러난다. 메모판(z auto)은 레이어 아래라 보인다. marker-meets-sticky D4=B(메모판 위 획은 판을 따라간다)와 충돌하는 지점이기도 하다 — 호출자 결론이 오면 `startsOnWall`(사진 위에서는 못 그리게)과 `frameId`를 손본다. 지금은 D12=A로 구현했다.
- **천이 포스트잇 밑의 벽 획도 닦는다**(보이지 않는데 지워진다). 천을 벽에서 시작해 포스트잇 위를 지나가면 그 밑 획이 닿는다. 가릴지는 정하지 않았다.
- 연결선은 천이 지우지 않는다(획이 아니다).
- 벽 획 생성 시각 정렬이라 지우개 조각은 맨 위에 쌓인다(n3 메모 그대로).
- 저장 실패 알림은 n1의 토스트(`saveFailed`)를 그대로 쓴다 — 벽 전용 문구는 안 만들었다.

**게이트** (web/, 2026-10-12): `tsc --noEmit` 0 · `vitest run` 205 파일 1865 통과·7 skip(unhandled `DatabaseClosedError` 3건은 `mossBridge`·`ac-capture` 테어다운 — 내 파일이 아님) · 바꾼 파일 eslint 0 · `check-i18n.mjs` exit 0. 새 테스트 21개 `__tests__/WallStrokeLayer.test.tsx`: 빈 벽 끌기(T3) · 포인터→스토어→Y.Doc→Dexie→새로고침 · 탭=점 · 줌 1.1배 좌표 동일 · 팬·줌 뒤 저장값 불변 · 포스트잇 이동 전후 스냅샷(T5) · 메모판 위=벽 획 · 포스트잇 위=안 받음 · 도중 경계 넘기 · UI 위 무시 · 천 문지르기→조각 교체+⌘Z(T8) · 안 닿은 문지르기 · ⌘Z/⇧⌘Z · 두 Y.Doc 동시 그리기+자기 획만 되돌리기(T11) · 두 손가락 취소+줌(T12) · touch-action · 펜(D5) · 저장 실패(T13) · 휴대폰(T14).
