# n2-held-tool — 손에 든 도구, 마카 트레이, 패널, 옛 펜 UI 걷어내기

> 자기완결 브리프. runner는 상위 spec + 이 파일만 본다. 진행 메모는 이 파일에만 쓴다 — 상위 spec은 호출자가 고친다. `**상태**:` 줄은 손으로 고치지 않는다 — graph-run이 `진행`·`끝남`을 쓰고, 멈추면 `node_state.py block`, 사람 확인이 필요하면 `node_state.py review`만 쓴다.

**agent**: runner
**id**: WM-2
**상위**: spec/glass-wall/wall-marker/spec.md
**deps**: n1-stroke-store
**상태**: 아직 안 함
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
