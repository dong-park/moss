# n1-no-login-gate — 로그인 화면 없이 벽을 연다 (T1 T10 T12 T14)

> 자기완결 브리프. runner는 상위 spec과 이 파일만 본다. 진행 메모는 이 파일에만 쓴다 — 상위 spec은 호출자가 고친다. `**상태**:` 줄은 손으로 고치지 않는다 — graph-run이 `진행`·`끝남`을 쓰고, 멈추면 `node_state.py block`, 사람 확인이 필요하면 `node_state.py review`만 쓴다.

**agent**: runner
**id**: LP-1
**상위**: spec/glass-wall/local-promise/spec.md
**deps**: 없음
**상태**: 아직 안 함
**담당 행**: T1, T10, T12, T14

## 문제

처음 온 사람이 벽보다 로그인 화면을 먼저 본다.

지금은 로그인하지 않으면 워크스페이스 대신 로그인 온보딩 화면만 그린다. 그래서 사적인 생각을 쓰기 전에 계정부터 만들어야 한다. 이 노드는 그 게이트를 걷는다.

## 목표

로그인 여부와 상관없이 워크스페이스가 열린다. 로그인 온보딩 화면은 코드에서 사라진다. 초대 링크와 세션 만료 카드는 그대로 동작한다.

## 확정 결정

- D7 = A. 로그인 온보딩 화면을 지운다. 초대 카드와 세션 만료 카드만 남긴다.
- D5 = A. 로그아웃해도 벽을 숨기지 않는다. 배지 문구는 n3 몫이다.

## 담당 행 메모

| 행 | 수용 기준 요약 |
|---|---|
| T1 | 로그인한 적 없는 브라우저에서 moss를 열면 로그인 화면 없이 벽이 열린다. 쓰고 새로고침해도 남는다 |
| T10 | 이미 로그인해 쓰던 사람은 업데이트 뒤 안내 없이 마지막 벽이 열린다. 다시 로그인하라고 묻지 않는다 |
| T12 | 로그아웃하면 로그인 화면으로 가지 않고 보던 벽이 그대로 보인다 |
| T14 | 로그인 안 한 사람이 초대 링크를 열면 초대 카드와 Google 버튼이 보이고, 로그인하면 그 공유 벽이 열린다 |

배지 문구 확인은 n3, 실제 화면 확인은 n9가 한다.

## 작업

1. 게이트가 세션 복원이 끝나기 전에도, 복원이 anonymous로 끝나도 워크스페이스를 그리게 바꾼다. 세션 복원은 뒤에서 그대로 돈다. 복원 전 빈 화면 깜빡임이 없어야 한다.
2. 다른 계정 안내 가드는 로그인 상태일 때만 그대로 붙인다.
3. 로그인 온보딩 화면과 그 화면만 쓰는 장식 컴포넌트를 지운다. 초대 카드와 세션 만료 카드가 장식 컴포넌트를 쓰면 그 부분만 남기거나 옮긴다.
4. `/` 갈림길에서 로그인 분기를 뺀다. 로그인 안 한 사람도 마지막 벽이나 첫 벽으로 간다.
5. 로그아웃 뒤 화면이 워크스페이스에 머무는지 확인한다. 지금 로그아웃 로직은 보드를 지우지 않는다. 그대로 둔다.
6. ko.json에서 지운 화면만 쓰던 키를 지운다. 다른 노드가 같은 파일에 키를 더한다. 지우기만 하고 다른 키는 건드리지 않는다.
7. 게이트 테스트를 새 규칙으로 고친다. 로그인 온보딩 테스트는 지운다. 로그인 상태를 주입해야만 돌던 혼자 쓰기 테스트를 찾아 주입 없이 돌게 고친다.

## 완료 기준

- [ ] spec 공통 완료 기준 전부
- [ ] `cd web && bun run test -- src/components/auth` 통과
- [ ] `cd web && grep -rn "LoginOnboarding" src` 결과 0줄
- [ ] 게이트 테스트에 "anonymous여도 워크스페이스", "복원 전에도 워크스페이스", "로그아웃 뒤 워크스페이스 유지" 세 경우가 있다
- [ ] 실경로: 테스트가 실제 게이트 컴포넌트를 그린다. 게이트를 목으로 바꿔 통과시키지 않는다

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/components/auth/WorkspaceGate.tsx` | 게이트. `gateView()`가 anonymous면 온보딩을 고른다 |
| `web/src/components/workspace/WorkspaceShell.tsx` | 181·222행에서 게이트로 감싼다 |
| `web/src/components/auth/LoginOnboarding.tsx` | 지울 화면 |
| `web/src/components/auth/FloatingCards.tsx` | 온보딩 장식. 초대·만료 카드도 참조한다 |
| `web/src/components/auth/InviteRoute.tsx` | 초대 카드. 남긴다 |
| `web/src/components/auth/SessionExpiredCard.tsx` | 세션 만료 카드. 남긴다 |
| `web/src/components/auth/AccountOwnerGuard.tsx` | 다른 계정 안내. 남긴다 |
| `web/src/app/page.tsx` | `/` 갈림길 |
| `web/src/app/globals.css` | 온보딩 스타일 흔적 |
| `web/src/state/auth/store.ts` | 225행 `logout()` |
| `web/src/components/auth/__tests__/WorkspaceGate.test.tsx` | 고칠 테스트 |
| `web/src/components/auth/__tests__/LoginOnboarding.test.tsx` | 지울 테스트 |
| `web/src/i18n/messages/ko.json` | `collab.auth.onboarding` 키 |

## 다른 티켓과 겹침

- first-wall이 첫 진입 화면을 바꾸고 `FirstBoardChooser.tsx`를 다룬다. 이 노드는 그 파일을 고치지 않는다. 같은 `WorkspaceShell.tsx`를 고칠 수 있으니 게이트 부분만 손댄다.
