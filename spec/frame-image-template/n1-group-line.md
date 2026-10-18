# n1-group-line — 메모판을 그룹 선으로 그리기

> 자기완결 브리프. runner는 상위 spec + 이 파일만 본다. 진행 메모는 이 파일에만 쓴다. `**상태**:` 줄은 손으로 고치지 않는다 — 멈추면 `spec-board node block`, 사람 확인이 필요하면 `spec-board node review`.

**agent**: runner
**id**: FT-1
**상위**: spec/frame-image-template/spec.md
**deps**: 없음
**상태**: 아직 안 함
**담당 행**: T1, T2
**사람 확인**: 불필요

## 문제

- 판이 금속 테두리와 흰 면 그림이라 무겁다.
- 이름표가 판 안쪽 칩이라 메모와 자리를 다툰다.

## 목표

판은 결정된 선 모양(실선 추천) 하나와 바깥 왼쪽 위 이름 글씨로 그린다. 고르면 선과 이름이 파랗다. 도크에서 끄는 미리보기도 같다.

## 작업

1. `cards/frame/Content.tsx`에서 `whiteboard.png` border-image를 걷고, 1px 선을 그린다. 선 모양은 결정 행의 답을 따른다.
2. 이름표를 판 바깥 위(`top: -20px` 안팎)로 옮긴다. 판 카드의 `overflow`가 hidden이라 잘린다. `DraggableCard.tsx` 1082행 근처 예외에 frame을 더한다(textbox·photo와 같은 방식).
3. 선택 상태면 선과 이름 글자를 선택 파랑으로. 이름 더블클릭 편집·Enter·Esc·40자는 그대로.
4. 넣기 강조(안쪽 3px 라임 링)와 판 들기 그림자는 그대로 동작하는지 테스트로 지킨다.
5. `DockDragPreview.tsx` 70행의 화이트보드 미리보기도 선 모양으로 바꾼다.

## 완료 기준

- [ ] spec 공통 완료 기준 전부
- [ ] `npx vitest run src/components/workspace` 통과: 판 DOM에 `whiteboard.png`가 없고, 이름표가 판 상자 밖 위에 있고, 선택 시 선 색이 바뀐다
- [ ] 기존 `DraggableCard.frameFeel.test.tsx`·`dragLift` 테스트가 그대로 통과
- [ ] 이름표가 판 위쪽 메모에 가려지지 않는다(이름표 z-index 15 유지)

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/components/workspace/cards/frame/Content.tsx` | 판 그림·이름표 |
| `web/src/components/workspace/DraggableCard.tsx` | overflow 분기(1082행), 넣기 강조 링(1095행) |
| `web/src/components/workspace/DockDragPreview.tsx` | 도크 끌기 미리보기 |

## 구현 메모
- (메인, 2026-10-18) 도크 아이콘(`/icons/dock/whiteboard.png`)은 이번에 바꾸지 않는다. 선 모양이 정해지면 따로 본다.

