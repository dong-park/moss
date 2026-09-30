# n9-membership-lifecycle — 공유 해제·내보내기·다른 기기

> 자기완결 브리프. runner는 `docs/specs/FEAT-collab-auth.md`와 이 파일만 본다. 진행·상태는 이 파일에만 쓴다.

**deps**: n8
**상태**: done (2026-09-28)

## 문제

D11·D13: 해제되면 편집자 사본을 지우고, 로그인한 다른 기기에는 공유 보드가 떠야 한다.

## 목표

revoked 신호나 연결 거절을 받으면 그 보드의 로컬 사본이 0건이 되고 알림이 한 번 뜬다. 로그인하면 `GET /me/boards`의 공유 보드가 이 기기에 열린다.

## 작업

1. 연결 거절·해제 신호를 받으면 y-indexeddb 문서와 Dexie 파생 행을 지우고 '공유가 끝난 보드예요'를 한 번 띄운다.
2. 소유자 기기에서는 revoked → local로 돌리고 보드를 남긴다.
3. 로그인 직후와 앱 시작 때 `GET /me/boards`로 공유 보드를 받아 목록에 추가한다. 혼자 쓰는 보드는 건드리지 않는다.

## 완료 기준

- [x] spec 공통 완료 기준 전부 — 웹 `bun run test` 1077/1081(기존 `Canvas.virtualization` 1건만 red), 서버 `./gradlew test` 통과
- [x] cd web && bun run test && bunx tsc --noEmit && bun run lint — lint는 기존 `ExportModal.tsx:39` 1건만 red(n9 무관)
- [x] AC-13·AC-14: 해제·오프라인 내보내기 뒤 IndexedDB 해당 행 0건 테스트 — `membership.test.ts` 실제 y-indexeddb 재오픈 0건 + Dexie 파생 행 0건
- [x] AC-17: 공유 2개는 10초 안에 뜨고 혼자 쓰는 3개는 안 뜨는 테스트 — `membership.test.ts`
- [x] 실경로: docker compose 풀스택(postgres+Ktor+sync)에서 실제 해제를 관통 — Hocuspocus 클라이언트가 스택에 붙고, `DELETE /boards/{id}/share`(Ktor) → 내부 close(sync) → 클라이언트 close code **4403** 수신 ALL PASS(218ms). `GET /boards/{id}/members`·`/me/boards`도 실제 Ktor+Postgres에 민트 JWT로 관통. 웹 수명주기는 실제 Dexie·y-indexeddb로 관통. Google 실로그인만 미검증

## 결산

**만든 것**

- 서버: `GET /boards/{id}/members`(멤버만) — `MemberDto(id,name,avatar,role)`, `BoardRepository.membersOf`(참여 순). `MembershipTest`에 목록·403 테스트 2개.
- **해제 신호 실경로 수리(호출자 전달)**: n7의 `connection.close(Forbidden)`은 reason 문자열만 보내 클라이언트가 1000으로 재구성했다 → sync `closeConnections`가 raw `webSocket.close(4403,"revoked")`로 바꿔 4403이 실제 도달. `sync/test/server.test.ts` revoke·kick에 close code 4403 단언을 추가. 또 Ktor `SyncCloseClient`가 Java 기본 HTTP/2(h2c upgrade)로 보내 Node 내부 서버가 응답하지 못하고 2초 타임아웃 → `HttpClient.Version.HTTP_1_1`로 고정(docker prove로 확인).
- **재연결 중단(호출자 전달)**: `collab/store.ts`의 onClose가 4403에서 error만 세우면 provider가 자동 재연결을 무한 반복했다 → onClose가 `epoch++`·`teardown()`(destroy)로 끊고 `boardId=null`, `revokedBoardId`를 남긴다. `CollabSession`이 `revokedBoardId`를 보고 `handleBoardRevoked`를 한 번 잇는다(일시적 close 1000은 세션 유지). n7의 onClose 해제 처리를 n9가 인수했다.
- `web/src/state/membership.ts` — `handleBoardRevoked`(사본 삭제+한 번 알림), `leaveBoard`, `syncMyBoards`(`/me/boards` 복원·원격 사본 정리), `purgeLocalBoardCopy`(y-indexeddb+notes·connections·embeddings·trash·boards). `web/src/state/ydoc/activeDoc.ts`에 `deleteBoardDoc`(clearDocument).
- `Board.remote`(비인덱스 optional) — `/me/boards`로 생긴 보드 표시. `SharedBoard`에서 제외(기기 로컬).
- `ShareControlMount` — store의 role·members 주입, `onLeaveBoard`=leaveBoard. `SharePopover` — 링크 없으면 "링크 새로 만들기" 명시 버튼.
- `share/store.ts` — 보드별 `busyByBoard`·`errorByBoard`, startShare/reissue in-flight 가드, `restoreShared`(토큰 보존)·`setLocal`·`forgetBoard`·`loadMembers`. `share/api.ts`에 `members`.
- `CollabSession` — 로그인 시 `syncMyBoards`, `collab.error==="revoked"`면 `handleBoardRevoked`.
- 테스트 13개: `membership.test.ts`(AC-13·14·17 6), `share/store.test.ts`(가드·복원·멤버갱신 6), `ShareControl.test.tsx`(링크 새로 만들기 1).

**계약 (n10·n11)**

- `showMembers`의 role/members 출처는 `useShare.byBoard[boardId]`다. `/me/boards`가 role을, `GET /boards/{id}/members`가 목록을 채운다.
- 편집자 "나가기"는 기기 사본만 지운다 — 서버 자격을 지우는 API가 없다(스펙 D10에 자기 탈퇴 없음). 서버 멤버 행은 소유자 내보내기로만 사라진다.

**갭 / 호출자가 정할 것**

- **막는 갭(중요)**: 로컬 보드 id는 `b-…`(workspace `createBoard`)인데 Ktor·sync는 보드 id를 UUID로 요구한다(`parseUuid`, `board_id uuid`, sync `internalServer` uuid 검사). 그래서 **소유자가 혼자 쓰던 보드를 공유하는 경로(AC-4·AC-6·AC-13 소유자측)는 실서버에서 400으로 실패**한다. n7/n8도 같은 이유로 실경로 미검증이었다. 편집자·다른 기기 경로(`/me/boards`가 주는 UUID 보드)는 이 노드에서 정상이다. 고치려면 ① 클라이언트 보드 id를 UUID로 바꾸거나(기존 `b-…` 보드는 남는 반쪽 fix) ② 서버 board_id를 text로 옮기는 V5 마이그레이션이 필요하다 — 둘 다 이 노드 범위 밖이라 손대지 않았다.
- docker compose 풀스택 해제 관통은 별도 프로젝트명(`-p moss-n9prove`)·호스트 포트로 격리해 확인했다. 워크트리 compose 프로젝트명이 기본 `moss`로 같아 병렬 runner가 볼륨·포트를 공유한다 — 함께 돌리려면 `COMPOSE_PROJECT_NAME`/볼륨 분리가 필요하다. Google 실로그인은 미검증(테스트는 민트 JWT).
- `syncMyBoards`는 `/me/boards` 실패를 조용히 삼킨다(오프라인). 다음 인증 상태 변화 때 재시도한다 — 명시 재시도 버튼은 없다.

## 구현 메모


- n8a 결과 (2026-09-28): n4에 `GET /boards/{id}/members` 가 없다 — 팝오버 멤버 목록용으로 이 노드에서 서버에 추가한다. 역할 기본값이 owner 라 BoardSummary.role 을 넘겨야 편집자 화면이 맞다. `onLeaveBoard` 주입도 이 노드.

- n8a 정확성 리뷰 (2026-09-28, 병합 뒤 발견): (1) 공유 시작 더블클릭이면 초대 재발급이 2번 → 토큰 경쟁. startShare 보드별 in-flight 가드, Google 버튼도 클릭 즉시 busy. (2) 새로고침하면 byBoard 가 local 로 초기화돼 "공유 시작"이 다시 보이고 누르면 기존 링크를 폐기한다 → 공유 상태는 `/me/boards` 로 복원, 이미 shared 면 재발급하지 않는다. 서버는 초대 토큰 해시만 저장하므로 옛 링크는 다시 못 보여준다 — 링크가 없으면 "링크 새로 만들기"를 명시 버튼으로. (3) busy/error 를 보드별 맵으로. (4) 내보내기 성공 시 멤버 목록 즉시 갱신.
