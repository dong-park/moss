# n7-network-allowlist — 서버로 나가는 길을 테스트로 묶어 둔다 (T16)

> 자기완결 브리프. runner는 상위 spec과 이 파일만 본다. 진행 메모는 이 파일에만 쓴다 — 상위 spec은 호출자가 고친다. `**상태**:` 줄은 손으로 고치지 않는다 — graph-run이 `진행`·`끝남`을 쓰고, 멈추면 `node_state.py block`, 사람 확인이 필요하면 `node_state.py review`만 쓴다.

**agent**: runner
**id**: LP-7
**상위**: spec/glass-wall/local-promise/spec.md
**deps**: n6-link-preview-optin
**상태**: 아직 안 함
**담당 행**: T16

## 문제

나중에 누가 새 요청 코드를 넣으면 "이 기기에만" 약속이 조용히 깨진다.

지금은 서버로 요청을 보내는 곳이 몇 군데인지 아무도 지키지 않는다. remove-ai가 AI 경로를 지우면 남는 길은 공유뿐이어야 한다. 그 사실을 테스트가 지켜야 한다.

## 목표

웹 소스에서 서버로 요청을 보내는 곳이 허용 목록과 다르면 실패하는 테스트가 있다. 허용 목록의 각 항목이 공유한 벽이나 로그인한 순간에만 불린다는 이유가 목록 옆에 적혀 있다.

## 담당 행 메모

| 행 | 수용 기준 |
|---|---|
| T16 | remove-ai 뒤 남은 요청 지점은 로그인, 공유, 동기화, 공유 벽 첨부, 누를 때만 가는 링크 미리보기뿐이다. `fetch(`·`WebSocket`·`HocuspocusProvider` 검색 결과를 허용 목록과 대조한다 |

## 허용 목록 (2026-10-11 기준)

| 파일 | 이유 |
|---|---|
| `web/src/state/auth/api.ts` | 로그인한 순간과 세션 갱신 |
| `web/src/state/share/api.ts` | 공유를 고른 벽과 그 멤버 |
| `web/src/state/share/files.ts` | 공유 벽 첨부 |
| `web/src/state/collab/provider.ts` | 공유 벽 동기화 |
| `web/src/state/cardContent.ts` | 링크 미리보기. 혼자 쓰는 벽에서는 누를 때만 — n6 |
| `web/src/state/bridge/mossBridge.ts` | `127.0.0.1` 로컬 브리지와 그 미리보기. `NEXT_PUBLIC_MOSS_BRIDGE=1`일 때만 |
| `web/src/server/**`, `web/src/app/api/**` | 서버 쪽 코드. 브라우저에서 돌지 않는다 |

AI 경로 `web/src/state/ai/*`, `web/src/server/ai/*`는 remove-ai가 지운다. remove-ai가 아직이면 이 둘을 "remove-ai 대기"로 따로 적고 테스트는 통과시킨다. remove-ai가 끝난 뒤 이 줄을 지우면 실패해야 한다.

## 작업

1. `web/src` 아래 테스트 파일을 뺀 모든 `.ts`·`.tsx`에서 `fetch(`, `new WebSocket`, `HocuspocusProvider`, `sendBeacon`, `EventSource`를 찾는 테스트를 만든다.
2. 찾은 파일 목록이 허용 목록과 같은지 확인한다. 새 파일이 생기면 실패 메시지에 파일 이름과 "spec/glass-wall/local-promise 허용 목록에 이유를 적고 더하세요"를 보인다.
3. 허용 목록은 테스트 파일 안 상수로 두고 위 표의 이유를 주석으로 단다.
4. 스펙 구현 메모의 허용 목록 줄과 이 상수가 같은지 확인한다. 다르면 구현 메모에 적는다. 스펙은 고치지 않는다.

## 완료 기준

- [ ] spec 공통 완료 기준 전부
- [ ] `cd web && bun run test -- networkAllowlist` 통과
- [ ] 허용 목록 밖 파일에 `fetch(`를 임시로 넣으면 테스트가 실패하는 것을 한 번 확인하고 되돌린다. 그 결과를 구현 메모에 적는다
- [ ] 실경로: 테스트가 실제 소스 파일을 읽는다

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/state/__tests__/` | 새 테스트 `networkAllowlist.test.ts`를 여기 만든다 |
| 위 허용 목록 표의 파일들 | 대조 대상 |

## 다른 티켓과 겹침

- 선행: remove-ai — AI 경로가 지워져야 T16이 최종 판정된다. 그 전에는 "remove-ai 대기" 줄을 두고 통과한다.
