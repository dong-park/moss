# n5-sticky-strokes — 포스트잇 위 마카 획

> 자기완결 브리프. runner는 상위 spec + 이 파일만 본다. 진행 메모는 이 파일에만 쓴다 — 상위 spec은 호출자가 고친다. `**상태**:` 줄은 손으로 고치지 않는다 — graph-run이 `진행`·`끝남`을 쓰고, 멈추면 `node_state.py block`, 사람 확인이 필요하면 `node_state.py review`만 쓴다.

**agent**: runner
**id**: WM-5
**상위**: spec/glass-wall/wall-marker/spec.md
**deps**: n2-held-tool, n3-drawing-engine
**상태**: 진행
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
- 넘겨받은 사실 (2026-10-12, n1·n2): 포스트잇 획은 `cardContent.ts`의 `parseStrokes`/`serializeStrokes` 새 쌍으로 읽고 쓴다(옛 `serializeHandwriting`은 점만 쓴다 — 쓰면 색·굵기가 검정·가는 선으로 돌아간다). 그리기 도구 판정은 `drawingToolFor`(D5). `setOverlay`가 되돌리기 기록을 자동으로 쌓는다.

**만든 것** (2026-10-12, 브랜치 feat/glass-wall-marker)

- `components/workspace/StickyStrokeLayer.tsx`(새): `DraggableCard`가 `card.kind === "text"`마다 `CardContent` 뒤에 얹는다. 앞면에서 빠져 있던 overlay 렌더를 되살렸고(옛 펜 획 = 검정·`thin`, T15), 든 도구로 켜진다.
  - 마카면 `tool="pen"`·든 색·스토어 `markerWidth`, 천이면 `tool="eraser"`. 확정은 `setOverlay` — 기록(`sticky` 항목)은 `setOverlay`가 자동으로 쌓는다. 한 획이 한 항목이다.
  - 그리는 중 그 포스트잇이 스토어에서 사라지면 확정하지 않는다(`onChange` 가드).
  - 검정 잉크는 재질·테마와 무관하게 마카 검정(`MARKER_COLOR_VALUE.black`)이다 — 앞면 종이는 고정 노랑 PNG라 `--color-text`를 따르면 어두운 테마에서 안 보인다.
- `cards/_shared/stickyGeometry.ts`(새): `clientToCardLocal`(화면→자기 좌표, 회전·줌을 푼다), `scaleFromBounds`, `clipStrokeToBox`(Liang–Barsky, 나갔다 들어오면 조각 여럿).
  - 변환 기준은 카드 껍데기의 `getBoundingClientRect()` 중심(회전 중심과 같다)이고, 줌은 바깥 경계 폭과 레이아웃 폭에서 거꾸로 구한다 — 스토어 `viewport.scale`에 의존하지 않고 상위 변환이 있어도 맞는다(경계가 0이면 `viewport.scale`). 회전각은 `cardRotationDeg`(D7=A).
- `DrawingLayer`: `acceptPen`·`handleRef`·`clip`·`cursor` 추가. `clip`이 크기 객체면 확정 획을 박스 `0,0~w,h`로 잘라 저장한다(D4=A); `true`면 보이는 것만 자른다(`overflow:hidden`).
- `useDrawing`: `acceptPen` 추가 — `active`가 아니어도 `pointerType === "pen"`이면 시작한다. 그리던 중 `active`가 꺼지면 draft를 버린다(전엔 draft가 남았다).
- 안 든 채 펜(D5=A): 레이어는 안 든 동안 `pointer-events:none`이라 손가락·마우스는 그대로 통과한다. 펜의 `pointerdown`은 `DraggableCard` 루트의 `onPointerDownCapture`가 레이어에 넘기고(`drawingToolFor` 판정, 글 편집 중·휴대폰 크기 제외), 이후 move/up은 포인터 캡처로 레이어가 직접 받는다. `preventDefault`가 호환 mousedown을 막아 카드가 안 끌린다.
- `MemoExpandDialog`: `penWidth`(고른 굵기 수치)를 걷고 `color={lastMarkerColor}`·`width={markerWidth}`를 넘긴다 — 고른 굵기가 옛 획 전부를 굵게 보이게 하던 문제가 사라졌다. 저장된 획은 앞면과 같은 이름→토큰 표로 그려진다.

**다음 노드가 알아야 할 것**

- **n4**: 마카를 든 동안 `text` 카드 위의 포인터는 이 레이어(`svg[data-drawing-layer]`, `pointer-events:auto`)가 받고 `stopPropagation`한다 — 벽 핸들러가 같은 이벤트로 이중으로 그리지 않도록 카드 위 이벤트는 건너뛰어야 한다(어디서 시작했나가 주인). `text`가 아닌 카드(사진·글상자·함·메모판) 위에는 이 레이어가 없다 — D12=A(메모판 위=벽 획)와 사진·글상자 위를 벽이 받을지는 n4가 정한다. 든 동안 이 카드들은 `pointer-events` 그대로라 이벤트가 카드에서 끝난다.
- **n6**: 포스트잇 획은 고르기 상자에 따로 안 잡힌다 — 포스트잇을 옮기면 `overlay`가 그대로 따라간다(`moveCard` 뒤 overlay 불변 테스트가 있다).
- **n7**: 아래 갭 전부.

**갭 — 호출자·n7 확인**

- **브라우저를 열지 않았다.** 기울기·줌 변환은 jsdom에서 `getBoundingClientRect`·`offsetWidth`를 모킹해 확인했다 — 순수 함수 단위 테스트(역변환 왕복)와 컴포넌트 테스트(5도, 줌 2배)는 통과하지만, 실제 브라우저에서 포인터 아래 정확히 획이 그려지는지(회전 + 줌 + 팬 + 카드가 판 안에 있을 때), 그리는 동안 `draft` 선이 포인터와 어긋나지 않는지는 CDP 합성 입력으로 n7에서 본다.
- **`setPointerCapture`가 `pointer-events:none` svg에서 동작하는지.** 스펙상 히트 테스트와 무관해 동작해야 하지만 실기기(태블릿 펜)로 확인하지 못했다. 안 되면 펜 획이 레이어 밖으로 나가는 순간 끊긴다 — 그 경우 stroke 중에만 레이어를 `auto`로 올리는 쪽으로 바꾸기 쉽다(손바닥 오입력 방어와 맞바꿈이라 이번엔 안 했다).
- **앞면 모양.** 앞면은 제목만 가운데 보이고 획은 본문 컬럼 좌표다. 획이 제목 글씨 위에 얹히는 모양과 `05` 시안의 "금요일 아래 밑줄"은 앞면에서 같은 것이 아니다 — 시안과 대조해 본다(n7).
- **굵기.** 옛 펜은 `1.5`로 그렸고 이제 `thin`(토큰, 임시값 2)으로 보인다 — T15의 "원래 굵기"를 토큰 `thin`으로 읽었다(n1 결정과 같은 읽기). 완전히 옛 두께를 원하면 토큰 표 한 곳만 고치면 된다. marker-feel 몫.
- **잘린 부분은 돌아오지 않는다.** 박스 밖은 저장하지 않으므로 포스트잇을 키워도 잘려 나간 끝은 안 돌아온다. 반대로 포스트잇을 줄이면 박스 밖 저장 획은 안 지워지고 보이기만 잘린다.
- **천 반경.** 기본 8(자기 좌표 단위) — 줌 아웃하면 화면에서 작게 보인다. 벽 레이어(n4)와 같은 값·같은 단위로 맞출지는 n4·marker-feel.
- **얼굴 카드.** 링크·할 일 흰 앞면도 같은 레이어를 받는다. 높이는 측정 전까지 없어 그때는 보이는 것만 자른다(저장 자르기는 높이가 정해진 뒤).
- **보드 밖 지속.** 펜 예외는 `isPhoneViewport()`로 휴대폰 크기를 거른다(트레이와 같은 판정). 글 편집(`editingId`) 중에도 거른다.
- 전체 스위트에서 한 번 `BoardPicker.test` 테어다운에서 `DatabaseClosedError` 비동기 에러가 났다(`src/components/workspace` 일부 실행). 이 노드가 건드린 파일이 아니다 — 전체 실행은 클린.

**게이트** (web/, 2026-10-12): `tsc --noEmit` 0 · `vitest run` 205 파일 1865 통과·7 skip · 바꾼 파일 eslint 0 · `check-i18n.mjs` exit 0 · 추적 JSON 유효. 새 테스트 28개: `StickyStrokeLayer.test.tsx` 17(T4 색·굵기·기울기·줌·따라감·자르기, T7, T8 두 건, T15, D5 네 건, 기록·사라짐, Dexie 행 실경로), `stickyGeometry.test.ts` 11, `MemoExpand.test.tsx` SC-6 1.
