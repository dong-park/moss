# n1-postit-revert — 메모 앞면을 예전 종이 포스트잇으로

> 자기완결 브리프. 상위 spec + 이 파일만 본다. `**상태**:` 줄은 손으로 고치지 않는다.

**agent**: runner
**id**: PZ-1
**상위**: spec/postit-group-zoom/spec.md
**deps**: 없음
**상태**: 끝남
**담당 행**: T1
**사람 확인**: 불필요

## 문제

- e37d124(FT-7)의 CSS 포스트잇 면이 예전 종이 사진보다 덜 고급스럽다(사용자).

## 목표

메모 앞면, 색상표, 도크 끌기 미리보기를 e37d124 이전으로 되돌린다. 도크 아이콘은 그대로.

## 작업

1. `git revert --no-commit e37d124` 후 커밋.
2. D4=A: 색상표도 예전 옅은 색으로.

## 완료 기준

- [x] spec 공통 완료 기준 전부
- [x] 메모 DOM이 `text.png` 종이와 색조 층을 쓴다
- [x] `npx vitest run src/components/workspace/cards` 통과

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/components/workspace/cards/text/Content.tsx` | 메모 앞면 |
| `web/src/components/workspace/memoVariety.ts` | 색상표 |
| `web/src/components/workspace/DockDragPreview.tsx` | 끌기 미리보기 |

## 구현 메모

- 2026-10-18 커밋 15f0b9c: e37d124를 충돌 없이 되돌렸다(색상표 D4=A 포함). cards 테스트 31파일 228개 통과. 실화면은 n5에서 본다.
