# n2-held-tool — 손에 든 도구, 마카 트레이, 패널, 옛 펜 UI 걷어내기

> 자기완결 브리프. runner는 상위 spec + 이 파일만 본다. 진행 메모는 이 파일에만 쓴다 — 상위 spec은 호출자가 고친다. `**상태**:` 줄은 손으로 고치지 않는다 — graph-run이 `진행`·`끝남`을 쓰고, 멈추면 `node_state.py block`, 사람 확인이 필요하면 `node_state.py review`만 쓴다.

**agent**: runner
**id**: WM-2
**상위**: spec/glass-wall/wall-marker/spec.md
**deps**: n1-stroke-store
**상태**: 진행
**담당 행**: T1, T2, T6, T7, T9, T10, T14, T16

## 문제

지금 펜은 숨은 전역 모드라서, 마카를 집고 내려놓는 도구 상태와 트레이가 없다.

## 목표

화면 아래 선반에 마카 4개와 천이 놓이고, 집으면 들리고, 다시 누르면 내려앉는다. 옛 펜 모드·툴바·안내 배지는 사라진다. 마카 되돌리기 기록이 벽 획과 포스트잇 획을 한 줄로 관리한다. 담당 행: T1, T2, T6, T7의 이동 막기, T9, T10, T14의 트레이 숨김, T16.

## 확정된 결정 (그대로 따른다)

- 상태 모델: 내려놓음 · 마카 들림(색 하나) · 천 들림. 동시에 둘을 들 수 없다. 마카를 든 채 글 편집 불가. 휴대폰에서는 들 수 없다.
- D5=A: 태블릿 펜(`pointerType === "pen"`)이 닿으면 아무것도 안 들었어도 마지막에 쓴 마카로 그린다. 손가락은 늘 포스트잇 이동·화면 이동. 이 노드는 그 판정 함수만 만든다. 실제 그리기 연결은 n4·n5.
- D6=A: 들린 마카를 다시 누르면 내려놓는다. 패널은 마카 길게 누르기나 오른쪽 클릭으로 연다. Esc도 내려놓는다.
- D7=A: 마카를 들어도 포스트잇 기울기를 유지한다. `Canvas.tsx`의 펜 모드 기울기 0 처리를 없앤다.
- D9=A: 되돌리기 기록은 보드를 떠날 때까지 남는다. ⌘Z·⇧⌘Z는 마카나 천을 든 동안만 마카 기록을 되돌린다.
- D10=A: 화면 짧은 변이 600px 미만이면 휴대폰. 트레이를 숨긴다.
- D11=A: 독과 트레이를 한 선반으로 합친다. 왼쪽에 마카 4개와 천, 오른쪽에 독 도구. 숨겨 둔 독 펜 버튼 자리를 트레이가 대신한다.
- 패널 문구: 제목 "마카", 색 4개, "굵기" 점 3개, 맨 아래 "지우개 = 천으로 닦기 · 손바닥으로 문지르기". 패널에서 색을 고르면 트레이에서 그 마카가 들린다.

## 작업

1. `workspace.ts`의 `penMode`·`penTool`·`penWidth`와 펜 액션을 `heldTool`(`null | {kind:"marker", color} | {kind:"cloth"}`), `markerWidth`(굵기 이름), `lastMarkerColor`로 바꾼다. 쓰는 곳을 모두 옮긴다.
2. 마카 기록 스토어: 항목은 `{kind:"wall", before, after}` 또는 `{kind:"sticky", noteId, before, after}`. 되돌리기는 벽이면 n1 액션, 포스트잇이면 overlay 쓰기로 돌린다. 공유 보드에서 남의 획은 기록에 넣지 않는다.
3. `MarkerTray` 컴포넌트: 마카 4개와 천. 들린 것은 비스듬히 들려 보인다. 집기·내려놓기·길게 누르기·오른쪽 클릭을 처리한다.
4. `MarkerPanel` 컴포넌트: 위 문구와 선택 표시. i18n 키를 `ko.json` 등에 더한다.
5. `Dock.tsx`에 트레이를 합친다. 휴대폰 기준에서는 트레이를 렌더하지 않는다.
6. `Canvas.tsx` 키 처리: Esc 내려놓기, 들고 있을 때 ⌘Z·⇧⌘Z. 옛 `E`·`[`·`]`·⌘⌫ 펜 키는 지운다.
7. `DraggableCard.tsx`: 무언가 들고 있으면 포스트잇 끌기·편집을 막는다. 옛 펜 affordance는 지운다.
8. `PenToolbar.tsx`, `PenModeHud.tsx`, 그 테스트, i18n `workspace.pen.*`·`workspace.tool.pen`을 지운다. `DraggableCard.penAffordance.test.tsx`는 "들고 있으면 안 끌린다" 테스트로 바꾼다.

## 완료 기준

- [ ] spec 공통 완료 기준 전부
- [ ] `cd web && bunx vitest run src/components/workspace/__tests__` 통과. 새 테스트: 트레이 렌더(마카 4개+천), 집기→들림, 다시 누르기→내려놓음, Esc→내려놓음, 패널에서 빨강→빨강 들림, 휴대폰 크기에서 트레이 없음, 들고 있으면 카드 안 끌림
- [ ] 기록 스토어 테스트: 벽 추가 → 포스트잇 overlay → 벽 추가 후 ⌘Z 세 번이면 역순으로 사라지고 ⇧⌘Z 한 번이면 첫 벽 획이 돌아온다 (T10)
- [ ] `grep -rn "PenToolbar\|PenModeHud\|penMode" web/src` 결과 0줄 (T16)
- [ ] 실경로: 트레이 클릭이 실제 스토어 `heldTool`을 바꾸는 렌더 테스트

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/state/workspace.ts` | 723~725행 펜 상태, 3240~3330행 펜 액션 |
| `web/src/components/workspace/Canvas.tsx` | 154·169행 기울기 0, 388~414행 펜 키 |
| `web/src/components/workspace/Dock.tsx` | 529~545행 숨긴 펜 버튼 |
| `web/src/components/workspace/DraggableCard.tsx` | 펜 가드·affordance |
| `web/src/components/workspace/PenToolbar.tsx` | 지운다 |
| `web/src/components/workspace/PenModeHud.tsx` | 지운다 |
| `web/src/components/workspace/MemoSearchLayer.tsx` | penMode 참조 |
| `web/src/components/workspace/memoVariety.ts` | penMode 참조 |
| `web/src/i18n/messages/ko.json` | 문구 |
| `web/src/state/marker/tokens.ts` | n1 산출물 |

## 구현 메모

**만든 것** (2026-10-12, 브랜치 feat/glass-wall-marker)

- 상태: `state/marker/heldTool.ts`(타입·판정 함수) + `workspace.ts`의 `heldTool: null | {kind:"marker",color} | {kind:"cloth"}`, `markerWidth`(이름), `lastMarkerColor`. 액션 `holdMarker(color)`·`holdCloth()`·`releaseTool()`·`setMarkerWidth(name)`. `penMode`·`penTool`·`penWidth`·`penUndoStack`·`lastPenCardId`·`togglePenMode`·`penClear`와 `ToolId`의 `"pen"`은 없다.
  - 상호배타: 집으면 `editingId`가 닫힌다. `setEditing(id)`(null 아님)는 든 것을 내려놓는다 — 마카를 든 채 글 편집 상태를 만들지 않는다. `armTextPlacement`도 내려놓는다. 휴대폰 크기(`isPhoneViewport()`: 짧은 변 < 600)에서는 `holdMarker`·`holdCloth`가 아무 일도 안 한다.
  - `drawingToolFor(heldTool, pointerType, lastMarkerColor)`가 D5=A 판정이다(든 것이 있으면 입력 장치 불문 그것, 안 들었으면 `pen`만 마지막 색 마카, 손가락·마우스는 null). **아직 아무 데도 안 이어졌다** — n4·n5가 포인터 다운에서 쓴다.
- 기록(D9=A): `markerUndoStack`·`markerRedoStack`, 항목 `{kind:"wall", before: WallStroke[], after: WallStroke[]}` | `{kind:"sticky", noteId, before, after}`(overlay 문자열). 액션 `recordMarkerEdit(entry)`·`markerUndo()`·`markerRedo()`. 한도 200. 보드를 떠나면(`setCurrentBoard`의 상태 교체) 비운다.
  - 벽 항목의 `before`=이 동작이 지운 획, `after`=더한 획. 새 획은 `before: []`, 지우개는 `before:[지운 획]`·`after:[남은 조각]`. 되돌리기는 `replaceWallStrokes(after ids → before)`, 다시하기는 반대. 획은 원래 id·색·굵기로 돌아온다.
  - 사라진 포스트잇을 가리키는 항목은 건너뛴다. 남이 지운 벽 획의 항목은 조용히 넘어간다.
- 포스트잇 획 기록은 `setOverlay(id, overlay)`가 **자동으로** 쌓는다(같은 값이면 안 쌓는다). 벽 획은 호출부가 직접 쌓는다.
- UI: `MarkerTray`(독의 왼쪽, `Dock.tsx`가 맨 앞에 렌더, 뒤에 구분선 하나) · `MarkerPanel`(`MarkerTray`가 길게 누르기 450ms·오른쪽 클릭으로 연다; 열 때 그 마카를 집는다) · `markerCursor.ts`(벽 포인터 SVG — 마카는 색, 천은 모양).
  - 휴대폰 판정은 마운트 뒤 `window.inner*`로 한다(첫 렌더는 null → 아무것도 안 그림). `resize`를 따라가고, 휴대폰이 되면 든 것을 내려놓는다.
- 키(`Canvas.tsx`): Esc 내려놓기, ⌘Z·⇧⌘Z(든 동안만, 글 입력칸 안이면 양보), 든 동안 다른 캔버스 키 차단. `E`·`[`·`]`·⌘⌫ 펜 키 삭제. `useShortcuts`의 `T`는 든 동안 무시.
- 카드: `DraggableCard`는 든 동안 mousedown·dblclick·hover 연결점·펼치기 버튼·컨텍스트 메뉴를 막고, 자기 커서를 덮어쓰지 않는다(벽 포인터 상속). `memoBaseTransform`·`memoLiftedTransform`에서 `penMode` 인자를 뺐다(D7=A) — 기울기에 든 도구가 끼지 않는다. `ConnectionHandles`는 든 동안 숨는다.
- 지운 것: `PenToolbar`·`PenModeHud`와 테스트, `DraggableCard.penAffordance.test`, `state/__tests__/penMode.test.ts`(오버레이 디코드 부분은 `overlayDecode.test.ts`로, 상태 부분은 `heldTool.test.ts`로 옮김), i18n `workspace.pen.*`·`workspace.tool.pen`. `workspace.memo.editor.penModeOn/Off`는 `markerHeld`/`markerReleased`("마카나 천을 들었어요"/"내려놓았어요")로 바꿨다.
- 새 i18n: `workspace.marker.{tray,cloth,item.*,color.*,width.*,panel.{title,color,width,erase}}`.

**다음 노드가 알아야 할 것**

- **n4**: 벽에 획을 만든 뒤 `addWallStroke`(또는 `replaceWallStrokes`)가 돌려준 획으로 `recordMarkerEdit`을 **직접 불러야** 한다 — 안 부르면 ⌘Z가 못 돌린다. 캔버스는 든 동안에도 빈 벽 끌기를 여전히 고르기 상자(`onMouseDown` marquee)·팬으로 처리한다 — 든 도구가 있으면 그리기로 가르는 일은 n4다. `Canvas`의 두 번 누르기는 든 동안 포스트잇을 안 만들 뿐, "점 두 개가 찍힌다"는 아직 없다.
- **n5**: 포스트잇 획은 `setOverlay`로 쓰면 기록이 자동으로 쌓인다. 한 획마다 `setOverlay` 한 번이 한 기록이다. `MemoExpandDialog`(펼친 창의 모달 로컬 그리기)도 같은 `setOverlay`라 기록에 쌓이지만, ⌘Z는 든 동안만 돌린다 — 모달 안 그리기는 들지 않으므로 키로 못 돌린다(옛 동작과 같다).
- **n6**: `moveWallStrokes`는 기록에 안 쌓인다. 기록 항목 형식에 "옮기기"가 없다 — spec 「확인 안 된 것」의 "벽 획 옮기기를 ⌘Z로 되돌릴지"는 정해지지 않은 채다. 넣으려면 항목에 `{kind:"move", ids, dx, dy}`를 더하면 된다.
- `heldTool`은 보드를 바꿔도 남는다(손에 든 것이다). 기록만 비운다.
- 힌트(`SystemBoardEmpty`)는 독 위 `bottom-24` 그대로다 — 트레이가 독 안에 있어서 이미 트레이 위다. 모양은 n7에서 본다.

**갭 — 호출자 확인**

- **브라우저를 열지 않았다.** 트레이 모양(눕혀 놓인 마카, 들리면 비스듬히 떠오름), 벽 포인터 SVG, 패널 위치(`bottom-full`, 독 위로 뜬다), 독 확대(`magnify`)와 트레이가 한 선반에서 어울리는지, 독 폭 실측(`dockWidth`)이 트레이를 더한 폭으로 맞는지는 jsdom으로 못 본다 — n7에서 본다. T1·T2·T9의 "보임"은 DOM·속성(`data-lifted`, `aria-pressed`, 패널 문구)까지만 확인했다.
- 길게 누르기 450ms는 임시값이다. 터치 길게 누르기가 브라우저 컨텍스트 메뉴·선택과 부딪히는지는 실기기에서 본다(오른쪽 클릭은 `onContextMenu`를 막아 열어 둔다).
- 마카 키보드 접근: 버튼은 포커스·Enter·Space로 집고 내려놓는다. 패널은 `contextmenu` 키(Shift+F10)로만 열린다 — 전용 단축키는 없다.
- `ConnectionHandles`·`DraggableCard` hover 연결점은 천을 들어도 숨긴다(옛 펜 모드와 같은 규칙). 천이 연결선을 지울지는 n4·n5의 `eraseArea` 몫이다.
- 전체 스위트에서 한 번씩 흔들린 것: 1차 실행 `dexieMigration` P1-3b(단독 3회 통과), 2차 실행 `mossBridge` 테어다운 `DatabaseClosedError` 비동기 에러 4건(3차 실행 클린). 이 노드가 건드린 파일이 아니다.

**게이트** (web/, 2026-10-12): `tsc --noEmit` 0 · `vitest run` 202 파일 1815 통과·7 skip · 바꾼 파일 eslint 0 · `check-i18n.mjs` exit 0(미사용 키 경고는 기존) · `grep -rn "PenToolbar\|PenModeHud\|penMode" web/src` 0줄. 새 테스트 54개: `state/__tests__/heldTool.test.ts`(전이·휴대폰·D5 판정·기록·보드 이탈), `MarkerTray.test.tsx`, `DraggableCard.heldTool.test.tsx`, `Canvas.heldToolKeys.test.tsx`, `Dock.test.tsx` 2건, `memoVariety`·`DraggableCard.memoVariety` D7 갱신.
