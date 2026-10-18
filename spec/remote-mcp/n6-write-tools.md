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

- [x] spec 공통 완료 기준 전부 — sync 102개·doc-model 4개 통과, web tsc 통과. 실제 커넥터 증거는 아니다(n8 몫)
- [x] 담당 행의 Then이 실제로 보인다 — T4·T8·T9를 sync 테스트로 확인(헤드리스 provider·저장 스냅샷 기준, 실제 브라우저 화면 아님)
- [x] 새 로직 최소 1테스트

## 파일 포인터

mcp/src 도구 정의, server POST /boards/{id}/files

## 구현 메모

- 쓰기 도구 6개: create_note·update_note·delete_note(ids)·create_connection·delete_connection·upload_attachment (sync/src/mcpWriteTools.ts). 메모 종류는 text와 textbox만 만들고, 메모판·함 카드는 고치지도 지우지도 않는다.
- 자리는 기존 메모(메모판 제외) 사이 24px 간격을 두고 위쪽 왼쪽부터 격자(40px)로 찾고, 밴드(1600px)에 없으면 맨 아래에 놓는다. 폭은 text 240, textbox 320.
- 상한은 sync/src/mcpLimits.ts 한 곳: 사용자별 동시 요청 2(넘으면 429), 분당 호출 120, 분당 쓰기 30, 요청당 변경 20(넘는 몫은 적용하지 않고 오류로 알림, 적용된 몫은 유지). 분당 상한 오류에는 다시 시도할 시각(UTC)이 들어간다. 스냅샷 해석은 전역 4개 동시, 검색 한 번의 스냅샷 총량은 30MB.
- D6 → A: 메모·연결에 mcpClient·mcpAt을 적는다. NOTE_FIELDS 밖이라 web이 읽지도 쓰지도 않는다(UI 표시 없음). web에서 고친 뒤에는 updatedAt이 mcpAt보다 커진다.
- 보드 크기 한도: 변경 전에 현재 문서 크기 + 추가분이 maxDocumentBytes를 넘으면 거절한다(저장소가 넘친 스냅샷을 조용히 버리기 때문).
- 첨부 업로드는 sync가 Ktor POST /boards/{id}/files를 부른다. 이 경로는 웹 세션 접근 토큰만 받아서, sync가 JWT_SECRET으로 그 사용자 이름의 60초짜리 접근 토큰을 만들어 보낸다(mcpFiles.ts). 파일은 요청 본문 1MB 한도 때문에 약 750KB까지다. 첨부 메모는 text 메모의 이미지·파일 블록이고 files 맵에 opfs:mcp-… → fileId를 적는다.
- 읽기 경로(n5 리뷰 후속) 반영: 동시 요청 상한·스냅샷 세마포어·검색 30MB 상한, listBoards로 증명된 멤버십은 보드마다 다시 묻지 않음, read_board는 한도에서 쌓기를 멈추고 이름은 meta.name만 쓰며 목록 쿼리를 부르지 않음, board 지정 검색은 requireMember로 판정하고 200개 상한은 list_boards 표시에만 쓰며 잘렸다고 알림, files 맵 키 규칙(opfs: 접두사·!failed: 키)은 @moss/doc-model로 옮겨 web attachments.ts와 sync가 같이 쓴다, 읽기 도구 컨텍스트에서 withBoard를 뺐고(defineReadTool), sync의 MCP SDK를 1.32.1로 고정하고 지원 프로토콜 버전을 테스트로 고정했다.
- 남은 것: 실제 커넥터·브라우저 화면 확인은 n8. delete_note는 Yjs에서 바로 지워 사용자의 휴지통에 가지 않는다(D6 되돌리기 범위 밖).
