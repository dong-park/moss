# PR마다 테스트·타입·lint·빌드를 돌리는 CI

| 항목 | 값 |
|---|---|
| 상태 | 진행 |
| 브랜치 | `feat/ci-checks` |
| base | `main` `fc59d39` |

## 문제

지금 CI는 `.github/workflows/audit.yml` 하나다. 의존성 보안 감사만 한다. PR #22의 web 체크는 13초 만에 "통과"했지만 테스트·타입 검사·빌드는 한 번도 돌지 않았다. 깨진 코드도 CI 녹색으로 머지될 수 있다.

## 목표

PR과 main 푸시마다 네 구성 요소의 검사를 돌린다. 하나라도 깨지면 체크가 빨갛게 된다.

## 비목표

- `audit.yml`은 고치지 않는다.
- 브랜치 보호와 필수 체크 설정은 하지 않는다. 저장소 설정 변경은 운영자 결정이다.
- 배포 자동화는 하지 않는다.
- lint 오류 2건의 근본 수정은 하지 않는다. 동작을 바꾸기 때문이다.

## 결정

- **D1** lint 오류 2건에 이유를 단 `// eslint-disable-next-line react-hooks/set-state-in-effect -- <이유>`를 붙인다. 동작은 그대로다. 같은 주석이 `BoardPicker.tsx:80`, `TrashPanel.tsx:109`에 이미 있다. 대안은 `useSyncExternalStore` 등으로 고치는 것이다. 되돌리기 쉽다.
- **D2** 새 파일 `.github/workflows/ci.yml`에 둔다. `audit.yml`은 NVD 키가 필요하고 느려서 분리한다.
- **D3** job 이름은 `web-checks`, `sync-checks`, `mcp-checks`, `server-checks`다. `audit`의 `web`·`server`와 체크 이름이 겹치지 않게 한다.
- **D4** 버전을 로컬과 맞춘다. Node 24, bun 1.3.14, JDK 17 temurin이다. 서버 gradle은 JDK 25에서 실패한다.
- **D5** 경로 필터를 두지 않는다. 로컬 실측으로 web 55초, server 78초다.
- **D6** `permissions: contents: read`, 같은 ref의 이전 실행은 `concurrency`로 취소한다. job마다 `timeout-minutes`를 둔다.

## 성공 기준

| # | 기준 | 확인 방법 |
|---|---|---|
| 1 | `ci.yml`이 PR과 main 푸시에서 job 4개를 띄운다 | YAML을 파싱해 `on`과 job 4개를 확인한다 |
| 2 | web job이 tsc, lint, vitest, i18n 검사, build를 돌린다 | `ci.yml`의 명령 목록 |
| 3 | sync·mcp job이 typecheck와 test를, server job이 `./gradlew test`를 돌린다 | `ci.yml`의 명령 목록 |
| 4 | 로컬 web `bun run lint`가 exit 0이다 | 명령 결과. tsc 0, vitest 통과도 유지 |
| 5 | PR에서 새 job 4개가 GitHub 러너에서 통과한다 | PR 체크. 이 기준은 메인이 PR을 연 뒤 본다 |
| 6 | 일부러 깬 검사가 체크를 빨갛게 만든다 | 메인이 PR에서 한 번 시험하고 되돌린다 |

## 진행

| 기준 | 판정 | 근거 |
|---|---|---|
| 1 job 4개 | 통과 | `Bun.YAML.parse` 결과 `on`은 pull_request·push, jobs는 4개 |
| 2 web 5개 검사 | 통과 | `ci.yml` web-checks에 tsc·lint·test·check:i18n·build |
| 3 sync·mcp·server | 통과 | `ci.yml`에 sync·mcp typecheck·test, server `./gradlew test --no-daemon` |
| 4 로컬 lint 0 | 통과 | `bun run lint` 0 errors·3 warnings, tsc 0, vitest 1590 통과 |
| 5 러너에서 4개 통과 | 대기: PR CI 실행 | |
| 6 깬 검사가 빨갛게 됨 | 대기: PR에서 시험 | |
| /review | 통과 | APPROVE. sonnet·GPT luna 모두 지적 0. Linux용 Postgres 바이너리가 `server/build.gradle.kts:57`과 `sync/bun.lock`에 있다 |

## 증명 안 되는 전제

- ubuntu 러너에서 sync·server 테스트의 임베디드 Postgres가 뜨는지는 확인 안 됨. 로컬 macOS에서만 돌았다. 성공 기준 5가 이 실험이다.
- 캐시 없는 러너의 설치·gradle 시간은 확인 안 됨.

## 경계와 실패 모드

- 임베디드 Postgres가 러너에서 안 뜨면 sync·server job이 실패한다. 그때는 실패 로그를 보고 spec을 고친다.
- `NEXT_PUBLIC_*` 없이 web build가 통과한다. CI 빌드 결과는 배포에 쓰지 않는다.
- vitest는 테스트 파일 187개다. 메모에 플래키 테스트가 있다. CI에서 한 번 실패하면 재실행으로 플래키인지 가린다.

## 롤백

`ci.yml`을 지운다. 예외 주석 2줄을 지운다.

## 구현 메모

- 확인됨: main `fc59d39` 실측. web tsc 0·4초, lint 1·6초, vitest 0·35초 1583 통과, i18n 0, build 0·9초. sync typecheck 0, test 0·114 통과. mcp typecheck 0, test 0·43 통과. server `./gradlew test --no-daemon` JDK 17 0·78초·148 통과.
- 확인됨: lint 오류는 `web/src/components/export/ExportModal.tsx:39`와 `web/src/state/network.ts:14` 두 건이다. 둘 다 `react-hooks/set-state-in-effect`다.
- 확인됨: `network.ts`는 hydration 오류를 피하려고 effect에서 상태를 맞춘다. 주석에 이유가 있다. `ExportModal`은 창을 열 때 입력을 초기화한다.
- 확인됨: web·sync·mcp는 `bun.lock`을 쓴다. 설치는 `bun install --frozen-lockfile`이다. 스크립트 이름은 web `lint test check:i18n build`, sync·mcp `typecheck test`다. web tsc는 `npx tsc --noEmit`이다.
- 확인됨: sync·server 테스트는 Docker 없이 임베디드 Postgres를 띄운다. 시크릿은 쓰지 않는다. web build는 env 없이 통과한다.
- 확인됨: 기존 `audit.yml`은 `actions/checkout@v4`, `oven-sh/setup-bun@v2`, `actions/setup-java@v4`, `gradle/actions/setup-gradle@v4`를 쓴다. 같은 액션을 쓴다.
- 워킹트리에 무관한 변경이 있다. `package.json`, `spec/service-launch-plan.md`, `web/AGENTS.md`, `zoomLod*`, `docs/*`, `spec/glass-wall/`, `spec/moss-deploy.md`다. 커밋하지 않는다. 자기 파일만 경로로 `git add`한다.
- `actionlint`는 설치돼 있지 않다. YAML 파싱은 `bun -e`나 `node`로 한다.
- 교훈 읽음: 0 · 키워드 github actions, workflow, gradle, vitest, CI
- feature 단계 1 how — 함: 서브에이전트가 main에서 검사 11개를 실측했다
- feature 단계 2 architect — skip: 워크플로 파일 1개라 설계 대안이 결정 D1~D6로 끝났다
- feature 단계 3 처리량 점검 — 막는 첫 단계 n/a, 독립 작업 n/a: 파일 3개, 공유 상태 n/a, 가장 작은 분해 runner 1명
- feature 단계 4 위임 구현 — runner가 `ci.yml`과 예외 주석 2줄을 만든다
- feature 단계 5 같은 화면 검증 — runner가 로컬 기준 1~4를 본다. GitHub 러너 기준 5·6은 메인이 PR에서 본다
- feature 단계 6 작은 커밋 — 예외 주석 커밋과 `ci.yml` 커밋을 나눈다
- feature 단계 7 interrogate — skip: 설계 이견이 없다. 메인이 /review를 돈다
- feature 단계 8 PR — 메인이 /pr로 연다
