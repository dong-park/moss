# n3 — OAuth 인가 서버

> 자기완결 브리프. runner는 상위 spec + 이 파일만 본다. 진행 메모는 이 파일에만 쓴다. `**상태**:` 줄은 손으로 고치지 않는다 — 멈추면 `spec-board node block`, 사람 확인이 필요하면 `spec-board node review`.

**agent**: runner
**id**: RM-3
**상위**: spec/remote-mcp/spec.md
**deps**: 없음
**상태**: 아직 안 함
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
