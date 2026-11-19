# n5-storage-failure — 저장소를 못 열면 안내와 다시 시도

> 자기완결 브리프. runner는 상위 spec + 이 파일만 본다. 진행 메모는 이 파일에만 쓴다. `**상태**:` 줄은 손으로 고치지 않는다 — graph-run이 `진행`·`끝남`을 쓰고, 멈추면 `node_state.py block`, 사람 확인이 필요하면 `node_state.py review`만 쓴다.

**agent**: runner
**id**: FW-5
**상위**: spec/glass-wall/first-wall/spec.md
**deps**: n1-first-run
**상태**: 아직 안 함
**담당 행**: T9

## 문제

브라우저 저장소를 열 수 없으면 첫 벽 대신 빈 흰 화면이나 끝나지 않는 로딩이 남을 수 있다.

## 목표

첫 실행에서 저장소 초기화가 실패하면 "이 브라우저에 벽을 저장할 수 없어요" 한 줄과 [다시 시도] 버튼이 보인다. 다시 시도가 성공하면 첫 벽이 열린다.

## 작업

1. `useStorage.init()`(`state/storage.ts` 266행)과 `loadFromStorage`가 실패할 때 지금 어디서 삼켜지는지 찾는다. `WorkspaceShell.tsx` 41행 `catch`가 후보다.
2. 실패를 상태로 올리고 `WorkspaceShell`이 안내 한 줄과 [다시 시도] 버튼을 그린다. 다시 시도는 초기화와 불러오기를 다시 부른다.
3. 문구를 `ko.json`에 더한다.
4. 테스트: `init`이 한 번 실패하게 만든 뒤 렌더 → 안내와 버튼 → 버튼 누름 → 두 번째는 성공 → 안내가 사라지고 `/b/<시스템 보드 id>`.

## 완료 기준

- [ ] spec 공통 완료 기준 전부
- [ ] 위 4번 시나리오 테스트 통과 — T9
- [ ] 계속 실패하면 버튼을 눌러도 안내가 남고, 로딩 표시가 무한히 돌지 않는다
- [ ] `cd web && bunx vitest run <새로 쓴 테스트 파일> src/components/workspace/__tests__/WorkspaceShell.routes.test.tsx` 통과
- [ ] 실경로: 실패를 `init` 쪽에서 일으킨다. 실패 상태를 직접 주입했으면 갭으로 기록

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/state/storage.ts` | `init` 266행 |
| `web/src/components/workspace/WorkspaceShell.tsx` | 41행 `catch`, 부트스트랩 흐름. n1이 `RootBoardRedirect`를 먼저 고친다 |
| `web/src/state/workspace.ts` | `loadFromStorage` |
| `web/src/i18n/messages/ko.json` | 안내 문구 |

## 구현 메모
