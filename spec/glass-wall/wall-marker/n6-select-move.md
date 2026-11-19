# n6-select-move — 벽 획을 끌어 고르고 옮기기

> 자기완결 브리프. runner는 상위 spec + 이 파일만 본다. 진행 메모는 이 파일에만 쓴다 — 상위 spec은 호출자가 고친다. `**상태**:` 줄은 손으로 고치지 않는다 — graph-run이 `진행`·`끝남`을 쓰고, 멈추면 `node_state.py block`, 사람 확인이 필요하면 `node_state.py review`만 쓴다.

**agent**: runner
**id**: WM-6
**상위**: spec/glass-wall/wall-marker/spec.md
**deps**: n4-wall-layer
**상태**: 아직 안 함
**담당 행**: T17, T18, T19

## 문제

벽에 쓴 제목 자리가 마음에 안 들면 지우고 다시 써야 한다.

## 목표

마카를 내려놓은 채 빈 벽을 끌면 고르기 상자가 생기고, 닿은 벽 획이 묶인다. 묶음을 끌면 옮겨지고, Esc면 제자리로 돌아간다. 담당 행: T17, T18, T19.

## 확정된 결정 (그대로 따른다)

- D13 사용자 답: 마우스로 쭉 끌어 고르고 옮긴다, 피그마처럼.
- 상자에 조금이라도 닿은 벽 획이 잡힌다. 포스트잇 획은 따로 잡히지 않는다.
- 마카나 천을 집으면 묶음이 풀린다. 빈 벽 한 번 누르기로도 풀린다.
- 놓은 순간 새 위치를 한 번 저장한다. 공유 보드에서는 지운 쪽이 이긴다.
- 포스트잇과 벽 획을 한 상자로 함께 고르는 일은 marker-meets-sticky 몫이다. 이 노드는 벽 획만 다룬다. 지금 상자가 카드도 잡는 동작은 그대로 두고, 벽 획 묶음을 따로 둔다.
- 옮기기 되돌리기는 정하지 않았다. 이 노드는 만들지 않는다.

## 작업

1. `Canvas.tsx`의 기존 `marquee`가 끝날 때 상자와 닿은 벽 획 id를 고른다. 판정은 획 경계 상자로 거른 뒤 점·선분으로 확인한다.
2. 묶음 테두리 상자를 `WallStrokeLayer`에 그린다.
3. 묶음 안을 끌면 미리보기로 옮기고, 놓으면 n1 `moveWallStrokes`를 한 번 부른다. Esc면 미리보기를 버린다.

## 완료 기준

- [ ] spec 공통 완료 기준 전부
- [ ] `cd web && bunx vitest run src/components/workspace/__tests__/WallStrokeSelect.test.tsx` 통과. 테스트: 상자가 두 획에 닿고 하나에 안 닿으면 두 개만 묶인다 (T17), 빈 벽 한 번 누르기로 풀림, 끌어 놓으면 모든 점이 같은 dx·dy만큼 옮겨져 Dexie에 저장 (T18), 끄는 중 Esc → 저장값 그대로·묶음 유지 (T19), 마카를 집으면 묶음 풀림
- [ ] 실경로: 포인터 이벤트 → `moveWallStrokes` → Dexie

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/components/workspace/Canvas.tsx` | 84행 `marquee`, 737행 렌더 |
| `web/src/components/workspace/WallStrokeLayer.tsx` | n4 산출물 |
| `web/src/state/workspace.ts` | n1 `moveWallStrokes` |

## 구현 메모
