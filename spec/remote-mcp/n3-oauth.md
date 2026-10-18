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
- 고쳐줘 (2026-10-18, 메인 · wave-20261018-1100 /review P1): 클라이언트 ID 메타데이터 문서 fetch의 SSRF(ClientResolver.kt:84-111). https만, 기본 포트(443)만 허용하고, DNS를 한 번 풀어 사설·루프백·링크로컬·메타데이터 주소(IPv4·IPv6 모두)를 거절한 뒤 그 푼 주소로 접속해 재바인딩을 막는다. 리다이렉트를 따르지 않고 응답 크기·시간 상한을 둔다. /oauth/authorize GET(OAuthRoutes.kt:252)에 요청 수 상한을 단다. 각 거절을 테스트로 고정한다.
- 고쳐줘 (2026-10-18, 메인 · /review P2): refresh_token 그랜트에서 client_id를 필수로 받고 토큰을 발급한 클라이언트와 맞는지 확인한다. introspect에 인증 또는 요청 수 상한을 둔다. 프록시 뒤에서 limiter가 한 버킷으로 묶이는 문제는 배포 구성(신뢰할 프록시 헤더)이 정해지지 않아 이번에 고치지 않고, 코드 주석 대신 이 메모에만 남긴다.
- 병렬 경계 (2026-10-18, 메인 · 수정 웨이브): gradle은 n1과 build 디렉터리가 겹치니 격리 복사본에서 돌린다. 고칠 파일은 server/src/main/kotlin/com/moss/server/oauth/ 아래와 그 테스트까지다. BoardRoutes·BoardRepository는 n1 몫이다.
- 수정 (2026-10-18, runner · 고쳐줘 반영): 
  - SSRF: ClientResolver.kt의 HttpClient 기반 fetcher를 `PinnedMetadataFetcher`로 바꿨다. https·443만 받고(클라이언트 ID 검증 `isValidMetadataUrl`도 같은 규칙), DNS를 한 번만 풀어 전부 공개 주소일 때만 그 주소로 직접 소켓 접속한다(TLS는 원래 호스트로 SNI·인증서 이름 검사). 공개 판정은 IPv4 사설·루프백·링크로컬(메타데이터 169.254.169.254)·CGNAT·문서용·벤치마크·멀티캐스트·예약과 IPv6 루프백·ULA·링크로컬·멀티캐스트·문서용·Teredo, 그리고 IPv4가 든 매핑·호환·NAT64·6to4 주소의 안쪽 IPv4까지 본다. 리다이렉트는 따르지 않고 200만 받으며, Transfer-Encoding·Content-Encoding이 붙은 응답은 거절한다. 본문 64KB, 헤더 16KB, 전체 5초 상한. 요청은 HTTP/1.0이다.
  - /oauth/authorize GET·POST에 클라이언트 주소(remoteHost)당 분당 60회 상한(초과 429). POST는 로그인 상한 앞에서도 fetch를 일으키므로 같이 건다.
  - refresh_token 그랜트는 client_id 필수(없으면 invalid_request), 토큰을 발급받은 클라이언트와 다르면 invalid_grant이며 이때 토큰을 쓰지도 연결을 끊지도 않는다.
  - introspect는 이미 X-Moss-Internal 내부 비밀으로 인증하고 비밀이 없으면 꺼 두므로(기존 테스트 introspectionNeedsTheInternalSecret) 요청 수 상한은 더하지 않았다.
  - 검증: server 전체 테스트 111개 통과(격리 복사본). 실제 TLS 접속은 임시 테스트로 https://www.google.com/robots.txt 를 받아 확인했고, 다른 IP(8.8.8.8)로 고정하면 인증서 이름 불일치로 거절됐다. 그 임시 테스트는 커밋하지 않았다.
  - 남은 틈(결정 필요): 프록시 뒤에서는 remoteHost가 프록시 주소 하나라 모든 limiter(register·token·authorize·로그인)가 한 버킷으로 묶인다. 신뢰할 프록시 헤더(X-Forwarded-For 등) 구성이 정해지지 않아 이번에 고치지 않았다. 속도 제한은 여전히 메모리 안이라 인스턴스 하나 기준이다. 실제 클라이언트 ID 메타데이터 문서 연결은 n8에서 확인한다.
