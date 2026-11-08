# 덮개로 버튼을 막을 때 inert만 걸지 말고 이미 들어간 포커스를 뺀다

## 맥락

오프라인이거나 요청 중이면 Google 로그인 칸에 덮개를 씌웠다. 덮개는 마우스만 막아서 Tab과 Enter로 Google 창이 열렸다. 코드 리뷰 뒤 칸에 `inert`를 걸었다.
단위 테스트와 리뷰 2바퀴는 통과했다. 실제 브라우저 검증에서 남은 구멍이 나왔다. 버튼에 포커스가 있는 채 오프라인이 되면 `inert`가 붙어도 `document.activeElement`가 Google iframe에 남았다. Enter를 누르자 오프라인인데 계정 선택 창이 열렸다.

## 다음에 할 일

- 영역을 막을 때 `inert`를 걸고, 그 영역 안에 포커스가 있으면 같은 순간 `blur()`로 뺀다. `inert`는 새 포커스만 막고 이미 들어간 포커스는 두기 때문이다.
- 회귀 테스트는 "포커스를 먼저 넣고 나서 막는다" 순서로 쓴다. 막은 뒤 Tab만 보는 테스트는 이 구멍을 못 잡는다.
- 다른 출처 iframe이 든 칸은 jsdom이 키보드 동작을 흉내 내지 못한다. 실제 브라우저로 포커스, 막기, Enter 순서를 한 번 돌린다.

## 검증

`web/src/components/auth/__tests__/LoginOnboarding.test.tsx:500` 테스트가 칸 안 iframe에 포커스를 넣은 뒤 오프라인으로 바꾸고 포커스가 빠졌는지 본다. 이 테스트는 `67c64e8`에서 실패하고 `bc73b7a`에서 통과했다. 실제 브라우저에서 같은 재현을 `bc73b7a`로 다시 돌렸다. 오프라인이 되자 `activeElement`가 BODY로 바뀌었고 Enter로 열린 팝업은 0개였다.

## 근거

- `web/src/components/auth/GoogleSlot.tsx:196` — 덮개가 씌워질 때 칸 안 포커스를 빼는 effect
- `web/src/components/auth/GoogleSlot.tsx:296` — 칸의 `inert`
- prover 실브라우저 검증 C5 재현: 온라인에서 Tab으로 iframe 포커스, 오프라인 에뮬레이션, Enter로 팝업 열림
