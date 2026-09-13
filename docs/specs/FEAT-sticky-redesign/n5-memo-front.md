# n5-memo-front — 메모 앞면: 첫 이미지 크게, 나머지는 배지

> 자기완결 브리프. runner는 [상위 spec](../FEAT-sticky-redesign.md) + [plan 공통 완료 기준](../FEAT-sticky-redesign.plan.md#공통-완료-기준) + 이 파일만 본다. 진행·상태는 이 파일에만 쓴다.

**deps**: n4-memo-window (readonly NodeView)
**상태**: pending

## 문제

블록이 메모 안으로 들어가면 캔버스 앞면에 녹음 플레이어·파일 카드가 그대로 튀어나와 포스트잇 느낌이 깨진다.

## 목표

앞면은 메모 창과 같은 배치를 위부터 잘라 보여준다. 이미지는 본문 칸 폭, 링크·녹음·파일 블록은 창과 같은 고정 높이의 한 줄 막대(앞면에서는 버튼 없이 흐리게). 하단에 종류별 개수 배지를 겹쳐 올린다. 앞면 어디를 눌러도 메모 창이 열린다. 펜 선은 앞면·창에서 같은 글자 위에 있다.

## 작업

1. `web/src/components/workspace/cards/MemoCard.tsx`(와 text Content) 앞면 렌더에서 n4 NodeView를 `readonly` 모드로 사용: 박스 크기는 창과 동일, 재생·열기 버튼만 숨기고 흐린 색. **앞면 전용 숨김·축소 금지**(`memoLayout.ts:12` 1:1 규칙, 펜 레이어는 앞면에서도 켜짐 `text/Content.tsx:85-91`).
2. 배지 컴포넌트: n2 `countBlocks`로 개수. 0이면 그 배지 없음. 카드 하단에 absolute로 겹쳐 올려 본문 배치에 영향 없음. 아이콘+숫자, aria-label "녹음 2개" 식(ko.json 키).
3. 배지·이미지·블록 막대 클릭 → `setExpandedCard(id)`. 앞면에 재생·열기 요소 없음.
4. 테스트 `web/src/components/workspace/cards/__tests__/MemoFront.test.tsx`: 이미지+녹음2+링크1 메모 → 이미지 보임, 배지 "녹음 2개"·"링크 1개", 파일 배지 없음, play 버튼 없음, 배지 클릭 시 expandedCardId 설정, **블록 NodeView의 앞면 높이 == 창 높이**(같은 컴포넌트 두 모드 렌더 비교).
5. 성능: 카드 200장 캔버스 첫 그림 시간이 변경 전 대비 10% 이내(spec §8) — 측정 방법과 수치를 `구현 메모`에.

## 완료 기준

- [ ] plan 공통 완료 기준 전부
- [ ] `cd web && npx vitest run src/components/workspace/cards/__tests__/MemoFront.test.tsx` 통과
- [ ] spec AC-8 전 항목
- [ ] 기존 펜 overlay 테스트(`cd web && npx vitest run src/components/workspace/cards/__tests__`) 회귀 없음
- [ ] 실경로: dev 서버에서 이미지·링크·"본문" 메모를 만들고 창에서 "본문" 위에 펜 선 → 앞면에서도 같은 글자 위인지 스크린샷 2장. 블록 섞인 메모 앞면 스크린샷, to-be 시안 ① 앞면과 나란히 대조한 결과를 `구현 메모`에

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/components/workspace/cards/MemoCard.tsx` | 메모 카드 앞면 |
| `web/src/components/workspace/cards/CardContent.tsx` | kind별 Content 분기 |
| `web/src/components/workspace/cards/MemoExpandDialog.tsx` | 1:1 폭 규칙 주석, setExpandedCard |
| `web/src/components/workspace/cards/__tests__/` | 카드 테스트 패턴 |
| `web/src/state/blocks.ts` | countBlocks·firstBlockIsImage(n2) |

## 2단계 리뷰에서 넘어온 주의

- `blockView.ts`의 DecorationSet 캐시는 `state.doc` 참조가 바뀌면 문서 전체를 다시 훑는다. 앞면 카드 수백 장이 각자 에디터를 띄우면 비용이 커진다 — 앞면을 읽기 전용 에디터로 할지, 에디터 없이 같은 위젯 DOM만 그릴지 먼저 정하고 구현 메모에 근거를 적는다.
- blob URL 캐시는 모듈 전역 + 마운트 수 카운트로 해제한다. 앞면이 에디터를 쓰지 않는 경로라면 카운트에 참여하는 방법을 따로 둔다.
- `countBlocks`/`firstBlockIsImage`는 블록 줄이 앞뒤 빈 줄로 분리될 때만 센다(에디터 문단 규칙과 일치). 배지·첫 이미지 판단에 그대로 쓴다.

## 구현 메모

