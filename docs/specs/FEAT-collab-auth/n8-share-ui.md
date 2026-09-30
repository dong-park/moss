# n8-share-ui — 공유 팝오버와 멤버 메뉴

> 자기완결 브리프. runner는 `docs/specs/FEAT-collab-auth.md`와 이 파일만 본다. 진행·상태는 이 파일에만 쓴다.

**deps**: n6, n7
**상태**: done (2026-09-28)

## 문제

사용자가 보드를 공유하고 멤버를 관리할 화면이 필요하다. 시안 v3.

## 목표

우상단 공유 아이콘·아바타·팝오버로 공유 시작, 링크 복사, 재발급, 내보내기, 공유 해제가 된다.

## 작업

1. `Header.tsx` 우상단에 공유 아이콘과 참여자 아바타를 둔다.
2. 팝오버 로그인 전: '함께 쓰기', '이 보드만 서버에 올라가요.', Google 버튼. 로그인 후: 링크 복사 한 줄과 멤버 이름, 소유자에만 역할 표시.
3. 공유 시작 시 이 보드의 Y.Doc만 서버로 올리고 상태를 shared로 바꾼다.
4. 멤버 이름을 누르면 메뉴: 내보내기, 링크 재발급, 공유 해제(소유자만). 편집자는 나가기만.
5. 한도 초과 문구 '이 보드는 자리가 다 찼어요'.

## 완료 기준

- [x] spec 공통 완료 기준 전부 — 전체 스위트 987/991 통과. 실패 1건은 기준선 `Canvas.virtualization` (n8 무관)
- [x] cd web && bun run test (기준선 1건 제외 green) && bunx tsc --noEmit && 새 파일 eslint 0
- [x] AC-4: 공유 2클릭(아이콘→Google)·`onStartShare(b1)` 1회·`share` API 1회(b1) 테스트
- [x] AC-6·AC-15: 재발급 토큰 교체·멤버 유지, 멤버 20명 자리 문구 테스트
- [x] 실경로: 테스트가 프로덕션 컴포넌트(ShareControl→SharePopover→MemberMenu)를 그대로 탄다. Ktor·GIS 실호출만 API 주입으로 대체 — 갭

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/components/workspace/Header.tsx` | 우상단 위치 |
| `/Users/donghwan/docs/1-life/canvas/moss-collab/mock.html` | 시안 v3 ①~③ |

## 결산

**만든 것**
- `web/src/state/share/` — `types.ts`(BoardMember·ShareStatus·MEMBER_LIMIT), `api.ts`(n4 `share`·`unshare`·`reissueInvite`·`removeMember`·`myBoards` 클라이언트), `link.ts`(`/j/{token}?name=&owner=`), `store.ts`(zustand `useShare` + `configureShare` 주입), `index.ts`.
- `web/src/components/share/` — `ShareIcon`, `MemberAvatar`(색 8개·아바타 줄), `MemberMenu`(내보내기·재발급·해제/나가기), `SharePopover`(로그인 전 Google / 후 링크 복사·멤버), `ShareControl`(아이콘·아바타·팝오버 진입점).
- `Header.tsx`에 현재 보드(시스템 보드 제외)일 때 `ShareControl` 배선. `collab.share.*` i18n 키.
- 테스트 11개 (api 5, AC-4 3, AC-6 2, AC-15 1).

**계약 (n7·n9)**
- `ShareControl` props: `onStartShare(boardId)`·`onLeaveBoard(boardId)` — 기본 no-op. n7은 전자에 Y.Doc 업로드를, n9는 후자에 로컬 사본 정리를 꽂는다.
- `members` prop으로 awareness/계정 목록을 넘긴다. 없으면 공유 시작 후 소유자만 보인다.
- 토큰은 `useAuth.ensureSession()`이 보장. 보드 토큰(`POST /boards/{id}/token`)은 n7 몫이라 이 클라이언트에 넣지 않았다.

**가정 / 갭**
- n4에 멤버 목록 엔드포인트가 없어 팝오버는 주입된 `members`만 그린다. 실제 목록은 n9의 `/me/boards`·awareness가 채워야 한다.
- 역할 기본값은 소유자. n9가 `BoardSummary.role`을 넘기기 전까지 편집자 화면도 소유자 메뉴를 보인다(§8 소유자 이전 없음 전제).
- 참여자 색은 n7의 `--collab-*` CSS 변수 대신 n8이 상수 8개를 들고 있다 — n7이 변수를 정의하면 맞춘다.
- Ktor·GIS 실호출 경로 미검증(주입 대체). 실 링크 복사는 jsdom clipboard 부재로 조용히 실패.

