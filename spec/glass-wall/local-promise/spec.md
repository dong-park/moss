# 이 기기에만 — 공유하지 않은 벽은 서버를 거치지 않는다

| 항목 | 값 |
|---|---|
| 문제 | 사적인 생각을 쓰는 벽인데 로그인이 기본이고 공유 보드는 서버에 평문으로 저장돼, 내 생각이 어디 있는지 믿을 수 없다 |
| 상위 | ../README.md |
| 상위문제 | 손으로 쓰고 붙이며 공간에 생각을 펼치고 싶은 사람에게 맞는 개인용 벽이 없다 — 화이트보드 도구는 팀용이라 과하고, 메모앱은 시각적이지 않고, 종이와 포스트잇은 흩어져 다시 못 찾는다 |
| 상태 | 아직 안 함 |
| 시작 | 2026-10-11 |
| ID 머리 | LP |
| 우선순위 | P0 |
| 시안 | mockups/01-main.png 오른쪽 위 배지, mockups/06-share.png |

## 문제 — 로그인부터 묻는 벽에는 사적인 생각을 쓰기 어렵다

지금 moss를 열면 로그인 화면이 먼저 나온다. 로그인한 계정이 있으면 사람들은 내 생각이 서버 어딘가에 있다고 여긴다. 실제로 공유한 보드는 서버에 평문으로 저장된다. 리서치의 프라이버시층은 "내 생각이 내 기기에 있다"는 약속을 돈을 내기 전 진입 조건으로 본다.

## 목표 — 로그인 없이 혼자 쓰고, 공유하는 순간에만 알리고 로그인한다

처음 온 사람은 로그인 없이 바로 벽에 쓴다. 공유하지 않은 벽은 서버로 아무것도 보내지 않고, 오른쪽 위 배지가 늘 "🔒 이 기기에만" 또는 "☁ 공유 중"을 보여 준다. 공유를 누르면 "이 벽은 moss 서버에 올라갑니다"를 먼저 알리고, 그 순간에만 Google 로그인을 받아 쓰던 벽을 그대로 올린다.

## 비목표 — 협업 기능 자체와 다른 티켓의 경계까지만

- **협업 기능 자체.** 실시간 공동 편집, 초대 링크, 멤버 관리, 공유 해제는 FEAT-collab-auth 그대로 둔다. 이 스펙은 그 앞에 고지를 붙이고 로그인 시점만 옮긴다.
- **공유 벽 암호화.** 공유 벽은 지금처럼 서버에 평문으로 둔다. 고지가 그 사실을 숨기지 않는 것까지만 한다.
- **AI 경로 지우기.** remove-ai 몫이다. 이 스펙은 그 뒤 "밖으로 나가는 길은 공유뿐"인지 확인만 한다.
- **첫 진입 화면 모양.** 빈 유리벽, 마카 트레이, 힌트 한 줄은 first-wall 몫이다. 이 스펙은 로그인 화면을 걷어 내는 것까지만 한다.
- **혼자 쓰는 벽의 기기 간 옮기기와 백업.** 내 파일로 꺼내기는 local-ownership 몫이다.
- **휴대폰 공유 시트로 붙이기.** phone-to-wall 몫이다.

## 성공 기준 — 행 파일이 곧 성공 기준이다

행 파일이 곧 성공 기준이다.

## 경계 조건 — 실패하면 벽은 늘 이 기기에 그대로 남는다

- **로그인 실패.** Google 창을 닫거나 실패하면 아무것도 올라가지 않는다. 배지는 그대로다.
- **올리다 끊김.** 서버 저장을 확인하기 전에는 "공유 중"을 띄우지 않는다. 다시 시도할 수 있다.
- **두 번 누르기.** 공유 버튼을 빠르게 두 번 눌러도 서버에 벽이 하나만 생긴다. 지금의 진행 중 가드를 그대로 쓴다.
- **여러 탭.** 한 탭에서 공유하면 같은 벽을 연 다른 탭 배지도 바뀐다.
- **다른 계정.** 로그인 없이 쓰던 기기에 나중에 다른 계정으로 로그인해도 혼자 쓰는 벽은 어느 계정에도 올라가지 않는다. 지금의 "다른 계정의 보드가 이 기기에 있어요" 안내는 그대로 둔다.
- **오프라인.** 혼자 쓰는 벽은 네트워크와 상관없이 쓴다. 오프라인에서는 공유 버튼을 누르면 "연결되면 다시 시도해 주세요"를 보인다.
- **외부 요청.** 폰트나 정적 파일을 외부에서 받는다면 그 요청에 벽 글자가 실리면 안 된다.

## 상태 모델 — 벽 하나는 네 상태 중 하나다

| 상태 | 배지 | 서버 행 | 동기화 연결 |
|---|---|---|---|
| 이 기기에만 | 🔒 이 기기에만 | 없음 | 없음 |
| 올리는 중 | 올리는 중 | 만드는 중 | 업로드용만 |
| 공유 중 | ☁ 공유 중 | 있음 | 있음 |
| 공유 중이지만 로그아웃 | ☁ 공유 중 · 로그인하면 맞춰요 | 있음 | 없음 |

합법 전이는 다섯 개다. 이 기기에만 → 올리는 중은 시트에서 공유를 누를 때다. 올리는 중 → 공유 중은 서버 저장을 확인했을 때다. 올리는 중 → 이 기기에만은 로그인이나 업로드가 실패했을 때다. 공유 중 → 이 기기에만은 공유를 해제했을 때다. 공유 중과 로그아웃 상태는 로그인·로그아웃으로 오간다.

불가능한 조합은 셋이다. 배지가 "🔒 이 기기에만"인데 동기화 연결이 열려 있으면 안 된다. 배지가 "☁ 공유 중"인데 서버 행이 없으면 안 된다. 로그인한 적 없이 공유 중인 벽이 생기면 안 된다.

## 기술 결정 — 로그인 게이트만 걷고 공유 흐름은 재사용한다

- **게이트 제거.** 워크스페이스를 로그인 여부와 상관없이 연다. 세션 복원은 뒤에서 조용히 한다. 혼자 쓰는 경로는 원래 로그인이 필요 없게 만들어져 있었다.
- **업로드 재사용.** 쓰던 벽을 올리는 일은 이미 있는 일회용 동기화 업로드를 쓴다. 새 이전 코드를 만들지 않는다.
- **고지는 시트로.** 지금의 작은 공유 팝오버 앞에 시안 06의 가운데 시트를 둔다. 공유가 시작된 뒤의 링크 복사·멤버 화면은 팝오버 그대로다.

## 다른 티켓에 걸린 것 — 폰트는 glass-surface, 첫 벽은 first-wall, AI는 remove-ai

- 손글씨 폰트는 Google Fonts에서 받지 않고 moss가 직접 싣는다. glass-surface 몫이다.
- 첫 벽은 기존 시스템 보드다. first-wall D3에서 정했고, 이 스펙 D2와 짝이다.
- 첫 진입 화면은 first-wall, AI 경로는 remove-ai, 휴대폰 붙이기는 phone-to-wall 몫이다.

## 읽는 순서

| 알고 싶은 것 | 볼 곳 |
|---|---|
| 왜 하나 | `## 문제` |
| 무엇이 끝나면 되나 | `## 목표`, `rows/` |
| 어디까지 왔나 | 아래 노드 표의 상태 열 |
| 한 노드의 일 | 노드 브리프 |

## 공통 완료 기준 — 타입·테스트·린트·문구 검사가 모두 녹색이다

1. `cd web && bunx tsc --noEmit` 오류 0.
2. `cd web && bun run test` 실패 0. 단 메모리에 기록된 상존 실패 `Canvas.virtualization.test.tsx` 1건과 `useShortcuts.test.tsx` 테어다운 레이스는 단독 재실행으로 구분해 결산에 적는다.
3. `cd web && bun run lint` 새 오류 0. 기존 `ExportModal.tsx`·`exportStore.ts` 오류는 제외한다.
4. `cd web && bun scripts/check-i18n.mjs` exit 0.
5. 새 로직마다 테스트가 최소 1개 있다. 커밋은 Conventional Commits.
6. 실경로 검증: stub이나 직접 주입으로만 녹색이면 그 갭을 노드 구현 메모에 적는다.
7. ko.json은 여러 노드가 고친다. 자기 키만 더하거나 지우고 다른 키는 건드리지 않는다.

## DAG

```
n2 ──► n3 ──► n4 ──► n5 ──► n9
 └───────────► n4            ▲
n1 ─────────────────────────►┤
n6 ─────────────────────────►┘
n6 ──► n7
n8
```

진입점은 n1·n2·n6·n8 넷이다. 가장 긴 길은 n2 → n3 → n4 → n5 → n9로 5단계다. 노드는 모두 9개다.

edge 사유:

- n2 → n3: n3 배지가 n2의 벽 공유 상태 선택자 네 값을 읽는다.
- n2 → n4: n4 시트가 n2의 공유 시작과 실패 이유 두 가지를 부른다.
- n3 → n4: n4 시트가 n3의 "공유 ↗" 버튼 누름을 받아 열린다.
- n4 → n5: n5가 n4의 시트에 첫 벽 덧붙임 한 줄을 넣고 그 주 버튼 흐름을 쓴다.
- n6 → n7: n7 허용 목록이 n6이 막은 링크 미리보기 경로를 "누를 때만"으로 적는다.
- n1 → n9: n9의 T1·T10·T12·T14 확인이 n1이 걷은 게이트를 전제한다.
- n5 → n9: n9의 T15 확인이 n5의 첫 벽 공유를 본다. T4~T9·T11이 보는 n4 시트도 n5를 거쳐 들어온다.
- n6 → n9: n9의 T2 요청 0건 판정이 n6의 미리보기 막기를 전제한다.

n7과 n8은 n9에 걸지 않았다. 둘 다 화면을 바꾸지 않아 실브라우저 확인과 무관하다.

커버리지:

| 행 | 노드 |
|---|---|
| T1 T10 T14 | n1, 확인 n9 |
| T2 | n6, 확인 n9 |
| T3 | n3, 확인 n9 |
| T4 T5 T11 | n4, 확인 n9 |
| T6 T8 T9 | n2 상태 + n4 화면, 확인 n9 |
| T7 | 기존 공유 흐름, 확인 n9 |
| T12 | n1 화면 + n3 배지, 확인 n9 |
| T13 | n2 상태 + n3 배지, 확인 n9 |
| T15 | n5, 확인 n9 |
| T16 | n7 |
| T17 | n1 테스트 + n8 문서 |

## 노드 인덱스

| ID | 브리프 | deps | 상태 |
|---|---|---|---|
| n1 | [n1-no-login-gate.md](n1-no-login-gate.md) | — | 아직 안 함 |
| n2 | [n2-share-state.md](n2-share-state.md) | — | 아직 안 함 |
| n3 | [n3-wall-badge.md](n3-wall-badge.md) | n2 | 아직 안 함 |
| n4 | [n4-share-sheet.md](n4-share-sheet.md) | n2, n3 | 아직 안 함 |
| n5 | [n5-first-wall-share.md](n5-first-wall-share.md) | n4 | 아직 안 함 |
| n6 | [n6-link-preview-optin.md](n6-link-preview-optin.md) | — | 아직 안 함 |
| n7 | [n7-network-allowlist.md](n7-network-allowlist.md) | n6 | 아직 안 함 |
| n8 | [n8-spec-docs.md](n8-spec-docs.md) | — | 아직 안 함 |
| n9 | [n9-browser-verify.md](n9-browser-verify.md) | n1, n5, n6 | 아직 안 함 |

## 파킹 / 보류 로그

| 날짜 | 노드 | 사유 |
|---|---|---|
| | | |

## 구현 메모

- 되돌리는 결정: `docs/specs/FEAT-onboarding-routes.md` D4 갈림길의 로그인 분기, D5 로그인 필수와 AC-4, `FEAT-collab-auth.md` AC-1 폐기 표시. 원래 collab-auth D8 "혼자 쓸 때는 로그인 없음"으로 돌아간다.
- 게이트: `web/src/components/auth/WorkspaceGate.tsx` `gateView()`가 anonymous면 `LoginOnboarding`을 그린다. `WorkspaceShell.tsx`에서 쓴다. D7 추천은 `LoginOnboarding.tsx`·`FloatingCards.tsx` 삭제, `AccountOwnerGuard`·`SessionExpiredCard`·`InviteRoute`는 남김.
- 첫 보드 고르기 `FirstBoardChooser.tsx`와 ko.json `onboarding.firstBoard`는 first-wall 몫.
- 공유 진입: `components/share/ShareControlMount.tsx`는 `board.isSystem`이면 null — D2. `ShareControl.tsx`·`SharePopover.tsx`, 공유 상태는 `state/share/store.ts` `byBoard[id].status`가 `"local" | "shared"`. 올리는 중 상태는 `busyByBoard`로 대신할 수 있다.
- 업로드: `state/collab/store.ts` `uploadBoardDoc()`, `UPLOAD_SYNC_TIMEOUT_MS = 10_000`. 파일함은 `shareSubBoards` — `spec/share-subboards.md`.
- 시스템 보드 id: `state/boardIds.ts` `SYSTEM_BOARD_ID` 고정 UUID, `state/db/systemBoardMigration.ts`.
- 로그아웃: `state/auth/store.ts:225` `logout()`은 보드를 지우지 않는다 — D5 추천 A와 맞다.
- 문구: ko.json `collab.share.sub` "이 보드만 서버에 올라가요."를 시안 문구로 바꾼다. 새 키 후보 `collab.share.sheet.title`·`body`·`bodyOthers`·`googleAndShare`·`share`·`cancel`·`loginFailed`·`uploadFailed`, `wall.badge.local`·`shared`·`uploading`·`sharedLoggedOut`.
- 서버로 나가는 호출 지점(2026-10-11 기준): `state/auth/api.ts`, `state/share/api.ts`, `state/share/files.ts`, `state/collab/provider.ts`, `state/cardContent.ts:154`와 `state/bridge/mossBridge.ts:439`의 `/api/preview` — D1, `state/bridge/mossBridge.ts:531` 브리지는 `ws://127.0.0.1:7333`이고 `NEXT_PUBLIC_MOSS_BRIDGE=1`일 때만 켜져 바깥이 아니다. `server/ai/*`·`state/ai/*`는 remove-ai가 지운다. T16 허용 목록은 auth·share·files·collab·preview다.
- 분석 도구(posthog·sentry·gtag) 흔적은 웹 소스에서 찾지 못했다.
- 테스트: `components/auth/__tests__`의 게이트 테스트, 로그인 주입으로 바꿨던 혼자 쓰기 테스트. 플래키 2종은 메모리 `web-test-build-env` 참고.
