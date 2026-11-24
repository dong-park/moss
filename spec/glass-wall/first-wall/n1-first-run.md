# n1-first-run — 첫 실행은 기본 보드 하나, 메모 0장, 고르기 화면 없음

> 자기완결 브리프. `spec/glass-wall/first-wall/` 밑에 산다. runner는 상위 spec + 이 파일만 본다. 진행 메모는 이 파일에만 쓴다 — 상위 spec은 호출자가 고친다. `**상태**:` 줄은 손으로 고치지 않는다 — graph-run이 `진행`·`끝남`을 쓰고, 멈추면 `node_state.py block`, 사람 확인이 필요하면 `node_state.py review`만 쓴다.

**agent**: runner
**id**: FW-1
**상위**: spec/glass-wall/first-wall/spec.md
**deps**: 없음
**상태**: 진행
**담당 행**: T1, T5, T7, T8, T10, T11
**확정 결정**: D1=A, D2=A, D3=A

## 문제

처음 온 사람이 첫 생각을 쓰기 전에 "첫 보드를 골라 주세요" 화면을 넘어야 하고, 첫 실행마다 남이 쓴 예제 메모 3장이 심긴다.

## 목표

처음 온 사람은 기본 시스템 보드 하나를 첫 벽으로 받고, 그 벽에는 메모가 0장이다. 첫 보드 고르기 화면과 예제 보드 경로는 코드에서 사라진다. 옛 사용자와 보드를 고르다 만 사용자는 고르기 화면 없이 마지막 벽이 열리고, 이미 있던 메모는 그대로다.

## 확정 결정 (그대로 따른다)

- **D1=A** — `FirstBoardChooser` 컴포넌트, 그 테스트, `onboarding.firstBoard.*` i18n 키, `needsFirstBoard`를 지운다. 숨겨 두지 않는다.
- **D2=A** — 첫 실행 시드와 `createExampleBoard`를 지운다. 이미 사용자 저장소에 심긴 예제 메모(`seed-todo`·`seed-preview`·`seed-empty` id)는 지우지 않는다. 템플릿 경로 `createBoardFromTemplate`은 남긴다.
- **D3=A** — 첫 벽은 기존 시스템 보드다. 새 보드를 만들지 않는다.

## 작업

1. `state/workspace.ts` `loadFromStorage`의 첫 실행 분기(2045~2062행 근처)에서 시드 심기를 뺀다. 빈 시스템 보드를 그대로 연다. `installPromptShown` 설정은 다른 곳이 읽는지 확인하고, 이 분기 전용이면 마킹도 뺀다. 스키마 필드는 지우지 않는다 — 옛 번들 가져오기가 읽는다.
2. `SEED_CARDS`·`SEED_CARD_IDS`·`needsFirstBoard`·`createExampleBoard`(인터페이스 510~515행 선언 포함)를 지운다. `__internal` 내보내기에서 `SEED_CARDS`를 뺀다.
3. `WorkspaceShell.tsx` `RootBoardRedirect`에서 첫 보드 고르기 분기를 지운다. 사용자 보드가 0개여도 시스템 보드로 replace한다. `FirstBoardChooser.tsx`와 그 테스트를 지운다.
4. `ko.json`의 `onboarding.firstBoard` 블록을 지운다. 다른 언어 파일이 있으면 같은 키를 지운다.
5. 테스트를 고친다. `workspace.test.ts` "첫 실행: 시드를 영속…"은 "첫 실행: 보드 1개·메모 0장"으로 바꾼다. `memoHeight.test.ts`의 `SEED_CARDS` 의존은 테스트 안 고정 카드로 바꾼다. `WorkspaceShell.routes.test.tsx`에 아래 완료 기준 시나리오를 더한다.
6. 두 탭 동시 부트스트랩에서 벽이 1개인지 테스트한다. `loadFromStorage`를 두 번 동시에 부르는 것으로 흉내 낸다.

## 완료 기준

- [ ] spec 공통 완료 기준 전부
- [ ] 새 fake-indexeddb 저장소로 `loadFromStorage`를 끝까지 돌리면 boards 1개(`isSystem: true`)·cards 0장. 두 번 동시 호출해도 boards 1개 — T11
- [ ] 사용자 보드 0개 + 시스템 보드에 시드 id 메모 3장인 저장소로 `/`를 렌더하면 role=dialog 0개, 주소가 `/b/<시스템 보드 id>`로 바뀌고, 메모 3장이 그대로다 — T8
- [ ] 시스템 보드에 사용자 메모가 있는 저장소로 `/`를 렌더하면 마지막 보드로 replace되고 메모 수가 늘지 않는다 — T7
- [ ] 빈 저장소로 `/`를 렌더하면 role=dialog 0개 — T1·T10
- [ ] `grep -rn -e "onboarding.firstBoard" -e "FirstBoardChooser" -e "needsFirstBoard" -e "createExampleBoard" -e "SEED_CARDS" web/src` 결과 0줄 — T10
- [ ] `cd web && bunx vitest run src/state/__tests__/workspace.test.ts src/state/__tests__/memoHeight.test.ts src/components/workspace/__tests__/WorkspaceShell.routes.test.tsx` 통과
- [ ] 실경로: 테스트가 `loadFromStorage`와 `RootBoardRedirect` 실제 코드를 탄다. 상태를 직접 주입해 우회하면 갭으로 기록

## 범위 밖

- 로그인 게이트 철거 — 선행: local-promise의 로그인 게이트 노드. 이 노드 테스트는 로그인된 상태 또는 게이트를 우회한 상태로 돌려도 된다. 그 경우 구현 메모에 적는다.
- 벽 이름 "내 벽" — n2. 빈 벽 힌트 — n3.

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/state/workspace.ts` | 시드 분기 2045행 근처, `SEED_CARDS` 1108행, `needsFirstBoard` 1149행, `createExampleBoard` 2191행 |
| `web/src/components/workspace/WorkspaceShell.tsx` | `RootBoardRedirect` 110~133행 |
| `web/src/components/workspace/FirstBoardChooser.tsx` | 지울 파일 |
| `web/src/components/workspace/__tests__/FirstBoardChooser.test.tsx` | 지울 파일 |
| `web/src/components/workspace/__tests__/WorkspaceShell.routes.test.tsx` | 라우팅 시나리오 추가 |
| `web/src/state/__tests__/workspace.test.ts` | 164행 시드 흐름 테스트 교체 |
| `web/src/state/__tests__/memoHeight.test.ts` | `SEED_CARDS` 의존 제거 |
| `web/src/state/__tests__/ac-home.test.ts` | `installPromptShown`을 직접 켜는 테스트 — 깨지면 맞춘다 |
| `web/src/i18n/messages/ko.json` | 568행 `onboarding.firstBoard` |

## 구현 메모
- 커밋 81601fc. 첫 실행 시드 분기·`SEED_CARDS`·`SEED_CARD_IDS`·`needsFirstBoard`·`createExampleBoard`(선언 포함)·`FirstBoardChooser`(+테스트)·`ko.json` `onboarding` 블록(고르기 키 4개뿐이라 블록째)을 지웠다. 다른 언어 파일은 없다.
- `RootBoardRedirect`는 `boards[0]`(lastOpenedAt 내림차순)으로 replace만 한다. 사용자 보드 0개여도 시스템 보드로 간다. 더 이상 `cards`를 구독하지 않는다.
- `installPromptShown`은 이 분기 전용이었다(읽는 UI 없음). 마킹만 뺐고 스키마 필드·번들 가져오기·내보내기는 그대로다.
- 첫 벽의 보드 행은 `loadFromStorage`가 아니라 `StorageBootstrap`의 `migrateSystemBoard`(Web Lock 안)가 만든다. 그래서 T11 두 탭 테스트는 `runBootstrap`을 동시에 두 번 부르는 것으로 흉내 냈다 — 실제 부팅 경로다. 이어서 `loadFromStorage`도 동시 두 번 돌려 벽·메모 수가 안 늘어나는지 본다.
- 테스트(실경로): `workspace.test.ts` 첫 실행·두 탭, `WorkspaceShell.routes.test.tsx`의 T1/T10(빈 저장소)·T8(옛 시드 3장)·T7(시스템 메모 / 마지막 사용자 보드). `runBootstrap`+실제 `RootBoardRedirect`를 타고 상태 직접 주입은 없다. 옛 코드로 되돌리면 첫 실행 3건이 실패하는 것을 확인했다.
- 갭: 로그인 게이트는 local-promise가 이미 걷어 이 노드 테스트는 `WorkspaceGate`를 거치지 않고 `RootBoardRedirect`만 렌더한다(게이트 통합은 local-promise 테스트 몫). 브라우저 실화면 확인은 n6.
- 확인한 것: 전체 `vitest run` 192파일·1711개 통과(1회차에 `mossBridge.test.ts`의 DatabaseClosedError 미처리 거부 2건으로 종료 코드 1 — 단독 8회·전체 재실행에서 재현 안 됨, 이 노드 코드와 접점 없음. 기준선 HEAD 6회는 전부 통과라 플래키로만 판정 못 했다).
- 넘겨받은 사실 (local-promise n9): 새 기기에서 `/`를 열면 공유 벽 대신 고르기가 먼저 떴던 문제는 고르기 화면이 사라져 해소됐다. 남은 둘은 이 노드 범위 밖이라 손대지 않았다 — 공유 벽 입구 카드가 기본 화면 밖(y≈-24)이라는 점, 벽을 둘 이상 만드는 화면(BoardPicker)이 마운트돼 있지 않다는 점.

## 담당 행 메모

- T1(라우팅 부분) · T5(고르기 화면 없음 부분) · T7 · T8 · T10 · T11(벽 개수·메모 개수 부분)
