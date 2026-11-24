# moss 전용 Google OAuth 프로젝트

| 항목 | 값 |
|---|---|
| 상태 | 진행 |
| 이슈 | https://github.com/dong-park/moss/issues/21 |
| 서버 | `100.117.197.86` `~/moss` |

## 목표

Google 계정 선택 창에 moss 이름이 보이게 한다. moss만 쓰는 Cloud 프로젝트와 OAuth 클라이언트를 만든다. 운영과 개발을 새 클라이언트 ID로 바꾼다.

## 결정

- 2026-11-08 운영자가 ①을 골랐다. 옛 `dongpark` 프로젝트는 앱 이름 `n8n`을 클라이언트 4개가 같이 쓴다. 이름을 바꾸면 `zoopi`·`google drvie`·데스크톱 동의 화면도 바뀐다.
- 옛 프로젝트는 브랜딩 인증을 받지 않았다. 그래서 계정 선택 창에 앱 이름 대신 `dongpark.dev`가 보인다.
- 코드는 바꾸지 않는다. 웹은 빌드 인자 `NEXT_PUBLIC_GOOGLE_CLIENT_ID`로, 서버는 env `GOOGLE_CLIENT_ID`로 ID를 받는다.
- 새 클라이언트 원본은 옛 것과 같게 3개를 둔다. `https://moss.dongpark.dev`, `http://localhost:3000`, `http://localhost`. 개발도 같은 클라이언트를 쓴다.
- 옛 클라이언트 `moss-local`은 지우지 않는다. 롤백할 때 쓴다.

## 진행

| 기준 | 판정 | 근거 |
|---|---|---|
| 새 프로젝트를 만든다 | 통과 | 이름 `moss`, ID `moss-dongpark`, 콘솔 계정 `rak.ddh@gmail.com`. 폼이 결제 계정을 강제해 만든 뒤 결제를 사용 중지했다. 결제 목록에 "결제가 사용 중지되었습니다" |
| 브랜딩에 이름 moss, 홈·약관·개인정보 주소를 넣는다 | 통과 | 다시 열어 읽은 값: `moss`, `https://moss.dongpark.dev`, `/legal/privacy`, `/legal/terms`, 승인된 도메인 `dongpark.dev`. 세 주소 모두 운영에서 200. 로고는 넣지 않았다 |
| 새 웹 클라이언트를 원본 3개로 만든다 | 통과 | `moss-web` `389373702189-4j90238asdl0hbjador820lsg7fermef.apps.googleusercontent.com`. 다시 열어 원본 3개를 읽었다. 보안 비밀번호는 쓰지 않아 저장하지 않았다 |
| 앱을 프로덕션으로 게시한다 | 통과 | 대상 화면 게시 상태 "프로덕션 단계", 사용자 유형 외부 |
| 로컬 `.env`·`web/.env.local`을 새 ID로 바꾼다 | 통과 | 두 파일에 새 ID 1줄, 옛 ID 0줄 |
| 운영 `.env`를 새 ID로 바꾸고 web·server를 다시 띄운다 | 통과 | `.env` 새 ID 1줄. 백업 `~/moss/.env.bak.20261108-oauth`에 옛 ID. 둘 다 권한 600. `up -d --build web server` exit 0. server 컨테이너 `printenv`가 새 ID |
| 운영 번들에 새 ID가 있고 옛 ID가 없다 | 통과 | 운영 스크립트 15개에서 새 ID 1회, 옛 ID 0회 |
| 운영 Google 팝업이 계정 선택 창까지 간다 | 통과 | 2026-11-08 19:52 KST `accounts.google.com/v3/signin/accountchooser`, `client_id` `389373702189-4…`, authError 없음 |
| 운영에서 로그인해 보드 화면까지 간다 | 대기: 운영자가 계정을 골라 로그인 | 계정 선택과 약관 동의는 운영자가 한다 |
| 브랜딩 인증을 낸다 | 실패 | 자동 점검 결과 "로그인 페이지가 홈페이지보다 먼저 표시됩니다". 첫 화면 `/`가 바로 로그인 창을 띄운다 |
| 계정 선택 창에 moss가 보인다 | 막힘: 로그인 없이 보이는 홈페이지가 필요 | 지금 창에는 `dongpark.dev`가 보인다 |

브랜딩을 다시 인증하려면 로그인 없이 앱 소개를 보는 홈페이지가 있어야 한다. 2026-11-08 운영자가 A안을 골랐다. 공개 소개 페이지 `/about`을 만들고 홈페이지 주소를 그 페이지로 바꾼다. 구현은 `spec/moss-about-page.md`다. 하위 경로 `/about`을 홈페이지로 받아 주는지는 확인 안 됨.

남은 순서: PR 머지 → 운영 `~/moss`에서 main을 받고 web 재빌드 → 브랜딩 홈페이지를 `/about`으로 바꿈 → "문제를 해결함"으로 재인증.

## 롤백

- 서버 `~/moss`에서 `cp -p .env.bak.20261108-oauth .env`로 옛 ID를 되돌린다. `docker compose -f docker-compose.prod.yml up -d --build web server`로 다시 띄운다.
- 옛 클라이언트에는 운영 원본이 이미 있다. 되돌리면 바로 로그인된다.
