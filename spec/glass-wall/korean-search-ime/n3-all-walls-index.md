# n3-all-walls-index — T4·T13 모든 벽 글 읽기, 순서, 상한

> 자기완결 브리프. `spec/glass-wall/korean-search-ime/` 밑에 산다. runner는 상위 spec + 이 파일만 본다. 진행·상태는 이 파일에만 쓴다 — 상위 spec은 호출자가 고친다.

**agent**: runner
**id**: KS-3
**상위**: spec/glass-wall/korean-search-ime/spec.md
**deps**: n1-chosung-match
**상태**: 완료
**담당 행**: T4, T13

## 문제

지금 검색은 화면에 불러온 지금 벽 카드만 봐서, 다른 벽에 붙인 포스트잇을 못 찾는다.

## 목표

검색 창이 쓸 "모든 벽 결과" 함수가 있다. 결과 한 줄은 카드 id, 벽 id, 벽 이름, 포스트잇 색, 보일 글, 칠할 구간을 갖는다. 벽 10장·포스트잇 2,000장에서도 한 글자마다 16ms 안에 끝난다. 담당 행은 T4의 데이터 쪽과 T13이다.

## 작업

1. **D7 확정 = A.** 창을 열 때 기기 저장소(Dexie `notes`)에서 모든 벽의 글을 한 번 읽고, 창이 열린 동안 재사용하는 로더를 만든다. 벽 이름은 `storage.loadBoards()`에서 얻는다. 시스템 보드도 벽 하나로 본다. 지운 메모는 `trash` 테이블에 따로 있어 `notes`만 읽으면 된다. 공유 벽도 이 기기에 있는 것만 찾고 서버에 묻지 않는다.
2. 지금 보는 벽은 메모리 store의 `cards`가 Dexie보다 새로울 수 있다. 지금 벽은 store `cards`를, 다른 벽은 Dexie를 쓴다.
3. 매칭은 n1의 함수를 쓴다. 다시 만들지 않는다.
4. **D2 확정 = A.** 지금 벽 결과를 먼저, 그다음 다른 벽. 각 묶음 안은 맞은 횟수 내림차순, 같으면 최근 고친 순.
5. **D8 확정 = A.** 최대 50줄을 돌려주고, 넘친 개수도 함께 돌려준다. 창은 "N개 더 있어요, 더 쳐 보세요"를 그린다.
6. 이 함수는 store 액션이나 순수 함수 + 로더로 낸다. UI는 n4 몫이라 건드리지 않는다.

## 완료 기준

- [ ] spec 공통 완료 기준 전부
- [ ] `cd web && npx vitest run src/state/__tests__/memoSearchAllWalls.test.ts` 통과. 아래가 테스트로 있다.
  - 세 벽에 흩어진 '이직 고민 중'·'연주회 표 예매'·'인재 채용 캡처'가 `ㅇㅈ` 결과에 모두 들고, 각 줄에 벽 이름과 포스트잇 색이 있다 (T4)
  - 지금 벽 결과가 다른 벽 결과보다 앞선다 (D2)
  - 60장이 맞으면 50줄과 "10개 더"를 돌려준다 (D8)
  - 지금 벽의 저장 전 카드 글이 결과에 반영된다
- [ ] T13 성능: 같은 테스트 파일에서 합성 데이터 벽 10장·포스트잇 2,000장으로, 한 글자 검색 매칭 16ms 미만, 처음 읽기 300ms 미만을 `performance.now()`로 잰다. CI 흔들림을 막으려고 5회 중 중앙값으로 판정한다
- [ ] `cd web && npx tsc --noEmit` 0
- [ ] 실경로: fake-indexeddb 위 실제 Dexie 스키마로 읽는다. 로더를 목으로 바꿔 green이면 갭으로 기록

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/state/memoSearch.ts` | n1이 만든 매칭 함수 |
| `web/src/state/storage.ts` | `loadCards`(277행 근방)·`loadBoards` — 읽는 방식 참고 |
| `web/src/state/db/schema.ts` | `notes`·`trash` 테이블 |
| `web/src/state/workspace.ts` | `cards`, `currentBoardId` |
| `web/src/state/__tests__/memoSearchAllWalls.test.ts` | 새로 만든다 |

## 결과

- `web/src/state/memoSearchAllWalls.ts` — `loadAllWallsIndex()`(창 열 때 한 번)·`searchAllWalls(index, query, current?)`·`ALL_WALLS_RESULT_LIMIT`(50).
- 줄: `{id, boardId, boardName, color(hex), kind, text, ranges, current}`, 결과: `{rows, more}`.
- 지금 벽은 store `cards`로, 다른 벽은 색인으로 맞춘다. 지금 벽의 Dexie 사본은 건너뛴다.
- `memoSearch.ts`에 `warmMemoIndex` 추가, 캐시 상한 2,000 → 5,000 (2,000장 순회가 상한에 걸리면 LRU가 매번 비워 키마다 다시 만든다).
- 실측(2,000장·10벽): 처음 읽기 약 17ms, 한 글자 검색 1.4~7.6ms.

