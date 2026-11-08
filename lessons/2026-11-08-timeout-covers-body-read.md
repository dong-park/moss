# 요청 제한 시간은 응답 본문을 다 읽을 때까지 걸고, 실제 fetch로 본문 정지를 시험한다

## 맥락

Google 로그인 요청에 15초 제한을 넣었다. 타이머는 `fetch()`가 응답 헤더를 받는 순간 꺼졌다. 서버가 헤더만 보내고 본문을 멈추면 요청이 끝나지 않았고, 로그인 칸 덮개가 새로고침 전까지 남았다.
단위 테스트는 통과했다. 가짜 `hangingFetch`가 "헤더도 안 오는 경우" 하나만 흉내 냈기 때문이다. 코드 리뷰 검토자 3명이 실제 `node:http` 서버로 헤더 뒤 본문을 멈춰 찾았다.
읽고도 재발: 시작 때 `lessons/2026-11-07-test-real-client-values.md`를 스펙 구현 메모에 실었다. 우리 가짜가 실제 클라이언트의 일부만 흉내 내 테스트만 통과한 같은 종류의 실수다.

## 다음에 할 일

- 요청 제한 시간을 걸면 헤더 대기와 본문 읽기 둘 다 제한 안에 둔다. 본문 읽기도 같은 마감과 경주시킨다.
- 제한 시간 테스트는 세 경우를 본다. 헤더가 안 온다, 성공 헤더 뒤 본문이 멈춘다, 오류 헤더 뒤 본문이 멈춘다.
- 가짜 fetch로 시험했으면 실제 fetch와 실제 HTTP 서버로 같은 경우를 한 번 더 돌린다. 가짜 응답 본문은 abort를 무시하도록 만들어 최악의 경우를 본다.

## 검증

`web/src/state/auth/__tests__/api.test.ts:154` 테스트가 abort를 무시하는 본문 정지 fetch로 200과 500 두 경우를 본다. 이 테스트는 `eba0558`에서 실패하고 `67c64e8`에서 통과했다. 검토자의 실제 서버 재현 `reviewRealNetwork.test.ts`와 `r3-body-stall.test.ts`도 `67c64e8`에서 통과했다.

## 근거

- `web/src/state/auth/api.ts:110` — 마감 Promise `deadline`
- `web/src/state/auth/api.ts:125` — 본문 읽기까지 마감과 경주시키는 `within`
- `web/src/components/auth/__tests__/fakeGoogle.ts:86` — 헤더 전 정지만 흉내 내는 `hangingFetch`
- `lessons/2026-11-07-test-real-client-values.md` — 읽고도 재발한 기존 교훈
