# n4-dblclick-sticky — 빈 곳을 두 번 누르면 그 자리에 포스트잇

> 자기완결 브리프. runner는 상위 spec + 이 파일만 본다. 진행 메모는 이 파일에만 쓴다. `**상태**:` 줄은 손으로 고치지 않는다 — graph-run이 `진행`·`끝남`을 쓰고, 멈추면 `node_state.py block`, 사람 확인이 필요하면 `node_state.py review`만 쓴다.

**agent**: runner
**id**: FW-4
**상위**: spec/glass-wall/first-wall/spec.md
**deps**: 없음
**상태**: 아직 안 함
**담당 행**: T4, T6
**확정 결정**: D6=B, D7=A

## 문제

힌트가 "아무 데나 두 번 눌러 포스트잇"이라고 약속하는데, 지금 빈 캔버스를 두 번 누르면 아무 일도 없다.

## 목표

마카를 들지 않은 채 벽의 빈 곳을 두 번 누르면 누른 자리에 기본 노랑 포스트잇이 붙고 바로 글을 쓸 수 있다. 아무것도 안 쓰고 떠나도 그 포스트잇은 남는다. 마카를 든 상태의 두 번 누르기는 포스트잇을 만들지 않는다.

## 확정 결정

- **D6=B** — 빈 포스트잇을 지우지 않는다. sticky-handfeel D6과 같은 답이다.
- **D7=A** — 마카를 든 동안 두 번 누르기는 포스트잇을 만들지 않는다. 마카 점은 wall-marker 몫이다.

## 작업

1. `Canvas.tsx` 캔버스 바탕에 `onDoubleClick`을 단다. 대상이 카드·메모판·툴바·검색 같은 UI면 무시한다. 판정은 텍스트 배치 핸들러(555~566행)가 쓰는 것과 같은 방식이다.
2. `penMode`가 켜져 있으면 무시한다 — D7.
3. 좌표를 월드 좌표로 바꿔 `addCardAt("text", wx, wy)`를 부르고, 그 카드를 편집 상태로 연다. 색은 저장하지 않는다 — 빈 값이 기본 노랑이다.
4. 빈 텍스트 카드가 불러오기 정리(`workspace.ts` 1286행 근처, textbox만)에 걸리지 않음을 테스트로 고정한다 — D6.
5. 태블릿 두 번 탭이 브라우저 확대로 새지 않게 캔버스 바탕의 `touch-action`을 확인한다. 이미 막혀 있으면 그대로 두고 구현 메모에 적는다.

## 완료 기준

- [ ] spec 공통 완료 기준 전부
- [ ] 빈 벽 바탕에 `dblclick`을 쏘면 카드가 1장 생기고, 그 위치가 누른 점의 월드 좌표이며, 편집 상태다 — T4
- [ ] 카드 위·UI 위 `dblclick`은 카드 수를 바꾸지 않는다
- [ ] `penMode=true`에서 `dblclick`은 카드 수를 바꾸지 않는다 — D7
- [ ] 빈 채로 편집을 끝내고 스토어를 다시 불러와도 그 카드가 남는다 — T6
- [ ] `cd web && bunx vitest run <새로 쓴 테스트 파일> src/state/__tests__/textTool.test.ts` 통과
- [ ] 실경로: 테스트가 실제 `Canvas` 이벤트 핸들러와 `addCardAt`를 탄다

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/components/workspace/Canvas.tsx` | 바탕 이벤트, `addCardAt` 109행, 좌표 변환 562~565행, `penMode` 120행. n3도 이 파일을 고친다 — Edit 충돌이 나면 다시 읽고 고친다 |
| `web/src/state/workspace.ts` | 빈 textbox 정리 1286행 근처 |
| `web/src/state/__tests__/textTool.test.ts` | 빈 textbox 정리 기존 테스트 |

## 구현 메모
