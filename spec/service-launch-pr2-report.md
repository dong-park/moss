# PR2 구현 보고

## 결론

PR2 보정 설계를 코드로 옮겼고 서버 131개, 웹 인증 범위 93개 테스트가 통과했다. 커밋, 푸시, 서버 실행은 하지 않았다. 화면 캡처와 live 검증은 하지 않았고 확인 안 됨이다.

## 만든 것

- `server/src/main/resources/db/migration/V9__signup_policy.sql`: 잠금 행 `signup_policy`(id=1)와 `users.terms_version`, `users.terms_accepted_at`. 상한 숫자는 넣지 않았다. 기존 계정의 동의 열은 null이다.
- `BoardRepository.kt`: 이메일과 Google 신규가입이 같은 행을 `FOR UPDATE`로 잠근다. 잠금 안에서 동의, 전체 계정 수, 생성, 동의 저장을 한 트랜잭션으로 끝낸다. 기존 Google 계정은 잠금 전과 잠금 뒤에 다시 조회하고 상한과 동의를 보지 않는다.
- `AppConfig.kt`: `MOSS_ACCOUNT_CAP`은 기본 1000, 음수와 숫자가 아닌 값은 설정 오류, 0은 신규가입 닫힘이다. `MOSS_TERMS_VERSION`이 없으면 신규가입만 503이다.
- `ApiModels.kt`, `AuthRoutes.kt`, `Errors.kt`: 요청은 `termsAccepted`와 `termsVersion`을 받는다. 동의 시각은 서버가 적는다. 동의 없음은 400 `consent_required`, 닫힘은 503 `signup_closed`, 상한 도달은 503 `signup_capacity`다.
- 웹 `api.ts`, `store.ts`, `terms.ts`, `LoginOnboarding.tsx`: 이메일 가입은 체크와 버전을 보낸다. Google은 `consent_required`를 받으면 체크를 보이고 동의 후 같은 버전으로 다시 요청한다. 503은 서버 문구를 보여 준다.
- 테스트: `SignupPolicyTest.kt` 9개 추가. 웹은 api, store, LoginOnboarding 테스트 7개 추가.

## 검증

- 서버 전체 `./gradlew test --rerun-tasks` 종료 코드 0, 131개 통과. JDK는 Microsoft 17.
- 웹 `vitest run src/state/auth src/components/auth src/app/legal` 종료 코드 0, 93개 통과.
- 잔여 1석 동시 가입은 이메일과 Google 중 정확히 한 쪽만 성공한다.
- `tsc`는 9개 오류가 나지만 `CardContent.frame.test.tsx`와 `mossBridge.test.ts` 소관이고 PR2 파일에는 없다.

## 호출자가 정할 것

- 웹은 약관 버전을 빌드 변수 `NEXT_PUBLIC_MOSS_TERMS_VERSION`에서 읽는다. 서버 `MOSS_TERMS_VERSION`과 값이 다르면 400이 난다. 서버가 버전을 내려 주는 엔드포인트는 만들지 않았다.
- 상한 도달의 상태 코드는 409 대신 503으로 바꿨다. 409는 웹에서 "이미 가입된 메일"로 읽힌다.
- 테스트 도우미 `ApiTest.config`를 `open`으로 바꾸고 기본 약관 버전을 `terms-test-1`로 넣었다.
- 정책 본문과 운영자 정보는 만들지 않았다. `/legal` 페이지는 기존 placeholder 그대로다.
- 공개 조건 미충족: 정책 본문 미승인, 정책 버전 미설정, 상한 숫자 미정, live 검증 미실시.
- `mcp/`와 `web/src/state/bridge` 변경은 다른 작업의 것이고 건드리지 않았다.
