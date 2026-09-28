# n5-sync-hocuspocus — Hocuspocus 동기화 서버

> 자기완결 브리프. runner는 `docs/specs/FEAT-collab-auth.md`와 이 파일만 본다. 진행·상태는 이 파일에만 쓴다.

**deps**: n4
**상태**: done (2026-09-28)

## 문제

공유 보드의 Yjs 업데이트를 중계·병합·저장할 서버가 필요하다. D6.

## 목표

`sync/` Hocuspocus가 Ktor 보드 토큰을 검증해 연결을 받고 Postgres에 문서 스냅샷을 저장한다.

## 작업

1. 레포 루트 `sync/`에 Hocuspocus(Node, bun 실행)를 만들고 docker-compose에 추가한다.
2. `onAuthenticate`: n4가 서명한 보드 토큰을 같은 키로 검증한다. 문서 이름 = boardId.
3. `@hocuspocus/extension-database`로 Postgres `documents` 테이블에 스냅샷 저장. 10MB 초과 쓰기 거절.
4. n4가 공유 해제·내보내기 때 부를 내부 HTTP `POST /internal/close/{boardId}`를 둔다. 해제 뒤 도착한 업데이트는 버린다.

## 완료 기준

- [x] spec 공통 완료 기준 전부 (동기화 노드: `cd sync && bun test` 25개 pass)
- [x] `cd sync && bun test` 통과: 잘못된 토큰 거절, 두 클라이언트 업데이트 수렴, 해제 뒤 업데이트 무시
- [x] `docker compose up -d` 뒤 두 클라이언트가 같은 값으로 수렴하는 스크립트 1개 — `sync/scripts/converge.ts` (기동은 미검증)
- [x] 실경로: 프로덕션 엔트리포인트(`src/index.ts`)를 임베디드 Postgres로 띄워 WS 인증→수렴→`documents` 저장→해제 close까지 관통 확인

## 결산

**만든 것** — 레포 루트 `sync/` (Hocuspocus 3.4.4, bun 런타임, TypeScript).

- `src/auth.ts`: n4 보드 토큰 검증(HS256, issuer `moss`, `typ=board`, `sub`, `boardId`, 만료). `JWT_SECRET` 32바이트 필수.
- `src/membership.ts`: 매 연결마다 Postgres `members(board_id,user_id)` 존재 확인 (n4 보안 P1, AC-14). Postgres가 죽으면 연결 거절 (§7 실패 모드).
- `src/documentStore.ts`: `documents(name text pk, data bytea, updated_at bigint)` 테이블을 n5 마이그레이션으로 생성. `@hocuspocus/extension-database`의 fetch/store에 연결. 테스트용 `MemoryDocumentStore` 포함.
- `src/guardedStore.ts`: 10MB 초과 쓰기 거절 + 해제 뒤 도착한 업데이트 무시.
- `src/server.ts`: `onAuthenticate`가 토큰 검증→문서명(boardId) 일치→멤버 확인. 성공 시 context `{userId, boardId}`. `closeBoard(boardId, userId?)`가 연결을 close code 4403(`Forbidden`)으로 끊고, board 단위면 revoke 표시. ws `maxPayload`도 10MB로 제한.
- `src/internalServer.ts`: 별도 포트(기본 1235)에 `POST /internal/close/{boardId}[?userId=]` — n4 `SyncCloseClient` 계약.
- `src/index.ts`: 부팅 시 마이그레이션, SIGINT/SIGTERM 정리.
- `docker-compose.yml`에 `sync`(1234, 내부 1235) 추가, server `SYNC_INTERNAL_URL` 기본 `http://sync:1235`.
- `sync/Dockerfile`, `sync/scripts/converge.ts`.
- 테스트 25개: auth 8, guardedStore 4, PostgresDocumentStore(임베디드 PG, Docker 불필요) 4, server 수렴·거절·해제 5, internalServer 3.

**갭**
- `docker compose up` 기동은 Docker가 없어 미검증. Dockerfile은 `bun install --frozen-lockfile --production` 기반.
- `scripts/converge.ts`는 y-websocket이 아니라 `@hocuspocus/provider`를 쓴다 — Hocuspocus는 자체 WS 프로토콜이라 y-websocket 클라이언트가 붙지 않는다. 실제 클라이언트 경로(n7과 동일)를 탄다.
- 10MB 거절 시 클라이언트의 "보드가 너무 커요" 표시는 n7 몫. n5는 쓰기 거절(store 건너뜀/에러, ws 프레임 상한)까지.
- 내부 제어 엔드포인트는 인증이 없다 — compose에서 호스트로 노출하지 않고 sync 네트워크 안에서만 닿는다. n4의 `SyncCloseClient`도 인증을 보내지 않는다.

**가정**
- 스냅샷 테이블 이름·모양은 노드 브리프의 `documents`를 따랐다. spec §14는 `board_docs(board_id, snapshot bytea, updated_at)`로 적혀 있어 이름이 다르다 — 코드가 다른 노드와 안 맞으면 여기만 바꾸면 된다.
- 보드 단위 해제 후 재공유로 멤버가 다시 생기면, 성공한 `onAuthenticate`가 revoke 표시를 지운다(§8 local→shared 재전이).
- `board_members`가 아니라 n4 실제 테이블명 `members`를 읽는다.

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `docs/specs/FEAT-collab-auth.md` | D6, §7 경계 조건 실패 모드·공유 해제 중 편집 |

## 구현 메모

- n4 리뷰 보안 P1 (2026-09-28): 보드 토큰은 1시간짜리 stateless JWT라 내보낸 편집자가 보관한 토큰으로 재접속할 수 있다. `onAuthenticate`에서 토큰 검증 뒤 Postgres `members`에 (boardId, sub) 행이 아직 있는지 매 연결마다 확인한다. 없으면 거절. AC-14.
- n4 계약: 보드 토큰 issuer `moss`, 클레임 `typ=board`, `sub`, `boardId`, 키 `JWT_SECRET`(기본값 없음, 32바이트 이상). 스냅샷 테이블은 n5 마이그레이션이 만든다. 종료 훅 `POST /internal/close/{boardId}[?userId=]`.

