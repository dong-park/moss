# n5-memo-front — 메모 앞면: 첫 이미지 크게, 나머지는 배지

> 자기완결 브리프. runner는 [상위 spec](../FEAT-sticky-redesign.md) + [plan 공통 완료 기준](../FEAT-sticky-redesign.plan.md#공통-완료-기준) + 이 파일만 본다. 진행·상태는 이 파일에만 쓴다.

**deps**: n4-memo-window (readonly NodeView)
**상태**: pending

## 문제

블록이 메모 안으로 들어가면 캔버스 앞면에 녹음 플레이어·파일 카드가 그대로 튀어나와 포스트잇 느낌이 깨진다.

## 목표

앞면은 쓴 그대로 위부터 크롭해 보여주되, 첫 블록이 이미지면 폭에 맞춰 크게 보이고, 녹음·파일·링크 블록은 본문에서 숨긴 채 하단 배지(종류별 개수)로만 보인다. 앞면 어디를 눌러도 메모 창이 열린다.

## 작업

1. `web/src/components/workspace/cards/MemoCard.tsx`(와 text Content) 앞면 렌더에서 n4 NodeView를 `readonly` + `face` 모드로 사용: 링크·녹음·파일 블록 문단은 높이 0으로 숨김, 이미지 블록은 표시.
   - 주의: 카드·창 높이 1:1 규칙(펜 overlay 좌표). 숨긴 블록 때문에 overlay가 어긋나면 앞면에서는 overlay를 창 좌표로 매핑하거나, 블록을 숨기는 대신 앞면 전용 높이 규칙을 `구현 메모`에 적고 결정 근거를 남긴다.
2. 배지 컴포넌트: n2 `countBlocks`로 개수. 0이면 그 배지 없음. 아이콘+숫자, aria-label "녹음 2개" 식(ko.json 키).
3. 배지·이미지 클릭 → `setExpandedCard(id)`. 앞면에 재생·열기 요소 없음.
4. 테스트 `web/src/components/workspace/cards/__tests__/MemoFront.test.tsx`: 이미지+녹음2+링크1 메모 → 이미지 보임, 배지 "녹음 2개"·"링크 1개", 파일 배지 없음, play 버튼 없음, 배지 클릭 시 expandedCardId 설정.
5. 성능: 카드 200장 캔버스 첫 그림 시간이 변경 전 대비 10% 이내(spec §8) — 측정 방법과 수치를 `구현 메모`에.

## 완료 기준

- [ ] plan 공통 완료 기준 전부
- [ ] `cd web && npx vitest run src/components/workspace/cards/__tests__/MemoFront.test.tsx` 통과
- [ ] spec AC-8 전 항목
- [ ] 기존 펜 overlay 테스트(`cd web && npx vitest run src/components/workspace/cards/__tests__`) 회귀 없음
- [ ] 실경로: dev 서버에서 블록 섞인 메모 앞면 스크린샷, to-be 시안 ① 앞면과 나란히 대조한 결과를 `구현 메모`에

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/components/workspace/cards/MemoCard.tsx` | 메모 카드 앞면 |
| `web/src/components/workspace/cards/CardContent.tsx` | kind별 Content 분기 |
| `web/src/components/workspace/cards/MemoExpandDialog.tsx` | 1:1 폭 규칙 주석, setExpandedCard |
| `web/src/components/workspace/cards/__tests__/` | 카드 테스트 패턴 |
| `web/src/state/blocks.ts` | countBlocks·firstBlockIsImage(n2) |

## 구현 메모

