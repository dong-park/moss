# 외부 클라이언트 설정을 고치면 그 클라이언트가 실제로 읽은 값을 테스트한다

## 맥락

3번째 적대 검토에서 sync가 특수문자 DB 비밀번호로 뜨지 못한다는 지적을 고쳤다. 고친 코드는 `user`와 `password`를 `connectionString`과 따로 pg에 넘겼다. 테스트는 우리 함수가 돌려준 객체만 확인해서 통과했다. 그런데 pg는 `connectionString`을 마지막에 읽고 그 안의 빈 계정으로 따로 넘긴 값을 덮었다. 4번째 검토에서 운영 sync가 OS 사용자로 접속해 인증에 실패하는 P0로 다시 나왔다.

## 다음에 할 일

- 라이브러리에 넘길 설정을 만드는 함수를 고치면, 그 라이브러리 객체를 실제로 만들고 그 객체가 쓸 값을 단언한다. pg라면 `new pg.Client(...).connectionParameters`를 본다.
- 우리 함수의 반환값만 보는 테스트는 라이브러리의 병합 순서를 놓친다.
- 새 회귀 테스트는 고치기 전 코드에서 먼저 실패하는지 확인한다.

## 검증

`sync/test/config.test.ts`의 테스트 3개가 실제 pg `connectionParameters`를 단언하고 통과한다. 이 테스트는 `8d54034`의 코드에서 실패한다. 운영 compose 실제 기동에서 `/ + = # @ %`가 든 비밀번호로 sync가 인증 오류 없이 떴다.

## 근거

- `sync/test/config.test.ts:15` — 실제 pg 값을 읽는 `effective()`
- `sync/src/config.ts:115` — 계정을 접속 주소에 인코딩해 넣는 `toPgConnection`
- 회귀를 만든 커밋 `8d54034`, 고친 커밋 `7d36632`
