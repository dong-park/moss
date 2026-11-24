# n6-browser-check — 실브라우저 확인 — 시안 대조·가독성·성능

> 자기완결 브리프. `spec/glass-wall/glass-surface/` 밑에 산다. runner는 상위 spec + 이 파일만 본다. 진행·상태는 이 파일에만 쓴다 — 상위 spec은 호출자가 고친다.

**agent**: runner
**id**: GS-6
**상위**: spec/glass-wall/glass-surface/spec.md
**deps**: n2-hand-font, n4-material-picker, n5-hung-frame
**상태**: 아직 안 함
**담당 행**: T1, T2, T4, T5, T6, T8, T9, T10, T11, T12, T13, T15

## 문제

바탕의 벽 느낌, 가독성, 블러 비용은 단위 테스트로 판정할 수 없다.

## 목표

실브라우저에서 행마다 Given-When-Then을 그대로 해 보고, 통과·실패를 행 id별로 기록한다. 코드는 고치지 않는다. 실패는 원인 노드를 적어 돌려준다.

## 작업

1. `cd web && bun run dev`로 띄우고 데스크톱 Chrome 1440×900에서 연다.
2. 시안 `01-main.png`·`02-materials.png`와 나란히 놓고 T1·T2·T3·T9·T10·T11을 본다. 스크린샷을 `spec/glass-wall/glass-surface/check/`에 남긴다.
3. T4·T5·T6: 재질을 바꾸고, 닫고, 새로고침한다. 새로고침 첫 프레임에 유리가 비치는 깜빡임이 없는지 성능 기록 첫 프레임으로 본다.
4. T8 실측: 유리·화이트보드 스크린샷에서 화면 9개 격자 지점 색을 뽑아 마카 4색과 WCAG 대비를 잰다. 모두 3:1 이상이어야 한다. 코르크는 재지 않는다 (D7 = C).
5. T12: macOS 손쉬운 사용의 투명도 줄이기를 켜고 다시 연다.
6. T13: 포스트잇 200장·마카 획 50개 보드에서 유리와 바탕 끈 상태를 5초씩 팬·줌한다. 성능 기록에서 프레임 시간 p95 ≤ 16.7ms, 바탕 끈 상태 대비 증가 ≤ 2ms, 팬 중 바탕 레이어 Paint 0회를 확인한다. 마카 획이 아직 없으면 획 없이 재고 그 사실을 적는다 (선행: wall-marker).
7. T15: 네트워크 탭에서 fonts.googleapis.com·fonts.gstatic.com 요청 0건, 오프라인 새로고침 뒤에도 손글씨가 Nanum Pen Script인지 본다.

## 완료 기준

- [ ] spec 공통 완료 기준 전부
- [ ] `spec/glass-wall/glass-surface/check/result.md`에 T1·T2·T4·T5·T6·T8·T9·T10·T11·T12·T13·T15 각각 통과/실패와 근거 한 줄이 있다
- [ ] 실패 행이 0개다. 실패가 있으면 원인 노드 id를 적고 `상태: parked`로 돌려준다

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `spec/glass-wall/mockups/01-main.png` | 기준 화면 |
| `spec/glass-wall/mockups/02-materials.png` | 기준 화면 |
| `spec/glass-wall/glass-surface/rows/` | 행별 Given-When-Then |

## 담당 행 메모

- T1, T2, T4, T5, T6, T8(실측), T9, T10, T11, T12, T13, T15
