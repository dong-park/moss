# n2-wall-name — 첫 벽 이름은 "내 벽"이고 바꿀 수 있다

> 자기완결 브리프. runner는 상위 spec + 이 파일만 본다. 진행 메모는 이 파일에만 쓴다. `**상태**:` 줄은 손으로 고치지 않는다 — graph-run이 `진행`·`끝남`을 쓰고, 멈추면 `node_state.py block`, 사람 확인이 필요하면 `node_state.py review`만 쓴다.

**agent**: runner
**id**: FW-2
**상위**: spec/glass-wall/first-wall/spec.md
**deps**: n1-first-run
**상태**: 아직 안 함
**담당 행**: T11
**확정 결정**: D4=A

## 문제

첫 벽은 이름을 묻지 않고 만들어지는데, 지금 기본 보드는 "홈"으로 불리고 이름을 바꿀 수 없다.

## 목표

시스템 보드에 저장된 이름이 비어 있으면 "내 벽"으로 보인다. 사용자는 다른 보드처럼 이 벽 이름을 바꿀 수 있고, 바꾼 이름이 보드 선택기·경로 표시·휴지통·메모 표에 똑같이 나온다.

## 확정 결정

- **D4=A** — 기본 이름 "내 벽". 첫 실행에 이름을 묻지 않는다.

## 작업

1. `ko.json` `workspace.boardPicker.system` 값을 "내 벽"으로 바꾼다. `systemBadge`·`systemNote`처럼 "시스템"을 드러내는 표시는 유리벽에 맞지 않으면 빼고, 이유를 구현 메모에 적는다.
2. 시스템 보드 이름 표시를 "저장된 이름이 있으면 그 이름, 없으면 `boardPicker.system`"으로 통일한다. 쓰는 곳: `BoardPicker.tsx` 49·152행, `Breadcrumb.tsx` 41행, `DraggableCard.tsx` 1193행, `TrashPanel.tsx` 207행, `memoTable.ts` 336행, `MemoTable.tsx`·`MemoTableToolbar.tsx`. 한 함수로 모은다.
3. 시스템 보드 이름 바꾸기를 연다. `BoardPicker.tsx` `startEdit`의 `isSystem` 가드와 `workspace.ts` `requestRenameBoard`의 `SYSTEM_BOARD_ID` 가드를 푼다. 삭제 가드는 그대로 둔다.
4. 이름 표시 함수와 이름 바꾸기 테스트를 쓴다.

## 완료 기준

- [ ] spec 공통 완료 기준 전부
- [ ] n1의 첫 실행 부트스트랩을 돌린 뒤 보드 선택기 트리거 글자가 "내 벽" — T11
- [ ] 시스템 보드 이름을 "이직 고민"으로 바꾸면 보드 선택기와 경로 표시에 "이직 고민"이 나오고, 새로고침 흉내(스토어 재로드) 뒤에도 같다
- [ ] 시스템 보드는 여전히 지울 수 없다
- [ ] `grep -rn 't("workspace.boardPicker.system")' web/src` 결과가 이름 표시 함수 1곳뿐
- [ ] `cd web && bunx vitest run <새로 쓴 테스트 파일>` 통과
- [ ] 실경로: 테스트가 실제 `BoardPicker` 렌더와 이름 저장 경로를 탄다

## 범위 밖

- 벽 이름을 검색 결과에 띄우기 — korean-search-ime 몫.

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/i18n/messages/ko.json` | 87~95행 `boardPicker` |
| `web/src/components/workspace/BoardPicker.tsx` | 표시 49·152행, 편집 가드 67행 |
| `web/src/components/workspace/Breadcrumb.tsx` | 41행 |
| `web/src/components/workspace/DraggableCard.tsx` | 1193행 |
| `web/src/components/workspace/TrashPanel.tsx` | 207행 |
| `web/src/state/memoTable.ts` | 336행 |
| `web/src/components/workspace/table/MemoTable.tsx` | 104행 |
| `web/src/components/workspace/table/MemoTableToolbar.tsx` | 49행 |
| `web/src/state/workspace.ts` | `requestRenameBoard` 가드 |

## 구현 메모

## 담당 행 메모

- T11(이름 부분)
