# MCP AI 인증 보정 보고

MCP AI 도구 세 개가 moss 탭의 로그인 세션으로 AI 라우트를 호출하도록 고쳤다. 커밋은 하지 않았다.

## 변경
- mcp/src/ai.ts: bridge 옵션을 추가했다. 주어지면 HTTP 대신 브리지 op로 보낸다.
- mcp/src/server.ts: ai_embed, ai_summarize, ai_connection_label이 bridge를 넘긴다.
- web/src/state/bridge/mossBridge.ts: dispatchOp에 ai.embed, ai.summarize, ai.connectionLabel을 추가했다. 기존 aiAuthHeaders와 callAI 함수를 그대로 쓴다.
- mcp/README.md: 탭과 로그인 요구 조건과 오류 문구를 적었다.
- 테스트: mcp/src/ai.test.ts 4건, web mossBridge.test.ts 5건을 추가했다.

## 보안
- 토큰은 탭 안에서만 헤더에 실린다. MCP 프로세스, 도구 인자, 결과, 로그에 나오지 않는다. 결과 직렬화에 토큰이 없음을 테스트로 확인했다.
- guard, authHeaders, client는 수정하지 않았다. 가드 우회는 없다.

## 실행한 테스트
- bun test mcp/src/ai.test.ts mcp/src/bridge.test.ts: 16 통과.
- vitest web/src/state/bridge: 60 통과.
- eslint web/src/state/bridge: 오류 0.
- 확인 안 됨: mcp tsc는 bun 타입 정의가 없어 실행하지 못했다. 실제 MCP 클라이언트와 실제 embed 라우트 재현은 서버 실행 금지로 다시 하지 않았다.

## 호출자가 정할 것
- 탭 없이 쓰던 사용자는 이제 "moss 탭이 브리지에 접속하지 않았습니다" 오류를 받는다. 의도된 변화다.
- embed는 client.ts에 호출 함수가 없어 mossBridge 안에서 fetcher 래퍼로 호출했다. client.ts에 callAIEmbed를 두는 편이 낫다면 별도 결정이 필요하다.
