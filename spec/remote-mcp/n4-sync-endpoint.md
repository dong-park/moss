# n4 — sync 안 MCP 엔드포인트

> 자기완결 브리프. runner는 상위 spec + 이 파일만 본다. 진행 메모는 이 파일에만 쓴다. `**상태**:` 줄은 손으로 고치지 않는다 — 멈추면 `spec-board node block`, 사람 확인이 필요하면 `spec-board node review`.

**agent**: runner
**id**: RM-4
**상위**: spec/remote-mcp/spec.md
**deps**: n2, n3
**상태**: 아직 안 함
**담당 행**: T5
**사람 확인**: 불필요

## 문제

- 보드 문서는 sync가 들고 있어 같은 프로세스에서 고쳐야 브라우저에 즉시 반영되고 저장·크기 제한도 같다.

## 목표

엔드포인트에서 접근 토큰을 검증하고, 보드 멤버십을 확인한 뒤 openDirectConnection으로 문서를 연다. 경로는 D7, 확장은 D8을 따른다. 도구 없이 빈 목록으로 연결까지 되면 끝이다.

## 선행 결정

D7, D8

## 완료 기준

- [ ] spec 공통 완료 기준 전부
- [ ] 담당 행의 Then이 실제로 보인다
- [ ] 새 로직 최소 1테스트

## 파일 포인터

sync/src/server.ts:79, membership.ts, internalServer.ts

## 구현 메모
- 병렬 경계 (2026-10-18, 메인 · 웨이브 4): n1 수정·n7과 같은 워킹트리에서 동시에 돈다. n4 몫은 sync/와 shared/doc-model이다. 토큰 검증은 n3이 만든 introspect를 쓴다. 서버 변경이 꼭 필요하면 server/src/main/kotlin/com/moss/server/mcp/ 아래 새 파일과 Application.kt 등록 한 줄만 쓴다(server oauth/ 패키지는 n7 몫). web/src/state는 n1 몫이다. gradle은 n7과 build 디렉터리가 겹치니 격리 복사본에서 돌린다. 커밋은 자기 파일만 지정해 add한다.
