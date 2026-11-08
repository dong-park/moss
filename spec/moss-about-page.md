# 로그인 없이 보는 소개 페이지 /about

| 항목 | 값 |
|---|---|
| 상태 | 진행 |
| 이슈 | https://github.com/dong-park/moss/issues/21 |
| 상위 기록 | `spec/moss-google-oauth.md` |
| 브랜치 | `feat/about-page` |

## 문제

Google 계정 선택 창에 moss 이름이 안 보인다. 브랜딩 인증이 필요하다. 2026-11-08 Google 자동 점검이 이 이유로 떨어뜨렸다: "로그인 페이지가 홈페이지보다 먼저 표시됩니다. Please update your home page to allow users to view information about your app without needing to login."

브랜딩 홈페이지는 `https://moss.dongpark.dev`다. `/`는 로그인 전이면 `WorkspaceShell` 게이트가 로그인 온보딩을 띄운다.

## 목표

로그인 없이 열리는 소개 페이지 `/about`을 만든다. 배포 뒤 브랜딩 홈페이지 주소를 `https://moss.dongpark.dev/about`으로 바꾸고 인증을 다시 낸다.

## 비목표

- `/`의 동작은 바꾸지 않는다.
- 로그인 온보딩 화면은 바꾸지 않는다.
- 로고는 만들지 않는다. 로고를 넣으면 별도 인증 제출이 필요하다.
- 문구를 i18n 카탈로그로 옮기지 않는다. `/legal/*`처럼 한국어를 직접 쓴다.

## 페이지 내용

Google 홈페이지 요건에 맞춘다. 앱을 식별하고, 기능을 설명하고, 사용자 데이터를 왜 쓰는지 밝히고, 개인정보처리방침에 잇는다.

1. 제목 h1은 `moss`다. 동의 화면 앱 이름과 같다.
2. 무엇을 하는 서비스인지 쓴다. 근거는 `web/src/app/legal/terms/page.tsx` 제1조와 i18n `meta.description`이다. 없는 기능을 쓰지 않는다.
3. Google 로그인에서 받는 정보와 쓰는 목적을 쓴다. 문장은 `web/src/app/legal/privacy/page.tsx`의 Google 관련 내용과 어긋나지 않게 한다.
4. 개인정보 처리방침 `/legal/privacy`와 이용약관 `/legal/terms` 링크를 둔다.
5. 서비스를 여는 링크를 둔다. 대상은 `/`다.
6. 운영자 연락처를 둔다. 약관과 같은 이름과 메일을 쓴다.
7. 끝에 영어 요약 2~3문장을 둔다. Google 검토가 영어로 읽을 수 있다. 이 이유는 추론이다.
8. `metadata`로 제목과 설명을 준다.

## 성공 기준

| # | 기준 | 확인 방법 |
|---|---|---|
| 1 | `/about`이 로그인 없이 200을 주고 위 1~6이 HTML에 있다 | 로컬 서버에 `curl`. h1 `moss`, `href="/legal/privacy"`, `href="/legal/terms"`, `href="/"` |
| 2 | 로그인 안 한 브라우저에서 `/about`에 로그인 대화상자가 없다 | 로컬 서버를 실제 브라우저로 연다. `role="dialog"`가 0개다 |
| 3 | 단위 테스트가 내용과 링크를 지킨다 | 새 테스트 파일 통과 |
| 4 | 게이트가 새 오류 없이 통과한다 | `npx tsc --noEmit` 0, `npx eslint` 새 오류 0, `bun scripts/check-i18n.mjs` exit 0, 관련 vitest 통과 |

## 경계와 실패 모드

- 레이아웃의 `Providers`, `StorageBootstrap`, `ServiceWorkerRegister`는 `/about`에서도 돈다. `/legal/*`와 같은 조건이다.
- 페이지에 클라이언트 상태나 인증 코드를 넣지 않는다. 서버 컴포넌트로 둔다.

## 롤백

커밋을 되돌린다. 브랜딩 홈페이지 주소를 `https://moss.dongpark.dev`로 되돌린다.

## 진행

| 기준 | 판정 | 근거 |
|---|---|---|
| 1 내용과 링크 | 통과 | 로컬 `curl /about` 200. h1 `moss`, `/legal/privacy`·`/legal/terms`·`/` 링크 |
| 2 대화상자 없음 | 통과 | 로컬 브라우저 데스크톱과 375px에서 `role="dialog"` 0개. 375px 가로 넘침 없음 |
| 3 단위 테스트 | 통과 | `vitest run src/app/about` 5/5 |
| 4 게이트 | 통과 | `tsc` 오류 0, `eslint src/app/about` 0, `check-i18n` exit 0. 전체 vitest 1590 통과 |
| /review | 통과 | APPROVE. 검토자 sonnet·GPT luna 모두 지적 0 |
| 운영 배포와 재인증 | 대기: PR 머지 뒤 | `spec/moss-google-oauth.md` 남은 순서 |

## 구현 메모

- 확인됨: `/legal/terms/page.tsx`는 `"use client"` 없는 서버 컴포넌트다. 틀은 `<main className="mx-auto max-w-2xl px-6 py-12 text-[15px] leading-7">`이다. 이 패턴을 따른다.
- 확인됨: `web/src/app/page.tsx`의 `WorkspaceShell` 게이트만 로그인 온보딩을 띄운다. `src/middleware.ts`와 `src/proxy.ts`는 없다.
- 확인됨: 운영 `/legal/privacy`와 `/legal/terms`는 로그인 없이 200이다.
- 확인됨: Next는 16.4.5다. 코드를 쓰기 전에 `web/node_modules/next/dist/docs/`에서 App Router 페이지와 metadata 문서를 읽는다.
- 확인됨: 게이트 명령은 위 성공 기준 4다. `Canvas.virtualization.test.tsx` 1건 실패와 eslint `ExportModal.tsx:39`·`exportStore.ts:51`은 main에 원래 있다.
- 워킹트리에 이 일과 무관한 변경이 있다. `package.json`, `spec/service-launch-plan.md`, `web/AGENTS.md`, `zoomLod*`, `docs/*`, `spec/glass-wall/`, `spec/moss-deploy.md`다. 커밋에 넣지 않는다. 자기 파일만 경로로 `git add`한다.
- 브랜딩 주소 변경, 배포, 재인증은 메인이 한다. runner 범위 밖이다.
- 교훈 읽음: 0 · 키워드 about, 홈페이지, legal, public page, 공개
- feature 단계 1 how — skip: 메인이 legal 패턴과 게이트 위치를 확인했다
- feature 단계 2 architect — skip: 정적 페이지 1개라 설계 대안이 없다
- feature 단계 3 처리량 점검 — 막는 첫 단계 n/a, 독립 작업 n/a: 파일 2개, 공유 상태 n/a, 가장 작은 분해 runner 1명
- feature 단계 4 위임 구현 — runner가 페이지와 테스트를 만든다
- feature 단계 5 같은 화면 검증 — runner가 로컬 서버에서 기준 1·2를 본다. 운영 확인은 배포 뒤 메인이 한다
- feature 단계 6 작은 커밋 — runner가 테스트와 페이지를 검증 가능한 단위로 커밋한다
- feature 단계 7 interrogate — skip: 설계 이견이 없다. 메인이 /review를 돈다
- feature 단계 8 PR — 메인이 /pr로 연다
