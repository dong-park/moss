# n5 — 읽기 도구

> 자기완결 브리프. runner는 상위 spec + 이 파일만 본다. 진행 메모는 이 파일에만 쓴다. `**상태**:` 줄은 손으로 고치지 않는다 — 멈추면 `spec-board node block`, 사람 확인이 필요하면 `spec-board node review`.

**agent**: runner
**id**: RM-5
**상위**: spec/remote-mcp/spec.md
**deps**: n4
**상태**: 아직 안 함
**담당 행**: T7, T4
**사람 확인**: 불필요

## 문제

- 에이전트가 먼저 보드를 읽어야 쓸 수 있다.

## 목표

보드 목록, 보드 통째 읽기, 검색 세 도구를 만든다. 멤버가 아닌 보드는 거절한다. 읽기 결과 마크다운은 메모·연결·첨부 이름을 담는다.

## 선행 결정

없음

## 완료 기준

- [ ] spec 공통 완료 기준 전부
- [ ] 담당 행의 Then이 실제로 보인다
- [ ] 새 로직 최소 1테스트

## 파일 포인터

mcp/src 도구 정의를 참고, web/src/state/bridge/mossBridge.ts

## 구현 메모
- 먼저 할 것 (2026-10-18, 메인 · 웨이브 4 /review, n4 후속): n4의 sync/src/mcp.ts는 MCP 프로토콜을 SDK 없이 직접 짰다. 도구를 얹기 전에 다음을 고친다.
  - 공식 @modelcontextprotocol/sdk(레포 mcp/가 이미 ^1.12.0을 쓴다)의 McpServer와 세션 없는 StreamableHTTPServerTransport(JSON 응답)로 바꾸고, 도구는 mcp/src/server.ts처럼 registerTool + zod로 정의한다. Bearer 인증, aud 확인, 503 처리, 멤버십 확인, 1MB 상한은 그대로 둔다. Devil's Advocate P1.
  - JSON-RPC 배열 묶음 요청은 400으로 거절한다(2025-06-18 사양에서 빠졌다). SDK가 받으면 길이 상한 16, 차례 처리. 성능 P1·보안 P2 교차.
  - 읽기 도구는 openDirectConnection을 쓰지 않는다. 이미 열려 있는 문서면 메모리에서, 아니면 저장된 스냅샷을 읽어 Y.Doc으로 풀고 끝낸다. disconnect가 매번 전체 문서를 Postgres에 다시 쓰고 unloadImmediately라 비용이 호출 수 × 문서 크기다. 쓰기 경로(n6)만 direct connection을 쓴다. 성능 P1.
  - aud가 맞지 않는 401은 console.warn("mcp audience mismatch", 받은 값, 기대 값)을 남겨 토큰 폐기와 구분되게 한다. 유지보수 P1·Devil P2.
- 병렬 경계 (2026-10-18, 메인 · 웨이브 5): n1 수정과 같은 워킹트리에서 동시에 돈다. n5 몫은 sync/와 shared/doc-model이다. web/src/state는 n1 몫이다. 커밋은 자기 파일만 지정해 add하고, 임시 인덱스를 쓰면 같은 셸 명령 안에서 add와 commit을 끝낸다(웨이브 4에서 임시 인덱스 변수가 호출 사이에 이어지지 않아 빈 커밋이 났다).
