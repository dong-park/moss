# n1-chosung-match — T14·T2·T3 초성·혼합·부분 매칭 순수 함수

> 자기완결 브리프. `spec/glass-wall/korean-search-ime/` 밑에 산다. runner는 상위 spec + 이 파일만 본다. 진행 메모는 이 파일에만 쓴다 — 상위 spec은 호출자가 고친다. `**상태**:` 줄은 손으로 고치지 않는다 — graph-run이 `진행`·`끝남`을 쓰고, 멈추면 `node_state.py block`, 사람 확인이 필요하면 `node_state.py review`만 쓴다.

**agent**: runner
**id**: KS-1
**상위**: spec/glass-wall/korean-search-ime/spec.md
**deps**: 없음
**상태**: 아직 안 함
**담당 행**: T2, T3, T14

## 문제

지금 검색은 글자 그대로만 맞춰서 `ㅇㅈ`으로 '이직'을 못 찾는다.

## 목표

검색어와 글 하나를 받아 맞았는지, 몇 번 맞았는지, 어디를 칠할지를 돌려주는 순수 함수가 있다. 초성만, 완성 글자와 초성 섞기, 글자 일부가 모두 맞는다. 담당 행은 T14, 그리고 T2·T3의 매칭 규칙이다.

## 작업

1. `web/src/state/memoSearch.ts`에 한글 음절을 초성으로 바꾸는 함수를 넣는다. 음절 코드 범위 `0xAC00`~`0xD7A3`, 초성 19개 표를 직접 쓴다. 외부 라이브러리를 들이지 않는다.
2. 매칭 규칙을 구현한다. 검색어의 글자마다 다음을 따른다.
   - 자음 하나(ㄱ~ㅎ, ㄲ·ㄸ·ㅃ·ㅆ·ㅉ 포함)는 글 쪽 음절의 초성과 맞는다. `ㄲ`은 `ㄱ`과 다르다.
   - 완성 음절은 글 쪽 음절과 똑같아야 맞는다.
   - **D3 확정 = A.** 검색어의 **마지막 글자**가 받침 없는 음절이면, 초성·중성이 같고 받침만 있는 글 쪽 음절과도 맞는다. '이지'는 '이직'과 맞는다. 마지막 글자에만 적용한다.
   - 영문은 대소문자를 가리지 않는다. 숫자·기호는 그대로 맞춘다.
   - 검색어는 공백으로 낱말을 나눈다. 모든 낱말이 맞아야 그 글이 결과에 든다.
3. 맞은 구간을 원문 기준 `[start, end)` 목록으로 돌려준다. 결과 줄에서 그 구간을 칠한다. 평문화는 기존 `plainTextRaw`를 그대로 써서 대소문자 보존 원문 위의 구간을 낸다.
4. 기존 `searchMemos(cards, query)`가 새 규칙을 쓰게 한다. **D4 확정 = A.** 검색 대상은 지금과 같다: `text` 카드 제목·본문, `textbox`, `photo` 캡션. 반환 모양을 바꾸면 기존 호출처 `filterByKeyword`가 계속 돌게 맞춘다.
5. 초성 문자열도 기존 평문 LRU 캐시처럼 글 내용을 키로 기억한다.

## 완료 기준

- [ ] spec 공통 완료 기준 전부
- [ ] `cd web && npx vitest run src/state/__tests__/memoSearch.test.ts` 통과. 아래 경우가 테스트로 있다.
  - `ㅇㅈ`이 '이직 고민 중' '연주회 표 예매' '인재 채용 캡처' 셋과 맞고, 칠할 구간이 각각 '이직' '연주' '인재'다 (T2)
  - '연ㅈ'이 '연주회 표 예매'와 맞고 '연주'를 칠한다. '고민'이 '이직 고민 중'과 맞고 '고민'을 칠한다 (T3)
  - '이지'가 '이직'과 맞는다. '지이'는 '직이'와 맞지 않는다 (D3, 마지막 글자만)
  - `ㄲ`이 '까치'와 맞고 '가지'와 맞지 않는다
  - 영문 대소문자 무시, 숫자 섞인 글, 빈 검색어는 결과 0
  - 기존 테스트(AC-1 회고 3장, 제목 매칭, textbox·photo) 전부 그대로 통과
- [ ] `cd web && npx tsc --noEmit` 0
- [ ] 실경로: `filterByKeyword`가 새 매칭을 탄다. `MemoSearchLayer.test.tsx`가 계속 통과한다

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/state/memoSearch.ts` | 고칠 곳. `plainText`·`plainTextRaw`·`searchMemos`·LRU 캐시 |
| `web/src/state/__tests__/memoSearch.test.ts` | 테스트 추가 |
| `web/src/state/workspace.ts` | `filterByKeyword`(4155행 근방) 호출처 — 깨지지 않게 확인만 |
| `web/src/components/workspace/__tests__/MemoSearchLayer.test.tsx` | 회귀 확인 |
