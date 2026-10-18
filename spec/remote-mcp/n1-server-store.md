# n1 — 서버 저장 전환

> 자기완결 브리프. runner는 상위 spec + 이 파일만 본다. 진행 메모는 이 파일에만 쓴다. `**상태**:` 줄은 손으로 고치지 않는다 — 멈추면 `spec-board node block`, 사람 확인이 필요하면 `spec-board node review`.

**agent**: runner
**id**: RM-1
**상위**: spec/remote-mcp/spec.md
**deps**: 없음
**상태**: 아직 안 함
**담당 행**: T1, T2
**사람 확인**: 불필요

## 문제

- 지금은 공유한 보드만 서버에 올라간다(isSharedBoard, POST /boards/{id}/share).
- MCP가 개인 보드를 읽으려면 모든 보드가 서버에 있어야 한다.

## 목표

로그인하면 보드가 sync 문서로 저장된다. 공유 동작은 멤버 초대만 남는다. 로컬 보드 업로드와 로그아웃 처리는 D1을 따른다. 사용자당 상한은 D2를 따른다.

## 선행 결정

D1, D2

## 완료 기준

- [ ] spec 공통 완료 기준 전부
- [ ] 담당 행의 Then이 실제로 보인다
- [ ] 새 로직 최소 1테스트

## 파일 포인터

web/src/state/share/api.ts, attachments.ts, server BoardRoutes.kt, sync documentStore.ts

## 구현 메모
- 병렬 경계 (2026-10-18, 메인): n1·n2·n3이 같은 워킹트리에서 동시에 돈다. Flyway 마이그레이션이 필요하면 V7__ 하나만 쓴다(V8은 n3 몫). server의 Application.kt·AppConfig.kt는 n3 몫이라 고치지 않는다. sync는 documentStore.ts·guardedStore.ts까지만, sync/src/server.ts는 n2 몫이다. 커밋은 자기 파일만 지정해 add한다.
