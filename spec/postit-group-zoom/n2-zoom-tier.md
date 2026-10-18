# n2-zoom-tier — 줌 구간을 캔버스에 내리기

> 자기완결 브리프. 상위 spec + 이 파일만 본다. `**상태**:` 줄은 손으로 고치지 않는다.

**agent**: runner
**id**: PZ-2
**상위**: spec/postit-group-zoom/spec.md
**deps**: 없음
**상태**: 끝남
**담당 행**: T2
**사람 확인**: 불필요

## 문제

- 줌이 CSS `scale()` 하나라 요소별로 다르게 그릴 수 없다. 최소 줌 50%라 멀리 보기가 없다.

## 목표

world 레이어에 `data-zoom-tier`(near ≥0.8, mid ≥0.4, far)와 `--zoom-inv`를 단다. 최소 줌 25%(D2).

## 작업

1. `workspace.ts`: `MIN_SCALE = 0.25`, `zoomTier(scale)` 추가.
2. `Canvas.tsx` world 레이어에 속성·변수.

## 완료 기준

- [x] spec 공통 완료 기준 전부
- [x] `zoomTier` 경계 테스트
- [x] world 레이어 속성이 배율 따라 바뀐다(테스트)

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/state/workspace.ts` | MIN_SCALE·zoomTier |
| `web/src/components/workspace/Canvas.tsx` | world 레이어 |

## 구현 메모

- 2026-10-18 world 레이어에 data-zoom-tier·--zoom-inv. MIN_SCALE 0.25에 맞춰 ZoomBar 테스트의 50% 전제를 고쳤다. tsc 통과, state 전체·ZoomBar·새 테스트 통과.
