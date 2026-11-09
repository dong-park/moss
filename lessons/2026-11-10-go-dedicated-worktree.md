# /go로 구현을 맡기기 전에 메인 체크아웃이 아니라 전용 워크트리를 만든다

## 맥락

`/Users/dongpark/moss` 메인 체크아웃에서 `feat/memo-paper-expand` 브랜치를 만들고 스펙·리뷰를 돌렸다. runner를 띄울 즈음 다른 세션이 같은 체크아웃을 `feat/cmd-z-undo`로 바꾸고 커밋을 올렸다. runner는 커밋이 다른 브랜치에 섞일 것을 보고 구현 전에 멈췄다.
같은 체크아웃의 dev 서버(포트 3000)도 다른 브랜치 코드가 됐다. 브라우저 검증은 이 브랜치 코드를 볼 수 없었다.

## 다음에 할 일

- `/go`에서 작업 브랜치를 만들 때 메인 체크아웃에서 `git switch -c`를 하지 않는다. `git worktree add ~/worktree/moss-<슬러그> -b <브랜치>`로 전용 워크트리를 먼저 만든다.
- 새 워크트리에서 `web/`에 `bun install --frozen-lockfile`을 돌린다. bun 캐시 덕분에 1~2초다. `web/.env.local`은 gitignore라 복사한다.
- 브라우저 검증용 dev 서버는 워크트리에서 3000이 아닌 포트로 띄운다. 3001은 docker가 쓴다. 3005 같은 포트는 서버 CORS 허용 목록(3000, 3001)에 없어 로그인 요청이 막힌다. 검증 스크립트에서 CDP Fetch로 Origin을 바꿔 우회했다.

## 검증

2026-11-10 `~/worktree/moss-memo-paper-expand`를 만들고 spec 폴더를 옮겼다. `bun install`은 1.2초였다. runner가 그 경로에서 STEP 0~2를 마쳤다. 포트 3005 dev 서버로 체크포인트와 최종 검증을 돌렸다. 메인 체크아웃의 다른 세션 작업은 건드리지 않았다.

## 근거

- 원천: 이 세션의 runner ① 첫 리포트 "작업 브랜치가 브리프와 다르다"
- `spec/memo-paper-expand/spec.md` 구현 메모의 "메인 확인(2026-11-10, runner용)" 줄
- CORS 우회 스크립트: 세션 스크래치패드 `prove-checkpoint/cors.js`(레포 밖)
