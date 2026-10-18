# n6 — 쓰기 도구와 상한

> 자기완결 브리프. runner는 상위 spec + 이 파일만 본다. 진행 메모는 이 파일에만 쓴다. `**상태**:` 줄은 손으로 고치지 않는다 — 멈추면 `spec-board node block`, 사람 확인이 필요하면 `spec-board node review`.

**agent**: runner
**id**: RM-6
**상위**: spec/remote-mcp/spec.md
**deps**: n5
**상태**: 아직 안 함
**담당 행**: T4, T8, T9
**사람 확인**: 불필요

## 문제

- 쓰기는 자리와 폭을 자동으로 정해야 겹치지 않는다.

## 목표

메모 생성·수정·삭제, 연결 생성·삭제, 첨부 업로드 도구를 만든다. 요청당 변경 수와 분당 호출 상한을 둔다. 토큰 범위는 읽기쓰기 하나뿐이라(D4 → B) 범위 검사는 두지 않는다. 변경 출처 기록은 D6을 따른다.

## 선행 결정

D4, D6

## 완료 기준

- [ ] spec 공통 완료 기준 전부
- [ ] 담당 행의 Then이 실제로 보인다
- [ ] 새 로직 최소 1테스트

## 파일 포인터

mcp/src 도구 정의, server POST /boards/{id}/files

## 구현 메모
- 먼저 할 것 (2026-10-18, 메인 · wave-20261018-2100 /review, n5 후속): 쓰기 도구 전에 읽기 경로를 고친다.
  - search 전체 검색과 동시 요청이 sync를 멈출 수 있다(성능·보안 P1 교차). 사용자별 동시 MCP 요청 상한(예: 2, 넘으면 429)과 스냅샷 디코딩 전역 세마포어를 둔다. 검색 한 번이 읽는 스냅샷 총량에 상한(예: 30MB)을 두고, 닿으면 멈추고 안내한다. listBoards가 이미 증명한 멤버십은 보드마다 다시 묻지 않는다. 이 동시 상한은 이 노드의 쓰기 요청 상한과 같은 장치로 묶는다.
  - read_board는 MAX_READ_CHARS를 넘는 순간 쌓기를 멈춘다. 이름은 보드 한 줄 조회나 meta.name 한 곳에서만 얻고 재귀 목록 쿼리를 부르지 않는다. (성능·Devil P2)
  - board를 지정한 search는 requireMember로 권한을 판정하고, 200개 목록 상한은 표시에만 쓴다. list_boards가 목록을 잘랐으면 그 사실을 알린다. (유지보수 P1)
  - files 맵 키 규칙(opfs: 접두사, !failed: 키)을 @moss/doc-model로 옮기고 web/src/state/share/attachments.ts와 sync가 같이 가져온다. (Devil P1)
  - 읽기 도구 컨텍스트 타입에서 withBoard를 빼 읽기 경로를 타입으로 강제한다. sync의 @modelcontextprotocol/sdk 버전을 고정하거나 지원 프로토콜 버전을 테스트로 고정한다. (유지보수 P2)
- 병렬 경계 (2026-10-18, 메인 · 웨이브 6): n1 수정과 같은 워킹트리에서 동시에 돈다. n6 몫은 sync/, shared/doc-model, web/src/state/share/attachments.ts(키 규칙 import만)다. web/src/state/membership.ts·workspace.ts·storage.ts·db/schema.ts는 n1 몫이다. 임시 인덱스를 쓰면 같은 셸 명령 안에서 add와 commit을 끝낸다.
