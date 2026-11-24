# n5-storage-failure — 저장소를 못 열면 안내와 다시 시도

> 자기완결 브리프. runner는 상위 spec + 이 파일만 본다. 진행·상태는 이 파일에만 쓴다.

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

- 어디서 삼켜졌나: `StorageBootstrap`의 `void (async () => { await init(); await runBootstrap(); … })()`가 거절을 버렸다. `bootstrapComplete`가 오르지 않아 `RootBoardRedirect`가 null을 그린 채 흰 화면이 남았다. 브리프의 `WorkspaceShell.tsx` 41행 `catch`는 지금 코드에 없다.
- 고친 것: `StorageBootstrap.tsx`에 `bootWorkspace()`(init → runBootstrap, 진행 중이면 같은 약속을 돌려줌). 실패하면 `bootstrapFailed: true`, `bootstrapComplete: false`, `migrationPending: false`(로딩 표시가 남지 않게). 성공하면 `bootstrapFailed: false`.
- 화면: `StorageFailureNotice.tsx`(role=alert, 한 줄 + [다시 시도]). `WorkspaceShell`이 `bootstrapFailed`면 `/`와 `/b/<id>` 모두 이 안내로 갈음한다. 버튼은 같은 `bootWorkspace()`를 부르고 진행 중에는 눌리지 않는다.
- 문구: `ko.json`의 `storageFailure.message`·`storageFailure.retry`.
- 테스트(`StorageFailure.test.tsx`): 실패를 `getDB().open()`에서 일으킨다. 실제 `StorageBootstrap` + `WorkspaceShell`을 렌더해 ① 한 번 실패 → 안내·버튼 → 누르면 성공 → 안내가 사라지고 `/b/<시스템 보드 id>` ② 계속 실패 → 눌러도 안내가 남고 버튼이 다시 눌림, 로딩 표시 없음 ③ 불러오기가 `migrationPending`을 켠 뒤 실패해도 로딩이 남지 않음. 옛 `StorageBootstrap`로 되돌리면 3건 모두 실패하는 것을 확인했다.
- 갭: 저장소가 거절이 아니라 영영 응답하지 않는(open이 안 끝나는) 경우는 다루지 않는다 — 시간 제한을 걸지 않았다. 브라우저 실패(시크릿 모드·저장소 차단)의 실브라우저 확인은 n6 몫이다.
