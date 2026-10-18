# n1 — 서버 저장 전환

> 자기완결 브리프. runner는 상위 spec + 이 파일만 본다. 진행 메모는 이 파일에만 쓴다. `**상태**:` 줄은 손으로 고치지 않는다 — 멈추면 `spec-board node block`, 사람 확인이 필요하면 `spec-board node review`.

**agent**: runner
**id**: RM-1
**상위**: spec/remote-mcp/spec.md
**deps**: 없음
**상태**: 진행
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
- 구현 (2026-10-18, runner n1): D1=A·D2=A를 그대로 따랐다.
  - 서버: 보드 100개(파일함 포함)·첨부 합계 1GB를 소유자 계정 기준으로 센다. 새 보드 행을 만들 때와 첨부 업로드 때 사용자 행을 잠가 확인하고 413 `quota_exceeded`로 거절한다(403은 웹이 로그인 풀림으로 읽는다). `GET /me/usage`가 현재 사용량·상한을 준다. 이미 있는 보드의 재등록은 상한 안이다. 상한 기본값은 BoardRepository 생성자 기본값이고 env로는 못 바꾼다(AppConfig는 n3 몫). 마이그레이션은 필요 없어 V7은 쓰지 않았다.
  - 웹: 로그인 상태에서 새 보드를 만들기 전에 `/me/usage`로 상한을 보고(canCreateBoard), 닿았으면 보드를 만들지 않고 안내만 띄운다. 만든 보드는 `registerNewBoards`가 초대 링크 없이 서버에 저장한다(공유 상태 shared = 서버 저장). 서버나 네트워크 오류면 막지 않고 로컬로 만든다.
  - D1: 처음 로그인한 계정은 UploadChoiceDialog에서 올릴 최상위 보드를 고른다(기본 선택 없음). 고르기를 끝낸 시각(settings.serverStoreSince[userId]) 이후에 만든 보드만 자동 저장되고, 고르지 않은 보드는 이 기기에만 남는다. 로그아웃은 로컬 사본을 지우지 않는다(기존 동작 그대로, 테스트로 고정). 다른 계정 보드가 남은 기기(AccountOwnerGuard mismatch)에서는 고르기를 열지 않는다.
  - 서버에 저장된 최상위 보드를 지우면(undo 만료 뒤) 소유자 기기가 서버 사본도 지운다. 안 지우면 /me/boards로 되살아나고 상한을 계속 차지한다.
  - 공유 팝오버는 서버에 있는 보드에서 초대 링크만 다룬다. 혼자 쓰는 보드는 아바타와 브레드크럼 "공유" 표시를 달지 않는다(멤버 2명 이상 또는 편집자일 때만).
- 확인한 것: web `tsc --noEmit` 통과, web vitest 전체 182파일 1460 통과, server 격리 복사본(HEAD+내 파일)에서 gradle test 전체 통과(UserQuotaTest 4개 포함). 같은 워킹트리에서 n3이 gradle을 동시에 돌리면 build 디렉터리가 겹쳐 NoClassDefFoundError가 난다 — 첫 기준선이 그래서 오염됐고 HEAD 복사본 기준선은 전부 통과다.
- 갭 / 확인 안 된 것: 웹↔서버를 실제로 붙인 실경로(브라우저 + 서버 + sync)는 돌리지 못했다. 웹 테스트는 Ktor 계약을 가짜로 주입했고 서버 테스트는 ktor testApplication + 임베디드 Postgres다. 파일함(함 카드) 만들기는 즉시 id를 돌려주는 흐름이라 상한 사전 차단을 못 건다 — 서버가 413으로 거절하면 그 파일함은 로컬에만 남는다. 오프라인에서 만든 보드는 다음 syncMyBoards에서 다시 올리지만, 첨부가 1GB를 넘기는 것은 업로드 때 서버가 거절하고 웹은 '올리는 중' 자리표시자를 유지한다(안내 없음). sync 쪽 코드는 건드리지 않았다.
- 고쳐줘 (2026-10-18, 메인 · wave-20261018-1100 /review P1): 협업자가 있는 최상위 보드를 소유자가 지울 때 서버 사본과 멤버 전원의 보드가 사라진다(web/src/state/membership.ts unshareRemovedSubBoards 경로). 소유자 혼자인 보드만 서버 사본을 지운다. 다른 멤버가 있는 보드는 n1 이전(c948ec1)과 같은 동작을 유지해 자동으로 공유 해제하지 않는다. 두 경우를 테스트로 고정한다.
- 고쳐줘 (2026-10-18, 메인 · /review P1): 상한 초과가 조용히 묻힌다. /me/usage가 실패해 로컬로 만든 보드든 파일함이든, registerNewBoards나 업로드가 413 quota_exceeded를 받으면 사용자에게 안내하고 그 보드는 이 기기에만 있다는 상태로 둔다. 첨부 업로드 413도 '올리는 중'에 머물지 않고 실패 안내로 바꾼다. 안내 경로를 테스트로 고정한다.
- 병렬 경계 (2026-10-18, 메인 · 수정 웨이브): n1·n2·n3 수정이 같은 워킹트리에서 동시에 돈다. gradle은 n3과 build 디렉터리가 겹치니 지난번처럼 격리 복사본에서 돌린다. 고칠 파일은 web/src/state/(membership.ts·workspace.ts·share/)와 관련 UI, server BoardRoutes·BoardRepository까지다.
- 수정 (2026-10-18, runner n1 · 고쳐줘 2건):
  - 삭제: 소유자가 지운 최상위 보드는 서버 `GET /boards/{id}/members`를 물어 소유자 말고 멤버가 없을 때만 서버 사본을 지운다. 다른 멤버가 있거나 멤버를 확인하지 못하면(오프라인) c948ec1처럼 그대로 둔다. 캐시된 멤버 목록은 늦을 수 있어 쓰지 않는다.
  - 보드 413: registerBoards(새 보드 자동 저장·고르기 창)와 shareSubBoards(파일함)가 413이면 "{서버 사유}. 서버에 올리지 못한 보드는 이 기기에만 있어요."를 띄우고 그 보드는 공유 상태가 아닌 채(로컬) 남는다. 다음 동기화가 다시 시도하되 같은 보드 안내는 세션에 한 번만 띄운다. 파일함은 413에서 나머지 시도를 멈춘다.
  - 첨부 413: 업로더 기기에 "저장 용량을 다 써서 첨부를 서버에 올리지 못했어요. 이 기기에서만 보여요."를 보드마다 세션에 한 번 띄우고, Y.Doc `files` 맵에 `!quota_exceeded`(UPLOAD_FAILED_QUOTA)를 적는다. 원본이 없는 기기는 새 상태 `failed`로 '올리지 못함 · 저장 용량 초과'(블록·이미지)나 사진 카드 실패 문구를 본다. 다음 백필이 다시 올리고 성공하면 fileId로 덮어쓴다.
  - n5·n6 계약 메모: `files` 맵 값이 `!quota_exceeded`면 fileId가 아니다. MCP 도구가 첨부를 내려받을 때 이 값을 건너뛰어야 한다.
  - 확인한 것: web `tsc --noEmit` 통과, web vitest 182파일 1466 통과(새 테스트 6개: 멤버 있는 보드 유지·멤버 확인 실패 시 유지·/me/usage 실패 뒤 413 안내 1회·파일함 413·첨부 413 failed 표시·백필 재시도). 첫 전체 실행에서 mossBridge.test.ts가 DatabaseClosedError 8건을 냈고 재실행에서는 0건 — 이번 변경과 무관한 정리 순서 문제로 본다. server·sync 코드는 이번에 바꾸지 않아 gradle·sync 테스트는 다시 돌리지 않았다.
  - 갭: 실제 브라우저+서버+sync로 두 계정이 같은 보드를 쓰는 상태에서 소유자 삭제, 1GB 초과 첨부를 붙인 실경로는 돌리지 못했다. 테스트는 Ktor 계약을 가짜로 주입했다.
- 고쳐줘 (2026-10-18, 메인 · wave-20261018-1530 /review P1): 다른 멤버가 있는 최상위 보드를 소유자가 지우면 로컬 행만 지워져 다음 syncMyBoards가 되살린다(membership.ts:362). D9 → A로 고친다: 지우기 전에 '멤버 N명의 보드에서도 사라집니다' 확인을 받고, 실행 취소 기간이 지나면 서버 사본을 지운다(DELETE /boards/{id}/share). 확인을 거절하면 지우지 않는다. 되살아나지 않는 것을 테스트로 고정한다.
- 고쳐줘 (2026-10-18, 메인 · /review P1): 모든 413을 저장 상한으로 읽는다(attachments.ts:141, membership.ts:479). 서버는 파일 20MB 초과·보드당 500MB 초과도 413(too_large)을 낸다. 웹 오류 객체(AuthRequestError 등)가 서버 응답 code를 들고 다니게 하고, quota_exceeded만 상한 안내와 !quota_exceeded 표시로, too_large는 '파일이 너무 커요' 안내로 나눈다. 25MB 이미지가 공유 문서에 !quota_exceeded를 쓰지 않는 것을 테스트로 고정한다. 서버 응답에 code가 없으면 서버 쪽 응답 본문에 code를 더한다(BoardRoutes 범위).
- 고쳐줘 (2026-10-18, 메인 · /review P2): !quota_exceeded 표시 경쟁(같은 첨부를 두 기기가 동시에 실패·성공으로 쓸 때 성공이 이기게)을 고친다.
