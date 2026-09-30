# n4-server-ktor — Ktor API 서버와 Postgres

> 자기완결 브리프. runner는 `docs/specs/FEAT-collab-auth.md`와 이 파일만 본다. 진행·상태는 이 파일에만 쓴다.

**deps**: 없음
**상태**: done (2026-09-28)

## 문제

로그인·보드 멤버·토큰 발급을 맡을 백엔드가 없다. D5·D7에 따라 Ktor와 Postgres로 직접 만든다.

## 목표

`server/` Ktor 앱이 docker-compose로 뜨고 Google 로그인, JWT 발급·갱신, 보드·멤버·초대 API를 제공한다.

## 작업

1. 레포 루트에 `server/`(Ktor, Gradle Kotlin DSL)와 `docker-compose.yml`(postgres, server)을 만든다.
2. 테이블: users, boards(id, owner_id, state), members(board_id, user_id, role), invites(board_id, token, revoked_at), files(메타만). 마이그레이션은 Flyway.
3. `POST /auth/google`: Google ID 토큰 검증 후 액세스 JWT 15분·리프레시 JWT 30일 발급. `POST /auth/refresh`.
4. `POST /boards/{id}/share`, `DELETE /boards/{id}/share`, `POST /boards/{id}/invites`(재발급), `POST /invites/accept` (본문 `{"token"}` — 토큰이 접속 로그에 남지 않게), `DELETE /boards/{id}/members/{userId}`, `GET /me/boards`, `POST /boards/{id}/token`(보드 토큰 1시간).
5. 멤버 20명 한도와 역할 규칙을 서버에서 검사한다. 상태 모델 §8의 불가능한 조합을 막는다.
6. `GET /health`.

## 완료 기준

- [x] spec 공통 완료 기준 전부 (서버 노드: `cd server && ./gradlew test` 통과, 새 로직마다 테스트)
- [x] `cd server && ./gradlew test` 통과. 초대 수락·재발급·내보내기·한도·역할 거절 테스트 포함
- [x] 테스트 DB는 Docker 없이 도는 임베디드 Postgres(zonky embedded-postgres 2.2.2, PG 18.6)
- [x] `docker-compose.yml`은 작성만 한다. `docker compose up` 기동은 미검증으로 결산에 기록
- [x] `./gradlew run` 후 `curl -fs localhost:8080/health` 성공. Postgres는 임베디드로 띄운다
- [x] Google 검증은 테스트에서 가짜 검증기로 주입하되, 실키 경로는 결산에 갭으로 기록
- [x] 실경로: 통합 테스트가 프로덕션 Ktor 모듈(`mossModule`)을 그대로 탄다. Google 실경로만 갭

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `docs/specs/FEAT-collab-auth.md` | §4 기본값, §8 상태 모델, AC-5·6·13·14·15·17 |

## 결산

**만든 것** — `server/` Gradle Kotlin DSL + Ktor 3.3.3, Exposed 0.61, Flyway 13.8, HikariCP, java-jwt, google-api-client. 루트 `docker-compose.yml`(postgres+server) + `server/Dockerfile`.

- 엔드포인트 전부 구현: `/health`, `/auth/google`, `/auth/refresh`, `/boards/{id}/share`(POST·DELETE), `/boards/{id}/invites`, `/invites/{token}/accept`, `/boards/{id}/members/{userId}`, `/me/boards`, `/boards/{id}/token`.
- 테이블 5개 + 제약: `members.role` check, 보드당 owner 1명 partial unique index, FK cascade, `boards.state='shared'` check.
- 한도: 초대 수락 시 보드 행 `for update` 잠금 뒤 멤버 수 검사 → 21번째 409 "이 보드는 자리가 다 찼어요".
- 역할: 소유자만 share/invite/kick/revoke. 편집자 revoke 403, 소유자 자기 kick 400.
- 만료 링크: 재발급이 활성 초대를 revoke하고 새 토큰 발급. 옛 토큰 수락 410, 기존 멤버 자격 유지 (AC-6).
- 테스트 17개 전부 통과 (`./gradlew test`). 임베디드 Postgres. `./gradlew run` + `curl /health` 200 확인.

**n5 계약 (보드 토큰)** — `JWT_SECRET` 공유, issuer `moss`, `typ=board`, `sub=userId`, `boardId` 클레임, exp 1시간. n5의 `onAuthenticate`가 이걸 검증한다.

**n5 계약 (연결 종료 훅)** — n4가 `SYNC_INTERNAL_URL` 설정 시 `POST {base}/internal/close/{boardId}`(쿼리 `?userId=` 선택)를 best-effort로 부른다. 미설정이면 건너뛴다(n4가 n5보다 먼저라 테스트는 미설정).

**갭**
- `docker compose up` 기동은 Docker가 없어 미검증 (작성만). Dockerfile은 `gradle installDist` 기반.
- Google 실 ID 토큰 경로 미검증 — 테스트는 `FakeGoogleVerifier` 주입. 프로덕션 검증기는 `GoogleIdTokenVerifier`.
- `state` 컬럼 값은 `shared` 하나뿐. `revoked`는 행 삭제(§8: "revoked인데 서버에 문서 행이 남아 있으면 안 됨")로 표현.

**가정**
- `POST /boards/{id}/share`는 멱등(같은 소유자 재호출 시 이름만 갱신), 링크 발급은 별도 `POST /boards/{id}/invites`. 초대 토큰은 원문을 저장하지 않고 SHA-256 해시만 저장(재조회 불가).

## 구현 메모

- 확인된 사실 2026-09-28: `java` 17.0.14 있음. Docker·OrbStack 없음. Gradle 8.14 설치됨 — wrapper 생성함.
- 작업 위치는 워크트리 `/Users/donghwan/poc/moss-n4/moss` (git 루트는 한 단계 위), 브랜치 `feat/collab-auth-n4`. `server/`와 루트 `docker-compose.yml`만 만든다. `web/`은 건드리지 않는다.
