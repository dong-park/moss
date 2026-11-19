# n4-search-panel — T1·T4·T6·T7·T8·T9 ⌘K 검색 창

> 자기완결 브리프. `spec/glass-wall/korean-search-ime/` 밑에 산다. runner는 상위 spec + 이 파일만 본다. 진행 메모는 이 파일에만 쓴다 — 상위 spec은 호출자가 고친다. `**상태**:` 줄은 손으로 고치지 않는다 — graph-run이 `진행`·`끝남`을 쓰고, 멈추면 `node_state.py block`, 사람 확인이 필요하면 `node_state.py review`만 쓴다.

**agent**: runner
**id**: KS-4
**상위**: spec/glass-wall/korean-search-ime/spec.md
**deps**: n2-ime-guard, n3-all-walls-index, n5-jump-flash
**상태**: 아직 안 함
**담당 행**: T1, T4, T6, T7, T8, T9

## 문제

지금 검색 칸은 ⌘F로 위쪽에 작게 뜨고, 결과에 벽 이름도 칠한 글자도 없다. 시안 09-search와 다르다.

## 목표

⌘K로 시안 09-search 모양의 검색 창이 뜬다. 모든 벽 결과를 색 네모·칠한 글·벽 이름으로 보이고, 화살표·Enter·Esc로 다룬다. 한글 조합 중 Enter는 글자만 확정한다.

## 작업

1. **D1 확정 = A.** ⌘K와 ⌘F(Ctrl+K·Ctrl+F)가 같은 창을 연다. 창이 열린 동안 지금 벽에는 기존 강조·흐림 오버레이(`filterByKeyword`)를 그대로 쓴다. 기존 `MemoSearchLayer.tsx`를 고쳐 쓴다. 새 파일로 갈라도 Canvas 마운트는 한 줄이다.
2. 시안 모양 (T1). 벽이 살짝 어두워지고, 위쪽 가운데에 폭 560px 흰 시트가 뜬다. 입력 글씨 22px, 커서 `#2457b8`, 열자마자 입력에 포커스. 시안 값은 `spec/glass-wall/mockups/gen.py` 173행과 `09-search.png`.
3. 결과 줄 (T4). 왼쪽 포스트잇 색 네모, 가운데 글 첫 줄에서 n3가 준 구간을 노란 바탕으로 칠함, 오른쪽 끝 회색 벽 이름. 데이터는 n3 함수에서 받는다. 디바운스는 기존 150ms.
4. 안내 줄 (T6). 창 맨 아래 12px 회색 "초성·부분 일치 · 마카 글씨는 검색하지 않아요". 결과 유무와 상관없이 늘 보인다.
5. 빈 결과 (T7). 검색어가 있고 결과가 0이면 목록 자리에 "찾는 포스트잇이 없어요". 50줄을 넘으면 맨 끝에 "N개 더 있어요, 더 쳐 보세요".
6. 키보드 (T8). 첫 줄이 기본으로 골라져 연한 파랑 배경. ↑↓로 옮긴다. Esc는 창을 닫고 벽·화면 위치를 그대로 둔다.
7. 고르기. 줄 클릭 또는 Enter면 창을 닫고 n5의 액션을 부른다.
8. 한글 Enter (T9). 입력의 Enter 판정은 n2의 공용 함수를 쓴다. 조합 중 Enter는 글자만 확정하고 결과로 가지 않는다.
9. i18n 키를 `ko.json`에 넣는다. 지금 언어 파일은 `ko.json` 하나다: 안내 줄, 빈 결과, "N개 더".

## 완료 기준

- [ ] spec 공통 완료 기준 전부
- [ ] `cd web && npx vitest run src/components/workspace/__tests__/MemoSearchLayer.test.tsx` 통과. 아래가 테스트로 있다.
  - ⌘K와 ⌘F 둘 다 창을 열고 입력에 포커스가 간다 (T1, D1)
  - 세 벽 데이터에서 `ㅇㅈ`이면 결과 3줄, 각 줄에 벽 이름, 칠한 `mark` 요소가 '이직' '연주' '인재' (T4)
  - 안내 줄 문구가 결과 0일 때와 있을 때 모두 보인다 (T6)
  - 마카만 있고 포스트잇이 없는 검색어면 "찾는 포스트잇이 없어요" (T7)
  - ↓ 두 번에 셋째 줄이 골라지고, Esc면 창이 닫히고 `currentBoardId`와 viewport가 그대로 (T8)
  - `isComposing: true`인 Enter는 n5 액션을 부르지 않고 창이 열려 있다. 다음 평소 Enter는 부른다 (T9)
  - Enter와 클릭이 n5 액션을 그 카드 id로 부른다
- [ ] `cd web && npx tsc --noEmit` 0, `cd web && npx eslint` 새 오류 0, `cd web && bun scripts/check-i18n.mjs` exit 0
- [ ] 실경로: 창이 n3의 실제 로더를 탄다. 시각·손맛 확인은 n6 몫이라고 구현 메모에 적는다

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/components/workspace/MemoSearchLayer.tsx` | 고칠 곳 |
| `web/src/components/workspace/Canvas.tsx` | 756행 마운트 |
| `web/src/components/workspace/__tests__/MemoSearchLayer.test.tsx` | 테스트 |
| `web/src/components/workspace/ime.ts` | n2가 만든 판정 함수 |
| `web/src/state/memoSearch.ts` | n1·n3 함수 |
| `web/src/i18n/messages/ko.json` | 새 문구 |
| `spec/glass-wall/mockups/09-search.png` | 기준 화면 |
| `spec/glass-wall/mockups/gen.py` | 시안 수치 173행 |
