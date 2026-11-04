# moss 서비스 공개 계획

남이 접속해 쓰는 서비스로 moss를 열기 전에 막힌 곳을 고친다. 대상은 가입해서 쓰는 사용자다. 규칙은 하나다. 로그인하지 않은 사람이 비용을 만들거나 남의 데이터를 열 수 없어야 한다. PR은 7개이고 순서는 PR1, PR2, PR3, PR4, PR5, PR6, PR7이다.

전제 둘은 운영자가 정한다. 서버 한 대에 Docker로 올린다. 도메인은 운영자가 가진 것으로 한다. 둘 다 2026-10-31 대화에서 추천만 했고 확정은 아니다.

2026-11-04 기준 PR1부터 PR7까지 코드는 커밋됐다. 푸시와 PR은 없다. 같은 날 로컬 Docker에서 확인했다. 비밀번호 재설정은 옛 비밀번호를 막고 같은 토큰 재사용은 410이다. 로그아웃한 갱신 토큰은 401이고 다른 로그인의 토큰은 200이다. 없는 메일의 재설정 응답에는 토큰이 없다. 웹 응답에 frame-ancestors none, X-Frame-Options DENY, nosniff, strict-origin-when-cross-origin이 붙고 첫 화면은 200이다. 운영 구성의 Postgres는 호스트 포트가 비어 있다. 백업 스크립트는 24KB 덤프와 첨부 압축을 만들었다. 적대 검토 2명은 같은 작업 트리라 돌리지 않았다. 응답 시간 측정, 화면 조작, GitHub audit 실행은 하지 않았다. 약관 본문, 계정 상한 숫자, 재설정 메일, 서버와 도메인은 운영자 결정으로 남아 있다. 로컬 개발 compose에는 확인용 약관 버전 2026-11-04를 넣었다.

## 구현 메모

현재 실행 범위는 PR1 보정이다. PR2 이후는 이번 runner 범위에서 뺀다. 서버 인증 파일이 겹칠 수 있어 순서대로 구현한다.

1. 하위 시스템 설명 — 토큰 검증 성공이 사용자 식별을 보장해야 한다. 기존 `/me/usage` 성공 응답은 사용자 식별자가 아니다.
2. 설계 탐색 — 기존 서버의 서명 검증을 재사용한다. 신뢰할 사용자 식별자를 반환하는 인증 경로를 선택한다. JWT 내용을 검증 없이 읽어 식별자로 쓰지 않는다.
3. 처리량 점검 — 먼저 같은 사용자의 토큰 둘이 한도를 공유하는 회귀 테스트를 만든다. 서버는 현재 꺼진 것으로 마지막 확인했다. 실행 실험은 별도 검증 단계에서 한다.
4. 구현 위임 — PR1 가드와 테스트, AI 소비자와 테스트를 고친다. 인증 식별에 필요한 서버 코드와 테스트만 추가한다. PR2 미커밋 내용을 보존한다.
5. 실제 검증 — 단위 테스트와 실제 인증을 구분한다. 개발 서버는 Webpack만 허용한다. 브라우저 확장은 금지한다. runner는 개발 서버를 띄우지 않는다.
6. 작은 커밋 — 이번 runner는 변경과 테스트까지만 한다. 메인이 품질 정리와 검토 뒤 커밋을 판단한다. 무관한 변경을 스테이징하지 않는다.
7. 설계 공격 — hater가 토큰 갱신으로 한도를 피하는 결함을 지적했다. 같은 사용자 토큰 둘과 다른 사용자 토큰의 한도를 비교하는 테스트를 첫 작업으로 둔다.
8. PR 열기 — skip: 푸시와 PR 생성은 승인 범위 밖이다. 머지와 배포도 하지 않는다.

### 처리량 점검

- [x] 선행 작업을 정했다. 토큰을 바꿔 한도를 피하는 회귀 테스트부터 만든다.
- [x] 독립 작업을 나눴다. PR1 구현과 PR2 읽기 전용 설계를 병렬로 한다.
- [x] 공유 상태를 분리했다. PR2 설계는 파일을 쓰지 않는다. 서버 가입 구현은 PR1 뒤에 한다.
- [x] 최소 단위를 정했다. 서버 인증과 웹 소비자는 하나의 인증 흐름이라 runner 하나가 맡는다.

### PR1 보정 수용 기준

- 서명이 검증된 사용자 식별자로 세 라우트의 한도를 공유한다.
- 같은 사용자의 새 토큰으로 한도를 초기화할 수 없다.
- 다른 사용자는 별도 한도를 가진다.
- 운영 코드에서 환경 변수로 가짜 인증을 켤 수 없다.
- 테스트 대역은 명시적인 의존성 주입으로만 쓴다.
- 인증 서버 장애와 시간 초과는 503으로 닫는다.
- 만료된 횟수 기록을 정리한다. 메모리 기록 수에 상한을 둔다.
- 기존 AI 소비자가 갱신된 로그인 토큰을 보낸다.
- 운영 환경에서 API 주소가 없으면 localhost로 조용히 연결하지 않는다.
- 변경 범위 테스트를 실행한다. 기존 전체 타입 오류를 숨기지 않는다.
- 실제 인증과 전체 가드 지연은 별도 검증 전까지 미증명으로 남긴다.

### PR1 보정 진행 (runner, 커밋 안 함)

- 서버 `GET /me`가 검증된 sub를 `userId`로 돌려준다. 가드는 이 값을 한도 키로 쓴다.
- 가드는 3초 시간 제한을 걸고, 장애와 깨진 응답과 운영 API 주소 누락을 503으로 닫는다.
- `MOSS_AI_TOKEN_CHECK` 환경 변수 분기는 지웠다. 대역은 `setTokenChecker`로만 주입한다.
- 횟수 기록은 1만 건 상한이고, 넘으면 만료분부터 지운다.
- 웹 AI 클라이언트와 임베딩 큐는 `ensureSession`이 준 토큰을 Bearer로 보낸다.
- runner 보고: 웹 17개 파일 144개 통과, 서버 42개 통과. 실제 인증과 전체 가드 지연은 미증명이다.
- MCP 추가 테스트에서 타입 오류 3개를 발견해 고쳤다. 메인이 최종 전체 타입 검사를 실행했다. 종료 코드는 2다. 남은 오류 6개는 모두 기존 `CardContent.frame.test.tsx`에 있다. PR1과 PR2 파일의 타입 오류는 출력되지 않았다.
- 메인이 PR1 웹 파일 13개의 ESLint를 실행했다. 종료 코드는 0이다.
- PR2 변경을 제외한 격리 복사본 2개로 검토를 시작했다. 검토 대상은 16개 파일 674줄이다.

### 확인된 상태

- 브랜치는 `feat/ai-route-guard`다. 이번 작업 전 마지막 커밋은 `154e25a`였다. 지금은 `04bae39`, `bd1a6ae`, `9751293`이 위에 있다.
- 보정 전 가드는 `/me/usage` 성공 시 토큰을 횟수 키로 반환했다.
- 보정 전 `MOSS_AI_TOKEN_CHECK=stub`는 운영 경로에서도 인증 대역을 고를 수 있었다.
- PR2는 서버 가입 파일과 웹 인증 파일에 미커밋 변경으로 남아 있다.
- JDK 17로 기존 이메일 가입과 OAuth 테스트가 통과했다. 보정 후 결과는 미확인이다.
- 2026-11-01 `docker info`가 데몬 연결 실패를 반환했다. 로컬 Docker 스택 실검증은 현재 막혀 있다. 3000 포트 리스너는 없었다.
- 현재 `/usr/libexec/java_home -v 17`은 Microsoft JDK 17 경로를 반환한다.
- 기존 웹 전체 타입 검사는 무관한 `CardContent.frame.test.tsx` 오류로 실패했다.
- `docs/`, `spec/glass-wall/`, 카드 테스트와 zoomLod 파일은 이번 작업 대상이 아니다.
- 사용자 승인 범위는 서비스 공개 준비 구현이다. 푸시와 머지와 배포는 제외한다.

### PR1 검토에서 확인한 회귀

MCP의 AI 호출도 기존 클라이언트에 포함한다. 검토자 재현을 메인이 다시 실행했다. 실제 `mcp/src/ai.ts`의 `aiEmbed`가 실제 embed 라우트에서 401을 받았다. 같은 호출은 `355534a` 기준 코드에서 통과했다. 인증 서버와 모델 호출 자체는 이 재현에서 실제 외부 서비스를 쓰지 않았다.

- MCP AI 도구 세 개에도 인증 수단을 연결한다. 가드를 우회하지 않는다.
- 사용자 토큰을 모델 도구 인자와 로그에 노출하지 않는다.
- 기존 브리지의 로그인 세션을 사용하는 방안을 우선 검토한다. 보안 경계를 넓히는 변경은 피한다.
- embed와 summarize와 connection-label 호출 경로를 각각 테스트한다.
- 새 경로에 브라우저가 필요하면 요구 조건과 오류 문구를 문서에 적는다.
- MCP runner는 세 도구를 로그인한 moss 탭의 브리지로 옮겼다. 토큰은 탭 안에 둔다. 탭이 없으면 오류를 반환한다.
- MCP runner 보고: MCP 테스트 16개와 웹 브리지 테스트 60개가 통과했다. 웹 브리지 린트도 통과했다.
- MCP 수정은 검토자 A의 1회 재심사를 통과했다. 메인도 같은 재현을 실행해 종료 코드 0을 확인했다.
- 재현은 로그인한 세 도구의 성공과 미로그인 세 도구의 거부를 확인했다. 결과에 토큰이 없었다. `/me` 응답은 대역이었다.
- stdio 도구 등록과 웹소켓 직렬화는 실행하지 않았다. 실제 외부 서버를 사용한 증거도 아직 없다.
- 메인 검증 로그는 scratchpad의 `pr1-review/repro-a.log`와 `pr1-review/repro-base.log`에 있다.
- 검토자 A는 실행 지적 1건을 보고했다. 메인이 재현했다. 원인이 같은 MCP 세 경로는 지적 하나로 합쳤다.
- 검토자 A의 의심 2개는 실행 증거가 없어 버렸다. 인증 서버 반복 조회와 기록 상한의 퇴출 순서다.
- 검토자 B는 실행 지적 2건을 보고했다. 메인이 두 재현을 다시 실행했다.
- 1001개 메모의 21번째 배치가 429를 받았다. 61초 뒤 새 메모가 저장돼도 실패한 메모는 재시도되지 않았다. 기준 코드에서는 21개 배치가 모두 200이었다.
- 같은 시각에 다른 사용자 10000명이 호출하면 기존 차단 사용자의 기록이 지워져 다시 통과했다. 기준 코드에는 이 기록 상한이 없었다.
- 수정 기준: 활성 기록을 지우지 않는다. 만료 기록을 정리해도 공간이 없으면 새 사용자를 닫는다. 기록 상한과 기존 한도를 모두 지킨다.
- 수정 기준: 429로 실패한 임베딩 배치를 보존한다. 재시도 시각과 횟수를 제한한다. 새 메모 내용을 옛 재시도 내용으로 덮지 않는다. 재시도 중 같은 호출을 무한 반복하지 않는다.
- 검토자 B가 확인한 비로그인 401은 의도한 동작이라 지적에서 제외했다.
- MCP 수정과 가드·큐 수정을 파일 경계로 나눠 병렬로 한다.
- PR1 코드 검토의 실행 지적 4건은 모두 해소됐다. 검토자 2명이 재심사했다. 마지막 개인정보 수정은 메인이 원래 재현으로 확인했다. 실제 서버와 성능 검증은 미증명이다.
- 메인이 재현한 결과는 `extraRequests:1`, `cached:true`였다. 사용자가 AI 제외로 바꾼 메모의 옛 내용이 대기열에 남았다.
- 수정 기준: 같은 메모의 새 상태는 AI 제외 여부와 빈 내용 여부를 포함해 옛 재시도를 무효화한다. 전체 AI 제외로 바뀌면 대기 재시도도 취소한다.
- AI 제외로 바꾸고 한도 창을 넘겨도 전송과 새 캐시가 없어야 한다. 회귀 테스트로 고정했다.
- 메인이 수정 후 원래 재현을 다시 실행했다. `extraRequests:0`, `cached:false`를 확인했다. 기존 한도와 재시도 재현도 통과했다.
- 개인정보 회귀 테스트 3개는 수정 전 실패했다. runner 보고에서 수정 후 영향 테스트 18개 파일 159개가 통과했다.
- MCP 테스트 16개는 메인도 실행했다. 종료 코드는 0이었다.
- 수정 runner 보고: 영향 테스트 18개 파일 156개가 통과했다. 수정 전 회귀 테스트 4개는 실패했다.
- 가드는 상한에서 새 사용자에게 429를 반환한다. 활성 사용자의 기존 창은 보존한다.
- 큐는 61초 뒤 재시도한다. 재시도는 3번까지다. 같은 메모의 새 내용이 우선한다.

### PR2 보정 설계

PR2 구현을 마쳤다. runner 보고에서 서버 131개와 웹 인증 93개 테스트가 통과했다. 검토자 2명은 PR2 격리 복사본을 사용한다. 검토 범위는 23개 파일 1076줄이다. 원본 PR1 파일은 보존한다. 기존 이메일 전용 검사는 가입 공통 규칙으로 옮겼다.

- 이메일과 Google 신규가입은 같은 DB 잠금을 사용한다.
- 잠금 안에서 전체 계정 수를 확인한다. 생성과 동의 저장도 같은 트랜잭션에서 끝낸다.
- 기존 Google 계정은 잠금 뒤 다시 조회한다. 기존 로그인에는 상한과 신규 동의를 요구하지 않는다.
- 동의는 명시적인 값과 약관 버전으로 받는다. 동의 시각은 서버가 기록한다.
- 기존 사용자에게 가짜 동의 기록을 만들지 않는다.
- Google 신규가입에 동의가 없으면 구분 가능한 오류를 반환한다. 웹은 동의 후 다시 요청한다.
- 취소와 토큰 만료와 중복 제출을 테스트한다.
- 잔여 1석에 이메일과 Google이 동시에 가입하는 테스트를 추가한다.
- 본문 미승인 상태는 신규가입 공개 조건을 충족하지 못한다. 배포 승인과 분리해 기록한다.
- 가입 정책 잠금 행은 마이그레이션으로 만든다. 실제 상한값을 마이그레이션에 확정하지 않는다.
- `MOSS_ACCOUNT_CAP`의 기존 기본값 1000은 임시값으로 유지한다. 음수와 잘못된 값은 설정 오류로 처리한다. 0은 신규가입을 닫는다.
- 승인할 정책 버전은 설정으로 받는다. 미설정 시 신규가입만 503으로 닫는다. 기존 로그인과 갱신은 유지한다.
- 운영자가 정책 버전을 설정하기 전까지 placeholder 문구를 보존한다. 운영자 정보와 법무 문구를 만들지 않는다.
- PR2 runner는 가입 DTO와 가입 저장·라우트, DB 스키마·신규 마이그레이션, 웹 가입 UI와 인증 API·store 및 관련 테스트만 수정한다.
- PR1의 MeDto와 `/me`, AI 파일은 보존한다. 커밋과 서버 실행은 하지 않는다.
- PR2 범위 테스트를 실행한다. Gradle을 다른 작업과 동시에 돌리지 않는다. 구현 결과는 별도 보고 파일로 남긴다.
- 서버 검토자 보고에서 새 지적은 0건이었다. 임베디드 Postgres에 Google 15건과 이메일 15건을 동시에 보냈다. 상한 5개에서 생성 5건을 확인했다.
- 서버 검토자는 기존 Google 로그인 유지와 V9 적용도 확인했다. 버린 후보는 3개다. 닫힘 우선 오류는 명세였고 마이그레이션 번호 공백은 기존 상태였다. 풀 고갈은 재현하지 못했다.
- PR2 웹 검토의 실행 지적은 0건이었다. 기존 테스트 42개와 실제 함수 연결 재현 4개가 통과했다. Google SDK와 HTTP 응답은 대역이었다.
- 웹 검토자는 동의 재시도와 기존 Google 로그인, 503 복구, 이메일 오류 복구를 확인했다. 버린 후보 4건은 실제 함수 재현을 통과했다.
- 검토자 둘 모두 지적 0건이다. 검토가 얕았을 가능성은 남긴다. 실제 Google 서비스와 화면 검증은 미증명이다.
- 메인이 PR2 웹 파일 9개의 린트를 실행해 종료 코드 0을 확인했다.
- 메인 통합 웹 검사는 25개 파일 266개 검사가 통과했지만 종료 코드 1이었다. `mossBridge.test.ts`에서 DB 종료 후 미처리 오류 2개가 발생했다.
- 같은 기준 코드 묶음은 종료 코드 0이었다. 현재 브리지 단독 60개 검사도 종료 코드 0이었다. 통합 검사를 통과로 처리하지 않는다.
- 진단에서 원인은 제품 코드가 아니라 테스트 정리 순서로 판명됐다. 브리지 테스트의 real DB `afterEach`가 DB를 닫을 때 300ms 디바운스 저장이 남아 있었다.
- 수정은 `mossBridge.test.ts`의 `afterEach`에서 `resetDB` 전에 `flushAll()`을 부르는 한 줄이다. 회귀 방지도 이 정리 순서가 맡는다.
- 근거 숫자: 수정 전 원본 통합 명령 3회 중 1회가 exit1이었다. 수정 후 runner 5회와 메인 3회가 모두 exit0이었고 매번 266개가 통과했다.
- `workspace.ts`의 catch 추가안은 6회 중 1회 실패로 효과가 없어 적용하지 않았다.
- 수정 전 실패율 1/3은 표본이 작다. 비율로 해석하지 않는다.

### 커밋 분리 계획

변경이 한 브랜치 작업 트리에 섞여 있다. 커밋은 범위별로 나눈다.

커밋을 만들었다. 푸시는 하지 않았다.

- `04bae39` fix: AI 한도를 토큰이 아니라 사용자 단위로 센다. 서버 `/me`, 가드, AI 클라이언트와 큐, MCP AI 브리지, 브리지 테스트 정리 순서를 포함한다. 16개 파일이다.
- `bd1a6ae` feat: 가입에 서버가 기록하는 약관 동의와 전체 계정 상한을 넣는다. 23개 파일이다.
- `9751293` docs: 서비스 공개 준비 계획과 검증 기록. 이 문서와 보고서 5개다.
- 테스트 종료 경합 수정은 별도 커밋을 만들지 않았다. `mossBridge.test.ts` 한 파일에서 새 AI 브리지 테스트와 같은 정리 절차를 고쳐 한 커밋에 넣었다. 경합이 새 테스트로 드러난 것이라 경계가 같다고 판단했다.
- `ApiModels.kt`는 hunk 단위로 나눴다. `MeDto`는 AI 커밋에, 가입 DTO 두 개는 가입 커밋에 넣었다.
- `docs/`, `spec/glass-wall/`, 카드 테스트, `zoomLod`는 스테이징하지 않았다.
- 커밋 후 원래 작업 트리에서 통합 웹 검사를 다시 돌렸다. 25개 파일 266개가 통과했고 종료 코드는 0이다.
- 각 커밋을 따로 빌드해 검증하지는 않았다. 커밋 1과 2는 중간 상태이고, 검증은 커밋 후 최종 트리에서 했다.

### 운영자 결정 대기

| 결정 | 현재 처리 | 공개 전 조건 |
|---|---|---|
| 계정 상한 숫자 | 기존 1000은 임시 가정으로 취급한다. | 운영자가 숫자를 정한다. |
| 약관과 개인정보 본문 | 빈 본문을 완성된 정책으로 보고하지 않는다. | 운영자가 본문과 버전을 승인한다. |
| 재설정 메일 발송 수단 | 토큰 구현과 발송 경계를 분리한다. | 발송 수단과 발신 주소를 정한다. |
| 서버와 도메인 | 로컬 구현만 진행한다. | 운영자가 배포 대상을 정한다. |

## How to read this

One box is one unit of work. 박스 하나가 일의 단위다. 각 박스는 names the evidence, 곧 확인할 증거를 적는다. 중첩 박스는 위 박스의 하위 단계다. Check a box only when its evidence exists. 증거 파일, 로그 줄, 스크린샷, 테스트 실행, SHA가 있을 때만 체크한다. 본문은 절차다. 부록은 근거와 기록이다.

실행 절차는 `playbooks/autopilot-stack.md`를 따른다. 이 파일은 이 환경에 없다. 그래서 실행 주체를 `/go`로 바꿨다. 머지는 운영자가 한다. PR7은 운영자 항목이다. 머지 가능 상태에서 멈춘다.

Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

## Program checklist

### Arm the program

- [ ] 이 계획과 실행 방식을 운영자에게 보이고 멈춘다. 운영자가 명시적으로 시작하라고 할 때만 실행한다.
- [ ] 프로그램 시작 때 아래를 읽고, 매 틱마다 다시 읽는다. 절차 원본은 `git show origin/main:` 경로로 읽는다. 그 경로는 이 저장소에 없다. 실제 위치는 홈 디렉터리의 스킬이다.
  - [ ] `git show origin/main:~/.claude/skills/go/SKILL.md`
  - [ ] `~/.claude/skills/pr/SKILL.md`
  - [ ] `~/.claude/skills/review/SKILL.md`
  - [ ] `~/.claude/skills/prove/SKILL.md`
- [ ] 운영자가 시작하라고 하면 감사 틱을 `/loop 1h`로 건다. 간격을 기억에 맡기지 않는다.
- [ ] 틱 프롬프트는 이 문장을 그대로 쓴다. "실행 절차를 다시 읽어라. 진행을 그 절차와 비교하고 어긋난 것을 이번 틱에서 고쳐라. 진행 중인 레인을 부작용으로만 판단해라. 멈춘 레인은 내리고 대체를 지금 띄워라. 그 다음 운영자에게 status message 하나만 채팅으로 남겨라. 이전 상태에 없던 변화만 적는다. PR이 열림, 헤드가 코드 준비됨, 라운드가 열리거나 닫힘, 판정, 머지, 멈춘 에이전트와 조치, 막힘이 생기거나 풀림, 운영자만 결정할 수 있는 결정이 그런 변화다. 그 변화를 빠짐없이 적고 다른 것은 적지 마라. 표, 머지 목록, 그대로인 막힘을 반복하지 마라. 변화가 없으면 답 텍스트 없이 턴을 끝내라. 어느 쪽이든 이번 틱의 한 줄을 결정 기록에 남겨라. 그 줄은 보고한 항목 또는 없음을 적는다."
- [ ] 운영자가 멈추라고 하면 모든 작업자에게 즉시 쓰기 금지 명령을 보낸다.

### Spawn owners

- [ ] PR마다 작업자 하나를 띄운다. 수명 주기는 `/go`가 정한다.
- [ ] 의존은 이 그래프를 따른다. 부모 PR이 머지되기 전에는 자식 작업을 시작하지 않는다.
  - [ ] PR1과 PR2는 독립이고 먼저다. 둘 다 `main`에서 분기한다.
  - [ ] PR3은 PR1 다음이다.
  - [ ] PR4는 PR1, PR2 다음이다.
  - [ ] PR5, PR6, PR7은 PR4 다음이다. 셋은 서로 독립이다.
- [ ] 파일 경계를 지킨다. 각 PR은 자기 절의 Files에 적힌 경로만 건드린다.
- [ ] 리뷰 게이트를 지킨다. PR2, PR3, PR5는 화면이 바뀐다. 머지 전에 운영자가 채팅에서 스크린샷과 영상을 보고 승인한다.

### PR mechanics, for every PR

- [ ] 포지(forge)를 한 번 정한다. 기본은 `gh`다. `origin` 명령이 있고 저장소를 해석하면 PR 작업은 `origin pr`로 한다. `gh`로 내려간 사실을 기록한다. `gt`는 요구하지 않는다.
- [ ] PR은 초안이 아니라 준비 상태로 연다. 스택의 자식 PR은 부모 브랜치를 대상으로 한다.
- [ ] PR로 푸시하기 전에 저장소의 린트와 타입체크를 한 번 돌린다. 훅을 켜고 푸시한다.
- [ ] 커밋 전에 `/simplify`를 돌리고, 리뷰 전에 `/review`를 돌린다. pstack의 `/deslop`, `/no-comments`는 이 환경에 없다.
- [ ] 봇 리뷰 코멘트는 트리아지 절차대로 처리한다. pstack의 `bugbot-triage.md`는 이 환경에 없다. 대신 `/review` 판정을 따른다.
- [ ] 코드 준비 보고 전에 trunk 위로 리베이스한다. 수정 라운드에서는 그 머지 베이스를 유지한다. 다시 리베이스하는 경우는 머지 준비 때, trunk와 충돌이 날 때, trunk의 변경 때문에 CI가 실패할 때, 같은 파일을 건드린 변경이 들어왔을 때뿐이다.

### Verdict and merge, for every PR

- [ ] 검증은 코드 준비된 헤드에서 한 번 돈다. 전체 검증을 다시 도는 경우는 새 동작, 재설계, 큰 새 diff뿐이다. 리베이스, 충돌 해소, 작은 수정은 새 헤드에서 검증자 하나가 본다. 문장만 바뀐 변경은 검증을 생략한다. pstack의 swarm 10레인 구성은 이 환경에 없다. 대체는 각 PR의 Verify, live 절에 적는다.
- [ ] 발견은 실행 절차의 차단 규칙으로 판단한다. 차단이 없으면 판정은 깨끗하다. `Regression lane against trunk.`로 표시된 레인이 trunk 동작에서 실패하면 trunk의 문제로 기록하고 그 PR을 막지 않는다.
- [ ] 머지는 운영자가 한다. `/go`는 머지 가능 상태까지만 만들고 멈춘다. 판정이 난 헤드의 patch-id가 머지 시점까지 같아야 한다.

### Boot recipe, for every live lane

pstack의 클라우드 VM과 `control-ui`는 이 환경에 없다. 실제 동작 검증은 로컬 Docker 스택에서 `/prove`로 한다. 화면 검증은 `appstack`과 `computer-use`로 한다.

- [ ] `git fetch origin <head-branch> && git checkout <head SHA>`.
- [ ] `docker compose up`으로 postgres, server, sync, web을 띄운다. 각 서비스가 ready 로그를 낼 때까지 기다린다.
- [ ] 입력은 화면 조작 또는 HTTP 요청으로만 준다. 데이터베이스를 직접 고쳐 상태를 만들지 않는다.
- [ ] 스크린샷은 `/tmp/prove-<pr-id>/<slug>.png`에 저장하고 보고서에 경로를 적는다.

## AI 호출에 로그인과 횟수 제한을 건다 (PR1)

**Depends on.** None.

**Files.**

- [ ] Edit `web/src/app/api/ai/summarize/route.ts`.
- [ ] Edit `web/src/app/api/ai/embed/route.ts`.
- [ ] Edit `web/src/app/api/ai/connection-label/route.ts`.
- [ ] Create `web/src/app/api/ai/_guard.ts`.

**Build.**

- [ ] 세 라우트가 요청을 처리하기 전에 `_guard.ts`의 검사를 호출한다. 검사는 로그인 토큰과 분당 호출 수를 본다.

**You see.**

- [ ] 토큰 없이 POST하면 401이 반환된다. 로그인한 사용자가 분당 한도를 넘기면 429가 반환된다.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] 가드 테스트가 토큰 없음, 토큰 있음, 한도 초과 세 경우를 커버한다. `cd web && bun run test`로 그 파일을 돌린다.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. 로컬 스택에서 3개 시나리오로 검증한다. 10레인 구성은 이 환경에 없다.

- [ ] Lane 1. Regression lane against trunk. trunk는 이 기능이 없다. 그 사실을 기록한다. 헤드에서 토큰 없는 POST가 401인지만 게이트한다. Save `ai-unauth.png`. Pass when 응답이 401이다.
- [ ] Lane 2. 로그인한 사용자의 정상 호출이 200을 반환한다. Save `ai-ok.png`. Pass when 응답이 200이다.
- [ ] Lane 3. 같은 사용자가 한도를 넘기면 429를 받는다. Save `ai-limit.png`. Pass when 응답이 429이다.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. 가드가 추가한 지연. 토큰 검증과 횟수 조회의 소요 시간.
- [ ] Probe. 로그인한 요청 20개를 헤드에서 보내고 가드 구간의 시간 중앙값을 기록한다. trunk는 가드가 없어 같은 시나리오가 아니다.
- [ ] Baseline. trunk에는 이 구간이 없다. 그 사실을 기록한다.
- [ ] Rule. 가드 구간 중앙값이 50ms를 넘으면 실패다. 절대 예산이다. trunk 대비 비율은 내지 않는다.

**Review gate.** None. PR1은 리뷰 게이트 대상이 아니다. 화면이 바뀌지 않는다.

**Merge.**

- [ ] 정확한 헤드 SHA에 대한 깨끗한 판정.
- [ ] 봇 리뷰 트리아지 완료.
- [ ] 판정 이후 trunk 위로 리베이스하고 patch-id가 그대로다.
- [ ] 운영자가 스쿼시 머지한다.

## 가입에 약관 동의와 계정 상한을 넣는다 (PR2)

**Depends on.** None.

**Files.**

- [ ] Edit `web/src/components/auth/LoginOnboarding.tsx`.
- [ ] Create `web/src/app/legal/privacy/page.tsx`.
- [ ] Create `web/src/app/legal/terms/page.tsx`.
- [ ] Edit `server/src/main/kotlin/com/moss/server/auth/AuthRoutes.kt`.

**Build.**

- [ ] 가입 요청이 약관 동의 시각을 포함해야 서버가 계정을 만든다. 전체 계정 수가 상한에 도달하면 가입을 거부한다.

**You see.**

- [ ] 가입 화면에 약관 링크와 동의 체크가 있다. 체크 없이 가입하면 거부된다. 상한에 도달하면 가입 버튼이 거절 메시지를 보여 준다.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] 동의 없는 가입이 거부되는 서버 테스트를 추가한다. 서버 테스트 명령으로 돌린다.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. 로컬 스택에서 3개 시나리오다.

- [ ] Lane 1. Regression lane against trunk. trunk의 가입 화면에는 동의 체크가 없다. 그 사실을 기록한다. 헤드에서 체크 없이 가입이 거부되는지만 게이트한다. Save `signup-nocheck.png`. Pass when 거절 메시지가 보인다.
- [ ] Lane 2. 동의 체크 후 가입이 성공한다. Save `signup-ok.png`. Pass when 보드 화면으로 이동한다.
- [ ] Lane 3. 약관 링크가 약관 본문을 연다. Save `terms.png`. Pass when 약관 본문이 보인다.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. 가입 요청 1회의 응답 시간.
- [ ] Probe. 가입 요청 10회의 중앙값을 trunk와 헤드에서 교대로 측정한다.
- [ ] Baseline. trunk 값을 먼저 기록한다.
- [ ] Rule. 헤드가 trunk의 2배를 넘으면 실패다.

**Review gate.** The operator reviews before merge.

- [ ] Lane 2, Lane 3의 screenshot을 `spec/service-launch/media/pr2-review-signup.png`, `spec/service-launch/media/pr2-review-terms.png`로 복사한다.
- [ ] 가입 흐름을 30초에서 60초 video로 녹화해 `spec/service-launch/media/pr2-review.mp4`로 저장한다.
- [ ] screenshot과 video를 채팅에 올린다. 머지 가능 상태에서 멈춘다. operator의 승인을 기다린다.

**Merge.**

- [ ] 정확한 헤드 SHA에 대한 깨끗한 판정.
- [ ] 봇 리뷰 트리아지 완료.
- [ ] 판정 이후 trunk 위로 리베이스하고 patch-id가 그대로다.
- [ ] 운영자가 스쿼시 머지한다.

## 비밀번호 재설정을 만든다 (PR3)

2026-11-01 구현했다. 커밋은 하지 않았다. 메일 발송은 만들지 않았다. 발송 수단은 운영자 결정으로 남아 있다.

- 재설정 요청은 원문 토큰을 응답으로만 돌려준다. 저장은 SHA-256 해시만 한다. 유효 시간은 1시간이다.
- 계정이 없거나 메일 형식이 틀려도 응답은 200이고 토큰은 없다.
- 같은 메일의 새 요청은 아직 안 쓴 토큰을 무효로 만든다.
- 확인은 만료와 재사용을 410으로 거부한다. 비밀번호 교체와 사용 표시는 한 트랜잭션이다.
- 로그인 화면에 재설정 요청이 있다. `/reset?token=`에서 새 비밀번호를 정한다.
- 서버 테스트 7개, 재설정 페이지 테스트 3개, 로그인 화면 테스트 17개가 통과했다.
- 실제 화면 검증과 응답 시간 측정은 하지 못했다. Docker가 꺼져 있다.



**Depends on.** PR2.

**Files.**

- [ ] Edit `server/src/main/kotlin/com/moss/server/auth/AuthRoutes.kt`.
- [ ] Create `server/src/main/resources/db/migration/` 아래 재설정 토큰 테이블 마이그레이션.
- [ ] Edit `web/src/components/auth/LoginOnboarding.tsx`.
- [ ] Create `web/src/app/reset/page.tsx`.

**Build.**

- [ ] 재설정 요청이 일회용 토큰을 만들고, 그 토큰으로만 비밀번호를 바꾼다. 토큰은 한 시간 뒤 만료된다.

**You see.**

- [ ] 로그인 화면에 비밀번호 재설정 링크가 있다. 메일로 받은 링크로 새 비밀번호를 정하면 기존 비밀번호로는 로그인되지 않는다.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] 만료된 토큰과 사용된 토큰이 거부되는 서버 테스트를 추가한다.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. 로컬 스택에서 3개 시나리오다. 메일 발송은 로컬에서 가로챈 내용으로 확인한다.

- [ ] Lane 1. Regression lane against trunk. trunk에는 재설정이 없다. 그 사실을 기록한다. 헤드에서 재설정 후 기존 비밀번호가 거부되는지만 게이트한다. Save `reset-old-rejected.png`. Pass when 기존 비밀번호가 거부된다.
- [ ] Lane 2. 새 비밀번호로 로그인된다. Save `reset-new-ok.png`. Pass when 보드 화면으로 이동한다.
- [ ] Lane 3. 같은 재설정 링크를 두 번 쓰면 두 번째는 거부된다. Save `reset-reuse.png`. Pass when 두 번째 사용이 거부된다.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. 재설정 요청 1회의 응답 시간.
- [ ] Probe. 헤드에서 10회 측정해 중앙값을 낸다. trunk에는 이 기능이 없다.
- [ ] Baseline. trunk에는 없다. 그 사실을 기록한다.
- [ ] Rule. 중앙값이 300ms를 넘으면 실패다. 절대 예산이다.

**Review gate.** The operator reviews before merge.

- [ ] Lane 1, Lane 2의 screenshot을 `spec/service-launch/media/`에 복사한다.
- [ ] 재설정 흐름을 video로 녹화해 `spec/service-launch/media/pr3-review.mp4`로 저장한다.
- [ ] screenshot과 video를 채팅에 올린다. 머지 가능 상태에서 멈추고 operator의 승인을 기다린다.

**Merge.**

- [ ] 정확한 헤드 SHA에 대한 깨끗한 판정.
- [ ] 봇 리뷰 트리아지 완료.
- [ ] 판정 이후 trunk 위로 리베이스하고 patch-id가 그대로다.
- [ ] 운영자가 스쿼시 머지한다.

## 로그아웃이 서버의 로그인을 취소하게 한다 (PR4)

2026-11-04 구현했다. 커밋은 하지 않았다. 화면은 바꾸지 않았다.

- 리프레시 토큰마다 `jti`를 넣는다. 로그아웃은 그 값의 SHA-256만 저장한다.
- 폐기된 토큰으로 갱신하면 401이다. 같은 계정의 다른 기기 토큰은 그대로다.
- 이미 깨진 토큰으로 로그아웃해도 200이다. 브라우저는 서버가 죽어도 로컬 세션을 지운다.
- 서버 테스트 3개와 웹 인증 테스트 58개가 통과했다.
- 실제 서버 검증과 갱신 시간 비교는 하지 못했다. Docker가 꺼져 있다.

**Depends on.** PR1, PR2.

**Files.**

- [ ] Edit `server/src/main/kotlin/com/moss/server/auth/TokenService.kt`.
- [ ] Create `server/src/main/resources/db/migration/` 아래 폐기 토큰 테이블 마이그레이션.
- [ ] Edit `web/src/state/auth/store.ts`.

**Build.**

- [ ] 로그아웃이 리프레시 토큰의 식별자를 폐기 목록에 넣는다. 폐기된 토큰으로 갱신하면 서버가 거부한다.

**You see.**

- [ ] 로그아웃한 브라우저가 가진 토큰으로 토큰 갱신을 요청하면 401이 반환된다.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] 폐기된 토큰의 갱신이 거부되는 서버 테스트를 추가한다.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. 로컬 스택에서 2개 시나리오다.

- [ ] Lane 1. Regression lane against trunk. trunk는 로그아웃 후에도 갱신이 된다. 그 사실을 기록한다. 헤드에서 로그아웃 후 갱신이 401인지만 게이트한다. Save `logout-revoked.png`. Pass when 응답이 401이다.
- [ ] Lane 2. 로그아웃하지 않은 세션의 갱신은 200이다. Save `refresh-ok.png`. Pass when 응답이 200이다.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. 토큰 갱신 1회의 응답 시간.
- [ ] Probe. trunk와 헤드에서 갱신 20회씩 교대로 측정한다.
- [ ] Baseline. trunk 값을 먼저 기록한다.
- [ ] Rule. 헤드가 trunk의 2배를 넘으면 실패다.

**Review gate.** None. PR4는 리뷰 게이트 대상이 아니다. 화면이 바뀌지 않는다.

**Merge.**

- [ ] 정확한 헤드 SHA에 대한 깨끗한 판정.
- [ ] 봇 리뷰 트리아지 완료.
- [ ] 판정 이후 trunk 위로 리베이스하고 patch-id가 그대로다.
- [ ] 운영자가 스쿼시 머지한다.

## 웹 응답에 보안 헤더를 붙인다 (PR5)

**Depends on.** PR4.

**Files.**

- [ ] Edit `web/next.config.ts`.

**Build.**

- [ ] 모든 웹 응답에 프레임 차단 헤더와 콘텐츠 보안 정책을 붙인다.

**You see.**

- [ ] 응답 헤더에 frame-ancestors 제한이 있다. 다른 출처의 페이지가 이 앱을 프레임으로 끼워 넣지 못한다.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] 헤더 존재 여부를 확인하는 테스트를 추가한다. 헤더 구성이 설정 파일뿐이면 이 박스는 해당 없음을 기록하고 live로 검증한다.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. 로컬 스택에서 2개 시나리오다.

- [ ] Lane 1. Regression lane against trunk. trunk 응답에는 이 헤더가 없다. 그 사실을 기록한다. 헤드 응답에 헤더가 있는지만 게이트한다. Save `headers.png`. Pass when 응답에 프레임 차단 헤더가 있다.
- [ ] Lane 2. 헤더를 붙인 뒤에도 앱의 정상 화면이 뜬다. Save `app-ok.png`. Pass when 보드 화면이 보인다.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. 문서 응답 1회의 시간.
- [ ] Probe. trunk와 헤드에서 첫 문서 20회씩 측정한다.
- [ ] Baseline. trunk 값을 먼저 기록한다.
- [ ] Rule. 헤드가 trunk보다 100ms 이상 느리면 실패다.

**Review gate.** The operator reviews before merge.

- [ ] Lane 2의 screenshot을 `spec/service-launch/media/pr5-review.png`로 복사한다.
- [ ] 앱이 정상 동작하는 video를 `spec/service-launch/media/pr5-review.mp4`로 저장한다.
- [ ] screenshot과 video를 채팅에 올린다. 머지 가능 상태에서 멈추고 operator의 승인을 기다린다.

**Merge.**

- [ ] 정확한 헤드 SHA에 대한 깨끗한 판정.
- [ ] 봇 리뷰 트리아지 완료.
- [ ] 판정 이후 trunk 위로 리베이스하고 patch-id가 그대로다.
- [ ] 운영자가 스쿼시 머지한다.

## 의존성 검사 워크플로를 추가한다 (PR6)

**Depends on.** PR4.

**Files.**

- [ ] Create `.github/workflows/audit.yml`.

**Build.**

- [ ] 워크플로가 웹 의존성 검사와 서버 의존성 검사를 돌리고, 심각도 높음 이상이 있으면 실패한다.

**You see.**

- [ ] PR을 열면 이 검사가 체크 목록에 나타난다.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] 워크플로 파일의 문법 검사를 돌린다. 명령은 그 파일에 적는다.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. 로컬 스택 대상이 아니다. 원격 체크가 증거다.

- [ ] Lane 1. Regression lane against trunk. trunk에는 이 워크플로가 없다. 그 사실을 기록한다. 헤드의 PR에서 검사 체크가 실행되는지만 게이트한다. Save `audit.png`. Pass when 검사 체크가 실행된다.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. 워크플로 전체 실행 시간.
- [ ] Probe. 헤드에서 1회 실행해 기록한다. trunk에는 워크플로가 없다.
- [ ] Baseline. trunk에는 없다. 그 사실을 기록한다.
- [ ] Rule. 실행 시간이 10분을 넘으면 실패다. 절대 예산이다.

**Review gate.** None. PR6은 리뷰 게이트 대상이 아니다. 화면이 바뀌지 않는다.

**Merge.**

- [ ] 정확한 헤드 SHA에 대한 깨끗한 판정.
- [ ] 봇 리뷰 트리아지 완료.
- [ ] 판정 이후 trunk 위로 리베이스하고 patch-id가 그대로다.
- [ ] 운영자가 스쿼시 머지한다.

## 운영 구성을 분리하고 백업을 넣는다 (PR7)

**Depends on.** PR4.

이 PR은 운영자 항목이다. 머지 가능 상태에서 멈춘다. 시크릿 값과 도메인은 운영자가 넣는다.

**Files.**

- [ ] Create `docker-compose.prod.yml`.
- [ ] Create `scripts/backup.sh`.
- [ ] Edit `.gitignore`.

**Build.**

- [ ] 운영 구성은 Postgres 포트를 호스트에 열지 않는다. 데이터베이스 비밀번호를 환경 변수로만 받는다. 백업 스크립트는 데이터베이스와 첨부 볼륨을 날짜별 파일로 덤프한다.

**You see.**

- [ ] 운영 구성으로 띄우면 호스트에서 5432 접속이 거부된다. 백업 스크립트를 돌리면 덤프 파일이 생긴다.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] 구성 파일에 호스트 포트 5432가 없는지를 확인하는 검사를 추가한다. 정적 검사면 명령과 기대 출력을 적는다.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. 로컬에서 운영 구성으로 띄운다.

- [ ] Lane 1. Regression lane against trunk. trunk의 구성은 5432를 연다. 그 사실을 기록한다. 운영 구성에서 5432 접속이 거부되는지만 게이트한다. Save `port-closed.png`. Pass when 5432 접속이 거부된다.
- [ ] Lane 2. 백업 스크립트가 덤프 파일을 만든다. Save `backup.png`. Pass when 덤프 파일이 생기고 크기가 0보다 크다.
- [ ] Lane 3. 덤프를 빈 데이터베이스에 복원한다. Save `restore.png`. Pass when 복원 후 보드 목록이 보인다.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. 백업 스크립트 실행 시간.
- [ ] Probe. 빈 데이터베이스에서 1회 실행해 기록한다. trunk에는 스크립트가 없다.
- [ ] Baseline. trunk에는 없다. 그 사실을 기록한다.
- [ ] Rule. 빈 데이터베이스 기준 60초를 넘으면 실패다. 절대 예산이다.

**Review gate.** None. PR7은 리뷰 게이트 대상이 아니다. 사용자 화면이 바뀌지 않는다.

**Merge.**

- [ ] 정확한 헤드 SHA에 대한 깨끗한 판정.
- [ ] 봇 리뷰 트리아지 완료.
- [ ] 판정 이후 trunk 위로 리베이스하고 patch-id가 그대로다.
- [ ] 운영자가 스쿼시 머지한다. 이 PR은 머지 가능 상태에서 멈춘다.

## Close the program

- [ ] 위 박스가 모두 증거와 함께 체크됐다.
- [ ] 실행 절차가 정한 보고서를 운영자에게 답한다.

## Appendix A. Prototype evidence

프로토타입으로 답한 질문은 없다. 열린 질문 둘은 프로토타입으로 답할 수 없다. 운영자의 선호라서다.

미증명으로 남는 것.

- 배포 위치. 서버 한 대 Docker를 추천했다. 확정이 아니다.
- 도메인. 운영자가 가진 도메인의 서브도메인을 추천했다. 확정이 아니다.
- 강제 종료 때 저장 대기 중인 편집의 유실. 저장 주기만 확인했다. 실행 검증은 하지 않았다.
- 로컬 브라우저의 기존 카드를 서버로 옮기는 기능의 존재. 확인 안 됐다.

## Appendix B. Alternatives rejected

- 서비스를 나눠 웹은 Vercel, 나머지는 각자 다른 곳에 올리는 안. PRD가 이 안을 적지만 PRD는 앱이 하나일 때 기준이다. 지금 서비스는 넷이다. 설정이 네 배가 되어 기각했다.
- 가입을 초대 전용으로 닫는 안. 운영자가 서비스로 연다고 정했다. 누구나 가입하되 상한과 약관 동의로 막는다.

## Appendix C. Risks

- 메일 발송 수단이 없다. PR3이 재설정 링크를 보낼 곳이 없다. 작업자는 발송 수단이 정해지기 전에는 링크 생성까지만 만들고, 발송은 운영자 결정으로 남긴다.
- 콘텐츠 보안 정책이 앱의 정상 동작을 막을 수 있다. PR5가 맡는다. Lane 2가 그 회귀를 본다.
- 폐기 토큰 테이블이 무한히 커질 수 있다. PR4가 맡는다. 작업자는 만료된 항목을 지우는 주기를 함께 넣는다.
- 계정 상한의 숫자가 정해지지 않았다. PR2가 맡는다. 운영자가 숫자를 주기 전에는 환경 변수로 두고 기본값을 적는다.

## Appendix D. Links and reading list

편집 전에 읽는다.

- `docs/specs/FEAT-email-auth.md`. PR2, PR3.
- `docs/specs/FEAT-collab-auth.md`. PR4, PR7.
- `server/src/main/kotlin/com/moss/server/auth/AuthRoutes.kt`. PR2, PR3, PR4.
- `sync/src/config.ts`. 저장 주기. 이번 프로그램은 건드리지 않는다.

`pstack/skills/how`, `pstack/skills/interrogate`는 이 환경에 없다. 대체는 각 PR의 `/review`다. 결정 기록은 `spec/service-launch-plan.md`의 체크 박스와 이 대화가 맡는다.
