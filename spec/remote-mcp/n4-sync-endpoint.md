# n4 — sync 안 MCP 엔드포인트

> 자기완결 브리프. runner는 상위 spec + 이 파일만 본다. 진행 메모는 이 파일에만 쓴다. `**상태**:` 줄은 손으로 고치지 않는다 — 멈추면 `spec-board node block`, 사람 확인이 필요하면 `spec-board node review`.

**agent**: runner
**id**: RM-4
**상위**: spec/remote-mcp/spec.md
**deps**: n2, n3
**상태**: 끝남
**담당 행**: T5
**사람 확인**: 불필요

## 문제

- 보드 문서는 sync가 들고 있어 같은 프로세스에서 고쳐야 브라우저에 즉시 반영되고 저장·크기 제한도 같다.

## 목표

엔드포인트에서 접근 토큰을 검증하고, 보드 멤버십을 확인한 뒤 openDirectConnection으로 문서를 연다. 경로는 D7, 확장은 D8을 따른다. 도구 없이 빈 목록으로 연결까지 되면 끝이다.

## 선행 결정

D7, D8

## 완료 기준

- [x] spec 공통 완료 기준 전부 (sync tsc·bun test 55/55, web tsc 통과. 실제 커넥터 증거는 아님 — n8)
- [x] 담당 행의 Then이 실제로 보인다 (T5의 sync 쪽: 토큰 없음·모르는 토큰·다른 대상 토큰은 401, 유효 토큰은 initialize·tools/list(빈 목록 포함)까지 연결. 로그인·동의 화면은 n3 몫)
- [x] 새 로직 최소 1테스트 (sync/test/mcp.test.ts 15개)

## 파일 포인터

sync/src/server.ts:79, membership.ts, internalServer.ts

## 구현 메모
- 만든 것: sync/src/mcp.ts(Streamable HTTP, JSON 응답만. POST /mcp 한 길; GET은 405). server.ts의 onRequest 훅이 경로가 맞으면 먼저 처리하고 나머지는 기존 응답. config.ts는 KTOR_INTERNAL_URL이 있을 때만 mcp 설정을 켠다(없으면 /mcp는 열리지 않음). PUBLIC_BASE_URL·MCP_RESOURCE_URL 기본값은 Ktor AppConfig와 같다. docker-compose.yml에 환경 변수 추가.
- 토큰은 호출마다 Ktor `/oauth/introspect`로 확인한다(내부 비밀 `X-Moss-Internal`). 대상(aud)이 resourceUrl과 다르면 401. Ktor에 닿지 않으면 401이 아니라 503 + Retry-After(재승인 유도 방지).
- 도구는 `McpTool`을 `createMcpEndpoint({tools})`에 넘기면 된다. `context.withBoard(boardId, fn)`가 호출 시점에 멤버십을 다시 확인하고 openDirectConnection을 열었다 닫는다. 멤버가 아니거나 없는 보드는 같은 문구로 거절한다(보드 존재 탐지 방지). n5·n6은 이 계약을 쓴다.
- 본문 상한 1MB 초과는 413. 이벤트 방식으로 읽는다(for await를 중간에 빠져나오면 413 응답이 클라이언트에 닿지 않음을 확인).
- 인메모리 sync 한 인스턴스 전제(D8=A). 인스턴스를 늘리면 MCP 변경이 일부 사용자에게 안 보인다.
- 병렬 경계 (2026-10-18, 메인 · 웨이브 4): n1 수정·n7과 같은 워킹트리에서 동시에 돈다. n4 몫은 sync/와 shared/doc-model이다. 토큰 검증은 n3이 만든 introspect를 쓴다. 서버 변경이 꼭 필요하면 server/src/main/kotlin/com/moss/server/mcp/ 아래 새 파일과 Application.kt 등록 한 줄만 쓴다(server oauth/ 패키지는 n7 몫). web/src/state는 n1 몫이다. gradle은 n7과 build 디렉터리가 겹치니 격리 복사본에서 돌린다. 커밋은 자기 파일만 지정해 add한다.
