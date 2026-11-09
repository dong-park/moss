# Radix data 속성에 거는 CSS를 믿기 전에 설치된 버전이 그 속성을 내는지 브라우저에서 본다

## 맥락

펼친 메모 스펙은 "열림 모션은 기존 전역 moss-scale-in(200ms)을 다른 모달과 같이 쓴다"를 결정으로 두고 성공 기준 T8을 만들었다. 스펙 리뷰 7바퀴가 이 전제를 통과시켰다.
최종 브라우저 검증에서 모든 모달의 animationName이 'none'이었다. `globals.css`의 `[data-state="open"][data-radix-dialog-content]` 선택자를 설치된 `@radix-ui/react-dialog` 1.3.1이 내지 않았다. 앱의 모든 모달 모션이 이미 꺼져 있었다.

## 다음에 할 일

- Radix가 붙이는 data 속성(`data-radix-*`)에 거는 CSS나 성공 기준을 쓰기 전에 브라우저에서 그 요소의 속성 목록을 한 번 본다. 코드 grep만으로는 속성이 실제로 나오는지 모른다.
- 전역 CSS 규칙에 기대는 기준은 `getComputedStyle`로 지금 값을 먼저 잰다. 잰 값이 기대와 다르면 기준이 아니라 전제부터 고친다.

## 검증

prover가 e96ac06에서 펼친 메모 창과 공유 모달의 `getComputedStyle(dialog).animationName`을 쟀다. 둘 다 'none'이었고 animationstart 이벤트는 0건이었다. dialog 요소에 `data-radix-dialog-content` 속성이 없었다.
전역 선택자 수정은 모든 모달 동작을 바꾸므로 결정 행 D11로 올렸다. 고친 뒤 검증은 확인 안 됨이다.

## 근거

- `web/src/app/globals.css:241` — `[data-state="open"][data-radix-dialog-content]` 규칙
- 스펙 `spec/memo-paper-expand/rows/T8.json`, `rows/D6.json`, `rows/D11.json`
