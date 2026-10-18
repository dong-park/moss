# n7 — 연결된 앱 설정 화면

> 자기완결 브리프. runner는 상위 spec + 이 파일만 본다. 진행 메모는 이 파일에만 쓴다. `**상태**:` 줄은 손으로 고치지 않는다 — 멈추면 `spec-board node block`, 사람 확인이 필요하면 `spec-board node review`.

**agent**: runner
**id**: RM-7
**상위**: spec/remote-mcp/spec.md
**deps**: n3
**상태**: 끝남
**담당 행**: T6
**사람 확인**: 불필요

## 문제

- 사용자가 에이전트 접근을 직접 끊을 수 있어야 한다.

## 목표

설정에 연결된 앱 목록을 보이고 해제 버튼을 둔다. 해제하면 서버가 해당 토큰을 폐기한다.

## 선행 결정

없음

## 완료 기준

- [ ] spec 공통 완료 기준 전부
- [x] 담당 행의 Then이 실제로 보인다
- [x] 새 로직 최소 1테스트

## 파일 포인터

web 설정 화면, server 토큰 폐기 API

## 구현 메모
- 병렬 경계 (2026-10-18, 메인 · 웨이브 4): n1 수정·n4와 같은 워킹트리에서 동시에 돈다. n7 몫은 웹 설정 화면(새 컴포넌트)과 server/src/main/kotlin/com/moss/server/oauth/ 패키지다. web/src/state/membership.ts·workspace.ts는 n1 몫, sync/는 n4 몫이다. gradle은 n4와 build 디렉터리가 겹치니 격리 복사본에서 돌린다. 커밋은 자기 파일만 지정해 add한다.
- 구현 (runner): 서버 GET·DELETE /oauth/grants는 n3에 이미 있어 서버는 손대지 않음. 웹은 계정 메뉴 '연결된 앱' → ConnectedAppsDialog. 테스트 3건. 전체 web 스위트에서 serverStore.test.ts 1건(too_large/quota 안내)이 실패 — n1 몫의 미커밋 변경 영역이라 건드리지 않음. spec 공통 완료 기준 중 실서버 확인은 n8 몫.
