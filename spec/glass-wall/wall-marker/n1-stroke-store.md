# n1-stroke-store — 벽 획 저장 모델과 포스트잇 획 형식 넓히기

> 자기완결 브리프. runner는 상위 spec + 이 파일만 본다. 진행 메모는 이 파일에만 쓴다 — 상위 spec은 호출자가 고친다. `**상태**:` 줄은 손으로 고치지 않는다 — graph-run이 `진행`·`끝남`을 쓰고, 멈추면 `node_state.py block`, 사람 확인이 필요하면 `node_state.py review`만 쓴다.

**agent**: runner
**id**: WM-1
**상위**: spec/glass-wall/wall-marker/spec.md
**deps**: 없음
**상태**: 아직 안 함
**담당 행**: T11, T13, T15

## 문제

벽에 그은 획을 둘 저장 자리가 없어서, 마카와 다른 티켓 다섯 개가 모두 이 모델을 기다린다.

## 목표

벽 획은 획 하나가 한 행으로 로컬 DB와 공유 문서에 저장되고 왕복한다. 포스트잇 획 형식은 획마다 색·굵기 이름을 싣고, 옛 획도 그대로 읽힌다. 담당 행: T15의 읽기 부분, T13·T11의 저장 토대.

## 확정된 결정 (그대로 따른다)

- D1=A: 벽 획 1개 = 1행. 로컬 `strokes` 테이블 + 공유 문서 `strokes` Y.Map.
- D2=A: 포스트잇 획은 지금처럼 노트 `overlay`에 둔다. path마다 `color`·`width`를 더한다.
- D3=A + marker-feel D1=A: 색과 굵기는 이름으로 저장한다. 색 `black` `blue` `red` `green`, 굵기 `thin` `mid` `thick`. 화면 값은 `#1f2430` `#2457b8` `#d0453c` `#2f8a57`이고, 굵기 수치는 marker-feel이 조율한다. 여기서는 임시값 thin 2 · mid 4 · thick 8 보드 단위를 상수 한 곳에 둔다.
- D14=A: 굵기는 보드 단위다. 줌과 함께 커진다.
- 옛 overlay path에 색·굵기가 없으면 `black`·`thin`으로 읽는다.

## 작업

1. 마카 토큰 모듈을 만든다: 색 이름 4개, 굵기 이름 3개, 이름→화면 값 함수. 다른 노드가 모두 이걸 쓴다.
2. 벽 획 타입 `WallStroke`를 정의한다: `id`, `boardId`, `points`(보드 좌표 `{x,y}[]`), `color`, `width`, `createdAt`, `updatedAt`. 선택 칸 `frameId?`를 둔다 — 아래 「충돌 주의」 참고.
3. Dexie v7: `strokes: "id, boardId"` 테이블을 더한다. 기존 v6 stores를 펼쳐 쓰고 데이터 변환은 없다.
4. Yjs: `model.ts`에 `STROKES_MAP`과 `STROKE_KEYS`를 더하고, `writeThrough.ts`·`liveSync.ts`가 notes·connections처럼 왕복시킨다.
5. `workspace.ts`에 벽 획 상태와 액션을 더한다: `wallStrokes`, `addWallStroke`, `removeWallStrokes(ids)`, `replaceWallStrokes(removeIds, add[])`(지우개 쪼개기용), `moveWallStrokes(ids, dx, dy)`. 보드를 열 때 불러오고 저장은 기존 디바운스 영속 경로를 따른다.
6. 보드 삭제와 그 5초 되살리기, 휴지통 비우기 경로에 `strokes` 테이블을 끼운다.
7. `cardContent.ts`의 `HandwritingContent` path에 `color?`·`width?`를 더한다. `coercePaths`와 `serializeHandwriting`이 옛 형식과 새 형식을 모두 왕복한다.

## 완료 기준

- [ ] spec 공통 완료 기준 전부
- [ ] `cd web && bunx vitest run src/state/db src/state/ydoc src/state/__tests__` 통과. 새 테스트 최소 4개: Dexie 왕복, Y.Map 왕복, 옛 overlay(색·굵기 없음)를 `black`·`thin`으로 읽기, 보드 삭제 시 그 보드 strokes 삭제와 되살리기
- [ ] 실경로: 스토어 액션 → Dexie → 새로 연 스토어에서 같은 획을 읽는 테스트가 있다

## 충돌 주의 — 호출자 확인 필요

marker-meets-sticky D4=B는 "메모판 위 획은 메모판 것"이고, 이 티켓 D12=A는 "메모판 위에서 시작한 획은 벽 획"이다. 둘 다 닫혀 있다. 이 노드는 `frameId?` 선택 칸만 둬서 어느 쪽이든 받을 수 있게 하고, 판정 규칙은 정하지 않는다.

## 이 노드를 기다리는 다른 티켓

marker-feel(색·굵기 이름), marker-meets-sticky(벽 획 저장소 스냅샷 비교 T6), wall-zoom(T5·T6), wall-scale(획 가상화), local-ownership(내보내기에 벽 획 싣기), wall-wipe-snapshot(사진에 벽 획 담기).

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/state/db/schema.ts` | Dexie 스키마. 지금 v6 |
| `web/src/state/ydoc/model.ts` | Y.Doc 맵·키 목록 |
| `web/src/state/ydoc/writeThrough.ts` | 로컬 → 문서 쓰기 |
| `web/src/state/db/liveSync.ts` | 문서 → 로컬 반영 |
| `web/src/state/workspace.ts` | 스토어. 보드 삭제·되살리기 1842~1910행 근처 |
| `web/src/state/cardContent.ts` | 167~209행 손글씨 형식 |
| `web/src/state/marker/tokens.ts` | 새로 만든다 |

## 구현 메모
