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
- [x] 새 로직 최소 1테스트

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
- 수정 (2026-10-18, runner n1 · wave-20261018-1530 고쳐줘 3건):
  - D9 → A: 소유자가 서버에 저장된 최상위 보드를 지우기 전에 서버 멤버 목록을 묻고, 소유자 말고 멤버가 있으면 "멤버 N명의 보드에서도 사라집니다" 확인 창(MemberDeleteConfirmDialog)을 띄운다. 확정하면 그 보드를 표시해 두고 실행 취소 기간이 지나면 멤버가 있어도 `DELETE /boards/{id}/share`로 서버 사본을 지운다. 거절하면 지우지 않는다. 멤버를 확인하지 못하면(오프라인) 수 없이 "다른 멤버의 보드에서도 사라질 수 있어요"로 묻는다. 확인을 거는 곳은 보드 목록 삭제(removeBoardWithUndo)와 홈의 보드 카드 삭제(remove·removeSelected) 둘이다. 선택 삭제에서 거절하면 선택 전체를 지우지 않는다. 확인 없이 지워진 보드(브리지 boards.delete 등)는 전처럼 소유자 혼자일 때만 서버 사본을 지운다.
  - 413 구분: 서버는 이미 오류 본문 `{error, message}`의 `error`로 `quota_exceeded`(계정 상한)와 `too_large`(파일 20MB·보드 500MB)를 나눠 보낸다(FileUploadTest·UserQuotaTest가 고정). 서버 코드는 바꾸지 않았다. 웹 AuthRequestError가 `code`를 들고 다니고(readErrorBody), 공유 API와 첨부 업로드가 채운다. `quota_exceeded`만 상한 안내·실패 표시로 가고, 그 밖의 413(too_large, 프록시가 낸 code 없는 413)은 "{서버 사유 또는 '파일이 너무 커요'}. 첨부를 서버에 올리지 못해 이 기기에서만 보여요."를 업로더에게만 띄우고 공유 문서에는 쓰지 않는다. 보드 등록의 too_large는 상한 안내 없이 다음 동기화가 다시 시도한다.
  - 경쟁(P2): 실패 표시를 참조 키 값에서 같은 `files` 맵의 별도 키 `!failed:<ref>`(값 `!quota_exceeded`)로 옮겼다. 참조 키 값은 언제나 fileId다. 성공한 업로드는 fileId를 쓰면서 실패 키를 지우고, 읽는 쪽은 fileId를 먼저 봐서 두 기기가 동시에 실패·성공을 써도 성공이 이긴다.
  - n5·n6 계약 메모(앞 메모를 대체): `files` 맵에서 `!`로 시작하는 키는 업로드 실패 표시이고 첨부 참조가 아니다. 첨부를 내려받는 도구는 이 키를 건너뛴다. `opfs:<file>` 키의 값은 fileId다.
  - 확인한 것: web `tsc --noEmit` 통과, 바꾼 파일 eslint 통과, web vitest 182파일 1475 통과(새 테스트 9개: D9 확인 후 되살아나지 않음·거절하면 안 지움·홈 카드 거절·홈 카드 확정·혼자면 묻지 않음·보드 too_large는 상한 안내 없음·25MB 이미지는 !quota_exceeded를 안 씀·code 없는 413·실패와 성공 동시 기록에서 성공이 이김). D9 확정 테스트는 확인 표시 검사를 빼면 실패하는 것을 확인했다. 전체 실행에서 mossBridge.test.ts의 DatabaseClosedError가 1건 났고 그 파일만 두 번 다시 돌리면 0건이다(지난 수정 때와 같은 정리 순서 문제). server·sync는 바꾸지 않아 gradle·sync 테스트는 다시 돌리지 않았다.
  - 갭: 실제 브라우저+서버+sync로 두 계정이 쓰는 보드를 소유자가 지우는 실경로, 25MB 이미지 업로드 실경로는 돌리지 못했다(테스트는 Ktor 계약을 가짜로 주입). 실행 취소 만료 때 `DELETE /share`가 오프라인으로 실패하면 다음 syncMyBoards가 보드를 되살린다 — 혼자 쓰는 보드에도 있던 문제이고 이번 범위 밖으로 두었다. too_large 첨부는 다른 기기에서 계속 '올리는 중'으로 보이고, 다음 백필이 같은 파일을 다시 올려 본다.
- 고쳐줘 (2026-10-18, 메인 · wave-20261018-1830 /review P1): 삭제 확인 표시 deleteConfirmed가 메모리에만 있어, unshare가 실패(오프라인)하거나 5초 안에 새로고침하면 syncMyBoards의 saveRemoteBoard가 보드를 되살린다(membership.ts:367·389·245). 확인한 보드 id를 영구 저장(Dexie settings 등)하고, syncMyBoards는 그 id를 되살리지 않고 unshare를 다시 시도하며, 성공하면 표시를 지운다. 실행 취소(workspace.ts:2374)는 표시를 지운다. 실패 후 새로고침·sync 경로를 테스트로 고정한다.
- 고쳐줘 (2026-10-18, 메인 · /review P2): too_large로 거절된 보드를 sync마다 조용히 재시도한다(membership.ts:534). 재시도를 멈추고 사용자에게 한 번 안내한다.
- 병렬 경계 (2026-10-18, 메인 · 웨이브 4): n4·n7과 같은 워킹트리에서 동시에 돈다. 고칠 파일은 web/src/state/membership.ts·workspace.ts·share/와 그 테스트, 필요한 확인 UI까지다. server·sync·설정 화면은 건드리지 않는다.
- 수정 (2026-10-18, runner n1 · 웨이브 4 고쳐줘 2건, 앞 runner의 미커밋 변경을 이어받아 완성):
  - P1 삭제 확인 표시 영구화: 확인한 보드 id를 Dexie settings.pendingServerDeletes에 둔다(메모리 deleteConfirmed 제거). syncMyBoards는 먼저 표시된 보드를 정리한다 — 서버에 이미 없으면 표시를 빼고, 실행 취소 기간이면 건드리지 않고 숨기고, 그 밖에는 `DELETE /boards/{id}/share`를 다시 시도해 성공하면 표시를 뺀다. 실패해도 그 보드는 되살리지 않는다. 로컬에 행이 다시 있는 보드는 평소처럼 다룬다. 실행 취소(보드 목록·파일함 두 경로)는 표시를 뺀다. 마이그레이션은 필요 없다(settings 한 행의 선택 필드).
  - P2 too_large 재시도 중단: 보드·파일함 등록이 413 too_large면 그 보드 id를 세션 메모리에 두고 같은 세션에서는 다시 올리지 않으며, "{서버 사유 또는 '보드가 너무 커요'}. 서버에 올리지 못한 보드는 이 기기에만 있어요."를 보드당 한 번 띄운다. 앱을 다시 열면 한 번 더 시도한다(보드에서 첨부를 지워 크기가 줄었을 수 있어서다). 고르기 창(registerBoards)에서는 실패로 세지 않는다.
  - 확인한 것: web `tsc --noEmit`·바꾼 파일 eslint 통과, web vitest 183파일 1482 통과. 새 테스트 5개(오프라인 실패 후 sync가 되살리지 않고 재시도·성공 시 표시 제거, 5초 안 새로고침 뒤 sync가 서버 사본 지움, 실행 취소 기간에는 sync가 건드리지 않음, 실행 취소가 표시 제거, 최상위 보드 too_large 한 번 안내·재시도 없음)와 기존 파일함 too_large 테스트를 새 동작으로 고쳤다. syncMyBoards의 숨김을 끄면 새 D9 테스트 3개가 실패하는 것을 확인했다. 전체 실행의 DatabaseClosedError 1건은 mossBridge.test.ts에서 나는 기존 정리 순서 문제다.
  - 갭: 실제 브라우저+서버+sync 실경로는 돌리지 못했다. 다른 멤버가 소유자 삭제 뒤 sync할 때 보드가 사라지는 것은 서버 사본이 지워진 뒤에야 보인다(오프라인 동안은 멤버에게 남는다).
- 다시 짜기 (2026-10-18, 메인 · 웨이브 4 /review P1 5건 묶음): 삭제 부활을 세 번째 덧대고도 옆 경로가 샌다. 혼자 쓰는 보드를 지우고 5초 안에 새로고침하면 되살아난다(membership.ts:497, 표시 없음). 삭제 표시가 계정과 무관해 다른 계정이 로그인하면 403을 받고 그 보드를 계속 숨긴다(:455, 보안·정합성 축 교차). mark·clear 동시 실행이 표시를 지운다(:407-419). removeBoard와 pendingBoardUndo 사이에 sync가 끼면 실행 취소 중에 서버 사본이 지워진다(workspace.ts:2357). 뿌리는 "syncMyBoards가 이 기기에서 지운 보드를 서버 목록만 보고 되살린다"이다.
  - 이렇게 다시 짠다: pendingServerDeletes와 cancelServerDeletes를 걷어 내고, "이 기기에서 이 계정이 지운 보드"를 계정별 한 목록(storage.ts의 deletedBoardIds를 userId별로 나누거나 같은 수명의 새 목록, 200개 상한에 걸려도 소유 보드 표시는 빠지지 않게)으로 둔다. syncMyBoards 한 지점에서 그 목록에 있는 보드는 되살리지 않는다. 내가 소유자면 실행 취소 기간이 아닐 때 unshare를 다시 시도하고 성공하면 목록에서 뺀다. 403·404면 목록에서 빼고 보통 보드처럼 다룬다(소유자가 아님/이미 없음). 일시 오류(네트워크·5xx)만 숨기고 재시도하며 console.warn에 id·status를 남긴다. 목록 갱신은 Dexie 트랜잭션이나 단일 큐로 읽고 쓴다. 실행 취소 기간 판정은 removeBoard보다 먼저 세운다(보드·파일함 두 경로). 멤버가 있는 보드는 D9 확인 뒤에만 목록에 들어가고, 지우기 직전 멤버를 다시 확인한다.
  - 테스트로 고정할 네 경우(정합성 축이 비어 있다고 한 것): 혼자 쓰는 보드 삭제 뒤 5초 안 새로고침, 표시가 남은 채 다른 계정 로그인, 표시·정리 동시 실행, 삭제 도중 sync. 처음 다시 짠 코드에서 되살림 방지를 끄면 이 테스트가 실패하는지 확인한다.
- 병렬 경계 (2026-10-18, 메인 · 웨이브 5): n5와 같은 워킹트리에서 동시에 돈다. 고칠 파일은 web/src/state/(membership.ts·workspace.ts·storage.ts·db/schema.ts)와 그 테스트, 확인 UI까지다. sync/·server는 건드리지 않는다. 커밋은 자기 파일만 지정해 add하고, 임시 인덱스(GIT_INDEX_FILE)를 쓰면 같은 셸 명령 안에서 add와 commit을 끝낸다.
- 수정 (2026-10-18, runner n1 · 웨이브 5 다시 짜기):
  - settings.pendingServerDeletes와 메모리 확인 표시를 걷어 내고, "이 기기에서 이 계정이 지운 보드"를 Dexie v7 새 테이블 `serverDeletes`(키 [userId+boardId], 값 membersConfirmed)에 둔다. 행 하나씩 쓰므로 표시·정리가 동시에 돌아도 서로 덮어쓰지 않고, 200개 상한이 없으며 정리되면 행이 빠진다. deletedBoardIds(주소 재진입 안내)는 그대로 둔다.
  - 표시는 보드 행을 지우기 직전에 남긴다: workspace.removeBoard(브리지 포함)와 파일함 cascade(하위 트리 전체). 로그인했을 때만 남기고, 편집자로 받은 최상위 보드는 서버에서 지울 수 없어 남기지 않는다. D9 확인은 confirmBoardDeletion이 메모리에 두었다가 표시의 membersConfirmed로 옮긴다.
  - 실행 취소 기간 판정은 행을 지우기 전에 세운다: removeBoardWithUndo와 cascade가 지우기 전에 보드 id를 붙들고(membership의 removing), 실행 취소 상태를 세운 뒤 놓는다. 실행 취소(두 경로)는 표시를 뺀다.
  - syncMyBoards는 settleServerDeletes 한 지점에서 이 계정의 표시만 본다. 서버에 없으면 표시를 빼고, 로컬에 행이 있으면 건드리지 않고, 그 밖에는 되살리지 않는다. 실행 취소 기간이 아니면 서버 사본 지우기를 다시 시도한다(부모도 지운 파일함은 부모 쪽 cascade에 맡긴다). 확인 없는 최상위 보드는 지우기 직전 멤버를 다시 묻고, 멤버가 있으면 표시를 빼고 보통 보드로 둔다. 403·404면 표시를 빼고 보통 보드처럼 되살린다. 네트워크·5xx만 숨긴 채 다음 동기화로 넘기고 console.warn에 id·status를 남긴다. undo 만료 경로(unshareRemovedSubBoards)도 같은 표시·같은 지우기 함수를 쓴다.
  - 확인한 것: web `tsc --noEmit`·바꾼 파일 eslint 통과, web vitest 183파일 1487 통과. 새 테스트 5개(혼자 쓰는 보드 삭제 뒤 5초 안 새로고침, 표시가 남은 채 다른 계정 로그인, 표시·정리 동시 실행, 보드 삭제 도중 sync, 파일함 삭제 도중 sync)와 기존 D9 테스트 4개를 새 저장소로 고쳤다. syncMyBoards의 숨김을 끄면 6개, 붙들기를 끄면 삭제 도중 테스트 2개, 표시를 계정 구분 없이 읽으면 다른 계정 테스트가 실패하는 것을 확인했다. v7 때문에 DB 버전·테이블 목록을 고정한 schema 테스트 4파일을 7로 고쳤다.
  - 갭: 실제 브라우저+서버+sync 실경로는 돌리지 못했다(Ktor 계약은 가짜 주입). 로그아웃 상태에서 지운 서버 보드는 표시가 없어 다음 로그인 sync가 되살린다. 실행 취소를 새 삭제로 덮어쓴 이전 보드는 그 세션에서 서버 사본을 바로 지우지 않고 다음 syncMyBoards가 지운다.
