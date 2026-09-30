# n6-client-auth — 웹 로그인과 토큰 관리

> 자기완결 브리프. runner는 `docs/specs/FEAT-collab-auth.md`와 이 파일만 본다. 진행·상태는 이 파일에만 쓴다.

**deps**: n4
**상태**: done (2026-09-28)

## 문제

웹이 Google 로그인을 하고 Ktor 토큰을 들고 있어야 공유·초대가 된다. D7·D8.

## 목표

공유나 초대 때만 Google 로그인이 뜨고, 토큰이 저장되며 만료 전에 조용히 갱신된다.

## 작업

1. `web/src/state/auth/`에 Google Identity Services 로그인, 토큰 저장(IndexedDB), 자동 갱신을 만든다.
2. `/j/[token]` 초대 라우트: 보드를 흐리게 깔고 카드 하나(시안 ⑤). 만료 링크는 '만료된 초대예요'.
3. 리프레시 만료 시 흐린 보드 위 로그인 카드, 로그인 후 같은 자리로 복귀. 로컬 사본은 안 지운다.
4. 로그인하지 않은 경로에서는 auth 모듈이 네트워크를 한 번도 부르지 않게 한다.

## 완료 기준

- [x] spec 공통 완료 기준 전부 — 단, `bun run test`·`bun run lint`는 base에 이미 있던 실패 2건 때문에 red (갭 기록)
- [x] cd web && bunx tsc --noEmit (통과). n6가 만든 파일만 `bunx eslint` 통과
- [x] AC-5·AC-12 컴포넌트 테스트 (`components/auth/__tests__/`)
- [x] AC-1 회귀: 로그인 안 한 상태에서 Ktor 호출 0건 테스트 (`app/__tests__/ac-auth.test.tsx`)
- [x] 실경로: 테스트가 프로덕션 컴포넌트(AuthBootstrap·AuthSessionOverlay·InviteRoute)를 그대로 탄다. GIS·Ktor 실호출만 주입으로 대체 — 갭

## 결산

**만든 것**
- `web/src/state/auth/` — `jwt.ts`(payload·만료), `tokenStore.ts`(IndexedDB `moss-auth`), `api.ts`(Ktor `/auth/google`·`/auth/refresh`·`/invites/accept`), `googleIdentity.ts`(GIS), `store.ts`(zustand `useAuth`), `index.ts`.
- `web/src/components/auth/` — `GoogleButton`, `InviteRoute`, `SessionExpiredCard`(=`AuthSessionOverlay`), `AuthBootstrap`.
- `web/src/app/j/[token]/page.tsx` — 초대 라우트. `web/src/app/page.tsx`에 부트스트랩·만료 오버레이 배선.
- i18n `collab.auth.*` 키. 테스트 26개 (auth 16, InviteRoute 6, AC-12 3, AC-1 1).

**n7·n8 계약**
- 스토어: `useAuth` — `status: anonymous|authenticated|expired`, `user`, `session`, `hydrate()`, `loginWithGoogle()`, `ensureSession(): Promise<AuthSession>`, `acceptInvite(token)`, `logout()`. n7은 `ensureSession().accessToken`으로 `POST /boards/{id}/token`을 부르면 된다.
- `apiBaseUrl()` (`web/src/state/auth/api.ts`), env `NEXT_PUBLIC_MOSS_API_URL`(기본 `http://localhost:8080`), `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.
- n7 테스트는 `configureAuth({ api, googleIdToken, now })`로 주입한다.
- 초대 링크 형식: `/j/{token}?name={보드명}&owner={소유자명}` (n8가 발급).

**갭**
- base에 이미 red: `Canvas.virtualization.test.tsx`(1건)와 `ExportModal.tsx:39` lint error·`exportStore.ts:51` warning. n6 변경과 무관, 손대지 않음.
- GIS 실경로 미검증 — 테스트는 `googleIdToken` 주입. 실키 경로는 배포 때 확인.
- 로그인 전 초대 카드의 초대자·보드 이름은 링크 쿼리(`?name=&owner=`)로만 보인다. n4에 공개 초대 미리보기 엔드포인트가 없어(수락은 인증 필수) 서버에서 받아올 수 없다. 쿼리가 없으면 '공유 보드'로 표시. n8가 링크에 실어야 AC-5의 화면이 완성된다.
- 수락 성공 뒤 보드 열기는 `/`로 이동까지만 한다. 실제 공유 보드 로딩은 n9의 D13 `GET /me/boards` 몫.
- `.env.local`은 커밋하지 않는다. 빌드·배포가 두 변수를 세팅해야 한다.

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/app/` | 라우트 위치 |
| `/Users/donghwan/docs/1-life/canvas/moss-collab/mock.html` | 시안 v3 ⑤ 초대 카드 |

## 구현 메모


- n4 계약 (2026-09-28): 초대 수락은 `POST /invites/accept`, 본문 `{"token"}`. 인증 헤더 필수. 스키마 변경은 V2부터 — V1은 고정.
