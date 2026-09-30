# n7-client-sync — 공유 보드 연결과 Awareness

> 자기완결 브리프. runner는 `docs/specs/FEAT-collab-auth.md`와 이 파일만 본다. 진행·상태는 이 파일에만 쓴다.

**deps**: n23, n5, n6
**상태**: done (2026-09-28)

## 문제

공유 보드는 Hocuspocus에 붙어야 하고 커서·선택·드래그를 Awareness로 흘려야 한다. D4.

## 목표

shared 보드는 HocuspocusProvider로 연결되고, 상대 커서·이름표·선택 테두리·끄는 메모가 실시간으로 보인다.

## 작업

1. shared 상태 보드에 `@hocuspocus/provider`를 붙인다. 토큰은 n6에서, 보드 토큰 만료 시 재발급 후 재연결.
2. Awareness 상태: user(이름·색), cursor, selection, dragging{noteId,x,y,rotation}. 초당 20~30회로 제한.
3. 캔버스에 원격 커서·이름표·1.5px 선택 테두리·끄는 메모 잔상을 그린다. 색은 시스템 색 8개를 접속 순서로.
4. 오프라인 표시는 `network.ts`의 온라인 상태를 쓴다. 편집은 막지 않는다.

## 완료 기준

- [x] spec 공통 완료 기준 전부 — `bun run test`는 base의 `Canvas.virtualization` 1건·lint는 `ExportModal.tsx:39` 기존 실패만 red (n7 변경과 무관)
- [x] cd web && bunx tsc --noEmit 통과, 새·수정 파일 eslint 0
- [x] AC-7: 끄는 동안 Y.Doc 쓰기 0건·놓을 때 1건 — 기존 `storeOnYjs.test.ts` D4 + n7 Awareness 발행이 문서를 건드리지 않음 테스트
- [x] AC-8·AC-10·AC-11: docker-compose(postgres+sync) 위 두 `@hocuspocus/provider` 클라이언트로 prove — `web/scripts/collab-prove.ts`. 커서 p95 23.0ms(20회), 드롭 수렴 확인
- [x] 실경로: prove가 프로덕션 provider 경로를 탐. 단위 테스트는 가짜 provider 주입(정상 seam)이고, 실경로는 prove가 관통

## 결산

**만든 것**

- `web/src/state/collab/provider.ts` — `@hocuspocus/provider` 3.4.4 얇은 래퍼. 테스트 주입용 `CollabProviderFactory`. `token`은 async 함수(재연결마다 새 토큰), `onStatus`·`onAuthenticationFailed`·`onClose(4403)` 노출.
- `web/src/state/collab/awareness.ts` — Awareness states → `PresenceParticipant[]`. 자기 자신 제외, clientId 정렬 순서로 색 배정(모든 화면이 같은 색), 모양 검증(원격 값 신뢰 안 함).
- `web/src/state/collab/store.ts` — zustand `useCollab`. `connect`/`disconnect`/`setUserName`/`publishCursor`/`publishSelection`/`publishDragging`. 보드 토큰 캐시(만료 30초 전 재발급, AC-11), 중복 connect 합침, connect 경쟁 epoch 가드. 커서·드래그는 `createThrottle`로 초당 25회.
- `web/src/state/collab/config.ts` — `NEXT_PUBLIC_MOSS_SYNC_URL`(dev `ws://localhost:1234`).
- `web/src/state/share/api.ts` — `POST /boards/{id}/token` 추가.
- `web/src/components/collab/CollabSession.tsx` — shared + 로그인일 때 연결, 아니면 disconnect. 오프라인은 연결 조건이 아니다(provider가 재연결).
- `web/src/components/share/ShareControlMount.tsx` + `app/page.tsx` — 우상단 공유 아이콘을 실제로 마운트(n8a의 Header는 미사용 dead code라 그대로 둠). `onStartShare`에 `useCollab.connect` 주입.
- `ShareControl.beginShare` — 서버 공유 행(멤버) 뒤에 업로드 훅을 부르도록 순서 수정. 보드 토큰이 멤버 확인을 요구해 순서가 틀리면 403.
- `Canvas.tsx` — world 레이어에 `DragGhost`·`RemoteSelection`·`RemoteCursors` 렌더, mousemove로 커서 발행, 선택·드래그를 Awareness로 발행.
- `components/presence/OfflineBadge.tsx` — `network.ts` `useOnlineStatus` + 세션 있음일 때만 "오프라인".
- `globals.css` `--collab-1~8`, i18n `collab.offline`.
- 테스트 18개: `state/collab/__tests__`(awareness 3, store 9), `components/collab/__tests__`(2), `components/presence/__tests__/OfflineBadge`(4).
- prove: `web/scripts/collab-prove.ts` — docker-compose 위 AC-8 수렴, AC-10 오프라인 병합, AC-11 토큰 재발급, 커서 p95. 2026-09-28 실행 ALL PASS.

**갭**
- 새로고침 뒤 shared 복원은 n9의 `GET /me/boards` 몫. 지금은 이 세션에서 공유를 시작한 보드만 `useShare.byBoard`에 shared로 남아 CollabSession이 붙는다.
- 10MB 초과 쓰기 거절 시 클라이언트 "보드가 너무 커요" 표시는 n5가 서버측 거절만 하고 클라이언트 신호를 주지 않아 미구현 — n5 갭 참조.
- 실제 Google 로그인·브라우저 2개 e2e는 미검증. prove는 provider 경로(웹과 같은 라이브러리)를 두 클라이언트로 관통했고, UI 렌더는 컴포넌트 테스트로 덮었다.
- `Header.tsx`는 어디서도 렌더되지 않는 dead code(n8a 잔재). n7은 `ShareControlMount`로 우상단에 직접 붙였다.

**호출자가 정할 것**
- 참여자 색을 "정렬된 clientId 순서"로 배정한다 — 진짜 접속 시각이 아니라 결정적 순서. 접속 순서를 엄밀히 쓰려면 Awareness에 join 시각을 실어야 한다.
- 멤버 목록(아바타·역할)은 n7이 채우지 않았다 — `ShareControl`은 `members`/`role` prop을 받지만 n9의 `/me/boards`·멤버 API가 공급한다. 현재는 공유 시작 직후 소유자만 보인다.

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/components/workspace/Canvas.tsx` | 원격 표시 레이어 위치 |
| `web/src/components/workspace/DraggableCard.tsx` | 드래그 좌표 소스 |
| `web/src/state/network.ts` | 온라인 상태 |

## 구현 메모


- n7a·n8a 결과 (2026-09-28): presence 컴포넌트(`components/presence`)와 공유 UI(`components/share`)는 준비됨. 이 노드가 provider 연결, Canvas 배선, `onStartShare`(보드 Y.Doc 업로드) 주입, 보드 토큰 `POST /boards/{id}/token` 호출, `--collab-1~8` CSS 변수 정리를 맡는다. selection 은 기하 포함 SelectionRect, 드래그 잔상 크기는 카드 기하로 대체.
