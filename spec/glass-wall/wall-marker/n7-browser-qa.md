# n7-browser-qa — 실브라우저에서 시안대로 보이고 손에 맞는지 확인

> 자기완결 브리프. runner는 상위 spec + 이 파일만 본다. 진행 메모는 이 파일에만 쓴다 — 상위 spec은 호출자가 고친다. `**상태**:` 줄은 손으로 고치지 않는다 — graph-run이 `진행`·`끝남`을 쓰고, 멈추면 `node_state.py block`, 사람 확인이 필요하면 `node_state.py review`만 쓴다.

**agent**: runner
**id**: WM-7
**상위**: spec/glass-wall/wall-marker/spec.md
**deps**: n5-sticky-strokes, n6-select-move
**상태**: 아직 안 함
**담당 행**: T1, T2, T3, T4, T5, T6, T7, T8, T9, T10, T11, T12, T14, T17, T18, T19

## 문제

단위 테스트로는 들린 마카 모양, 획 겹침 순서, 태블릿 손가락 동작을 판정할 수 없다.

## 목표

dev 서버에서 시안 01·03-b·04·05와 대조해 작업 행의 Then을 하나씩 확인하고 결과표를 남긴다. 담당 행: T1~T12, T14, T17~T19의 화면 확인.

## 작업

1. `cd web && npm run dev`로 띄운다. 이미 떠 있으면 `curl localhost:3000`로 moss인지 확인하고 재사용한다.
2. pharos 브라우저 pane에서 데스크톱 크기로 T1~T10, T17~T19를 행의 Given·When대로 해 보고 스크린샷을 남긴다. 키 입력은 백그라운드 webview에 안 들어갈 수 있다 — 그 행은 "포그라운드에서 확인 필요"로 적는다.
3. 창을 390px 폭으로 줄여 T14를 본다.
4. T11은 같은 공유 보드를 창 두 개로 연다. 로그인이 안 되면 "재현 못 함"으로 적는다.
5. T12는 실기기 태블릿이 있을 때만 본다. 없으면 "실기기 필요"로 적는다.
6. 확인용으로 만든 보드와 메모는 끝나면 지운다.

## 완료 기준

- [ ] 이 파일 `## 구현 메모`에 행 id · 통과/실패/확인 못 함 · 스크린샷 경로 표가 있고, 모든 대상 행이 표에 있다
- [ ] 실패가 0개다. 실패가 있으면 상태를 `parked`로 두고 실패 행과 재현 절차를 적는다
- [ ] 시안과 다른 점이 있으면 표에 한 줄씩 적는다

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `spec/glass-wall/mockups/01-main.png` | 트레이·벽 글씨 기준 |
| `spec/glass-wall/mockups/03-first-b.png` | 들린 마카 기준 |
| `spec/glass-wall/mockups/04-marker.png` | 패널 기준 |
| `spec/glass-wall/mockups/05-sticky-a.png` | 벽 획·포스트잇 획 기준 |
| `spec/glass-wall/mockups/05-sticky-b.png` | 포스트잇 이동 뒤 기준 |
| `spec/glass-wall/wall-marker/rows/` | 작업 행 Given·When·Then |

## 구현 메모
