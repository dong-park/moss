# n5 — 읽기 도구

> 자기완결 브리프. runner는 상위 spec + 이 파일만 본다. 진행 메모는 이 파일에만 쓴다. `**상태**:` 줄은 손으로 고치지 않는다 — 멈추면 `spec-board node block`, 사람 확인이 필요하면 `spec-board node review`.

**agent**: runner
**id**: RM-5
**상위**: spec/remote-mcp/spec.md
**deps**: n4
**상태**: 끝남
**담당 행**: T7, T4
**사람 확인**: 불필요

## 문제

- 에이전트가 먼저 보드를 읽어야 쓸 수 있다.

## 목표

보드 목록, 보드 통째 읽기, 검색 세 도구를 만든다. 멤버가 아닌 보드는 거절한다. 읽기 결과 마크다운은 메모·연결·첨부 이름을 담는다.

## 선행 결정

없음

## 완료 기준

- [x] spec 공통 완료 기준 전부
- [x] 담당 행의 Then이 실제로 보인다
- [x] 새 로직 최소 1테스트

## 파일 포인터

mcp/src 도구 정의를 참고, web/src/state/bridge/mossBridge.ts

## 구현 메모
- 먼저 할 것 (2026-10-18, 메인 · 웨이브 4 /review, n4 후속): n4의 sync/src/mcp.ts는 MCP 프로토콜을 SDK 없이 직접 짰다. 도구를 얹기 전에 다음을 고친다.
  - 공식 @modelcontextprotocol/sdk(레포 mcp/가 이미 ^1.12.0을 쓴다)의 McpServer와 세션 없는 StreamableHTTPServerTransport(JSON 응답)로 바꾸고, 도구는 mcp/src/server.ts처럼 registerTool + zod로 정의한다. Bearer 인증, aud 확인, 503 처리, 멤버십 확인, 1MB 상한은 그대로 둔다. Devil's Advocate P1.
  - JSON-RPC 배열 묶음 요청은 400으로 거절한다(2025-06-18 사양에서 빠졌다). SDK가 받으면 길이 상한 16, 차례 처리. 성능 P1·보안 P2 교차.
  - 읽기 도구는 openDirectConnection을 쓰지 않는다. 이미 열려 있는 문서면 메모리에서, 아니면 저장된 스냅샷을 읽어 Y.Doc으로 풀고 끝낸다. disconnect가 매번 전체 문서를 Postgres에 다시 쓰고 unloadImmediately라 비용이 호출 수 × 문서 크기다. 쓰기 경로(n6)만 direct connection을 쓴다. 성능 P1.
  - aud가 맞지 않는 401은 console.warn("mcp audience mismatch", 받은 값, 기대 값)을 남겨 토큰 폐기와 구분되게 한다. 유지보수 P1·Devil P2.
- 병렬 경계 (2026-10-18, 메인 · 웨이브 5): n1 수정과 같은 워킹트리에서 동시에 돈다. n5 몫은 sync/와 shared/doc-model이다. web/src/state는 n1 몫이다. 커밋은 자기 파일만 지정해 add하고, 임시 인덱스를 쓰면 같은 셸 명령 안에서 add와 commit을 끝낸다(웨이브 4에서 임시 인덱스 변수가 호출 사이에 이어지지 않아 빈 커밋이 났다).
- 진행 결과 (2026-10-18, runner): 먼저 할 것 네 가지와 읽기 도구를 끝냈다. sync 전체 66개 테스트와 tsc가 통과한다.
  - mcp.ts: 직접 짠 JSON-RPC 처리를 걷어내고 SDK McpServer + 세션 없는 StreamableHTTPServerTransport(JSON 응답)로 바꿨다. 요청마다 서버를 새로 만들어 호출자 컨텍스트를 닫아 둔다. 도구는 defineTool(zod 모양) → registerTool. 예상 밖 오류는 SDK 기본 동작이 메시지를 그대로 내보내므로 래퍼에서 "tool failed"로 가린다. 배열 묶음은 400(-32600)으로 거절했다(길이 16 허용 대신 거절 쪽). aud 불일치는 console.warn("mcp audience mismatch", 받은 값, 기대 값).
  - 읽기 경로: McpToolContext에 listBoards/readDoc/fileNames 추가. readDoc은 멤버십 확인 뒤 열려 있는 문서면 메모리, 아니면 저장된 스냅샷을 새 Y.Doc에 풀고 끝낸다(openDirectConnection 없음, 저장 호출 0회를 테스트로 확인). withBoard는 쓰기(n6) 전용으로 남겼다.
  - 도구 3개(sync/src/mcpReadTools.ts): list_boards, read_board(메모 제목·본문·색·글자 크기·위치·메모판·첨부 이름과 연결선 마크다운, 12만 자 상한), search(제목·본문·첨부 이름·연결 이름표, 한 보드 또는 멤버 보드 전체, 보드 30개·결과 30건 상한). 셋 다 readOnlyHint. 보드 목록과 파일 이름은 sync/src/mcpBoards.ts의 Postgres 조회(멤버 행 + 하위 보드 재귀, 깊이 32).
  - 의존성: sync에 @modelcontextprotocol/sdk, zod 추가(bun.lock 갱신, Dockerfile의 --frozen-lockfile과 맞음).
  - 갭: 확인은 가짜 introspector + HTTP 테스트까지다. 실제 커넥터(Claude 등)에서 SDK 응답 형식이 받아들여지는지는 n8에서 본다. T4의 새로고침 뒤 색·크기 유지는 쓰기 도구(n6) 몫이고, 여기서는 읽기 결과에 색·글자 크기가 나오는 것까지 확인했다. SDK는 POST에 Accept: application/json, text/event-stream 둘 다를 요구한다(없으면 406).
