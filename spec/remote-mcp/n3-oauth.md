# n3 — OAuth 인가 서버

> 자기완결 브리프. runner는 상위 spec + 이 파일만 본다. 진행 메모는 이 파일에만 쓴다. `**상태**:` 줄은 손으로 고치지 않는다 — 멈추면 `spec-board node block`, 사람 확인이 필요하면 `spec-board node review`.

**agent**: runner
**id**: RM-3
**상위**: spec/remote-mcp/spec.md
**deps**: 없음
**상태**: 진행
**담당 행**: T5, T6
**사람 확인**: 불필요

## 문제

- 웹 세션 토큰과 별개로 MCP 클라이언트용 토큰이 필요하다.

## 목표

보호 리소스 메타데이터, 인가 서버 메타데이터, 클라이언트 등록(D3), 동의 화면, 토큰 발급·갱신·폐기를 둔다. 토큰은 범위 없이 읽기쓰기 하나다(D4 → B). 수명은 D4가 정하지 않아 접근 토큰 1시간, 갱신 토큰 30일로 두고 설정값으로 뺀다.

## 선행 결정

D3, D4

## 완료 기준

- [ ] spec 공통 완료 기준 전부
- [ ] 담당 행의 Then이 실제로 보인다
- [ ] 새 로직 최소 1테스트

## 파일 포인터

server AuthRoutes.kt, AppConfig.kt

## 구현 메모
- 병렬 경계 (2026-10-18, 메인): n1·n2·n3이 같은 워킹트리에서 동시에 돈다. Flyway 마이그레이션은 V8__부터 쓴다(V7은 n1 몫). OAuth 라우트는 새 파일(server/src/main/kotlin/com/moss/server/oauth/ 아래)에 두고 Application.kt에는 등록 줄만 더한다. BoardRoutes.kt는 n1 몫이라 고치지 않는다. sync는 건드리지 않는다. 커밋은 자기 파일만 지정해 add한다.

- 구현 (2026-10-18, runner): 서버 oauth/ 패키지(OAuthRoutes·OAuthStore·ClientResolver·OAuthPages), V8__oauth.sql, AppConfig에 PUBLIC_BASE_URL·MCP_RESOURCE_URL·MCP_ACCESS_TTL_SECONDS(3600)·MCP_REFRESH_TTL_SECONDS(30일), Application.kt에는 등록 줄만.
- 엔드포인트: /.well-known/oauth-protected-resource[/경로], /.well-known/oauth-authorization-server, POST /oauth/register(DCR), GET·POST /oauth/authorize(로그인+동의 한 화면), POST /oauth/token(authorization_code·refresh_token, PKCE S256 필수), POST /oauth/revoke, GET /oauth/grants·DELETE /oauth/grants/{id}(웹 세션, n7용), POST /oauth/introspect(n4용).
- 토큰은 불투명 문자열(mat_/mrt_)이고 해시만 저장한다. 웹 JWT와 서로 통하지 않는다. 갱신 토큰은 쓸 때마다 교체하고, 쓴 토큰이 다시 오면 연결 전체를 폐기한다.
- n4가 할 일: 도구 호출마다 `POST {Ktor}/oauth/introspect`(헤더 X-Moss-Internal = SYNC_INTERNAL_SECRET, 폼 token)로 active·sub(userId)·aud를 확인하고 aud가 자기 MCP 주소인지 본다. 401 응답에 WWW-Authenticate resource_metadata=`{PUBLIC_BASE_URL}/.well-known/oauth-protected-resource` 를 넣는다. sync 환경에 Ktor 내부 주소가 필요하다.
- n7이 할 일: 목록은 GET /oauth/grants(id, clientName, createdAt, lastUsedAt), 해제는 DELETE /oauth/grants/{id}.
- 배포: 프록시 뒤에서는 PUBLIC_BASE_URL을 바깥 주소로 맞춰야 메타데이터가 맞다. /mcp 와 /.well-known/oauth-protected-resource 가 같은 호스트에서 sync·Ktor로 갈라지게 라우팅해야 한다.
- 갭: 동의 화면은 메일·비밀번호 로그인만 받는다 — 구글로만 가입한 사용자는 아직 연결할 수 없다(웹 동의 화면 또는 서버 페이지의 구글 로그인이 필요, 사용자 결정). 메타데이터 문서 클라이언트는 단위 테스트(가짜 fetcher)로만 확인했고 실제 클라이언트 연결은 n8. 브라우저 직접 호출용 CORS는 열지 않았다. 메타데이터 fetch는 검사 뒤 DNS 재바인딩 틈이 남아 있다. 속도 제한은 메모리 안이라 인스턴스 하나 기준이다.
