# n2-wall-name — 첫 벽 이름은 "내 벽"이고 바꿀 수 있다

> 자기완결 브리프. runner는 상위 spec + 이 파일만 본다. 진행·상태는 이 파일에만 쓴다.

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

- **표시 함수 한 곳**: `web/src/state/systemBoardName.ts` `systemBoardName(boards, t?)`. 저장된 시스템 보드 행의 이름(앞뒤 공백 제외)이 있으면 그 이름, 비면 `workspace.boardPicker.system` = "내 벽". `t("workspace.boardPicker.system")` 리터럴은 이제 이 함수 안에만 있다. 쓰는 곳 9: `BoardPicker`(트리거·메뉴), `Breadcrumb`, `DraggableCard`(카드 우클릭 경로), `TrashPanel`, `memoTable.deriveRows` 기본값, `MemoTable`, `MemoTableToolbar`, `memoSearchAllWalls.boardNameOf`(검색 결과 줄 — 브리프 목록 밖이지만 같은 이름이라 함께 묶었다).
- **"시스템" 표시를 뺐다**: `systemBadge`("시스템")·`systemNote`("(시스템 프로젝트)") 키와 표시를 지웠다. 이름을 "이직 고민"으로 바꿔도 옆에 "(시스템 프로젝트)"가 붙으면 틀린 말이고, 첫 벽은 사용자에게 그냥 "내 벽"이어야 해서다.
- **이름 바꾸기 열기**: `BoardPicker.startEdit`의 `isSystem` 가드, `workspace.requestRenameBoard`·`renameBoard`의 `SYSTEM_BOARD_ID` 가드를 풀었다. `renameBoard`는 시스템 보드면 `isSystem: true`를 같이 저장한다 — 행이 없어 새로 만들어져도 삭제 가드(`removeBoard`, 그대로 유지)가 이 플래그에 기대기 때문이다. 이름을 비우거나 공백만 저장하면 "내 벽"으로 돌아온다.
- **보드 선택기 중복 방지**: 시스템 보드는 `boards`에 UUID 행으로 이미 들어 있어서, 이름 바꾸기를 열면 메뉴에 같은 벽이 두 줄로 보인다. 사용자 보드 목록에서 시스템 행을 뺐다.
- **입력칸 초기값**: 저장된 이름이 비어 있으면 이름 바꾸기 입력칸도 빈 채로 열린다("내 벽"을 미리 채우지 않음). 비운 채 Enter하면 저장된 이름은 그대로 ""라 변화가 없다.
- **휴지통**: 시스템 벽 메모의 벽 이름은 버릴 때 기록한 이름이 아니라 지금 이름이다.
- **실경로 갭 — 중요**: `Header`·`BoardPicker`는 지금 `WorkspaceShell`에 마운트돼 있지 않다(n1 결과의 "BoardPicker가 마운트돼 있지 않다"와 같은 사실). 테스트는 `runBootstrap`(실제 첫 실행 부팅) 뒤 실제 `BoardPicker`를 렌더해 이름 저장 경로를 타지만, **실브라우저에서는 첫 벽 이름을 보거나 바꿀 진입점이 아직 없다.** `Breadcrumb`은 서브 벽 안에서만 그려져 시스템 벽 위에서는 이름이 안 보인다. n6은 이 항목을 눈 확인 대상에서 "진입점 없음"으로 다뤄야 한다.
- **범위 밖이라 손대지 않음**: `jsonCanvasExport`의 `"system"`(내보내기 파일 이름), 외부 `boards.rename`(mossBridge)은 이제 시스템 보드에도 통한다 — 가드가 없던 쪽을 `renameBoard`가 막고 있었을 뿐이라 별도 수정 없음.
- **검증**: 새·바꾼 테스트 5개 파일 96/96. 전체 스위트 194파일·1725 통과(스킵 8). 1회차에 `unhandled rejection` 1건(n1이 적은 `mossBridge` DatabaseClosedError 계열로 보임, 이 노드 코드와 접점 못 찾음), 2회차는 없음. `tsc` 0, 바꾼 파일 eslint 0, `check-i18n` exit 0.
- 탐지력: `systemBoardName`이 저장된 이름을 무시하게 바꾸면 새 테스트 6건이 실패하는 것을 확인했다.

## 담당 행 메모

- T11(이름 부분) — 첫 실행 부팅 뒤 트리거 글자 "내 벽"(BoardPicker.test), 이름 변경·재로드 뒤에도 유지(BoardPicker.test·workspace.test)까지 테스트로 닫았다. 실브라우저 판정은 위 "실경로 갭" 때문에 n6에서 진입점부터 정해야 한다.
